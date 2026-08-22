import { describe, expect, it } from 'vitest'
import type { Alert } from './types'
import { TelegramNotifier, readTelegramConfig, telegramMessageText, telegramSendUrl } from './telegram'
import type { WatchlistEntry } from '../domain/instrument'

const apple: WatchlistEntry = {
  ticker: 'AAPL',
  name: 'Apple Inc.',
  venue: 'NASDAQ',
  expectedCoverage: 'sec_domestic',
}

const alert = {
  event: {} as Alert['event'],
  entry: apple,
  title: 'Analystenmeldung AAPL',
  body: 'AAPL · UBS: Upgrade (Neutral → Buy)',
} satisfies Alert

describe('telegramMessageText', () => {
  it('haengt den Disclaimer unter jede Meldung', () => {
    const text = telegramMessageText(alert)
    expect(text).toContain('Analystenmeldung AAPL')
    expect(text).toContain('Keine Anlageberatung')
  })
})

describe('readTelegramConfig', () => {
  it('liefert null, solange ein Wert fehlt', () => {
    expect(readTelegramConfig({})).toBeNull()
    expect(readTelegramConfig({ TELEGRAM_BOT_TOKEN: 'x' })).toBeNull()
    expect(readTelegramConfig({ TELEGRAM_BOT_TOKEN: 'x', TELEGRAM_CHAT_ID: '1' })).toEqual({
      token: 'x',
      chatId: '1',
    })
  })
})

describe('TelegramNotifier', () => {
  it('schickt Titel, Text und Chat-ID an die Bot-API', async () => {
    const posts: { url: string; body: unknown }[] = []
    const notifier = new TelegramNotifier(
      'token-1',
      '42',
      async (url, body) => {
        posts.push({ url, body })
        return { ok: true, result: { message_id: 99 } }
      },
      () => new Date('2026-08-22T00:00:00Z'),
    )
    const result = await notifier.send(alert)
    expect(result).toMatchObject({ ok: true, providerMessageId: '99' })
    expect(posts[0]?.url).toBe(telegramSendUrl('token-1'))
    expect(posts[0]?.body).toMatchObject({ chat_id: '42', disable_web_page_preview: true })
  })

  it('meldet eine Ablehnung als wiederholbar', async () => {
    const notifier = new TelegramNotifier('token-1', '42', async () => ({
      ok: false,
      description: 'chat not found',
    }))
    const result = await notifier.send(alert)
    expect(result).toMatchObject({ ok: false, retryable: true, error: 'chat not found' })
  })
})
