import Link from 'next/link'
import { DataBanner } from '@/components/DataBanner'
import { Disclaimer } from '@/components/Disclaimer'
import { Sparkline } from '@/components/Sparkline'
import { loadTitles } from '@/data/titles'
import { window52Weeks } from '@/domain/price-series'
import { rank } from '@/domain/screening'
import { formatDay, formatDaysUntil, formatPercent, formatPrice } from '@/lib/format'

export const dynamic = 'force-static'

export default function Home() {
  const { titles, asOf, isDemo, priceSource, fundamentalsSource } = loadTitles()

  const order = new Map(
    rank(titles.map((title) => title.screen)).map((result, index) => [result.ticker, index]),
  )
  const sorted = [...titles].sort(
    (a, b) => (order.get(a.entry.ticker) ?? 0) - (order.get(b.entry.ticker) ?? 0),
  )

  const withFundamentals = titles.filter((title) => title.fundamentals !== null).length
  const withoutPrices = titles.filter((title) => title.price === null).length

  return (
    <main>
      <h1>Ticker</h1>
      <p className="lede">
        {titles.length} beobachtete Titel, sortiert nach der Kennzahlen-Punktzahl. Bei{' '}
        {withFundamentals} Titeln liegen Berichtszahlen vor, bei den uebrigen{' '}
        {titles.length - withFundamentals} nur Kurse: sie sind nicht bei der SEC registriert.
        {withoutPrices > 0 && ` Fuer ${withoutPrices} Titel fehlen auch die Kurse.`}
      </p>

      <DataBanner
        isDemo={isDemo}
        asOf={asOf}
        priceSource={priceSource}
        fundamentalsSource={fundamentalsSource}
      />

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
          {sorted.map((title) => {
            const { price, series } = title
            return (
              <tr key={`${title.entry.venue}:${title.entry.ticker}`}>
                <td>
                  <Link href={`/titel/${title.entry.ticker.toLowerCase()}`}>
                    <strong>{title.entry.ticker}</strong>
                  </Link>
                  <span className="muted"> {title.entry.name}</span>
                </td>
                <td className="num">
                  {price === null ? (
                    <span className="muted">—</span>
                  ) : (
                    formatPrice(price.last.close, price.currency)
                  )}
                </td>
                <td>
                  {series === null ? (
                    <span className="muted">—</span>
                  ) : (
                    <Sparkline bars={window52Weeks(series, asOf)} />
                  )}
                </td>
                <td className={`num ${(price?.returns['12M'] ?? 0) >= 0 ? 'up' : 'down'}`}>
                  {formatPercent(price?.returns['12M'] ?? null)}
                </td>
                <td className="num">
                  {price?.positionInRange == null
                    ? '—'
                    : `${(price.positionInRange * 100).toFixed(0)} %`}
                </td>
                <td>
                  {title.earnings === null ? (
                    <span className="muted">nicht schaetzbar</span>
                  ) : (
                    <>
                      {formatDay(title.earnings.expected)}
                      <span className="muted">
                        {' '}
                        · {formatDaysUntil(title.earnings.expected, asOf)}
                      </span>
                    </>
                  )}
                </td>
                <td className="num">
                  {title.screen.score === null ? (
                    <span className="muted">—</span>
                  ) : (
                    <>
                      <strong>{title.screen.score.toFixed(0)}</strong>
                      <span className="muted"> · {(title.screen.coverage * 100).toFixed(0)}&nbsp;%</span>
                    </>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>

      <p className="muted footnote">
        Die Spalte <em>Punkte</em> nennt hinter dem Punkt den Anteil der Signale, fuer die Daten
        vorlagen. Ein Titel mit 70 · 44&nbsp;% ist auf duennerer Grundlage bewertet als einer mit
        60 · 100&nbsp;%. Die Punktzahl ist eine Rangfolge nach offengelegten Kriterien, keine
        Empfehlung; die Gewichte stehen auf jeder Detailseite.
      </p>

      <form method="post" action="/api/logout" className="logout">
        <button type="submit">Abmelden</button>
      </form>

      <Disclaimer />
    </main>
  )
}
