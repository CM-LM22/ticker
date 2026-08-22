import { describe, expect, it } from 'vitest'
import {
  clipDigestBody,
  formatAnalystActionLine,
  formatAnalystDigest,
  selectNewAnalystActions,
} from './analyst-actions'
import type { AnalystAction } from './analyst-actions'

function action(overrides: Partial<AnalystAction> = {}): AnalystAction {
  return {
    sourceEventId: 'AAPL|morgan stanley|1755734400|overweight|up',
    ticker: 'AAPL',
    firm: 'Morgan Stanley',
    action: 'upgrade',
    gradeFrom: 'Equal-Weight',
    gradeTo: 'Overweight',
    occurredAt: new Date('2025-08-21T00:00:00Z'),
    ...overrides,
  }
}

describe('selectNewAnalystActions', () => {
  const first = action()
  const second = action({
    sourceEventId: 'AAPL|ubs|1755820800|buy|init',
    firm: 'UBS',
    action: 'initiate',
    gradeFrom: null,
    gradeTo: 'Buy',
  })

  it('loest beim ersten Lauf nichts aus und merkt sich den Stand', () => {
    const result = selectNewAnalystActions(null, [first, second])
    expect(result.newActions).toEqual([])
    expect(result.initialized).toBe(true)
    expect(result.nextIds.size).toBe(2)
  })

  it('meldet nur wirklich neue Fremd-IDs', () => {
    const initial = selectNewAnalystActions(null, [first])
    const result = selectNewAnalystActions(initial.nextIds, [first, second])
    expect(result.newActions).toEqual([second])
  })

  it('meldet unveraenderte Abrufe nicht', () => {
    const initial = selectNewAnalystActions(null, [first])
    const result = selectNewAnalystActions(initial.nextIds, [first])
    expect(result.newActions).toEqual([])
  })

  it('behaelt alte IDs, auch wenn die Quelle sie nicht mehr liefert', () => {
    const initial = selectNewAnalystActions(null, [first, second])
    const result = selectNewAnalystActions(initial.nextIds, [second])
    expect(result.nextIds.has(first.sourceEventId)).toBe(true)
    expect(result.newActions).toEqual([])
  })
})

describe('formatAnalystDigest', () => {
  it('formuliert eine einzelne Meldung mit Ticker im Titel', () => {
    expect(formatAnalystDigest([action()])).toEqual({
      title: 'Analystenmeldung AAPL',
      body: 'AAPL · Morgan Stanley: Upgrade (Equal-Weight → Overweight)',
    })
  })

  it('zaehlt mehrere Meldungen', () => {
    const digest = formatAnalystDigest([
      action(),
      action({ ticker: 'MSFT', firm: 'UBS', action: 'initiate', gradeFrom: null, gradeTo: 'Buy' }),
    ])
    expect(digest.title).toBe('2 neue Analystenmeldungen')
    expect(digest.body).toContain('MSFT · UBS: Aufnahme (Buy)')
  })

  it('schneidet lange Digest-Texte vor dem Telegram-Limit', () => {
    const long = Array.from({ length: 80 }, (_, index) =>
      formatAnalystActionLine(action({ ticker: `T${index}`, firm: 'Haus'.repeat(20) })),
    ).join('\n')
    const clipped = clipDigestBody(long, 200)
    expect(clipped.length).toBeLessThanOrEqual(240)
    expect(clipped).toContain('weitere Meldungen')
  })
})
