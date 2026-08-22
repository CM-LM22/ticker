import { describe, expect, it } from 'vitest'
import { ProviderError } from './types'
import {
  YahooRatingsProvider,
  parseYahooUpgradeHistory,
  yahooSymbol,
  yahooUpgradeHistoryUrl,
} from './yahoo-ratings'

const payload = {
  quoteSummary: {
    result: [
      {
        upgradeDowngradeHistory: {
          history: [
            {
              epochGradeDate: 1755734400,
              firm: 'Morgan Stanley',
              toGrade: 'Overweight',
              fromGrade: 'Equal-Weight',
              action: 'up',
            },
            {
              epochGradeDate: 1755820800,
              firm: 'UBS',
              toGrade: 'Buy',
              fromGrade: '',
              action: 'init',
            },
            {
              epochGradeDate: 1755907200,
              firm: 'Ghost',
              toGrade: 'Hold',
              fromGrade: 'Hold',
              action: 'unknown-code',
            },
          ],
        },
      },
    ],
    error: null,
  },
}

describe('yahooSymbol', () => {
  it('haengt .DE an Xetra-Titel', () => {
    expect(yahooSymbol({ ticker: 'AAPL', venue: 'NASDAQ' })).toBe('AAPL')
    expect(yahooSymbol({ ticker: 'SIE', venue: 'XETRA' })).toBe('SIE.DE')
  })
})

describe('parseYahooUpgradeHistory', () => {
  const actions = parseYahooUpgradeHistory(payload, 'AAPL')

  it('liest Upgrade und Aufnahme, ueberspringt unbekannte Aktionen', () => {
    expect(actions).toHaveLength(2)
    expect(actions[0]).toMatchObject({
      ticker: 'AAPL',
      firm: 'Morgan Stanley',
      action: 'upgrade',
      gradeFrom: 'Equal-Weight',
      gradeTo: 'Overweight',
    })
    expect(actions[1]).toMatchObject({ action: 'initiate', firm: 'UBS', gradeFrom: null })
  })

  it('bildet eine stabile Fremd-ID', () => {
    expect(actions[0]?.sourceEventId).toBe('AAPL|morgan stanley|1755734400|overweight|up')
  })

  it('weist Muell zurueck', () => {
    expect(() => parseYahooUpgradeHistory({ not: 'this' }, 'AAPL')).toThrow(ProviderError)
  })
})

describe('YahooRatingsProvider', () => {
  it('fragt das Kuerzel der Boersenseite ab', async () => {
    const seen: string[] = []
    const provider = new YahooRatingsProvider(async (url) => {
      seen.push(url)
      return payload
    })
    const actions = await provider.fetchHistory({
      ticker: 'SIE',
      name: 'Siemens AG',
      venue: 'XETRA',
      expectedCoverage: 'none',
    })
    expect(seen[0]).toBe(yahooUpgradeHistoryUrl('SIE.DE'))
    expect(actions).toHaveLength(2)
  })
})
