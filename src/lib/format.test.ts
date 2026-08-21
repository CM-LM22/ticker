import { describe, expect, it } from 'vitest'
import {
  daysUntil,
  formatCompact,
  formatDay,
  formatDaysUntil,
  formatPercent,
  formatPrice,
} from './format'

const asOf = new Date('2026-08-21T00:00:00Z')

describe('formatPercent', () => {
  it('setzt ein Vorzeichen und ein deutsches Dezimalkomma', () => {
    expect(formatPercent(12.345)).toBe('+12,3 %')
    expect(formatPercent(-4)).toBe('−4,0 %')
  })

  it('zeigt fehlende Werte als Strich, nicht als Null', () => {
    expect(formatPercent(null)).toBe('—')
    expect(formatPercent(Number.NaN)).toBe('—')
  })
})

describe('formatCompact', () => {
  it('kuerzt grosse Betraege', () => {
    expect(formatCompact(94_000_000_000, 'USD')).toBe('94,00 Mrd. USD')
    expect(formatCompact(2_400_000, 'EUR')).toBe('2,4 Mio. EUR')
    expect(formatCompact(-1_500_000_000)).toBe('−1,50 Mrd.')
  })

  it('laesst kleine Betraege in Ruhe', () => {
    expect(formatCompact(842, 'EUR')).toBe('842 EUR')
  })
})

describe('formatPrice', () => {
  it('haengt die Waehrung an', () => {
    expect(formatPrice(229.1, 'USD')).toBe('229,10 USD')
  })
})

describe('formatDay', () => {
  it('dreht das ISO-Datum um', () => {
    expect(formatDay('2026-08-21')).toBe('21.08.2026')
  })

  it('faengt Unsinn ab', () => {
    expect(formatDay(null)).toBe('—')
    expect(formatDay('morgen')).toBe('—')
  })
})

describe('daysUntil', () => {
  it('zaehlt vorwaerts und rueckwaerts', () => {
    expect(daysUntil('2026-08-28', asOf)).toBe(7)
    expect(daysUntil('2026-08-14', asOf)).toBe(-7)
  })

  it('formuliert nahe Termine in Worten', () => {
    expect(formatDaysUntil('2026-08-21', asOf)).toBe('heute')
    expect(formatDaysUntil('2026-08-22', asOf)).toBe('morgen')
    expect(formatDaysUntil('2026-10-30', asOf)).toBe('in 70 Tagen')
    expect(formatDaysUntil('2026-08-11', asOf)).toBe('vor 10 Tagen')
  })
})
