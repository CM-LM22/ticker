/**
 * Schaetzt den naechsten Zahlentermin aus dem bisherigen Rhythmus der
 * Einreichungen.
 *
 * Der Grund fuer dieses Modul: ein verlaesslicher Earnings-Kalender ist
 * kostenlos schwer zu bekommen, der Einreichungsverlauf bei EDGAR aber
 * geschenkt. Unternehmen berichten Jahr fuer Jahr zu erstaunlich
 * aehnlichen Kalenderterminen. Das reicht fuer eine Schaetzung mit
 * ausgewiesener Unsicherheit, und eine ausgewiesene Schaetzung ist
 * ehrlicher als ein Termin, der so tut, als sei er bestaetigt.
 */

export type Periodicity = 'quarterly' | 'semiannual' | 'annual' | 'unklar'

export interface EarningsEstimate {
  /** Erwarteter Termin, YYYY-MM-DD. */
  expected: string
  /** Plausibler Korridor um den erwarteten Termin. */
  earliest: string
  latest: string
  periodicity: Periodicity
  /** Anzahl der Termine, auf denen die Schaetzung beruht. */
  basis: number
  /** Median der Abstaende in Tagen. */
  medianGapDays: number
  /**
   * Median des Fehlers, den dieselbe Regel bei den vergangenen Terminen
   * gemacht haette. Selbstgemessen, nicht angenommen.
   */
  medianErrorDays: number | null
  confidence: 'hoch' | 'mittel' | 'niedrig'
}

const DAY_MS = 86_400_000

function toDate(day: string): Date {
  const parsed = new Date(`${day}T00:00:00Z`)
  if (Number.isNaN(parsed.getTime())) throw new Error(`Kein gueltiges Datum: ${day}`)
  return parsed
}

function toDay(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function addDays(day: string, count: number): string {
  return toDay(new Date(toDate(day).getTime() + count * DAY_MS))
}

export function median(values: readonly number[]): number {
  if (values.length === 0) throw new Error('Median einer leeren Liste')
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 1) return sorted[middle] ?? 0
  return ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2
}

export function classifyPeriodicity(medianGapDays: number): Periodicity {
  if (medianGapDays >= 75 && medianGapDays <= 110) return 'quarterly'
  if (medianGapDays >= 150 && medianGapDays <= 210) return 'semiannual'
  if (medianGapDays >= 330 && medianGapDays <= 400) return 'annual'
  return 'unklar'
}

/** Wie viele Termine ein Jahr umfasst. */
function periodsPerYear(periodicity: Periodicity): number | null {
  switch (periodicity) {
    case 'quarterly':
      return 4
    case 'semiannual':
      return 2
    case 'annual':
      return 1
    case 'unklar':
      return null
  }
}

/**
 * @param filingDates Termine vergangener Zahlenveroeffentlichungen,
 *   beliebige Reihenfolge, YYYY-MM-DD.
 * @returns null, wenn zu wenige Termine fuer eine belastbare Aussage
 *   vorliegen. Lieber nichts sagen als raten.
 */
export function estimateNextEarnings(
  filingDates: readonly string[],
  asOf: Date,
): EarningsEstimate | null {
  const dates = [...new Set(filingDates)].sort()
  if (dates.length < 4) return null

  const gaps: number[] = []
  for (let i = 1; i < dates.length; i += 1) {
    const previous = dates[i - 1]
    const current = dates[i]
    if (previous === undefined || current === undefined) continue
    gaps.push((toDate(current).getTime() - toDate(previous).getTime()) / DAY_MS)
  }
  if (gaps.length === 0) return null

  const medianGapDays = median(gaps)
  const periodicity = classifyPeriodicity(medianGapDays)
  const perYear = periodsPerYear(periodicity)

  const last = dates[dates.length - 1]
  if (last === undefined) return null

  /**
   * Bevorzugt wird der Kalendertermin des Vorjahres plus ein Jahr:
   * Unternehmen halten ihren Jahresrhythmus praeziser ein als den
   * Abstand von Quartal zu Quartal, der um Feiertage und Jahresabschluss
   * herum ausfranst. Fehlt die Vorjahreshistorie, bleibt der Median.
   */
  const predictFrom = (index: number): string | null => {
    if (perYear !== null) {
      const anchor = dates[index - perYear + 1]
      if (anchor !== undefined) return addDays(anchor, 365)
    }
    const previous = dates[index]
    return previous === undefined ? null : addDays(previous, Math.round(medianGapDays))
  }

  // Selbstpruefung: dieselbe Regel rueckwirkend auf die bekannten
  // Termine anwenden und den Fehler messen.
  const errors: number[] = []
  for (let i = 1; i < dates.length; i += 1) {
    const predicted = predictFrom(i - 1)
    const actual = dates[i]
    if (predicted === null || actual === undefined) continue
    errors.push(Math.abs((toDate(actual).getTime() - toDate(predicted).getTime()) / DAY_MS))
  }
  const medianErrorDays = errors.length === 0 ? null : median(errors)

  let expected = predictFrom(dates.length - 1)
  if (expected === null) return null
  // Liegt die Historie brach, den Termin nach vorne rollen, statt einen
  // Termin in der Vergangenheit als "naechsten" auszugeben.
  const step = Math.round(medianGapDays)
  let guard = 0
  while (toDate(expected).getTime() < asOf.getTime() && step > 0 && guard < 40) {
    expected = addDays(expected, step)
    guard += 1
  }

  const spread = Math.max(3, Math.round(medianErrorDays ?? 14))
  const confidence: EarningsEstimate['confidence'] =
    medianErrorDays === null || periodicity === 'unklar'
      ? 'niedrig'
      : medianErrorDays <= 7
        ? 'hoch'
        : medianErrorDays <= 21
          ? 'mittel'
          : 'niedrig'

  return {
    expected,
    earliest: addDays(expected, -spread),
    latest: addDays(expected, spread),
    periodicity,
    basis: dates.length,
    medianGapDays,
    medianErrorDays,
    confidence,
  }
}
