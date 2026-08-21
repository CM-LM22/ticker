import { normalizeCik } from './instrument'
import type { Venue, WatchlistEntry } from './instrument'

/**
 * Ein eingehendes Ereignis identifiziert seinen Titel je nach Quelle
 * anders: EDGAR ueber die CIK, Ratings-Anbieter ueber ein Kuerzel,
 * europaeische Quellen ueber die ISIN. Das Matching versucht sie in
 * dieser Reihenfolge, weil die CIK eindeutig ist und ein Kuerzel nicht.
 */
export interface InstrumentReference {
  cik?: string | undefined
  isin?: string | undefined
  ticker?: string | undefined
  venue?: Venue | undefined
}

export type MatchResult =
  | { status: 'matched'; entry: WatchlistEntry; via: 'cik' | 'isin' | 'ticker' }
  | { status: 'not_found' }
  /** Kuerzel an mehreren Handelsplaetzen. Raten waere hier ein Fehler. */
  | { status: 'ambiguous'; candidates: readonly WatchlistEntry[] }

function tickerKey(ticker: string): string {
  return ticker.trim().toUpperCase()
}

export class WatchlistIndex {
  private readonly byCik = new Map<string, WatchlistEntry>()
  private readonly byIsin = new Map<string, WatchlistEntry>()
  private readonly byTicker = new Map<string, WatchlistEntry[]>()

  private constructor(private readonly entries: readonly WatchlistEntry[]) {
    for (const entry of entries) {
      if (entry.cik !== undefined) this.byCik.set(normalizeCik(entry.cik), entry)
      if (entry.isin !== undefined) this.byIsin.set(entry.isin.toUpperCase(), entry)

      for (const ticker of [entry.ticker, entry.secTickerHint]) {
        if (ticker === undefined) continue
        const key = tickerKey(ticker)
        const bucket = this.byTicker.get(key)
        if (bucket === undefined) this.byTicker.set(key, [entry])
        else if (!bucket.includes(entry)) bucket.push(entry)
      }
    }
  }

  static from(entries: readonly WatchlistEntry[]): WatchlistIndex {
    return new WatchlistIndex(entries)
  }

  get size(): number {
    return this.entries.length
  }

  match(reference: InstrumentReference): MatchResult {
    if (reference.cik !== undefined && reference.cik.trim().length > 0) {
      const entry = this.byCik.get(normalizeCik(reference.cik))
      if (entry !== undefined) return { status: 'matched', entry, via: 'cik' }
    }

    if (reference.isin !== undefined && reference.isin.trim().length > 0) {
      const entry = this.byIsin.get(reference.isin.trim().toUpperCase())
      if (entry !== undefined) return { status: 'matched', entry, via: 'isin' }
    }

    if (reference.ticker !== undefined && reference.ticker.trim().length > 0) {
      const bucket = this.byTicker.get(tickerKey(reference.ticker)) ?? []
      const candidates =
        reference.venue === undefined
          ? bucket
          : bucket.filter((entry) => entry.venue === reference.venue)

      const [only] = candidates
      if (candidates.length === 1 && only !== undefined) {
        return { status: 'matched', entry: only, via: 'ticker' }
      }
      if (candidates.length > 1) return { status: 'ambiguous', candidates }
    }

    return { status: 'not_found' }
  }
}
