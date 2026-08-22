import { z } from 'zod'
import type { Venue, WatchlistEntry } from '../domain/instrument'
import { ProviderError } from './types'
import type { ProviderCapabilities } from './types'

/**
 * Finnhub, Gratis-Tarif mit Schluessel: 60 Abrufe je Minute.
 *
 * Zwei Endpunkte werden genutzt:
 * - /quote fuer aktuelle Kurse (US-Titel, nahezu Echtzeit)
 * - /stock/recommendation fuer den Analystenkonsens als Monatsstand
 *
 * Beides gilt nur fuer US-notierte Titel. XETRA-Titel ohne US-Notierung
 * bleiben aussen vor; das ist die gemessene Grenze der Gratisquellen,
 * keine Nachlaessigkeit.
 */
export const FINNHUB_CAPABILITIES: ProviderCapabilities = {
  id: 'finnhub',
  kind: 'ratings',
  coversUsListings: true,
  coversNonUsListings: false,
  requiresApiKey: true,
  rateLimit: { requests: 60, perSeconds: 60 },
  monthlyQuota: null,
  costEurPerMonth: 0,
  evidence: 'vendor_claim',
  verifiedAt: null,
}

/**
 * US-Kuerzel fuer einen Watchlist-Eintrag, null wenn es keines gibt.
 * XETRA-Titel laufen ueber ihren US-Hinweis (DBK -> DB), sonst gar nicht.
 */
export function finnhubSymbolFor(
  entry: Pick<WatchlistEntry, 'ticker' | 'venue' | 'secTickerHint'>,
): string | null {
  const venue: Venue = entry.venue
  if (venue === 'XETRA') return entry.secTickerHint ?? null
  return entry.ticker
}

const QuoteSchema = z.object({
  c: z.number(),
  d: z.number().nullable(),
  dp: z.number().nullable(),
  pc: z.number(),
  t: z.number(),
})

export interface LiveQuote {
  ticker: string
  symbol: string
  price: number
  change: number | null
  changePct: number | null
  previousClose: number
  /** Unix-Sekunden des letzten Handels laut Quelle. */
  tradedAt: number
  currency: 'USD'
}

export function quoteUrl(symbol: string, apiKey: string): string {
  return `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${apiKey}`
}

export function parseQuote(raw: unknown, ticker: string, symbol: string): LiveQuote {
  const parsed = QuoteSchema.safeParse(raw)
  if (!parsed.success) {
    throw new ProviderError(FINNHUB_CAPABILITIES.id, `${symbol}: unerwartete Antwort`, false)
  }
  // Unbekannte Kuerzel beantwortet Finnhub nicht mit einem Fehler,
  // sondern mit lauter Nullen. Eine Null als Kurs zu speichern waere
  // schlimmer als keine.
  if (parsed.data.c === 0 && parsed.data.t === 0) {
    throw new ProviderError(FINNHUB_CAPABILITIES.id, `${symbol}: unbekanntes Kuerzel`, false)
  }
  return {
    ticker,
    symbol,
    price: parsed.data.c,
    change: parsed.data.d,
    changePct: parsed.data.dp,
    previousClose: parsed.data.pc,
    tradedAt: parsed.data.t,
    currency: 'USD',
  }
}

const TrendRowSchema = z.object({
  period: z.string().regex(/^\d{4}-\d{2}/),
  strongBuy: z.number(),
  buy: z.number(),
  hold: z.number(),
  sell: z.number(),
  strongSell: z.number(),
})

export interface RecommendationTrend {
  ticker: string
  /** Monat, YYYY-MM. */
  period: string
  strongBuy: number
  buy: number
  hold: number
  sell: number
  strongSell: number
}

export function recommendationUrl(symbol: string, apiKey: string): string {
  return `https://finnhub.io/api/v1/stock/recommendation?symbol=${encodeURIComponent(symbol)}&token=${apiKey}`
}

/** Neueste zuerst, so liefert es die Quelle. Leer heisst: keine Abdeckung. */
export function parseRecommendationTrends(raw: unknown, ticker: string): RecommendationTrend[] {
  if (!Array.isArray(raw)) {
    throw new ProviderError(FINNHUB_CAPABILITIES.id, `${ticker}: unerwartete Antwort`, false)
  }
  const trends: RecommendationTrend[] = []
  for (const kandidat of raw) {
    const parsed = TrendRowSchema.safeParse(kandidat)
    if (!parsed.success) continue
    trends.push({
      ticker,
      period: parsed.data.period.slice(0, 7),
      strongBuy: parsed.data.strongBuy,
      buy: parsed.data.buy,
      hold: parsed.data.hold,
      sell: parsed.data.sell,
      strongSell: parsed.data.strongSell,
    })
  }
  return trends
}

export async function fetchFinnhubJson(url: string): Promise<unknown> {
  const antwort = await fetch(url, { headers: { Accept: 'application/json' } })
  if (antwort.status === 429) {
    throw new ProviderError(FINNHUB_CAPABILITIES.id, 'Minutenlimit erreicht', true)
  }
  if (antwort.status === 401 || antwort.status === 403) {
    throw new ProviderError(FINNHUB_CAPABILITIES.id, `Schluessel abgelehnt (HTTP ${antwort.status})`, false)
  }
  if (!antwort.ok) {
    throw new ProviderError(
      FINNHUB_CAPABILITIES.id,
      `HTTP ${antwort.status}`,
      antwort.status >= 500,
    )
  }
  return antwort.json()
}
