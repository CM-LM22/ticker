import { NextResponse } from 'next/server'
import { WATCHLIST } from '@/config/watchlist'
import { hasDatabase } from '@/db/client'
import { latestCloses } from '@/db/repository'
import {
  fetchFinnhubJson,
  finnhubSymbolFor,
  parseQuote,
  quoteUrl,
} from '@/providers/finnhub'
import type { LiveQuote } from '@/providers/finnhub'
import {
  fetchTradegateQuote,
  quoteIstPlausibel,
  tradegateEligible,
} from '@/providers/tradegate'

/**
 * Aktuelle Kurse fuer die Watchlist, nahezu in Echtzeit.
 *
 * Zwei Quellen: Finnhub fuer US-notierte Titel (braucht einen
 * Schluessel), Tradegate fuer die deutschen (per ISIN, ohne
 * Schluessel). Ein Tradegate-Kurs erscheint nur, wenn er nahe am
 * gespeicherten Tagesschluss liegt — der Wachhund gegen eine falsch
 * zugeordnete ISIN. Ohne Vergleichsbasis lieber kein Kurs als ein
 * falscher.
 *
 * Die Antwort wird eine Minute im Speicher gehalten und ein laufender
 * Abruf zwischen gleichzeitigen Browsern geteilt: zehn offene Tabs
 * zahlen einmal auf die Kontingente ein, nicht zehnmal.
 */
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const CACHE_TTL_MS = 60_000

type AusgehendeQuote = Omit<LiveQuote, 'currency'> & { currency: string }

interface QuotesAntwort {
  fetchedAt: string
  quotes: AusgehendeQuote[]
  fehlend: string[]
  hinweis: string | null
}

let cache: { antwort: QuotesAntwort; zeit: number } | null = null
let laufend: Promise<QuotesAntwort> | null = null

async function holeAlle(finnhubKey: string): Promise<QuotesAntwort> {
  const quotes: AusgehendeQuote[] = []
  const fehlend: string[] = []

  // Vergleichsbasis fuer den Tradegate-Wachhund. Ohne Datenbank gibt es
  // keine, dann werden deutsche Live-Kurse gar nicht erst gezeigt.
  let schluesse = new Map<string, { close: number; currency: string }>()
  if (hasDatabase()) {
    try {
      schluesse = await latestCloses()
    } catch {
      // ohne Basis greift unten schlicht der Verzicht
    }
  }

  // Nacheinander, nicht parallel: Dutzende gleichzeitige Abrufe sehen
  // fuer ein Ratenlimit aus wie ein Angriff. Sequenziell dauert es
  // wenige Sekunden und bleibt weit unter den Grenzen beider Quellen.
  for (const entry of WATCHLIST) {
    const isin = tradegateEligible(entry)
    if (isin !== null) {
      const basis = schluesse.get(entry.ticker)
      if (basis === undefined || basis.currency !== 'EUR') {
        // Kein Euro-Schluss gespeichert: der Wachhund hat nichts zum
        // Vergleichen, also kein Live-Kurs fuer diesen Titel.
        fehlend.push(entry.ticker)
        continue
      }
      try {
        const roh = await fetchTradegateQuote(isin)
        if (!quoteIstPlausibel(roh.last, basis.close)) {
          fehlend.push(entry.ticker)
          continue
        }
        quotes.push({
          ticker: entry.ticker,
          symbol: isin,
          price: roh.last,
          change: null,
          changePct: roh.deltaPct,
          previousClose: basis.close,
          tradedAt: Math.floor(Date.now() / 1000),
          currency: 'EUR',
        })
      } catch {
        fehlend.push(entry.ticker)
      }
      continue
    }

    if (finnhubKey.length === 0) {
      fehlend.push(entry.ticker)
      continue
    }
    const symbol = finnhubSymbolFor(entry)
    if (symbol === null) {
      fehlend.push(entry.ticker)
      continue
    }
    try {
      quotes.push(
        parseQuote(await fetchFinnhubJson(quoteUrl(symbol, finnhubKey)), entry.ticker, symbol),
      )
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
        ? 'Keine Live-Kurse erhalten. Quellen und Schluessel pruefen, siehe /diagnose.'
        : finnhubKey.length === 0
          ? 'US-Titel ohne Live-Kurse: FINNHUB_API_KEY fehlt (kostenlos).'
          : null,
  }
}

export async function GET(): Promise<NextResponse> {
  const finnhubKey = process.env['FINNHUB_API_KEY']?.trim() ?? ''

  if (cache !== null && Date.now() - cache.zeit < CACHE_TTL_MS) {
    return NextResponse.json(cache.antwort)
  }

  // Ein laufender Abruf wird geteilt, nicht dupliziert: kommen zwei
  // Browser gleichzeitig, zahlt nur einer auf die Kontingente ein.
  laufend ??= holeAlle(finnhubKey).finally(() => {
    laufend = null
  })
  const antwort = await laufend
  cache = { antwort, zeit: Date.now() }
  return NextResponse.json(antwort)
}
