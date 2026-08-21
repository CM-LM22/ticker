# Ticker

Benachrichtigt ueber Quartalszahlen-Ankuendigungen und Analystenratings zu
einer festen Watchlist aus 20 Nasdaq- und 20 DAX-Titeln.

Stand: **Slice 0 und 5**. Domaenenmodell, Anbieter-Interfaces, Kurs- und
Bilanzauswertung, Terminschaetzung und Oberflaeche stehen. Die Oberflaeche
laeuft noch auf erkennbar erfundenen Demodaten: es wird bislang keine
externe Schnittstelle abgerufen und keine Datenbank verbunden.

> Keine Anlageberatung, keine Kaufempfehlung, kein automatischer Handel.

## Loslegen

```sh
npm install
npm test          # Domaenenlogik, ohne Netz
npm run typecheck
npm run dev       # Uebersichtsseite unter http://localhost:3000
```

## Abdeckungstests

Beantworten empirisch, was kostenlos ueberhaupt zu bekommen ist. Erst
EDGAR, dann Kurse und Bilanzzahlen; der zweite Test braucht die CIKs aus
dem ersten:

```sh
export SEC_USER_AGENT="ticker-alerts/0.1 (deine@adresse.de)"
npm run coverage:edgar   # -> docs/coverage.md
npm run coverage:data    # -> docs/data-coverage.md
```

Ohne User-Agent mit Kontakt-E-Mail antwortet EDGAR mit HTTP 403.
Alternativ laufen beide als Workflow *Datenabdeckung messen* in GitHub
Actions.

## Aufbau

| Pfad | Inhalt |
| --- | --- |
| `src/domain/` | Ereignismodell, Idempotency-Key, Ratings-Diff, Matching, 52-Wochen-Auswertung, Bilanzkennzahlen, Terminschaetzung, Punktzahl. Rein, ohne I/O. |
| `src/providers/` | Anbieter-Interfaces samt Faehigkeitsbeschreibung, Stooq- und XBRL-Adapter, Attrappen. |
| `src/demo/` | Erfundene Daten fuer die Oberflaeche, bis Slice 6 sie ersetzt. |
| `src/lib/` | Anzeigeformate und Chart-Geometrie. |
| `src/config/watchlist.ts` | Die 40 beobachteten Titel. |
| `src/db/schema.sql` | Postgres-Schema inklusive Queue-Semantik. Noch nicht migriert. |
| `scripts/edgar-coverage.ts` | Abdeckungstest gegen EDGAR. |
| `scripts/data-coverage.ts` | Abdeckungstest fuer Kurse und Bilanzzahlen. |
| `docs/decisions.md` | Getroffene Entscheidungen mit Begruendung. |
| `AGENTS.md` | Arbeitsregeln. |
