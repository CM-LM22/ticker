import { describe, expect, it } from 'vitest'
import { classifyPeriodicity, estimateNextEarnings, median } from './earnings-estimate'

const asOf = new Date('2026-08-21T00:00:00Z')

/** Quartalsrhythmus, wie ihn ein US-Inlandsemittent tatsaechlich faehrt. */
const quarterly = [
  '2024-02-01',
  '2024-05-02',
  '2024-08-01',
  '2024-10-31',
  '2025-01-30',
  '2025-05-01',
  '2025-07-31',
  '2025-10-30',
  '2026-01-29',
  '2026-04-30',
  '2026-07-30',
]

describe('estimateNextEarnings', () => {
  it('schweigt bei zu duenner Historie, statt zu raten', () => {
    expect(estimateNextEarnings(['2026-01-29', '2026-04-30', '2026-07-30'], asOf)).toBeNull()
    expect(estimateNextEarnings([], asOf)).toBeNull()
  })

  it('erkennt den Quartalsrhythmus', () => {
    const estimate = estimateNextEarnings(quarterly, asOf)
    expect(estimate?.periodicity).toBe('quarterly')
    expect(estimate?.basis).toBe(quarterly.length)
  })

  it('rechnet den Vorjahrestermin fort, nicht den letzten Abstand', () => {
    const estimate = estimateNextEarnings(quarterly, asOf)
    // Q4 wurde im Vorjahr am 30.10. gemeldet, ein Jahr spaeter also wieder.
    expect(estimate?.expected).toBe('2026-10-30')
  })

  it('weist einen Korridor aus und nicht nur einen Punkt', () => {
    const estimate = estimateNextEarnings(quarterly, asOf)
    expect(estimate?.earliest).not.toBeUndefined()
    expect((estimate?.earliest ?? '') < (estimate?.expected ?? '')).toBe(true)
    expect((estimate?.latest ?? '') > (estimate?.expected ?? '')).toBe(true)
  })

  it('misst die eigene Treffsicherheit an der Vergangenheit', () => {
    const estimate = estimateNextEarnings(quarterly, asOf)
    expect(estimate?.medianErrorDays).not.toBeNull()
    expect(estimate?.medianErrorDays ?? 99).toBeLessThan(7)
    expect(estimate?.confidence).toBe('hoch')
  })

  it('stuft unregelmaessige Termine als unsicher ein', () => {
    const erratic = ['2024-01-10', '2024-06-02', '2025-02-20', '2025-09-14', '2026-03-01']
    const estimate = estimateNextEarnings(erratic, asOf)
    expect(estimate?.confidence).toBe('niedrig')
  })

  it('erkennt einen Halbjahresrhythmus', () => {
    const semiannual = [
      '2023-03-15',
      '2023-09-14',
      '2024-03-13',
      '2024-09-12',
      '2025-03-12',
      '2025-09-11',
      '2026-03-11',
    ]
    expect(estimateNextEarnings(semiannual, asOf)?.periodicity).toBe('semiannual')
  })

  it('gibt niemals einen Termin in der Vergangenheit als naechsten aus', () => {
    const stale = ['2023-02-01', '2023-05-02', '2023-08-01', '2023-10-31', '2024-01-30']
    const estimate = estimateNextEarnings(stale, asOf)
    expect(estimate).not.toBeNull()
    expect((estimate?.expected ?? '') >= '2026-08-21').toBe(true)
  })

  it('ist gegen doppelte und unsortierte Eingaben unempfindlich', () => {
    const shuffled = [...quarterly].reverse().concat(quarterly[0] ?? '')
    expect(estimateNextEarnings(shuffled, asOf)?.expected).toBe('2026-10-30')
  })
})

describe('classifyPeriodicity', () => {
  it('ordnet die ueblichen Rhythmen zu', () => {
    expect(classifyPeriodicity(91)).toBe('quarterly')
    expect(classifyPeriodicity(182)).toBe('semiannual')
    expect(classifyPeriodicity(365)).toBe('annual')
    expect(classifyPeriodicity(45)).toBe('unklar')
  })
})

describe('median', () => {
  it('rechnet bei gerader Anzahl den Mittelwert der Mitte', () => {
    expect(median([4, 1, 3, 2])).toBe(2.5)
    expect(median([5])).toBe(5)
  })
})
