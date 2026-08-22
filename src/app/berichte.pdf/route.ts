import { NextResponse } from 'next/server'
import { loadTitleData } from '@/data/load'
import { buildReportBriefs } from '@/domain/report-brief'
import { renderReportPdf } from '@/lib/report-pdf'

export const dynamic = 'force-dynamic'

export async function GET(): Promise<NextResponse> {
  const data = await loadTitleData()
  const bytes = renderReportPdf({
    briefs: buildReportBriefs(data.titles),
    asOf: data.asOf,
    isDemo: data.isDemo,
    source: data.fundamentalsSource,
  })
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'inline; filename="ticker-berichte.pdf"',
      'Cache-Control': 'public, max-age=300',
    },
  })
}
