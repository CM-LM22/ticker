/**
 * Steht auf jeder Seite, die mit erfundenen Zahlen arbeitet. Sobald die
 * Kurse tatsaechlich geholt werden, verschwindet dieses Bauteil.
 */
export function DemoBanner() {
  return (
    <p className="demo-banner">
      <strong>Demodaten.</strong> Alle Kurse, Berichtszahlen und Termine auf dieser Seite sind
      synthetisch erzeugt und zeigen nur, wie die Ansicht mit echten Daten aussieht. Es wurde
      noch keine externe Quelle abgefragt.
    </p>
  )
}
