import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { z } from 'zod'
import { RatingActionSchema } from '../domain/event'
import type { AnalystAction } from '../domain/analyst-actions'

const AlertRecordSchema = z.object({
  sourceEventId: z.string().min(1),
  ticker: z.string().min(1),
  firm: z.string().min(1),
  action: RatingActionSchema,
  gradeFrom: z.string().nullable(),
  gradeTo: z.string().nullable(),
  occurredAt: z.string(),
  ingestedAt: z.string(),
})

export const RatingsStateSchema = z.object({
  fetchedAt: z.string().nullable(),
  initialized: z.boolean(),
  source: z.string(),
  seenIds: z.array(z.string()),
  alerts: z.array(AlertRecordSchema),
  warnings: z.array(z.string()),
})

export type RatingsState = z.infer<typeof RatingsStateSchema>
export type StoredAnalystAlert = z.infer<typeof AlertRecordSchema>

export const EMPTY_RATINGS_STATE: RatingsState = {
  fetchedAt: null,
  initialized: false,
  source: 'yahoo-upgrade-history',
  seenIds: [],
  alerts: [],
  warnings: ['Noch kein Abruf gelaufen.'],
}

const STATE_PATH = join(process.cwd(), 'data', 'ratings-state.json')
const MAX_ALERTS = 80

export function loadRatingsState(): RatingsState {
  let raw: string
  try {
    raw = readFileSync(STATE_PATH, 'utf8')
  } catch {
    return EMPTY_RATINGS_STATE
  }
  const parsed = RatingsStateSchema.safeParse(JSON.parse(raw))
  if (!parsed.success) {
    console.warn('data/ratings-state.json ist unbrauchbar:', parsed.error.message)
    return EMPTY_RATINGS_STATE
  }
  return parsed.data
}

export function toStoredAlert(action: AnalystAction, ingestedAt: Date): StoredAnalystAlert {
  return {
    sourceEventId: action.sourceEventId,
    ticker: action.ticker,
    firm: action.firm,
    action: action.action,
    gradeFrom: action.gradeFrom,
    gradeTo: action.gradeTo,
    occurredAt: action.occurredAt.toISOString(),
    ingestedAt: ingestedAt.toISOString(),
  }
}

export function mergeAlerts(
  previous: readonly StoredAnalystAlert[],
  incoming: readonly StoredAnalystAlert[],
): StoredAnalystAlert[] {
  return [...incoming, ...previous].slice(0, MAX_ALERTS)
}

export function previousIdsFrom(state: RatingsState): ReadonlySet<string> | null {
  if (!state.initialized) return null
  return new Set(state.seenIds)
}
