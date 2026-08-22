import Link from 'next/link'
import { Disclaimer } from '@/components/Disclaimer'
import { loadRatingsState } from '@/data/ratings-state'
import { ANALYST_ACTION_LABEL } from '@/domain/analyst-actions'
import { formatDay } from '@/lib/format'

export const dynamic = 'force-static'

export default function AnalystenPage() {
  const state = loadRatingsState()
  const asOf = state.fetchedAt === null ? null : state.fetchedAt.slice(0, 10)

  return (
    <main>
      <p className="back">
        <Link href="/">← Uebersicht</Link>
      </p>

      <h1>Analystenmeldungen</h1>
      <p className="lede">
        Neue Rating-Aktionen zu den Watchlist-Titeln: Aufnahme, Upgrade, Downgrade, Aenderung.
        Das ist nicht der Research-Text der Haeuser; den gibt es kostenlos nicht. Der erste Abruf
        loest keine Meldungen aus.
      </p>

      {asOf === null ? (
        <p className="demo-banner">
          <strong>Noch kein Abruf.</strong> Sobald der Workflow <em>Analystenmeldungen holen</em>{' '}
          gelaufen ist, stehen hier die neuesten Handlungen. Push geht an Telegram, wenn{' '}
          <code>TELEGRAM_BOT_TOKEN</code> und <code>TELEGRAM_CHAT_ID</code> gesetzt sind.
        </p>
      ) : (
        <p className="source-banner">
          Quelle <strong>{state.source}</strong>. Stand {formatDay(asOf)}. {state.alerts.length}{' '}
          gemerkte Meldungen.
        </p>
      )}

      {state.warnings.length > 0 && (
        <ul className="warnings">
          {state.warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      )}

      {state.alerts.length === 0 ? (
        <p className="muted">Keine neuen Analystenmeldungen seit dem ersten Abruf.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Wann</th>
              <th>Titel</th>
              <th>Haus</th>
              <th>Handlung</th>
              <th>Einstufung</th>
            </tr>
          </thead>
          <tbody>
            {state.alerts.map((alert) => (
              <tr key={alert.sourceEventId}>
                <td>{formatDay(alert.occurredAt.slice(0, 10))}</td>
                <td>
                  <Link href={`/titel/${alert.ticker.toLowerCase()}`}>
                    <strong>{alert.ticker}</strong>
                  </Link>
                </td>
                <td>{alert.firm}</td>
                <td>{ANALYST_ACTION_LABEL[alert.action]}</td>
                <td>
                  {alert.gradeFrom !== null && alert.gradeTo !== null
                    ? `${alert.gradeFrom} → ${alert.gradeTo}`
                    : (alert.gradeTo ?? alert.gradeFrom ?? '—')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <Disclaimer />
    </main>
  )
}
