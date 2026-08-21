# Abdeckungstest Kurse und Bilanzzahlen

Noch nicht gemessen.

Erzeugt von `npm run coverage:data`, entweder lokal

```sh
SEC_USER_AGENT="ticker-alerts/0.1 (deine@adresse.de)" npm run coverage:data
```

oder ueber den Workflow *Datenabdeckung messen* in GitHub Actions. Der
Kursteil braucht keinen Schluessel, der Bilanzteil die CIKs aus
`docs/coverage.json` und denselben User-Agent wie EDGAR.

Bis dahin stehen die Faehigkeiten von Stooq und der XBRL-Schnittstelle in
`src/providers/` auf `evidence: 'vendor_claim'`. Sie sind abgeschrieben,
nicht nachgemessen.
