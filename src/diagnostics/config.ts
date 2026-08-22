/**
 * Zeigt, welche Umgebungsvariablen gesetzt sind — und nur das.
 *
 * Es wird ausdruecklich kein Wert zurueckgegeben, auch nicht gekuerzt
 * oder maskiert. Ein maskierter Schluessel ist immer noch ein
 * Schluessel, ueber den man etwas erfaehrt. Wahr oder falsch reicht,
 * um "habe ich alles eingetragen?" zu beantworten.
 */
import {
  DATABASE_URL_CANDIDATES,
  datenbankVariablenNamen,
  resolveDatabaseUrl,
} from '../db/client'

export interface ConfigCheck {
  name: string
  gesetzt: boolean
  pflicht: boolean
  wofuer: string
  /** Zusaetzliche Formpruefung, wo eine falsche Form typisch ist. */
  hinweis: string | null
}

function wert(name: string): string {
  return process.env[name]?.trim() ?? ''
}

/**
 * Sucht alle bekannten Namen ab und meldet, welcher gefunden wurde.
 * Ohne diese Aufschluesselung sucht man lange, wenn die Integration
 * einen anderen Namen vergeben hat als erwartet.
 */
function datenbankPruefung(): ConfigCheck {
  const fund = resolveDatabaseUrl()
  const vorhanden = datenbankVariablenNamen()

  if (fund === null) {
    return {
      name: 'DATABASE_URL',
      gesetzt: false,
      pflicht: true,
      wofuer: 'Speicher fuer Kurse, Berichtszahlen und Meldungen',
      hinweis:
        vorhanden.length === 0
          ? `Keine einzige Datenbankvariable gesetzt. Gesucht wurde nach: ${DATABASE_URL_CANDIDATES.join(', ')} sowie den Einzelteilen PGHOST, PGUSER, PGPASSWORD, PGDATABASE.`
          : `Gesetzt sind: ${vorhanden.join(', ')} — aber keine davon ergibt eine Verbindung. Bitte diese Namen melden.`,
    }
  }

  return {
    name: 'DATABASE_URL',
    gesetzt: true,
    pflicht: true,
    wofuer: 'Speicher fuer Kurse, Berichtszahlen und Meldungen',
    hinweis:
      fund.name === 'DATABASE_URL'
        ? null
        : `Gefunden unter ${fund.name}. Ebenfalls gesetzt: ${vorhanden.join(', ')}.`,
  }
}

export function checkConfiguration(): ConfigCheck[] {
  const secUserAgent = wert('SEC_USER_AGENT')
  const telegramToken = wert('TELEGRAM_BOT_TOKEN')
  const telegramChat = wert('TELEGRAM_CHAT_ID')

  return [
    {
      name: 'APP_PASSWORD',
      gesetzt: wert('APP_PASSWORD').length > 0,
      pflicht: true,
      wofuer: 'Passwortschutz der Oberflaeche',
      hinweis: null,
    },
    datenbankPruefung(),
    {
      name: 'TWELVEDATA_API_KEY',
      gesetzt: wert('TWELVEDATA_API_KEY').length > 0,
      pflicht: true,
      wofuer: 'Tageskurse',
      hinweis: null,
    },
    {
      name: 'SEC_USER_AGENT',
      gesetzt: secUserAgent.length > 0,
      pflicht: true,
      wofuer: 'Berichtszahlen und Termine aus EDGAR',
      // Ohne Kontakt-E-Mail antwortet die SEC mit HTTP 403. Das ist der
      // haeufigste Fehler bei dieser Variable, deshalb hier gepruft.
      hinweis:
        secUserAgent.length > 0 && !secUserAgent.includes('@')
          ? 'Gesetzt, aber ohne Kontakt-E-Mail. Die SEC antwortet dann mit 403.'
          : null,
    },
    {
      name: 'ALPHA_VANTAGE_API_KEY',
      gesetzt: wert('ALPHA_VANTAGE_API_KEY').length > 0,
      pflicht: false,
      wofuer: 'Tageskurse der DAX-Titel (XETRA, in Euro)',
      hinweis:
        wert('ALPHA_VANTAGE_API_KEY').length === 0
          ? 'Ohne diesen Schluessel bleiben die 16 DAX-Titel ohne US-Notierung ohne Kurse.'
          : null,
    },
    {
      name: 'CRON_SECRET',
      gesetzt: wert('CRON_SECRET').length > 0,
      pflicht: false,
      wofuer: 'taeglicher Abruf durch Vercel Cron',
      hinweis: wert('CRON_SECRET').length === 0 ? 'Ohne dieses Secret laeuft nur der Knopf.' : null,
    },
    {
      name: 'FINNHUB_API_KEY',
      gesetzt: wert('FINNHUB_API_KEY').length > 0,
      pflicht: false,
      wofuer: 'aggregierte Analystenempfehlungen',
      hinweis: null,
    },
    {
      name: 'TELEGRAM_BOT_TOKEN',
      gesetzt: telegramToken.length > 0,
      pflicht: false,
      wofuer: 'Push aufs Handy',
      hinweis:
        telegramToken.length > 0 && telegramChat.length === 0
          ? 'Token ohne Chat-ID. Es wird nichts zugestellt.'
          : null,
    },
    {
      name: 'TELEGRAM_CHAT_ID',
      gesetzt: telegramChat.length > 0,
      pflicht: false,
      wofuer: 'Empfaenger des Push',
      hinweis:
        telegramChat.length > 0 && telegramToken.length === 0
          ? 'Chat-ID ohne Token. Es wird nichts zugestellt.'
          : null,
    },
  ]
}
