/**
 * Passwortschutz fuer die gesamte Oberflaeche.
 *
 * Vercel bietet echten Passwortschutz erst ab Enterprise beziehungsweise
 * als Zusatzpaket fuer 150 Dollar im Monat. Fuer den Hobby-Tarif bleibt
 * der Weg, den Vercel selbst empfiehlt: ein Gate in der Anwendung.
 *
 * Aufbau: Nach der Passworteingabe bekommt der Browser ein Cookie mit
 * einem Ablaufzeitpunkt und einer HMAC-Signatur darueber. Der Schluessel
 * fuer die Signatur ist das Passwort selbst. Das hat einen erwuenschten
 * Nebeneffekt: Wer das Passwort aendert, macht damit alle bestehenden
 * Sitzungen ungueltig, ohne dass es dafuer einen zweiten Schalter braucht.
 */

export const SESSION_COOKIE = 'ticker_session'
/** 30 Tage. Es ist ein privates Dashboard, kein Bankkonto. */
export const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60

const encoder = new TextEncoder()

function base64url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

async function sign(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(message))
  return base64url(new Uint8Array(signature))
}

/**
 * Vergleich ohne Zeitunterschied.
 *
 * Ein gewoehnlicher Vergleich bricht beim ersten abweichenden Zeichen ab.
 * Wer die Antwortzeit misst, kann daraus ein Geheimnis Zeichen fuer
 * Zeichen erraten. Die Laenge verraet dieser Vergleich weiterhin, das ist
 * bei Signaturen fester Laenge folgenlos und bei Passwoertern hinnehmbar.
 */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let difference = 0
  for (let i = 0; i < a.length; i += 1) {
    difference |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return difference === 0
}

export async function createSessionToken(secret: string, expiresAtMs: number): Promise<string> {
  const payload = String(Math.floor(expiresAtMs))
  return `${payload}.${await sign(secret, payload)}`
}

export async function verifySessionToken(
  secret: string,
  token: string | undefined | null,
  nowMs: number,
): Promise<boolean> {
  if (token === undefined || token === null) return false
  const separator = token.indexOf('.')
  if (separator <= 0) return false

  const payload = token.slice(0, separator)
  const signature = token.slice(separator + 1)
  if (!/^\d+$/.test(payload) || signature.length === 0) return false

  // Erst die Signatur pruefen, dann den Inhalt. Andersherum wuerde ein
  // Angreifer aus der Antwort lernen, ob sein Ablaufdatum plausibel war.
  if (!timingSafeEqual(signature, await sign(secret, payload))) return false
  return Number(payload) > nowMs
}

/**
 * Nur Pfade auf der eigenen Seite als Weiterleitungsziel zulassen.
 *
 * Ohne diese Pruefung wird aus `/login?weiter=https://fremde.seite` eine
 * offene Weiterleitung: Der Link sieht aus wie deine Anwendung und
 * landet woanders. Doppelte Schraegstriche und Backslashes gehoeren dazu,
 * `//fremde.seite` ist fuer den Browser eine absolute URL.
 */
export function safeRedirectPath(candidate: string | null | undefined, fallback = '/'): string {
  if (candidate === null || candidate === undefined || candidate.length === 0) return fallback
  if (!candidate.startsWith('/')) return fallback
  if (candidate.startsWith('//') || candidate.startsWith('/\\')) return fallback
  if (candidate.includes('\\')) return fallback
  return candidate
}
