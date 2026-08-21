import { describe, expect, it } from 'vitest'
import { diffRatings, gradeRank, normalizeFirm } from './ratings-diff'
import type { AnalystRating, RatingsSnapshot } from './ratings-diff'

function snapshot(ratings: AnalystRating[], fetchedAt = '2026-08-20T06:00:00Z'): RatingsSnapshot {
  return { ticker: 'SAP', provider: 'fake', fetchedAt: new Date(fetchedAt), ratings }
}

const goldman: AnalystRating = {
  firm: 'Goldman Sachs',
  grade: 'Buy',
  priceTarget: 280,
  currency: 'EUR',
}

describe('diffRatings', () => {
  it('meldet beim ersten Snapshot nichts', () => {
    expect(diffRatings(null, snapshot([goldman, { ...goldman, firm: 'UBS' }]))).toEqual([])
  })

  it('meldet unveraenderte Snapshots nicht', () => {
    expect(diffRatings(snapshot([goldman]), snapshot([{ ...goldman }]))).toEqual([])
  })

  it('erkennt eine Heraufstufung', () => {
    const changes = diffRatings(
      snapshot([{ ...goldman, grade: 'Neutral' }]),
      snapshot([{ ...goldman, grade: 'Buy' }]),
    )
    expect(changes).toHaveLength(1)
    expect(changes[0]).toMatchObject({ action: 'upgrade', gradeFrom: 'Neutral', gradeTo: 'Buy' })
  })

  it('erkennt eine Herabstufung', () => {
    const changes = diffRatings(
      snapshot([{ ...goldman, grade: 'Outperform' }]),
      snapshot([{ ...goldman, grade: 'Underperform' }]),
    )
    expect(changes[0]).toMatchObject({ action: 'downgrade' })
  })

  it('nennt eine Aenderung ohne bekannte Skala change, nicht upgrade', () => {
    const changes = diffRatings(
      snapshot([{ ...goldman, grade: 'Kaufen' }]),
      snapshot([{ ...goldman, grade: 'Halten' }]),
    )
    expect(changes[0]).toMatchObject({ action: 'change', gradeFrom: 'Kaufen', gradeTo: 'Halten' })
  })

  it('behandelt gleichwertige Schreibweisen nicht als Aenderung', () => {
    expect(diffRatings(snapshot([{ ...goldman, grade: 'buy' }]), snapshot([goldman]))).toEqual([])
  })

  it('erkennt ein neues Haus als Initiierung', () => {
    const changes = diffRatings(snapshot([goldman]), snapshot([goldman, { ...goldman, firm: 'UBS' }]))
    expect(changes).toHaveLength(1)
    expect(changes[0]).toMatchObject({ action: 'initiate', firm: 'UBS', gradeFrom: null })
  })

  it('erkennt ein bewegtes Kursziel bei gleicher Einstufung', () => {
    const changes = diffRatings(snapshot([goldman]), snapshot([{ ...goldman, priceTarget: 310 }]))
    expect(changes[0]).toMatchObject({
      action: 'price_target',
      priceTargetFrom: 280,
      priceTargetTo: 310,
    })
  })

  it('meldet bei gleichzeitiger Aenderung die Einstufung, traegt aber beide Kursziele', () => {
    const changes = diffRatings(
      snapshot([goldman]),
      snapshot([{ ...goldman, grade: 'Hold', priceTarget: 240 }]),
    )
    expect(changes).toHaveLength(1)
    expect(changes[0]).toMatchObject({
      action: 'downgrade',
      priceTargetFrom: 280,
      priceTargetTo: 240,
    })
  })

  it('verschweigt fallengelassene Ratings, solange emitDrops aus ist', () => {
    expect(diffRatings(snapshot([goldman, { ...goldman, firm: 'UBS' }]), snapshot([goldman]))).toEqual(
      [],
    )
  })

  it('meldet fallengelassene Ratings nur auf ausdrueckliche Anforderung', () => {
    const changes = diffRatings(
      snapshot([goldman, { ...goldman, firm: 'UBS' }]),
      snapshot([goldman]),
      { emitDrops: true },
    )
    expect(changes).toHaveLength(1)
    expect(changes[0]).toMatchObject({ action: 'drop', firm: 'UBS', gradeTo: null })
  })

  it('haelt einen leeren Snapshot fuer einen kaputten Abruf, nicht fuer einen Rueckzug', () => {
    expect(diffRatings(snapshot([goldman]), snapshot([]), { emitDrops: true })).toEqual([])
  })

  it('nimmt bei doppelt gelistetem Haus den ersten, also neuesten Eintrag', () => {
    const changes = diffRatings(
      snapshot([{ ...goldman, grade: 'Hold' }]),
      snapshot([goldman, { ...goldman, grade: 'Sell' }]),
    )
    expect(changes[0]).toMatchObject({ action: 'upgrade', gradeTo: 'Buy' })
  })

  it('wehrt sich gegen den Vergleich zweier verschiedener Titel', () => {
    const other = { ...snapshot([goldman]), ticker: 'ASML' }
    expect(() => diffRatings(snapshot([goldman]), other)).toThrow()
  })
})

describe('normalizeFirm', () => {
  it('ignoriert Punkte und Mehrfachleerzeichen', () => {
    expect(normalizeFirm('  J.P.  Morgan ')).toBe(normalizeFirm('JP Morgan'))
  })
})

describe('gradeRank', () => {
  it('ordnet bekannte Einstufungen ein', () => {
    expect(gradeRank('Strong Buy')).toBeGreaterThan(gradeRank('Buy') ?? 0)
    expect(gradeRank('equal-weight')).toBe(gradeRank('Neutral'))
  })

  it('gibt null fuer unbekannte Einstufungen zurueck', () => {
    expect(gradeRank('Kaufen')).toBeNull()
    expect(gradeRank(null)).toBeNull()
  })
})
