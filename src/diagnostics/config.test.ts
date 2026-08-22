import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { checkConfiguration } from './config'

const gesichert = { ...process.env }

beforeEach(() => {
  for (const name of [
    'APP_PASSWORD',
    'DATABASE_URL',
    'TWELVEDATA_API_KEY',
    'SEC_USER_AGENT',
    'CRON_SECRET',
    'FINNHUB_API_KEY',
    'TELEGRAM_BOT_TOKEN',
    'TELEGRAM_CHAT_ID',
  ]) {
    delete process.env[name]
  }
})

afterEach(() => {
  process.env = { ...gesichert }
})

function finde(name: string) {
  const eintrag = checkConfiguration().find((c) => c.name === name)
  if (eintrag === undefined) throw new Error(`${name} fehlt in der Pruefung`)
  return eintrag
}

describe('checkConfiguration', () => {
  it('meldet fehlende Pflichtvariablen', () => {
    expect(finde('DATABASE_URL').gesetzt).toBe(false)
    expect(finde('DATABASE_URL').pflicht).toBe(true)
  })

  it('gibt niemals den Wert zurueck, auch nicht gekuerzt', () => {
    process.env['APP_PASSWORD'] = 'streng-geheim-12345'
    const alsText = JSON.stringify(checkConfiguration())
    expect(alsText).not.toContain('streng')
    expect(alsText).not.toContain('12345')
    expect(finde('APP_PASSWORD').gesetzt).toBe(true)
  })

  it('wertet reine Leerzeichen als nicht gesetzt', () => {
    process.env['TWELVEDATA_API_KEY'] = '   '
    expect(finde('TWELVEDATA_API_KEY').gesetzt).toBe(false)
  })

  it('warnt bei einem SEC-User-Agent ohne Kontakt-E-Mail', () => {
    process.env['SEC_USER_AGENT'] = 'ticker-alerts/0.1'
    expect(finde('SEC_USER_AGENT').gesetzt).toBe(true)
    expect(finde('SEC_USER_AGENT').hinweis).toContain('403')
  })

  it('schweigt bei einem richtig geformten SEC-User-Agent', () => {
    process.env['SEC_USER_AGENT'] = 'ticker-alerts/0.1 (mail@example.com)'
    expect(finde('SEC_USER_AGENT').hinweis).toBeNull()
  })

  it('warnt, wenn von Telegram nur eine Haelfte gesetzt ist', () => {
    process.env['TELEGRAM_BOT_TOKEN'] = 'token'
    expect(finde('TELEGRAM_BOT_TOKEN').hinweis).toContain('Chat-ID')

    delete process.env['TELEGRAM_BOT_TOKEN']
    process.env['TELEGRAM_CHAT_ID'] = '4711'
    expect(finde('TELEGRAM_CHAT_ID').hinweis).toContain('Token')
  })

  it('schweigt, wenn beide Telegram-Werte gesetzt sind', () => {
    process.env['TELEGRAM_BOT_TOKEN'] = 'token'
    process.env['TELEGRAM_CHAT_ID'] = '4711'
    expect(finde('TELEGRAM_BOT_TOKEN').hinweis).toBeNull()
    expect(finde('TELEGRAM_CHAT_ID').hinweis).toBeNull()
  })
})
