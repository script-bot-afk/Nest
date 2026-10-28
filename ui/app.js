import RFB from '@novnc/novnc';

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const icons = {
  settings: '<path d="m12 3 2 3 3-.2.2 3 3 2-3 2-.2 3-3-.2-2 3-2-3-3 .2-.2-3-3-2 3-2 .2-3 3 .2Z"/><circle cx="12" cy="11" r="2.5"/>',
  expand: '<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>',
  arrow: '<path d="M4 12h15m-6-6 6 6-6 6"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  grid: '<rect x="3" y="3" width="6" height="6" rx="1"/><rect x="15" y="3" width="6" height="6" rx="1"/><rect x="3" y="15" width="6" height="6" rx="1"/><rect x="15" y="15" width="6" height="6" rx="1"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
  globe: '<circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18"/>',
  terminal: '<rect x="2" y="4" width="20" height="16" rx="3"/><path d="m6 9 3 3-3 3m7 0h4"/>',
  activity: '<path d="M3 12h4l3-8 4 16 3-8h4"/>',
  folder: '<path d="M3 7V5a2 2 0 0 1 2-2h4l3 4h7a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z"/>',
  power: '<path d="M12 2v10m-6-7a9 9 0 1 0 12 0"/>',
  layers: '<path d="m12 3 10 5-10 5L2 8Zm-10 9 10 5 10-5M2 16l10 5 10-5"/>',
  clipboard: '<rect x="5" y="5" width="14" height="17" rx="2"/><rect x="9" y="2" width="6" height="5" rx="1"/>'
};
const icon = name => `<svg viewBox="0 0 24 24" aria-hidden="true">${icons[name] || icons.grid}</svg>`;
$$('[data-icon]').forEach(el => { el.innerHTML = icon(el.dataset.icon); });
const api = window.nest;
const apps = [
  { id: 'firefox', name: 'Firefox', description: 'A window to the web', icon: 'globe' },
  { id: 'terminal', name: 'Terminal', description: 'Make things happen', icon: 'terminal' },
  { id: 'btop', name: 'System monitor', description: 'Your machine, live', icon: 'activity' },
  { id: 'files', name: 'Files', description: 'Everything in its place', icon: 'folder' }
];
const commands = {
  arch: 'sudo pacman -S --needed tigervnc openbox xterm dbus wmctrl xorg-xsetroot feh firefox btop thunar',
  debian: 'sudo apt update && sudo apt install tigervnc-standalone-server openbox xterm dbus-x11 wmctrl x11-xserver-utils feh btop thunar\n# Install a native Firefox / Firefox ESR package for your distribution. Snap is not supported.',
  fedora: 'sudo dnf install tigervnc-server openbox xterm dbus-daemon wmctrl xsetroot feh firefox btop thunar',
  void: 'sudo xbps-install -S tigervnc openbox xterm dbus wmctrl xsetroot feh firefox btop Thunar'
};
let info, rfb, busy = false, stopped = true, state = 'stopped', toastTimer, pollBusy = false;
let lastWindows = '';
let preferences = { resolution: '1600x900', resize: true, accent: 'rose' };
try { preferences = { ...preferences, ...JSON.parse(localStorage.getItem('nest-preferences') || '{}') }; } catch {}
const save = () => localStorage.setItem('nest-preferences', JSON.stringify(preferences));
function toast(message) {
  $('#toast').textContent = String(message).replace(/^Error invoking remote method '[^']+': Error: /, '');
  $('#toast').hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { $('#toast').hidden = true; }, 7000);
}
function setAccent(name) {
  const colors = { rose: '#ef9cbd', lavender: '#c0a5f3', mint: '#98d4be' };
  if (!colors[name]) name = 'rose';
  document.documentElement.style.setProperty('--accent', colors[name]);
  document.documentElement.style.setProperty('--accent-soft', `${colors[name]}16`);
  $$('.swatch').forEach(el => el.classList.toggle('selected', el.dataset.accent === name));
  preferences.accent = name;
}
setAccent(preferences.accent);
$('#resolution').value = preferences.resolution;
if (!$('#resolution').value) $('#resolution').value = preferences.resolution = '1600x900';
$('#auto-resize').checked = preferences.resize;
function updateClock() { $('#clock').textContent = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); }
updateClock(); setInterval(updateClock, 10000);
function setState(next) {
  state = next.state;
  const running = state === 'running';
  $('#status').textContent = { stopped: 'Your space is ready', starting: 'Making room for you…', running: 'Desktop is live', stopping: 'Closing your desktop…' }[state];
  $('#status-dot').classList.toggle('running', running);
  $('#stop').disabled = !running; $('#clipboard').disabled = !running;
  $('#start').disabled = state !== 'stopped' || busy;
  $('#logs').textContent = next.logs?.join('\n\n') || 'No session started yet.';
  if (state === 'stopped' && !stopped) {
    stopped = true; rfb?.disconnect(); rfb = null;
    $('#desktop').hidden = true; $('#welcome').hidden = false;
    $('#screen').replaceChildren(); renderWindows([]);
  }
}
function tab(name) {
  $$('[data-tab]').forEach(el => el.classList.toggle('active', el.dataset.tab === name));
  $$('[data-pane]').forEach(el => { el.hidden = el.dataset.pane !== name; });
}
function openSettings(name = 'general') { closeLauncher(); tab(name); $('#settings-dialog').showModal(); }
function dependency(id) { return info?.dependencies?.find(d => d.id === id); }
async function refresh() {
  if (!api) { $('#readiness').textContent = 'Open Nest as a desktop app.'; return; }
  info = await api.info();
  const missing = info.dependencies.filter(d => d.required && !d.path);
  $('#readiness').textContent = info.platform !== 'linux' ? 'Linux is required for native apps.' : missing.length ? `${missing.length} components to install` : 'Everything’s ready to go.';
  $('#platform').textContent = `Nest ${info.version} · ${info.platform} ${info.architecture}`;
  $('#dependencies').replaceChildren();
  for (const dep of info.dependencies) {
    const row = document.createElement('div'); row.className = 'dependency';
    const label = document.createElement('span'); label.textContent = dep.label;
    if (!dep.required) { const small = document.createElement('small'); small.textContent = 'optional'; label.append(small); }
    const status = document.createElement('span'); status.className = dep.path ? 'ok' : 'missing'; status.textContent = dep.path ? 'Ready' : 'Not installed';
    row.append(label, status); $('#dependencies').append(row);
  }
  setState(info); renderApps();
}
function renderApps() {
  const query = $('#app-search').value.trim().toLowerCase();
  $('#app-grid').replaceChildren();
  for (const item of apps.filter(app => `${app.name} ${app.id}`.toLowerCase().includes(query))) {
    const installed = !!dependency(item.id)?.path;
    const el = document.createElement('button'); el.className = `app-tile ${item.id} ${installed ? '' : 'missing'}`;
    el.innerHTML = icon(item.icon);
    const name = document.createElement('b'); name.textContent = item.name;
    const note = document.createElement('small'); note.textContent = installed ? item.description : 'Install to use';
    el.append(name, note); el.addEventListener('click', () => void launch(item.id)); $('#app-grid').append(el);
  }
}
function closeLauncher() { $('#launcher').hidden = true; $('#apps').classList.remove('selected'); }
async function start() {
  if (busy || state !== 'stopped') return false;
  if (!api) { toast('Run the Nest desktop application to start a real Linux session.'); return false; }
  await refresh();
  if (info.platform !== 'linux' || info.dependencies.some(d => d.required && !d.path)) { openSettings('components'); return false; }
  busy = true; $('#start').disabled = true; closeLauncher();
  try {
    const result = await api.start(preferences.resolution);
    stopped = false; $('#welcome').hidden = true; $('#desktop').hidden = false;
    $('#connecting').hidden = false; $('#connecting').textContent = 'Connecting to your desktop…';
    rfb = new RFB($('#screen'), result.url);
    rfb.scaleViewport = true; rfb.resizeSession = !!preferences.resize;
    rfb.qualityLevel = 9; rfb.compressionLevel = 1; rfb.background = '#16131e';
    rfb.addEventListener('connect', () => { $('#connecting').hidden = true; rfb.focus(); });
    rfb.addEventListener('disconnect', event => {
      if (!stopped) {
        $('#connecting').hidden = false;
        $('#connecting').textContent = 'Display disconnected. End this session and start again.';
        if (!event.detail.clean) toast('The display connection was interrupted. Your session log may have more details.');
      }
    });
    rfb.addEventListener('securityfailure', () => toast('The local display connection failed. Open Setup → Session log.'));
    setState(result); return true;
  } catch (error) { toast(error.message); await refresh(); return false; }
  finally { busy = false; $('#start').disabled = state !== 'stopped'; }
}
async function launch(id) {
  if (busy) return;
  if (!api) { toast('Open the desktop app to use real applications.'); return; }
  if (!dependency(id)?.path) { openSettings('components'); return; }
  closeLauncher();
  if (state !== 'running' && !(await start())) return;
  try { await api.launch(id); rfb?.focus(); } catch (error) { toast(error.message); }
}
function renderWindows(windows) {
  const serialized = JSON.stringify(windows);
  if (lastWindows === serialized) return;
  lastWindows = serialized; $('#windows').replaceChildren();
  if (!windows.length) {
    const empty = document.createElement('span'); empty.className = 'empty-windows';
    empty.textContent = state === 'running' ? 'Open an app. Make yourself at home.' : 'Room for your next idea.';
    $('#windows').append(empty);
  }
  for (const w of windows) {
    const el = document.createElement('button'); el.className = 'window-button'; el.textContent = w.title; el.title = w.title;
    el.dataset.windowId = w.id;
    el.addEventListener('click', async () => { try { await api.focus(w.id); rfb?.focus(); } catch (error) { toast(error.message); } });
    $('#windows').append(el);
  }
}
$('#start').addEventListener('click', () => void start());
$('#setup').addEventListener('click', () => openSettings());
$('#home').addEventListener('click', () => openSettings());
$('#fullscreen').addEventListener('click', () => { void api?.fullscreen(); });
$('#apps').addEventListener('click', () => {
  $('#launcher').hidden = !$('#launcher').hidden; $('#apps').classList.toggle('selected', !$('#launcher').hidden);
  if (!$('#launcher').hidden) { $('#app-search').value = ''; renderApps(); $('#app-search').focus(); rfb?.blur(); }
});
$('#close-launcher').addEventListener('click', closeLauncher);
$('#app-search').addEventListener('input', renderApps);
$$('[data-launch]').forEach(el => el.addEventListener('click', () => void launch(el.dataset.launch)));
$$('[data-close]').forEach(el => el.addEventListener('click', () => { $(`#${el.dataset.close}`).close(); rfb?.focus(); }));
$$('[data-tab]').forEach(el => el.addEventListener('click', () => tab(el.dataset.tab)));
$('#refresh').addEventListener('click', () => void refresh().catch(e => toast(e.message)));
$('#distro').addEventListener('change', () => { $('#install-command').textContent = commands[$('#distro').value]; });
$('#install-command').textContent = commands.arch;
$('#copy-command').addEventListener('click', async () => { try { await api.copy($('#install-command').textContent); toast('Install command copied.'); } catch (e) { toast(e.message); } });
$('#resolution').addEventListener('change', () => { preferences.resolution = $('#resolution').value; save(); });
$('#auto-resize').addEventListener('change', () => { preferences.resize = $('#auto-resize').checked; if (rfb) rfb.resizeSession = preferences.resize; save(); });
$$('[data-accent]').forEach(el => el.addEventListener('click', () => { setAccent(el.dataset.accent); save(); }));
$('#stop').addEventListener('click', () => $('#stop-dialog').showModal());
$('#confirm-stop').addEventListener('click', async () => {
  $('#stop-dialog').close(); stopped = true; rfb?.disconnect(); rfb = null;
  try { await api.stop(); } catch (error) { toast(error.message); }
  $('#desktop').hidden = true; $('#welcome').hidden = false; $('#screen').replaceChildren(); renderWindows([]);
  await refresh();
});
$('#clipboard').addEventListener('click', () => { $('#clipboard-dialog').showModal(); $('#clipboard-text').focus(); });
$('#send-clipboard').addEventListener('click', () => {
  if (!rfb) return;
  rfb.clipboardPasteFrom($('#clipboard-text').value); $('#clipboard-text').value = '';
  $('#clipboard-dialog').close(); rfb.focus(); toast('Text sent. Paste it inside your app.');
});
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeLauncher(); });
document.addEventListener('pointerdown', e => { if (!e.target.closest('#launcher, #apps')) closeLauncher(); });
api?.onState(setState);
void refresh().catch(error => toast(error.message));
setInterval(async () => {
  if (state !== 'running' || pollBusy) return;
  pollBusy = true;
  try { renderWindows(await api.windows()); } catch {} finally { pollBusy = false; }
}, 1200);
