'use strict';
const { app, BrowserWindow, ipcMain, dialog, clipboard, Menu } = require('electron');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const os = require('node:os');
const { DesktopSession } = require('./session.cjs');
const { dependencies } = require('./system.cjs');

app.setName('Nest');
const locked = app.requestSingleInstanceLock();
let win, desktop, closing = false, operation = Promise.resolve(), mutating = false;
const page = path.join(__dirname, '..', 'dist', 'ui', 'index.html');
const allowedUrl = pathToFileURL(page).href;
if (!locked) app.quit();
else {
  app.on('second-instance', () => { if (win) { win.restore(); win.focus(); } });
  app.whenReady().then(() => {
    desktop = new DesktopSession(app.getPath('userData'), path.join(__dirname, '..', 'assets'));
    Menu.setApplicationMenu(null);
    win = new BrowserWindow({ width: 1380, height: 880, minWidth: 900, minHeight: 620,
      title: 'Nest', backgroundColor: '#131019', icon: path.join(__dirname, '..', 'assets', 'icon.png'),
      webPreferences: { preload: path.join(__dirname, 'preload.cjs'), nodeIntegration: false,
        contextIsolation: true, sandbox: true, webSecurity: true, spellcheck: false } });
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    win.webContents.on('will-navigate', event => event.preventDefault());
    win.webContents.session.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
    win.webContents.session.setPermissionCheckHandler(() => false);
    function handle(channel, fn) {
      ipcMain.handle(channel, async (event, ...args) => {
        if (event.sender !== win.webContents || event.senderFrame !== win.webContents.mainFrame || event.senderFrame.url !== allowedUrl) throw new Error('Untrusted request.');
        return fn(...args);
      });
    }
    function mutation(fn) {
      if (mutating || closing) throw new Error('Please wait for the current session operation.');
      mutating = true;
      operation = Promise.resolve().then(fn).finally(() => { mutating = false; });
      return operation;
    }
    handle('nest:info', () => ({ version: app.getVersion(), platform: process.platform,
      architecture: process.arch, release: os.release(), dependencies: dependencies(),
      dataDir: app.getPath('userData'), ...desktop.snapshot() }));
    handle('nest:start', size => mutation(() => desktop.start(size)));
    handle('nest:stop', () => mutation(() => desktop.stop()));
    handle('nest:launch', id => { if (closing) throw new Error('Nest is closing.'); return desktop.launch(id); });
    handle('nest:windows', () => desktop.windows());
    handle('nest:focus', id => desktop.focus(id));
    handle('nest:fullscreen', () => { win.setFullScreen(!win.isFullScreen()); return win.isFullScreen(); });
    handle('nest:copy', text => { if (typeof text !== 'string' || text.length > 65536) throw new Error('Text too long.'); clipboard.writeText(text); });
    desktop.on('change', () => { if (win && !win.isDestroyed()) win.webContents.send('nest:state', desktop.snapshot()); });
    win.on('close', async event => {
      if (closing) return;
      event.preventDefault();
      if (desktop.state !== 'stopped') {
        const answer = await dialog.showMessageBox(win, { type: 'question', title: 'Close Nest?',
          message: 'Close this desktop and its apps?', detail: 'Save your work in the apps first. Your normal desktop stays running.',
          buttons: ['Keep working', 'Close Nest'], defaultId: 0, cancelId: 0 });
        if (answer.response !== 1) return;
      }
      closing = true;
      await operation.catch(() => {});
      await desktop.stop(); app.quit();
    });
    win.webContents.on('render-process-gone', () => { void operation.catch(() => {}).then(() => desktop.stop()); });
    win.webContents.on('before-input-event', (_event, input) => {
      if (input.type === 'keyDown' && input.key === 'F11') win.setFullScreen(!win.isFullScreen());
    });
    void win.loadFile(page);
  });
  app.on('window-all-closed', () => app.quit());
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => {
    closing = true; await operation.catch(() => {}); await desktop?.stop(); app.quit();
  });
}
