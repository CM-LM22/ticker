/** Anzeigeformate. Rein, damit sie testbar bleiben. */

const DE = 'de-DE'

export function formatNumber(value: number, digits = 2): string {
  return new Intl.NumberFormat(DE, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value)
}

export function formatPrice(value: number, currency: string): string {
  return `${formatNumber(value, 2)} ${currency}`
}

export function formatPercent(value: number | null, digits = 1): string {
  if (value === null || !Number.isFinite(value)) return '—'
  return `${value >= 0 ? '+' : '−'}${formatNumber(Math.abs(value), digits)} %`
}

/** Grosse Betraege gekuerzt: 94.000.000.000 wird zu "94,0 Mrd.". */
export function formatCompact(value: number | null, currency?: string | null): string {
  if (value === null || !Number.isFinite(value)) return '—'
  const sign = value < 0 ? '−' : ''
  const abs = Math.abs(value)
  const suffix = currency == null || currency.length === 0 ? '' : ` ${currency}`

  if (abs >= 1e12) return `${sign}${formatNumber(abs / 1e12, 2)} Bio.${suffix}`
  if (abs >= 1e9) return `${sign}${formatNumber(abs / 1e9, 2)} Mrd.${suffix}`
  if (abs >= 1e6) return `${sign}${formatNumber(abs / 1e6, 1)} Mio.${suffix}`
  if (abs >= 1e3) return `${sign}${formatNumber(abs / 1e3, 1)} Tsd.${suffix}`
  return `${sign}${formatNumber(abs, 0)}${suffix}`
}

/** YYYY-MM-DD wird zu DD.MM.YYYY. */
export function formatDay(day: string | null): string {
  if (day === null || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return '—'
  const [year, month, date] = day.split('-')
  return `${date}.${month}.${year}`
}

export function formatDayShort(day: string): string {
  const [year, month, date] = day.split('-')
  return `${date}.${month}.${(year ?? '').slice(2)}`
}

/** Tage bis zu einem Datum, negativ fuer vergangene. */
export function daysUntil(day: string, asOf: Date): number {
  return Math.round(
    (new Date(`${day}T00:00:00Z`).getTime() - asOf.getTime()) / 86_400_000,
  )
}

export function formatDaysUntil(day: string, asOf: Date): string {
  const delta = daysUntil(day, asOf)
  if (delta === 0) return 'heute'
  if (delta === 1) return 'morgen'
  if (delta > 0) return `in ${delta} Tagen`
  return `vor ${Math.abs(delta)} Tagen`
}
