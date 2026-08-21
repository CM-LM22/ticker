import { describe, expect, it } from 'vitest'
import { FakeFilingSource } from './fakes/fake-filing-source'
import { FakeNotifier } from './fakes/fake-notifier'
import { FakeRatingsProvider } from './fakes/fake-ratings-provider'
import type { Alert, RawFiling } from './types'
import type { WatchlistEntry } from '../domain/instrument'
import { diffRatings } from '../domain/ratings-diff'
import type { RatingsSnapshot } from '../domain/ratings-diff'

const now = new Date('2026-08-21T09:00:00Z')

const apple: WatchlistEntry = {
  ticker: 'AAPL',
  name: 'Apple Inc.',
  venue: 'NASDAQ',
  cik: '0000320193',
  expectedCoverage: 'sec_domestic',
}

const filing: RawFiling = {
  sourceEventId: '000032019326000073',
  cik: '0000320193',
  ticker: 'AAPL',
  form: '8-K',
  items: ['2.02'],
  accessionNumber: '0000320193-26-000073',
  primaryDocumentUrl: 'https://www.sec.gov/Archives/edgar/data/320193/x.htm',
  filedAt: new Date('2026-07-30T20:31:00Z'),
  reportDate: '2026-06-27',
}

describe('FakeFilingSource', () => {
  it('liefert nur Einreichungen ab dem Stichzeitpunkt', async () => {
    const source = new FakeFilingSource([filing], now)
    const before = await source.fetchFilings({
      instruments: [apple],
      since: new Date('2026-08-01T00:00:00Z'),
    })
    const after = await source.fetchFilings({
      instruments: [apple],
      since: new Date('2026-07-01T00:00:00Z'),
    })
    expect(before.items).toHaveLength(0)
    expect(after.items).toHaveLength(1)
  })

  it('filtert auf die angefragten CIKs', async () => {
    const source = new FakeFilingSource([filing], now)
    const result = await source.fetchFilings({
      instruments: [{ ...apple, cik: '0000789019' }],
      since: new Date('2026-01-01T00:00:00Z'),
    })
    expect(result.items).toHaveLength(0)
  })
})

describe('FakeRatingsProvider im Zusammenspiel mit diffRatings', () => {
  it('erzeugt aus zwei Snapshots einen Ereignisstrom', async () => {
    const first: RatingsSnapshot = {
      ticker: 'AAPL',
      provider: 'fake-ratings',
      fetchedAt: now,
      ratings: [{ firm: 'UBS', grade: 'Neutral', priceTarget: 210, currency: 'USD' }],
    }
    const second: RatingsSnapshot = {
      ...first,
      ratings: [{ firm: 'UBS', grade: 'Buy', priceTarget: 260, currency: 'USD' }],
    }
    const provider = new FakeRatingsProvider([first, second])

    const initial = await provider.fetchSnapshot(apple)
    expect(diffRatings(null, initial)).toEqual([])

    const next = await provider.fetchSnapshot(apple)
    expect(diffRatings(initial, next)[0]).toMatchObject({ action: 'upgrade' })
  })
})

describe('FakeNotifier', () => {
  const alert = { entry: apple, title: 'T', body: 'B' } as unknown as Alert

  it('protokolliert Erfolge', async () => {
    const notifier = new FakeNotifier(now)
    const result = await notifier.send(alert)
    expect(result.ok).toBe(true)
    expect(notifier.sent).toHaveLength(1)
  })

  it('meldet Fehlschlaege als wiederholbar, ohne den Alert zu verlieren', async () => {
    const notifier = new FakeNotifier(now, () => true)
    const result = await notifier.send(alert)
    expect(result).toMatchObject({ ok: false, retryable: true })
    expect(notifier.sent).toHaveLength(0)
  })
})
