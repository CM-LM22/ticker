import { z } from 'zod'
import type { PriceSeries } from '../domain/price-series'
import { normalizeBars } from '../domain/price-series'
import type { Venue, WatchlistEntry } from '../domain/instrument'
import { ProviderError } from './types'
import type { PriceProvider, PriceRequest, ProviderCapabilities } from './types'

/**
 * Twelve Data, Gratis-Tarif mit Schluessel.
 *
 * Warum ueberhaupt ein Schluessel: Stooq und Yahoo sperren geteilte
 * Cloud-Adressbereiche (gemessen, siehe docs/decisions.md, E20). Ein
 * Schluessel ist genau das, was einen Abruf von einer solchen Adresse
 * legitimiert.
 *
 * Ob der Gratis-Tarif auch XETRA abdeckt, ist offen. Deshalb steht hier
 * 'vendor_claim' und nicht 'measured'.
 */
export const TWELVEDATA_CAPABILITIES: ProviderCapabilities = {
  id: 'twelvedata',
  kind: 'prices',
  coversUsListings: true,
  coversNonUsListings: true,
  requiresApiKey: true,
  rateLimit: { requests: 8, perSeconds: 60 },
  monthlyQuota: 800 * 30,
  costEurPerMonth: 0,
  evidence: 'vendor_claim',
  verifiedAt: null,
}

/** Boersenkuerzel nach MIC, so adressiert Twelve Data nicht-amerikanische Plaetze. */
const EXCHANGE_BY_VENUE: Record<Venue, string | null> = {
  NASDAQ: null,
  NYSE: null,
  XETRA: 'XETR',
}

const CURRENCY_BY_VENUE: Record<Venue, string> = {
  NASDAQ: 'USD',
  NYSE: 'USD',
  XETRA: 'EUR',
}

export function twelveDataUrl(
  instrument: Pick<WatchlistEntry, 'ticker' | 'venue'>,
  apiKey: string,
  outputSize: number,
): string {
  const url = new URL('https://api.twelvedata.com/time_series')
  url.searchParams.set('symbol', instrument.ticker.toUpperCase())
  const exchange = EXCHANGE_BY_VENUE[instrument.venue]
  if (exchange !== null) url.searchParams.set('exchange', exchange)
  url.searchParams.set('interval', '1day')
  url.searchParams.set('outputsize', String(outputSize))
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

const ValueSchema = z.object({
  datetime: z.string(),
  open: numeric,
  high: numeric,
  low: numeric,
  close: numeric,
})

const SuccessSchema = z.object({
  meta: z.object({ symbol: z.string(), currency: z.string().optional() }).optional(),
  values: z.array(ValueSchema),
})

/** Fehler kommen mit HTTP 200 und einem status-Feld. Auch das eine Falle. */
const ErrorSchema = z.object({ status: z.literal('error'), code: z.number().optional(), message: z.string() })

export function parseTwelveDataSeries(
  raw: unknown,
  instrument: { ticker: string; currency: string },
): PriceSeries {
  const fehler = ErrorSchema.safeParse(raw)
  if (fehler.success) {
    throw new ProviderError(
      TWELVEDATA_CAPABILITIES.id,
      `${instrument.ticker}: ${fehler.data.message}`,
      // 429 heisst Minutenlimit und geht vorueber, alles andere nicht.
      fehler.data.code === 429,
    )
  }

  const erfolg = SuccessSchema.safeParse(raw)
  if (!erfolg.success) {
    throw new ProviderError(
      TWELVEDATA_CAPABILITIES.id,
      `${instrument.ticker}: unerwartete Antwort (${erfolg.error.issues[0]?.message ?? 'unbekannt'})`,
      false,
    )
  }

  const bars = erfolg.data.values
    .filter((value) => /^\d{4}-\d{2}-\d{2}/.test(value.datetime))
    .map((value) => ({
      date: value.datetime.slice(0, 10),
      open: value.open,
      high: value.high,
      low: value.low,
      close: value.close,
      volume: null,
    }))

  if (bars.length === 0) {
    throw new ProviderError(TWELVEDATA_CAPABILITIES.id, `${instrument.ticker}: keine Kurse`, false)
  }

  return {
    ticker: instrument.ticker,
    // Die Waehrung des Anbieters gewinnt, wenn er eine nennt.
    currency: erfolg.data.meta?.currency ?? instrument.currency,
    source: TWELVEDATA_CAPABILITIES.id,
    bars: normalizeBars(bars),
  }
}

export class TwelveDataPriceProvider implements PriceProvider {
  readonly capabilities = TWELVEDATA_CAPABILITIES

  constructor(
    private readonly apiKey: string,
    private readonly outputSize = 420,
    private readonly fetchJson: (url: string) => Promise<unknown> = defaultFetchJson,
  ) {}

  async fetchDailyHistory(request: PriceRequest): Promise<PriceSeries> {
    if (this.apiKey.length === 0) {
      throw new ProviderError(TWELVEDATA_CAPABILITIES.id, 'TWELVEDATA_API_KEY fehlt', false)
    }
    const raw = await this.fetchJson(
      twelveDataUrl(request.instrument, this.apiKey, this.outputSize),
    )
    const series = parseTwelveDataSeries(raw, {
      ticker: request.instrument.ticker,
      currency: CURRENCY_BY_VENUE[request.instrument.venue],
    })
    return { ...series, bars: series.bars.filter((bar) => bar.date >= request.since) }
  }
}

async function defaultFetchJson(url: string): Promise<unknown> {
  const response = await fetch(url, { headers: { Accept: 'application/json' } })
  if (!response.ok) {
    throw new ProviderError(
      TWELVEDATA_CAPABILITIES.id,
      `HTTP ${response.status}`,
      response.status === 429 || response.status >= 500,
    )
  }
  return response.json()
}
