import { describe, expect, it } from 'vitest'
import {
  parseExchangeTickers,
  searchCompanies,
  venueForExchange,
} from './sec-suche'
import type { SucheEintrag } from './sec-suche'

const ROH = {
  fields: ['cik', 'name', 'ticker', 'exchange'],
  data: [
    [320193, 'Apple Inc.', 'AAPL', 'Nasdaq'],
    [1045810, 'NVIDIA CORP', 'NVDA', 'Nasdaq'],
    [1318605, 'Tesla, Inc.', 'TSLA', 'Nasdaq'],
    [19617, 'JPMORGAN CHASE & CO', 'JPM', 'NYSE'],
    [886982, 'GOLDMAN SACHS GROUP INC', 'GS', 'NYSE'],
    [1067983, 'BERKSHIRE HATHAWAY INC', 'BRK-B', 'NYSE'],
    [999999, 'OTC BEISPIEL AG', 'OTCB', 'OTC'],
    [888888, 'Ohne Boerse Inc', 'OHNE', null],
    ['kaputt', null, '', 'Nasdaq'], // unlesbare Zeile
  ],
}

describe('parseExchangeTickers', () => {
  it('liest Zeilen positionsbasiert und ueberspringt kaputte', () => {
    const eintraege = parseExchangeTickers(ROH)
    expect(eintraege).toHaveLength(8)
    const apple = eintraege.find((eintrag) => eintrag.ticker === 'AAPL')
    expect(apple).toEqual({
      cik: '0000320193',
      name: 'Apple Inc.',
      ticker: 'AAPL',
      exchange: 'Nasdaq',
    })
    const ohne = eintraege.find((eintrag) => eintrag.ticker === 'OHNE')
    expect(ohne?.exchange).toBe('')
  })

  it('wirft, wenn erwartete Felder fehlen', () => {
    expect(() =>
      parseExchangeTickers({ fields: ['cik', 'name'], data: [] }),
    ).toThrow(/Felder fehlen/)
  })
})

describe('venueForExchange', () => {
  it('kennt nur Nasdaq und NYSE', () => {
    expect(venueForExchange('Nasdaq')).toBe('NASDAQ')
    expect(venueForExchange('NYSE')).toBe('NYSE')
    expect(venueForExchange('OTC')).toBeNull()
    expect(venueForExchange('CBOE')).toBeNull()
    expect(venueForExchange('')).toBeNull()
  })
})

describe('searchCompanies', () => {
  const eintraege: SucheEintrag[] = parseExchangeTickers(ROH)

  it('verlangt mindestens zwei Zeichen', () => {
    expect(searchCompanies('a', eintraege)).toEqual([])
  })

  it('rangiert exakten Ticker vor Praefix vor Namenstreffer', () => {
    const treffer = searchCompanies('jpm', eintraege)
    expect(treffer[0]?.ticker).toBe('JPM')
    expect(treffer.find((eintrag) => eintrag.ticker === 'GS')).toBeUndefined()
  })

  it('findet ueber den Namen, gross- und kleinschreibungsblind', () => {
    const treffer = searchCompanies('apple', eintraege)
    expect(treffer.map((eintrag) => eintrag.ticker)).toContain('AAPL')
    const goldman = searchCompanies('goldman', eintraege)
    expect(goldman[0]?.ticker).toBe('GS')
  })

  it('begrenzt die Trefferzahl', () => {
    const viele: SucheEintrag[] = Array.from({ length: 20 }, (_, index) => ({
      cik: String(index).padStart(10, '0'),
      name: `Firma ${index}`,
      ticker: `FA${index}`,
      exchange: 'Nasdaq',
    }))
    expect(searchCompanies('fa', viele, 8)).toHaveLength(8)
  })
})
