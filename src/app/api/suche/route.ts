import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { gesamteWatchlist } from '@/data/gesamt-watchlist'
import { holeXetraTreffer } from '@/providers/alphavantage-suche'
import { holeTradegateTreffer } from '@/providers/tradegate-suche'
import {
  ladeSucheIndex,
  searchCompanies,
  venueForExchange,
} from '@/providers/sec-suche'

/**
 * Titelsuche fuers Hinzufuegen. Standard: das SEC-Verzeichnis fuer
 * US-Titel und die Tradegate-Kurssuche fuer deutsche — beide frei und
 * ohne Abruflimit, deshalb laufen sie automatisch beim Tippen.
 * markt=xetra bleibt als Rueckfall: die Alpha-Vantage-Symbolsuche
 * (kostet einen der 25 Tagesabrufe, nur auf ausdruecklichen Klick).
 * Jeder Treffer sagt, ob er schon in der Watchlist steht.
 */
export const dynamic = 'force-dynamic'

interface Treffer {
  ticker: string
  name: string
  exchange: string
  imBestand: boolean
  hinzufuegbar: boolean
  grund: string | null
  /** Weg des Hinzufuegens: SEC-Verzeichnis oder Tradegate (mit ISIN). */
  markt: 'us' | 'xetra' | 'tradegate'
  isin?: string
}

async function xetraSuche(q: string): Promise<NextResponse> {
  const alpha = process.env['ALPHA_VANTAGE_API_KEY']?.trim() ?? ''
  if (alpha.length === 0) {
    return NextResponse.json(
      { treffer: [], hinweis: 'ALPHA_VANTAGE_API_KEY fehlt, XETRA-Suche nicht moeglich.' },
      { status: 503 },
    )
  }
  try {
    const [xetra, watchlist] = await Promise.all([holeXetraTreffer(q, alpha), gesamteWatchlist()])
    const bestand = new Set(watchlist.map((entry) => entry.ticker))
    const treffer: Treffer[] = xetra.map((eintrag) => {
      const imBestand = bestand.has(eintrag.ticker)
      return {
        ticker: eintrag.ticker,
        name: eintrag.name,
        exchange: 'XETRA',
        imBestand,
        hinzufuegbar: !imBestand,
        grund: imBestand ? 'schon in der Watchlist' : null,
        markt: 'xetra' as const,
      }
    })
    return NextResponse.json({ treffer, hinweis: null })
  } catch (fehler) {
    const text = fehler instanceof Error ? fehler.message : String(fehler)
    console.warn('suche xetra:', text)
    return NextResponse.json(
      { treffer: [], hinweis: `XETRA-Suche: ${text.slice(0, 160)}` },
      { status: 502 },
    )
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const q = request.nextUrl.searchParams.get('q')?.trim() ?? ''
  if (q.length < 2) {
    return NextResponse.json({ treffer: [], hinweis: 'Mindestens zwei Zeichen.' })
  }
  if (request.nextUrl.searchParams.get('markt') === 'xetra') {
    return xetraSuche(q)
  }

  const userAgent = process.env['SEC_USER_AGENT']?.trim() ?? ''
  if (!userAgent.includes('@')) {
    return NextResponse.json(
      { treffer: [], hinweis: 'SEC_USER_AGENT fehlt, Suche nicht moeglich.' },
      { status: 503 },
    )
  }

  try {
    const [index, watchlist] = await Promise.all([ladeSucheIndex(userAgent), gesamteWatchlist()])
    const bestand = new Set(watchlist.map((entry) => entry.ticker))
    const treffer: Treffer[] = searchCompanies(q, index).map((eintrag) => {
      const venue = venueForExchange(eintrag.exchange)
      const imBestand = bestand.has(eintrag.ticker)
      return {
        ticker: eintrag.ticker,
        name: eintrag.name,
        exchange: eintrag.exchange,
        imBestand,
        hinzufuegbar: !imBestand && venue !== null,
        grund: imBestand
          ? 'schon in der Watchlist'
          : venue === null
            ? `Handelsplatz ${eintrag.exchange === '' ? 'unbekannt' : eintrag.exchange} wird nicht unterstuetzt`
            : null,
        markt: 'us' as const,
      }
    })

    // Deutsche Titel von Tradegate, parallel und ohne Limit. Ein
    // Fehlschlag hier laesst die US-Treffer unangetastet.
    let tradegateHinweis: string | null = null
    try {
      const isins = new Set(
        watchlist.flatMap((entry) => (entry.isin === undefined ? [] : [entry.isin])),
      )
      const deutsche = (await holeTradegateTreffer(q)).map((eintrag) => {
        const imBestand = isins.has(eintrag.isin)
        return {
          ticker: eintrag.wkn ?? eintrag.isin,
          name: eintrag.name,
          exchange: 'Tradegate/XETRA',
          imBestand,
          hinzufuegbar: !imBestand,
          grund: imBestand ? 'schon in der Watchlist' : null,
          markt: 'tradegate' as const,
          isin: eintrag.isin,
        }
      })
      treffer.push(...deutsche)
    } catch (fehler) {
      tradegateHinweis = 'Deutsche Suche (Tradegate) gerade nicht erreichbar.'
      console.warn('suche tradegate:', fehler)
    }

    return NextResponse.json({ treffer, hinweis: tradegateHinweis })
  } catch (fehler) {
    console.warn('suche: SEC-Verzeichnis nicht lesbar:', fehler)
    return NextResponse.json(
      { treffer: [], hinweis: 'SEC-Verzeichnis gerade nicht erreichbar.' },
      { status: 502 },
    )
  }
}
