// The report: the session's outline in recording order, every photo next to
// what was said. Edits here change data (text, assignment, title, notes),
// never the events — a photo keeps its `t` wherever the user moves it.

import { getTemplate, outline, sectionTitle, detectMarker, nameMarkersFromSegments } from './templates.js';
import { addMarker, setPhotoSection, setPhotoNote, serialize, audioFileName } from './session.js';
import { getSession, putSession, getMedia, getAudioBlob } from './storage.js';
import { formatTimecode, formatDate, fileStamp } from './time.js';

const $ = (sel) => document.querySelector(sel);
const params = new URLSearchParams(location.search);
const session = await getSession(params.get('id'));
if (!session) { location.replace('index.html'); throw new Error('no session'); }
const template = getTemplate(session.template);

const photoUrls = new Map();
async function photoUrl(id) {
  if (!photoUrls.has(id)) {
    const blob = await getMedia(session.id, id);
    photoUrls.set(id, blob ? URL.createObjectURL(blob) : '');
  }
  return photoUrls.get(id);
}

let saveTimer;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => putSession(session), 200);
}

// --- header ---------------------------------------------------------------------
$('#title').value = session.title;
$('#title').addEventListener('input', () => { session.title = $('#title').value.trim(); document.title = `Reporder — ${session.title || 'Bericht'}`; save(); });
document.title = `Reporder — ${session.title || 'Bericht'}`;
$('#fact-date').textContent = formatDate(session.createdAt);
$('#fact-duration').textContent = formatTimecode(session.durationMs);
$('#fact-photos').textContent = String(session.photos.length);
$('#fact-template').textContent = template.name;
$('#meta-stand').innerHTML = `Sitzung <strong>${session.id}</strong><br>Format v${session.version}`;
$('#notes').value = session.notes || '';
$('#notes').addEventListener('input', () => { session.notes = $('#notes').value; save(); });

// --- audio ---------------------------------------------------------------------------
const audio = $('#audio');
const audioBlob = await getAudioBlob(session);
if (audioBlob) {
  const url = URL.createObjectURL(audioBlob);
  audio.src = url;
  const a = $('#btn-audio');
  a.href = url; a.download = `${fileStamp(session.createdAt)}_${audioFileName(session)}`;
} else {
  $('#audio-note').textContent = 'Keine Tonaufnahme vorhanden.';
  $('#audio-note').hidden = false;
  audio.hidden = true;
  $('#btn-audio').setAttribute('aria-disabled', 'true');
  $('#btn-audio').removeAttribute('href');
}
let stopAt = null;
function seek(t, forMs = null) {
  if (!audioBlob) return;
  audio.currentTime = t / 1000;
  stopAt = forMs ? (t + forMs) / 1000 : null;
  audio.play().catch(() => {});
}
audio.addEventListener('timeupdate', () => { if (stopAt != null && audio.currentTime >= stopAt) { audio.pause(); stopAt = null; } });

// Presses that never got a name from the live transcript: try again with
// whatever text exists now (edits, later transcription).
if (nameMarkersFromSegments(session.markers, session.segments, template) > 0) save();

// --- actions ----------------------------------------------------------------------------
$('#btn-print').addEventListener('click', () => window.print());
$('#btn-json').addEventListener('click', () => {
  const blob = new Blob([serialize(session)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${fileStamp(session.createdAt)}_reporder-session.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
});

// --- sections ---------------------------------------------------------------------------------
function contextFor(photoT, items) {
  // The sentence spoken around the photo: nearest text within 20 s, preferring what came before.
  const texts = items.filter((i) => i.kind === 'text');
  let best = null;
  for (const it of texts) {
    const d = photoT - it.t;
    const score = d >= 0 ? d : -d * 2;
    if (Math.abs(d) <= 20000 && (best == null || score < best.score)) best = { it, score };
  }
  return best ? best.it.text : '';
}

function autosize(el) {
  el.style.height = 'auto';
  el.style.height = `${el.scrollHeight}px`;
}

function newSectionPrompt(t) {
  const title = prompt(`Neuer Abschnitt ab ${formatTimecode(t)} — Bezeichnung:`);
  if (!title || !title.trim()) return;
  let level = 0;
  if (template.levels.length > 1) {
    const hit = detectMarker(title.trim(), template);
    level = hit ? hit.level : template.levels.length - 1;
  }
  addMarker(session, { t, title: title.trim(), level });
  save();
  render();
}

async function render() {
  const sections = outline({ segments: session.segments, markers: session.markers, photos: session.photos, template });
  const root = $('#sections');
  root.innerHTML = '';
  $('#empty-note').hidden = sections.some((s) => s.path.length > 0);

  for (const sec of sections) {
    const el = document.createElement('section');
    el.className = 'section';
    const head = document.createElement('div');
    head.className = 'section-head';
    const h2 = document.createElement('h2');
    if (sec.path.length > 1) {
      const parent = document.createElement('span'); parent.className = 'parent';
      parent.textContent = sec.path.slice(0, -1).join(' · ') + ' · ';
      h2.append(parent);
    }
    const marker = sec.markerId ? session.markers.find((m) => m.id === sec.markerId) : null;
    if (marker) {
      // A pressed marker: its name is editable right here.
      const input = document.createElement('input');
      input.type = 'text'; input.className = 'rename' + (sec.unnamed ? ' unnamed' : '');
      input.value = marker.title; input.placeholder = `${template.levels[sec.level]} benennen`;
      input.setAttribute('aria-label', 'Abschnitt benennen'); input.maxLength = 80;
      input.addEventListener('change', () => {
        const title = input.value.trim();
        marker.title = title;
        const hit = title ? detectMarker(title, template) : null;
        if (hit) marker.level = hit.level;
        save(); render();
      });
      h2.append(input);
    } else {
      h2.append(document.createTextNode(sec.path.length ? sec.path.at(-1) : 'Vorlauf'));
    }
    head.append(h2);
    if (sec.t > 0 || sec.path.length) {
      const tc = document.createElement('span'); tc.className = 'tc'; tc.textContent = formatTimecode(sec.t); head.append(tc);
    }
    if (sec.source === 'spoken') { const tag = document.createElement('span'); tag.className = 'tag'; tag.textContent = 'gesprochen'; head.append(tag); }
    if (marker && audioBlob) {
      const play = document.createElement('button'); play.type = 'button'; play.className = 'link';
      play.textContent = 'Was wurde gesagt? 6 s abspielen';
      play.addEventListener('click', () => seek(sec.t, 6000));
      head.append(play);
    }
    if (marker) {
      const del = document.createElement('button'); del.type = 'button'; del.className = 'link'; del.textContent = 'Marker entfernen';
      del.addEventListener('click', () => {
        session.markers = session.markers.filter((m) => m.id !== marker.id);
        save(); render();
      });
      head.append(del);
    }
    el.append(head);

    const items = document.createElement('div');
    items.className = 'items';
    for (const it of sec.items) {
      const row = document.createElement('div');
      row.className = 'item';
      const tc = document.createElement('button'); tc.type = 'button'; tc.className = 'tc link'; tc.textContent = formatTimecode(it.t);
      tc.title = 'Im Ton anspringen'; tc.addEventListener('click', () => seek(it.t));
      row.append(tc);

      if (it.kind === 'text') {
        const seg = session.segments.find((s) => s.id === it.id);
        const box = document.createElement('div'); box.className = 'item-text';
        const p = document.createElement('p');
        p.contentEditable = 'plaintext-only'; p.textContent = it.text;
        if (detectMarker(it.text, template)) p.classList.add('is-marker');
        p.addEventListener('blur', () => {
          const text = p.textContent.trim();
          if (seg && text !== seg.text) { seg.text = text; save(); render(); }
        });
        box.append(p);
        const tools = document.createElement('div'); tools.className = 'item-tools';
        const b = document.createElement('button'); b.type = 'button'; b.className = 'link'; b.textContent = 'Ab hier neuer Abschnitt';
        b.addEventListener('click', () => newSectionPrompt(it.t));
        tools.append(b);
        box.append(tools);
        row.append(box);
      } else {
        const photo = session.photos.find((p) => p.id === it.id);
        const box = document.createElement('div'); box.className = 'item-photo';
        const fig = document.createElement('figure');
        const img = document.createElement('img');
        img.alt = `Foto bei ${formatTimecode(it.t)}`; img.loading = 'lazy';
        img.width = photo?.width || 1600; img.height = photo?.height || 1200;
        photoUrl(it.id).then((u) => { img.src = u; });
        img.addEventListener('click', () => seek(it.t));
        const cap = document.createElement('figcaption');
        const n = document.createElement('span'); n.textContent = `Foto ${session.photos.indexOf(photo) + 1}`;
        cap.append(n);
        const ctx = contextFor(it.t, sec.items);
        if (ctx) { const c = document.createElement('span'); c.className = 'context'; c.textContent = `„${ctx}"`; cap.append(c); }
        fig.append(img, cap);
        box.append(fig);

        // The entry under the photo: what the reader of the report needs to know.
        const note = document.createElement('textarea');
        note.className = 'photo-note'; note.rows = 2;
        note.placeholder = 'Eintrag zum Foto: Befund, Maß, Zuständigkeit …';
        note.setAttribute('aria-label', 'Eintrag zum Foto');
        note.value = photo?.note || '';
        note.addEventListener('input', () => { setPhotoNote(session, it.id, note.value); save(); autosize(note); });
        box.append(note);
        requestAnimationFrame(() => autosize(note));

        const tools = document.createElement('div'); tools.className = 'item-tools';
        const sel = document.createElement('select');
        sel.setAttribute('aria-label', 'Foto einem Abschnitt zuordnen');
        const auto = document.createElement('option'); auto.value = ''; auto.textContent = 'Zuordnung: nach Zeitachse'; sel.append(auto);
        for (const s of sections) {
          const o = document.createElement('option'); o.value = s.key; o.textContent = `→ ${sectionTitle(s)}`;
          sel.append(o);
        }
        sel.value = photo?.sectionKey && sections.some((s) => s.key === photo.sectionKey) ? photo.sectionKey : '';
        sel.addEventListener('change', () => { setPhotoSection(session, it.id, sel.value || null); save(); render(); });
        const b = document.createElement('button'); b.type = 'button'; b.className = 'link'; b.textContent = 'Ab hier neuer Abschnitt';
        b.addEventListener('click', () => newSectionPrompt(it.t));
        tools.append(sel, b);
        box.append(tools);
        row.append(box);
      }
      items.append(row);
    }
    el.append(items);
    root.append(el);
  }
}
render();
