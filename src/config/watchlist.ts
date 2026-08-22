import { WatchlistEntrySchema } from '../domain/instrument'
import type { WatchlistEntry } from '../domain/instrument'

/**
 * Startwatchlist: 20 Nasdaq-Titel und 20 DAX-Titel.
 *
 * Zur CIK: bleibt leer, bis der Abdeckungstest sie belegt (E9).
 *
 * Zu den ISINs der XETRA-Titel: eingetragen fuer die Live-Kurse ueber
 * Tradegate, als dokumentierte Ausnahme von E9. Die Absicherung gegen
 * eine falsch zugeordnete Nummer ist nicht Sorgfalt beim Abtippen,
 * sondern ein Wachhund zur Laufzeit: ein Tradegate-Kurs wird nur
 * angezeigt, wenn er nahe am gespeicherten Tagesschluss aus Alpha
 * Vantage liegt. Zeigt eine ISIN auf das falsche Unternehmen, faellt
 * der Kurs durch die Pruefung, statt still falsch zu erscheinen.
 *
 * expectedCoverage ist eine Erwartung, kein Messwert. Was tatsaechlich
 * bei der SEC liegt, steht nach dem ersten Lauf in docs/coverage.md.
 */
const RAW_ENTRIES: readonly WatchlistEntry[] = [
  // --- Nasdaq -------------------------------------------------------
  { ticker: 'AAPL', name: 'Apple Inc.', venue: 'NASDAQ', expectedCoverage: 'sec_domestic' },
  { ticker: 'MSFT', name: 'Microsoft Corporation', venue: 'NASDAQ', expectedCoverage: 'sec_domestic' },
  { ticker: 'NVDA', name: 'NVIDIA Corporation', venue: 'NASDAQ', expectedCoverage: 'sec_domestic' },
  { ticker: 'AMZN', name: 'Amazon.com, Inc.', venue: 'NASDAQ', expectedCoverage: 'sec_domestic' },
  { ticker: 'GOOGL', name: 'Alphabet Inc.', venue: 'NASDAQ', expectedCoverage: 'sec_domestic' },
  { ticker: 'META', name: 'Meta Platforms, Inc.', venue: 'NASDAQ', expectedCoverage: 'sec_domestic' },
  { ticker: 'AVGO', name: 'Broadcom Inc.', venue: 'NASDAQ', expectedCoverage: 'sec_domestic' },
  { ticker: 'TSLA', name: 'Tesla, Inc.', venue: 'NASDAQ', expectedCoverage: 'sec_domestic' },
  { ticker: 'COST', name: 'Costco Wholesale Corporation', venue: 'NASDAQ', expectedCoverage: 'sec_domestic' },
  { ticker: 'NFLX', name: 'Netflix, Inc.', venue: 'NASDAQ', expectedCoverage: 'sec_domestic' },
  { ticker: 'AMD', name: 'Advanced Micro Devices, Inc.', venue: 'NASDAQ', expectedCoverage: 'sec_domestic' },
  { ticker: 'ADBE', name: 'Adobe Inc.', venue: 'NASDAQ', expectedCoverage: 'sec_domestic' },
  { ticker: 'CSCO', name: 'Cisco Systems, Inc.', venue: 'NASDAQ', expectedCoverage: 'sec_domestic' },
  { ticker: 'PEP', name: 'PepsiCo, Inc.', venue: 'NASDAQ', expectedCoverage: 'sec_domestic' },
  { ticker: 'INTC', name: 'Intel Corporation', venue: 'NASDAQ', expectedCoverage: 'sec_domestic' },
  { ticker: 'QCOM', name: 'QUALCOMM Incorporated', venue: 'NASDAQ', expectedCoverage: 'sec_domestic' },
  { ticker: 'TXN', name: 'Texas Instruments Incorporated', venue: 'NASDAQ', expectedCoverage: 'sec_domestic' },
  { ticker: 'AMAT', name: 'Applied Materials, Inc.', venue: 'NASDAQ', expectedCoverage: 'sec_domestic' },
  { ticker: 'MU', name: 'Micron Technology, Inc.', venue: 'NASDAQ', expectedCoverage: 'sec_domestic' },
  // Niederlaendischer Emittent an der Nasdaq: 6-K und 20-F statt 10-Q.
  { ticker: 'ASML', name: 'ASML Holding N.V.', venue: 'NASDAQ', expectedCoverage: 'sec_foreign' },

  // --- DAX ----------------------------------------------------------
  { ticker: 'SAP', name: 'SAP SE', venue: 'XETRA', isin: 'DE0007164600', expectedCoverage: 'sec_foreign', secTickerHint: 'SAP' },
  { ticker: 'DBK', name: 'Deutsche Bank AG', venue: 'XETRA', isin: 'DE0005140008', expectedCoverage: 'sec_foreign', secTickerHint: 'DB' },
  { ticker: 'FME', name: 'Fresenius Medical Care AG', venue: 'XETRA', isin: 'DE0005785802', expectedCoverage: 'sec_foreign', secTickerHint: 'FMS' },
  { ticker: 'QIA', name: 'QIAGEN N.V.', venue: 'XETRA', isin: 'NL0012169213', expectedCoverage: 'sec_foreign', secTickerHint: 'QGEN' },
  { ticker: 'SIE', name: 'Siemens AG', venue: 'XETRA', isin: 'DE0007236101', expectedCoverage: 'none' },
  { ticker: 'ALV', name: 'Allianz SE', venue: 'XETRA', isin: 'DE0008404005', expectedCoverage: 'none' },
  { ticker: 'DTE', name: 'Deutsche Telekom AG', venue: 'XETRA', isin: 'DE0005557508', expectedCoverage: 'none' },
  { ticker: 'MUV2', name: 'Münchener Rückversicherungs-Gesellschaft AG', venue: 'XETRA', isin: 'DE0008430026', expectedCoverage: 'none' },
  { ticker: 'AIR', name: 'Airbus SE', venue: 'XETRA', isin: 'NL0000235190', expectedCoverage: 'none' },
  { ticker: 'MBG', name: 'Mercedes-Benz Group AG', venue: 'XETRA', isin: 'DE0007100000', expectedCoverage: 'none' },
  { ticker: 'BMW', name: 'Bayerische Motoren Werke AG', venue: 'XETRA', isin: 'DE0005190003', expectedCoverage: 'none' },
  { ticker: 'BAS', name: 'BASF SE', venue: 'XETRA', isin: 'DE000BASF111', expectedCoverage: 'none' },
  { ticker: 'BAYN', name: 'Bayer AG', venue: 'XETRA', isin: 'DE000BAY0017', expectedCoverage: 'none' },
  { ticker: 'IFX', name: 'Infineon Technologies AG', venue: 'XETRA', isin: 'DE0006231004', expectedCoverage: 'none' },
  { ticker: 'DHL', name: 'DHL Group', venue: 'XETRA', isin: 'DE0005552004', expectedCoverage: 'none' },
  { ticker: 'RWE', name: 'RWE AG', venue: 'XETRA', isin: 'DE0007037129', expectedCoverage: 'none' },
  { ticker: 'ADS', name: 'adidas AG', venue: 'XETRA', isin: 'DE000A1EWWW0', expectedCoverage: 'none' },
  { ticker: 'RHM', name: 'Rheinmetall AG', venue: 'XETRA', isin: 'DE0007030009', expectedCoverage: 'none' },
  { ticker: 'SHL', name: 'Siemens Healthineers AG', venue: 'XETRA', isin: 'DE000SHL1006', expectedCoverage: 'none' },
  { ticker: 'ENR', name: 'Siemens Energy AG', venue: 'XETRA', isin: 'DE000ENER6Y0', expectedCoverage: 'none' },
]

/** Beim Import validiert: eine kaputte Watchlist soll frueh auffallen. */
export const WATCHLIST: readonly WatchlistEntry[] = RAW_ENTRIES.map((entry) =>
  WatchlistEntrySchema.parse(entry),
)

export function watchlistByVenue(venue: WatchlistEntry['venue']): readonly WatchlistEntry[] {
  return WATCHLIST.filter((entry) => entry.venue === venue)
}
