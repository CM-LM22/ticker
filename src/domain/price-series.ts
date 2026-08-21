/**
 * Kursreihen und ihre Auswertung. Rein, ohne I/O, ohne Uhr: der
 * Stichtag kommt als Parameter herein, damit dieselbe Reihe morgen
 * dasselbe Ergebnis liefert wie heute.
 */

export interface PriceBar {
  /** Handelstag als YYYY-MM-DD. */
  date: string
  open: number
  high: number
  low: number
  close: number
  volume: number | null
}

export interface PriceSeries {
  ticker: string
  currency: string
  source: string
  /** Aufsteigend nach Datum, ohne Duplikate. */
  bars: readonly PriceBar[]
}

export type ReturnWindow = '1M' | '3M' | '6M' | '12M'

export const RETURN_WINDOWS: readonly ReturnWindow[] = ['1M', '3M', '6M', '12M']

const WINDOW_MONTHS: Record<ReturnWindow, number> = { '1M': 1, '3M': 3, '6M': 6, '12M': 12 }

export interface Extreme {
  value: number
  date: string
}

export interface PriceSummary {
  ticker: string
  currency: string
  /** Letzter Schlusskurs im Fenster. */
  last: PriceBar
  first: PriceBar
  bars: number
  high52: Extreme
  low52: Extreme
  /** 0 am Jahrestief, 1 am Jahreshoch. Null, wenn Hoch und Tief gleich sind. */
  positionInRange: number | null
  /** Abstand zum Jahreshoch in Prozent, immer <= 0. */
  drawdownFromHighPct: number
  returns: Record<ReturnWindow, number | null>
  sma50: number | null
  sma200: number | null
  /** Annualisierte Schwankung aus Tagesrenditen, in Prozent. */
  volatilityPct: number | null
  /**
   * Auffaelligkeiten, die das Ergebnis nicht ungueltig machen, aber die
   * Interpretation begrenzen. Werden in der Oberflaeche angezeigt.
   */
  warnings: readonly string[]
}

const DAY_MS = 86_400_000
/** 52 Wochen. */
export const WINDOW_DAYS = 364

export function parseDay(day: string): Date {
  const parsed = new Date(`${day}T00:00:00Z`)
  if (Number.isNaN(parsed.getTime())) throw new Error(`Kein gueltiges Datum: ${day}`)
  return parsed
}

export function formatDay(date: Date): string {
  return date.toISOString().slice(0, 10)
}

/** Monatsarithmetik ohne Ueberlauf: 31.03. minus ein Monat ist der 28./29.02. */
export function shiftMonths(date: Date, months: number): Date {
  const year = date.getUTCFullYear()
  const month = date.getUTCMonth()
  const day = date.getUTCDate()
  const target = new Date(Date.UTC(year, month + months, 1))
  const lastDayOfTarget = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate()
  target.setUTCDate(Math.min(day, lastDayOfTarget))
  return target
}

function mean(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function simpleMovingAverage(bars: readonly PriceBar[], length: number): number | null {
  if (bars.length < length) return null
  const window = bars.slice(bars.length - length)
  return mean(window.map((bar) => bar.close))
}

function annualizedVolatilityPct(bars: readonly PriceBar[]): number | null {
  if (bars.length < 20) return null
  const logReturns: number[] = []
  for (let i = 1; i < bars.length; i += 1) {
    const previous = bars[i - 1]
    const current = bars[i]
    if (previous === undefined || current === undefined) continue
    if (previous.close <= 0 || current.close <= 0) continue
    logReturns.push(Math.log(current.close / previous.close))
  }
  if (logReturns.length < 20) return null
  const average = mean(logReturns)
  const variance =
    logReturns.reduce((sum, value) => sum + (value - average) ** 2, 0) / (logReturns.length - 1)
  return Math.sqrt(variance) * Math.sqrt(252) * 100
}

/** Letzter Balken am oder vor dem Stichtag. Null, wenn die Historie nicht reicht. */
function barAtOrBefore(bars: readonly PriceBar[], target: Date): PriceBar | null {
  let found: PriceBar | null = null
  for (const bar of bars) {
    if (parseDay(bar.date).getTime() <= target.getTime()) found = bar
    else break
  }
  return found
}

function largestGapDays(bars: readonly PriceBar[]): number {
  let largest = 0
  for (let i = 1; i < bars.length; i += 1) {
    const previous = bars[i - 1]
    const current = bars[i]
    if (previous === undefined || current === undefined) continue
    const gap = (parseDay(current.date).getTime() - parseDay(previous.date).getTime()) / DAY_MS
    if (gap > largest) largest = gap
  }
  return largest
}

/** Aufsteigend sortiert, Duplikate entfernt. Der spaetere Eintrag gewinnt. */
export function normalizeBars(bars: readonly PriceBar[]): PriceBar[] {
  const byDate = new Map<string, PriceBar>()
  for (const bar of bars) byDate.set(bar.date, bar)
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date))
}

/**
 * Die Balken des 52-Wochen-Fensters. Oeffentlich, damit der Chart
 * garantiert dasselbe Fenster zeichnet, das ausgewertet wurde: sonst
 * reicht die Kurve ueber den Stichtag hinaus, sobald die Reihe
 * spaetere Kurse enthaelt.
 */
export function window52Weeks(series: PriceSeries, asOf: Date): PriceBar[] {
  const windowStart = new Date(asOf.getTime() - WINDOW_DAYS * DAY_MS)
  return normalizeBars(series.bars).filter((bar) => {
    const time = parseDay(bar.date).getTime()
    return time >= windowStart.getTime() && time <= asOf.getTime()
  })
}

/**
 * Wertet die letzten 52 Wochen aus.
 *
 * Wirft, wenn im Fenster kein einziger Handelstag liegt. Das ist kein
 * Randfall, den man wegdefiniert: eine Reihe ohne Kurse auszuwerten und
 * dabei Zahlen zurueckzugeben, waere die gefaehrlichere Variante.
 */
export function summarize52Weeks(series: PriceSeries, asOf: Date): PriceSummary {
  const all = normalizeBars(series.bars)
  const bars = window52Weeks(series, asOf)

  const last = bars[bars.length - 1]
  const first = bars[0]
  if (last === undefined || first === undefined) {
    throw new Error(`Keine Kurse fuer ${series.ticker} im Fenster bis ${formatDay(asOf)}`)
  }

  let high52: Extreme = { value: first.high, date: first.date }
  let low52: Extreme = { value: first.low, date: first.date }
  for (const bar of bars) {
    if (bar.high > high52.value) high52 = { value: bar.high, date: bar.date }
    if (bar.low < low52.value) low52 = { value: bar.low, date: bar.date }
  }

  const span = high52.value - low52.value
  const positionInRange = span === 0 ? null : (last.close - low52.value) / span

  const returns = Object.fromEntries(
    RETURN_WINDOWS.map((window) => {
      const reference = barAtOrBefore(all, shiftMonths(asOf, -WINDOW_MONTHS[window]))
      if (reference === null || reference.close <= 0 || reference.date === last.date) {
        return [window, null]
      }
      return [window, ((last.close - reference.close) / reference.close) * 100]
    }),
  ) as Record<ReturnWindow, number | null>

  const warnings: string[] = []
  if (bars.length < 200) warnings.push(`Nur ${bars.length} Handelstage im Fenster.`)
  const gap = largestGapDays(bars)
  if (gap > 10) warnings.push(`Groesste Luecke ${Math.round(gap)} Tage.`)
  if (parseDay(last.date).getTime() < asOf.getTime() - 7 * DAY_MS) {
    warnings.push(`Letzter Kurs vom ${last.date}, aelter als eine Woche.`)
  }

  return {
    ticker: series.ticker,
    currency: series.currency,
    last,
    first,
    bars: bars.length,
    high52,
    low52,
    positionInRange,
    drawdownFromHighPct: ((last.close - high52.value) / high52.value) * 100,
    returns,
    sma50: simpleMovingAverage(all, 50),
    sma200: simpleMovingAverage(all, 200),
    volatilityPct: annualizedVolatilityPct(bars),
    warnings,
  }
}
