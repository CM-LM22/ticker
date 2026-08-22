import { describe, expect, it } from 'vitest'
import { mergeWatchlist } from './gesamt-watchlist'
import type { WatchlistEntry } from '../domain/instrument'

function entry(ticker: string, name = `${ticker} Inc`): WatchlistEntry {
  return { ticker, name, venue: 'NASDAQ', expectedCoverage: 'sec_domestic' } as WatchlistEntry
}

describe('mergeWatchlist', () => {
  it('haengt eigene Titel hinter den Grundstock', () => {
    const gemerged = mergeWatchlist([entry('AAPL'), entry('MSFT')], [entry('SHOP')])
    expect(gemerged.map((eintrag) => eintrag.ticker)).toEqual(['AAPL', 'MSFT', 'SHOP'])
  })

  it('laesst den Grundstock bei Kollisionen gewinnen', () => {
    const grundstock = [entry('AAPL', 'Apple Inc.')]
    const gemerged = mergeWatchlist(grundstock, [entry('AAPL', 'Faelschung AG'), entry('SHOP')])
    expect(gemerged).toHaveLength(2)
    expect(gemerged[0]?.name).toBe('Apple Inc.')
  })

  it('entfernt Duplikate auch innerhalb der eigenen Titel', () => {
    const gemerged = mergeWatchlist([], [entry('SHOP'), entry('SHOP')])
    expect(gemerged).toHaveLength(1)
  })
})
