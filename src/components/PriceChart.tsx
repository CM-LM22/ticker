import { buildChart } from '@/lib/chart'
import { formatDayShort, formatNumber } from '@/lib/format'
import type { PriceBar } from '@/domain/price-series'

export function PriceChart({
  bars,
  currency,
  height = 280,
}: {
  bars: readonly PriceBar[]
  currency: string
  height?: number
}) {
  if (bars.length === 0) return <p className="muted">Keine Kurse vorhanden.</p>

  const width = 880
  const scaleWidth = 64
  const chart = buildChart(bars, { width: width - scaleWidth, height, padding: 12, tickCount: 4 })
  const first = bars[0]
  const last = bars[bars.length - 1]
  const middle = bars[Math.floor(bars.length / 2)]
  const rising = (last?.close ?? 0) >= (first?.close ?? 0)

  return (
    <figure className="chart">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`Kursverlauf von ${formatDayShort(first?.date ?? '')} bis ${formatDayShort(
          last?.date ?? '',
        )}, letzter Kurs ${formatNumber(last?.close ?? 0, 2)} ${currency}`}
      >
        {chart.yTicks.map((tick) => (
          <g key={tick.value}>
            <line
              x1={0}
              x2={width - scaleWidth}
              y1={tick.y}
              y2={tick.y}
              className="chart-grid"
              vectorEffect="non-scaling-stroke"
            />
            <text x={width - scaleWidth + 8} y={tick.y + 4} className="chart-label">
              {formatNumber(tick.value, 2)}
            </text>
          </g>
        ))}
        <path d={chart.areaPath} className={rising ? 'chart-area up' : 'chart-area down'} />
        <path
          d={chart.linePath}
          className={rising ? 'chart-line up' : 'chart-line down'}
          vectorEffect="non-scaling-stroke"
        />
      </svg>

      <figcaption>
        <span>{formatDayShort(first?.date ?? '')}</span>
        <span>{formatDayShort(middle?.date ?? '')}</span>
        <span>
          {formatDayShort(last?.date ?? '')} · in {currency}
        </span>
      </figcaption>
    </figure>
  )
}
