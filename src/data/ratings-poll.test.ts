import { describe, expect, it } from 'vitest'
import type { AnalystAction } from '../domain/analyst-actions'
import { applyIncomingActions, ratingsStateChanged } from './ratings-poll'
import { EMPTY_RATINGS_STATE } from './ratings-state'

function action(id: string, ticker = 'AAPL'): AnalystAction {
  return {
    sourceEventId: id,
    ticker,
    firm: 'UBS',
    action: 'upgrade',
    gradeFrom: 'Neutral',
    gradeTo: 'Buy',
    occurredAt: new Date('2026-08-20T00:00:00Z'),
  }
}

const ingestedAt = new Date('2026-08-22T00:00:00Z')

describe('applyIncomingActions', () => {
  it('initialisiert ohne Alerts', () => {
    const { next, newActions } = applyIncomingActions(
      EMPTY_RATINGS_STATE,
      [action('one')],
      ingestedAt,
      [],
    )
    expect(newActions).toEqual([])
    expect(next.initialized).toBe(true)
    expect(next.seenIds).toEqual(['one'])
    expect(next.alerts).toEqual([])
  })

  it('haengt danach nur neue Handlungen an', () => {
    const first = applyIncomingActions(EMPTY_RATINGS_STATE, [action('one')], ingestedAt, [])
    const second = applyIncomingActions(first.next, [action('one'), action('two')], ingestedAt, [])
    expect(second.newActions.map((item) => item.sourceEventId)).toEqual(['two'])
    expect(second.next.alerts[0]?.sourceEventId).toBe('two')
  })

  it('erkennt, wann der Stand wirklich neu ist', () => {
    const first = applyIncomingActions(EMPTY_RATINGS_STATE, [action('one')], ingestedAt, [])
    expect(ratingsStateChanged(EMPTY_RATINGS_STATE, first.next)).toBe(true)
    const again = applyIncomingActions(first.next, [action('one')], ingestedAt, ['Warnung'])
    expect(ratingsStateChanged(first.next, again.next)).toBe(false)
  })
})
