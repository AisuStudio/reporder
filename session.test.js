import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  FORMAT, VERSION, createSession, addPhoto, addMarker, addSegment, setPhotoSection, setPhotoNote, pushLevel, exportManifest,
  migrate, serialize, parse, photoFileName, audioFileName,
} from './session.js';

test('a new session is a valid, versioned file', () => {
  const s = createSession({ title: 'Kita Sansibar', now: new Date('2026-09-08T09:41:00Z') });
  assert.equal(s.format, FORMAT);
  assert.equal(s.version, VERSION);
  assert.equal(s.createdAt, '2026-09-08T09:41:00.000Z');
  assert.equal(s.template, 'site');
  assert.match(s.id, /^s-/);
});

test('a session survives the round trip through text unchanged', () => {
  const s = createSession({ title: 'Test' });
  addMarker(s, { t: 1000, title: 'Erdgeschoss' });
  addSegment(s, { t: 2000, text: 'Putz abgeplatzt' });
  const p = addPhoto(s, { t: 2500, width: 1600, height: 1200 });
  setPhotoSection(s, p.id, 's-1000-0');
  setPhotoNote(s, p.id, 'Riss 40 cm, Estrich, Fa. Müller');
  const back = parse(serialize(s));
  assert.deepEqual(back, s);
});

test('timecodes are validated and rounded, never the clock', () => {
  const s = createSession();
  assert.equal(addPhoto(s, { t: 1234.6 }).t, 1235);
  assert.throws(() => addPhoto(s, { t: -1 }), /invalid timecode/);
  assert.throws(() => addPhoto(s, { t: NaN }), /invalid timecode/);
  assert.equal(addMarker(s, { t: 5 }).title, '');
});

test('moving a photo changes only the section, not its t', () => {
  const s = createSession();
  const p = addPhoto(s, { t: 9000 });
  setPhotoSection(s, p.id, 'abc');
  assert.equal(p.sectionKey, 'abc');
  assert.equal(p.t, 9000);
  setPhotoSection(s, p.id, null);
  assert.equal('sectionKey' in p, false);
  assert.throws(() => setPhotoSection(s, 'nope', 'x'), /unknown photo/);
});

test('markers from before there were kinds open sections, as they always did', () => {
  const s = migrate({ format: FORMAT, version: 1, id: 's-1', createdAt: '2026-01-01T00:00:00Z', markers: [{ id: 'm', t: 5, title: 'Bad', level: 1 }] });
  assert.equal(s.markers[0].kind, 'section');
  assert.equal(s.levels, null);
});

test('levels are clamped samples that survive the round trip', () => {
  const s = createSession();
  pushLevel(s, 12.6); pushLevel(s, 140); pushLevel(s, -3);
  assert.deepEqual(s.levels, { stepMs: 250, values: [13, 100, 0] });
  assert.deepEqual(parse(serialize(s)).levels, s.levels);
  assert.throws(() => addMarker(s, { t: 1, kind: 'weird' }), /unknown marker kind/);
});

test('an older or sparse v1 file gets defaults on open', () => {
  const s = migrate({ format: FORMAT, version: 1, id: 's-1', createdAt: '2026-01-01T00:00:00Z' });
  assert.deepEqual(s.photos, []);
  assert.deepEqual(s.segments, []);
  assert.equal(s.notes, '');
  assert.equal(s.template, 'site');
});

test('foreign or newer files are refused instead of silently mangled', () => {
  assert.throws(() => migrate({ format: 'something-else', version: 1 }), /not a Reporder session/);
  assert.throws(() => migrate({ format: FORMAT, version: VERSION + 1 }), /newer/);
  assert.throws(() => migrate(null), /not a session/);
  assert.throws(() => parse('{"format":"reporder-session"}'), /version/);
});

test('exported media get plain file names by type', () => {
  assert.equal(photoFileName({ id: 'p-1', type: 'image/jpeg' }), 'photos/p-1.jpg');
  assert.equal(photoFileName({ id: 'p-2', type: 'image/png' }), 'photos/p-2.png');
  assert.equal(audioFileName({ audio: { type: 'audio/webm;codecs=opus' } }), 'audio.webm');
  assert.equal(audioFileName({ audio: { type: 'audio/mp4' } }), 'audio.m4a');
  assert.equal(audioFileName({ audio: null }), 'audio.webm');
});

test('a photo carries its entry, and an empty entry leaves no trace', () => {
  const s = createSession();
  const p = addPhoto(s, { t: 100 });
  setPhotoNote(s, p.id, '  Fuge gerissen  ');
  assert.equal(p.note, 'Fuge gerissen');
  setPhotoNote(s, p.id, '   ');
  assert.equal('note' in p, false);
  assert.throws(() => setPhotoNote(s, 'nope', 'x'), /unknown photo/);
});

test('the export manifest names its files and still opens as a session', () => {
  const s = createSession({ title: 'X' });
  s.audio = { type: 'audio/mp4', chunks: 3 };
  const p = addPhoto(s, { t: 100 });
  const m = exportManifest(s);
  assert.equal(m.photos[0].file, `photos/${p.id}.jpg`);
  assert.equal(m.audio.file, 'audio.m4a');
  assert.ok(m.exportedAt);
  assert.equal(s.photos[0].file, undefined, 'the live session is untouched');
  assert.equal(parse(serialize(m)).photos[0].file, m.photos[0].file);
});
