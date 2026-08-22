import type { CoverageExpectation, WatchlistEntry } from '../domain/instrument'
import {
  buildCikIndex,
  CompanyTickersSchema,
  COMPANY_TICKERS_URL,
  resolveCik,
} from '../providers/edgar-index'
import type { CikIndex } from '../providers/edgar-index'
import { analyseSubmissions, SubmissionsSchema, submissionsUrl } from './submissions'

/**
 * Misst je Titel, was tatsaechlich bei der SEC liegt, und stellt es der
 * Erwartung aus der Watchlist gegenueber. Weicht beides voneinander ab,
 * gewinnt die Messung.
 */
export interface CoverageRow {
  ticker: string
  name: string
  venue: WatchlistEntry['venue']
  expected: CoverageExpectation
  measured: CoverageExpectation
  cik: string | null
  secName: string | null
  resolvedVia: 'ticker' | 'name' | null
  counts: Record<string, number>
  earnings8K: number
  latestEarningsFiling: { form: string; filingDate: string } | null
  verdict: 'ok' | 'abweichung'
  note: string | null
}

/** 24 Monate. Kurz genug, um aktuell zu sein, lang genug fuer vier Quartale. */
export const WINDOW_MONTHS = 24

let indexCache: CikIndex | null = null

export async function loadCikIndex(userAgent: string): Promise<CikIndex> {
  if (indexCache !== null) return indexCache
  const antwort = await fetch(COMPANY_TICKERS_URL, {
    headers: { 'User-Agent': userAgent, Accept: 'application/json' },
    next: { revalidate: 86_400 },
  })
  if (!antwort.ok) throw new Error(`company_tickers.json: HTTP ${antwort.status}`)
  indexCache = buildCikIndex(CompanyTickersSchema.parse(await antwort.json()))
  return indexCache
}

function leer(entry: WatchlistEntry, note: string): CoverageRow {
  return {
    ticker: entry.ticker,
    name: entry.name,
    venue: entry.venue,
    expected: entry.expectedCoverage,
    measured: 'none',
    cik: null,
    secName: null,
    resolvedVia: null,
    counts: {},
    earnings8K: 0,
    latestEarningsFiling: null,
    verdict: entry.expectedCoverage === 'none' ? 'ok' : 'abweichung',
    note,
  }
}

export async function measureCoverage(
  entry: WatchlistEntry,
  userAgent: string,
  index: CikIndex,
  asOf: Date,
): Promise<CoverageRow> {
  const resolution = resolveCik(entry, index)
  if (resolution === null) return leer(entry, 'Bei der SEC nicht gefunden.')

  const antwort = await fetch(submissionsUrl(resolution.cik), {
    headers: { 'User-Agent': userAgent, Accept: 'application/json' },
  })
  if (antwort.status === 404) return leer(entry, 'CIK bekannt, aber keine submissions-Datei.')
  if (!antwort.ok) return leer(entry, `submissions: HTTP ${antwort.status}`)

  const cutoff = new Date(asOf)
  cutoff.setUTCMonth(cutoff.getUTCMonth() - WINDOW_MONTHS)
  const analyse = analyseSubmissions(SubmissionsSchema.parse(await antwort.json()), cutoff)

  const notizen: string[] = []
  if (resolution.via === 'name') notizen.push('CIK ueber Namenssuche, bitte pruefen.')
  if (analyse.windowTruncated) notizen.push('Fenster reicht nicht ueber 24 Monate zurueck.')
  if (analyse.measured === 'none') notizen.push('Registriert, aber keine relevanten Einreichungen.')

  return {
    ticker: entry.ticker,
    name: entry.name,
    venue: entry.venue,
    expected: entry.expectedCoverage,
    measured: analyse.measured,
    cik: resolution.cik,
    secName: analyse.secName,
    resolvedVia: resolution.via,
    counts: analyse.counts,
    earnings8K: analyse.earnings8K,
    latestEarningsFiling: analyse.latestEarningsFiling,
    verdict: analyse.measured === entry.expectedCoverage ? 'ok' : 'abweichung',
    note: notizen.length === 0 ? null : notizen.join(' '),
  }
}
