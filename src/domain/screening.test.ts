import { describe, expect, it } from 'vitest'
import { linearScore, rank, screen } from './screening'
import type { ScreenInput } from './screening'
import type { PriceSummary } from './price-series'
import type { FundamentalsSummary } from './fundamentals'

function priceSummary(overrides: Partial<PriceSummary> = {}): PriceSummary {
  const bar = { date: '2026-08-21', open: 100, high: 100, low: 100, close: 120, volume: 1 }
  return {
    ticker: 'TEST',
    currency: 'USD',
    last: bar,
    first: bar,
    bars: 250,
    high52: { value: 130, date: '2026-05-01' },
    low52: { value: 80, date: '2025-10-01' },
    positionInRange: 0.8,
    drawdownFromHighPct: -7.7,
    returns: { '1M': 2, '3M': 5, '6M': 12, '12M': 25 },
    sma50: 115,
    sma200: 100,
    volatilityPct: 28,
    warnings: [],
    ...overrides,
  }
}

function fundamentals(overrides: Partial<FundamentalsSummary> = {}): FundamentalsSummary {
  const period = {
    label: 'Q2 2026',
    periodEnd: '2026-06-30',
    periodStart: null,
    frame: 'quarter' as const,
    form: '10-Q',
    revenue: 1200,
    netIncome: 180,
    epsDiluted: 1.2,
    currency: 'USD',
    filedAt: '2026-07-30',
    accessionNumber: null,
    sourceUrl: null,
  }
  return {
    ticker: 'TEST',
    currency: 'USD',
    periods: [period],
    latest: {
      period,
      yearAgo: null,
      revenueYoYPct: 15,
      netIncomeYoYPct: 30,
      netMarginPct: 15,
      marginDeltaPp: 2,
    },
    latestYear: null,
    warnings: [],
    ...overrides,
  }
}

const full: ScreenInput = {
  ticker: 'TEST',
  name: 'Test AG',
  price: priceSummary(),
  fundamentals: fundamentals(),
}

describe('screen', () => {
  it('vergibt eine Punktzahl zwischen 0 und 100', () => {
    const result = screen(full)
    expect(result.score).not.toBeNull()
    expect(result.score ?? -1).toBeGreaterThanOrEqual(0)
    expect(result.score ?? 101).toBeLessThanOrEqual(100)
    expect(result.coverage).toBe(1)
  })

  it('zeigt jedes Signal mit Rohwert und Begruendung', () => {
    const result = screen(full)
    for (const signal of result.signals) {
      expect(signal.rationale.length).toBeGreaterThan(10)
      expect(signal.display.length).toBeGreaterThan(0)
    }
  })

  it('laesst Einordnungssignale ohne Gewicht aus der Summe heraus', () => {
    const result = screen(full)
    const informational = result.signals.filter((signal) => signal.weight === 0)
    expect(informational.map((signal) => signal.key)).toContain('positionInRange')
    for (const signal of informational) expect(signal.score).toBeNull()
  })

  it('wertet fehlende Daten nicht als schlechte Daten', () => {
    const withPriceOnly = screen({ ...full, fundamentals: null })
    const withEverything = screen(full)
    expect(withPriceOnly.coverage).toBeCloseTo(4 / 9, 6)
    // Ohne Bilanzzahlen faellt die Punktzahl nicht automatisch ab, sie
    // beruht nur auf weniger Signalen. Das steht in coverage.
    expect(withPriceOnly.score).not.toBeNull()
    expect(withPriceOnly.missing).toContain('Nettomarge')
    expect(withEverything.missing).toHaveLength(0)
  })

  it('verweigert eine Punktzahl bei zu duenner Datenlage', () => {
    const result = screen({ ...full, price: null, fundamentals: null })
    expect(result.score).toBeNull()
    expect(result.coverage).toBe(0)
  })

  it('bewertet ein starkes Profil hoeher als ein schwaches', () => {
    const weak = screen({
      ...full,
      ticker: 'WEAK',
      price: priceSummary({
        returns: { '1M': -3, '3M': -8, '6M': -15, '12M': -25 },
        sma200: 150,
        volatilityPct: 55,
      }),
      fundamentals: fundamentals({
        latest: {
          period: fundamentals().periods[0] ?? {
            label: '',
            periodEnd: '',
            periodStart: null,
            frame: 'quarter',
            form: '',
            revenue: null,
            netIncome: null,
            epsDiluted: null,
            currency: 'USD',
            filedAt: '',
            accessionNumber: null,
            sourceUrl: null,
          },
          yearAgo: null,
          revenueYoYPct: -8,
          netIncomeYoYPct: -40,
          netMarginPct: 1,
          marginDeltaPp: -5,
        },
      }),
    })
    expect(screen(full).score ?? 0).toBeGreaterThan(weak.score ?? 100)
  })
})

describe('rank', () => {
  it('sortiert absteigend und stellt Titel ohne Punktzahl hinten an', () => {
    const results = [
      screen({ ...full, ticker: 'LEER', price: null, fundamentals: null }),
      screen({ ...full, ticker: 'GUT' }),
      screen({
        ...full,
        ticker: 'MITTEL',
        price: priceSummary({ returns: { '1M': 0, '3M': 0, '6M': 0, '12M': 0 } }),
      }),
    ]
    expect(rank(results).map((result) => result.ticker)).toEqual(['GUT', 'MITTEL', 'LEER'])
  })
})

describe('linearScore', () => {
  it('kappt an beiden Enden', () => {
    expect(linearScore(-50, -20, 40)).toBe(0)
    expect(linearScore(100, -20, 40)).toBe(1)
    expect(linearScore(10, -20, 40)).toBeCloseTo(0.5, 6)
  })

  it('dreht die Skala, wenn niedrig besser ist', () => {
    expect(linearScore(15, 60, 15)).toBe(1)
    expect(linearScore(60, 60, 15)).toBe(0)
  })
})
