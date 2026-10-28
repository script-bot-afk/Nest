const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const { once } = require('node:events');
const { WebSocket } = require('ws');
const { createBridge } = require('../src/bridge.cjs');

test('bridge rejects foreign origins and wrong tokens, and transports binary data', async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'nest-test-'));
  const sock = path.join(dir, 'rfb.sock');
  const server = net.createServer(s => s.pipe(s));
  server.listen(sock); await once(server, 'listening');
  const bridge = await createBridge(sock);
  t.after(async () => { await bridge.close(); await new Promise(r => server.close(r)); await fs.rm(dir, { recursive: true, force: true }); });
  async function denied(url, origin) {
    const ws = new WebSocket(url, { origin });
    ws.on('error', () => {});
    const [, response] = await once(ws, 'unexpected-response');
    assert.equal(response.statusCode, 403); ws.terminate();
  }
  await denied(bridge.url, 'https://example.com');
  await denied(bridge.url.replace(/session\/.*$/, 'session/wrong'), 'file://');
  const ws = new WebSocket(bridge.url, { origin: 'file://' });
  await once(ws, 'open');
  const bytes = Buffer.from([0, 1, 2, 255]); const message = once(ws, 'message');
  ws.send(bytes); assert.deepEqual((await message)[0], bytes);
  ws.close(); await once(ws, 'close');
});
