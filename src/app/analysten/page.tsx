import Link from 'next/link'
import { Disclaimer } from '@/components/Disclaimer'
import { loadAnalystView } from '@/data/load'
import { ANALYST_ACTION_LABEL } from '@/domain/analyst-actions'
import { formatDay } from '@/lib/format'

export const revalidate = 300

/**
 * Analystenkonsens je Titel: wie viele Haeuser raten zu Kauf, Halten,
 * Verkauf, und wie hat sich das gegen den Vormonat verschoben.
 *
 * Einzelurteile mit Haus und Kursziel sind das bezahlte Produkt der
 * Banken; kostenlos gibt es die Verteilung, und deren Bewegung ist das
 * eigentliche Signal.
 */
export default async function AnalystenPage() {
  const state = await loadAnalystView()
  const asOf = state.fetchedAt === null ? null : state.fetchedAt.toISOString().slice(0, 10)

  return (
    <main>
      <p className="back">
        <Link href="/">← Uebersicht</Link>
      </p>

      <h1>Analystenkonsens</h1>
      <p className="lede">
        Verteilung der Empfehlungen je Titel und ihre Verschiebung zum Vormonat. Einzelne
        Analystenurteile mit Haus und Kursziel gibt es kostenlos nicht; die Verteilung schon,
        und ihre Bewegung ist das Signal. Nur fuer US-notierte Titel. Der erste Abruf loest
        keine Meldungen aus.
      </p>

      {!state.hasFinnhubKey ? (
        <p className="demo-banner">
          <strong>FINNHUB_API_KEY fehlt.</strong> Der Konsens kommt von Finnhub; der Schluessel
          ist kostenlos. In Vercel unter <em>Settings, Environment Variables</em> eintragen,
          neu deployen, dann in der Uebersicht <em>Daten aktualisieren</em> druecken.
        </p>
      ) : asOf === null ? (
        <p className="demo-banner">
          <strong>Noch kein Abruf.</strong> In der Uebersicht <em>Daten aktualisieren</em>{' '}
          druecken, dann steht hier der Stand. Push geht an Telegram, wenn{' '}
          <code>TELEGRAM_BOT_TOKEN</code> und <code>TELEGRAM_CHAT_ID</code> gesetzt sind.
        </p>
      ) : (
        <p className="source-banner">
          Quelle <strong>Finnhub</strong> (aggregierte Empfehlungen). Stand {formatDay(asOf)}.
        </p>
      )}

      {state.note !== null && (
        <ul className="warnings">
          <li>{state.note}</li>
        </ul>
      )}

      {state.trends.length > 0 && (
        <>
          <h2>Aktueller Stand</h2>
          <table>
            <thead>
              <tr>
                <th>Titel</th>
                <th>Monat</th>
                <th className="num">Kauf</th>
                <th className="num">Halten</th>
                <th className="num">Verkauf</th>
                <th className="num">Δ Kauf zum Vormonat</th>
              </tr>
            </thead>
            <tbody>
              {state.trends.map(({ aktuell, vormonat }) => {
                const kauf = aktuell.strongBuy + aktuell.buy
                const verkauf = aktuell.sell + aktuell.strongSell
                const kaufVorher =
                  vormonat === null ? null : vormonat.strongBuy + vormonat.buy
                const delta = kaufVorher === null ? null : kauf - kaufVorher
                return (
                  <tr key={aktuell.ticker}>
                    <td>
                      <Link href={`/titel/${aktuell.ticker.toLowerCase()}`}>
                        <strong>{aktuell.ticker}</strong>
                      </Link>
                    </td>
                    <td className="muted">{aktuell.period}</td>
                    <td className="num up">{kauf}</td>
                    <td className="num">{aktuell.hold}</td>
                    <td className="num down">{verkauf}</td>
                    <td className={`num ${delta !== null && delta < 0 ? 'down' : delta !== null && delta > 0 ? 'up' : ''}`}>
                      {delta === null ? '—' : delta > 0 ? `+${delta}` : String(delta)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </>
      )}

      <h2>Verschiebungen</h2>
      {state.actions.length === 0 ? (
        <p className="muted">Keine Verschiebungen seit dem ersten Abruf.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Wann</th>
              <th>Titel</th>
              <th>Was</th>
              <th>vorher → nachher</th>
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
                <td>{ANALYST_ACTION_LABEL[alert.action]}</td>
                <td className="muted">
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
