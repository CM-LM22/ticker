import { describe, expect, it } from 'vitest'
import { compare, findYearAgo, summarizeFundamentals } from './fundamentals'
import type { ReportedPeriod } from './fundamentals'

const asOf = new Date('2026-08-21T00:00:00Z')

function period(overrides: Partial<ReportedPeriod> & { periodEnd: string }): ReportedPeriod {
  return {
    label: overrides.periodEnd,
    periodStart: null,
    frame: 'quarter',
    form: '10-Q',
    revenue: 1000,
    netIncome: 100,
    epsDiluted: 1,
    currency: 'USD',
    filedAt: overrides.periodEnd,
    accessionNumber: null,
    sourceUrl: null,
    ...overrides,
  }
}

describe('findYearAgo', () => {
  const current = period({ periodEnd: '2026-06-30' })

  it('findet die Vorjahresperiode mit gleichem Raster', () => {
    const found = findYearAgo(current, [current, period({ periodEnd: '2025-06-30' })])
    expect(found?.periodEnd).toBe('2025-06-30')
  })

  it('vergleicht kein Quartal mit einem Geschaeftsjahr', () => {
    const yearly = period({ periodEnd: '2025-06-30', frame: 'year', form: '10-K' })
    expect(findYearAgo(current, [current, yearly])).toBeNull()
  })

  it('nimmt einen leicht verschobenen Stichtag an', () => {
    const found = findYearAgo(current, [current, period({ periodEnd: '2025-07-04' })])
    expect(found?.periodEnd).toBe('2025-07-04')
  })

  it('weist einen Stichtag ausserhalb der Toleranz zurueck', () => {
    expect(findYearAgo(current, [current, period({ periodEnd: '2025-01-31' })])).toBeNull()
  })

  it('nimmt bei mehreren Kandidaten den naechstgelegenen', () => {
    const found = findYearAgo(current, [
      current,
      period({ periodEnd: '2025-05-31' }),
      period({ periodEnd: '2025-06-28' }),
    ])
    expect(found?.periodEnd).toBe('2025-06-28')
  })
})

describe('compare', () => {
  it('rechnet Wachstum und Marge', () => {
    const current = period({ periodEnd: '2026-06-30', revenue: 1200, netIncome: 180 })
    const previous = period({ periodEnd: '2025-06-30', revenue: 1000, netIncome: 100 })
    const result = compare(current, [current, previous])
    expect(result.revenueYoYPct).toBeCloseTo(20, 6)
    expect(result.netIncomeYoYPct).toBeCloseTo(80, 6)
    expect(result.netMarginPct).toBeCloseTo(15, 6)
    expect(result.marginDeltaPp).toBeCloseTo(5, 6)
  })

  it('verweigert eine Wachstumsrate gegen einen Vorjahresverlust', () => {
    const current = period({ periodEnd: '2026-06-30', netIncome: 50 })
    const previous = period({ periodEnd: '2025-06-30', netIncome: -20 })
    // "plus 350 Prozent" gegenueber einem Verlust waere eine Scheinzahl.
    expect(compare(current, [current, previous]).netIncomeYoYPct).toBeNull()
  })

  it('kommt ohne Vorjahresperiode aus', () => {
    const current = period({ periodEnd: '2026-06-30' })
    const result = compare(current, [current])
    expect(result.yearAgo).toBeNull()
    expect(result.revenueYoYPct).toBeNull()
    expect(result.netMarginPct).toBeCloseTo(10, 6)
  })

  it('rechnet die Marge nicht bei fehlendem Umsatz', () => {
    const current = period({ periodEnd: '2026-06-30', revenue: null })
    expect(compare(current, [current]).netMarginPct).toBeNull()
  })
})

describe('summarizeFundamentals', () => {
  const periods = [
    period({ periodEnd: '2025-06-30', revenue: 1000, netIncome: 100 }),
    period({ periodEnd: '2026-06-30', revenue: 1200, netIncome: 180 }),
    period({ periodEnd: '2025-12-31', frame: 'year', form: '10-K', revenue: 4200, netIncome: 500 }),
    period({ periodEnd: '2024-12-31', frame: 'year', form: '10-K', revenue: 3800, netIncome: 400 }),
  ]

  it('sortiert neueste Periode nach vorn', () => {
    const summary = summarizeFundamentals('TEST', periods, asOf)
    expect(summary.periods[0]?.periodEnd).toBe('2026-06-30')
    expect(summary.latest?.period.periodEnd).toBe('2026-06-30')
  })

  it('haelt das juengste Geschaeftsjahr getrennt bereit', () => {
    const summary = summarizeFundamentals('TEST', periods, asOf)
    expect(summary.latestYear?.period.periodEnd).toBe('2025-12-31')
    expect(summary.latestYear?.revenueYoYPct).toBeCloseTo((4200 / 3800 - 1) * 100, 6)
  })

  it('warnt bei gemischten Waehrungen', () => {
    const mixed = [...periods, period({ periodEnd: '2023-06-30', currency: 'EUR' })]
    const summary = summarizeFundamentals('TEST', mixed, asOf)
    expect(summary.currency).toBeNull()
    expect(summary.warnings.join(' ')).toContain('Gemischte Waehrungen')
  })

  it('warnt bei veralteten Zahlen', () => {
    const old = [period({ periodEnd: '2025-01-31' }), period({ periodEnd: '2024-01-31' })]
    expect(summarizeFundamentals('TEST', old, asOf).warnings.join(' ')).toContain('lange her')
  })

  it('kommt mit einer leeren Liste zurecht', () => {
    const summary = summarizeFundamentals('TEST', [], asOf)
    expect(summary.latest).toBeNull()
    expect(summary.warnings.join(' ')).toContain('Keine Perioden')
  })
})
