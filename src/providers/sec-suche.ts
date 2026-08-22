import { z } from 'zod'
import { normalizeCik } from '../domain/instrument'
import type { Venue } from '../domain/instrument'

/**
 * Titelsuche auf dem offiziellen SEC-Verzeichnis aller registrierten
 * Emittenten samt Handelsplatz. Kostenlos, ohne Kontingent, und die
 * einzige Quelle im System, aus der neue Titel stammen duerfen: kein
 * Feld wird vom Nutzer frei eingegeben (E9 — keine erfundenen
 * Kennnummern).
 */
export const EXCHANGE_TICKERS_URL = 'https://www.sec.gov/files/company_tickers_exchange.json'

/** Nur der Rumpf per Zod; die Zeilen werden gezielt geprueft, weil die
 * Datei zehntausende Eintraege hat (Lehre aus companyfacts). */
const RumpfSchema = z.object({
  fields: z.array(z.string()),
  data: z.array(z.array(z.unknown())),
})

export interface SucheEintrag {
  cik: string
  name: string
  ticker: string
  exchange: string
}

export function parseExchangeTickers(roh: unknown): SucheEintrag[] {
  const rumpf = RumpfSchema.parse(roh)
  const cikPos = rumpf.fields.indexOf('cik')
  const namePos = rumpf.fields.indexOf('name')
  const tickerPos = rumpf.fields.indexOf('ticker')
  const exchangePos = rumpf.fields.indexOf('exchange')
  if (cikPos < 0 || namePos < 0 || tickerPos < 0 || exchangePos < 0) {
    throw new Error('SEC-Verzeichnis: erwartete Felder fehlen')
  }

  const eintraege: SucheEintrag[] = []
  for (const zeile of rumpf.data) {
    const cik = zeile[cikPos]
    const name = zeile[namePos]
    const ticker = zeile[tickerPos]
    const exchange = zeile[exchangePos]
    // Kaputte Einzelzeilen ueberspringen statt alles zu verwerfen.
    if (typeof name !== 'string' || typeof ticker !== 'string' || ticker.length === 0) continue
    if (typeof cik !== 'number' && typeof cik !== 'string') continue
    eintraege.push({
      cik: normalizeCik(cik),
      name,
      ticker: ticker.toUpperCase(),
      exchange: typeof exchange === 'string' ? exchange : '',
    })
  }
  return eintraege
}

let indexCache: { eintraege: SucheEintrag[]; geladen: number } | null = null
const INDEX_TTL_MS = 24 * 3_600_000

/** Das Verzeichnis, einen Tag im Speicher gehalten: es aendert sich
 * selten und die Suche soll nicht je Tastendruck die SEC fragen. */
export async function ladeSucheIndex(userAgent: string): Promise<SucheEintrag[]> {
  if (indexCache !== null && Date.now() - indexCache.geladen < INDEX_TTL_MS) {
    return indexCache.eintraege
  }
  const antwort = await fetch(EXCHANGE_TICKERS_URL, {
    headers: { 'User-Agent': userAgent },
    cache: 'no-store',
  })
  if (!antwort.ok) throw new Error(`SEC-Verzeichnis: HTTP ${antwort.status}`)
  const eintraege = parseExchangeTickers(await antwort.json())
  indexCache = { eintraege, geladen: Date.now() }
  return eintraege
}

/**
 * Nur Handelsplaetze, die das System auch bedienen kann. OTC und CBOE
 * bleiben aussen vor: keine gemessene Gratis-Kursquelle.
 */
export function venueForExchange(exchange: string): Venue | null {
  const wert = exchange.trim().toUpperCase()
  if (wert === 'NASDAQ') return 'NASDAQ'
  if (wert === 'NYSE') return 'NYSE'
  return null
}

/**
 * Rangfolge: exakter Ticker, dann Ticker-Praefix, dann Name. So liegt
 * "AAPL" bei der Eingabe "aa" vor "Aaron's" und Apple findet man auch
 * ueber "apple".
 */
export function searchCompanies(
  query: string,
  eintraege: readonly SucheEintrag[],
  limit = 8,
): SucheEintrag[] {
  const suche = query.trim().toUpperCase()
  if (suche.length < 2) return []

  const exakt: SucheEintrag[] = []
  const praefix: SucheEintrag[] = []
  const imNamen: SucheEintrag[] = []
  for (const eintrag of eintraege) {
    if (eintrag.ticker === suche) exakt.push(eintrag)
    else if (eintrag.ticker.startsWith(suche)) praefix.push(eintrag)
    else if (eintrag.name.toUpperCase().includes(suche)) imNamen.push(eintrag)
  }
  praefix.sort((a, b) => a.ticker.localeCompare(b.ticker))
  imNamen.sort((a, b) => a.name.localeCompare(b.name))
  return [...exakt, ...praefix, ...imNamen].slice(0, limit)
}
