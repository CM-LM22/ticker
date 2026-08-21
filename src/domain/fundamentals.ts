/**
 * Zahlen aus den Geschaeftsberichten, normalisiert und vergleichbar
 * gemacht. Rein, ohne I/O. Woher die Perioden stammen, entscheidet der
 * Adapter; hier interessiert nur, was sie im Vergleich bedeuten.
 */

export type PeriodFrame = 'quarter' | 'year'

export interface ReportedPeriod {
  /** Lesbare Bezeichnung, z. B. "Q2 2026" oder "GJ 2025". */
  label: string
  /** Stichtag der Periode, YYYY-MM-DD. */
  periodEnd: string
  periodStart: string | null
  frame: PeriodFrame
  /** Formular, aus dem die Zahl stammt. */
  form: string
  revenue: number | null
  netIncome: number | null
  epsDiluted: number | null
  currency: string
  filedAt: string
  accessionNumber: string | null
  sourceUrl: string | null
}

export interface PeriodComparison {
  period: ReportedPeriod
  /** Vergleichsperiode des Vorjahres, falls vorhanden. */
  yearAgo: ReportedPeriod | null
  revenueYoYPct: number | null
  netIncomeYoYPct: number | null
  netMarginPct: number | null
  /** Veraenderung der Nettomarge in Prozentpunkten. */
  marginDeltaPp: number | null
}

export interface FundamentalsSummary {
  ticker: string
  currency: string | null
  /** Neueste zuerst. */
  periods: readonly ReportedPeriod[]
  latest: PeriodComparison | null
  latestYear: PeriodComparison | null
  warnings: readonly string[]
}

const DAY_MS = 86_400_000
/** Toleranz, mit der eine Vorjahresperiode als vergleichbar gilt. */
const YEAR_TOLERANCE_DAYS = 45

function days(from: string, to: string): number {
  return (new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime()) / DAY_MS
}

function changePct(from: number | null, to: number | null): number | null {
  if (from === null || to === null) return null
  // Bei einem Vorjahresverlust ist eine Prozentangabe bedeutungslos:
  // "plus 300 Prozent" gegenueber minus 10 Millionen sagt nichts aus.
  if (from <= 0) return null
  return ((to - from) / from) * 100
}

/**
 * Vergleichbare Vorjahresperiode: gleicher Zeitraster, Stichtag rund ein
 * Jahr frueher. Ohne die Rasterpruefung vergleicht man ein Quartal mit
 * einem Geschaeftsjahr und bekommt Wachstumsraten von minus 75 Prozent.
 */
export function findYearAgo(
  period: ReportedPeriod,
  candidates: readonly ReportedPeriod[],
): ReportedPeriod | null {
  let best: { period: ReportedPeriod; distance: number } | null = null
  for (const candidate of candidates) {
    if (candidate.frame !== period.frame) continue
    if (candidate.periodEnd >= period.periodEnd) continue
    const distance = Math.abs(days(candidate.periodEnd, period.periodEnd) - 365)
    if (distance > YEAR_TOLERANCE_DAYS) continue
    if (best === null || distance < best.distance) best = { period: candidate, distance }
  }
  return best?.period ?? null
}

export function compare(
  period: ReportedPeriod,
  candidates: readonly ReportedPeriod[],
): PeriodComparison {
  const yearAgo = findYearAgo(period, candidates)
  const netMarginPct =
    period.revenue !== null && period.revenue > 0 && period.netIncome !== null
      ? (period.netIncome / period.revenue) * 100
      : null
  const yearAgoMargin =
    yearAgo?.revenue !== null &&
    yearAgo !== null &&
    yearAgo.revenue !== null &&
    yearAgo.revenue > 0 &&
    yearAgo.netIncome !== null
      ? (yearAgo.netIncome / yearAgo.revenue) * 100
      : null

  return {
    period,
    yearAgo,
    revenueYoYPct: changePct(yearAgo?.revenue ?? null, period.revenue),
    netIncomeYoYPct: changePct(yearAgo?.netIncome ?? null, period.netIncome),
    netMarginPct,
    marginDeltaPp:
      netMarginPct === null || yearAgoMargin === null ? null : netMarginPct - yearAgoMargin,
  }
}

export function summarizeFundamentals(
  ticker: string,
  reported: readonly ReportedPeriod[],
  asOf: Date,
): FundamentalsSummary {
  const periods = [...reported].sort((a, b) => b.periodEnd.localeCompare(a.periodEnd))
  const warnings: string[] = []

  const currencies = new Set(periods.map((period) => period.currency))
  if (currencies.size > 1) {
    warnings.push(`Gemischte Waehrungen: ${[...currencies].join(', ')}. Vergleiche sind unsicher.`)
  }

  const latestPeriod = periods[0] ?? null
  const latestYearPeriod = periods.find((period) => period.frame === 'year') ?? null

  if (latestPeriod !== null) {
    const age = days(latestPeriod.periodEnd, asOf.toISOString().slice(0, 10))
    if (age > 200) {
      warnings.push(`Juengste Periode endete am ${latestPeriod.periodEnd}, das ist lange her.`)
    }
  } else {
    warnings.push('Keine Perioden gefunden.')
  }

  return {
    ticker,
    currency: currencies.size === 1 ? ([...currencies][0] ?? null) : null,
    periods,
    latest: latestPeriod === null ? null : compare(latestPeriod, periods),
    latestYear: latestYearPeriod === null ? null : compare(latestYearPeriod, periods),
    warnings,
  }
}
