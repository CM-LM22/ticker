import type { PriceBar } from '../domain/price-series'

/**
 * Geometrie fuer die Kurscharts. Bewusst als reine Funktion und nicht
 * im Bauteil: so laesst sich pruefen, dass eine Reihe mit einem einzigen
 * Kurs oder eine waagerechte Reihe keine kaputten Pfade erzeugt.
 */
export interface ChartPoint {
  x: number
  y: number
  bar: PriceBar
}

export interface ChartGeometry {
  width: number
  height: number
  padding: number
  min: number
  max: number
  points: readonly ChartPoint[]
  linePath: string
  areaPath: string
  yTicks: readonly { value: number; y: number }[]
}

export interface ChartOptions {
  width?: number
  height?: number
  padding?: number
  tickCount?: number
}

export function buildChart(bars: readonly PriceBar[], options: ChartOptions = {}): ChartGeometry {
  const width = options.width ?? 800
  const height = options.height ?? 260
  const padding = options.padding ?? 8
  const tickCount = options.tickCount ?? 3

  if (bars.length === 0) throw new Error('Chart ohne Kurse')

  const closes = bars.map((bar) => bar.close)
  const rawMin = Math.min(...closes)
  const rawMax = Math.max(...closes)
  // Waagerechte Reihe: kuenstliche Spanne, damit nicht durch null geteilt wird.
  const flat = rawMax - rawMin < Number.EPSILON
  const pad = flat ? Math.max(1, Math.abs(rawMax) * 0.01) : (rawMax - rawMin) * 0.06
  const min = rawMin - pad
  const max = rawMax + pad

  const innerWidth = width - padding * 2
  const innerHeight = height - padding * 2
  const span = max - min

  const toY = (value: number): number =>
    height - padding - ((value - min) / span) * innerHeight

  const points: ChartPoint[] = bars.map((bar, index) => ({
    x: bars.length === 1 ? width / 2 : padding + (index / (bars.length - 1)) * innerWidth,
    y: toY(bar.close),
    bar,
  }))

  const linePath = points
    .map((point, index) => `${index === 0 ? 'M' : 'L'}${round(point.x)},${round(point.y)}`)
    .join(' ')

  const first = points[0]
  const last = points[points.length - 1]
  const areaPath =
    first === undefined || last === undefined
      ? ''
      : `${linePath} L${round(last.x)},${round(height - padding)} L${round(first.x)},${round(
          height - padding,
        )} Z`

  const yTicks = Array.from({ length: tickCount }, (_, index) => {
    const value = min + (span * index) / (tickCount - 1)
    return { value, y: toY(value) }
  })

  return { width, height, padding, min, max, points, linePath, areaPath, yTicks }
}

function round(value: number): number {
  return Math.round(value * 100) / 100
}
