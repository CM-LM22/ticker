import { estimateNextEarnings } from '../domain/earnings-estimate'
import type { EarningsEstimate } from '../domain/earnings-estimate'
import { summarizeFundamentals } from '../domain/fundamentals'
import type { FundamentalsSummary, ReportedPeriod } from '../domain/fundamentals'
import type { WatchlistEntry } from '../domain/instrument'
import { summarize52Weeks } from '../domain/price-series'
import type { PriceSeries, PriceSummary } from '../domain/price-series'
import { screen } from '../domain/screening'
import type { ScreenResult } from '../domain/screening'
import { WATCHLIST } from '../config/watchlist'
import { syntheticSeries } from './synthetic'

/**
 * Demodaten fuer die Oberflaeche, solange keine Datenbank angebunden ist.
 *
 * Alle Zahlen hier sind erfunden. Sie zeigen, wie die Ansicht mit echten
 * Daten aussieht, und sonst nichts. Jede Seite, die sie verwendet, sagt
 * das oben an. Sobald Slice 6 die Kurse tatsaechlich holt, faellt dieses
 * Modul ersatzlos weg.
 */
export const DEMO_AS_OF = new Date('2026-08-21T00:00:00Z')

export interface DemoTitle {
  entry: WatchlistEntry
  series: PriceSeries
  price: PriceSummary
  fundamentals: FundamentalsSummary | null
  earnings: EarningsEstimate | null
  screen: ScreenResult
}

function seedOf(text: string): number {
  let hash = 2_166_136_261
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 16_777_619)
  }
  return hash >>> 0
}

function currencyOf(entry: WatchlistEntry): string {
  return entry.venue === 'XETRA' ? 'EUR' : 'USD'
}

/** Acht Quartale mit einem seedabhaengigen Wachstums- und Margenprofil. */
function demoPeriods(entry: WatchlistEntry): ReportedPeriod[] {
  const seed = seedOf(entry.ticker)
  const growth = 1 + (((seed >> 3) % 22) - 6) / 100
  const margin = 0.03 + ((seed >> 7) % 26) / 100
  const currency = currencyOf(entry)
  const base = 800_000_000 + ((seed >> 5) % 40) * 700_000_000
  const shares = 400_000_000 + ((seed >> 9) % 30) * 120_000_000

  const periods: ReportedPeriod[] = []
  for (let i = 0; i < 8; i += 1) {
    const end = new Date(Date.UTC(2026, 5, 30))
    end.setUTCMonth(end.getUTCMonth() - i * 3)
    const start = new Date(end)
    start.setUTCMonth(start.getUTCMonth() - 3)
    const revenue = Math.round(base * growth ** ((8 - i) / 4))
    // Meldeverzug je Titel leicht unterschiedlich, wie in der Realitaet.
    const lag = 22 + (seed >> 13) % 26
    const filed = new Date(end.getTime() + lag * 86_400_000)
    const quarter = Math.floor(end.getUTCMonth() / 3) + 1

    periods.push({
      label: `Q${quarter} ${end.getUTCFullYear()}`,
      periodEnd: end.toISOString().slice(0, 10),
      periodStart: start.toISOString().slice(0, 10),
      frame: 'quarter',
      form: entry.expectedCoverage === 'sec_foreign' ? '6-K' : '10-Q',
      revenue,
      netIncome: Math.round(revenue * (margin + ((i % 3) - 1) / 400)),
      epsDiluted: Math.round(((revenue * margin) / shares) * 100) / 100,
      currency,
      filedAt: filed.toISOString().slice(0, 10),
      accessionNumber: null,
      sourceUrl: null,
    })
  }
  return periods
}

export function buildDemoTitles(): DemoTitle[] {
  return WATCHLIST.map((entry) => {
    const seed = seedOf(entry.ticker)
    const series = syntheticSeries({
      ticker: entry.ticker,
      currency: currencyOf(entry),
      start: '2024-08-01',
      days: 760,
      startPrice: 20 + (seed % 260),
      seed,
      driftPctPerYear: ((seed >> 11) % 44) - 14,
      dailyVolPct: 0.8 + ((seed >> 17) % 20) / 10,
    })

    const price = summarize52Weeks(series, DEMO_AS_OF)

    // Ohne SEC-Registrierung gibt es kostenlos keine Berichtszahlen und
    // keinen Einreichungsverlauf. Die Demo bildet genau das ab, statt
    // eine Vollstaendigkeit vorzuspiegeln, die es nicht gibt.
    const covered = entry.expectedCoverage !== 'none'
    const periods = covered ? demoPeriods(entry) : []
    const fundamentals = covered
      ? summarizeFundamentals(entry.ticker, periods, DEMO_AS_OF)
      : null
    const earnings = covered
      ? estimateNextEarnings(
          periods.map((period) => period.filedAt),
          DEMO_AS_OF,
        )
      : null

    return {
      entry,
      series,
      price,
      fundamentals,
      earnings,
      screen: screen({ ticker: entry.ticker, name: entry.name, price, fundamentals }),
    }
  })
}
