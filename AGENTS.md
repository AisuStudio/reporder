# Reporder

Sprechen, fotografieren, fertig. Eine Begehung wird als durchgehende Tonaufnahme
mitgeschnitten; jedes Foto trägt den Zeitcode der Aufnahme, gesprochene Marker
(„Erster Stock, Zimmer 3") gliedern den Bericht. Läuft im Browser, ohne Konto, ohne
Server. Die Regeln unten stehen hier, weil es Grundsatzentscheidungen sind, die sich
später nicht mehr billig ändern lassen. Es sind keine Stilfragen.

## Sprache

- **Code, Bezeichner, Dateinamen und Kommentare: Englisch.**
- **Oberfläche: Deutsch.** Die erste Nutzerin ist eine Architektin in Berlin.
- **Antworten an Dom: Deutsch.**
- **Commit-Nachrichten: Englisch, ein Satz, der die Verhaltensänderung aus Nutzersicht
  beschreibt** — gern mit dem Grund im Nachsatz. Keine Präfixe (`feat:`, `fix:`), keine
  Aufzählung geänderter Dateien. So soll es klingen:

      A photo keeps its timecode when the recording is paused and resumed
      The report groups photos by the room that was spoken last, not by the clock
      Stopping the recording no longer loses the last three seconds of audio

## Die Aufnahme ist heilig

Nichts darf eine laufende Aufnahme unterbrechen. Wer den Aufnahmeschirm anfasst, prüft
jede Änderung gegen diese Liste.

- **Die Zeitachse ist die Aufnahmezeit, nie die Uhrzeit.** Jedes Foto, jeder Marker,
  jedes Textsegment trägt `t` in Millisekunden seit Aufnahmestart, Pausen abgezogen. Die
  Uhrzeit steht nur einmal, als `createdAt` der Sitzung. Zwei Aufnahmen mit gleicher
  Uhrzeit sind harmlos, ein Foto mit falschem `t` ist ein falscher Bericht.
- **Die Kamera läuft im Browser, nicht als Systemkamera.** Kein `<input capture>` — der
  öffnet auf iOS die Kamera-App und beendet dabei den Mikrofon-Stream. Fotos entstehen
  aus dem `getUserMedia`-Video über Canvas oder `ImageCapture`.
- **Während der Aufnahme keine Navigation, kein Reload, kein Dialog, der die Seite
  verlässt.** Der Aufnahmeschirm ist eine Seite; alles andere kommt danach.
- **Wake Lock, solange aufgenommen wird.** Bei `visibilitychange` wird der Zustand
  gesichert, nicht die Aufnahme beendet.
- **Zwischenstände landen sofort in IndexedDB, nicht erst beim Stopp.** Fotos, Marker
  und Segmente werden beim Entstehen geschrieben; Audio in Stücken (`timeslice`). Ein
  Absturz darf höchstens die letzten Sekunden Audio kosten, nie ein Foto.

## Die Sitzungsdatei gehört der Nutzerin

Was Reporder speichert, sind Beweisfotos und Protokolle. Sie müssen sich in fünf Jahren
noch öffnen lassen, auch ohne Reporder.

- Das Format ist **versioniert** (`format: "reporder-session"`, `version: 1`). Lesen und
  Migrieren sitzt an genau einer Stelle, `session.js`. Eine v1-Datei muss immer öffnen.
- Wer ein Feld hinzufügt, prüft zweierlei: was beim Öffnen einer älteren Datei passiert,
  und was beim Öffnen einer neuen Datei in einer älteren Fassung passiert.
- `session.test.js` deckt den Rundlauf ab. **Formatänderungen ohne Testerweiterung gibt
  es nicht.**
- **Fotos und Audio bleiben Originaldateien** (JPEG, WebM oder MP4). Kein eigenes
  Containerformat. Der Export ist ein Ordner: eine JSON-Datei plus Medien, lesbar mit
  jedem Dateimanager.
- Was die Nutzerin nachträglich zuordnet oder umbenennt, ist eine Änderung an den Daten,
  nicht am Ereignis: das Foto behält sein `t`, die Zuordnung ist ein eigenes Feld.

## Kein Server, kein Konto

- Alles läuft im Browser. **Kein Netzwerkaufruf außer dem Laden der App selbst.** Kein
  Tracking, kein fremder Host; Schriften liegen im Repository.
- iCloud oder Google Drive sind später der Speicherort der Nutzerin, nicht unser Backend.
  Das ändert nichts an den Regeln oben.
- **Transkription ist bewusst nicht live.** Aufnehmen, danach transkribieren. Die
  Live-Mitschrift über die Web Speech API ist ein Experiment und in der Oberfläche so
  beschriftet; der Bericht muss ohne sie funktionieren.

## Vorlagen statt Verdrahtung

Die Gliederung — Geschoss und Raum für den Bau, Bereich und Fläche im Galabau, Abschnitt
für alles andere — ist eine Vorlage in `templates.js`, nicht Code im Aufnahmeschirm. Eine
neue Branche ist eine neue Vorlage mit Testfällen für ihre Marker, keine neue Fläche.

## Gestaltung

Das Erscheinungsbild ist das MnS-System: Rubik, Koralle `#ff6948`, Schwarz auf Weiß,
Zeitcodes in Rubik Mono One. Die Token stehen in `styles.css`; neue Farben oder
Schriften brauchen eine Entscheidung von Dom. Struktur und Semantik folgen den Mustern
aus NORMANN (Sprungmarke, sichtbarer Fokus, `aria-pressed` an Umschaltern).

## Kein Build, keine Abhängigkeiten

HTML, CSS, JavaScript als ES-Module. Läuft aus `python3 -m http.server`, ausgeliefert als
statische Dateien über GitHub Pages. **Eine Laufzeit-Abhängigkeit braucht eine
Entscheidung von Dom.** Tests laufen mit dem eingebauten Runner von Node (`node --test`),
ohne weiteres Werkzeug.

## Vor jedem Commit

    npm test

Das ist in der CI blockierend und heute grün; jeder Fehler ist also neu.

## Was „erledigt" heißt

Ein Zweig ist eine Absicht, kein Zustand. Arbeit gilt erst als geliefert, wenn sie auf
`main` liegt und über GitHub Pages erreichbar ist. Nichts als „live" oder „gebaut"
beschreiben, was auf einem Zweig oder im Arbeitsverzeichnis liegt.

## Bevor etwas Neues gebaut wird

Version 1 ist: aufnehmen, fotografieren, Zeitstempel, Marker, Bericht, drucken. Sonst
nichts. Der Fahrplan steht in `README.md`.

- Tickets, Pläne, Team-Funktionen, Cloud-Anbindung, native Hülle, LiDAR: jedes davon
  braucht eine ausdrückliche Entscheidung von Dom — nicht die Feststellung, dass es
  technisch geht.
- Erst prüfen, ob eine bestehende Fläche das trägt, bevor eine neue entsteht.
- Neue Logik gehört in ein Modul mit einem Test daneben, nicht in den Aufnahmeschirm.

## Fehlerberichte: erst die Sitzung, dann alles andere

Bei einem gemeldeten Fehler zuerst den Export der betroffenen Sitzung anfordern.
Selbstgebaute Beispiele reproduzieren den Fehler in der Regel nicht — ein gesundes
Beispiel ist kein Gegenbeweis.

## Es kann eine zweite Sitzung laufen

Dom arbeitet zeitweise parallel. Vor größeren Eingriffen `git status` lesen und offene
Änderungen respektieren. Keine projektweiten Umbenennungen oder Formatierungsläufe ohne
Ansage.
