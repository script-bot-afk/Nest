'use strict';
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

function which(names, env = process.env) {
  for (const name of [].concat(names)) {
    for (const dir of (env.PATH || '/usr/local/bin:/usr/bin:/bin').split(path.delimiter)) {
      if (!dir) continue;
      const file = path.resolve(dir, name);
      try { fs.accessSync(file, fs.constants.X_OK); if (fs.statSync(file).isFile()) return file; } catch {}
    }
  }
  return null;
}
function dependencies(env = process.env) {
  return [
    ['display', 'Local display', ['Xvnc', 'Xtigervnc'], true],
    ['wm', 'Window manager', ['openbox'], true],
    ['dbus', 'Session bus', ['dbus-daemon'], true],
    ['terminal', 'Terminal', ['xterm'], true],
    ['windows', 'Window controls', ['wmctrl'], true],
    ['background', 'Background', ['xsetroot'], true],
    ['wallpaper', 'Wallpaper', ['feh'], false],
    ['firefox', 'Firefox', ['firefox', 'firefox-esr'], false],
    ['btop', 'System monitor', ['btop'], false],
    ['files', 'File manager', ['thunar', 'pcmanfm'], false],
  ].map(([id, label, names, required]) => ({ id, label, required, path: which(names, env) }));
}
function sessionEnv(base, display, auth, bus) {
  const env = { ...base };
  for (const name of ['WAYLAND_DISPLAY', 'WAYLAND_SOCKET', 'SESSION_MANAGER', 'DESKTOP_AUTOSTART_ID', 'DBUS_STARTER_ADDRESS', 'DBUS_STARTER_BUS_TYPE', 'DBUS_SESSION_BUS_ADDRESS', 'XDG_ACTIVATION_TOKEN', 'LD_PRELOAD']) delete env[name];
  return { ...env, DISPLAY: display, XAUTHORITY: auth, DBUS_SESSION_BUS_ADDRESS: bus,
    XDG_SESSION_TYPE: 'x11', XDG_CURRENT_DESKTOP: 'Nest', DESKTOP_SESSION: 'nest',
    GDK_BACKEND: 'x11', QT_QPA_PLATFORM: 'xcb', MOZ_ENABLE_WAYLAND: '0',
    ELECTRON_OZONE_PLATFORM_HINT: 'x11', TERM: 'xterm-256color', COLORTERM: 'truecolor' };
}
function xauthority(display, cookie) {
  const field = value => { const b = Buffer.from(value); const length = Buffer.alloc(2); length.writeUInt16BE(b.length); return Buffer.concat([length, b]); };
  // FamilyWild matches local host aliases, with an exact display and random cookie.
  return Buffer.concat([Buffer.from([255, 255]), field(''), field(String(display)), field('MIT-MAGIC-COOKIE-1'), field(cookie)]);
}
function geometry(value) {
  const sizes = ['1280x720', '1600x900', '1920x1080', '2560x1440'];
  if (!sizes.includes(value)) throw new Error('Unsupported desktop size.');
  return value;
}
function launchSpec(id, deps, dataDir) {
  const get = key => { const p = deps.find(d => d.id === key)?.path; if (!p) throw new Error(`${key} is not installed. Open Setup for the install command.`); return p; };
  const terminal = ['-fa', 'Monospace', '-fs', '11', '-bg', '#14151d', '-fg', '#f0eaf0', '-cr', '#f393b5', '-geometry', '100x28', '-sb', '-rightbar'];
  switch (id) {
    case 'terminal': return [get('terminal'), [...terminal, '-T', 'Nest Terminal']];
    case 'btop': return [get('terminal'), [...terminal, '-T', 'btop · Nest', '-e', get('btop')]];
    case 'firefox': return [get('firefox'), ['--no-remote', '--new-instance', '--profile', path.join(dataDir, 'firefox'), '--new-window', 'about:blank']];
    case 'files': { const bin = get('files'); return [bin, [path.basename(bin) === 'thunar' ? '--disable-server' : '--new-win', os.homedir()]]; }
    default: throw new Error('Unknown application.');
  }
}
module.exports = { which, dependencies, sessionEnv, xauthority, geometry, launchSpec };
