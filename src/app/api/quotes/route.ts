import { NextResponse } from 'next/server'
import { WATCHLIST } from '@/config/watchlist'
import {
  fetchFinnhubJson,
  finnhubSymbolFor,
  parseQuote,
  quoteUrl,
} from '@/providers/finnhub'
import type { LiveQuote } from '@/providers/finnhub'

/**
 * Aktuelle Kurse fuer die Watchlist, nahezu in Echtzeit.
 *
 * Quelle ist Finnhub (60 Abrufe je Minute im Gratis-Tarif), und zwar
 * nur fuer US-notierte Titel; mehr gibt es kostenlos nicht. Die
 * Antwort wird eine Minute im Speicher gehalten: zehn offene Browser
 * duerfen nicht zehnmal das Minutenbudget ausgeben.
 *
 * Ohne Schluessel antwortet der Endpunkt ehrlich mit einem Hinweis
 * statt mit leeren Zahlen; die Oberflaeche zeigt dann die
 * gespeicherten Schlusskurse.
 */
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const CACHE_TTL_MS = 60_000

interface QuotesAntwort {
  fetchedAt: string
  quotes: LiveQuote[]
  fehlend: string[]
  hinweis: string | null
}

let cache: { antwort: QuotesAntwort; zeit: number } | null = null
let laufend: Promise<QuotesAntwort> | null = null

async function holeAlle(apiKey: string): Promise<QuotesAntwort> {
  const quotes: LiveQuote[] = []
  const fehlend: string[] = []

  // Nacheinander, nicht parallel: 24 gleichzeitige Abrufe sehen fuer
  // ein Ratenlimit aus wie ein Angriff. Sequenziell dauert es wenige
  // Sekunden und bleibt weit unter 60 je Minute.
  for (const entry of WATCHLIST) {
    const symbol = finnhubSymbolFor(entry)
    if (symbol === null) {
      fehlend.push(entry.ticker)
      continue
    }
    try {
      quotes.push(parseQuote(await fetchFinnhubJson(quoteUrl(symbol, apiKey)), entry.ticker, symbol))
    } catch {
      fehlend.push(entry.ticker)
    }
  }

  return {
    fetchedAt: new Date().toISOString(),
    quotes,
    fehlend,
    hinweis:
      quotes.length === 0
        ? 'Keine Live-Kurse erhalten. Schluessel pruefen, siehe /diagnose.'
        : null,
  }
}

export async function GET(): Promise<NextResponse> {
  const apiKey = process.env['FINNHUB_API_KEY']?.trim() ?? ''
  if (apiKey.length === 0) {
    return NextResponse.json({
      fetchedAt: new Date().toISOString(),
      quotes: [],
      fehlend: WATCHLIST.map((entry) => entry.ticker),
      hinweis: 'FINNHUB_API_KEY fehlt. Live-Kurse brauchen einen kostenlosen Finnhub-Schluessel.',
    } satisfies QuotesAntwort)
  }

  if (cache !== null && Date.now() - cache.zeit < CACHE_TTL_MS) {
    return NextResponse.json(cache.antwort)
  }

  // Ein laufender Abruf wird geteilt, nicht dupliziert: kommen zwei
  // Browser gleichzeitig, zahlt nur einer auf das Minutenbudget ein.
  laufend ??= holeAlle(apiKey).finally(() => {
    laufend = null
  })
  const antwort = await laufend
  cache = { antwort, zeit: Date.now() }
  return NextResponse.json(antwort)
}
