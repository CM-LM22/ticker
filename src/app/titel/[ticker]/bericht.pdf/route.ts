import { NextResponse } from 'next/server'
import { loadTitleData } from '@/data/load'
import { hasDatabase, istTabelleFehlt } from '@/db/client'
import { loadTrendOverview, readBerichtAuszug } from '@/db/repository'
import type { TrendPair } from '@/db/repository'
import { window52Weeks } from '@/domain/price-series'
import { buildStockBrief } from '@/domain/stock-brief'
import { renderStockPdf } from '@/lib/stock-pdf'

export const dynamic = 'force-dynamic'

/** MD&A-Auszug des Titels, tolerant gegen fehlende Tabellen. */
async function ladeAuszug(
  ticker: string,
): Promise<{ text: string; dokumentUrl: string; periodEnd: string } | null> {
  if (!hasDatabase()) return null
  try {
    const auszug = await readBerichtAuszug(ticker)
    if (auszug === null) return null
    return { text: auszug.auszug, dokumentUrl: auszug.dokumentUrl, periodEnd: auszug.periodEnd }
  } catch (fehler) {
    if (!istTabelleFehlt(fehler)) {
      console.warn(`bericht.pdf ${ticker}: Auszug nicht lesbar:`, fehler)
    }
    return null
  }
}

/** Konsenspaar des Titels, tolerant gegen fehlende Tabellen. */
async function ladeKonsens(ticker: string): Promise<TrendPair | null> {
  if (!hasDatabase()) return null
  try {
    return (await loadTrendOverview()).get(ticker) ?? null
  } catch (fehler) {
    if (istTabelleFehlt(fehler)) return null
    console.warn(`bericht.pdf ${ticker}: Konsens nicht lesbar:`, fehler)
    return null
  }
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ ticker: string }> },
): Promise<NextResponse> {
  const { ticker } = await context.params
  const data = await loadTitleData()
  const title = data.titles.find(
    (candidate) => candidate.entry.ticker.toLowerCase() === ticker.toLowerCase(),
  )
  if (title === undefined) {
    return NextResponse.json({ fehler: `Unbekannter Titel: ${ticker}` }, { status: 404 })
  }

  const [konsens, auszug] = await Promise.all([
    ladeKonsens(title.entry.ticker),
    ladeAuszug(title.entry.ticker),
  ])
  const brief = buildStockBrief({
    entry: title.entry,
    price: title.price,
    fundamentals: title.fundamentals,
    earnings: title.earnings,
    screen: title.screen,
    konsensAktuell: konsens?.aktuell ?? null,
    konsensVormonat: konsens?.vormonat ?? null,
  })
  const bars = title.series === null ? [] : window52Weeks(title.series, data.asOf)
  const bytes = renderStockPdf({ brief, bars, asOf: data.asOf, isDemo: data.isDemo, auszug })

  return new NextResponse(Buffer.from(bytes), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${title.entry.ticker.toLowerCase()}-bericht.pdf"`,
      'Cache-Control': 'private, max-age=300',
    },
  })
}
