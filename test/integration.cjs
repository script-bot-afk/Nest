const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const { once } = require('node:events');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const exec = promisify(execFile);
const { DesktopSession, waitFor } = require('../src/session.cjs');
const { dependencies } = require('../src/system.cjs');
const ready = process.platform === 'linux' && dependencies().filter(d => d.required).every(d => d.path);

test('real X display, authenticated X clients, btop window, shutdown and restart', { skip: !ready, timeout: 45000 }, async t => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'nest-integration-'));
  const session = new DesktopSession(dataDir, path.join(__dirname, '..', 'assets'));
  t.after(async () => { await session.stop(); await fs.rm(dataDir, { recursive: true, force: true }); });
  try {
    const start = await session.start('1280x720');
    assert.equal(start.state, 'running'); assert.match(start.url, /^ws:\/\/127\.0\.0\.1:/);
    const tmp = session.temp;
    assert.equal((await fs.stat(tmp)).mode & 0o777, 0o700);
    assert.equal((await fs.stat(path.join(tmp, 'display.sock'))).mode & 0o777, 0o600);
    // Check X authentication actually works and there is no access-control bypass.
    await exec('xdpyinfo', [], { env: session.env, timeout: 2000 });
    await assert.rejects(exec('xdpyinfo', [], { env: { ...session.env, XAUTHORITY: '/dev/null' }, timeout: 2000 }));
    const raw = net.connect(path.join(tmp, 'display.sock'));
    const [banner] = await once(raw, 'data'); assert.match(banner.toString(), /^RFB 003/); raw.destroy();
    await session.launch('terminal');
    await session.launch('btop');
    await waitFor(async () => (await session.windows()).some(w => /btop/.test(w.title)), 6000, 'btop window not found');
    const windows = await session.windows(); assert.ok(windows.some(w => /Nest Terminal/.test(w.title)));
    await session.focus(windows[0].id);
    await assert.rejects(session.launch('arbitrary-command'), /Unknown/);
    const childPids = [...session.children].map(c => c.pid);
    await session.stop();
    assert.equal(session.state, 'stopped');
    await assert.rejects(fs.access(tmp));
    for (const pid of childPids) assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' });
    assert.equal((await session.start('1280x720')).state, 'running');
    await session.stop();
  } catch (e) { console.error(session.logs.join('\n')); throw e; }
});
