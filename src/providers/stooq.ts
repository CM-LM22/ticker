import type { PriceBar, PriceSeries } from '../domain/price-series'
import { normalizeBars } from '../domain/price-series'
import type { Venue, WatchlistEntry } from '../domain/instrument'
import { ProviderError } from './types'
import type { PriceProvider, PriceRequest, ProviderCapabilities } from './types'

/**
 * Stooq liefert Tageskurse als CSV, ohne Schluessel und ohne Anmeldung,
 * fuer amerikanische und deutsche Titel.
 *
 * Die Faehigkeiten unten stehen bewusst auf 'vendor_claim': sie sind aus
 * der Dokumentation abgeschrieben und noch nicht nachgemessen. Wie viele
 * unserer 40 Titel Stooq tatsaechlich fuehrt, misst
 * scripts/price-coverage.ts. Erst danach darf hier 'measured' stehen.
 */
export const STOOQ_CAPABILITIES: ProviderCapabilities = {
  id: 'stooq',
  kind: 'prices',
  coversUsListings: true,
  coversNonUsListings: true,
  requiresApiKey: false,
  rateLimit: null,
  monthlyQuota: null,
  costEurPerMonth: 0,
  evidence: 'vendor_claim',
  verifiedAt: null,
}

const SUFFIX_BY_VENUE: Record<Venue, string> = {
  NASDAQ: 'us',
  NYSE: 'us',
  XETRA: 'de',
}

const CURRENCY_BY_VENUE: Record<Venue, string> = {
  NASDAQ: 'USD',
  NYSE: 'USD',
  XETRA: 'EUR',
}

export function stooqSymbol(instrument: Pick<WatchlistEntry, 'ticker' | 'venue'>): string {
  // Stooq schreibt Punkte im Kuerzel als Bindestrich (BRK.B -> brk-b).
  const ticker = instrument.ticker.toLowerCase().replace(/\./g, '-')
  return `${ticker}.${SUFFIX_BY_VENUE[instrument.venue]}`
}

export function stooqCurrency(instrument: Pick<WatchlistEntry, 'venue'>): string {
  return CURRENCY_BY_VENUE[instrument.venue]
}

export function stooqUrl(symbol: string): string {
  return `https://stooq.com/q/d/l/?s=${encodeURIComponent(symbol)}&i=d`
}

const EXPECTED_HEADER = 'date,open,high,low,close,volume'

function parseNumber(raw: string | undefined): number | null {
  if (raw === undefined) return null
  const trimmed = raw.trim()
  if (trimmed === '' || trimmed === 'N/D' || trimmed === '-') return null
  const value = Number(trimmed)
  return Number.isFinite(value) ? value : null
}

/**
 * Zerlegt die CSV-Antwort.
 *
 * Stooq antwortet auf unbekannte Kuerzel und auf ein ueberschrittenes
 * Tageslimit mit HTTP 200 und einer Klartextzeile. Wer nur den Status
 * prueft, haelt "Exceeded the daily hits limit" fuer eine Kursreihe.
 */
export function parseStooqCsv(
  csv: string,
  instrument: { ticker: string; currency: string },
): PriceSeries {
  const lines = csv
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)

  const header = lines[0]
  if (header === undefined || header.toLowerCase() !== EXPECTED_HEADER) {
    throw new ProviderError(
      STOOQ_CAPABILITIES.id,
      `Unerwartete Antwort fuer ${instrument.ticker}: ${(header ?? '(leer)').slice(0, 120)}`,
      // Ein Tageslimit geht vorueber, ein unbekanntes Kuerzel nicht.
      /limit/i.test(header ?? ''),
    )
  }

  const bars: PriceBar[] = []
  const skipped: string[] = []

  for (const line of lines.slice(1)) {
    const cells = line.split(',')
    const date = cells[0]?.trim() ?? ''
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      skipped.push(line.slice(0, 40))
      continue
    }
    const open = parseNumber(cells[1])
    const high = parseNumber(cells[2])
    const low = parseNumber(cells[3])
    const close = parseNumber(cells[4])
    // Ein Tag ohne Schlusskurs ist kein Handelstag, den wir brauchen.
    if (open === null || high === null || low === null || close === null) {
      skipped.push(date)
      continue
    }
    bars.push({ date, open, high, low, close, volume: parseNumber(cells[5]) })
  }

  if (bars.length === 0) {
    throw new ProviderError(
      STOOQ_CAPABILITIES.id,
      `Keine verwertbaren Kurse fuer ${instrument.ticker}`,
      false,
    )
  }

  return {
    ticker: instrument.ticker,
    currency: instrument.currency,
    source: STOOQ_CAPABILITIES.id,
    bars: normalizeBars(bars),
  }
}

export class StooqPriceProvider implements PriceProvider {
  readonly capabilities = STOOQ_CAPABILITIES

  constructor(private readonly fetchText: (url: string) => Promise<string> = defaultFetchText) {}

  async fetchDailyHistory(request: PriceRequest): Promise<PriceSeries> {
    const symbol = stooqSymbol(request.instrument)
    const csv = await this.fetchText(stooqUrl(symbol))
    const series = parseStooqCsv(csv, {
      ticker: request.instrument.ticker,
      currency: stooqCurrency(request.instrument),
    })
    return { ...series, bars: series.bars.filter((bar) => bar.date >= request.since) }
  }
}

async function defaultFetchText(url: string): Promise<string> {
  const response = await fetch(url, { headers: { Accept: 'text/csv,text/plain' } })
  if (!response.ok) {
    throw new ProviderError(
      STOOQ_CAPABILITIES.id,
      `HTTP ${response.status} von ${url}`,
      response.status === 429 || response.status >= 500,
    )
  }
  return response.text()
}
