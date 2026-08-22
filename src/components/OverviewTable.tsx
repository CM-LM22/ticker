'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useRef, useState } from 'react'
import { formatDay, formatDaysUntil, formatNumber, formatPercent } from '@/lib/format'
import { texte } from '@/lib/sprache'
import type { Sprache } from '@/lib/sprache'

export interface UebersichtZeile {
  ticker: string
  name: string
  venue: 'NASDAQ' | 'NYSE' | 'XETRA'
  /** Selbst hinzugefuegt (nicht Teil des festen Grundstocks). */
  eigen: boolean
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

const TABS = ['alle', 'NASDAQ', 'DAX', 'XETRA-EIGEN'] as const

interface SucheTreffer {
  ticker: string
  name: string
  exchange: string
  imBestand: boolean
  hinzufuegbar: boolean
  grund: string | null
  markt?: 'us' | 'xetra' | 'tradegate'
  isin?: string
}

interface SucheAntwort {
  treffer: SucheTreffer[]
  hinweis: string | null
}

/**
 * Die Uebersichtstabelle mit Suche, Boersen-Reitern und Live-Kursen.
 *
 * Live heisst: alle 60 Sekunden wird /api/quotes gefragt. Der Endpunkt
 * haelt selbst einen Zwischenspeicher, haeufigeres Fragen wuerde also
 * nichts Neueres bringen, nur Last erzeugen. Ohne Schluessel bleiben
 * die gespeicherten Schlusskurse stehen und der Grund wird angezeigt.
 */
export function OverviewTable({
  rows,
  asOfText,
  sprache = 'de',
  children,
}: {
  rows: UebersichtZeile[]
  asOfText: string
  sprache?: Sprache
  children?: React.ReactNode
}) {
  const t = texte(sprache)
  const router = useRouter()
  const [filter, setFilter] = useState('')
  const [tab, setTab] = useState<(typeof TABS)[number]>('alle')
  const [quotes, setQuotes] = useState<Map<string, Quote>>(new Map())
  const [quoteStand, setQuoteStand] = useState<string | null>(null)
  const [quoteHinweis, setQuoteHinweis] = useState<string | null>(null)
  const [sucheTreffer, setSucheTreffer] = useState<SucheTreffer[]>([])
  const [sucheHinweis, setSucheHinweis] = useState<string | null>(null)
  const [xetraTreffer, setXetraTreffer] = useState<SucheTreffer[] | null>(null)
  const [xetraHinweis, setXetraHinweis] = useState<string | null>(null)
  const [xetraLaeuft, setXetraLaeuft] = useState(false)
  const [addStatus, setAddStatus] = useState<string | null>(null)
  const [addLaeuft, setAddLaeuft] = useState(false)
  // Nach links gewischte Zeile im Xetra-Reiter: zeigt den Papierkorb.
  const [wischOffen, setWischOffen] = useState<string | null>(null)
  const wischStart = useRef<{ x: number; y: number } | null>(null)

  function wischBeginn(ereignis: React.TouchEvent): void {
    const punkt = ereignis.touches[0]
    if (punkt !== undefined) wischStart.current = { x: punkt.clientX, y: punkt.clientY }
  }

  function wischEnde(ereignis: React.TouchEvent, ticker: string): void {
    const start = wischStart.current
    wischStart.current = null
    const punkt = ereignis.changedTouches[0]
    if (start === null || punkt === undefined) return
    const dx = punkt.clientX - start.x
    const dy = punkt.clientY - start.y
    if (dx < -40 && Math.abs(dy) < 30) setWischOffen(ticker)
    else if (dx > 40) setWischOffen(null)
  }

  // Ab zwei Zeichen fragt die Suche zusaetzlich das SEC-Verzeichnis,
  // damit sich neue Titel direkt aus dem Suchfeld hinzufuegen lassen.
  // 400 ms Ruhe vor dem Abruf, sonst je Tastendruck eine Anfrage.
  useEffect(() => {
    const suche = filter.trim()
    setXetraTreffer(null)
    setXetraHinweis(null)
    if (suche.length < 2) {
      setSucheTreffer([])
      setSucheHinweis(null)
      return
    }
    let aktiv = true
    const timer = setTimeout(() => {
      void fetch(`/api/suche?q=${encodeURIComponent(suche)}`)
        .then((antwort) => antwort.json() as Promise<SucheAntwort>)
        .then((antwort) => {
          if (!aktiv) return
          setSucheTreffer(antwort.treffer)
          setSucheHinweis(antwort.hinweis)
        })
        .catch(() => {
          if (aktiv) setSucheHinweis('Suche gerade nicht erreichbar.')
        })
    }, 400)
    return () => {
      aktiv = false
      clearTimeout(timer)
    }
  }, [filter])

  async function xetraSuchen(): Promise<void> {
    const suche = filter.trim()
    if (suche.length < 2) return
    setXetraLaeuft(true)
    setXetraHinweis(null)
    try {
      const antwort = await fetch(`/api/suche?q=${encodeURIComponent(suche)}&markt=xetra`)
      const daten = (await antwort.json()) as SucheAntwort
      setXetraTreffer(daten.treffer)
      setXetraHinweis(daten.hinweis)
    } catch {
      setXetraHinweis('XETRA-Suche gerade nicht erreichbar.')
    } finally {
      setXetraLaeuft(false)
    }
  }

  async function hinzufuegen(treffer: Pick<SucheTreffer, 'ticker' | 'markt' | 'isin'>): Promise<void> {
    const { ticker } = treffer
    setAddLaeuft(true)
    setAddStatus(`${ticker} wird hinzugefuegt …`)
    try {
      const koerper: Record<string, string> = { ticker }
      if (treffer.markt !== undefined && treffer.markt !== 'us') koerper['markt'] = treffer.markt
      if (treffer.isin !== undefined) koerper['isin'] = treffer.isin
      const antwort = await fetch('/api/watchlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(koerper),
      })
      const daten = (await antwort.json()) as { ok: boolean; fehler?: string }
      if (!daten.ok) {
        setAddStatus(daten.fehler ?? 'Hinzufuegen fehlgeschlagen.')
        return
      }
      // Direkt die Daten des neuen Titels holen. Alle anderen sind
      // frisch und werden in Millisekunden uebersprungen; hoechstens
      // drei Runden, falls der Stapel vorher ans Zeitlimit stoesst.
      setAddStatus(`${ticker} hinzugefuegt, Daten werden geholt …`)
      let offset = 0
      for (let runde = 0; runde < 3; runde += 1) {
        const stapel = await fetch(`/api/refresh?offset=${offset}&limit=40`, { method: 'POST' })
        const ergebnis = (await stapel.json()) as {
          done?: boolean
          naechsterOffset?: number | null
        }
        if (ergebnis.done === true || ergebnis.naechsterOffset == null) break
        offset = ergebnis.naechsterOffset
      }
      setAddStatus(`${ticker} ist jetzt in der Watchlist.`)
      setFilter('')
      router.refresh()
    } catch {
      setAddStatus('Hinzufuegen fehlgeschlagen, bitte nochmal versuchen.')
    } finally {
      setAddLaeuft(false)
    }
  }

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
      // Nasdaq: alle US-Titel. DAX: der feste deutsche Grundstock.
      // Xetra: die selbst hinzugefuegten deutschen Titel.
      if (tab === 'NASDAQ' && zeile.venue === 'XETRA') return false
      if (tab === 'DAX' && (zeile.venue !== 'XETRA' || zeile.eigen)) return false
      if (tab === 'XETRA-EIGEN' && (zeile.venue !== 'XETRA' || !zeile.eigen)) return false
      if (suche.length === 0) return true
      return (
        zeile.ticker.toLowerCase().includes(suche) || zeile.name.toLowerCase().includes(suche)
      )
    })
  }, [rows, filter, tab])

  async function zeileEntfernen(ticker: string): Promise<void> {
    setAddLaeuft(true)
    try {
      const antwort = await fetch('/api/watchlist', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticker }),
      })
      const daten = (await antwort.json()) as { ok: boolean; fehler?: string }
      setAddStatus(daten.ok ? null : (daten.fehler ?? 'Entfernen fehlgeschlagen.'))
      if (daten.ok) router.refresh()
    } catch {
      setAddStatus('Entfernen fehlgeschlagen, bitte nochmal versuchen.')
    } finally {
      setAddLaeuft(false)
    }
  }

  return (
    <>
      <div className="toolbar">
        <input
          type="search"
          placeholder={t.suchePlatzhalter}
          aria-label={t.sucheLabel}
          value={filter}
          onChange={(ereignis) => setFilter(ereignis.target.value)}
        />
        <div className="tabs" role="tablist">
          {TABS.map((wert) => (
            <button
              key={wert}
              type="button"
              role="tab"
              aria-selected={tab === wert}
              className={tab === wert ? 'tab aktiv' : 'tab'}
              onClick={() => setTab(wert)}
            >
              {wert === 'alle'
                ? t.tabAlle
                : wert === 'NASDAQ'
                  ? t.tabNasdaq
                  : wert === 'DAX'
                    ? t.tabDax
                    : t.tabXetra}
            </button>
          ))}
        </div>
        <span className="muted quote-stand">
          {quoteStand !== null ? (
            <>
              <span className="live-dot" aria-hidden="true" /> {t.kurseUm} {quoteStand} {t.uhr}
            </>
          ) : (
            asOfText
          )}
        </span>
      </div>

      <div className="table-scroll">
      {quoteHinweis !== null && <p className="muted footnote">{quoteHinweis}</p>}
      <table className="overview">
        <thead>
          <tr>
            <th>{t.spalteTitel}</th>
            <th className="num">{t.spalteKurs}</th>
            <th className="num">{t.spalteHeute}</th>
            <th>{t.spalte52w}</th>
            <th className="num">{t.spalte12m}</th>
            <th className="num">{t.spalteBand}</th>
            <th>{t.spalteZahlen}</th>
            <th className="num">{t.spaltePunkte}</th>
          </tr>
        </thead>
        <tbody>
          {sichtbar.map((zeile) => {
            const quote = quotes.get(zeile.ticker)
            const preis = quote?.price ?? zeile.kurs
            const waehrung = quote?.currency ?? zeile.currency
            return (
              <tr key={`${zeile.venue}:${zeile.ticker}`}>
                <td
                  className={
                    tab === 'XETRA-EIGEN' && zeile.eigen
                      ? `wischbar${wischOffen === zeile.ticker ? ' offen' : ''}`
                      : undefined
                  }
                  onTouchStart={tab === 'XETRA-EIGEN' && zeile.eigen ? wischBeginn : undefined}
                  onTouchEnd={
                    tab === 'XETRA-EIGEN' && zeile.eigen
                      ? (ereignis) => wischEnde(ereignis, zeile.ticker)
                      : undefined
                  }
                >
                  <Link href={`/titel/${zeile.ticker.toLowerCase()}`}>
                    <strong>{zeile.ticker}</strong>
                  </Link>
                  <span className="muted"> {zeile.name}</span>
                  {tab === 'XETRA-EIGEN' && zeile.eigen && wischOffen === zeile.ticker && (
                    <button
                      type="button"
                      className="wisch-loeschen"
                      aria-label={t.entfernen}
                      disabled={addLaeuft}
                      onClick={() => {
                        setWischOffen(null)
                        void zeileEntfernen(zeile.ticker)
                      }}
                    >
                      🗑
                    </button>
                  )}
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
                    <span className="muted">{t.nichtSchaetzbar}</span>
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
        <p className="muted">{tab === 'XETRA-EIGEN' && filter.trim().length === 0 ? t.xetraLeer : t.keinTreffer}</p>
      )}

      {addStatus !== null && <p className="footnote">{addStatus}</p>}

      {filter.trim().length >= 2 && (
        <section className="add-panel">
          <h2>{t.neuHinzufuegen}</h2>
          <p className="muted footnote">
            {t.neuErklaerung}
          </p>
          {sucheHinweis !== null && <p className="muted footnote">{sucheHinweis}</p>}
          {sucheTreffer.filter((treffer) => !treffer.imBestand).length === 0 &&
            sucheHinweis === null && (
              <p className="muted footnote">{t.keinSecTreffer}</p>
            )}
          <ul className="add-list">
            {sucheTreffer
              .filter((treffer) => !treffer.imBestand)
              .map((treffer) => (
                <li key={treffer.ticker}>
                  <strong>{treffer.ticker}</strong>
                  <span className="muted"> {treffer.name} · {treffer.exchange}</span>{' '}
                  {treffer.hinzufuegbar ? (
                    <button
                      type="button"
                      disabled={addLaeuft}
                      onClick={() => void hinzufuegen(treffer)}
                    >
                      {t.hinzufuegen}
                    </button>
                  ) : (
                    <span className="muted">{treffer.grund}</span>
                  )}
                </li>
              ))}
          </ul>

          <div className="xetra-suche">
            {xetraTreffer === null ? (
              <p className="footnote">
                <button type="button" disabled={xetraLaeuft} onClick={() => void xetraSuchen()}>
                  {xetraLaeuft ? t.xetraSucht : t.xetraSuchen}
                </button>{' '}
                <span className="muted">
                  {t.xetraKosten}
                </span>
              </p>
            ) : (
              <>
                {xetraTreffer.filter((treffer) => !treffer.imBestand).length === 0 &&
                  xetraHinweis === null && (
                    <p className="muted footnote">{t.keinXetraTreffer}</p>
                  )}
                <ul className="add-list">
                  {xetraTreffer
                    .filter((treffer) => !treffer.imBestand)
                    .map((treffer) => (
                      <li key={`xetra-${treffer.ticker}`}>
                        <strong>{treffer.ticker}</strong>
                        <span className="muted"> {treffer.name} · XETRA</span>{' '}
                        <button
                          type="button"
                          disabled={addLaeuft}
                          onClick={() => void hinzufuegen({ ...treffer, markt: 'xetra' })}
                        >
                          {t.hinzufuegen}
                        </button>
                      </li>
                    ))}
                </ul>
              </>
            )}
            {xetraHinweis !== null && <p className="muted footnote">{xetraHinweis}</p>}
          </div>
        </section>
      )}

      {children}
      </div>
    </>
  )
}
