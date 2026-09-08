import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TEMPLATES, detectMarker, outline, sectionTitle, nameMarkersFromSegments } from './templates.js';

const site = TEMPLATES.site;

test('a floor said at the start of a sentence opens a floor section', () => {
  assert.deepEqual(detectMarker('Erster Stock', site), { level: 0, title: '1. Obergeschoss' });
  assert.deepEqual(detectMarker('zweites Obergeschoss, hier', site), { level: 0, title: '2. Obergeschoss' });
  assert.deepEqual(detectMarker('3. Etage', site), { level: 0, title: '3. Obergeschoss' });
  assert.deepEqual(detectMarker('Erdgeschoss', site), { level: 0, title: 'Erdgeschoss' });
  assert.deepEqual(detectMarker('so, Keller', site), { level: 0, title: 'Keller' });
});

test('a room opens a room section and keeps its number', () => {
  assert.deepEqual(detectMarker('Zimmer 3', site), { level: 1, title: 'Zimmer 3' });
  assert.deepEqual(detectMarker('Raum Nr. 12a', site), { level: 1, title: 'Raum 12A' });
  assert.deepEqual(detectMarker('jetzt das Bad', site), { level: 1, title: 'Bad' });
  assert.deepEqual(detectMarker('Treppenhaus', site), { level: 1, title: 'Treppenhaus' });
});

test('a room mentioned mid-sentence is a finding, not a marker', () => {
  assert.equal(detectMarker('hier im Bad ist die Silikonfuge komplett gerissen', site), null);
  assert.equal(detectMarker('die Tür zum Zimmer 3 schließt nicht richtig', site), null);
});

test('a few lead words before the marker are fine', () => {
  assert.deepEqual(detectMarker('weiter im ersten Stock', site), { level: 0, title: '1. Obergeschoss' });
  assert.deepEqual(detectMarker('okay, jetzt Zimmer 4', site), { level: 1, title: 'Zimmer 4' });
});

test('floor and room in one breath: the floor wins, the room is the next marker', () => {
  assert.deepEqual(detectMarker('Erster Stock Zimmer 2', site), { level: 0, title: '1. Obergeschoss' });
});

test('the landscape template has its own vocabulary', () => {
  const l = TEMPLATES.landscape;
  assert.deepEqual(detectMarker('Vorgarten', l), { level: 0, title: 'Vorgarten' });
  assert.deepEqual(detectMarker('Beet 2', l), { level: 1, title: 'Beet 2' });
  assert.equal(detectMarker('Zimmer 3', l), null);
});

test('the general template numbers or names sections', () => {
  const g = TEMPLATES.general;
  assert.deepEqual(detectMarker('Abschnitt 2', g), { level: 0, title: 'Abschnitt 2' });
  assert.deepEqual(detectMarker('Punkt Bühne', g), { level: 0, title: 'Punkt Bühne' });
  assert.deepEqual(detectMarker('neuer Abschnitt', g), { level: 0, title: 'Abschnitt' });
});

test('outline groups photos under the room spoken last, not the clock', () => {
  const segments = [
    { t: 1000, text: 'Erster Stock' },
    { t: 4000, text: 'Zimmer 3' },
    { t: 6000, text: 'hier ist der Putz abgeplatzt' },
    { t: 20000, text: 'Zimmer 4' },
    { t: 22000, text: 'Fenster undicht' },
  ];
  const photos = [{ id: 'p1', t: 7000 }, { id: 'p2', t: 23000 }, { id: 'p0', t: 200 }];
  const sections = outline({ segments, photos, template: site });
  const titles = sections.map(sectionTitle);
  assert.deepEqual(titles, ['Vorlauf', '1. Obergeschoss', '1. Obergeschoss · Zimmer 3', '1. Obergeschoss · Zimmer 4']);
  assert.deepEqual(sections[0].items.map((i) => i.id), ['p0']);
  assert.deepEqual(sections[2].items.filter((i) => i.kind === 'photo').map((i) => i.id), ['p1']);
  assert.deepEqual(sections[3].items.filter((i) => i.kind === 'photo').map((i) => i.id), ['p2']);
});

test('a new floor resets the room', () => {
  const segments = [
    { t: 1000, text: 'Erdgeschoss' },
    { t: 2000, text: 'Küche' },
    { t: 3000, text: 'Erster Stock' },
  ];
  const sections = outline({ segments, template: site });
  assert.deepEqual(sections.map(sectionTitle), ['Erdgeschoss', 'Erdgeschoss · Küche', '1. Obergeschoss']);
});

test('manual markers and spoken markers merge in time order', () => {
  const segments = [{ t: 5000, text: 'Zimmer 1' }];
  const markers = [{ t: 1000, title: 'Erdgeschoss', level: 0 }];
  const sections = outline({ segments, markers, template: site });
  assert.deepEqual(sections.map(sectionTitle), ['Erdgeschoss', 'Erdgeschoss · Zimmer 1']);
  assert.equal(sections[0].source, 'manual');
  assert.equal(sections[1].source, 'spoken');
});

test('a photo the user moved stays where it was put, and keeps its t', () => {
  const segments = [{ t: 1000, text: 'Zimmer 1' }, { t: 5000, text: 'Zimmer 2' }];
  const sections0 = outline({ segments, template: site });
  const key1 = sections0[0].key;
  const photos = [{ id: 'p', t: 6000, sectionKey: key1 }];
  const sections = outline({ segments, photos, template: site });
  assert.equal(sections[0].items.find((i) => i.kind === 'photo').id, 'p');
  assert.equal(sections[0].items.find((i) => i.kind === 'photo').t, 6000);
});

test('the lead-in section is hidden when nothing happened before the first marker', () => {
  const sections = outline({ segments: [{ t: 0, text: 'Erdgeschoss' }], template: site });
  assert.deepEqual(sections.map(sectionTitle), ['Erdgeschoss']);
});

test('a pressed marker takes its name from what is said right after the press', () => {
  const markers = [{ id: 'm1', t: 10000, title: '', level: 1 }, { id: 'm2', t: 50000, title: '', level: 0 }];
  const segments = [
    { t: 11500, text: 'Zimmer 3' },
    { t: 15000, text: 'Putz abgeplatzt' },
    { t: 52000, text: 'Erster Stock' },
  ];
  assert.equal(nameMarkersFromSegments(markers, segments, site), 2);
  assert.deepEqual(markers[0], { id: 'm1', t: 10000, title: 'Zimmer 3', level: 1 });
  assert.deepEqual(markers[1], { id: 'm2', t: 50000, title: '1. Obergeschoss', level: 0 });
});

test('a press followed by free speech keeps the first words as its name', () => {
  const markers = [{ id: 'm1', t: 10000, title: '', level: 1 }];
  const segments = [{ t: 12000, text: 'Hausanschluss hinten links, Wasser steht' }];
  nameMarkersFromSegments(markers, segments, site);
  assert.equal(markers[0].title, 'Hausanschluss hinten links, Wasser');
});

test('a press with nothing said within the window stays unnamed and still shows', () => {
  const markers = [{ id: 'm1', t: 10000, title: '', level: 1 }];
  const segments = [{ t: 30000, text: 'Zimmer 3' }];
  assert.equal(nameMarkersFromSegments(markers, segments, site), 0);
  const sections = outline({ segments, markers, template: site });
  assert.deepEqual(sections.map(sectionTitle), ['Raum · ohne Namen', 'Zimmer 3']);
  assert.equal(sections[0].unnamed, true);
  assert.equal(sections[0].markerId, 'm1');
});

test('what is said right after a press does not open a second section', () => {
  const markers = [{ id: 'm1', t: 10000, title: 'Zimmer 3', level: 1 }];
  const segments = [{ t: 11500, text: 'Zimmer 3' }, { t: 14000, text: 'Riss in der Decke' }];
  const sections = outline({ segments, markers, template: site });
  assert.deepEqual(sections.map(sectionTitle), ['Zimmer 3']);
  assert.equal(sections[0].items.length, 2);
});

test('an "Anderes" marker is an event in the current section, never a section of its own', () => {
  const markers = [
    { id: 'm1', t: 1000, title: 'Erdgeschoss', level: 0, kind: 'section' },
    { id: 'n1', t: 5000, title: '', level: 0, kind: 'note' },
  ];
  const segments = [{ t: 6000, text: 'Bauleiter sagt, die Tür kommt erst nächste Woche' }];
  nameMarkersFromSegments(markers, segments, site);
  assert.equal(markers[1].title, 'Bauleiter sagt, die Tür kommt erst nächste Woche');
  const sections = outline({ segments, markers, template: site });
  assert.deepEqual(sections.map(sectionTitle), ['Erdgeschoss']);
  const note = sections[0].items.find((i) => i.kind === 'note');
  assert.equal(note.id, 'n1');
  assert.equal(note.t, 5000);
});

test('a room said after an "Anderes" press names the event, it does not become a room', () => {
  const markers = [{ id: 'n1', t: 5000, title: '', level: 0, kind: 'note' }];
  const segments = [{ t: 6000, text: 'Zimmer 3' }];
  nameMarkersFromSegments(markers, segments, site);
  assert.equal(markers[0].title, 'Zimmer 3');
  const sections = outline({ segments, markers, template: site });
  assert.deepEqual(sections.map(sectionTitle), ['Vorlauf']);
});
