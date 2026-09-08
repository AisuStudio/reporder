import { TEMPLATES, DEFAULT_TEMPLATE, getTemplate } from './templates.js';
import { createSession } from './session.js';
import { listSessions, putSession, deleteSession, storageEstimate } from './storage.js';
import { formatDate, formatDuration, formatTimecode } from './time.js';

const $ = (sel) => document.querySelector(sel);

// --- template picker -------------------------------------------------------
const select = $('#template');
for (const tpl of Object.values(TEMPLATES)) {
  const o = document.createElement('option');
  o.value = tpl.id; o.textContent = tpl.name;
  select.append(o);
}
select.value = localStorage.getItem('reporder:template') || DEFAULT_TEMPLATE;
const showHint = () => { $('#template-hint').textContent = getTemplate(select.value).hint; };
select.addEventListener('change', showHint);
showHint();

// --- device capability note ----------------------------------------------
(function checkDevice() {
  const note = $('#device-note');
  const problems = [];
  if (!navigator.mediaDevices?.getUserMedia) problems.push('Dieser Browser gibt kein Mikrofon frei.');
  if (typeof MediaRecorder === 'undefined') problems.push('Dieser Browser kann keine Tonaufnahme speichern.');
  if (!window.isSecureContext) problems.push('Mikrofon und Kamera brauchen HTTPS oder localhost.');
  if (problems.length) { note.textContent = problems.join(' '); note.hidden = false; }
})();

// --- start a recording -----------------------------------------------------
$('#start-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const title = $('#title').value.trim();
  const template = select.value;
  localStorage.setItem('reporder:template', template);
  const session = createSession({ title, template });
  await putSession(session);
  location.href = `record.html?id=${encodeURIComponent(session.id)}`;
});

// --- list of sessions --------------------------------------------------------
async function renderSessions() {
  const list = $('#sessions');
  const sessions = await listSessions();
  list.innerHTML = '';
  $('#sessions-empty').hidden = sessions.length > 0;
  for (const s of sessions) {
    const li = document.createElement('li');
    const unfinished = !s.audio && s.durationMs === 0;
    li.innerHTML = `
      <div>
        <a class="session-title" href="${unfinished ? 'record' : 'report'}.html?id=${encodeURIComponent(s.id)}"></a>
        ${unfinished ? '<span class="session-badge">nicht beendet</span>' : ''}
        <div class="session-meta">
          <span></span>
          <span class="tc"></span>
          <span></span>
        </div>
      </div>
      <div class="session-actions">
        <button type="button" class="secondary" data-delete>Löschen</button>
      </div>`;
    li.querySelector('.session-title').textContent = s.title || 'Ohne Bezeichnung';
    const meta = li.querySelectorAll('.session-meta span');
    meta[0].textContent = formatDate(s.createdAt);
    meta[1].textContent = formatTimecode(s.durationMs);
    meta[2].textContent = `${s.photos.length} Foto${s.photos.length === 1 ? '' : 's'} · ${getTemplate(s.template).name}`;
    li.querySelector('[data-delete]').addEventListener('click', async () => {
      const what = s.title || formatDate(s.createdAt);
      if (!confirm(`„${what}" mit allen Fotos und der Tonaufnahme löschen? Das lässt sich nicht rückgängig machen.`)) return;
      await deleteSession(s.id);
      renderSessions();
    });
    list.append(li);
  }
  const est = await storageEstimate();
  if (est && est.quota) {
    const mb = (n) => `${Math.round(n / 1048576)} MB`;
    $('#storage-note').innerHTML = `Speicher <strong>${mb(est.usage)}</strong> von ${mb(est.quota)}<br>${sessions.length} Aufnahme${sessions.length === 1 ? '' : 'n'}`;
  }
}
renderSessions();

// --- service worker -----------------------------------------------------------
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
