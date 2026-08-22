'use client'

import { useState } from 'react'

interface Probe {
  quelle: string
  ziel: string
  ok: boolean
  detail: string
}

interface Zeile {
  ticker: string
  name: string
  venue: string
  expected: string
  measured: string
  cik: string | null
  secName: string | null
  counts: Record<string, number>
  earnings8K: number
  latestEarningsFiling: { form: string; filingDate: string } | null
  verdict: string
  note: string | null
}

/**
 * Stoesst die Messungen an und zeigt das Ergebnis. Die Abdeckung laeuft
 * stapelweise, damit kein Aufruf ins Zeitlimit laeuft.
 */
export function DiagnosePanel() {
  const [proben, setProben] = useState<Probe[] | null>(null)
  const [zeilen, setZeilen] = useState<Zeile[] | null>(null)
  const [laeuft, setLaeuft] = useState<string | null>(null)
  const [fehler, setFehler] = useState<string | null>(null)

  async function quellen(): Promise<void> {
    setLaeuft('quellen')
    setFehler(null)
    try {
      const antwort = await fetch('/api/diagnose?teil=quellen', { method: 'POST' }).then(
        (r) => r.json() as Promise<{ ok: boolean; proben?: Probe[]; fehler?: string }>,
      )
      if (!antwort.ok) setFehler(antwort.fehler ?? 'Unbekannter Fehler')
      else setProben(antwort.proben ?? [])
    } catch (ursache) {
      setFehler(ursache instanceof Error ? ursache.message : String(ursache))
    } finally {
      setLaeuft(null)
    }
  }

  async function abdeckung(): Promise<void> {
    setLaeuft('abdeckung')
    setFehler(null)
    const gesammelt: Zeile[] = []
    let offset = 0
    try {
      for (let runde = 0; runde < 20; runde += 1) {
        const antwort = await fetch(`/api/diagnose?teil=abdeckung&offset=${offset}`, {
          method: 'POST',
        }).then(
          (r) =>
            r.json() as Promise<{
              ok: boolean
              zeilen?: Zeile[]
              naechsterOffset?: number | null
              done?: boolean
              fehler?: string
            }>,
        )
        if (!antwort.ok) {
          setFehler(antwort.fehler ?? 'Unbekannter Fehler')
          return
        }
        gesammelt.push(...(antwort.zeilen ?? []))
        setZeilen([...gesammelt])
        if (antwort.done === true || antwort.naechsterOffset == null) break
        offset = antwort.naechsterOffset
      }
    } catch (ursache) {
      setFehler(ursache instanceof Error ? ursache.message : String(ursache))
    } finally {
      setLaeuft(null)
    }
  }

  const abgedeckt = zeilen?.filter((z) => z.measured !== 'none').length ?? 0

  return (
    <>
      <div className="refresh">
        <button type="button" onClick={() => void quellen()} disabled={laeuft !== null}>
          {laeuft === 'quellen' ? 'Prüfe …' : 'Quellen prüfen'}
        </button>{' '}
        <button type="button" onClick={() => void abdeckung()} disabled={laeuft !== null}>
          {laeuft === 'abdeckung' ? 'Messe …' : 'SEC-Abdeckung messen'}
        </button>
        {fehler !== null && <p className="login-error">{fehler}</p>}
      </div>

      {proben !== null && (
        <>
          <h2>Erreichbarkeit der Quellen</h2>
          <table>
            <thead>
              <tr>
                <th>Quelle</th>
                <th>Ziel</th>
                <th>Ergebnis</th>
              </tr>
            </thead>
            <tbody>
              {proben.map((probe) => (
                <tr key={`${probe.quelle}:${probe.ziel}`}>
                  <td>{probe.quelle}</td>
                  <td>{probe.ziel}</td>
                  <td className={probe.ok ? 'up' : 'down'}>
                    {probe.ok ? '✓ ' : '✗ '}
                    {probe.detail}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {zeilen !== null && (
        <>
          <h2>
            SEC-Abdeckung <span className="muted">{abgedeckt} von {zeilen.length} Titeln</span>
          </h2>
          <table>
            <thead>
              <tr>
                <th>Ticker</th>
                <th>Name laut SEC</th>
                <th>CIK</th>
                <th className="num">8-K 2.02</th>
                <th className="num">10-Q</th>
                <th className="num">6-K</th>
                <th className="num">20-F</th>
                <th>gemessen</th>
                <th>erwartet</th>
              </tr>
            </thead>
            <tbody>
              {zeilen.map((zeile) => (
                <tr key={zeile.ticker}>
                  <td>
                    <strong>{zeile.ticker}</strong>
                  </td>
                  <td className="muted">{zeile.secName ?? '—'}</td>
                  <td className="muted">{zeile.cik ?? '—'}</td>
                  <td className="num">{zeile.cik === null ? '—' : zeile.earnings8K}</td>
                  <td className="num">{zeile.counts['10-Q'] ?? '—'}</td>
                  <td className="num">{zeile.counts['6-K'] ?? '—'}</td>
                  <td className="num">{zeile.counts['20-F'] ?? '—'}</td>
                  <td>{zeile.measured}</td>
                  <td className={zeile.verdict === 'ok' ? '' : 'down'}>
                    {zeile.expected}
                    {zeile.verdict === 'ok' ? '' : ' ⚠'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {zeilen.some((z) => z.note !== null) && (
            <ul className="warnings">
              {zeilen
                .filter((z) => z.note !== null)
                .map((z) => (
                  <li key={z.ticker}>
                    <strong>{z.ticker}</strong>: {z.note}
                  </li>
                ))}
            </ul>
          )}
        </>
      )}
    </>
  )
}
