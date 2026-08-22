import { describe, expect, it } from 'vitest'
import { SubmissionsSchema, analyseSubmissions } from './submissions'

const cutoff = new Date('2024-08-22T00:00:00Z')

function bauen(
  eintraege: { form: string; filingDate: string; items?: string }[],
): ReturnType<typeof SubmissionsSchema.parse> {
  return SubmissionsSchema.parse({
    cik: 320193,
    name: 'Apple Inc.',
    filings: {
      recent: {
        accessionNumber: eintraege.map((_, i) => `000-${i}`),
        filingDate: eintraege.map((e) => e.filingDate),
        form: eintraege.map((e) => e.form),
        items: eintraege.map((e) => e.items ?? ''),
      },
    },
  })
}

describe('analyseSubmissions', () => {
  it('erkennt einen US-Inlandsemittenten am 8-K mit Item 2.02', () => {
    const analyse = analyseSubmissions(
      bauen([{ form: '8-K', filingDate: '2026-07-30', items: '2.02,9.01' }]),
      cutoff,
    )
    expect(analyse.measured).toBe('sec_domestic')
    expect(analyse.earnings8K).toBe(1)
  })

  it('zaehlt ein 8-K ohne Item 2.02 nicht als Zahlenmeldung', () => {
    const analyse = analyseSubmissions(
      bauen([{ form: '8-K', filingDate: '2026-07-30', items: '5.02' }]),
      cutoff,
    )
    expect(analyse.earnings8K).toBe(0)
    expect(analyse.measured).toBe('none')
  })

  it('erkennt einen Foreign Private Issuer an 6-K und 20-F', () => {
    const analyse = analyseSubmissions(
      bauen([
        { form: '6-K', filingDate: '2026-07-30' },
        { form: '20-F', filingDate: '2026-02-20' },
      ]),
      cutoff,
    )
    expect(analyse.measured).toBe('sec_foreign')
    expect(analyse.counts['6-K']).toBe(1)
  })

  it('zaehlt Nachtraege wie das Original', () => {
    const analyse = analyseSubmissions(
      bauen([{ form: '10-Q/A', filingDate: '2026-07-30' }]),
      cutoff,
    )
    expect(analyse.counts['10-Q']).toBe(1)
  })

  it('ignoriert Einreichungen vor dem Stichtag', () => {
    const analyse = analyseSubmissions(
      bauen([{ form: '10-Q', filingDate: '2020-01-30' }]),
      cutoff,
    )
    expect(analyse.counts['10-Q']).toBe(0)
    expect(analyse.measured).toBe('none')
  })

  it('sammelt die Termine der Zahlenveroeffentlichungen fuer die Schaetzung', () => {
    const analyse = analyseSubmissions(
      bauen([
        { form: '10-Q', filingDate: '2026-07-30' },
        { form: '8-K', filingDate: '2026-07-01', items: '5.02' },
        { form: '10-Q', filingDate: '2026-04-30' },
      ]),
      cutoff,
    )
    // Das 8-K ohne Zahlen darf den Rhythmus nicht verfaelschen.
    expect(analyse.earningsFilingDates).toEqual(['2026-07-30', '2026-04-30'])
  })

  it('merkt an, wenn das Fenster der Schnittstelle nicht weit genug zurueckreicht', () => {
    const analyse = analyseSubmissions(
      bauen([{ form: '10-Q', filingDate: '2026-07-30' }]),
      cutoff,
    )
    expect(analyse.windowTruncated).toBe(true)
  })
})
