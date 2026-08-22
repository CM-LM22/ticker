import Link from 'next/link'
import { DiagnosePanel } from '@/components/DiagnosePanel'
import { Disclaimer } from '@/components/Disclaimer'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Diagnose · Ticker' }

export default function DiagnosePage() {
  return (
    <main>
      <p className="back">
        <Link href="/">← Uebersicht</Link>
      </p>

      <h1>Diagnose</h1>
      <p className="lede">
        Misst, was diese Anwendung von ihrem eigenen Standort aus erreicht. Ob eine Kursquelle
        antwortet, haengt an der Adresse, von der gefragt wird — Stooq und Yahoo sperren geteilte
        Cloud-Adressen. Diese Frage kann nur ein Abruf von genau hier beantworten, nicht die
        Dokumentation des Anbieters.
      </p>
      <p className="source-banner">
        Beide Messungen schreiben nichts. Sie holen ab, werten aus und zeigen das Ergebnis.
      </p>

      <DiagnosePanel />

      <Disclaimer />
    </main>
  )
}
