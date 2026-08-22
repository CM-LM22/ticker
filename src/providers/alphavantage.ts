import { z } from 'zod'
import type { PriceSeries } from '../domain/price-series'
import { normalizeBars } from '../domain/price-series'
import type { WatchlistEntry } from '../domain/instrument'
import { ProviderError } from './types'
import type { PriceProvider, PriceRequest, ProviderCapabilities } from './types'

/**
 * Alpha Vantage, Gratis-Tarif mit Schluessel: 25 Abrufe am Tag.
 *
 * Fuer die Gesamtwatchlist war das frueh verworfen worden, und das
 * bleibt richtig: 40 Titel passen nicht in 25 Abrufe. Fuer die
 * DAX-Haelfte allein passt es exakt, und Alpha Vantage ist die einzige
 * gemessen erreichbare Gratisquelle, die XETRA direkt fuehrt
 * (Symbolsuffix .DEX, Kurse in Euro). Die Frische-Regeln sorgen dafuer,
 * dass jeder Titel hoechstens einmal am Tag abgerufen wird.
 *
 * 'vendor_claim', bis die Diagnose den ersten .DEX-Abruf gemessen hat.
 */
export const ALPHAVANTAGE_CAPABILITIES: ProviderCapabilities = {
  id: 'alphavantage',
  kind: 'prices',
  coversUsListings: true,
  coversNonUsListings: true,
  requiresApiKey: true,
  rateLimit: { requests: 5, perSeconds: 60 },
  monthlyQuota: 25 * 30,
  costEurPerMonth: 0,
  evidence: 'vendor_claim',
  verifiedAt: null,
}

/** XETRA-Titel laufen ueber das dokumentierte Suffix .DEX. */
export function alphaVantageSymbol(entry: Pick<WatchlistEntry, 'ticker' | 'venue'>): string {
  return entry.venue === 'XETRA' ? `${entry.ticker.toUpperCase()}.DEX` : entry.ticker.toUpperCase()
}

export function alphaVantageUrl(
  symbol: string,
  apiKey: string,
  outputSize: 'full' | 'compact',
): string {
  const url = new URL('https://www.alphavantage.co/query')
  url.searchParams.set('function', 'TIME_SERIES_DAILY')
  url.searchParams.set('symbol', symbol)
  url.searchParams.set('outputsize', outputSize)
  url.searchParams.set('apikey', apiKey)
  return url.toString()
}

const numeric = z.string().transform((value, ctx) => {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Keine Zahl: ${value}` })
    return z.NEVER
  }
  return parsed
})

const DayEntrySchema = z.object({
  '1. open': numeric,
  '2. high': numeric,
  '3. low': numeric,
  '4. close': numeric,
})

/**
 * Alpha Vantage meldet Grenzen und Fehler mit HTTP 200 und einem
 * Textfeld. "Note" und "Information" heissen: Tageslimit oder
 * Bezahlfunktion. Wer nur den Status prueft, haelt die Absage fuer
 * eine leere Kursreihe.
 */
export function parseAlphaVantageDaily(
  raw: unknown,
  instrument: { ticker: string; currency: string },
): PriceSeries {
  if (typeof raw !== 'object' || raw === null) {
    throw new ProviderError(ALPHAVANTAGE_CAPABILITIES.id, `${instrument.ticker}: unerwartete Antwort`, false)
  }
  const daten = raw as Record<string, unknown>

  const absage = daten['Note'] ?? daten['Information'] ?? daten['Error Message']
  if (typeof absage === 'string') {
    // Das Tageslimit erholt sich erst morgen; heute wiederholen bringt
    // nichts. Deshalb nicht wiederholbar, mit dem Wortlaut als Grund.
    throw new ProviderError(
      ALPHAVANTAGE_CAPABILITIES.id,
      `${instrument.ticker}: ${absage.slice(0, 140)}`,
      false,
    )
  }

  const reihe = daten['Time Series (Daily)']
  if (typeof reihe !== 'object' || reihe === null) {
    throw new ProviderError(ALPHAVANTAGE_CAPABILITIES.id, `${instrument.ticker}: keine Kursreihe`, false)
  }

  const bars = []
  for (const [tag, roh] of Object.entries(reihe as Record<string, unknown>)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(tag)) continue
    const eintrag = DayEntrySchema.safeParse(roh)
    if (!eintrag.success) continue
    bars.push({
      date: tag,
      open: eintrag.data['1. open'],
      high: eintrag.data['2. high'],
      low: eintrag.data['3. low'],
      close: eintrag.data['4. close'],
      volume: null,
    })
  }

  if (bars.length === 0) {
    throw new ProviderError(ALPHAVANTAGE_CAPABILITIES.id, `${instrument.ticker}: keine Kurse`, false)
  }

  return {
    ticker: instrument.ticker,
    currency: instrument.currency,
    source: ALPHAVANTAGE_CAPABILITIES.id,
    bars: normalizeBars(bars),
  }
}

export function symbolSearchUrl(query: string, apiKey: string): string {
  const url = new URL('https://www.alphavantage.co/query')
  url.searchParams.set('function', 'SYMBOL_SEARCH')
  url.searchParams.set('keywords', query)
  url.searchParams.set('apikey', apiKey)
  return url.toString()
}

export interface XetraTreffer {
  /** XETRA-Kuerzel ohne das Suffix .DEX. */
  ticker: string
  name: string
  currency: string
}

/**
 * Aus der Symbolsuche nur die XETRA-Treffer (Suffix .DEX). Absagen
 * kommen auch hier als HTTP 200 mit Textfeld — derselbe Fallstrick
 * wie bei den Kursreihen.
 */
export function parseSymbolSearch(raw: unknown): XetraTreffer[] {
  if (typeof raw !== 'object' || raw === null) {
    throw new ProviderError(ALPHAVANTAGE_CAPABILITIES.id, 'Suche: unerwartete Antwort', false)
  }
  const daten = raw as Record<string, unknown>
  const absage = daten['Note'] ?? daten['Information'] ?? daten['Error Message']
  if (typeof absage === 'string') {
    throw new ProviderError(ALPHAVANTAGE_CAPABILITIES.id, `Suche: ${absage.slice(0, 140)}`, false)
  }

  const matches = daten['bestMatches']
  if (!Array.isArray(matches)) return []

  const treffer: XetraTreffer[] = []
  for (const roh of matches) {
    if (typeof roh !== 'object' || roh === null) continue
    const eintrag = roh as Record<string, unknown>
    const symbol = eintrag['1. symbol']
    const name = eintrag['2. name']
    const currency = eintrag['8. currency']
    if (typeof symbol !== 'string' || !symbol.toUpperCase().endsWith('.DEX')) continue
    if (typeof name !== 'string' || name.length === 0) continue
    treffer.push({
      ticker: symbol.toUpperCase().slice(0, -'.DEX'.length),
      name,
      currency: typeof currency === 'string' ? currency : 'EUR',
    })
  }
  return treffer
}

export class AlphaVantagePriceProvider implements PriceProvider {
  readonly capabilities = ALPHAVANTAGE_CAPABILITIES

  constructor(
    private readonly apiKey: string,
    private readonly outputSize: 'full' | 'compact' = 'compact',
    private readonly fetchJson: (url: string) => Promise<unknown> = defaultFetchJson,
  ) {}

  async fetchDailyHistory(request: PriceRequest): Promise<PriceSeries> {
    if (this.apiKey.length === 0) {
      throw new ProviderError(ALPHAVANTAGE_CAPABILITIES.id, 'ALPHA_VANTAGE_API_KEY fehlt', false)
    }
    const symbol = alphaVantageSymbol(request.instrument)
    const raw = await this.fetchJson(alphaVantageUrl(symbol, this.apiKey, this.outputSize))
    const series = parseAlphaVantageDaily(raw, {
      ticker: request.instrument.ticker,
      currency: request.instrument.venue === 'XETRA' ? 'EUR' : 'USD',
    })
    return { ...series, bars: series.bars.filter((bar) => bar.date >= request.since) }
  }
}

async function defaultFetchJson(url: string): Promise<unknown> {
  const response = await fetch(url, { headers: { Accept: 'application/json' } })
  if (!response.ok) {
    throw new ProviderError(
      ALPHAVANTAGE_CAPABILITIES.id,
      `HTTP ${response.status}`,
      response.status === 429 || response.status >= 500,
    )
  }
  return response.json()
}
