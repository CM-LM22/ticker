# Entscheidungen

Chronologisch. Was hier steht, wird nicht neu diskutiert, sondern nur
geaendert, wenn ein Messwert dagegen spricht.

## E1 Zuerst eine vollstaendig kostenfreie Version

Kein Datenabo, bevor die App laeuft und der Mangel in der Praxis sichtbar
ist. Begruendung: Welche Luecke wirklich weh tut, zeigt sich erst im
Betrieb, nicht in einer Anbieterliste.

## E2 SEC EDGAR als Fundament

Kostenlos, Atom-Feeds nahezu in Echtzeit, 10 Anfragen pro Sekunde,
User-Agent mit Kontakt-E-Mail zwingend. Relevante Formulare: 8-K Item 2.02,
10-Q, 10-K fuer US-Inlandsemittenten; 6-K und 20-F fuer Foreign Private
Issuers.

## E3 Europaeische Titel nur ueber ihre US-Notierung

Konzerne mit US-Notierung reichen 6-K und 20-F bei der SEC ein. Reine
EU-Titel ohne US-Notierung sind kostenlos nicht abzudecken. Bewusst
akzeptierte Luecke.

**Nachtrag zur DAX-Auswahl:** Von den 20 aufgenommenen DAX-Titeln sind nach
Recherchestand nur vier SEC-registriert: SAP, Deutsche Bank, Fresenius
Medical Care und Qiagen. Die uebrigen 16 haben ihre US-Notierung zwischen
2007 und 2014 aufgegeben und sind bei der SEC abgemeldet. Die Luecke ist
damit groesser als die Formulierung "einige EU-Titel" vermuten laesst. Der
Abdeckungstest misst das nach; bis dahin steht in `watchlist.ts` nur eine
Erwartung.

## E4 Aufruestpfad steht fest, ist aber nicht ausgeloest

EODHD Fundamentals, 59,99 EUR/Monat, deckt Europa vollstaendig ab. Finnhub
und FMP wurden verworfen, weil Europa dort zu teuer oder erst in der
hoechsten Stufe enthalten ist. Eine kostenlose offizielle EU-Quelle
existiert nicht. Ausgeloest wird der Pfad erst, wenn der Betrieb zeigt,
dass die Luecke stoert.

## E5 GitHub Actions als Scheduler, 30-Minuten-Takt

Ein Lauf kostet rund eine Minute, ein privates Repository hat 2.000
Minuten im Monat. 30 Minuten Takt ergibt rund 1.440 Minuten und passt,
15 Minuten ergaebe rund 2.900 und passt nicht. Vercel Hobby scheidet aus:
nur ein Cronlauf pro Tag.

Zwei Vorbehalte, die zum Betrieb gehoeren:
- Geplante Workflows starten unter Last regelmaessig 5 bis 15 Minuten
  verspaetet. Die Zusage lautet also "innerhalb einer halben bis dreiviertel
  Stunde", nicht "in Echtzeit".
- GitHub deaktiviert Cron-Workflows nach 60 Tagen ohne Repository-Aktivitaet.

CI teilt sich dasselbe Kontingent. Deshalb laeuft in CI nur Typpruefung und
Test, kein `next build`; gebaut wird auf Vercel.

**Offen:** Bei einem oeffentlichen Repository sind Actions-Minuten
unbegrenzt frei, der 15-Minuten-Takt waere kostenlos zu haben. Secrets
liegen ohnehin in Actions-Secrets. Noch nicht entschieden.

## E6 Postgres ist die Queue

Kein Message Broker. Anspruch auf faellige Ereignisse ueber
`FOR UPDATE SKIP LOCKED`, Zustandsspalten auf `event`, Zustell-Log in
`event_delivery`. Begruendung: ein paar Dutzend Ereignisse pro Tag
rechtfertigen keinen weiteren Dienst, und jeder weitere Gratis-Tarif ist
ein weiteres Kontingent, das auslaufen kann.

## E7 Ratings sind ein Snapshot, kein Strom

Kostenlose Anbieter liefern nur den aktuellen Stand. Den Ereignisstrom
erzeugen wir selbst: pollen, gegen den letzten Stand diffen, Differenz als
Ereignis. Zwei Regeln sind fest verdrahtet und in Tests festgehalten:

- Der erste Snapshot eines Titels loest nie einen Alert aus.
- Fallengelassene Ratings werden standardmaessig **nicht** gemeldet. Die
  meisten Free Tiers liefern ein rollierendes Fenster; ein Haus verschwindet
  daraus, weil sein Rating alt wird, nicht weil es die Abdeckung eingestellt
  hat. Wer `emitDrops` einschaltet, bekommt falsche Alerts.

## E8 Kein ORM in Slice 0

`src/db/schema.sql` ist die Quelle der Wahrheit. Begruendung: In Slice 0
gibt es keine Datenbankverbindung, an der sich ein ORM bewaehren koennte,
und die Queue-Abfrage mit `FOR UPDATE SKIP LOCKED` schreibt man ohnehin von
Hand. Ob in Slice 1 Drizzle oder das nackte Postgres-Protokoll dazukommt,
entscheidet sich dort, wo es Konsequenzen hat.

## E9 Keine erfundenen Kennnummern

`isin` und `cik` bleiben in `src/config/watchlist.ts` leer, bis sie
gemessen sind. Eine falsche Kennnummer matcht still auf den falschen Titel
und ist schlimmer als eine fehlende, die laut scheitert. Die CIK traegt der
Abdeckungstest nach.

## E10 Zod 3

`zod@^3.25`, klassische API. Kein technischer Grund gegen Zod 4, nur der
Wunsch nach einer Abhaengigkeit weniger, die sich unter uns bewegt, solange
das Datenmodell entsteht.

## E11 Der Abdeckungstest laeuft nicht in der Entwicklungsumgebung

Die Sandbox, in der Slice 0 entstanden ist, hat keinen Netzzugang zu
`sec.gov`. Der Test ist deshalb als Skript plus Actions-Workflow gebaut und
nicht als einmalige Handmessung: er ist reproduzierbar, versioniert und
laeuft dort, wo Egress erlaubt ist.
