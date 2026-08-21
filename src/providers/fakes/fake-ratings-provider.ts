import type { WatchlistEntry } from '../../domain/instrument'
import type { RatingsSnapshot } from '../../domain/ratings-diff'
import { ProviderError } from '../types'
import type { ProviderCapabilities, RatingsProvider } from '../types'

export const FAKE_RATINGS_CAPABILITIES: ProviderCapabilities = {
  id: 'fake-ratings',
  kind: 'ratings',
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
 * Gibt bei jedem Aufruf den naechsten hinterlegten Snapshot zurueck.
 * So laesst sich die Diff-Kette ueber mehrere Laeufe testen, ohne zu warten.
 */
export class FakeRatingsProvider implements RatingsProvider {
  readonly capabilities = FAKE_RATINGS_CAPABILITIES
  private cursor = 0

  constructor(private readonly snapshots: readonly RatingsSnapshot[]) {}

  fetchSnapshot(instrument: WatchlistEntry): Promise<RatingsSnapshot> {
    const snapshot = this.snapshots[Math.min(this.cursor, this.snapshots.length - 1)]
    if (snapshot === undefined) {
      return Promise.reject(
        new ProviderError(this.capabilities.id, `Kein Snapshot fuer ${instrument.ticker}`, false),
      )
    }
    this.cursor += 1
    return Promise.resolve(snapshot)
  }
}
