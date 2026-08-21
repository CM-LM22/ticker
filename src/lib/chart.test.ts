import { describe, expect, it } from 'vitest'
import { buildChart } from './chart'
import type { PriceBar } from '../domain/price-series'

function bar(date: string, close: number): PriceBar {
  return { date, open: close, high: close, low: close, close, volume: null }
}

const bars = [bar('2026-08-19', 100), bar('2026-08-20', 110), bar('2026-08-21', 105)]

describe('buildChart', () => {
  it('legt den ersten Punkt links und den letzten rechts an', () => {
    const chart = buildChart(bars, { width: 100, height: 50, padding: 5 })
    expect(chart.points[0]?.x).toBe(5)
    expect(chart.points[2]?.x).toBe(95)
  })

  it('zeichnet hohe Kurse weiter oben', () => {
    const chart = buildChart(bars)
    const [low, high] = [chart.points[0], chart.points[1]]
    expect(high?.y ?? 0).toBeLessThan(low?.y ?? 0)
  })

  it('haelt alle Punkte im Zeichenbereich', () => {
    const chart = buildChart(bars, { width: 200, height: 100, padding: 10 })
    for (const point of chart.points) {
      expect(point.y).toBeGreaterThanOrEqual(10)
      expect(point.y).toBeLessThanOrEqual(90)
    }
  })

  it('erzeugt einen geschlossenen Flaechenpfad', () => {
    expect(buildChart(bars).areaPath.endsWith('Z')).toBe(true)
  })

  it('teilt bei waagerechter Reihe nicht durch null', () => {
    const chart = buildChart([bar('2026-08-19', 50), bar('2026-08-20', 50)])
    for (const point of chart.points) expect(Number.isFinite(point.y)).toBe(true)
    expect(chart.max).toBeGreaterThan(chart.min)
  })

  it('setzt einen einzelnen Kurs in die Mitte', () => {
    const chart = buildChart([bar('2026-08-19', 50)], { width: 200 })
    expect(chart.points[0]?.x).toBe(100)
    expect(chart.linePath.startsWith('M')).toBe(true)
  })

  it('wehrt sich gegen eine leere Reihe', () => {
    expect(() => buildChart([])).toThrow(/ohne Kurse/)
  })
})
