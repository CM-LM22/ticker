import Link from 'next/link'
import { notFound } from 'next/navigation'
import { DataBanner } from '@/components/DataBanner'
import { Disclaimer } from '@/components/Disclaimer'
import { EntfernenButton } from '@/components/EntfernenButton'
import { PriceChart } from '@/components/PriceChart'
import { QuoteBadge } from '@/components/QuoteBadge'
import { RangeBar } from '@/components/RangeBar'
import { WATCHLIST } from '@/config/watchlist'
import { eigeneTicker } from '@/data/gesamt-watchlist'
import { loadTitleData } from '@/data/load'
import { RETURN_WINDOWS, window52Weeks } from '@/domain/price-series'
import {
  formatCompact,
  formatDay,
  formatDaysUntil,
  formatNumber,
  formatPercent,
  formatPrice,
} from '@/lib/format'

// Bei jedem Aufruf live aus der Datenbank gerendert. Vorgebackene
// Staende gab es hier frueher (revalidate 300); sie haben nach jedem
// Deployment den eingebackenen Demodaten-Stand gezeigt, bis jede Seite
// einzeln neu erzeugt war. Eine Datenbankabfrage je Aufruf ist fuer
// ein privates Dashboard der ehrlichere Preis.
export const dynamic = 'force-dynamic'

export function generateStaticParams() {
  return WATCHLIST.map((entry) => ({ ticker: entry.ticker.toLowerCase() }))
}

/** MD&A-Auszug lesen, tolerant gegen fehlende Datenbank und Tabellen. */
async function ladeAuszug(ticker: string) {
  const { hasDatabase, istTabelleFehlt } = await import('@/db/client')
  if (!hasDatabase()) return null
  try {
    const { readBerichtAuszug } = await import('@/db/repository')
    return await readBerichtAuszug(ticker)
  } catch (fehler) {
    if (!istTabelleFehlt(fehler)) console.warn(`titel ${ticker}: Auszug nicht lesbar:`, fehler)
    return null
  }
}

const CONFIDENCE_LABEL = {
  hoch: 'hohe Treffsicherheit',
  mittel: 'mittlere Treffsicherheit',
  niedrig: 'geringe Treffsicherheit',
} as const

const PERIODICITY_LABEL = {
  quarterly: 'Quartalsrhythmus',
  semiannual: 'Halbjahresrhythmus',
  annual: 'Jahresrhythmus',
  unklar: 'unklaren Rhythmus',
} as const

export default async function TitlePage({ params }: { params: Promise<{ ticker: string }> }) {
  const { ticker } = await params
  const [data, eigene] = await Promise.all([loadTitleData(), eigeneTicker()])
  const auszug = await ladeAuszug(ticker.toUpperCase())
  const title = data.titles.find(
    (candidate) => candidate.entry.ticker.toLowerCase() === ticker.toLowerCase(),
  )
  if (title === undefined) notFound()

  const { entry, price, fundamentals, earnings, screen: result, series } = title
  const bars52 = series === null ? [] : window52Weeks(series, data.asOf)

  return (
    <main>
      <p className="back">
        <Link href="/">← Uebersicht</Link>
        {'  '}
        <a
          href={`/titel/${entry.ticker.toLowerCase()}/bericht.pdf`}
          target="_blank"
          rel="noopener"
        >
          Ein-Seiten-Bericht (PDF)
        </a>
        {eigene.has(entry.ticker) && (
          <>
            {'  '}
            <EntfernenButton ticker={entry.ticker} />
          </>
        )}
      </p>

      <h1>
        {entry.ticker} <span className="muted">{entry.name}</span> <QuoteBadge ticker={entry.ticker} />
      </h1>
      <p className="lede">
        {entry.venue}
        {price !== null && (
          <>
            {' · '}
            {formatPrice(price.last.close, price.currency)}
            {' · '}
            <span className={(price.returns['12M'] ?? 0) >= 0 ? 'up' : 'down'}>
              {formatPercent(price.returns['12M'])} in zwoelf Monaten
            </span>
          </>
        )}
      </p>

      <DataBanner
        isDemo={data.isDemo}
        asOf={data.asOf}
        priceSource={data.priceSource}
        fundamentalsSource={data.fundamentalsSource}
      />

      {title.notes.length > 0 && (
        <ul className="warnings">
          {title.notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      )}

      {price === null ? (
        <p className="muted">
          Fuer {entry.ticker} liegen keine Kurse vor. Der Abruf ist entweder noch nicht gelaufen
          oder die Quelle fuehrt diesen Titel nicht.
        </p>
      ) : (
        <>
          <PriceChart bars={bars52} currency={price.currency} />
          <RangeBar
            low={price.low52.value}
            high={price.high52.value}
            last={price.last.close}
            position={price.positionInRange}
            currency={price.currency}
          />

          <h2>Kennzahlen zum Kurs</h2>
          <dl className="figures">
            <div>
              <dt>52-Wochen-Hoch</dt>
              <dd>
                {formatNumber(price.high52.value, 2)} {price.currency}
                <span className="muted"> am {formatDay(price.high52.date)}</span>
              </dd>
            </div>
            <div>
              <dt>52-Wochen-Tief</dt>
              <dd>
                {formatNumber(price.low52.value, 2)} {price.currency}
                <span className="muted"> am {formatDay(price.low52.date)}</span>
              </dd>
            </div>
            <div>
              <dt>Abstand zum Hoch</dt>
              <dd>{formatPercent(price.drawdownFromHighPct)}</dd>
            </div>
            {RETURN_WINDOWS.map((window) => (
              <div key={window}>
                <dt>Rendite {window}</dt>
                <dd className={(price.returns[window] ?? 0) >= 0 ? 'up' : 'down'}>
                  {formatPercent(price.returns[window])}
                </dd>
              </div>
            ))}
            <div>
              <dt>50-Tage-Schnitt</dt>
              <dd>{price.sma50 === null ? '—' : formatNumber(price.sma50, 2)}</dd>
            </div>
            <div>
              <dt>200-Tage-Schnitt</dt>
              <dd>{price.sma200 === null ? '—' : formatNumber(price.sma200, 2)}</dd>
            </div>
            <div>
              <dt>Schwankung p. a.</dt>
              <dd>
                {price.volatilityPct === null ? '—' : `${formatNumber(price.volatilityPct, 0)} %`}
              </dd>
            </div>
            <div>
              <dt>Handelstage im Fenster</dt>
              <dd>{price.bars}</dd>
            </div>
          </dl>

          {price.warnings.length > 0 && (
            <ul className="warnings">
              {price.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          )}
        </>
      )}

      <h2>Naechste Zahlen</h2>
      {earnings === null ? (
        <p className="muted">
          Nicht schaetzbar: fuer {entry.ticker} liegt kein Einreichungsverlauf bei der SEC vor.
        </p>
      ) : (
        <p>
          <strong>{formatDay(earnings.expected)}</strong> (
          {formatDaysUntil(earnings.expected, data.asOf)}), plausibel zwischen{' '}
          {formatDay(earnings.earliest)} und {formatDay(earnings.latest)}.
          <br />
          <span className="muted">
            Geschaetzt aus {earnings.basis} vergangenen Terminen im{' '}
            {PERIODICITY_LABEL[earnings.periodicity]}. Dieselbe Regel lag rueckwirkend im Mittel{' '}
            {earnings.medianErrorDays === null
              ? '—'
              : `${formatNumber(earnings.medianErrorDays, 0)} Tage`}{' '}
            daneben, daher {CONFIDENCE_LABEL[earnings.confidence]}. Kein bestaetigter Termin.
          </span>
        </p>
      )}

      <h2>Zuletzt berichtete Zahlen</h2>
      {fundamentals === null ? (
        <p className="muted">
          {entry.name} ist nicht bei der SEC registriert. Berichtszahlen sind kostenlos nicht
          maschinenlesbar zu bekommen.
        </p>
      ) : (
        <>
          <table>
            <thead>
              <tr>
                <th>Periode</th>
                <th>Formular</th>
                <th className="num">Umsatz</th>
                <th className="num">Nettoergebnis</th>
                <th className="num">Marge</th>
                <th className="num">je Aktie</th>
                <th>Quelle</th>
              </tr>
            </thead>
            <tbody>
              {fundamentals.periods.slice(0, 8).map((period) => (
                <tr key={`${period.frame}:${period.periodEnd}`}>
                  <td>
                    {period.label}
                    <span className="muted"> bis {formatDay(period.periodEnd)}</span>
                  </td>
                  <td>{period.form}</td>
                  <td className="num">{formatCompact(period.revenue, period.currency)}</td>
                  <td className="num">{formatCompact(period.netIncome, period.currency)}</td>
                  <td className="num">
                    {period.revenue !== null && period.revenue > 0 && period.netIncome !== null
                      ? `${formatNumber((period.netIncome / period.revenue) * 100, 1)} %`
                      : '—'}
                  </td>
                  <td className="num">
                    {period.epsDiluted === null ? '—' : formatNumber(period.epsDiluted, 2)}
                  </td>
                  <td>
                    {period.sourceUrl === null ? (
                      <span className="muted">—</span>
                    ) : (
                      <a href={period.sourceUrl} target="_blank" rel="noreferrer noopener">
                        EDGAR
                      </a>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {fundamentals.latest !== null && (
            <p className="muted footnote">
              Juengste Periode {fundamentals.latest.period.label}: Umsatz{' '}
              {formatPercent(fundamentals.latest.revenueYoYPct)} zum Vorjahr, Nettoergebnis{' '}
              {formatPercent(fundamentals.latest.netIncomeYoYPct)}, Marge{' '}
              {fundamentals.latest.netMarginPct === null
                ? '—'
                : `${formatNumber(fundamentals.latest.netMarginPct, 1)} %`}
              {fundamentals.latest.marginDeltaPp === null
                ? ''
                : ` (${fundamentals.latest.marginDeltaPp >= 0 ? '+' : '−'}${formatNumber(
                    Math.abs(fundamentals.latest.marginDeltaPp),
                    1,
                  )} Prozentpunkte)`}
              .
            </p>
          )}

          {fundamentals.warnings.length > 0 && (
            <ul className="warnings">
              {fundamentals.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          )}
        </>
      )}

      {auszug !== null && (
        <>
          <h2>Aus dem Bericht — woertlich</h2>
          <p className="muted footnote">
            Anfang des Lageberichts (MD&amp;A) zur Periode bis {formatDay(auszug.periodEnd)},
            woertlich aus dem Originaldokument ausgeschnitten — keine Zusammenfassung, kein
            erzeugter Text. <a href={auszug.dokumentUrl}>Zum Originaldokument</a>.
          </p>
          {auszug.auszug.split('\n\n').map((absatz) => (
            <p key={absatz.slice(0, 40)} className="auszug">
              {absatz}
            </p>
          ))}
          {auszug.guidance !== null && auszug.guidance.length > 0 && (
            <>
              <h2>Prognose des Managements — woertlich</h2>
              {auszug.guidance.split('\n\n').map((absatz) => (
                <p key={absatz.slice(0, 40)} className="auszug">
                  {absatz}
                </p>
              ))}
            </>
          )}
        </>
      )}

      <h2>Signale</h2>
      <table>
        <thead>
          <tr>
            <th>Signal</th>
            <th className="num">Wert</th>
            <th className="num">Gewicht</th>
            <th className="num">Punkte</th>
            <th>Was gemessen wird</th>
          </tr>
        </thead>
        <tbody>
          {result.signals.map((signal) => (
            <tr key={signal.key}>
              <td>{signal.label}</td>
              <td className="num">{signal.display}</td>
              <td className="num">{signal.weight === 0 ? '—' : signal.weight}</td>
              <td className="num">
                {signal.score === null ? '—' : (signal.score * 100).toFixed(0)}
              </td>
              <td className="muted">{signal.rationale}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="muted footnote">
        Gesamt {result.score === null ? '—' : result.score.toFixed(0)} von 100, auf{' '}
        {(result.coverage * 100).toFixed(0)}&nbsp;% der Gewichte belegt.
        {result.missing.length > 0 && ` Ohne Daten: ${result.missing.join(', ')}.`}
      </p>

      <Disclaimer />
    </main>
  )
}
