import { describe, expect, it } from 'vitest'
import {
  formatDay,
  normalizeBars,
  shiftMonths,
  summarize52Weeks,
  window52Weeks,
  type PriceBar,
  type PriceSeries,
} from './price-series'
import { syntheticSeries } from '../demo/synthetic'

const asOf = new Date('2026-08-21T00:00:00Z')

function flat(closes: readonly number[], startDay = '2026-08-03'): PriceSeries {
  const start = new Date(`${startDay}T00:00:00Z`)
  const bars: PriceBar[] = closes.map((close, index) => ({
    date: formatDay(new Date(start.getTime() + index * 86_400_000)),
    open: close,
    high: close,
    low: close,
    close,
    volume: 1000,
  }))
  return { ticker: 'TEST', currency: 'EUR', source: 'test', bars }
}

describe('summarize52Weeks', () => {
  const series = syntheticSeries({
    ticker: 'DEMO',
    currency: 'USD',
    start: '2025-01-01',
    days: 600,
    startPrice: 100,
    seed: 7,
  })

  it('wertet nur die letzten 52 Wochen aus', () => {
    const summary = summarize52Weeks(series, asOf)
    expect(summary.bars).toBeLessThan(270)
    expect(summary.bars).toBeGreaterThan(240)
    expect(summary.first.date >= '2025-08-22').toBe(true)
    expect(summary.last.date <= '2026-08-21').toBe(true)
  })

  it('findet Hoch und Tief samt Datum im Fenster', () => {
    const summary = summarize52Weeks(series, asOf)
    expect(summary.high52.value).toBeGreaterThanOrEqual(summary.low52.value)
    const inWindow = series.bars.filter((bar) => bar.date >= summary.first.date)
    expect(summary.high52.value).toBe(Math.max(...inWindow.map((bar) => bar.high)))
    expect(summary.low52.value).toBe(Math.min(...inWindow.map((bar) => bar.low)))
  })

  it('setzt die Position im Jahresband zwischen 0 und 1', () => {
    const summary = summarize52Weeks(series, asOf)
    expect(summary.positionInRange).not.toBeNull()
    expect(summary.positionInRange ?? -1).toBeGreaterThanOrEqual(0)
    expect(summary.positionInRange ?? 2).toBeLessThanOrEqual(1)
  })

  it('meldet den Abstand zum Hoch als Wert kleiner oder gleich null', () => {
    const summary = summarize52Weeks(series, asOf)
    expect(summary.drawdownFromHighPct).toBeLessThanOrEqual(0)
  })

  it('rechnet die Position bei konstantem Kurs nicht durch null', () => {
    const summary = summarize52Weeks(flat([50, 50, 50, 50, 50]), asOf)
    expect(summary.positionInRange).toBeNull()
    expect(summary.drawdownFromHighPct).toBe(0)
  })

  it('gibt Renditen zurueck, deren Historie reicht, und null fuer die uebrigen', () => {
    const short = syntheticSeries({
      ticker: 'KURZ',
      currency: 'EUR',
      start: '2026-06-01',
      days: 80,
      startPrice: 20,
      seed: 3,
    })
    const summary = summarize52Weeks(short, asOf)
    expect(summary.returns['1M']).not.toBeNull()
    expect(summary.returns['12M']).toBeNull()
  })

  it('rechnet die Rendite gegen den letzten Kurs vor dem Stichtag', () => {
    const bars: PriceBar[] = [
      { date: '2026-07-21', open: 100, high: 100, low: 100, close: 100, volume: 1 },
      { date: '2026-08-21', open: 110, high: 110, low: 110, close: 110, volume: 1 },
    ]
    const summary = summarize52Weeks(
      { ticker: 'X', currency: 'EUR', source: 'test', bars },
      asOf,
    )
    expect(summary.returns['1M']).toBeCloseTo(10, 6)
  })

  it('liefert gleitende Durchschnitte erst ab ausreichender Historie', () => {
    const summary = summarize52Weeks(series, asOf)
    expect(summary.sma50).not.toBeNull()
    expect(summary.sma200).not.toBeNull()

    const short = summarize52Weeks(flat([10, 11, 12]), asOf)
    expect(short.sma50).toBeNull()
    expect(short.sma200).toBeNull()
  })

  it('warnt bei duenner Historie, statt sie zu verschweigen', () => {
    const summary = summarize52Weeks(flat([10, 11, 12]), asOf)
    expect(summary.warnings.join(' ')).toContain('Handelstage')
  })

  it('warnt bei veralteten Kursen', () => {
    const summary = summarize52Weeks(flat([10, 11, 12], '2026-01-05'), asOf)
    expect(summary.warnings.join(' ')).toContain('aelter als eine Woche')
  })

  it('warnt bei groesseren Luecken in der Reihe', () => {
    const bars: PriceBar[] = [
      { date: '2026-06-01', open: 10, high: 10, low: 10, close: 10, volume: 1 },
      { date: '2026-08-20', open: 12, high: 12, low: 12, close: 12, volume: 1 },
    ]
    const summary = summarize52Weeks({ ticker: 'X', currency: 'EUR', source: 't', bars }, asOf)
    expect(summary.warnings.join(' ')).toContain('Luecke')
  })

  it('wehrt sich gegen ein leeres Fenster, statt Zahlen zu erfinden', () => {
    const stale = flat([10, 11], '2024-01-02')
    expect(() => summarize52Weeks(stale, asOf)).toThrow(/Keine Kurse/)
  })
})

describe('window52Weeks', () => {
  it('schneidet auch nach oben ab, nicht nur nach unten', () => {
    // Reihen koennen Kurse nach dem Stichtag enthalten, etwa weil eine
    // Auswertung von gestern gegen die Datei von heute laeuft. Ohne die
    // obere Grenze zeichnet der Chart Kurse, die die Kennzahlen daneben
    // gar nicht kennen.
    const bars: PriceBar[] = [
      { date: '2026-08-20', open: 10, high: 10, low: 10, close: 10, volume: null },
      { date: '2026-08-21', open: 11, high: 11, low: 11, close: 11, volume: null },
      { date: '2026-08-28', open: 12, high: 12, low: 12, close: 12, volume: null },
    ]
    const windowed = window52Weeks({ ticker: 'X', currency: 'EUR', source: 't', bars }, asOf)
    expect(windowed.map((bar) => bar.date)).toEqual(['2026-08-20', '2026-08-21'])
  })

  it('liefert genau die Balken, auf denen die Auswertung beruht', () => {
    const series = syntheticSeries({
      ticker: 'DEMO',
      currency: 'USD',
      start: '2025-01-01',
      days: 760,
      startPrice: 100,
      seed: 11,
    })
    const windowed = window52Weeks(series, asOf)
    const summary = summarize52Weeks(series, asOf)
    expect(windowed).toHaveLength(summary.bars)
    expect(windowed[windowed.length - 1]?.date).toBe(summary.last.date)
  })
})

describe('normalizeBars', () => {
  it('sortiert aufsteigend und entfernt Doppel', () => {
    const bars: PriceBar[] = [
      { date: '2026-08-03', open: 1, high: 1, low: 1, close: 1, volume: null },
      { date: '2026-08-01', open: 2, high: 2, low: 2, close: 2, volume: null },
      { date: '2026-08-03', open: 3, high: 3, low: 3, close: 3, volume: null },
    ]
    const normalized = normalizeBars(bars)
    expect(normalized.map((bar) => bar.date)).toEqual(['2026-08-01', '2026-08-03'])
    expect(normalized[1]?.close).toBe(3)
  })
})

describe('shiftMonths', () => {
  it('laeuft nicht in den Folgemonat ueber', () => {
    expect(formatDay(shiftMonths(new Date('2026-03-31T00:00:00Z'), -1))).toBe('2026-02-28')
  })

  it('trifft Schaltjahre', () => {
    expect(formatDay(shiftMonths(new Date('2024-03-31T00:00:00Z'), -1))).toBe('2024-02-29')
  })
})
