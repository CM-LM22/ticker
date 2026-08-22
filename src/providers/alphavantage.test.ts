import { describe, expect, it } from 'vitest'
import {
  AlphaVantagePriceProvider,
  alphaVantageSymbol,
  alphaVantageUrl,
  parseAlphaVantageDaily,
  parseSymbolSearch,
} from './alphavantage'
import { ProviderError } from './types'

const antwort = {
  'Meta Data': { '2. Symbol': 'SAP.DEX' },
  'Time Series (Daily)': {
    '2026-08-21': { '1. open': '228.10', '2. high': '230.40', '3. low': '227.00', '4. close': '229.55', '5. volume': '1200000' },
    '2026-08-20': { '1. open': '226.00', '2. high': '228.90', '3. low': '225.50', '4. close': '228.10', '5. volume': '990000' },
  },
}

describe('alphaVantageSymbol', () => {
  it('haengt an XETRA-Titel das dokumentierte Suffix', () => {
    expect(alphaVantageSymbol({ ticker: 'SAP', venue: 'XETRA' })).toBe('SAP.DEX')
    expect(alphaVantageSymbol({ ticker: 'muv2', venue: 'XETRA' })).toBe('MUV2.DEX')
  })

  it('laesst US-Titel unangetastet', () => {
    expect(alphaVantageSymbol({ ticker: 'AAPL', venue: 'NASDAQ' })).toBe('AAPL')
  })
})

describe('parseAlphaVantageDaily', () => {
  it('liest die Reihe aufsteigend sortiert in Euro', () => {
    const series = parseAlphaVantageDaily(antwort, { ticker: 'SAP', currency: 'EUR' })
    expect(series.bars.map((bar) => bar.date)).toEqual(['2026-08-20', '2026-08-21'])
    expect(series.bars[1]).toMatchObject({ close: 229.55 })
    expect(series.currency).toBe('EUR')
  })

  it('erkennt die Tageslimit-Absage, die mit HTTP 200 kommt', () => {
    // Alpha Vantage meldet Grenzen in einem Textfeld bei Status 200.
    const limit = { Note: 'Thank you ... 25 requests per day ...' }
    try {
      parseAlphaVantageDaily(limit, { ticker: 'SAP', currency: 'EUR' })
      throw new Error('haette werfen muessen')
    } catch (fehler) {
      expect(fehler).toBeInstanceOf(ProviderError)
      expect((fehler as ProviderError).message).toContain('25 requests')
      // Das Limit erholt sich erst morgen, wiederholen bringt nichts.
      expect((fehler as ProviderError).retryable).toBe(false)
    }
  })

  it('erkennt den Hinweis auf eine Bezahlfunktion', () => {
    const premium = { Information: 'This is a premium endpoint ...' }
    expect(() => parseAlphaVantageDaily(premium, { ticker: 'SAP', currency: 'EUR' })).toThrow(
      /premium/,
    )
  })

  it('erkennt die Fehlermeldung zu unbekannten Kuerzeln', () => {
    const fehler = { 'Error Message': 'Invalid API call ...' }
    expect(() => parseAlphaVantageDaily(fehler, { ticker: 'XX', currency: 'EUR' })).toThrow(
      /Invalid API call/,
    )
  })

  it('ueberspringt kaputte Tage, statt alles zu verwerfen', () => {
    const mitMuell = {
      'Time Series (Daily)': {
        '2026-08-21': { '1. open': 'kaputt', '2. high': '1', '3. low': '1', '4. close': '1' },
        '2026-08-20': { '1. open': '2', '2. high': '2', '3. low': '2', '4. close': '2' },
      },
    }
    const series = parseAlphaVantageDaily(mitMuell, { ticker: 'SAP', currency: 'EUR' })
    expect(series.bars).toHaveLength(1)
  })

  it('weist eine Antwort ohne Reihe zurueck', () => {
    expect(() => parseAlphaVantageDaily({}, { ticker: 'SAP', currency: 'EUR' })).toThrow(
      /keine Kursreihe/,
    )
  })
})

describe('AlphaVantagePriceProvider', () => {
  const sap = { ticker: 'SAP', name: 'SAP SE', venue: 'XETRA' as const, expectedCoverage: 'sec_foreign' as const }

  it('fragt mit Suffix und Ausgabegroesse an und schneidet auf den Stichtag zu', async () => {
    const urls: string[] = []
    const provider = new AlphaVantagePriceProvider('geheim', 'full', (url) => {
      urls.push(url)
      return Promise.resolve(antwort)
    })
    const series = await provider.fetchDailyHistory({ instrument: sap, since: '2026-08-21' })
    expect(urls[0]).toContain('symbol=SAP.DEX')
    expect(urls[0]).toContain('outputsize=full')
    expect(series.bars).toHaveLength(1)
  })

  it('verlangt einen Schluessel', async () => {
    const provider = new AlphaVantagePriceProvider('')
    await expect(provider.fetchDailyHistory({ instrument: sap, since: '2026-01-01' })).rejects.toThrow(
      /ALPHA_VANTAGE_API_KEY fehlt/,
    )
  })
})

describe('alphaVantageUrl', () => {
  it('setzt Funktion, Symbol und Groesse', () => {
    const url = alphaVantageUrl('SAP.DEX', 'k', 'compact')
    expect(url).toContain('function=TIME_SERIES_DAILY')
    expect(url).toContain('outputsize=compact')
  })
})

describe('parseSymbolSearch', () => {
  it('liefert nur XETRA-Treffer und schneidet das Suffix ab', () => {
    const treffer = parseSymbolSearch({
      bestMatches: [
        { '1. symbol': 'SAP.DEX', '2. name': 'SAP SE', '4. region': 'XETRA', '8. currency': 'EUR' },
        { '1. symbol': 'SAP', '2. name': 'SAP SE ADR', '4. region': 'United States', '8. currency': 'USD' },
        { '1. symbol': 'SAP.FRK', '2. name': 'SAP SE', '4. region': 'Frankfurt', '8. currency': 'EUR' },
      ],
    })
    expect(treffer).toEqual([{ ticker: 'SAP', name: 'SAP SE', currency: 'EUR' }])
  })

  it('gibt eine leere Liste bei fehlenden bestMatches', () => {
    expect(parseSymbolSearch({})).toEqual([])
  })

  it('erkennt die Absage-in-200 auch bei der Suche', () => {
    expect(() =>
      parseSymbolSearch({ Information: 'Thank you for using Alpha Vantage! Our standard API rate limit is 25 requests per day.' }),
    ).toThrow(/25 requests/)
  })

  it('ueberspringt kaputte Einzeltreffer', () => {
    const treffer = parseSymbolSearch({
      bestMatches: [
        null,
        { '1. symbol': 'BMW.DEX' },
        { '1. symbol': 'BMW.DEX', '2. name': 'Bayerische Motoren Werke AG' },
      ],
    })
    expect(treffer).toEqual([
      { ticker: 'BMW', name: 'Bayerische Motoren Werke AG', currency: 'EUR' },
    ])
  })
})
