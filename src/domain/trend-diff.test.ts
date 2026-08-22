import { describe, expect, it } from 'vitest'
import { trendActionId, trendToAction } from './trend-diff'
import type { RecommendationTrend } from '../providers/finnhub'

const august: RecommendationTrend = {
  ticker: 'AAPL',
  period: '2026-08',
  strongBuy: 12,
  buy: 18,
  hold: 10,
  sell: 2,
  strongSell: 1,
}

describe('trendToAction', () => {
  it('meldet nichts, wenn sich nichts veraendert hat', () => {
    expect(trendToAction({ ...august }, august)).toBeNull()
  })

  it('erkennt eine Verschiebung Richtung Kauf als Heraufstufung', () => {
    const vorher = { ...august, buy: 15, hold: 13 }
    const action = trendToAction(vorher, august)
    expect(action).toMatchObject({ action: 'upgrade', firm: 'Analystenkonsens' })
    expect(action?.gradeFrom).toContain('Kauf 27')
    expect(action?.gradeTo).toContain('Kauf 30')
  })

  it('erkennt eine Verschiebung Richtung Verkauf als Herabstufung', () => {
    const nachher = { ...august, buy: 14, sell: 6 }
    expect(trendToAction(august, nachher)?.action).toBe('downgrade')
  })

  it('meldet einen neuen Monat auch ohne Vergleichsstand', () => {
    const action = trendToAction(null, august)
    expect(action).toMatchObject({ action: 'change', gradeFrom: null })
  })

  it('gibt demselben Stand dieselbe ID und einem anderen eine andere', () => {
    // Ueber die ID prallt derselbe Stand am Unique-Index ab; eine echte
    // Verschiebung im selben Monat bekommt eine neue ID und wird gemeldet.
    expect(trendActionId(august)).toBe(trendActionId({ ...august }))
    expect(trendActionId({ ...august, buy: 19 })).not.toBe(trendActionId(august))
  })

  it('haengt die Meldung an den Monatsanfang', () => {
    expect(trendToAction(null, august)?.occurredAt.toISOString()).toBe('2026-08-01T00:00:00.000Z')
  })
})
