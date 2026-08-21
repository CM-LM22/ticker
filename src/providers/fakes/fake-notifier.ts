import type { Alert, DeliveryResult, Notifier, ProviderCapabilities } from '../types'

export const FAKE_NOTIFIER_CAPABILITIES: ProviderCapabilities = {
  id: 'fake-notifier',
  kind: 'notifier',
  coversUsListings: true,
  coversNonUsListings: true,
  requiresApiKey: false,
  rateLimit: null,
  monthlyQuota: null,
  costEurPerMonth: 0,
  evidence: 'measured',
  verifiedAt: null,
}

/**
 * Sammelt Zustellungen im Speicher. failFor erlaubt es, den Fehlerpfad
 * des Zustell-Logs zu testen, ohne Telegram anzufassen.
 */
export class FakeNotifier implements Notifier {
  readonly capabilities = FAKE_NOTIFIER_CAPABILITIES
  readonly sent: Alert[] = []

  constructor(
    private readonly now: Date,
    private readonly failFor: (alert: Alert) => boolean = () => false,
  ) {}

  send(alert: Alert): Promise<DeliveryResult> {
    if (this.failFor(alert)) {
      return Promise.resolve({
        ok: false,
        providerMessageId: null,
        error: 'Zustellung abgelehnt (Attrappe)',
        attemptedAt: this.now,
        retryable: true,
      })
    }
    this.sent.push(alert)
    return Promise.resolve({
      ok: true,
      providerMessageId: `fake-${this.sent.length}`,
      error: null,
      attemptedAt: this.now,
      retryable: false,
    })
  }
}
