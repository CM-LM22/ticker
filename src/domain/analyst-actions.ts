import type { RatingAction } from './event'

/**
 * Eine veroeffentlichte Analystenhandlung, so wie sie die Gratisquellen
 * hergeben: Haus, Richtung, Einstufung. Nicht der Research-Text; den
 * liefert kein Free Tier.
 */
export interface AnalystAction {
  sourceEventId: string
  ticker: string
  firm: string
  action: RatingAction
  gradeFrom: string | null
  gradeTo: string | null
  occurredAt: Date
}

export interface AnalystPollResult {
  /** Leer beim ersten erfolgreichen Lauf, siehe E7. */
  readonly newActions: readonly AnalystAction[]
  readonly nextIds: ReadonlySet<string>
  readonly initialized: boolean
}

/**
 * Vergleicht den neuen Abruf mit den schon gesehenen Fremd-IDs.
 *
 * `previousIds === null` heisst: noch nie erfolgreich gepollt. Dann
 * merken wir uns den Stand und loesen nichts aus — sonst waere der
 * Erstlauf ein Alert-Sturm aus jahrealten Upgrades.
 */
export function selectNewAnalystActions(
  previousIds: ReadonlySet<string> | null,
  incoming: readonly AnalystAction[],
): AnalystPollResult {
  const incomingIds = incoming.map((action) => action.sourceEventId)
  const nextIds = new Set(previousIds ?? [])
  for (const id of incomingIds) nextIds.add(id)

  if (previousIds === null) {
    return { newActions: [], nextIds, initialized: true }
  }

  const known = previousIds
  return {
    newActions: incoming.filter((action) => !known.has(action.sourceEventId)),
    nextIds,
    initialized: true,
  }
}

export const ANALYST_ACTION_LABEL: Record<RatingAction, string> = {
  initiate: 'Aufnahme',
  upgrade: 'Upgrade',
  downgrade: 'Downgrade',
  change: 'Aenderung',
  price_target: 'Kursziel',
  drop: 'nicht mehr gelistet',
}

export function formatAnalystActionLine(action: AnalystAction): string {
  const label = ANALYST_ACTION_LABEL[action.action]
  const grades =
    action.gradeFrom !== null && action.gradeTo !== null
      ? `${action.gradeFrom} → ${action.gradeTo}`
      : (action.gradeTo ?? action.gradeFrom)
  const suffix = grades === null || grades.length === 0 ? '' : ` (${grades})`
  return `${action.ticker} · ${action.firm}: ${label}${suffix}`
}

export function formatAnalystDigest(actions: readonly AnalystAction[]): {
  title: string
  body: string
} {
  if (actions.length === 0) {
    return { title: 'Keine neuen Analystenmeldungen', body: '' }
  }
  if (actions.length === 1) {
    const only = actions[0]
    if (only === undefined) return { title: 'Keine neuen Analystenmeldungen', body: '' }
    return {
      title: `Analystenmeldung ${only.ticker}`,
      body: formatAnalystActionLine(only),
    }
  }
  return {
    title: `${actions.length} neue Analystenmeldungen`,
    body: actions.map(formatAnalystActionLine).join('\n'),
  }
}

/** Telegram erlaubt 4096 Zeichen. Der Disclaimer braucht Platz. */
export const TELEGRAM_TEXT_LIMIT = 3900

export function clipDigestBody(body: string, limit = TELEGRAM_TEXT_LIMIT): string {
  if (body.length <= limit) return body
  const cut = body.slice(0, limit)
  const lastBreak = cut.lastIndexOf('\n')
  const kept = lastBreak > 40 ? cut.slice(0, lastBreak) : cut
  return `${kept}\n… weitere Meldungen in der Oberflaeche.`
}
