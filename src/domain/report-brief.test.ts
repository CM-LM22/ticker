import { describe, expect, it } from 'vitest'
import { summarizeFundamentals } from './fundamentals'
import type { ReportedPeriod } from './fundamentals'
import { buildReportBrief, buildReportBriefs } from './report-brief'
import type { WatchlistEntry } from './instrument'

const apple: WatchlistEntry = {
  ticker: 'AAPL',
  name: 'Apple Inc.',
  venue: 'NASDAQ',
  expectedCoverage: 'sec_domestic',
}

const siemens: WatchlistEntry = {
  ticker: 'SIE',
  name: 'Siemens AG',
  venue: 'XETRA',
  expectedCoverage: 'none',
}

function period(overrides: Partial<ReportedPeriod> = {}): ReportedPeriod {
  return {
    label: 'Q2 2026',
    periodEnd: '2026-06-27',
    periodStart: '2026-03-29',
    frame: 'quarter',
    form: '10-Q',
    revenue: 94_000_000_000,
    netIncome: 23_400_000_000,
    epsDiluted: 1.57,
    currency: 'USD',
    filedAt: '2026-07-31',
    accessionNumber: '0000320193-26-000073',
    sourceUrl: 'https://www.sec.gov/Archives/edgar/data/320193/x.htm',
    ...overrides,
  }
}

describe('buildReportBrief', () => {
  it('nimmt die juengste Periode und den Vorjahresvergleich', () => {
    const fundamentals = summarizeFundamentals(
      'AAPL',
      [period(), period({ label: 'Q2 2025', periodEnd: '2025-06-28', revenue: 85_000_000_000 })],
      new Date('2026-08-21T00:00:00Z'),
    )
    const brief = buildReportBrief({ entry: apple, fundamentals })
    expect(brief).toMatchObject({
      ticker: 'AAPL',
      periodLabel: 'Q2 2026',
      form: '10-Q',
      gap: 'none',
      revenue: 94_000_000_000,
    })
    expect(brief.revenueYoYPct).not.toBeNull()
  })

  it('markiert DAX-Titel ohne SEC als Luecke, nicht als Null', () => {
    const brief = buildReportBrief({ entry: siemens, fundamentals: null })
    expect(brief.gap).toBe('no_sec')
    expect(brief.revenue).toBeNull()
    expect(brief.periodLabel).toBeNull()
  })

  it('markiert SEC-Titel ohne Perioden getrennt', () => {
    const brief = buildReportBrief({ entry: apple, fundamentals: null })
    expect(brief.gap).toBe('no_periods')
  })
})

describe('buildReportBriefs', () => {
  it('erhaelt die Reihenfolge der Watchlist', () => {
    const briefs = buildReportBriefs([
      { entry: apple, fundamentals: null },
      { entry: siemens, fundamentals: null },
    ])
    expect(briefs.map((brief) => brief.ticker)).toEqual(['AAPL', 'SIE'])
  })
})
