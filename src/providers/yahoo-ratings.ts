import { z } from 'zod'
import type { AnalystAction } from '../domain/analyst-actions'
import type { RatingAction } from '../domain/event'
import { normalizeFirm, normalizeGrade } from '../domain/ratings-diff'
import type { Venue, WatchlistEntry } from '../domain/instrument'
import { ProviderError } from './types'
import type { ProviderCapabilities } from './types'

/**
 * Upgrade-/Downgrade-Historie von Yahoo Finance. Kein Schluessel, keine
 * Anmeldung, amerikanische und deutsche Titel. Die Schnittstelle ist
 * undokumentiert (siehe E13: als Ausweichquelle vorgemerkt) und kann
 * verschwinden; die Faehigkeiten stehen deshalb auf vendor_claim.
 *
 * Was ankommt, sind veroeffentlichte Rating-Aktionen, nicht der
 * Research-Text. Den gibt es kostenlos nicht.
 */
export const YAHOO_RATINGS_CAPABILITIES: ProviderCapabilities = {
  id: 'yahoo-upgrade-history',
  kind: 'ratings',
  coversUsListings: true,
  coversNonUsListings: true,
  requiresApiKey: false,
  rateLimit: { requests: 2, perSeconds: 1 },
  monthlyQuota: null,
  costEurPerMonth: 0,
  evidence: 'vendor_claim',
  verifiedAt: null,
}

const SUFFIX_BY_VENUE: Record<Venue, string | null> = {
  NASDAQ: null,
  NYSE: null,
  XETRA: '.DE',
}

export function yahooSymbol(instrument: Pick<WatchlistEntry, 'ticker' | 'venue'>): string {
  const suffix = SUFFIX_BY_VENUE[instrument.venue]
  return suffix === null ? instrument.ticker : `${instrument.ticker}${suffix}`
}

export function yahooUpgradeHistoryUrl(symbol: string): string {
  const params = new URLSearchParams({
    modules: 'upgradeDowngradeHistory',
    lang: 'en-US',
    region: 'US',
    corsDomain: 'finance.yahoo.com',
  })
  return `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?${params.toString()}`
}

const HistoryRowSchema = z.object({
  epochGradeDate: z.number(),
  firm: z.string(),
  toGrade: z.string().optional().default(''),
  fromGrade: z.string().optional().default(''),
  action: z.string(),
})

export const YahooQuoteSummarySchema = z.object({
  quoteSummary: z.object({
    result: z
      .array(
        z.object({
          upgradeDowngradeHistory: z
            .object({
              history: z.array(HistoryRowSchema).optional().default([]),
            })
            .optional(),
        }),
      )
      .nullable(),
    error: z.unknown().nullable().optional(),
  }),
})

const YAHOO_ACTION: Readonly<Record<string, RatingAction>> = {
  up: 'upgrade',
  down: 'downgrade',
  init: 'initiate',
  main: 'change',
  reit: 'change',
}

function emptyToNull(value: string): string | null {
  const trimmed = value.trim()
  return trimmed.length === 0 ? null : trimmed
}

export function yahooActionId(ticker: string, row: z.infer<typeof HistoryRowSchema>): string {
  const firm = normalizeFirm(row.firm)
  const grade = normalizeGrade(emptyToNull(row.toGrade)) ?? ''
  return `${ticker.toUpperCase()}|${firm}|${row.epochGradeDate}|${grade}|${row.action.trim().toLowerCase()}`
}

/**
 * Zerlegt die JSON-Antwort. Unbekannte Aktionen und leere Haeuser werden
 * uebersprungen, nicht in Alerts verwandelt.
 */
export function parseYahooUpgradeHistory(raw: unknown, ticker: string): AnalystAction[] {
  const parsed = YahooQuoteSummarySchema.safeParse(raw)
  if (!parsed.success) {
    throw new ProviderError(
      YAHOO_RATINGS_CAPABILITIES.id,
      `Unerwartete Antwort fuer ${ticker}: ${parsed.error.issues[0]?.message ?? 'unlesbar'}`,
      false,
    )
  }

  const result = parsed.data.quoteSummary.result
  if (result === null || result.length === 0) {
    throw new ProviderError(
      YAHOO_RATINGS_CAPABILITIES.id,
      `Keine Daten fuer ${ticker}`,
      false,
    )
  }

  const history = result[0]?.upgradeDowngradeHistory?.history ?? []
  const actions: AnalystAction[] = []

  for (const row of history) {
    const firm = row.firm.trim()
    if (firm.length === 0) continue
    const mapped = YAHOO_ACTION[row.action.trim().toLowerCase()]
    if (mapped === undefined) continue
    const occurredAt = new Date(row.epochGradeDate * 1000)
    if (Number.isNaN(occurredAt.getTime())) continue
    actions.push({
      sourceEventId: yahooActionId(ticker, row),
      ticker: ticker.toUpperCase(),
      firm,
      action: mapped,
      gradeFrom: emptyToNull(row.fromGrade),
      gradeTo: emptyToNull(row.toGrade),
      occurredAt,
    })
  }

  return actions
}

export class YahooRatingsProvider {
  readonly capabilities = YAHOO_RATINGS_CAPABILITIES

  constructor(
    private readonly fetchJson: (url: string) => Promise<unknown> = defaultFetchJson,
  ) {}

  async fetchHistory(instrument: WatchlistEntry): Promise<readonly AnalystAction[]> {
    const symbol = yahooSymbol(instrument)
    const raw = await this.fetchJson(yahooUpgradeHistoryUrl(symbol))
    return parseYahooUpgradeHistory(raw, instrument.ticker)
  }
}

async function defaultFetchJson(url: string): Promise<unknown> {
  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent':
        'Mozilla/5.0 (compatible; ticker-alerts/0.1; +https://github.com/CM-LM22/ticker)',
    },
  })
  if (!response.ok) {
    throw new ProviderError(
      YAHOO_RATINGS_CAPABILITIES.id,
      `HTTP ${response.status} von ${url}`,
      response.status === 429 || response.status >= 500,
    )
  }
  return response.json() as Promise<unknown>
}
