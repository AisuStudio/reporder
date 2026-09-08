// The recording screen. Read AGENTS.md ("Die Aufnahme ist heilig") before
// touching this file: the timeline is recording time, the camera stays in the
// browser, nothing here navigates away while the recorder runs, and every
// photo, marker and chunk is written to IndexedDB the moment it exists.

import { getTemplate, detectMarker, nameMarkersFromSegments } from './templates.js';
import { addPhoto, addMarker, addSegment } from './session.js';
import { getSession, putSession, putMedia, persist } from './storage.js';
import { formatTimecode } from './time.js';

const $ = (sel) => document.querySelector(sel);
const params = new URLSearchParams(location.search);
const sessionId = params.get('id');

let session = await getSession(sessionId);
if (!session) { location.replace('index.html'); throw new Error('no session'); }
const template = getTemplate(session.template);
persist();

$('#rec-title').textContent = session.title || template.name;
$('#marker-hint').textContent = template.hint;

// --- recording clock -------------------------------------------------------------
// elapsed() is the only source of `t`. Pauses are excluded; wall-clock never used.
const clock = { running: false, accumulated: 0, startedAt: 0 };
const elapsed = () => clock.accumulated + (clock.running ? performance.now() - clock.startedAt : 0);
setInterval(() => { $('#clock').textContent = formatTimecode(elapsed()); }, 250);

// --- state -------------------------------------------------------------------------
let recorder = null;
let micStream = null;
let camStream = null;
let chunkIndex = 0;
let wakeLock = null;
let phase = 'idle'; // idle | recording | paused | stopping
const pending = []; // in-flight writes, awaited before leaving the page

const status = (text, warn = false) => {
  $('#status').innerHTML = '';
  const s = document.createElement('span');
  if (warn) s.className = 'warn';
  s.textContent = text;
  $('#status').append(s);
};

let toastTimer;
function toast(text, t) {
  const el = $('#toast');
  el.innerHTML = '';
  if (Number.isFinite(t)) { const tc = document.createElement('span'); tc.className = 'tc'; tc.textContent = formatTimecode(t); el.append(tc); }
  el.append(document.createTextNode(text));
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 2600);
}

async function save() {
  const p = putSession(session);
  pending.push(p);
  await p;
}

// --- media setup ------------------------------------------------------------------------
function pickMimeType() {
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus', 'audio/aac'];
  return candidates.find((m) => MediaRecorder.isTypeSupported?.(m)) || '';
}

// Microphone and camera come from ONE getUserMedia call. iOS Safari keeps only
// one capture stream alive per page: asking for the camera first and the
// microphone later ends with a silent, prompt-less failure for the second one.
// One call, one permission prompt, then the tracks are split.
async function setupMedia() {
  const video = $('#video');
  const constraints = {
    audio: { echoCancellation: false, noiseSuppression: true, autoGainControl: true },
    video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1440 } },
  };
  let stream = null;
  try {
    stream = await navigator.mediaDevices.getUserMedia(constraints);
  } catch (err) {
    // No camera, or camera refused: the recording still has to work.
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: constraints.audio });
    } catch (err2) {
      status(`Kein Mikrofon frei (${err2.name}). Ohne Mikrofon keine Aufnahme. Bitte in den Einstellungen für diese Seite erlauben.`, true);
      return false;
    }
    const note = $('#camera-note');
    note.textContent = `Keine Kamera frei (${err.name}). Die Tonaufnahme geht trotzdem; Fotos sind dann nicht möglich.`;
    note.hidden = false;
  }
  const audioTracks = stream.getAudioTracks();
  const videoTracks = stream.getVideoTracks();
  if (audioTracks.length) {
    micStream = new MediaStream(audioTracks);
    watchMic(audioTracks[0]);
  }
  if (videoTracks.length) {
    camStream = new MediaStream(videoTracks);
    video.srcObject = camStream;
    await video.play().catch(() => {});
    $('#btn-shutter').disabled = false;
  }
  return !!micStream;
}

// The recording is sacred: if anything takes the microphone (iOS does this
// when speech recognition starts), the transcript loses, not the recording.
function watchMic(track) {
  track.addEventListener('mute', () => {
    if (live) { stopLive(); $('#live-toggle').checked = false; showLiveState(); }
    status('Das Mikrofon wurde unterbrochen. Mitschrift aus; die Aufnahme läuft weiter, sobald es zurück ist.', true);
  });
  track.addEventListener('ended', () => status('Das Mikrofon ist weg. Bitte „Beenden" drücken und neu starten.', true));
}

async function requestWakeLock() {
  try {
    wakeLock = await navigator.wakeLock?.request('screen');
    wakeLock?.addEventListener('release', () => { wakeLock = null; });
  } catch { /* not available: the user keeps the screen awake by hand */ }
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && phase === 'recording' && !wakeLock) requestWakeLock();
});

// --- recorder ----------------------------------------------------------------------------------
const CHUNK_MS = 5000;

function startRecorder() {
  const mimeType = pickMimeType();
  recorder = new MediaRecorder(micStream, mimeType ? { mimeType, audioBitsPerSecond: 64000 } : undefined);
  session.audio = { type: recorder.mimeType || mimeType || 'audio/webm', chunks: 0 };
  recorder.ondataavailable = (e) => {
    if (!e.data || e.data.size === 0) return;
    const i = chunkIndex++;
    const p = putMedia(session.id, `audio-${String(i).padStart(5, '0')}`, e.data, { kind: 'audio', index: i })
      .then(() => { session.audio.chunks = Math.max(session.audio.chunks, i + 1); return save(); });
    pending.push(p);
  };
  recorder.onerror = (e) => status(`Aufnahmefehler: ${e.error?.message || e.error || 'unbekannt'}`, true);
  recorder.start(CHUNK_MS);
}

async function start() {
  const btn = $('#btn-main');
  btn.disabled = true;
  if (!micStream || micStream.getAudioTracks().every((t) => t.readyState === 'ended')) {
    if (!(await setupMedia())) { btn.disabled = false; return; }
  }
  clock.running = true; clock.startedAt = performance.now();
  startRecorder();
  phase = 'recording';
  document.body.classList.add('recording');
  $('#rec-dot').hidden = false;
  btn.textContent = 'Beenden';
  btn.disabled = false;
  $('#btn-pause').disabled = false;
  requestWakeLock();
  status('Läuft. Bildschirm bleibt an, Fotos und Marker werden sofort gesichert.');
  if ($('#live-toggle').checked) startLive();
}

function pause() {
  if (phase !== 'recording') return;
  recorder.pause();
  clock.accumulated = elapsed(); clock.running = false;
  phase = 'paused';
  document.body.classList.replace('recording', 'paused');
  $('#btn-pause').textContent = 'Weiter';
  stopLive();
  status('Pause. Die Zeitachse steht, Fotos bleiben möglich.');
}

function resume() {
  if (phase !== 'paused') return;
  recorder.resume();
  clock.running = true; clock.startedAt = performance.now();
  phase = 'recording';
  document.body.classList.replace('paused', 'recording');
  $('#btn-pause').textContent = 'Pause';
  if ($('#live-toggle').checked) startLive();
  status('Läuft.');
}

async function stop() {
  if (phase !== 'recording' && phase !== 'paused') return;
  phase = 'stopping';
  $('#btn-main').disabled = true; $('#btn-pause').disabled = true; $('#btn-shutter').disabled = true;
  status('Wird gesichert …');
  stopLive();
  clock.accumulated = elapsed(); clock.running = false;
  session.durationMs = Math.round(clock.accumulated);

  await new Promise((resolve) => {
    recorder.onstop = resolve;
    recorder.stop();
  });
  micStream?.getTracks().forEach((t) => t.stop());
  camStream?.getTracks().forEach((t) => t.stop());
  wakeLock?.release?.();

  await Promise.allSettled(pending);
  await save();
  window.removeEventListener('beforeunload', guard);
  location.href = `report.html?id=${encodeURIComponent(session.id)}`;
}

$('#btn-main').addEventListener('click', () => {
  if (phase === 'idle') start();
  else if (phase === 'recording' || phase === 'paused') {
    if (confirm('Aufnahme beenden und zum Bericht wechseln?')) stop();
  }
});
$('#btn-pause').addEventListener('click', () => (phase === 'paused' ? resume() : pause()));

// Leaving mid-recording is the one thing this page must not let happen quietly.
const guard = (e) => { if (phase === 'recording' || phase === 'paused') { e.preventDefault(); e.returnValue = ''; } };
window.addEventListener('beforeunload', guard);
$('#back-link').addEventListener('click', (e) => {
  if (phase === 'recording' || phase === 'paused') {
    e.preventDefault();
    alert('Erst die Aufnahme beenden. Der Bericht kommt danach.');
  }
});

// --- photos -----------------------------------------------------------------------------------------
const MAX_EDGE = 1600;

async function grabFrame() {
  const video = $('#video');
  const track = camStream?.getVideoTracks()[0];
  // ImageCapture gives the full sensor frame where it exists (Chrome/Android);
  // the canvas path works everywhere else, including Safari.
  if (track && 'ImageCapture' in window) {
    try {
      const ic = new ImageCapture(track);
      const blob = await Promise.race([ic.takePhoto(), new Promise((_, rej) => setTimeout(rej, 1500))]);
      const bmp = await createImageBitmap(blob);
      return drawScaled(bmp, bmp.width, bmp.height);
    } catch { /* fall through */ }
  }
  return drawScaled(video, video.videoWidth, video.videoHeight);
}

function drawScaled(source, w, h) {
  const scale = Math.min(1, MAX_EDGE / Math.max(w, h));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w * scale); canvas.height = Math.round(h * scale);
  canvas.getContext('2d').drawImage(source, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve) => canvas.toBlob((b) => resolve({ blob: b, width: canvas.width, height: canvas.height }), 'image/jpeg', 0.86));
}

$('#btn-shutter').addEventListener('click', async () => {
  const t = elapsed(); // taken first, before any async work
  const video = $('#video');
  if (!video.videoWidth) return;
  const flash = $('#flash'); flash.classList.remove('on'); void flash.offsetWidth; flash.classList.add('on');
  const { blob, width, height } = await grabFrame();
  if (!blob) return;
  const photo = addPhoto(session, { t, width, height });
  const p = putMedia(session.id, photo.id, blob, { kind: 'photo' }).then(save);
  pending.push(p);
  addThumb(blob, photo);
  toast(`Foto ${session.photos.length}`, t);
  if (phase === 'idle') status('Foto vor Aufnahmestart: Zeitcode 00:00. Besser erst „Starten".', true);
});

function addThumb(blob, photo) {
  const li = document.createElement('li');
  const img = document.createElement('img');
  img.src = URL.createObjectURL(blob); img.alt = `Foto bei ${formatTimecode(photo.t)}`;
  const tc = document.createElement('span'); tc.className = 'tc'; tc.textContent = formatTimecode(photo.t);
  li.append(img, tc);
  const strip = $('#strip');
  strip.append(li);
  strip.scrollLeft = strip.scrollWidth;
}

// --- markers ----------------------------------------------------------------------------------------
// One press per level. The press only stamps the time; the name comes from
// what is said next (via the transcript) or is typed in the report later.
const buttons = $('#marker-buttons');
template.levels.forEach((name, level) => {
  const b = document.createElement('button');
  b.type = 'button';
  b.innerHTML = `${name}<small>drücken, dann sagen</small>`;
  b.addEventListener('click', () => pressMarker(level));
  buttons.append(b);
});

async function pressMarker(level) {
  const t = elapsed();
  addMarker(session, { t, title: '', level });
  pending.push(save());
  toast(`${template.levels[level]} — jetzt den Namen sagen`, t);
}

/** After a final transcript segment: name any press it belongs to. */
function nameRecentPresses() {
  if (nameMarkersFromSegments(session.markers, session.segments, template) > 0) {
    const last = [...session.markers].reverse().find((m) => m.title);
    if (last) toast(`${template.levels[last.level]}: ${last.title}`, last.t);
    pending.push(save());
  }
}

// --- live transcript (experiment) -------------------------------------------------------------------
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
let live = null;
let liveWanted = false;
let phraseStart = null;

// On by default where it works well (Chrome, Android). iOS Safari can take the
// microphone away from the recorder when recognition starts, so there it stays
// off until the user turns it on — and the recorder is watched, see below.
const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
if (!SR) {
  $('#live-toggle').disabled = true;
  $('#live-hint').textContent = 'In diesem Browser gibt es keine Spracherkennung. Marker werden beim Transkribieren nach der Aufnahme benannt.';
} else {
  const stored = localStorage.getItem('reporder:live');
  $('#live-toggle').checked = stored == null ? !isIOS : stored === '1';
  if (isIOS && stored == null) $('#live-hint').textContent += ' Auf dem iPhone kann die Erkennung der Tonaufnahme das Mikrofon wegnehmen; darum hier standardmäßig aus.';
}
function showLiveState() {
  const on = $('#live-toggle').checked && !!SR;
  const tag = $('#live-state');
  tag.textContent = on ? 'an' : 'aus';
  tag.classList.toggle('on', on);
}
showLiveState();

function startLive() {
  if (!SR || live || phase !== 'recording') return;
  liveWanted = true;
  live = new SR();
  live.lang = 'de-DE'; live.continuous = true; live.interimResults = true;
  live.onresult = (e) => {
    let interim = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i];
      if (phraseStart == null) phraseStart = elapsed();
      if (r.isFinal) {
        const text = r[0].transcript.trim();
        const t = phraseStart; phraseStart = null;
        if (text) {
          addSegment(session, { t, text, source: 'live' });
          pending.push(save());
          const before = session.markers.filter((m) => m.title).length;
          nameRecentPresses();
          const hit = detectMarker(text, template);
          if (hit && session.markers.filter((m) => m.title).length === before) toast(`${template.levels[hit.level]}: ${hit.title}`, t);
        }
      } else {
        interim += r[0].transcript;
      }
    }
    const last = session.segments.at(-1)?.text || '';
    $('#live-text').innerHTML = '';
    $('#live-text').append(document.createTextNode(last + ' '));
    const span = document.createElement('span'); span.className = 'interim'; span.textContent = interim;
    $('#live-text').append(span);
  };
  live.onerror = (e) => { if (e.error === 'not-allowed') { liveWanted = false; $('#live-toggle').checked = false; } };
  live.onend = () => { live = null; phraseStart = null; if (liveWanted && phase === 'recording') setTimeout(startLive, 300); };
  try { live.start(); } catch { live = null; }
}
function stopLive() {
  liveWanted = false;
  if (live) { try { live.stop(); } catch { /* already stopped */ } live = null; }
}
$('#live-toggle').addEventListener('change', (e) => {
  localStorage.setItem('reporder:live', e.target.checked ? '1' : '0');
  showLiveState();
  if (e.target.checked) startLive(); else stopLive();
});

// --- boot -------------------------------------------------------------------------------------------
if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
  status('Dieser Browser kann nicht aufnehmen. Bitte Chrome, Safari oder Firefox in aktueller Fassung.', true);
  $('#btn-main').disabled = true;
} else {
  status('Bereit. Mikrofon und Kamera werden angefragt …');
  setupMedia().then((ok) => { if (ok) status('Bereit. „Starten" beginnt die Aufnahme.'); });
}
