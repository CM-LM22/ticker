# Abdeckungstest EDGAR

Noch nicht gemessen.

Diese Datei erzeugt `npm run coverage:edgar`, entweder lokal

```sh
SEC_USER_AGENT="ticker-alerts/0.1 (deine@adresse.de)" npm run coverage:edgar
```

oder ueber den Workflow *EDGAR-Abdeckungstest* in GitHub Actions. Der
Workflow braucht das Repository-Secret `SEC_USER_AGENT`; ohne einen
User-Agent mit Kontakt-E-Mail antwortet EDGAR mit HTTP 403.

Bis dahin gilt nur die Erwartung aus `src/config/watchlist.ts`, und eine
Erwartung ist kein Messwert.
