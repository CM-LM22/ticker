import { NextResponse } from 'next/server'
import { loadTitleData } from '@/data/load'
import { hasDatabase, istTabelleFehlt } from '@/db/client'
import { loadActionsForTicker, loadTrendOverview, readBerichtAuszug } from '@/db/repository'
import type { StoredAnalystAction, TrendPair } from '@/db/repository'
import { window52Weeks } from '@/domain/price-series'
import { buildStockBrief } from '@/domain/stock-brief'
import { renderStockPdf } from '@/lib/stock-pdf'

export const dynamic = 'force-dynamic'

/** Berichts-Auszuege des Titels, tolerant gegen fehlende Tabellen. */
async function ladeAuszug(ticker: string): Promise<{
  text: string
  guidance: string | null
  dokumentUrl: string
  periodEnd: string
} | null> {
  if (!hasDatabase()) return null
  try {
    const auszug = await readBerichtAuszug(ticker)
    if (auszug === null) return null
    return {
      text: auszug.auszug,
      guidance: auszug.guidance,
      dokumentUrl: auszug.dokumentUrl,
      periodEnd: auszug.periodEnd,
    }
  } catch (fehler) {
    if (!istTabelleFehlt(fehler)) {
      console.warn(`bericht.pdf ${ticker}: Auszug nicht lesbar:`, fehler)
    }
    return null
  }
}

/** Juengste Konsens-Bewegungen, tolerant gegen fehlende Tabellen. */
async function ladeBewegungen(ticker: string): Promise<StoredAnalystAction[]> {
  if (!hasDatabase()) return []
  try {
    return await loadActionsForTicker(ticker)
  } catch (fehler) {
    if (!istTabelleFehlt(fehler)) {
      console.warn(`bericht.pdf ${ticker}: Bewegungen nicht lesbar:`, fehler)
    }
    return []
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
  request: Request,
  context: { params: Promise<{ ticker: string }> },
): Promise<NextResponse> {
  const { ticker } = await context.params
  // Zurueck-Link im PDF: die Hauptadresse, sonst der aufgerufene Host.
  const produktion = process.env['VERCEL_PROJECT_PRODUCTION_URL']?.trim() ?? ''
  const appUrl = produktion.length > 0 ? `https://${produktion}/` : `${new URL(request.url).origin}/`
  const data = await loadTitleData()
  const title = data.titles.find(
    (candidate) => candidate.entry.ticker.toLowerCase() === ticker.toLowerCase(),
  )
  if (title === undefined) {
    return NextResponse.json({ fehler: `Unbekannter Titel: ${ticker}` }, { status: 404 })
  }

  const [konsens, auszug, aktionen] = await Promise.all([
    ladeKonsens(title.entry.ticker),
    ladeAuszug(title.entry.ticker),
    ladeBewegungen(title.entry.ticker),
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
  const bytes = renderStockPdf({
    brief,
    bars,
    asOf: data.asOf,
    isDemo: data.isDemo,
    auszug,
    aktionen,
    appUrl,
  })

  return new NextResponse(Buffer.from(bytes), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${title.entry.ticker.toLowerCase()}-bericht.pdf"`,
      'Cache-Control': 'private, max-age=300',
    },
  })
}
