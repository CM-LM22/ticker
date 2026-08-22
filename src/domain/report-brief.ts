import type { FundamentalsSummary } from './fundamentals'
import type { WatchlistEntry } from './instrument'

/**
 * Eine Zeile der Ein-Seiten-Zusammenfassung: juengste berichtete Periode
 * je Watchlist-Titel. Rohwerte, ohne Formatierung, damit PDF und HTML
 * dieselbe Quelle haben.
 */
export type ReportGap = 'none' | 'no_sec' | 'no_periods'

export interface ReportBrief {
  ticker: string
  name: string
  venue: WatchlistEntry['venue']
  periodLabel: string | null
  form: string | null
  periodEnd: string | null
  currency: string | null
  revenue: number | null
  revenueYoYPct: number | null
  netIncome: number | null
  netIncomeYoYPct: number | null
  epsDiluted: number | null
  gap: ReportGap
}

export interface ReportBriefInput {
  entry: Pick<WatchlistEntry, 'ticker' | 'name' | 'venue' | 'expectedCoverage'>
  fundamentals: FundamentalsSummary | null
}

export function reportGapFor(input: ReportBriefInput): ReportGap {
  if (input.fundamentals !== null && input.fundamentals.latest !== null) return 'none'
  if (input.entry.expectedCoverage === 'none') return 'no_sec'
  return 'no_periods'
}

export function buildReportBrief(input: ReportBriefInput): ReportBrief {
  const latest = input.fundamentals?.latest ?? null
  const gap = reportGapFor(input)
  return {
    ticker: input.entry.ticker,
    name: input.entry.name,
    venue: input.entry.venue,
    periodLabel: latest?.period.label ?? null,
    form: latest?.period.form ?? null,
    periodEnd: latest?.period.periodEnd ?? null,
    currency: latest?.period.currency ?? input.fundamentals?.currency ?? null,
    revenue: latest?.period.revenue ?? null,
    revenueYoYPct: latest?.revenueYoYPct ?? null,
    netIncome: latest?.period.netIncome ?? null,
    netIncomeYoYPct: latest?.netIncomeYoYPct ?? null,
    epsDiluted: latest?.period.epsDiluted ?? null,
    gap,
  }
}

export function buildReportBriefs(inputs: readonly ReportBriefInput[]): ReportBrief[] {
  return inputs.map(buildReportBrief)
}

export const GAP_LABEL: Record<Exclude<ReportGap, 'none'>, string> = {
  no_sec: 'nicht bei der SEC',
  no_periods: 'keine Perioden',
}
