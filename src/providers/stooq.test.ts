import { describe, expect, it } from 'vitest'
import { StooqPriceProvider, parseStooqCsv, stooqCurrency, stooqSymbol } from './stooq'
import { ProviderError } from './types'
import type { WatchlistEntry } from '../domain/instrument'

const csv = `Date,Open,High,Low,Close,Volume
2026-08-19,226.01,227.50,225.00,226.40,34567890
2026-08-20,226.50,229.10,226.10,228.75,29876543
2026-08-21,228.80,230.00,227.20,229.10,31234567
`

const apple: WatchlistEntry = {
  ticker: 'AAPL',
  name: 'Apple Inc.',
  venue: 'NASDAQ',
  expectedCoverage: 'sec_domestic',
}

describe('stooqSymbol', () => {
  it('haengt das Laenderkuerzel an', () => {
    expect(stooqSymbol(apple)).toBe('aapl.us')
    expect(stooqSymbol({ ticker: 'SAP', venue: 'XETRA' })).toBe('sap.de')
  })

  it('schreibt Punkte im Kuerzel als Bindestrich', () => {
    expect(stooqSymbol({ ticker: 'BRK.B', venue: 'NYSE' })).toBe('brk-b.us')
  })

  it('leitet die Waehrung aus dem Handelsplatz ab', () => {
    expect(stooqCurrency(apple)).toBe('USD')
    expect(stooqCurrency({ venue: 'XETRA' })).toBe('EUR')
  })
})

describe('parseStooqCsv', () => {
  const parsed = parseStooqCsv(csv, { ticker: 'AAPL', currency: 'USD' })

  it('liest alle Handelstage', () => {
    expect(parsed.bars).toHaveLength(3)
    expect(parsed.bars[0]?.date).toBe('2026-08-19')
    expect(parsed.bars[2]?.close).toBe(229.1)
    expect(parsed.currency).toBe('USD')
  })

  it('kommt mit Zeilenenden im Windows-Format zurecht', () => {
    expect(parseStooqCsv(csv.replace(/\n/g, '\r\n'), { ticker: 'AAPL', currency: 'USD' }).bars)
      .toHaveLength(3)
  })

  it('sortiert aufsteigend, egal wie die Antwort kommt', () => {
    const reversed = [csv.split('\n')[0], ...csv.split('\n').slice(1).reverse()].join('\n')
    const result = parseStooqCsv(reversed, { ticker: 'AAPL', currency: 'USD' })
    expect(result.bars.map((bar) => bar.date)).toEqual([
      '2026-08-19',
      '2026-08-20',
      '2026-08-21',
    ])
  })

  it('ueberspringt Tage ohne Kurs, statt null zu rechnen', () => {
    const withGap = csv.replace('226.50,229.10,226.10,228.75', 'N/D,N/D,N/D,N/D')
    expect(parseStooqCsv(withGap, { ticker: 'AAPL', currency: 'USD' }).bars).toHaveLength(2)
  })

  it('nimmt ein fehlendes Volumen hin', () => {
    const noVolume = csv.replace(',34567890', ',N/D')
    expect(parseStooqCsv(noVolume, { ticker: 'AAPL', currency: 'USD' }).bars[0]?.volume).toBeNull()
  })

  it('haelt die Tageslimit-Meldung nicht fuer eine Kursreihe', () => {
    // Stooq antwortet darauf mit HTTP 200. Wer nur den Status prueft,
    // speichert diesen Satz als Kurs.
    expect(() => parseStooqCsv('Exceeded the daily hits limit', { ticker: 'AAPL', currency: 'USD' }))
      .toThrow(ProviderError)
    try {
      parseStooqCsv('Exceeded the daily hits limit', { ticker: 'AAPL', currency: 'USD' })
    } catch (error) {
      expect(error).toBeInstanceOf(ProviderError)
      expect((error as ProviderError).retryable).toBe(true)
    }
  })

  it('meldet ein unbekanntes Kuerzel als nicht wiederholbar', () => {
    try {
      parseStooqCsv('No data', { ticker: 'GIBTSNICHT', currency: 'USD' })
      throw new Error('haette werfen muessen')
    } catch (error) {
      expect(error).toBeInstanceOf(ProviderError)
      expect((error as ProviderError).retryable).toBe(false)
    }
  })

  it('wirft bei einer Antwort ohne einzige Kurszeile', () => {
    expect(() => parseStooqCsv('Date,Open,High,Low,Close,Volume\n', { ticker: 'X', currency: 'USD' }))
      .toThrow(/Keine verwertbaren Kurse/)
  })
})

describe('StooqPriceProvider', () => {
  it('ruft die richtige URL auf und schneidet auf den Stichtag zu', async () => {
    const urls: string[] = []
    const provider = new StooqPriceProvider((url) => {
      urls.push(url)
      return Promise.resolve(csv)
    })
    const series = await provider.fetchDailyHistory({ instrument: apple, since: '2026-08-20' })
    expect(urls[0]).toContain('s=aapl.us')
    expect(series.bars.map((bar) => bar.date)).toEqual(['2026-08-20', '2026-08-21'])
  })
})
