import { z } from 'zod'
import { normalizeCik } from '../../src/domain/instrument'
import type { WatchlistEntry } from '../../src/domain/instrument'

/**
 * CIK-Aufloesung, gemeinsam genutzt von allen Skripten. Frueher stand
 * das doppelt herum; zwei Kopien derselben Zuordnungsregel waeren
 * genau die Sorte Abweichung, die man erst bemerkt, wenn ein Titel
 * still auf die falsche Firma zeigt.
 */
export const COMPANY_TICKERS_URL = 'https://www.sec.gov/files/company_tickers.json'

export const CompanyTickersSchema = z.record(
  z.string(),
  z.object({ cik_str: z.number(), ticker: z.string(), title: z.string() }),
)

export interface CikIndex {
  byTicker: Map<string, { cik: string; title: string }>
  byNameKey: { key: string; cik: string; title: string }[]
}

export interface Resolution {
  cik: string
  secName: string
  via: 'ticker' | 'name'
}

export function requireUserAgent(): string {
  const userAgent = process.env['SEC_USER_AGENT']?.trim()
  if (userAgent === undefined || userAgent.length === 0) {
    throw new Error(
      'SEC_USER_AGENT fehlt. EDGAR verlangt Projektname und Kontakt-E-Mail, sonst HTTP 403.',
    )
  }
  if (!userAgent.includes('@')) {
    throw new Error(`SEC_USER_AGENT enthaelt keine Kontakt-E-Mail: ${userAgent}`)
  }
  return userAgent
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** Rechtsformen weg, damit "SAP SE" und "SAP" denselben Kern haben. */
export function nameKey(name: string): string {
  return name
    .toUpperCase()
    .replace(/[.,]/g, '')
    .replace(
      /\b(AG|SE|NV|N V|PLC|SA|KGAA|INC|CORP|CORPORATION|CO|COMPANY|HOLDING|HOLDINGS|GROUP|GMBH|& CO)\b/g,
      ' ',
    )
    .replace(/\s+/g, ' ')
    .trim()
}

export function buildCikIndex(companies: z.infer<typeof CompanyTickersSchema>): CikIndex {
  const byTicker = new Map<string, { cik: string; title: string }>()
  const byNameKey: CikIndex['byNameKey'] = []
  for (const company of Object.values(companies)) {
    const cik = normalizeCik(company.cik_str)
    byTicker.set(company.ticker.toUpperCase(), { cik, title: company.title })
    byNameKey.push({ key: nameKey(company.title), cik, title: company.title })
  }
  return { byTicker, byNameKey }
}

export function resolveCik(entry: WatchlistEntry, index: CikIndex): Resolution | null {
  // Bei XETRA-Titeln niemals das lokale Kuerzel gegen EDGAR halten:
  // ADS ist an XETRA adidas und war in den USA ein anderes Unternehmen.
  // Ein falscher Treffer waere schlimmer als keiner.
  const candidates =
    entry.venue === 'XETRA'
      ? entry.secTickerHint === undefined
        ? []
        : [entry.secTickerHint]
      : [entry.secTickerHint ?? entry.ticker]

  for (const candidate of candidates) {
    const hit = index.byTicker.get(candidate.toUpperCase())
    if (hit !== undefined) return { cik: hit.cik, secName: hit.title, via: 'ticker' }
  }

  const key = nameKey(entry.name)
  if (key.length >= 4) {
    const matches = index.byNameKey.filter(
      (row) => row.key.startsWith(key) || key.startsWith(row.key),
    )
    const only = matches[0]
    if (matches.length === 1 && only !== undefined) {
      return { cik: only.cik, secName: only.title, via: 'name' }
    }
  }
  return null
}
