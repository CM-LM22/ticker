import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { checkConfiguration } from './config'

const gesichert = { ...process.env }

beforeEach(() => {
  for (const name of [
    'APP_PASSWORD',
    'DATABASE_URL',
    'POSTGRES_URL',
    'NEON_DATABASE_URL',
    'DATABASE_URL_UNPOOLED',
    'POSTGRES_URL_NON_POOLING',
    'PGHOST',
    'PGUSER',
    'PGPASSWORD',
    'PGDATABASE',
    'NEON_API_KEY',
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

  it('nennt beim Fehlen alle gesuchten Namen', () => {
    expect(finde('DATABASE_URL').hinweis).toContain('POSTGRES_URL')
    expect(finde('DATABASE_URL').hinweis).toContain('PGHOST')
  })

  it('setzt die Verbindung aus den Einzelteilen zusammen', () => {
    // Manche Integrationen setzen keine fertige Zeichenfolge, sondern
    // nur PGHOST und Co. Ohne das meldet die App "nicht eingerichtet",
    // obwohl alles da ist.
    process.env['PGHOST'] = 'ep-beispiel.eu-central-1.aws.neon.tech'
    process.env['PGUSER'] = 'benutzer'
    process.env['PGPASSWORD'] = 'wort'
    process.env['PGDATABASE'] = 'neondb'
    expect(finde('DATABASE_URL').gesetzt).toBe(true)
    expect(finde('DATABASE_URL').hinweis).toContain('PGHOST')
  })

  it('setzt nichts zusammen, wenn ein Einzelteil fehlt', () => {
    process.env['PGHOST'] = 'host'
    process.env['PGUSER'] = 'benutzer'
    // Ohne Passwort waere die Zeichenfolge kaputt statt unvollstaendig.
    expect(finde('DATABASE_URL').gesetzt).toBe(false)
  })

  it('nennt beim Scheitern die tatsaechlich gesetzten Namen', () => {
    process.env['NEON_API_KEY'] = 'irgendwas'
    const hinweis = finde('DATABASE_URL').hinweis ?? ''
    expect(hinweis).toContain('NEON_API_KEY')
    expect(hinweis).not.toContain('irgendwas')
  })

  it('findet die Verbindung auch unter dem Namen der Vercel-Integration', () => {
    // Die Neon-Integration legt sie je nach Weg anders ab. Ohne diese
    // Toleranz meldet die App "nicht eingerichtet", obwohl alles da ist.
    process.env['POSTGRES_URL'] = 'postgres://benutzer:wort@host/db'
    expect(finde('DATABASE_URL').gesetzt).toBe(true)
    expect(finde('DATABASE_URL').hinweis).toContain('POSTGRES_URL')
  })

  it('bevorzugt DATABASE_URL, wenn mehrere Namen gesetzt sind', () => {
    process.env['DATABASE_URL'] = 'postgres://a/db'
    process.env['POSTGRES_URL'] = 'postgres://b/db'
    expect(finde('DATABASE_URL').hinweis).toBeNull()
  })

  it('verraet die Verbindungszeichenfolge nicht', () => {
    process.env['POSTGRES_URL'] = 'postgres://benutzer:streng-geheim@host/db'
    expect(JSON.stringify(checkConfiguration())).not.toContain('streng-geheim')
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
