import { WatchlistEntrySchema } from '../domain/instrument'
import type { WatchlistEntry } from '../domain/instrument'

/**
 * Startwatchlist: 20 Nasdaq-Titel und 20 DAX-Titel.
 *
 * Zu ISIN und CIK: beide Felder bleiben vorerst leer. Erfundene
 * Kennnummern sind schlimmer als fehlende, weil sie stillschweigend
 * falsch matchen. Die CIK traegt der Abdeckungstest nach
 * (npm run coverage:edgar), die ISIN brauchen wir erst, wenn eine
 * nicht-amerikanische Quelle dazukommt.
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
  { ticker: 'SAP', name: 'SAP SE', venue: 'XETRA', expectedCoverage: 'sec_foreign', secTickerHint: 'SAP' },
  { ticker: 'DBK', name: 'Deutsche Bank AG', venue: 'XETRA', expectedCoverage: 'sec_foreign', secTickerHint: 'DB' },
  { ticker: 'FME', name: 'Fresenius Medical Care AG', venue: 'XETRA', expectedCoverage: 'sec_foreign', secTickerHint: 'FMS' },
  { ticker: 'QIA', name: 'QIAGEN N.V.', venue: 'XETRA', expectedCoverage: 'sec_foreign', secTickerHint: 'QGEN' },
  { ticker: 'SIE', name: 'Siemens AG', venue: 'XETRA', expectedCoverage: 'none' },
  { ticker: 'ALV', name: 'Allianz SE', venue: 'XETRA', expectedCoverage: 'none' },
  { ticker: 'DTE', name: 'Deutsche Telekom AG', venue: 'XETRA', expectedCoverage: 'none' },
  { ticker: 'MUV2', name: 'Münchener Rückversicherungs-Gesellschaft AG', venue: 'XETRA', expectedCoverage: 'none' },
  { ticker: 'AIR', name: 'Airbus SE', venue: 'XETRA', expectedCoverage: 'none' },
  { ticker: 'MBG', name: 'Mercedes-Benz Group AG', venue: 'XETRA', expectedCoverage: 'none' },
  { ticker: 'BMW', name: 'Bayerische Motoren Werke AG', venue: 'XETRA', expectedCoverage: 'none' },
  { ticker: 'BAS', name: 'BASF SE', venue: 'XETRA', expectedCoverage: 'none' },
  { ticker: 'BAYN', name: 'Bayer AG', venue: 'XETRA', expectedCoverage: 'none' },
  { ticker: 'IFX', name: 'Infineon Technologies AG', venue: 'XETRA', expectedCoverage: 'none' },
  { ticker: 'DHL', name: 'DHL Group', venue: 'XETRA', expectedCoverage: 'none' },
  { ticker: 'RWE', name: 'RWE AG', venue: 'XETRA', expectedCoverage: 'none' },
  { ticker: 'ADS', name: 'adidas AG', venue: 'XETRA', expectedCoverage: 'none' },
  { ticker: 'RHM', name: 'Rheinmetall AG', venue: 'XETRA', expectedCoverage: 'none' },
  { ticker: 'SHL', name: 'Siemens Healthineers AG', venue: 'XETRA', expectedCoverage: 'none' },
  { ticker: 'ENR', name: 'Siemens Energy AG', venue: 'XETRA', expectedCoverage: 'none' },
]

/** Beim Import validiert: eine kaputte Watchlist soll frueh auffallen. */
export const WATCHLIST: readonly WatchlistEntry[] = RAW_ENTRIES.map((entry) =>
  WatchlistEntrySchema.parse(entry),
)

export function watchlistByVenue(venue: WatchlistEntry['venue']): readonly WatchlistEntry[] {
  return WATCHLIST.filter((entry) => entry.venue === venue)
}
