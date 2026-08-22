import Link from 'next/link'
import { DataBanner } from '@/components/DataBanner'
import { Disclaimer } from '@/components/Disclaimer'
import { loadTitleData } from '@/data/load'
import { GAP_LABEL, buildReportBriefs } from '@/domain/report-brief'
import { formatCompact, formatDay, formatPercent } from '@/lib/format'

export const dynamic = 'force-dynamic'

export default async function BerichtePage() {
  const data = await loadTitleData()
  const briefs = buildReportBriefs(data.titles)
  const withNumbers = briefs.filter((brief) => brief.gap === 'none').length

  return (
    <main className="brief-page">
      <p className="back no-print">
        <Link href="/">← Uebersicht</Link>
      </p>

      <h1>Geschäftsberichte</h1>
      <p className="lede">
        Juengste berichtete Periode aller {briefs.length} Watchlist-Titel auf einer Seite. Zahlen
        liegen fuer {withNumbers} Titel vor; die uebrigen sind nicht bei der SEC registriert oder
        haben keine verwertbare Periode.
      </p>

      <p className="no-print actions">
        <a href="/berichte.pdf" target="_blank" rel="noopener">
          Als PDF herunterladen
        </a>
        <span className="muted">
          {' '}
          Eine Seite, A4. Je Titel gibt es zusaetzlich einen Ein-Seiten-Bericht mit
          Vorjahresvergleich, Konsens, Einstufung und Ausblick — Link „PDF“ in der Zeile.
        </span>
      </p>

      <DataBanner
        isDemo={data.isDemo}
        asOf={data.asOf}
        priceSource={data.priceSource}
        fundamentalsSource={data.fundamentalsSource}
      />

      <div className="table-scroll">
      <table className="brief">
        <thead>
          <tr>
            <th>Titel</th>
            <th>Periode</th>
            <th>Form</th>
            <th className="num">Umsatz</th>
            <th className="num">Δ U</th>
            <th className="num">Ergebnis</th>
            <th className="num">Δ E</th>
            <th className="num">EPS</th>
          </tr>
        </thead>
        <tbody>
          {briefs.map((brief) => (
            <tr key={brief.ticker}>
              <td>
                <Link href={`/titel/${brief.ticker.toLowerCase()}`}>
                  <strong>{brief.ticker}</strong>
                </Link>
                <span className="muted"> {brief.name} </span>
                <a
                  className="no-print"
                  href={`/titel/${brief.ticker.toLowerCase()}/bericht.pdf`}
                  target="_blank"
                  rel="noopener"
                >
                  PDF
                </a>
              </td>
              {brief.gap !== 'none' ? (
                <td colSpan={7} className="muted">
                  {GAP_LABEL[brief.gap]}
                </td>
              ) : (
                <>
                  <td>
                    {brief.periodLabel}
                    <span className="muted"> bis {formatDay(brief.periodEnd)}</span>
                  </td>
                  <td>{brief.form}</td>
                  <td className="num">{formatCompact(brief.revenue, brief.currency)}</td>
                  <td className={`num ${(brief.revenueYoYPct ?? 0) >= 0 ? 'up' : 'down'}`}>
                    {formatPercent(brief.revenueYoYPct, 0)}
                  </td>
                  <td className="num">{formatCompact(brief.netIncome, brief.currency)}</td>
                  <td className={`num ${(brief.netIncomeYoYPct ?? 0) >= 0 ? 'up' : 'down'}`}>
                    {formatPercent(brief.netIncomeYoYPct, 0)}
                  </td>
                  <td className="num">
                    {brief.epsDiluted === null ? '—' : brief.epsDiluted.toFixed(2).replace('.', ',')}
                  </td>
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      </div>

      <Disclaimer />
    </main>
  )
}
