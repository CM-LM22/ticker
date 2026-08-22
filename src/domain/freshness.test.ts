import { describe, expect, it } from 'vitest'
import { abrufIstFrisch, kurseSindFrisch } from './freshness'

const sonntag = new Date('2026-08-23T09:00:00Z')

describe('kurseSindFrisch', () => {
  it('haelt den Freitagsschluss am Sonntag fuer frisch', () => {
    expect(kurseSindFrisch('2026-08-21', sonntag)).toBe(true)
  })

  it('will am Montag nach dem Wochenende neue Kurse', () => {
    expect(kurseSindFrisch('2026-08-21', new Date('2026-08-24T09:00:00Z'))).toBe(false)
  })

  it('haelt fehlende Kurse nie fuer frisch', () => {
    expect(kurseSindFrisch(null, sonntag)).toBe(false)
    expect(kurseSindFrisch('kein-datum', sonntag)).toBe(false)
  })
})

describe('abrufIstFrisch', () => {
  const jetzt = new Date('2026-08-22T12:00:00Z')

  it('ueberspringt einen Abruf vom selben Tag', () => {
    expect(abrufIstFrisch(new Date('2026-08-22T06:00:00Z'), jetzt)).toBe(true)
  })

  it('holt nach einem Tag erneut', () => {
    expect(abrufIstFrisch(new Date('2026-08-21T06:00:00Z'), jetzt)).toBe(false)
  })

  it('holt immer, wenn noch nie abgerufen wurde', () => {
    expect(abrufIstFrisch(null, jetzt)).toBe(false)
  })
})
