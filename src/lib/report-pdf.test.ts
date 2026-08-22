import { describe, expect, it } from 'vitest'
import { buildDemoTitles, DEMO_AS_OF } from '../demo/demo-data'
import { buildReportBriefs } from '../domain/report-brief'
import type { ReportBriefInput } from '../domain/report-brief'
import { summarizeFundamentals } from '../domain/fundamentals'
import type { ReportedPeriod } from '../domain/fundamentals'
import { pdfAsString } from './pdf'
import { renderReportPdf } from './report-pdf'

function period(): ReportedPeriod {
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
    accessionNumber: null,
    sourceUrl: null,
  }
}

const inputs: ReportBriefInput[] = [
  {
    entry: { ticker: 'AAPL', name: 'Apple Inc.', venue: 'NASDAQ', expectedCoverage: 'sec_domestic' },
    fundamentals: summarizeFundamentals('AAPL', [period()], new Date('2026-08-21T00:00:00Z')),
  },
  {
    entry: { ticker: 'SIE', name: 'Siemens AG', venue: 'XETRA', expectedCoverage: 'none' },
    fundamentals: null,
  },
]

describe('renderReportPdf', () => {
  const bytes = renderReportPdf({
    briefs: buildReportBriefs(inputs),
    asOf: new Date('2026-08-21T00:00:00Z'),
    isDemo: false,
    source: 'SEC XBRL',
  })
  const raw = pdfAsString(bytes)

  it('bleibt eine Seite', () => {
    expect(raw).toContain('/Count 1')
  })

  it('nimmt gemessene Zahlen und Luecken auf dieselbe Seite', () => {
    expect(raw).toContain('(AAPL)')
    expect(raw).toContain('(SIE)')
    expect(raw).toContain('(nicht bei der SEC)')
    expect(raw).toContain('(Q2 2026)')
  })

  it('traegt den Disclaimer', () => {
    expect(raw).toContain('Keine Anlageberatung')
  })
})

describe('Watchlist auf einer Seite', () => {
  it('nimmt alle 40 Titel in ein einseitiges PDF', () => {
    const titles = buildDemoTitles()
    const bytes = renderReportPdf({
      briefs: buildReportBriefs(titles),
      asOf: DEMO_AS_OF,
      isDemo: true,
      source: 'synthetisch',
    })
    const all = pdfAsString(bytes)
    expect(all).toContain('/Count 1')
    expect(all).toContain('(AAPL)')
    expect(all).toContain('(ENR)')
    expect(all).toContain('(nicht bei der SEC)')
  })
})
