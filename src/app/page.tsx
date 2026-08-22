import Link from 'next/link'
import { DataBanner } from '@/components/DataBanner'
import { Disclaimer } from '@/components/Disclaimer'
import { OverviewTable } from '@/components/OverviewTable'
import type { UebersichtZeile } from '@/components/OverviewTable'
import { RefreshButton } from '@/components/RefreshButton'
import { loadTitleData } from '@/data/load'
import { window52Weeks } from '@/domain/price-series'
import { rank } from '@/domain/screening'
import { buildChart } from '@/lib/chart'
import { formatDay } from '@/lib/format'

// Wird alle fuenf Minuten neu erzeugt und zusaetzlich sofort nach
// einem erfolgreichen Abruf, siehe /api/refresh. Die Live-Kurse holt
// die Tabelle selbst im Browser, dafuer muss die Seite nicht neu bauen.
export const revalidate = 300

/**
 * Verlaufslinie serverseitig vorrechnen: Der Pfad ist ein kurzer Text,
 * die 260 Tageskurse dahinter waeren das Zigfache. Der Browser bekommt
 * das Ergebnis, nicht die Rohdaten.
 */
function sparkline(bars: readonly { date: string; close: number }[]): {
  path: string | null
  rising: boolean
} {
  if (bars.length < 2) return { path: null, rising: true }
  const schritt = Math.max(1, Math.floor(bars.length / 60))
  const punkte = bars.filter((_, index) => index % schritt === 0 || index === bars.length - 1)
  const chart = buildChart(
    punkte.map((bar) => ({ ...bar, open: bar.close, high: bar.close, low: bar.close, volume: null })),
    { width: 120, height: 28, padding: 2, tickCount: 2 },
  )
  const rising = (punkte[punkte.length - 1]?.close ?? 0) >= (punkte[0]?.close ?? 0)
  return { path: chart.linePath, rising }
}

export default async function Home() {
  const { titles, asOf, isDemo, priceSource, fundamentalsSource } = await loadTitleData()

  const order = new Map(
    rank(titles.map((title) => title.screen)).map((result, index) => [result.ticker, index]),
  )
  const sorted = [...titles].sort(
    (a, b) => (order.get(a.entry.ticker) ?? 0) - (order.get(b.entry.ticker) ?? 0),
  )

  const rows: UebersichtZeile[] = sorted.map((title) => {
    const bars = title.series === null ? [] : window52Weeks(title.series, asOf)
    const spark = sparkline(bars)
    return {
      ticker: title.entry.ticker,
      name: title.entry.name,
      venue: title.entry.venue,
      kurs: title.price?.last.close ?? null,
      currency: title.price?.currency ?? null,
      sparkPath: spark.path,
      sparkRising: spark.rising,
      ret12M: title.price?.returns['12M'] ?? null,
      band: title.price?.positionInRange == null ? null : title.price.positionInRange * 100,
      terminTag: title.earnings?.expected ?? null,
      score: title.screen.score,
      coverage: title.screen.coverage,
    }
  })

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

      <p className="actions">
        <Link href="/berichte">Geschäftsberichte als PDF</Link>
        {' · '}
        <Link href="/analysten">Analysten</Link>
        {' · '}
        <Link href="/diagnose">Diagnose</Link>
      </p>

      <DataBanner
        isDemo={isDemo}
        asOf={asOf}
        priceSource={priceSource}
        fundamentalsSource={fundamentalsSource}
      />

      <OverviewTable rows={rows} asOfText={`Stand ${formatDay(asOf.toISOString().slice(0, 10))}`} />

      <p className="muted footnote">
        Die Spalte <em>Punkte</em> nennt hinter dem Punkt den Anteil der Signale, fuer die Daten
        vorlagen. Ein Titel mit 70 · 44&nbsp;% ist auf duennerer Grundlage bewertet als einer mit
        60 · 100&nbsp;%. Die Punktzahl ist eine Rangfolge nach offengelegten Kriterien, keine
        Empfehlung; die Gewichte stehen auf jeder Detailseite. <em>heute</em> zeigt die
        Veraenderung seit dem Vortagesschluss, sobald Live-Kurse verfuegbar sind.
      </p>

      <RefreshButton />

      <form method="post" action="/api/logout" className="logout">
        <button type="submit">Abmelden</button>
      </form>

      <Disclaimer />
    </main>
  )
}
