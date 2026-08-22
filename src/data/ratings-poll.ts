import { selectNewAnalystActions } from '../domain/analyst-actions'
import type { AnalystAction } from '../domain/analyst-actions'
import { mergeAlerts, previousIdsFrom, toStoredAlert } from './ratings-state'
import type { RatingsState } from './ratings-state'

export function applyIncomingActions(
  state: RatingsState,
  incoming: readonly AnalystAction[],
  ingestedAt: Date,
  warnings: readonly string[],
): { next: RatingsState; newActions: readonly AnalystAction[] } {
  const result = selectNewAnalystActions(previousIdsFrom(state), incoming)
  const stored = result.newActions.map((action) => toStoredAlert(action, ingestedAt))
  return {
    newActions: result.newActions,
    next: {
      fetchedAt: ingestedAt.toISOString(),
      initialized: result.initialized,
      source: state.source,
      seenIds: [...result.nextIds],
      alerts: mergeAlerts(state.alerts, stored),
      warnings: [...warnings],
    },
  }
}

export function ratingsStateChanged(previous: RatingsState, next: RatingsState): boolean {
  if (previous.initialized !== next.initialized) return true
  if (previous.seenIds.length !== next.seenIds.length) return true
  if (previous.alerts.length !== next.alerts.length) return true
  return previous.alerts[0]?.sourceEventId !== next.alerts[0]?.sourceEventId
}
