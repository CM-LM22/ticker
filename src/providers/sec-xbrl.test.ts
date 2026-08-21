import { describe, expect, it } from 'vitest'
import { CompanyFactsSchema, extractPeriods, frameOf, periodLabel } from './sec-xbrl'

/** Kleiner, aber im Aufbau echter Ausschnitt einer companyfacts-Antwort. */
const facts = CompanyFactsSchema.parse({
  cik: 320193,
  entityName: 'Apple Inc.',
  facts: {
    'us-gaap': {
      RevenueFromContractWithCustomerExcludingAssessedTax: {
        units: {
          USD: [
            // Quartal
            {
              start: '2026-03-29',
              end: '2026-06-27',
              val: 94_000_000_000,
              accn: '0000320193-26-000073',
              fy: 2026,
              fp: 'Q3',
              form: '10-Q',
              filed: '2026-07-30',
            },
            // Dieselbe Periode, frueher eingereicht und spaeter korrigiert
            {
              start: '2026-03-29',
              end: '2026-06-27',
              val: 93_000_000_000,
              accn: '0000320193-26-000050',
              fy: 2026,
              fp: 'Q3',
              form: '10-Q',
              filed: '2026-07-01',
            },
            // Vorjahresquartal
            {
              start: '2025-03-30',
              end: '2025-06-28',
              val: 85_000_000_000,
              accn: '0000320193-25-000070',
              fy: 2025,
              fp: 'Q3',
              form: '10-Q',
              filed: '2025-08-01',
            },
            // Kumulierter Neunmonatswert: darf nicht als Quartal durchgehen
            {
              start: '2025-09-29',
              end: '2026-06-27',
              val: 290_000_000_000,
              accn: '0000320193-26-000073',
              fy: 2026,
              fp: 'Q3',
              form: '10-Q',
              filed: '2026-07-30',
            },
            // Geschaeftsjahr
            {
              start: '2024-09-29',
              end: '2025-09-27',
              val: 400_000_000_000,
              accn: '0000320193-25-000100',
              fy: 2025,
              fp: 'FY',
              form: '10-K',
              filed: '2025-10-30',
            },
            // Aus einem Formular, das uns nicht interessiert
            {
              start: '2026-03-29',
              end: '2026-06-27',
              val: 1,
              form: 'S-1',
              filed: '2026-07-30',
            },
          ],
        },
      },
      NetIncomeLoss: {
        units: {
          USD: [
            {
              start: '2026-03-29',
              end: '2026-06-27',
              val: 24_000_000_000,
              fy: 2026,
              fp: 'Q3',
              form: '10-Q',
              filed: '2026-07-30',
            },
            {
              start: '2025-03-30',
              end: '2025-06-28',
              val: 21_000_000_000,
              fy: 2025,
              fp: 'Q3',
              form: '10-Q',
              filed: '2025-08-01',
            },
          ],
        },
      },
      EarningsPerShareDiluted: {
        units: {
          'USD/shares': [
            {
              start: '2026-03-29',
              end: '2026-06-27',
              val: 1.62,
              fy: 2026,
              fp: 'Q3',
              form: '10-Q',
              filed: '2026-07-30',
            },
          ],
        },
      },
    },
  },
})

describe('extractPeriods', () => {
  const periods = extractPeriods(facts)

  it('sortiert neueste Periode nach vorn', () => {
    expect(periods[0]?.periodEnd).toBe('2026-06-27')
  })

  it('nimmt bei mehrfach gemeldeter Periode die zuletzt eingereichte Zahl', () => {
    expect(periods[0]?.revenue).toBe(94_000_000_000)
  })

  it('haelt kumulierte Neunmonatswerte aus den Quartalen heraus', () => {
    // Ohne diese Pruefung stuende hier ein Quartalsumsatz von 290 Mrd.
    expect(periods.some((period) => period.revenue === 290_000_000_000)).toBe(false)
  })

  it('ignoriert Formulare ausserhalb der Berichterstattung', () => {
    expect(periods.some((period) => period.form === 'S-1')).toBe(false)
  })

  it('verbindet Umsatz, Ergebnis und Ergebnis je Aktie derselben Periode', () => {
    expect(periods[0]).toMatchObject({
      revenue: 94_000_000_000,
      netIncome: 24_000_000_000,
      epsDiluted: 1.62,
      currency: 'USD',
      form: '10-Q',
      frame: 'quarter',
    })
  })

  it('erkennt das Geschaeftsjahr als eigenes Raster', () => {
    const year = periods.find((period) => period.frame === 'year')
    expect(year).toMatchObject({ label: 'GJ 2025', form: '10-K', revenue: 400_000_000_000 })
  })

  it('behaelt die Vorjahresperiode fuer den Vergleich', () => {
    expect(periods.some((period) => period.periodEnd === '2025-06-28')).toBe(true)
  })

  it('verlinkt auf die Quelle', () => {
    expect(periods[0]?.sourceUrl).toBe(
      'https://www.sec.gov/Archives/edgar/data/320193/000032019326000073/',
    )
  })
})

describe('frameOf', () => {
  const base = { end: '2026-06-27', val: 1, form: '10-Q', filed: '2026-07-30' }

  it('erkennt Quartal und Geschaeftsjahr an der Dauer', () => {
    expect(frameOf({ ...base, start: '2026-03-29' })).toBe('quarter')
    expect(frameOf({ ...base, start: '2025-06-28' })).toBe('year')
  })

  it('lehnt Halbjahres- und Neunmonatswerte ab', () => {
    expect(frameOf({ ...base, start: '2025-12-28' })).toBeNull()
    expect(frameOf({ ...base, start: '2025-09-29' })).toBeNull()
  })

  it('lehnt Stichtagswerte ohne Zeitraum ab', () => {
    expect(frameOf(base)).toBeNull()
  })
})

describe('periodLabel', () => {
  const base = { end: '2026-06-27', val: 1, form: '10-Q', filed: '2026-07-30' }

  it('beschriftet aus Geschaeftsjahr und Periode', () => {
    expect(periodLabel({ ...base, fy: 2026, fp: 'Q3' }, 'quarter')).toBe('Q3 2026')
    expect(periodLabel({ ...base, fy: 2025, fp: 'FY' }, 'year')).toBe('GJ 2025')
  })

  it('faellt auf den Stichtag zurueck, wenn die Angaben fehlen', () => {
    expect(periodLabel(base, 'quarter')).toBe('Quartal bis 2026-06-27')
  })
})
