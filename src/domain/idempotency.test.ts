import { describe, expect, it } from 'vitest'
import { canonicalEventString, eventId, normalizeTimestamp } from './idempotency'

const base = {
  source: 'sec-edgar',
  sourceEventId: '000110465926055376',
  ticker: 'FMS',
  occurredAt: new Date('2026-05-06T11:02:00Z'),
}

describe('eventId', () => {
  it('liefert denselben Schluessel fuer denselben Abruf', () => {
    expect(eventId(base)).toBe(eventId({ ...base }))
  })

  it('ignoriert Gross- und Kleinschreibung sowie Leerzeichen im Ticker', () => {
    expect(eventId({ ...base, ticker: '  fms ' })).toBe(eventId(base))
  })

  it('ignoriert die Zeitzone, in der derselbe Moment ausgedrueckt wird', () => {
    expect(eventId({ ...base, occurredAt: new Date('2026-05-06T13:02:00+02:00') })).toBe(
      eventId(base),
    )
  })

  it('ignoriert Millisekunden, die manche Anbieter mal liefern und mal nicht', () => {
    expect(eventId({ ...base, occurredAt: new Date('2026-05-06T11:02:00.742Z') })).toBe(
      eventId(base),
    )
  })

  it('unterscheidet Einreichung und Nachtrag, weil beide eigene IDs haben', () => {
    expect(eventId({ ...base, sourceEventId: '000110465926055377' })).not.toBe(eventId(base))
  })

  it('unterscheidet Quellen mit gleicher Fremd-ID', () => {
    expect(eventId({ ...base, source: 'fmp' })).not.toBe(eventId(base))
  })

  it('ist 32 Zeichen lang und hexadezimal', () => {
    expect(eventId(base)).toMatch(/^[0-9a-f]{32}$/)
  })

  it('macht die kanonische Zeichenkette pruefbar', () => {
    expect(canonicalEventString(base)).toBe(
      'SEC-EDGAR|000110465926055376|FMS|2026-05-06T11:02:00.000Z',
    )
  })

  it('weist ungueltige Zeitstempel zurueck, statt still zu hashen', () => {
    expect(() => eventId({ ...base, occurredAt: new Date('nicht-datum') })).toThrow()
  })

  it('weist einen leeren Ticker zurueck', () => {
    expect(() => eventId({ ...base, ticker: '   ' })).toThrow()
  })
})

describe('normalizeTimestamp', () => {
  it('schneidet auf Sekunden ab, statt zu runden', () => {
    expect(normalizeTimestamp(new Date('2026-05-06T11:02:00.999Z'))).toBe(
      '2026-05-06T11:02:00.000Z',
    )
  })
})
