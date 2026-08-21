import { Disclaimer } from '@/components/Disclaimer'
import { WATCHLIST, watchlistByVenue } from '@/config/watchlist'
import type { CoverageExpectation, WatchlistEntry } from '@/domain/instrument'

const COVERAGE_LABEL: Record<CoverageExpectation, string> = {
  sec_domestic: '8-K 2.02 / 10-Q / 10-K',
  sec_foreign: '6-K / 20-F',
  none: 'keine Gratisquelle',
}

function WatchlistTable({ title, entries }: { title: string; entries: readonly WatchlistEntry[] }) {
  return (
    <>
      <h2>
        {title} <span className="badge">{entries.length}</span>
      </h2>
      <table>
        <thead>
          <tr>
            <th>Ticker</th>
            <th>Name</th>
            <th>erwartete Quelle</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <tr key={`${entry.venue}:${entry.ticker}`}>
              <td>{entry.ticker}</td>
              <td>{entry.name}</td>
              <td>
                <span className="badge" data-coverage={entry.expectedCoverage}>
                  {COVERAGE_LABEL[entry.expectedCoverage]}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  )
}

export default function Home() {
  const covered = WATCHLIST.filter((entry) => entry.expectedCoverage !== 'none').length

  return (
    <main>
      <h1>Ticker</h1>
      <p className="lede">
        Slice 0: Geruest und Domaenenmodell stehen. Es werden noch keine Daten abgerufen.
        Von {WATCHLIST.length} beobachteten Titeln sind {covered} voraussichtlich ueber EDGAR
        abgedeckt. Belegt wird das erst durch <code>npm run coverage:edgar</code>; das Ergebnis
        steht in <code>docs/coverage.md</code>.
      </p>

      <WatchlistTable title="Nasdaq" entries={watchlistByVenue('NASDAQ')} />
      <WatchlistTable title="DAX" entries={watchlistByVenue('XETRA')} />

      <Disclaimer />
    </main>
  )
}
