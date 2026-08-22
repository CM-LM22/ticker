import { describe, expect, it } from 'vitest'
import { helveticaWidth, pdfAsString, renderSinglePagePdf, truncateToWidth } from './pdf'

describe('helveticaWidth', () => {
  it('misst Helvetica-ASCII in em-Einheiten', () => {
    expect(helveticaWidth(' ', 10)).toBeCloseTo(2.78)
    expect(helveticaWidth('W', 10)).toBeCloseTo(9.44)
    expect(helveticaWidth('i', 10)).toBeCloseTo(2.22)
  })

  it('kuerzt auf die Breite und setzt Auslassungspunkte', () => {
    const cut = truncateToWidth('Münchener Rückversicherungs-Gesellschaft AG', 8, 80)
    expect(cut.endsWith('…')).toBe(true)
    expect(helveticaWidth(cut, 8)).toBeLessThanOrEqual(80)
  })
})

describe('renderSinglePagePdf', () => {
  const bytes = renderSinglePagePdf({
    width: 595,
    height: 842,
    texts: [
      { x: 50, y: 800, size: 12, font: 'bold', text: 'Ticker' },
      { x: 50, y: 780, size: 8, font: 'regular', text: 'AAPL Umsatz 94 Mrd.' },
    ],
  })
  const raw = pdfAsString(bytes)

  it('schreibt eine gueltige einseitige PDF-Datei', () => {
    expect(raw.startsWith('%PDF-1.4')).toBe(true)
    expect(raw).toContain('%%EOF')
    expect(raw).toContain('/Count 1')
    expect(raw).toContain('/MediaBox [0 0 595 842]')
  })

  it('legt die Klartextzeilen in die Seite', () => {
    expect(raw).toContain('(Ticker)')
    expect(raw).toContain('(AAPL Umsatz 94 Mrd.)')
  })
})
