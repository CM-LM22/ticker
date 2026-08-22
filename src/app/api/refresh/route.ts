import { revalidatePath } from 'next/cache'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { WATCHLIST } from '@/config/watchlist'
import { ensureSchema } from '@/db/migrate'
import { hasDatabase, MissingDatabaseUrl } from '@/db/client'
import {
  loadUnnotifiedActions,
  markNotified,
  recordRun,
  saveBars,
  savePeriods,
  storeAnalystActions,
} from '@/db/repository'
import { clipDigestBody, formatAnalystDigest } from '@/domain/analyst-actions'
import type { AnalystAction } from '@/domain/analyst-actions'
import { TelegramNotifier, readTelegramConfig } from '@/providers/telegram'
import { YahooRatingsProvider } from '@/providers/yahoo-ratings'
import type { ReportedPeriod } from '@/domain/fundamentals'
import type { WatchlistEntry } from '@/domain/instrument'
import { CompanyFactsSchema, companyFactsUrl, extractPeriods } from '@/providers/sec-xbrl'
import { StooqPriceProvider } from '@/providers/stooq'
import { TwelveDataPriceProvider } from '@/providers/twelvedata'
import { buildCikIndex, CompanyTickersSchema, COMPANY_TICKERS_URL, resolveCik } from '@/providers/edgar-index'
import type { CikIndex } from '@/providers/edgar-index'

/**
 * Holt die Daten und schreibt sie in die Datenbank.
 *
 * Stapelweise, weil serverlose Funktionen ein Zeitlimit haben und das
 * je nach Tarif unterschiedlich ausfaellt. Der Endpunkt verarbeitet ein
 * Stueck der Watchlist und meldet, wo er stehengeblieben ist; der
 * Aufrufer ruft erneut auf, bis `done` wahr ist. Damit ist er von der
 * Zeitgrenze unabhaengig, statt an ihr zu scheitern.
 */
export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Kleiner als frueher: die SEC-Antworten sind gross, und der
// Gratis-Tarif von Twelve Data erlaubt nur acht Abrufe je Minute.
const DEFAULT_LIMIT = 4
const MAX_LIMIT = 10
/** Historie, die wir vorhalten: 52 Wochen plus Vorlauf fuer den 200-Tage-Schnitt. */
const HISTORY_DAYS = 420

/** Die Kuerzelliste der SEC ist gross; einmal je Instanz reicht. */
let cikIndexCache: CikIndex | null = null

interface Ergebnis {
  ticker: string
  bars: number
  periods: number
  actions: number
  note: string | null
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

async function ladeCikIndex(userAgent: string): Promise<CikIndex> {
  if (cikIndexCache !== null) return cikIndexCache
  const response = await fetch(COMPANY_TICKERS_URL, {
    headers: { 'User-Agent': userAgent, Accept: 'application/json' },
    // Einen Tag zwischenspeichern: die Liste aendert sich selten.
    next: { revalidate: 86_400 },
  })
  if (!response.ok) throw new Error(`company_tickers.json: HTTP ${response.status}`)
  cikIndexCache = buildCikIndex(CompanyTickersSchema.parse(await response.json()))
  return cikIndexCache
}

async function holeKurse(entry: WatchlistEntry, since: string): Promise<number> {
  const twelve = process.env['TWELVEDATA_API_KEY']?.trim() ?? ''
  const provider =
    twelve.length > 0 ? new TwelveDataPriceProvider(twelve) : new StooqPriceProvider()
  const series = await provider.fetchDailyHistory({ instrument: entry, since })
  return saveBars(entry.ticker, series)
}

async function holeBerichtszahlen(entry: WatchlistEntry): Promise<number> {
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

async function verarbeite(
  entry: WatchlistEntry,
  since: string,
  gesammelt: AnalystAction[],
): Promise<Ergebnis> {
  const notizen: string[] = []
  let bars = 0
  let periods = 0
  let actions = 0

  try {
    bars = await holeKurse(entry, since)
  } catch (error) {
    notizen.push(`Kurse: ${message(error)}`)
  }

  // Nur versuchen, wo eine SEC-Registrierung ueberhaupt erwartet wird.
  if (entry.expectedCoverage !== 'none') {
    try {
      periods = await holeBerichtszahlen(entry)
    } catch (error) {
      notizen.push(`Berichtszahlen: ${message(error)}`)
    }
  }

  try {
    const items = await new YahooRatingsProvider().fetchHistory(entry)
    gesammelt.push(...items)
    actions = items.length
  } catch (error) {
    notizen.push(`Analysten: ${message(error)}`)
  }

  const note = notizen.length === 0 ? null : notizen.join(' | ')
  await recordRun(entry.ticker, notizen.length === 0, bars, periods, note)
  return { ticker: entry.ticker, bars, periods, actions, note }
}

/**
 * Zustellung aus der Ausgangspost der Datenbank, nicht aus dem
 * Arbeitsspeicher dieses Aufrufs. Bricht ein Lauf ab, bleibt die
 * Meldung liegen und geht beim naechsten Mal raus, statt verloren zu
 * gehen.
 */
async function stelleZu(): Promise<{ zugestellt: number; note: string | null }> {
  const offen = await loadUnnotifiedActions()
  if (offen.length === 0) return { zugestellt: 0, note: null }

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
    // Nicht als zugestellt markieren: dann geht es beim naechsten Lauf
    // erneut raus, statt still zu verschwinden.
    return { zugestellt: 0, note: `Telegram fehlgeschlagen: ${result.error ?? 'unbekannt'}` }
  }

  await markNotified(offen.map((action) => action.sourceEventId))
  return { zugestellt: offen.length, note: null }
}

async function lauf(offset: number, limit: number, deadline: number): Promise<NextResponse> {
  await ensureSchema()

  const since = new Date(Date.now() - HISTORY_DAYS * 86_400_000).toISOString().slice(0, 10)
  const ergebnisse: Ergebnis[] = []
  const analysten: AnalystAction[] = []
  let position = offset

  while (position < WATCHLIST.length && ergebnisse.length < limit) {
    const entry = WATCHLIST[position]
    if (entry === undefined) break
    ergebnisse.push(await verarbeite(entry, since, analysten))
    position += 1
    // Vor dem Zeitlimit aufhoeren und den Rest dem naechsten Aufruf
    // ueberlassen, statt mitten im Schreiben abgeschnitten zu werden.
    if (Date.now() > deadline) break
  }

  const done = position >= WATCHLIST.length
  const fehler = ergebnisse.filter((e) => e.note !== null).length
  // Eine Zeile je Stapel, damit im Protokoll sichtbar ist, wo ein Lauf
  // stehenbleibt. Ohne sie sieht man nur, dass nichts mehr kommt.
  console.info(
    `refresh: ${offset} bis ${position - 1} von ${WATCHLIST.length}, ` +
      `${ergebnisse.length} verarbeitet, ${fehler} mit Hinweis, ` +
      `${Math.round((Date.now() - (deadline - 45_000)) / 1000)}s`,
  )
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

  return NextResponse.json({
    ok: true,
    verarbeitet: ergebnisse.length,
    naechsterOffset: done ? null : position,
    done,
    gesamt: WATCHLIST.length,
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

async function behandle(request: NextRequest, deadlineMs: number): Promise<NextResponse> {
  if (!hasDatabase()) {
    return NextResponse.json(
      { ok: false, fehler: new MissingDatabaseUrl().message },
      { status: 503 },
    )
  }
  const { offset, limit } = grenzen(request)
  try {
    return await lauf(offset, limit, Date.now() + deadlineMs)
  } catch (error) {
    return NextResponse.json({ ok: false, fehler: message(error) }, { status: 500 })
  }
}

/** Von der Oberflaeche: ein Stapel je Aufruf. */
export async function POST(request: NextRequest): Promise<NextResponse> {
  return behandle(request, 45_000)
}

/** Von Vercel Cron: so viel wie in die Zeit passt. */
export async function GET(request: NextRequest): Promise<NextResponse> {
  return behandle(request, 45_000)
}
