import { describe, expect, it } from 'vitest'
import { parseTradegateSuche, tradegateSucheUrl } from './tradegate-suche'

const BEISPIEL_HTML = `
<html><body>
<table>
<tr><th>WKN</th><th>ISIN</th><th>Name</th></tr>
<tr onclick="location='orderbuch.php?isin=LU0061462528'">
  <td>861149</td><td>LU0061462528</td><td><a href="orderbuch.php?isin=LU0061462528">RTL Group S.A.</a></td>
</tr>
<tr><td>A3E5ES</td><td>DE000A3E5ES1</td><td><a href="orderbuch.php?isin=DE000A3E5ES1">Beispiel &amp; Co. KGaA</a></td></tr>
<tr><td>kaputt</td><td>keine-isin</td><td>Zeile ohne Verweis</td></tr>
<tr><td>861149</td><td>LU0061462528</td><td><a href="orderbuch.php?isin=LU0061462528">RTL Group S.A. (Doppelt)</a></td></tr>
</table>
</body></html>`

describe('tradegateSucheUrl', () => {
  it('kodiert den Suchbegriff', () => {
    expect(tradegateSucheUrl('RTL Group')).toBe(
      'https://www.tradegate.de/kurssuche.php?suche=RTL%20Group',
    )
  })
})

describe('parseTradegateSuche', () => {
  it('liest ISIN, WKN und Namen je Zeile und dedupliziert', () => {
    const treffer = parseTradegateSuche(BEISPIEL_HTML)
    expect(treffer).toEqual([
      { isin: 'LU0061462528', wkn: '861149', name: 'RTL Group S.A.' },
      { isin: 'DE000A3E5ES1', wkn: 'A3E5ES', name: 'Beispiel & Co. KGaA' },
    ])
  })

  it('liefert leer bei fremdem Seitenaufbau statt zu raten', () => {
    expect(parseTradegateSuche('<html><body>Keine Tabelle hier.</body></html>')).toEqual([])
  })

  it('begrenzt die Trefferzahl', () => {
    const viele = Array.from(
      { length: 20 },
      (_, index) =>
        `<tr><td>WKN${String(index).padStart(3, '0')}</td><td>DE00000000${String(index).padStart(2, '0')}</td>` +
        `<td><a href="orderbuch.php?isin=DE00000000${String(index).padStart(2, '0')}">Titel Nummer ${index}</a></td></tr>`,
    ).join('')
    expect(parseTradegateSuche(`<table>${viele}</table>`, 5).length).toBeLessThanOrEqual(5)
  })
})
