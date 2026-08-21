import { describe, expect, it } from 'vitest'
import { WATCHLIST, watchlistByVenue } from './watchlist'
import { WatchlistIndex } from '../domain/watchlist-match'

describe('WATCHLIST', () => {
  it('enthaelt 20 Nasdaq- und 20 DAX-Titel', () => {
    expect(watchlistByVenue('NASDAQ')).toHaveLength(20)
    expect(watchlistByVenue('XETRA')).toHaveLength(20)
    expect(WATCHLIST).toHaveLength(40)
  })

  it('fuehrt keinen Titel doppelt', () => {
    const keys = WATCHLIST.map((entry) => `${entry.venue}:${entry.ticker}`)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('haelt Kuerzel und US-Hinweis kollisionsfrei, damit Matching eindeutig bleibt', () => {
    const index = WatchlistIndex.from(WATCHLIST)
    for (const entry of WATCHLIST) {
      const result = index.match({ ticker: entry.ticker, venue: entry.venue })
      expect(result.status).toBe('matched')
    }
  })

  it('laesst CIK und ISIN offen, bis der Abdeckungstest sie belegt', () => {
    for (const entry of WATCHLIST) {
      expect(entry.cik).toBeUndefined()
      expect(entry.isin).toBeUndefined()
    }
  })
})
