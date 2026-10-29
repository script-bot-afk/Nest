const { _electron: electron } = require('playwright');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const { waitFor } = require('../src/session.cjs');

(async () => {
  await fs.mkdir('test-output', { recursive: true });
  const testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'nest-ui-'));
  const marker = path.join(testDir, 'terminal-marker');
  // These switches belong only to the CI harness; never to the shipped application.
  const executablePath = process.env.NEST_EXECUTABLE && path.resolve(process.env.NEST_EXECUTABLE);
  const instance = await electron.launch({
    ...(executablePath ? { executablePath } : {}),
    args: ['--no-sandbox', '--disable-gpu', ...(executablePath ? [] : ['.'])],
    timeout: 30000
  });
  let page;
  const errors = [];
  try {
    assert.equal(await instance.evaluate(({ app }) => app.isPackaged), !!executablePath);
    if (executablePath) {
      const resources = path.join(path.dirname(executablePath), 'resources', 'assets');
      await fs.access(path.join(resources, 'openbox.xml'));
      await fs.access(path.join(resources, 'wallpaper.jpg'));
    }
    page = await instance.firstWindow();
    page.on('pageerror', error => errors.push(error.message));
    await page.getByText('Everything’s ready to go.').waitFor({ timeout: 15000 });
    assert.equal(await page.evaluate(() => typeof window.require), 'undefined');
    await page.screenshot({ path: 'test-output/welcome.png' });
    await page.getByRole('button', { name: 'Setup' }).click();
    await page.getByRole('button', { name: 'Mint accent' }).click();
    await page.getByRole('button', { name: 'Rose accent' }).click();
    await page.getByRole('button', { name: 'Close settings' }).click();
    await page.getByRole('button', { name: 'Enter your desktop' }).click();
    await page.getByText('Desktop is live', { exact: true }).waitFor({ timeout: 20000 });
    await page.locator('#connecting').waitFor({ state: 'hidden', timeout: 15000 });
    await page.getByRole('button', { name: 'Open btop', exact: true }).click();
    await page.locator('#windows').getByRole('button', { name: /btop/ }).waitFor({ timeout: 10000 });
    const beforeTerminal = await page.evaluate(() => window.nest.windows());
    await page.getByRole('button', { name: 'Open Terminal', exact: true }).click();
    let terminal;
    await waitFor(async () => {
      const rows = await page.evaluate(() => window.nest.windows());
      terminal = rows.find(row => !beforeTerminal.some(before => before.id === row.id));
      return !!terminal;
    }, 10000, 'Native terminal window not found');
    // Typing passes through noVNC into the real nested terminal.
    await page.locator('#windows [data-window-id="' + terminal.id + '"]').click();
    await page.locator('#screen canvas').waitFor({ state: 'visible' });
    await page.waitForFunction(() => document.activeElement === document.querySelector('#screen canvas'));
    // Read back a file written by the real shell, not by the test harness.
    await page.keyboard.type("printf 'NEST_NATIVE_TERMINAL_OK\\n' | tee '" + marker + "'");
    await page.keyboard.press('Enter');
    await waitFor(async () => {
      try { return (await fs.readFile(marker, 'utf8')).trim() === 'NEST_NATIVE_TERMINAL_OK'; }
      catch (error) { if (error.code === 'ENOENT') return false; throw error; }
    }, 10000, 'Typed command did not reach the native terminal');
    await page.getByRole('button', { name: 'Open Firefox', exact: true }).click();
    await page.locator('#windows').getByRole('button', { name: /Firefox/ }).first().waitFor({ timeout: 30000 });
    await page.locator('#windows').getByRole('button', { name: /btop/ }).click();
    await page.waitForTimeout(1800);
    await page.screenshot({ path: 'test-output/native-desktop.png' });
    const initialSize = await page.locator('#screen canvas').evaluate(c => ({ width: c.width, height: c.height }));
    await instance.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1100, 760));
    await page.waitForFunction(before => {
      const canvas = document.querySelector('#screen canvas');
      return canvas.width > 0 && canvas.height > 0 && (canvas.width !== before.width || canvas.height !== before.height);
    }, initialSize, { timeout: 10000 });
    await page.screenshot({ path: 'test-output/resized-desktop.png' });
    const nativeWindows = await page.evaluate(() => window.nest.windows());
    assert.ok(nativeWindows.length >= 3, 'Real Firefox, btop and terminal windows exist');
    await page.getByRole('button', { name: 'End desktop session', exact: true }).click();
    await page.getByRole('button', { name: 'End session', exact: true }).click();
    await page.getByText('Your space is ready', { exact: true }).waitFor({ timeout: 10000 });
    assert.equal((await page.evaluate(() => window.nest.info())).state, 'stopped');
    assert.deepEqual(errors, [], 'No renderer errors');
    await fs.writeFile('test-output/result.json', JSON.stringify({ passed: true, packaged: !!executablePath, nativeTerminalInput: true, desktopResized: true, nativeWindows, rendererErrors: errors }, null, 2));
    console.log('PASS: Electron renderer, noVNC, btop, terminal input, Firefox, resize and shutdown.');
  } catch (error) {
    if (page) {
      await page.screenshot({ path: 'test-output/failure.png' }).catch(() => {});
      const info = await page.evaluate(() => window.nest?.info()).catch(() => null);
      await fs.writeFile('test-output/failure.json', JSON.stringify({ error: error.stack, errors, info }, null, 2));
      console.error(JSON.stringify(info, null, 2));
    }
    throw error;
  } finally {
    if (page) await page.evaluate(() => window.nest?.stop()).catch(() => {});
    await instance.close();
    await fs.rm(testDir, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
