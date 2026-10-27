'use strict';
const http = require('node:http');
const net = require('node:net');
const crypto = require('node:crypto');
const { WebSocketServer, createWebSocketStream } = require('ws');

async function createBridge(socketPath) {
  const token = crypto.randomBytes(32).toString('hex');
  const server = http.createServer((_req, res) => { res.writeHead(404); res.end(); });
  const wss = new WebSocketServer({ noServer: true, maxPayload: 4 * 1024 * 1024, perMessageDeflate: false });
  const sockets = new Set();
  server.on('connection', socket => { sockets.add(socket); socket.on('close', () => sockets.delete(socket)); });
  server.on('upgrade', (req, socket, head) => {
    const origin = req.headers.origin;
    if (req.url !== `/session/${token}` || !['file://', 'null'].includes(origin) || wss.clients.size) {
      socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n'); return;
    }
    wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws));
  });
  wss.on('connection', ws => {
    const upstream = net.connect(socketPath);
    const stream = createWebSocketStream(ws, { encoding: undefined });
    const cleanup = () => { upstream.destroy(); stream.destroy(); ws.terminate(); };
    upstream.on('error', cleanup); stream.on('error', cleanup);
    upstream.on('close', () => { if (ws.readyState === ws.OPEN) ws.close(); });
    ws.on('close', () => upstream.destroy());
    stream.pipe(upstream).pipe(stream);
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  return {
    url: `ws://127.0.0.1:${server.address().port}/session/${token}`,
    async close() {
      for (const ws of wss.clients) ws.terminate();
      for (const socket of sockets) socket.destroy();
      await new Promise(resolve => wss.close(resolve));
      await new Promise(resolve => server.close(resolve));
    }
  };
}
module.exports = { createBridge };
