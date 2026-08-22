import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { gesamteWatchlist } from '@/data/gesamt-watchlist'
import {
  ladeSucheIndex,
  searchCompanies,
  venueForExchange,
} from '@/providers/sec-suche'

/**
 * Titelsuche fuers Hinzufuegen: fragt das SEC-Verzeichnis (im Speicher
 * gehalten) und sagt je Treffer, ob er schon in der Watchlist steht
 * und ob er hinzufuegbar ist.
 */
export const dynamic = 'force-dynamic'

interface Treffer {
  ticker: string
  name: string
  exchange: string
  imBestand: boolean
  hinzufuegbar: boolean
  grund: string | null
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const q = request.nextUrl.searchParams.get('q')?.trim() ?? ''
  if (q.length < 2) {
    return NextResponse.json({ treffer: [], hinweis: 'Mindestens zwei Zeichen.' })
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
      }
    })
    return NextResponse.json({ treffer, hinweis: null })
  } catch (fehler) {
    console.warn('suche: SEC-Verzeichnis nicht lesbar:', fehler)
    return NextResponse.json(
      { treffer: [], hinweis: 'SEC-Verzeichnis gerade nicht erreichbar.' },
      { status: 502 },
    )
  }
}
