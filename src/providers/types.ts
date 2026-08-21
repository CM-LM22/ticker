import type { FilingForm, MarketEvent } from '../domain/event'
import type { WatchlistEntry } from '../domain/instrument'
import type { RatingsSnapshot } from '../domain/ratings-diff'

/**
 * Was ein Anbieter kann, als Datensatz statt als Prosa. Der Wechsel auf
 * einen bezahlten Anbieter soll spaeter eine Konfigurationsfrage sein
 * und kein Umbau, deshalb haengt jede Faehigkeit am Interface und nicht
 * im Aufrufer.
 */
export interface ProviderCapabilities {
  readonly id: string
  readonly kind: 'filings' | 'earnings_calendar' | 'ratings' | 'notifier'
  readonly coversUsListings: boolean
  /**
   * Deckt Titel ohne US-Notierung ab. Genau hier scheitern die Free
   * Tiers, und genau hier luegen die Marketingseiten am haeufigsten.
   */
  readonly coversNonUsListings: boolean
  readonly requiresApiKey: boolean
  readonly rateLimit: { readonly requests: number; readonly perSeconds: number } | null
  readonly monthlyQuota: number | null
  readonly costEurPerMonth: number
  /**
   * Woher die Angaben oben stammen. 'vendor_claim' heisst: von der
   * Website abgeschrieben und noch nicht nachgemessen. Vor einer
   * Entscheidung fuer einen Anbieter muss hier 'measured' stehen.
   */
  readonly evidence: 'measured' | 'vendor_claim'
  /** ISO-Datum der letzten Messung, null solange keine stattfand. */
  readonly verifiedAt: string | null
}

/** Fehler eines Anbieters. retryable trennt Netzausfall von Fehlbedienung. */
export class ProviderError extends Error {
  constructor(
    readonly providerId: string,
    message: string,
    readonly retryable: boolean,
    options?: { cause?: unknown },
  ) {
    super(message, options)
    this.name = 'ProviderError'
  }
}

export interface FetchResult<T> {
  readonly items: readonly T[]
  readonly fetchedAt: Date
  /** Fortschrittsmarke fuer den naechsten Lauf, z. B. ein ETag. */
  readonly cursor: string | null
  /** Auffaelligkeiten, die keinen Abbruch rechtfertigen. */
  readonly warnings: readonly string[]
}

/** Rohdatensatz einer Einreichung, noch vor der Normalisierung. */
export interface RawFiling {
  readonly sourceEventId: string
  readonly cik: string
  readonly ticker: string | null
  readonly form: FilingForm
  readonly items: readonly string[]
  readonly accessionNumber: string
  readonly primaryDocumentUrl: string
  readonly filedAt: Date
  readonly reportDate: string | null
}

export interface FilingRequest {
  readonly instruments: readonly WatchlistEntry[]
  readonly since: Date
}

export interface FilingSource {
  readonly capabilities: ProviderCapabilities
  fetchFilings(request: FilingRequest): Promise<FetchResult<RawFiling>>
}

export interface RawEarningsDate {
  readonly sourceEventId: string
  readonly ticker: string
  readonly scheduledFor: string
  readonly session: 'before_open' | 'after_close' | 'unknown'
  readonly fiscalPeriod: string | null
  readonly confirmed: boolean
}

export interface EarningsCalendarRequest {
  readonly instruments: readonly WatchlistEntry[]
  readonly from: Date
  readonly to: Date
}

export interface EarningsCalendarProvider {
  readonly capabilities: ProviderCapabilities
  fetchUpcoming(request: EarningsCalendarRequest): Promise<FetchResult<RawEarningsDate>>
}

export interface RatingsProvider {
  readonly capabilities: ProviderCapabilities
  /** Momentaufnahme. Den Ereignisstrom erzeugt diffRatings daraus. */
  fetchSnapshot(instrument: WatchlistEntry): Promise<RatingsSnapshot>
}

export interface Alert {
  readonly event: MarketEvent
  readonly entry: WatchlistEntry
  readonly title: string
  readonly body: string
}

export interface DeliveryResult {
  readonly ok: boolean
  readonly providerMessageId: string | null
  readonly error: string | null
  readonly attemptedAt: Date
  readonly retryable: boolean
}

export interface Notifier {
  readonly capabilities: ProviderCapabilities
  send(alert: Alert): Promise<DeliveryResult>
}
