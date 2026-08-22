import { describe, expect, it } from 'vitest'
import {
  finnhubSymbolFor,
  parseQuote,
  parseRecommendationTrends,
} from './finnhub'
import { ProviderError } from './types'

describe('finnhubSymbolFor', () => {
  it('nimmt bei US-Titeln das Kuerzel selbst', () => {
    expect(finnhubSymbolFor({ ticker: 'AAPL', venue: 'NASDAQ' })).toBe('AAPL')
  })

  it('nimmt bei XETRA-Titeln den US-Hinweis', () => {
    expect(finnhubSymbolFor({ ticker: 'DBK', venue: 'XETRA', secTickerHint: 'DB' })).toBe('DB')
  })

  it('liefert null fuer XETRA-Titel ohne US-Notierung, statt zu raten', () => {
    expect(finnhubSymbolFor({ ticker: 'SIE', venue: 'XETRA' })).toBeNull()
  })
})

describe('parseQuote', () => {
  const antwort = { c: 229.1, d: 1.35, dp: 0.59, h: 230, l: 227, o: 228.8, pc: 227.75, t: 1787347800 }

  it('liest den Kurs samt Veraenderung', () => {
    const quote = parseQuote(antwort, 'AAPL', 'AAPL')
    expect(quote).toMatchObject({ price: 229.1, changePct: 0.59, currency: 'USD' })
  })

  it('haelt die Nullantwort auf unbekannte Kuerzel nicht fuer einen Kurs', () => {
    // Finnhub meldet unbekannte Kuerzel nicht als Fehler, sondern mit
    // lauter Nullen. Eine Null als Kurs zu speichern waere schlimmer
    // als keine.
    const nullen = { c: 0, d: null, dp: null, h: 0, l: 0, o: 0, pc: 0, t: 0 }
    expect(() => parseQuote(nullen, 'XXXX', 'XXXX')).toThrow(/unbekanntes Kuerzel/)
  })

  it('weist Unsinn zurueck', () => {
    expect(() => parseQuote('<html>', 'AAPL', 'AAPL')).toThrow(ProviderError)
  })
})

describe('parseRecommendationTrends', () => {
  it('liest Monatsstaende und kuerzt die Periode auf den Monat', () => {
    const trends = parseRecommendationTrends(
      [
        { period: '2026-08-01', strongBuy: 12, buy: 18, hold: 10, sell: 2, strongSell: 1, symbol: 'AAPL' },
        { period: '2026-07-01', strongBuy: 11, buy: 19, hold: 10, sell: 2, strongSell: 1, symbol: 'AAPL' },
      ],
      'AAPL',
    )
    expect(trends).toHaveLength(2)
    expect(trends[0]).toMatchObject({ period: '2026-08', strongBuy: 12 })
  })

  it('ueberspringt kaputte Zeilen, statt alles zu verwerfen', () => {
    const trends = parseRecommendationTrends(
      [{ period: '2026-08-01', strongBuy: 1, buy: 2, hold: 3, sell: 0, strongSell: 0 }, { kaputt: true }],
      'AAPL',
    )
    expect(trends).toHaveLength(1)
  })

  it('weist eine Nicht-Liste zurueck', () => {
    expect(() => parseRecommendationTrends({ error: 'x' }, 'AAPL')).toThrow(ProviderError)
  })
})
