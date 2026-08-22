import { revalidatePath } from 'next/cache'
import { after } from 'next/server'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { gesamteWatchlist } from '@/data/gesamt-watchlist'
import { ensureSchema } from '@/db/migrate'
import { hasDatabase, MissingDatabaseUrl } from '@/db/client'
import {
  lastFundamentalsSuccess,
  latestBarDay,
  loadUnnotifiedActions,
  markNotified,
  readLatestTrend,
  recordRun,
  saveBars,
  savePeriods,
  saveTrends,
  storeAnalystActions,
  trendFetchedAt,
} from '@/db/repository'
import type { AnalystAction } from '@/domain/analyst-actions'
import { clipDigestBody, formatAnalystDigest } from '@/domain/analyst-actions'
import { abrufIstFrisch, kurseSindFrisch } from '@/domain/freshness'
import type { ReportedPeriod } from '@/domain/fundamentals'
import type { WatchlistEntry } from '@/domain/instrument'
import { trendToAction } from '@/domain/trend-diff'
import { AlphaVantagePriceProvider } from '@/providers/alphavantage'
import {
  fetchFinnhubJson,
  finnhubSymbolFor,
  parseRecommendationTrends,
  recommendationUrl,
} from '@/providers/finnhub'
import { CompanyFactsSchema, companyFactsUrl, extractPeriods } from '@/providers/sec-xbrl'
import { TwelveDataPriceProvider } from '@/providers/twelvedata'
import {
  buildCikIndex,
  CompanyTickersSchema,
  COMPANY_TICKERS_URL,
  resolveCik,
} from '@/providers/edgar-index'
import type { CikIndex } from '@/providers/edgar-index'

/**
 * Holt Kurse, Berichtszahlen und den Analystenkonsens und schreibt
 * alles nach Postgres. Ein Endpunkt, ein Speicher.
 *
 * Stapelweise, weil serverlose Funktionen ein Zeitlimit haben. Der
 * Knopf in der Oberflaeche ruft nach, bis `done` kommt; der taegliche
 * Cron bekommt einen langen Lauf und verkettet sich notfalls selbst.
 *
 * Frische zuerst: Was heute schon geholt wurde, wird uebersprungen.
 * Damit fuellt ein zweiter Druck auf den Knopf nur die Luecken, statt
 * das Tagesbudget der Gratis-Tarife noch einmal auszugeben.
 */
export const dynamic = 'force-dynamic'
export const maxDuration = 300

const DEFAULT_LIMIT = 4
const MAX_LIMIT = 40
/** Historie: 52 Wochen plus Vorlauf fuer den 200-Tage-Schnitt. */
const HISTORY_DAYS = 420
/**
 * Abstand zwischen zwei Twelve-Data-Abrufen. Der Gratis-Tarif erlaubt
 * acht je Minute; 8 Sekunden halten jeden Lauf darunter, egal wie die
 * Stapel geschnitten sind.
 */
const TWELVEDATA_ABSTAND_MS = 8_000
/** Alpha Vantage erlaubt 5 je Minute; 15 Sekunden sind sicher darunter. */
const ALPHAVANTAGE_ABSTAND_MS = 15_000
/** Hoechstens so viele Kettenglieder je Cron-Anstoss, als Notbremse. */
const MAX_KETTE = 12

let cikIndexCache: CikIndex | null = null
let letzterTwelveDataAbruf = 0
let letzterAlphaVantageAbruf = 0

interface Ergebnis {
  ticker: string
  bars: number
  periods: number
  trends: number
  uebersprungen: string[]
  note: string | null
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function ladeCikIndex(userAgent: string): Promise<CikIndex> {
  if (cikIndexCache !== null) return cikIndexCache
  const response = await fetch(COMPANY_TICKERS_URL, {
    headers: { 'User-Agent': userAgent, Accept: 'application/json' },
    next: { revalidate: 86_400 },
  })
  if (!response.ok) throw new Error(`company_tickers.json: HTTP ${response.status}`)
  cikIndexCache = buildCikIndex(CompanyTickersSchema.parse(await response.json()))
  return cikIndexCache
}

/** Wartet, bis der Mindestabstand zum letzten Twelve-Data-Abruf um ist. */
async function twelveDataTakt(): Promise<void> {
  const wartezeit = letzterTwelveDataAbruf + TWELVEDATA_ABSTAND_MS - Date.now()
  if (wartezeit > 0) await sleep(wartezeit)
  letzterTwelveDataAbruf = Date.now()
}

async function alphaVantageTakt(): Promise<void> {
  const wartezeit = letzterAlphaVantageAbruf + ALPHAVANTAGE_ABSTAND_MS - Date.now()
  if (wartezeit > 0) await sleep(wartezeit)
  letzterAlphaVantageAbruf = Date.now()
}

/**
 * Kurse fuer einen Titel. XETRA wird zuerst direkt versucht; scheitert
 * das endgueltig (kein Ratenlimit) und es gibt eine US-Notierung, wird
 * die geholt. Kurse in Dollar sind besser als gar keine, und die
 * Waehrung steht an jeder Zahl dran.
 */
async function holeKurse(
  entry: WatchlistEntry,
  since: string,
  uebersprungen: string[],
): Promise<{ bars: number; hinweis: string | null }> {
  const heute = new Date()
  const neuesterTag = await latestBarDay(entry.ticker)
  if (kurseSindFrisch(neuesterTag, heute)) {
    uebersprungen.push('Kurse aktuell')
    return { bars: 0, hinweis: null }
  }

  // XETRA zuerst ueber Alpha Vantage: die einzige gemessen erreichbare
  // Gratisquelle, die deutsche Titel direkt fuehrt (25 Abrufe am Tag —
  // genug fuer die DAX-Haelfte, weil die Frische-Regel jeden Titel auf
  // einen Abruf am Tag begrenzt). Immer das kompakte Fenster von 100
  // Handelstagen: outputsize=full lehnt der Gratis-Tarif inzwischen als
  // Premium-Funktion ab (gemessen 2026-08-22), und 100 Tage reichen fuer
  // Verlauf und Frische; die 52-Wochen-Spanne waechst mit jedem Tag nach.
  let alphaVantageFehler: string | null = null
  if (entry.venue === 'XETRA') {
    const alpha = process.env['ALPHA_VANTAGE_API_KEY']?.trim() ?? ''
    if (alpha.length > 0) {
      await alphaVantageTakt()
      try {
        const provider = new AlphaVantagePriceProvider(alpha, 'compact')
        const series = await provider.fetchDailyHistory({ instrument: entry, since })
        return { bars: await saveBars(entry.ticker, series), hinweis: null }
      } catch (fehler) {
        alphaVantageFehler = message(fehler)
      }
    } else {
      alphaVantageFehler = 'ALPHA_VANTAGE_API_KEY fehlt'
    }
  }

  const twelve = process.env['TWELVEDATA_API_KEY']?.trim() ?? ''
  if (twelve.length === 0) {
    throw new Error(
      alphaVantageFehler === null
        ? 'TWELVEDATA_API_KEY fehlt'
        : `Alpha Vantage: ${alphaVantageFehler}; TWELVEDATA_API_KEY fehlt`,
    )
  }
  const provider = new TwelveDataPriceProvider(twelve)

  await twelveDataTakt()
  try {
    const series = await provider.fetchDailyHistory({ instrument: entry, since })
    return {
      bars: await saveBars(entry.ticker, series),
      hinweis: alphaVantageFehler === null ? null : `Alpha Vantage scheiterte (${alphaVantageFehler}), Twelve Data lieferte`,
    }
  } catch (fehler) {
    const retryable =
      typeof fehler === 'object' && fehler !== null && 'retryable' in fehler
        ? (fehler as { retryable: boolean }).retryable
        : false
    if (retryable || entry.venue !== 'XETRA' || entry.secTickerHint === undefined) {
      if (alphaVantageFehler !== null) {
        throw new Error(`Alpha Vantage: ${alphaVantageFehler}; Twelve Data: ${message(fehler)}`)
      }
      throw fehler
    }

    // Letzter Rueckfall: die US-Notierung, unter dem eigenen Kuerzel
    // gespeichert. Dollar-Kurse sind besser als keine.
    await twelveDataTakt()
    const ersatz: WatchlistEntry = { ...entry, ticker: entry.secTickerHint, venue: 'NYSE' }
    const series = await provider.fetchDailyHistory({ instrument: ersatz, since })
    const bars = await saveBars(entry.ticker, { ...series, ticker: entry.ticker })
    return { bars, hinweis: `Kurse ueber US-Notierung ${entry.secTickerHint} (${series.currency})` }
  }
}

async function holeBerichtszahlen(
  entry: WatchlistEntry,
  uebersprungen: string[],
): Promise<number> {
  if (abrufIstFrisch(await lastFundamentalsSuccess(entry.ticker), new Date())) {
    uebersprungen.push('Berichtszahlen aktuell')
    return 0
  }

  const userAgent = process.env['SEC_USER_AGENT']?.trim() ?? ''
  if (!userAgent.includes('@')) throw new Error('SEC_USER_AGENT fehlt oder hat keine E-Mail')

  const index = await ladeCikIndex(userAgent)
  const resolution = resolveCik(entry, index)
  if (resolution === null) throw new Error('nicht bei der SEC registriert')

  const response = await fetch(companyFactsUrl(resolution.cik), {
    headers: { 'User-Agent': userAgent, Accept: 'application/json' },
  })
  if (response.status === 404) throw new Error('keine XBRL-Daten hinterlegt')
  if (!response.ok) throw new Error(`XBRL: HTTP ${response.status}`)

  const periods: ReportedPeriod[] = extractPeriods(
    CompanyFactsSchema.parse(await response.json()),
  ).slice(0, 12)
  return savePeriods(entry.ticker, periods)
}

/**
 * Analystenkonsens von Finnhub. Der Vergleich mit dem letzten Stand
 * ergibt die Meldung; gespeichert wird beides. Ohne Schluessel wird
 * still uebersprungen, das ist ein bekannter Zustand und kein Fehler.
 */
async function holeKonsens(
  entry: WatchlistEntry,
  gesammelt: AnalystAction[],
  uebersprungen: string[],
): Promise<number> {
  const finnhub = process.env['FINNHUB_API_KEY']?.trim() ?? ''
  if (finnhub.length === 0) {
    uebersprungen.push('Konsens: kein Schluessel')
    return 0
  }
  const symbol = finnhubSymbolFor(entry)
  if (symbol === null) {
    uebersprungen.push('Konsens: keine US-Notierung')
    return 0
  }
  if (abrufIstFrisch(await trendFetchedAt(entry.ticker), new Date())) {
    uebersprungen.push('Konsens aktuell')
    return 0
  }

  const roh = await fetchFinnhubJson(recommendationUrl(symbol, finnhub))
  const trends = parseRecommendationTrends(roh, entry.ticker)
  if (trends.length === 0) {
    uebersprungen.push('Konsens: keine Abdeckung')
    return 0
  }

  const vorher = await readLatestTrend(entry.ticker)
  // Nur die juengsten sechs Monate aufheben, der Rest ist Anzeige-Ballast.
  await saveTrends(trends.slice(0, 6))
  const neuester = trends[0]
  // Ohne Vergleichsstand gibt es keine Verschiebung, nur einen ersten
  // Stand. Der steht in der Konsens-Tabelle; eine Meldung "Aenderung
  // von nichts" waere 24 Zeilen Rauschen beim Erstlauf.
  if (neuester !== undefined && vorher !== null) {
    const action = trendToAction(vorher, neuester)
    if (action !== null) gesammelt.push(action)
  }
  return trends.length
}

async function verarbeite(
  entry: WatchlistEntry,
  since: string,
  gesammelt: AnalystAction[],
): Promise<Ergebnis> {
  const notizen: string[] = []
  const uebersprungen: string[] = []
  let bars = 0
  let periods = 0
  let trends = 0

  try {
    const kurse = await holeKurse(entry, since, uebersprungen)
    bars = kurse.bars
    if (kurse.hinweis !== null) notizen.push(kurse.hinweis)
  } catch (error) {
    notizen.push(`Kurse: ${message(error)}`)
  }

  if (entry.expectedCoverage !== 'none') {
    try {
      periods = await holeBerichtszahlen(entry, uebersprungen)
    } catch (error) {
      notizen.push(`Berichtszahlen: ${message(error)}`)
    }
  }

  try {
    trends = await holeKonsens(entry, gesammelt, uebersprungen)
  } catch (error) {
    notizen.push(`Konsens: ${message(error)}`)
  }

  const note = notizen.length === 0 ? null : notizen.join(' | ')
  await recordRun(entry.ticker, notizen.length === 0, bars, periods, note)
  return { ticker: entry.ticker, bars, periods, trends, uebersprungen, note }
}

async function stelleZu(): Promise<{ zugestellt: number; note: string | null }> {
  const offen = await loadUnnotifiedActions()
  if (offen.length === 0) return { zugestellt: 0, note: null }

  const { readTelegramConfig, TelegramNotifier } = await import('@/providers/telegram')
  const telegram = readTelegramConfig()
  if (telegram === null) {
    return { zugestellt: 0, note: 'Telegram nicht eingerichtet, Meldungen nur in der Oberflaeche.' }
  }

  const digest = formatAnalystDigest(offen)
  const result = await new TelegramNotifier(telegram.token, telegram.chatId).sendText(
    digest.title,
    clipDigestBody(digest.body),
  )
  if (!result.ok) {
    return { zugestellt: 0, note: `Telegram fehlgeschlagen: ${result.error ?? 'unbekannt'}` }
  }
  await markNotified(offen.map((action) => action.sourceEventId))
  return { zugestellt: offen.length, note: null }
}

async function lauf(offset: number, limit: number, deadline: number): Promise<NextResponse> {
  const startedAt = Date.now()
  await ensureSchema()

  const since = new Date(Date.now() - HISTORY_DAYS * 86_400_000).toISOString().slice(0, 10)
  // Grundstock plus selbst hinzugefuegte Titel; die Reihenfolge ist
  // stabil (Grundstock zuerst, dann nach Hinzufuegedatum), damit
  // offset-basiertes Fortsetzen weiter funktioniert.
  const watchlist = await gesamteWatchlist()
  const ergebnisse: Ergebnis[] = []
  const analysten: AnalystAction[] = []
  let position = offset

  while (position < watchlist.length && ergebnisse.length < limit) {
    const entry = watchlist[position]
    if (entry === undefined) break
    ergebnisse.push(await verarbeite(entry, since, analysten))
    position += 1
    if (Date.now() > deadline) break
  }

  const done = position >= watchlist.length
  const fehler = ergebnisse.filter((e) => e.note !== null).length
  const neue = await storeAnalystActions(
    analysten,
    fehler === 0 ? null : `${fehler} Titel mit Hinweis`,
    done,
  )

  let zugestellt = 0
  let zustellnote: string | null = null
  if (done) {
    const zustellung = await stelleZu()
    zugestellt = zustellung.zugestellt
    zustellnote = zustellung.note
    revalidatePath('/', 'layout')
  }

  console.info(
    `refresh: ${offset} bis ${position - 1} von ${watchlist.length}, ` +
      `${ergebnisse.length} verarbeitet, ${fehler} mit Hinweis, ` +
      `${Math.round((Date.now() - startedAt) / 1000)}s`,
  )
  // Die Hinweise selbst gehoeren ebenfalls ins Protokoll: sie stehen
  // zwar in refresh_run und im Browser des Ausloesers, aber die
  // Fehlersuche von aussen braucht sie hier.
  for (const ergebnis of ergebnisse) {
    if (ergebnis.note !== null) {
      console.info(`refresh-hinweis ${ergebnis.ticker}: ${ergebnis.note.slice(0, 220)}`)
    }
  }

  return NextResponse.json({
    ok: true,
    verarbeitet: ergebnisse.length,
    naechsterOffset: done ? null : position,
    done,
    gesamt: watchlist.length,
    neueMeldungen: neue.length,
    zugestellt,
    zustellnote,
    ergebnisse,
  })
}

function grenzen(request: NextRequest): { offset: number; limit: number } {
  const params = request.nextUrl.searchParams
  const offset = Math.max(0, Number(params.get('offset') ?? 0) || 0)
  const roh = Number(params.get('limit') ?? DEFAULT_LIMIT) || DEFAULT_LIMIT
  return { offset, limit: Math.min(MAX_LIMIT, Math.max(1, roh)) }
}

async function behandle(
  request: NextRequest,
  deadlineMs: number,
  limitOverride?: number,
): Promise<NextResponse> {
  if (!hasDatabase()) {
    return NextResponse.json(
      { ok: false, fehler: new MissingDatabaseUrl().message },
      { status: 503 },
    )
  }
  const { offset, limit } = grenzen(request)
  try {
    return await lauf(offset, limitOverride ?? limit, Date.now() + deadlineMs)
  } catch (error) {
    console.error('refresh gescheitert:', error)
    return NextResponse.json({ ok: false, fehler: message(error) }, { status: 500 })
  }
}

/** Von der Oberflaeche: ein Stapel je Aufruf, der Knopf ruft nach. */
export async function POST(request: NextRequest): Promise<NextResponse> {
  return behandle(request, 45_000)
}

/**
 * Vom taeglichen Cron: ein langer Lauf, und wenn der nicht reicht,
 * haengt sich der naechste selbst an. `after` laeuft nach der Antwort,
 * die Kette kostet den Ausloeser also nichts. Die Notbremse verhindert
 * Endlosschleifen, falls kein Fortschritt mehr passiert.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const cronSecret = process.env['CRON_SECRET']?.trim() ?? ''
  const istCron =
    cronSecret.length > 0 &&
    request.headers.get('authorization') === `Bearer ${cronSecret}`

  const antwort = await behandle(request, istCron ? 250_000 : 45_000, istCron ? 40 : undefined)

  if (istCron && antwort.status === 200) {
    const daten = (await antwort.clone().json()) as {
      done?: boolean
      naechsterOffset?: number | null
    }
    const kette = Number(request.nextUrl.searchParams.get('kette') ?? 0) || 0
    if (daten.done !== true && daten.naechsterOffset != null && kette < MAX_KETTE) {
      const weiter = new URL('/api/refresh', request.nextUrl.origin)
      weiter.searchParams.set('offset', String(daten.naechsterOffset))
      weiter.searchParams.set('kette', String(kette + 1))
      after(async () => {
        try {
          await fetch(weiter, {
            method: 'GET',
            headers: { authorization: `Bearer ${cronSecret}` },
          })
        } catch (fehler) {
          console.error('Kettenglied fehlgeschlagen:', fehler)
        }
      })
    }
  }

  return antwort
}
