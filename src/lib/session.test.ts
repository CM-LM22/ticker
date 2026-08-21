import { describe, expect, it } from 'vitest'
import {
  createSessionToken,
  safeRedirectPath,
  timingSafeEqual,
  verifySessionToken,
} from './session'

const secret = 'ein-hinreichend-langes-passwort'
const now = Date.UTC(2026, 7, 21, 12, 0, 0)
const inOneHour = now + 3_600_000

describe('Sitzungs-Token', () => {
  it('erkennt ein selbst ausgestelltes Token an', async () => {
    const token = await createSessionToken(secret, inOneHour)
    expect(await verifySessionToken(secret, token, now)).toBe(true)
  })

  it('weist ein abgelaufenes Token zurueck', async () => {
    const token = await createSessionToken(secret, now - 1000)
    expect(await verifySessionToken(secret, token, now)).toBe(false)
  })

  it('weist ein Token mit anderem Passwort zurueck', async () => {
    const token = await createSessionToken(secret, inOneHour)
    // Passwortwechsel macht alle Sitzungen ungueltig, genau so gewollt.
    expect(await verifySessionToken('anderes-passwort', token, now)).toBe(false)
  })

  it('laesst sich nicht durch Verlaengern des Ablaufdatums austricksen', async () => {
    const token = await createSessionToken(secret, now - 1000)
    const [, signature] = token.split('.')
    const gefaelscht = `${inOneHour}.${signature ?? ''}`
    expect(await verifySessionToken(secret, gefaelscht, now)).toBe(false)
  })

  it('weist manipulierte Signaturen zurueck', async () => {
    const token = await createSessionToken(secret, inOneHour)
    expect(await verifySessionToken(secret, `${token}x`, now)).toBe(false)
  })

  it('weist Unsinn zurueck, statt zu werfen', async () => {
    for (const token of [undefined, null, '', '.', 'abc', 'abc.def', `${inOneHour}.`]) {
      expect(await verifySessionToken(secret, token, now)).toBe(false)
    }
  })
})

describe('timingSafeEqual', () => {
  it('vergleicht gleiche Zeichenketten als gleich', () => {
    expect(timingSafeEqual('abc', 'abc')).toBe(true)
  })

  it('erkennt Unterschiede an jeder Stelle', () => {
    expect(timingSafeEqual('abc', 'abd')).toBe(false)
    expect(timingSafeEqual('abc', 'bbc')).toBe(false)
    expect(timingSafeEqual('abc', 'abcd')).toBe(false)
  })
})

describe('safeRedirectPath', () => {
  it('laesst eigene Pfade durch', () => {
    expect(safeRedirectPath('/titel/aapl')).toBe('/titel/aapl')
  })

  it('blockt fremde Ziele', () => {
    expect(safeRedirectPath('https://fremde.seite')).toBe('/')
    // Fuer den Browser ist das eine absolute URL, nicht ein Pfad.
    expect(safeRedirectPath('//fremde.seite')).toBe('/')
    expect(safeRedirectPath('/\\fremde.seite')).toBe('/')
    expect(safeRedirectPath('/pfad\\mit\\backslash')).toBe('/')
  })

  it('faellt bei fehlender Angabe auf die Startseite zurueck', () => {
    expect(safeRedirectPath(null)).toBe('/')
    expect(safeRedirectPath(undefined)).toBe('/')
    expect(safeRedirectPath('')).toBe('/')
  })
})
