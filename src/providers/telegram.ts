import { z } from 'zod'
import type { Alert, DeliveryResult, Notifier, ProviderCapabilities } from './types'
import { ProviderError } from './types'

export const TELEGRAM_CAPABILITIES: ProviderCapabilities = {
  id: 'telegram',
  kind: 'notifier',
  coversUsListings: true,
  coversNonUsListings: true,
  requiresApiKey: true,
  rateLimit: { requests: 30, perSeconds: 1 },
  monthlyQuota: null,
  costEurPerMonth: 0,
  evidence: 'vendor_claim',
  verifiedAt: null,
}

const TelegramResponseSchema = z.object({
  ok: z.boolean(),
  result: z.object({ message_id: z.number() }).optional(),
  description: z.string().optional(),
})

export const DISCLAIMER_LINE =
  'Keine Anlageberatung, keine Kaufempfehlung. Massgeblich ist die Originalquelle.'

export function telegramMessageText(alert: Pick<Alert, 'title' | 'body'>): string {
  return `${alert.title}\n\n${alert.body}\n\n${DISCLAIMER_LINE}`
}

export function telegramSendUrl(token: string): string {
  return `https://api.telegram.org/bot${token}/sendMessage`
}

/**
 * Zustellung an einen einzelnen Chat. Token und Chat-ID kommen aus der
 * Umgebung, nicht ins Repository.
 */
export class TelegramNotifier implements Notifier {
  readonly capabilities = TELEGRAM_CAPABILITIES

  constructor(
    private readonly token: string,
    private readonly chatId: string,
    private readonly postJson: (url: string, body: unknown) => Promise<unknown> = defaultPostJson,
    private readonly now: () => Date = () => new Date(),
  ) {}

  send(alert: Alert): Promise<DeliveryResult> {
    return this.sendText(alert.title, alert.body)
  }

  async sendText(title: string, body: string): Promise<DeliveryResult> {
    const attemptedAt = this.now()
    try {
      const raw = await this.postJson(telegramSendUrl(this.token), {
        chat_id: this.chatId,
        text: telegramMessageText({ title, body }),
        disable_web_page_preview: true,
      })
      const parsed = TelegramResponseSchema.parse(raw)
      if (!parsed.ok) {
        return {
          ok: false,
          providerMessageId: null,
          error: parsed.description ?? 'Telegram hat abgelehnt',
          attemptedAt,
          retryable: true,
        }
      }
      return {
        ok: true,
        providerMessageId: parsed.result === undefined ? null : String(parsed.result.message_id),
        error: null,
        attemptedAt,
        retryable: false,
      }
    } catch (error) {
      const retryable = error instanceof ProviderError ? error.retryable : true
      return {
        ok: false,
        providerMessageId: null,
        error: error instanceof Error ? error.message : String(error),
        attemptedAt,
        retryable,
      }
    }
  }
}

export function readTelegramConfig(
  env: Record<string, string | undefined> = process.env,
): { token: string; chatId: string } | null {
  const token = env['TELEGRAM_BOT_TOKEN']?.trim() ?? ''
  const chatId = env['TELEGRAM_CHAT_ID']?.trim() ?? ''
  if (token.length === 0 || chatId.length === 0) return null
  return { token, chatId }
}

async function defaultPostJson(url: string, body: unknown): Promise<unknown> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
  })
  if (!response.ok && response.status !== 400) {
    throw new ProviderError(
      TELEGRAM_CAPABILITIES.id,
      `HTTP ${response.status} von Telegram`,
      response.status === 429 || response.status >= 500,
    )
  }
  return response.json() as Promise<unknown>
}
