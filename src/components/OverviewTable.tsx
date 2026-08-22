'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { formatDay, formatDaysUntil, formatNumber, formatPercent } from '@/lib/format'

export interface UebersichtZeile {
  ticker: string
  name: string
  venue: 'NASDAQ' | 'NYSE' | 'XETRA'
  kurs: number | null
  currency: string | null
  sparkPath: string | null
  sparkRising: boolean
  ret12M: number | null
  /** Position im 52-Wochen-Band, 0 bis 100. */
  band: number | null
  terminTag: string | null
  score: number | null
  coverage: number
}

interface Quote {
  ticker: string
  price: number
  changePct: number | null
  currency: string
}

interface QuotesAntwort {
  fetchedAt: string
  quotes: Quote[]
  hinweis: string | null
}

const TABS = [
  ['alle', 'Alle'],
  ['NASDAQ', 'Nasdaq'],
  ['XETRA', 'DAX'],
] as const

/**
 * Die Uebersichtstabelle mit Suche, Boersen-Reitern und Live-Kursen.
 *
 * Live heisst: alle 60 Sekunden wird /api/quotes gefragt. Der Endpunkt
 * haelt selbst einen Zwischenspeicher, haeufigeres Fragen wuerde also
 * nichts Neueres bringen, nur Last erzeugen. Ohne Schluessel bleiben
 * die gespeicherten Schlusskurse stehen und der Grund wird angezeigt.
 */
export function OverviewTable({ rows, asOfText }: { rows: UebersichtZeile[]; asOfText: string }) {
  const [filter, setFilter] = useState('')
  const [tab, setTab] = useState<(typeof TABS)[number][0]>('alle')
  const [quotes, setQuotes] = useState<Map<string, Quote>>(new Map())
  const [quoteStand, setQuoteStand] = useState<string | null>(null)
  const [quoteHinweis, setQuoteHinweis] = useState<string | null>(null)

  useEffect(() => {
    let aktiv = true
    const holen = async (): Promise<void> => {
      try {
        const antwort = (await fetch('/api/quotes').then((r) => r.json())) as QuotesAntwort
        if (!aktiv) return
        setQuotes(new Map(antwort.quotes.map((quote) => [quote.ticker, quote])))
        setQuoteHinweis(antwort.hinweis)
        if (antwort.quotes.length > 0) {
          setQuoteStand(
            new Date(antwort.fetchedAt).toLocaleTimeString('de-DE', {
              hour: '2-digit',
              minute: '2-digit',
            }),
          )
        }
      } catch {
        // Naechster Versuch in einer Minute; die Tabelle bleibt nutzbar.
      }
    }
    void holen()
    const takt = setInterval(() => void holen(), 60_000)
    return () => {
      aktiv = false
      clearInterval(takt)
    }
  }, [])

  const sichtbar = useMemo(() => {
    const suche = filter.trim().toLowerCase()
    return rows.filter((zeile) => {
      if (tab !== 'alle' && zeile.venue !== tab) return false
      if (suche.length === 0) return true
      return (
        zeile.ticker.toLowerCase().includes(suche) || zeile.name.toLowerCase().includes(suche)
      )
    })
  }, [rows, filter, tab])

  return (
    <>
      <div className="toolbar">
        <input
          type="search"
          placeholder="Titel suchen …"
          aria-label="Titel suchen"
          value={filter}
          onChange={(ereignis) => setFilter(ereignis.target.value)}
        />
        <div className="tabs" role="tablist">
          {TABS.map(([wert, beschriftung]) => (
            <button
              key={wert}
              type="button"
              role="tab"
              aria-selected={tab === wert}
              className={tab === wert ? 'tab aktiv' : 'tab'}
              onClick={() => setTab(wert)}
            >
              {beschriftung}
            </button>
          ))}
        </div>
        <span className="muted quote-stand">
          {quoteStand !== null ? (
            <>
              <span className="live-dot" aria-hidden="true" /> Kurse {quoteStand} Uhr
            </>
          ) : (
            asOfText
          )}
        </span>
      </div>

      {quoteHinweis !== null && <p className="muted footnote">{quoteHinweis}</p>}

      <table className="overview">
        <thead>
          <tr>
            <th>Titel</th>
            <th className="num">Kurs</th>
            <th className="num">heute</th>
            <th>52 Wochen</th>
            <th className="num">12 Mon.</th>
            <th className="num">im Band</th>
            <th>naechste Zahlen</th>
            <th className="num">Punkte</th>
          </tr>
        </thead>
        <tbody>
          {sichtbar.map((zeile) => {
            const quote = quotes.get(zeile.ticker)
            const preis = quote?.price ?? zeile.kurs
            const waehrung = quote?.currency ?? zeile.currency
            return (
              <tr key={`${zeile.venue}:${zeile.ticker}`}>
                <td>
                  <Link href={`/titel/${zeile.ticker.toLowerCase()}`}>
                    <strong>{zeile.ticker}</strong>
                  </Link>
                  <span className="muted"> {zeile.name}</span>
                </td>
                <td className="num">
                  {preis === null || waehrung === null ? (
                    <span className="muted">—</span>
                  ) : (
                    `${formatNumber(preis, 2)} ${waehrung}`
                  )}
                </td>
                <td className={`num ${(quote?.changePct ?? 0) >= 0 ? 'up' : 'down'}`}>
                  {quote?.changePct == null ? (
                    <span className="muted">—</span>
                  ) : (
                    formatPercent(quote.changePct)
                  )}
                </td>
                <td>
                  {zeile.sparkPath === null ? (
                    <span className="muted">—</span>
                  ) : (
                    <svg className="sparkline" viewBox="0 0 120 28" aria-hidden="true">
                      <path
                        d={zeile.sparkPath}
                        className={zeile.sparkRising ? 'chart-line up' : 'chart-line down'}
                        vectorEffect="non-scaling-stroke"
                      />
                    </svg>
                  )}
                </td>
                <td className={`num ${(zeile.ret12M ?? 0) >= 0 ? 'up' : 'down'}`}>
                  {formatPercent(zeile.ret12M)}
                </td>
                <td className="num">{zeile.band === null ? '—' : `${zeile.band.toFixed(0)} %`}</td>
                <td>
                  {zeile.terminTag === null ? (
                    <span className="muted">nicht schaetzbar</span>
                  ) : (
                    <>
                      {formatDay(zeile.terminTag)}
                      <span className="muted">
                        {' '}
                        · {formatDaysUntil(zeile.terminTag, new Date())}
                      </span>
                    </>
                  )}
                </td>
                <td className="num">
                  {zeile.score === null ? (
                    <span className="muted">—</span>
                  ) : (
                    <>
                      <strong>{zeile.score.toFixed(0)}</strong>
                      <span className="muted"> · {(zeile.coverage * 100).toFixed(0)}&nbsp;%</span>
                    </>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>

      {sichtbar.length === 0 && (
        <p className="muted">Kein Titel passt zu dieser Suche.</p>
      )}
    </>
  )
}
