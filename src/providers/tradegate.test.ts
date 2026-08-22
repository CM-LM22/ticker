import { describe, expect, it } from 'vitest'
import {
  parseGermanNumber,
  parseTradegateQuote,
  quoteIstPlausibel,
  tradegateEligible,
  tradegateSchlussTag,
} from './tradegate'
import { ProviderError } from './types'

describe('parseGermanNumber', () => {
  it('liest deutsches Zahlenformat mit Tausenderpunkt und Dezimalkomma', () => {
    expect(parseGermanNumber('186,70')).toBe(186.7)
    expect(parseGermanNumber('1.234,56')).toBe(1234.56)
    expect(parseGermanNumber('-0,72 %')).toBe(-0.72)
    expect(parseGermanNumber(42)).toBe(42)
  })

  it('gibt null fuer Unlesbares, statt zu raten', () => {
    expect(parseGermanNumber('—')).toBeNull()
    expect(parseGermanNumber('')).toBeNull()
    expect(parseGermanNumber(null)).toBeNull()
    expect(parseGermanNumber({})).toBeNull()
  })
})

describe('parseTradegateQuote', () => {
  it('liest den letzten Preis samt Tagesveraenderung', () => {
    const quote = parseTradegateQuote(
      { last: '186,70', delta: '-0,72', bid: '186,62', ask: '186,78' },
      'DE0007164600',
    )
    expect(quote).toMatchObject({ last: 186.7, deltaPct: -0.72, bid: 186.62 })
  })

  it('kommt ohne die optionalen Felder aus', () => {
    const quote = parseTradegateQuote({ last: '99,00' }, 'DE0007164600')
    expect(quote.deltaPct).toBeNull()
  })

  it('weist eine Antwort ohne Kursfeld zurueck', () => {
    expect(() => parseTradegateQuote({ bid: '1,00' }, 'X')).toThrow(ProviderError)
    expect(() => parseTradegateQuote({ last: '0,00' }, 'X')).toThrow(/kein Kursfeld/)
  })
})

describe('quoteIstPlausibel', () => {
  it('nimmt Kurse nahe dem gespeicherten Schluss an', () => {
    expect(quoteIstPlausibel(186.7, 188.12)).toBe(true)
  })

  it('verwirft Kurse, die weit vom Schluss abweichen', () => {
    // Genau der Fall einer falsch zugeordneten ISIN: anderes
    // Unternehmen, anderer Preis. Lieber kein Kurs als ein falscher.
    expect(quoteIstPlausibel(42, 188.12)).toBe(false)
    expect(quoteIstPlausibel(500, 188.12)).toBe(false)
  })

  it('verwirft alles ohne Vergleichsbasis', () => {
    expect(quoteIstPlausibel(186.7, 0)).toBe(false)
  })
})

describe('tradegateEligible', () => {
  it('laesst nur XETRA-Titel mit ISIN zu', () => {
    expect(tradegateEligible({ venue: 'XETRA', isin: 'DE0007164600' })).toBe('DE0007164600')
    expect(tradegateEligible({ venue: 'XETRA' })).toBeNull()
    expect(tradegateEligible({ venue: 'NASDAQ', isin: 'US0378331005' })).toBeNull()
  })
})

describe('tradegateSchlussTag', () => {
  // 2026-08-22 ist ein Samstag; Berlin ist im August UTC+2.
  it('liefert am Wochenende den Freitag', () => {
    expect(tradegateSchlussTag(new Date('2026-08-22T05:00:00Z'))).toBe('2026-08-21')
    expect(tradegateSchlussTag(new Date('2026-08-23T14:00:00Z'))).toBe('2026-08-21')
  })

  it('liefert werktags vor Boersenoeffnung den Vortag', () => {
    // Freitag 05:00 UTC = 07:00 Berlin, vor 08:00.
    expect(tradegateSchlussTag(new Date('2026-08-21T05:00:00Z'))).toBe('2026-08-20')
    // Montag frueh springt auf den Freitag zurueck.
    expect(tradegateSchlussTag(new Date('2026-08-24T04:30:00Z'))).toBe('2026-08-21')
  })

  it('liefert null, solange die Boerse handelt', () => {
    // Freitag 10:00 UTC = 12:00 Berlin, mitten im Handel.
    expect(tradegateSchlussTag(new Date('2026-08-21T10:00:00Z'))).toBeNull()
    // 19:59 UTC = 21:59 Berlin, letzte Handelsminute.
    expect(tradegateSchlussTag(new Date('2026-08-21T19:59:00Z'))).toBeNull()
  })

  it('liefert nach 22 Uhr Berlin den heutigen Tag', () => {
    // Freitag 20:30 UTC = 22:30 Berlin.
    expect(tradegateSchlussTag(new Date('2026-08-21T20:30:00Z'))).toBe('2026-08-21')
  })

  it('rechnet auch im Winter (UTC+1) richtig', () => {
    // Mittwoch 2026-01-14, 06:30 UTC = 07:30 Berlin: vor Oeffnung.
    expect(tradegateSchlussTag(new Date('2026-01-14T06:30:00Z'))).toBe('2026-01-13')
    // 07:30 UTC = 08:30 Berlin: Handel laeuft.
    expect(tradegateSchlussTag(new Date('2026-01-14T07:30:00Z'))).toBeNull()
    // 21:30 UTC = 22:30 Berlin: Schluss von heute.
    expect(tradegateSchlussTag(new Date('2026-01-14T21:30:00Z'))).toBe('2026-01-14')
  })
})
