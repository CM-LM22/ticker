import { GAP_LABEL } from '../domain/report-brief'
import type { ReportBrief } from '../domain/report-brief'
import { formatCompact, formatDay, formatPercent } from './format'
import {
  A4_PORTRAIT,
  helveticaWidth,
  renderSinglePagePdf,
  truncateToWidth,
} from './pdf'
import type { PdfStroke, PdfText } from './pdf'

export interface ReportPdfInput {
  briefs: readonly ReportBrief[]
  asOf: Date
  isDemo: boolean
  source: string
}

const MARGIN_X = 16
const PAGE_TOP = 818
const COL = {
  ticker: 16,
  name: 48,
  period: 168,
  form: 228,
  revenueRight: 328,
  revYoy: 334,
  incomeRight: 444,
  incYoy: 450,
  epsRight: 538,
} as const

const DISCLAIMER =
  'Keine Anlageberatung, keine Kaufempfehlung. Oeffentlich zugaengliche Unternehmensmeldungen, ohne Gewaehr. Massgeblich ist die Originalquelle.'

function rightAligned(text: string, size: number, right: number, y: number, font: PdfText['font']): PdfText {
  return { x: right - helveticaWidth(text, size), y, size, font, text }
}

function gapNote(brief: ReportBrief): string {
  if (brief.gap === 'none') return ''
  return GAP_LABEL[brief.gap]
}

export function renderReportPdf(input: ReportPdfInput): Uint8Array {
  const texts: PdfText[] = []
  const strokes: PdfStroke[] = []
  const asOfDay = input.asOf.toISOString().slice(0, 10)
  const sourceLine = input.isDemo
    ? 'Demodaten, erkennbar erfunden.'
    : `Quelle ${input.source}. Stand ${formatDay(asOfDay)}.`

  texts.push({ x: MARGIN_X, y: PAGE_TOP, size: 13, font: 'bold', text: 'Ticker — Geschäftsberichte' })
  texts.push({
    x: MARGIN_X,
    y: PAGE_TOP - 14,
    size: 8,
    font: 'regular',
    text: `Letzte berichtete Periode je Watchlist-Titel. ${sourceLine}`,
  })

  const headerY = PAGE_TOP - 34
  const headers: PdfText[] = [
    { x: COL.ticker, y: headerY, size: 7, font: 'bold', text: 'Titel' },
    { x: COL.name, y: headerY, size: 7, font: 'bold', text: 'Name' },
    { x: COL.period, y: headerY, size: 7, font: 'bold', text: 'Periode' },
    { x: COL.form, y: headerY, size: 7, font: 'bold', text: 'Form' },
    rightAligned('Umsatz', 7, COL.revenueRight, headerY, 'bold'),
    { x: COL.revYoy, y: headerY, size: 7, font: 'bold', text: 'Δ U' },
    rightAligned('Ergebnis', 7, COL.incomeRight, headerY, 'bold'),
    { x: COL.incYoy, y: headerY, size: 7, font: 'bold', text: 'Δ E' },
    rightAligned('EPS', 7, COL.epsRight, headerY, 'bold'),
  ]
  texts.push(...headers)
  strokes.push({ x1: MARGIN_X, y1: headerY - 4, x2: 579, y2: headerY - 4 })

  const rowCount = input.briefs.length
  const tableBottom = 36
  const tableTop = headerY - 8
  const rowHeight = rowCount === 0 ? 12 : Math.min(14, (tableTop - tableBottom) / rowCount)
  const fontSize = rowHeight >= 13 ? 7.2 : 6.6

  input.briefs.forEach((brief, index) => {
    const y = tableTop - (index + 1) * rowHeight + 3
    const note = gapNote(brief)
    texts.push({ x: COL.ticker, y, size: fontSize, font: 'bold', text: brief.ticker })
    texts.push({
      x: COL.name,
      y,
      size: fontSize,
      font: 'regular',
      text: truncateToWidth(brief.name, fontSize, COL.period - COL.name - 6),
    })

    if (note.length > 0) {
      texts.push({ x: COL.period, y, size: fontSize, font: 'regular', text: note })
      return
    }

    texts.push({
      x: COL.period,
      y,
      size: fontSize,
      font: 'regular',
      text: brief.periodLabel ?? '—',
    })
    texts.push({ x: COL.form, y, size: fontSize, font: 'regular', text: brief.form ?? '—' })
    texts.push(
        rightAligned(
        formatCompact(brief.revenue, brief.currency),
        fontSize,
        COL.revenueRight,
        y,
        'regular',
      ),
    )
    texts.push({ x: COL.revYoy, y, size: fontSize, font: 'regular', text: formatPercent(brief.revenueYoYPct, 0) })
    texts.push(
        rightAligned(
        formatCompact(brief.netIncome, brief.currency),
        fontSize,
        COL.incomeRight,
        y,
        'regular',
      ),
    )
    texts.push({ x: COL.incYoy, y, size: fontSize, font: 'regular', text: formatPercent(brief.netIncomeYoYPct, 0) })
    texts.push(
      rightAligned(
        brief.epsDiluted === null ? '—' : brief.epsDiluted.toFixed(2).replace('.', ','),
        fontSize,
        COL.epsRight,
        y,
        'regular',
      ),
    )
  })

  strokes.push({ x1: MARGIN_X, y1: 28, x2: 579, y2: 28 })
  texts.push({
    x: MARGIN_X,
    y: 16,
    size: 6,
    font: 'regular',
    text: truncateToWidth(DISCLAIMER, 6, 560),
  })

  return renderSinglePagePdf({
    width: A4_PORTRAIT.width,
    height: A4_PORTRAIT.height,
    texts,
    strokes,
  })
}
