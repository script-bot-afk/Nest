const { test } = require('node:test');
const assert = require('node:assert/strict');
const { sessionEnv, launchSpec, geometry, xauthority } = require('../src/system.cjs');

test('native apps cannot accidentally target the host Wayland display or bus', () => {
  const env = sessionEnv({ PATH: '/usr/bin', HOME: '/home/test', WAYLAND_DISPLAY: 'wayland-1',
    WAYLAND_SOCKET: '5', DISPLAY: ':0', DBUS_SESSION_BUS_ADDRESS: 'host', SESSION_MANAGER: 'host' }, ':321', '/tmp/auth', 'unix:path=/tmp/bus');
  assert.equal(env.DISPLAY, ':321'); assert.equal(env.WAYLAND_DISPLAY, undefined);
  assert.equal(env.WAYLAND_SOCKET, undefined); assert.equal(env.SESSION_MANAGER, undefined);
  assert.equal(env.DBUS_SESSION_BUS_ADDRESS, 'unix:path=/tmp/bus');
  assert.equal(env.GDK_BACKEND, 'x11'); assert.equal(env.HOME, '/home/test');
});
test('launches are allowlisted argv arrays and Firefox has a private profile', () => {
  const deps = ['firefox', 'terminal', 'btop'].map(id => ({ id, path: `/usr/bin/${id}` }));
  const [bin, args] = launchSpec('firefox', deps, '/home/test/with spaces');
  assert.equal(bin, '/usr/bin/firefox'); assert.ok(args.includes('--no-remote'));
  assert.ok(args.includes('/home/test/with spaces/firefox'));
  assert.throws(() => launchSpec('firefox; touch /tmp/bad', deps, '/tmp'), /Unknown/);
  assert.throws(() => launchSpec('files', deps, '/tmp'), /not installed/);
  assert.equal(launchSpec('btop', deps, '/tmp')[1].at(-1), '/usr/bin/btop');
});
test('desktop sizes reject arbitrary strings', () => {
  assert.equal(geometry('1920x1080'), '1920x1080');
  assert.throws(() => geometry('99999x99999')); assert.throws(() => geometry('--help'));
});
test('Xauthority uses a binary cookie and the reserved display', () => {
  const cookie = Buffer.from('0123456789abcdef'); const auth = xauthority(321, cookie);
  assert.equal(auth.readUInt16BE(0), 65535);
  assert.ok(auth.includes(Buffer.from('321')));
  assert.ok(auth.includes(Buffer.from('MIT-MAGIC-COOKIE-1')));
  assert.deepEqual(auth.subarray(-16), cookie);
});
