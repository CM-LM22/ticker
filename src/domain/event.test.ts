import { describe, expect, it } from 'vitest'
import { EARNINGS_ITEM, MarketEventSchema } from './event'
import { eventId } from './idempotency'

const occurredAt = new Date('2026-07-30T20:31:00Z')

const appleEarnings8K = {
  id: eventId({
    source: 'sec-edgar',
    sourceEventId: '000032019326000073',
    ticker: 'AAPL',
    occurredAt,
  }),
  source: 'sec-edgar' as const,
  sourceEventId: '000032019326000073',
  ticker: 'AAPL',
  cik: '0000320193',
  occurredAt,
  ingestedAt: new Date('2026-07-30T20:45:12Z'),
  payload: {
    kind: 'filing' as const,
    form: '8-K' as const,
    items: [EARNINGS_ITEM, '9.01'],
    accessionNumber: '0000320193-26-000073',
    primaryDocumentUrl: 'https://www.sec.gov/Archives/edgar/data/320193/000032019326000073/a8-k.htm',
    reportDate: '2026-06-27',
    isEarningsRelease: true,
  },
}

describe('MarketEventSchema', () => {
  it('nimmt eine vollstaendige 8-K-Meldung an', () => {
    const parsed = MarketEventSchema.parse(appleEarnings8K)
    expect(parsed.payload.kind).toBe('filing')
  })

  it('weist eine unbekannte Formularart zurueck', () => {
    const broken = { ...appleEarnings8K, payload: { ...appleEarnings8K.payload, form: '11-K' } }
    expect(MarketEventSchema.safeParse(broken).success).toBe(false)
  })

  it('weist eine Meldung ohne belastbare Dokument-URL zurueck', () => {
    const broken = {
      ...appleEarnings8K,
      payload: { ...appleEarnings8K.payload, primaryDocumentUrl: 'irgendwas' },
    }
    expect(MarketEventSchema.safeParse(broken).success).toBe(false)
  })

  it('weist eine CIK zurueck, die nicht zehnstellig ist', () => {
    expect(MarketEventSchema.safeParse({ ...appleEarnings8K, cik: '320193' }).success).toBe(false)
  })

  it('unterscheidet die drei Ereignisarten am Feld kind', () => {
    const rating = {
      ...appleEarnings8K,
      source: 'fmp' as const,
      payload: {
        kind: 'rating_change' as const,
        firm: 'Morgan Stanley',
        action: 'upgrade' as const,
        gradeFrom: 'Equal-Weight',
        gradeTo: 'Overweight',
        priceTargetFrom: 220,
        priceTargetTo: 265,
        currency: 'USD',
      },
    }
    const parsed = MarketEventSchema.parse(rating)
    expect(parsed.payload.kind).toBe('rating_change')
  })
})
