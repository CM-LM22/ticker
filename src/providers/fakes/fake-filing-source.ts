import type { FetchResult, FilingRequest, FilingSource, ProviderCapabilities, RawFiling } from '../types'

export const FAKE_FILING_CAPABILITIES: ProviderCapabilities = {
  id: 'fake-filings',
  kind: 'filings',
  coversUsListings: true,
  coversNonUsListings: false,
  requiresApiKey: false,
  rateLimit: null,
  monthlyQuota: null,
  costEurPerMonth: 0,
  evidence: 'measured',
  verifiedAt: null,
}

/**
 * Deterministische Attrappe fuer Tests der Slices 1 und 2. Kein Netz,
 * keine Uhr: der Zeitpunkt kommt von aussen herein, damit Tests
 * reproduzierbar bleiben.
 */
export class FakeFilingSource implements FilingSource {
  readonly capabilities = FAKE_FILING_CAPABILITIES
  readonly calls: FilingRequest[] = []

  constructor(
    private readonly filings: readonly RawFiling[],
    private readonly now: Date,
  ) {}

  fetchFilings(request: FilingRequest): Promise<FetchResult<RawFiling>> {
    this.calls.push(request)
    const wanted = new Set(
      request.instruments.flatMap((entry) =>
        entry.cik === undefined ? [] : [entry.cik],
      ),
    )
    const items = this.filings.filter(
      (filing) => filing.filedAt >= request.since && (wanted.size === 0 || wanted.has(filing.cik)),
    )
    return Promise.resolve({ items, fetchedAt: this.now, cursor: null, warnings: [] })
  }
}
