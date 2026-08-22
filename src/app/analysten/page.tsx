import Link from 'next/link'
import { Disclaimer } from '@/components/Disclaimer'
import { loadAnalystView } from '@/data/load'
import { ANALYST_ACTION_LABEL } from '@/domain/analyst-actions'
import { formatDay } from '@/lib/format'

export const revalidate = 300

export default async function AnalystenPage() {
  const state = await loadAnalystView()
  const asOf = state.fetchedAt === null ? null : state.fetchedAt.toISOString().slice(0, 10)

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
          <strong>Noch kein Abruf.</strong> Sobald du in der Uebersicht auf{' '}
          <em>Daten aktualisieren</em> geklickt hast, stehen hier die neuesten Handlungen. Push
          geht an Telegram, wenn <code>TELEGRAM_BOT_TOKEN</code> und{' '}
          <code>TELEGRAM_CHAT_ID</code> gesetzt sind.
        </p>
      ) : (
        <p className="source-banner">
          Quelle <strong>Yahoo Upgrade-Historie</strong>. Stand {formatDay(asOf)}.{' '}
          {state.actions.length} gemerkte Meldungen.
        </p>
      )}

      {state.note !== null && (
        <ul className="warnings">
          <li>{state.note}</li>
        </ul>
      )}

      {state.actions.length === 0 ? (
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
            {state.actions.map((alert) => (
              <tr key={alert.sourceEventId}>
                <td>{formatDay(alert.occurredAt.toISOString().slice(0, 10))}</td>
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
