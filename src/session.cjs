'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { spawn, execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { EventEmitter } = require('node:events');
const exec = promisify(execFile);
const { dependencies, sessionEnv, xauthority, geometry, launchSpec } = require('./system.cjs');
const { createBridge } = require('./bridge.cjs');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

class DesktopSession extends EventEmitter {
  constructor(dataDir, assetsDir) {
    super(); this.dataDir = dataDir; this.assetsDir = assetsDir;
    this.state = 'stopped'; this.children = new Set(); this.logs = []; this.stopPromise = null;
  }
  log(message) { this.logs.push(String(message).trim()); this.logs = this.logs.slice(-100); this.emit('change'); }
  snapshot() { return { state: this.state, display: this.display || null, logs: this.logs.slice(-30) }; }
  child(bin, args, env = process.env, critical = false) {
    const child = spawn(bin, args, { env, cwd: os.homedir(), detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
    this.children.add(child);
    child.stderr.on('data', d => this.log(`${path.basename(bin)}: ${d.toString().slice(0, 1800)}`));
    child.on('error', error => this.log(`${path.basename(bin)}: ${error.message}`));
    child.on('exit', (code, signal) => {
      this.children.delete(child);
      if (code && this.state !== 'stopping') this.log(`${path.basename(bin)} exited (${code}).`);
      if (critical && this.state === 'running') {
        this.log(`Session component ${path.basename(bin)} stopped (${signal || code}).`);
        void this.stop().catch(e => this.log(e.message));
      }
    });
    return child;
  }
  async start(size = '1600x900') {
    if (this.state !== 'stopped') throw new Error('A session is already running or changing state.');
    if (process.platform !== 'linux') throw new Error('Nest native sessions currently require Linux.');
    geometry(size);
    this.deps = dependencies();
    const missing = this.deps.filter(d => d.required && !d.path);
    if (missing.length) throw new Error(`Install the missing components: ${missing.map(d => d.label).join(', ')}.`);
    this.state = 'starting'; this.logs = []; this.emit('change');
    try {
      await fs.mkdir(path.join(this.dataDir, 'firefox'), { recursive: true, mode: 0o700 });
      this.temp = await fs.mkdtemp(path.join(os.tmpdir(), 'nest-'));
      await fs.chmod(this.temp, 0o700);
      // Reserve an unused display; Xvnc also takes its own X lock atomically.
      const first = crypto.randomInt(100, 800);
      for (let offset = 0; offset < 100; offset++) {
        const n = first + offset;
        if (await exists(`/tmp/.X${n}-lock`) || await exists(`/tmp/.X11-unix/X${n}`)) continue;
        const lock = `/tmp/nest-display-${n}.lock`;
        try { await fs.mkdir(lock, { mode: 0o700 }); this.lock = lock; this.display = `:${n}`; break; }
        catch (e) { if (e.code !== 'EEXIST') throw e; }
      }
      if (!this.display) throw new Error('Could not reserve a local display.');
      this.auth = path.join(this.temp, 'Xauthority');
      await fs.writeFile(this.auth, xauthority(this.display.slice(1), crypto.randomBytes(16)), { mode: 0o600 });
      const vncSocket = path.join(this.temp, 'display.sock');
      const bin = id => this.deps.find(d => d.id === id).path;
      this.xserver = this.child(bin('display'), [this.display, '-geometry', size, '-depth', '24',
        '-auth', this.auth, '-nolisten', 'tcp', '-rfbport', '-1', '-rfbunixpath', vncSocket,
        '-rfbunixmode', '0600', '-SecurityTypes', 'None', '-AlwaysShared', '-desktop', 'Nest',
        '-AcceptSetDesktopSize', '1', '-FrameRate', '60', '-noreset'], process.env, true);
      await waitFor(async () => {
        if (this.xserver.exitCode !== null) throw new Error('Local display failed to start. See session log.');
        return exists(vncSocket);
      }, 10000, 'Local display did not become ready.');
      const bus = this.child(bin('dbus'), ['--session', '--nofork', '--print-address=1'], process.env, true);
      let address = ''; bus.stdout.on('data', d => { address += d.toString(); });
      await waitFor(() => {
        if (bus.exitCode !== null) throw new Error('Session bus failed to start.');
        return address.includes('\n');
      }, 5000, 'Session bus did not become ready.');
      this.env = sessionEnv(process.env, this.display, this.auth, address.trim().split('\n')[0]);
      const wm = this.child(bin('wm'), ['--config-file', path.join(this.assetsDir, 'openbox.xml')], this.env, true);
      await waitFor(async () => {
        if (wm.exitCode !== null) throw new Error('Window manager failed to start.');
        try { await exec(bin('windows'), ['-m'], { env: this.env, timeout: 1000 }); return true; } catch { return false; }
      }, 5000, 'Window manager did not become ready.');
      await exec(bin('background'), ['-solid', '#16131e'], { env: this.env, timeout: 3000 });
      if (bin('wallpaper')) {
        try { await exec(bin('wallpaper'), ['--no-fehbg', '--bg-fill', path.join(this.assetsDir, 'wallpaper.jpg')], { env: this.env, timeout: 3000 }); }
        catch (error) { this.log(`Wallpaper: ${error.message}`); }
      }
      this.bridge = await createBridge(vncSocket);
      this.state = 'running'; this.log('Desktop ready.');
      return { ...this.snapshot(), url: this.bridge.url };
    } catch (error) { this.log(error.message); await this.stop(); throw error; }
  }
  async launch(id) {
    if (this.state !== 'running') throw new Error('Start your desktop first.');
    // Refresh optional applications so installs are detected without restarting Nest.
    this.deps = dependencies();
    if (id === 'firefox' && this.firefox && this.firefox.exitCode === null) {
      const rows = await this.windows(); const found = rows.find(w => /firefox/i.test(w.title));
      if (found) { await this.focus(found.id); return { id, pid: this.firefox.pid }; }
      throw new Error('Firefox is already starting. Wait a moment.');
    }
    const [bin, args] = launchSpec(id, this.deps, this.dataDir);
    const child = this.child(bin, args, this.env);
    await new Promise((resolve, reject) => { child.once('spawn', resolve); child.once('error', reject); });
    if (id === 'firefox') this.firefox = child;
    this.log(`Opened ${id}.`);
    return { id, pid: child.pid };
  }
  async windows() {
    if (this.state !== 'running') return [];
    let stdout;
    try {
      ({ stdout } = await exec(this.deps.find(d => d.id === 'windows').path, ['-l'], { env: this.env, timeout: 2000 }));
    } catch (error) {
      // Openbox may omit the client-list property until the first window maps.
      if (error.code === 1 && /Cannot get client list properties/.test(error.stderr || '')) return [];
      throw error;
    }
    return stdout.trim().split('\n').flatMap(line => {
      const match = /^(0x[\da-f]+)\s+(-?\d+)\s+\S+\s+(.*)$/i.exec(line);
      return match && Number(match[2]) >= 0 ? [{ id: match[1], title: match[3] }] : [];
    });
  }
  async focus(id) {
    if (!(await this.windows()).some(w => w.id === id)) throw new Error('That window is no longer open.');
    await exec(this.deps.find(d => d.id === 'windows').path, ['-ia', id], { env: this.env, timeout: 2000 });
  }
  async stop() {
    if (this.stopPromise) return this.stopPromise;
    if (this.state === 'stopped' && !this.temp) return;
    this.stopPromise = this.cleanup();
    try { await this.stopPromise; } finally { this.stopPromise = null; }
  }
  async cleanup() {
    this.state = 'stopping'; this.emit('change');
    if (this.bridge) { await this.bridge.close(); this.bridge = null; }
    const children = [...this.children];
    // Terminate only the process groups created by this session, never by name.
    const signal = sig => { for (const child of children) if (child.pid && child.exitCode === null) { try { process.kill(-child.pid, sig); } catch (e) { if (e.code !== 'ESRCH') this.log(e.message); } } };
    signal('SIGTERM');
    await Promise.race([Promise.all(children.map(c => c.exitCode !== null || c.signalCode ? Promise.resolve() : new Promise(r => c.once('exit', r)))), delay(2000)]);
    signal('SIGKILL');
    this.children.clear();
    if (this.temp) await fs.rm(this.temp, { recursive: true, force: true });
    if (this.lock) await fs.rmdir(this.lock).catch(() => {});
    this.temp = null; this.lock = null; this.display = null; this.env = null; this.firefox = null;
    this.state = 'stopped'; this.emit('change');
  }
}
async function exists(file) { try { await fs.access(file); return true; } catch { return false; } }
async function waitFor(check, timeout, message) {
  const end = Date.now() + timeout;
  while (Date.now() < end) { if (await check()) return; await delay(60); }
  throw new Error(message);
}
module.exports = { DesktopSession, waitFor };
