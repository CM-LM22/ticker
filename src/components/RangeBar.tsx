import { formatNumber } from '@/lib/format'

/**
 * Position des aktuellen Kurses im 52-Wochen-Band. Bewusst ohne Wertung:
 * nah am Hoch ist kein Kaufsignal und nah am Tief keines.
 */
export function RangeBar({
  low,
  high,
  last,
  position,
  currency,
}: {
  low: number
  high: number
  last: number
  position: number | null
  currency: string
}) {
  const percent = position === null ? null : Math.min(100, Math.max(0, position * 100))

  return (
    <div className="range">
      <div className="range-track">
        {percent !== null && (
          <span className="range-marker" style={{ left: `${percent}%` }} aria-hidden="true" />
        )}
      </div>
      <div className="range-labels">
        <span>
          Tief {formatNumber(low, 2)} {currency}
        </span>
        <strong>
          {formatNumber(last, 2)} {currency}
          {percent === null ? '' : ` · ${percent.toFixed(0)} %`}
        </strong>
        <span>
          Hoch {formatNumber(high, 2)} {currency}
        </span>
      </div>
    </div>
  )
}
