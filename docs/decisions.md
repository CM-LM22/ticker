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

## E5 GitHub Actions als Scheduler, 15-Minuten-Takt

**Korrigiert am 21.08.2026.** Die urspruengliche Rechnung ging von einem
privaten Repository mit 2.000 Freiminuten aus und kam deshalb auf einen
30-Minuten-Takt. `CM-LM22/ticker` ist aber oeffentlich, und fuer
oeffentliche Repositories sind Actions-Minuten auf den
Standard-Runnern unbegrenzt frei. Die Minutenrechnung ist damit
gegenstandslos.

Entschieden: Das Repository bleibt oeffentlich, der Poller laeuft im
15-Minuten-Takt. Bewusst in Kauf genommen wird, dass die Watchlist
oeffentlich lesbar ist. Sobald sie persoenliche Zuege bekommt, ist das
neu abzuwaegen; die Umstellung auf privat dauert zehn Sekunden, holt
aber nichts zurueck, was bis dahin geklont wurde.

Vercel Hobby scheidet weiterhin aus: nur ein Cronlauf pro Tag.

Zwei Vorbehalte, die zum Betrieb gehoeren:
- Geplante Workflows starten unter Last regelmaessig 5 bis 15 Minuten
  verspaetet. Die Zusage lautet also "innerhalb einer halben bis dreiviertel
  Stunde", nicht "in Echtzeit".
- GitHub deaktiviert Cron-Workflows nach 60 Tagen ohne Repository-Aktivitaet.

In CI laeuft trotzdem nur Typpruefung und Test, kein `next build`. Nicht
mehr aus Minutengruenden, sondern weil auf Vercel ohnehin gebaut wird und
ein zweiter Build nichts pruefen wuerde, was der erste nicht prueft.

Was bei einem oeffentlichen Repository zusaetzlich gilt: Secrets bleiben
verborgen, werden in Logs geschwaerzt und stehen Pull Requests aus
fremden Forks nicht zur Verfuegung. `workflow_dispatch` laesst sich nur
mit Schreibrechten ausloesen. Der Abdeckungstest ist also nicht von
aussen anstossbar.

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

## E12 Aus der Alert-App wird ein Research-Dashboard

Gewuenscht sind Kurse, 52-Wochen-Verlauf, Termine, Zusammenfassungen der
letzten Berichte und daraus abgeleitet eine Einschaetzung, welche Titel
interessant sind. Das ist eine Erweiterung des Produkts, nicht nur ein
weiterer Slice: die Alerts bleiben, aber der Schwerpunkt verschiebt sich
von "melde mir Ereignisse" zu "zeig mir den Stand".

Folge fuer die Reihenfolge: Kurse und Kennzahlen sind wertvoller, wenn
man sie sieht, als wenn sie im Hintergrund alarmieren. Deshalb kommt die
Ansicht vor der Zustellung.

## E13 Kurse ueber Stooq

Tages-CSV, kein Schluessel, keine Anmeldung, amerikanische und deutsche
Titel. Damit sind auch die 16 DAX-Titel ohne SEC-Registrierung mit
Kursen abgedeckt, wenn auch ohne Bilanzzahlen.

Verworfen: Alpha Vantage im Gratis-Tarif mit 25 Abrufen pro Tag, das
reicht bei 40 Titeln nicht fuer einen einzigen vollstaendigen Lauf. Die
inoffizielle Yahoo-Schnittstelle waere ergiebiger, ist aber
undokumentiert und kann jederzeit verschwinden; als Ausweichquelle
vorgemerkt, nicht als Fundament.

Die Faehigkeitsbeschreibung von Stooq steht auf `vendor_claim`, bis
`npm run coverage:data` gemessen hat, wie viele der 40 Titel wirklich
geliefert werden. Erst dann `measured`.

## E14 Bilanzzahlen ueber die XBRL-Schnittstelle der SEC

Wer bei der SEC einreicht, liefert seine Zahlen maschinenlesbar mit.
`companyfacts` gibt Umsatz, Nettoergebnis und Ergebnis je Aktie ohne
Schluessel und ohne Kontingent heraus. Das ist die kostenlose Antwort auf
"Zusammenfassung der letzten Berichte" und gilt fuer alle 24 Titel mit
SEC-Registrierung.

Zwei Grenzen, die bleiben: Es gilt, was das Unternehmen selbst getaggt
hat, und Konzepte heissen je nach Taxonomie anders. Deshalb die
Prioritaetslisten in `src/providers/sec-xbrl.ts`. Kumulierte Halbjahres-
und Neunmonatswerte werden an ihrer Dauer erkannt und aussortiert; ohne
das vergleicht man Neunmonats- mit Quartalsumsatz.

## E15 Zahlentermine werden geschaetzt, nicht gekauft

Ein verlaesslicher Earnings-Kalender ist kostenlos schwer zu bekommen.
Der Einreichungsverlauf bei EDGAR ist es nicht. Unternehmen berichten
Jahr fuer Jahr zu erstaunlich aehnlichen Kalenderterminen, deshalb
schaetzt `estimateNextEarnings` den naechsten Termin aus dem Vorjahres-
termin plus einem Jahr.

Entscheidend ist die Selbstpruefung: dieselbe Regel wird rueckwirkend auf
die bekannten Termine angewendet und der Fehler gemessen. Angezeigt wird
nicht nur ein Datum, sondern ein Korridor und die gemessene
Treffsicherheit. Eine ausgewiesene Schaetzung ist ehrlicher als ein
Termin, der so tut, als sei er bestaetigt.

Damit wird Slice 3 kleiner: ein bezahlter Kalender muss nur noch besser
sein als diese Schaetzung, nicht besser als nichts.

## E16 Die Punktzahl ist eine Rangfolge, keine Empfehlung

`screen()` verdichtet sechs gewichtete Signale zu einer Zahl von 0 bis
100. Drei Regeln machen den Unterschied zwischen einer nachvollziehbaren
Rangfolge und einem Orakel:

- Jedes Signal zeigt Rohwert, Gewicht, Normierung und Begruendung an.
  Wer die Zahl nicht nachrechnen kann, soll ihr nicht glauben muessen.
- Fehlende Daten zaehlen nicht als null. Ein Titel ohne Bilanzzahlen ist
  kein schlechter Titel, sondern ein unbekannter. Stattdessen wird
  `coverage` ausgewiesen und ueberall mit angezeigt.
- Zwei Kennzahlen bekommen bewusst kein Gewicht: die Position im
  52-Wochen-Band und der Abstand zum Hoch. Beide sind zweideutig. Nah am
  Tief ist ein Schnaeppchen oder ein Warnzeichen, und welches von beidem,
  entscheidet keine Formel.

Die Auswahl der Kriterien ist eine Setzung, keine Erkenntnis. Der
Disclaimer bleibt.

## E17 Demodaten sind erkennbar erfunden

Solange keine Datenbank angebunden ist, speist sich die Oberflaeche aus
`src/demo/`. Die Reihen entstehen aus einem festen Zufallsgenerator, sind
also reproduzierbar, und jede Seite sagt oben an, dass sie erfunden sind.

Bewusst nachgebildet wird auch die Luecke: Titel ohne SEC-Registrierung
bekommen in der Demo Kurse, aber keine Bilanzzahlen und keinen
Termin. Eine Demo, die vollstaendiger aussieht als die Wirklichkeit,
waere die schlechtere Demo.
