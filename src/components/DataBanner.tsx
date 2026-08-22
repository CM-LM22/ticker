import { formatDay } from '@/lib/format'

/**
 * Sagt auf jeder Seite an, woher die Zahlen stammen. Solange kein
 * echter Abruf gelaufen ist, steht hier eine Warnung; danach die
 * Quellen samt Stand.
 */
export function DataBanner({
  isDemo,
  asOf,
  priceSource,
  fundamentalsSource,
}: {
  isDemo: boolean
  asOf: Date
  priceSource: string
  fundamentalsSource: string
}) {
  if (isDemo) {
    return (
      <p className="demo-banner">
        <strong>Demodaten.</strong> Alle Kurse, Berichtszahlen und Termine sind synthetisch
        erzeugt und zeigen nur, wie die Ansicht mit echten Daten aussieht. Es wurde noch keine
        externe Quelle abgefragt.
      </p>
    )
  }

  return (
    <p className="source-banner">
      Kurse von <strong>{priceSource}</strong>, Berichtszahlen von{' '}
      <strong>{fundamentalsSource}</strong>. Stand {formatDay(asOf.toISOString().slice(0, 10))}.
      Termine sind aus dem bisherigen Einreichungsrhythmus geschaetzt, nicht bestaetigt.
    </p>
  )
}
