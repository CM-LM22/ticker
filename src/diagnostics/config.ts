/**
 * Zeigt, welche Umgebungsvariablen gesetzt sind — und nur das.
 *
 * Es wird ausdruecklich kein Wert zurueckgegeben, auch nicht gekuerzt
 * oder maskiert. Ein maskierter Schluessel ist immer noch ein
 * Schluessel, ueber den man etwas erfaehrt. Wahr oder falsch reicht,
 * um "habe ich alles eingetragen?" zu beantworten.
 */
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
    {
      name: 'DATABASE_URL',
      gesetzt: wert('DATABASE_URL').length > 0,
      pflicht: true,
      wofuer: 'Speicher fuer Kurse, Berichtszahlen und Meldungen',
      hinweis: null,
    },
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
