import { buildChart } from '@/lib/chart'
import type { PriceBar } from '@/domain/price-series'

/** Kleiner Verlauf fuer die Tabellenzeile. Rein dekorativ, daher aria-hidden. */
export function Sparkline({ bars }: { bars: readonly PriceBar[] }) {
  if (bars.length < 2) return <span className="muted">—</span>

  const width = 120
  const height = 28
  // Bei 250 Handelstagen auf rund 60 Punkte ausduennen: der Verlauf
  // bleibt erkennbar, das Markup ein Fuenftel so gross.
  const step = Math.max(1, Math.floor(bars.length / 60))
  const sampled = bars.filter((_, index) => index % step === 0 || index === bars.length - 1)
  const chart = buildChart(sampled, { width, height, padding: 2, tickCount: 2 })
  const rising = (sampled[sampled.length - 1]?.close ?? 0) >= (sampled[0]?.close ?? 0)

  return (
    <svg className="sparkline" viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <path
        d={chart.linePath}
        className={rising ? 'chart-line up' : 'chart-line down'}
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}
