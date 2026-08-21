import { describe, expect, it } from 'vitest'
import { WatchlistIndex } from './watchlist-match'
import type { WatchlistEntry } from './instrument'

const sapXetra: WatchlistEntry = {
  ticker: 'SAP',
  name: 'SAP SE',
  venue: 'XETRA',
  cik: '0001000184',
  expectedCoverage: 'sec_foreign',
  secTickerHint: 'SAP',
}

const sapNyse: WatchlistEntry = {
  ticker: 'SAP',
  name: 'SAP SE (ADR)',
  venue: 'NYSE',
  expectedCoverage: 'sec_foreign',
}

const deutscheBank: WatchlistEntry = {
  ticker: 'DBK',
  name: 'Deutsche Bank AG',
  venue: 'XETRA',
  isin: 'DE0005140008',
  expectedCoverage: 'sec_foreign',
  secTickerHint: 'DB',
}

describe('WatchlistIndex', () => {
  it('matcht ueber die CIK, auch wenn sie ungepolstert hereinkommt', () => {
    const index = WatchlistIndex.from([sapXetra, deutscheBank])
    expect(index.match({ cik: '1000184' })).toMatchObject({ status: 'matched', via: 'cik' })
  })

  it('zieht die CIK dem Kuerzel vor', () => {
    const index = WatchlistIndex.from([sapXetra, deutscheBank])
    const result = index.match({ cik: '0001000184', ticker: 'DBK' })
    expect(result).toMatchObject({ status: 'matched', via: 'cik' })
    if (result.status === 'matched') expect(result.entry.name).toBe('SAP SE')
  })

  it('matcht ein EDGAR-Kuerzel ueber den US-Hinweis auf den XETRA-Eintrag', () => {
    const index = WatchlistIndex.from([deutscheBank])
    const result = index.match({ ticker: 'DB' })
    expect(result).toMatchObject({ status: 'matched', via: 'ticker' })
    if (result.status === 'matched') expect(result.entry.ticker).toBe('DBK')
  })

  it('matcht ueber die ISIN', () => {
    const index = WatchlistIndex.from([deutscheBank])
    expect(index.match({ isin: 'de0005140008' })).toMatchObject({ status: 'matched', via: 'isin' })
  })

  it('raet nicht, wenn dasselbe Kuerzel an zwei Plaetzen liegt', () => {
    const index = WatchlistIndex.from([sapXetra, sapNyse])
    const result = index.match({ ticker: 'SAP' })
    expect(result.status).toBe('ambiguous')
    if (result.status === 'ambiguous') expect(result.candidates).toHaveLength(2)
  })

  it('loest die Mehrdeutigkeit auf, sobald der Handelsplatz bekannt ist', () => {
    const index = WatchlistIndex.from([sapXetra, sapNyse])
    const result = index.match({ ticker: 'SAP', venue: 'NYSE' })
    expect(result).toMatchObject({ status: 'matched' })
    if (result.status === 'matched') expect(result.entry.venue).toBe('NYSE')
  })

  it('meldet unbekannte Titel als nicht gefunden, statt zu werfen', () => {
    const index = WatchlistIndex.from([sapXetra])
    expect(index.match({ ticker: 'ZZZZ', cik: '0000000042' })).toEqual({ status: 'not_found' })
  })

  it('kommt mit leeren Referenzen zurecht', () => {
    const index = WatchlistIndex.from([sapXetra])
    expect(index.match({})).toEqual({ status: 'not_found' })
    expect(index.match({ ticker: '  ', cik: '' })).toEqual({ status: 'not_found' })
  })
})
