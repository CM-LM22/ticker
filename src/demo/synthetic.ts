import type { PriceBar, PriceSeries } from '../domain/price-series'

/**
 * Erzeugt reproduzierbare Kursreihen fuer Tests und fuer die
 * Demo-Ansicht. Die Zahlen sind erfunden und sehen nur so aus wie
 * Kurse. Wo sie in der Oberflaeche auftauchen, steht das dabei.
 */
export interface SyntheticOptions {
  ticker: string
  currency: string
  /** Erster Handelstag, YYYY-MM-DD. */
  start: string
  /** Anzahl Kalendertage; Wochenenden werden uebersprungen. */
  days: number
  startPrice: number
  seed: number
  /** Jahresdrift in Prozent. */
  driftPctPerYear?: number
  /** Tagesschwankung in Prozent. */
  dailyVolPct?: number
}

/** Linearer Kongruenzgenerator. Klein, deterministisch, reicht hier voellig. */
function lcg(seed: number): () => number {
  let state = (seed >>> 0) || 1
  return () => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0
    return state / 0x1_0000_0000
  }
}

const DAY_MS = 86_400_000

export function syntheticSeries(options: SyntheticOptions): PriceSeries {
  const random = lcg(options.seed)
  const drift = (options.driftPctPerYear ?? 8) / 100 / 252
  const vol = (options.dailyVolPct ?? 1.4) / 100

  const bars: PriceBar[] = []
  let close = options.startPrice
  let cursor = new Date(`${options.start}T00:00:00Z`)

  for (let i = 0; i < options.days; i += 1) {
    const weekday = cursor.getUTCDay()
    if (weekday !== 0 && weekday !== 6) {
      // Box-Muller waere sauberer; die Summe dreier Gleichverteilungen
      // reicht fuer Demodaten und bleibt lesbar.
      const shock = (random() + random() + random() - 1.5) * 2 * vol
      const open = close
      close = Math.max(1, open * (1 + drift + shock))
      const wiggle = Math.abs(shock) * open * 0.6
      bars.push({
        date: cursor.toISOString().slice(0, 10),
        open: round(open),
        high: round(Math.max(open, close) + wiggle),
        low: round(Math.min(open, close) - wiggle),
        close: round(close),
        volume: Math.round(1_000_000 + random() * 4_000_000),
      })
    }
    cursor = new Date(cursor.getTime() + DAY_MS)
  }

  return { ticker: options.ticker, currency: options.currency, source: 'synthetic', bars }
}

function round(value: number): number {
  return Math.round(value * 100) / 100
}
