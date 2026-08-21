import Link from 'next/link'
import { DemoBanner } from '@/components/DemoBanner'
import { Disclaimer } from '@/components/Disclaimer'
import { Sparkline } from '@/components/Sparkline'
import { buildDemoTitles, DEMO_AS_OF } from '@/demo/demo-data'
import { window52Weeks } from '@/domain/price-series'
import { rank } from '@/domain/screening'
import { formatDay, formatDaysUntil, formatPercent, formatPrice } from '@/lib/format'

export default function Home() {
  const titles = buildDemoTitles()
  const order = new Map(
    rank(titles.map((title) => title.screen)).map((result, index) => [result.ticker, index]),
  )
  const sorted = [...titles].sort(
    (a, b) => (order.get(a.entry.ticker) ?? 0) - (order.get(b.entry.ticker) ?? 0),
  )
  const withFundamentals = titles.filter((title) => title.fundamentals !== null).length

  return (
    <main>
      <h1>Ticker</h1>
      <p className="lede">
        {titles.length} beobachtete Titel, sortiert nach der Kennzahlen-Punktzahl. Bei{' '}
        {withFundamentals} Titeln liegen Berichtszahlen vor, bei den uebrigen{' '}
        {titles.length - withFundamentals} nur Kurse: sie sind nicht bei der SEC registriert.
        Stand {formatDay(DEMO_AS_OF.toISOString().slice(0, 10))}.
      </p>

      <DemoBanner />

      <table className="overview">
        <thead>
          <tr>
            <th>Titel</th>
            <th className="num">Kurs</th>
            <th>52 Wochen</th>
            <th className="num">12 Mon.</th>
            <th className="num">im Band</th>
            <th>naechste Zahlen</th>
            <th className="num">Punkte</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((title) => (
            <tr key={`${title.entry.venue}:${title.entry.ticker}`}>
              <td>
                <Link href={`/titel/${title.entry.ticker.toLowerCase()}`}>
                  <strong>{title.entry.ticker}</strong>
                </Link>
                <span className="muted"> {title.entry.name}</span>
              </td>
              <td className="num">{formatPrice(title.price.last.close, title.price.currency)}</td>
              <td>
                <Sparkline bars={window52Weeks(title.series, DEMO_AS_OF)} />
              </td>
              <td className={`num ${(title.price.returns['12M'] ?? 0) >= 0 ? 'up' : 'down'}`}>
                {formatPercent(title.price.returns['12M'])}
              </td>
              <td className="num">
                {title.price.positionInRange === null
                  ? '—'
                  : `${(title.price.positionInRange * 100).toFixed(0)} %`}
              </td>
              <td>
                {title.earnings === null ? (
                  <span className="muted">nicht schaetzbar</span>
                ) : (
                  <>
                    {formatDay(title.earnings.expected)}
                    <span className="muted"> · {formatDaysUntil(title.earnings.expected, DEMO_AS_OF)}</span>
                  </>
                )}
              </td>
              <td className="num">
                {title.screen.score === null ? (
                  <span className="muted">—</span>
                ) : (
                  <>
                    <strong>{title.screen.score.toFixed(0)}</strong>
                    <span className="muted">
                      {' '}
                      · {(title.screen.coverage * 100).toFixed(0)}&nbsp;%
                    </span>
                  </>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <p className="muted footnote">
        Die Spalte <em>Punkte</em> nennt hinter dem Punkt den Anteil der Signale, fuer die Daten
        vorlagen. Ein Titel mit 70 · 44&nbsp;% ist auf duennerer Grundlage bewertet als einer mit
        60 · 100&nbsp;%. Die Punktzahl ist eine Rangfolge nach offengelegten Kriterien, keine
        Empfehlung; die Gewichte stehen auf jeder Detailseite.
      </p>

      <Disclaimer />
    </main>
  )
}
