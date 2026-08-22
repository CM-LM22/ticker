'use client'

import { useMemo, useState } from 'react'
import { buildChart } from '@/lib/chart'
import { formatDayShort, formatNumber } from '@/lib/format'
import type { PriceBar } from '@/domain/price-series'

const BEREICHE = [
  ['1M', 31],
  ['3M', 92],
  ['6M', 183],
  ['1J', 366],
] as const

type Bereich = (typeof BEREICHE)[number][0]

/**
 * Kursverlauf mit Zeitraum-Wahl. Die Auswahl schneidet die bereits
 * geladene Reihe zu, es wird nichts nachgeladen: die 52 Wochen sind da,
 * kuerzere Fenster sind eine Teilmenge davon.
 */
export function PriceChart({
  bars,
  currency,
  height = 280,
}: {
  bars: readonly PriceBar[]
  currency: string
  height?: number
}) {
  const [bereich, setBereich] = useState<Bereich>('1J')

  const sichtbar = useMemo(() => {
    const tage = BEREICHE.find(([name]) => name === bereich)?.[1] ?? 366
    const letzter = bars[bars.length - 1]
    if (letzter === undefined) return bars
    const grenze = new Date(new Date(`${letzter.date}T00:00:00Z`).getTime() - tage * 86_400_000)
      .toISOString()
      .slice(0, 10)
    return bars.filter((bar) => bar.date >= grenze)
  }, [bars, bereich])

  if (bars.length === 0) return <p className="muted">Keine Kurse vorhanden.</p>

  const width = 880
  const scaleWidth = 64
  const chart = buildChart([...sichtbar], {
    width: width - scaleWidth,
    height,
    padding: 12,
    tickCount: 4,
  })
  const first = sichtbar[0]
  const last = sichtbar[sichtbar.length - 1]
  const middle = sichtbar[Math.floor(sichtbar.length / 2)]
  const rising = (last?.close ?? 0) >= (first?.close ?? 0)

  return (
    <figure className="chart">
      <div className="tabs chart-ranges" role="tablist" aria-label="Zeitraum">
        {BEREICHE.map(([name]) => (
          <button
            key={name}
            type="button"
            role="tab"
            aria-selected={bereich === name}
            className={bereich === name ? 'tab aktiv' : 'tab'}
            onClick={() => setBereich(name)}
          >
            {name}
          </button>
        ))}
      </div>

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
