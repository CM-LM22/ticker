import { describe, expect, it } from 'vitest'
import { extrahiereMdna, findePrimaerdokument, htmlZuText } from './sec-mdna'

describe('findePrimaerdokument', () => {
  it('nimmt die groesste HTML-Datei ohne Index und Anhaenge', () => {
    const dokument = findePrimaerdokument(
      {
        directory: {
          item: [
            { name: 'aapl-20260627-index.htm', size: 1200 },
            { name: 'ex-991.htm', size: 900000 },
            { name: 'R2.htm', size: 800000 },
            { name: 'aapl-20260627.htm', size: 700000 },
            { name: 'Financial_Report.xlsx', size: 999999 },
          ],
        },
      },
      'https://www.sec.gov/Archives/edgar/data/320193/000032019326000073/',
    )
    expect(dokument?.name).toBe('aapl-20260627.htm')
    expect(dokument?.url).toContain('/000032019326000073/aapl-20260627.htm')
  })

  it('liefert null bei unbrauchbarem Index', () => {
    expect(findePrimaerdokument({}, 'https://x/')).toBeNull()
    expect(findePrimaerdokument({ directory: { item: [] } }, 'https://x/')).toBeNull()
  })
})

describe('htmlZuText', () => {
  it('entfernt Tags und Skripte und loest Entitaeten auf', () => {
    const text = htmlZuText(
      '<html><script>var x = 1;</script><body><p>Revenue &amp; profit rose.</p><div>Next&nbsp;line</div></body></html>',
    )
    expect(text).toContain('Revenue & profit rose.')
    expect(text).toContain('Next line')
    expect(text).not.toContain('var x')
    expect(text).not.toContain('<p>')
  })
})

function beispielFiling(): string {
  const saetze =
    'The Company designs, manufactures and markets smartphones and related services to consumers worldwide, and total net sales increased 6% in the third quarter of 2026 compared to the same quarter of 2025. ' +
    'The growth was driven primarily by higher net sales of services, partially offset by lower net sales of wearables, and gross margin percentage increased during the quarter due to a favorable product mix. '
  return [
    'PART I',
    "Item 2. Management's Discussion and Analysis of Financial Condition and Results of Operations 24", // Inhaltsverzeichnis
    'Some other section text here with plenty of content to skip over entirely.',
    "Management's Discussion and Analysis of Financial Condition and Results of Operations",
    saetze,
    saetze,
    'Item 3. Quantitative and Qualitative Disclosures About Market Risk',
    'This part must not appear in the excerpt at all.',
  ].join('\n')
}

describe('extrahiereMdna', () => {
  it('nimmt die letzte Fundstelle (nach dem Inhaltsverzeichnis) und endet vor dem naechsten Item', () => {
    const auszug = extrahiereMdna(beispielFiling())
    expect(auszug).not.toBeNull()
    expect(auszug).toContain('total net sales increased 6%')
    expect(auszug).not.toContain('Inhaltsverzeichnis')
    expect(auszug).not.toContain('must not appear')
    expect(auszug).not.toContain('other section text')
  })

  it('kappt an einer Satzgrenze', () => {
    const auszug = extrahiereMdna(beispielFiling(), 220)
    expect(auszug).not.toBeNull()
    expect(auszug !== null && auszug.length).toBeLessThanOrEqual(240)
    expect(auszug?.endsWith('.') || auszug?.endsWith('…')).toBe(true)
  })

  it('liefert null, wenn es keinen MD&A-Abschnitt gibt', () => {
    expect(extrahiereMdna('Ein 6-K ohne einschlaegige Ueberschrift.')).toBeNull()
  })
})
