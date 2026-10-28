const { _electron: electron } = require('playwright');
const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');

(async () => {
  await fs.mkdir('test-output', { recursive: true });
  // These switches belong only to the CI harness; never to the shipped application.
  const instance = await electron.launch({ args: ['--no-sandbox', '--disable-gpu', '.'], timeout: 30000 });
  let page;
  const errors = [];
  try {
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
    await page.getByRole('button', { name: 'Open Terminal', exact: true }).click();
    await page.locator('#windows').getByRole('button', { name: /Nest Terminal/ }).waitFor({ timeout: 10000 });
    // Typing passes through noVNC into the real nested terminal.
    await page.locator('#windows').getByRole('button', { name: /Nest Terminal/ }).click();
    await page.keyboard.type('printf "NEST_NATIVE_TERMINAL_OK\\n"');
    await page.keyboard.press('Enter');
    await page.getByRole('button', { name: 'Open Firefox', exact: true }).click();
    await page.locator('#windows').getByRole('button', { name: /Firefox/ }).first().waitFor({ timeout: 30000 });
    await page.locator('#windows').getByRole('button', { name: /btop/ }).click();
    await page.waitForTimeout(1800);
    await page.screenshot({ path: 'test-output/native-desktop.png' });
    await instance.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1100, 760));
    await page.waitForTimeout(1200);
    await page.screenshot({ path: 'test-output/resized-desktop.png' });
    const nativeWindows = await page.evaluate(() => window.nest.windows());
    assert.ok(nativeWindows.length >= 3, 'Real Firefox, btop and terminal windows exist');
    await page.getByRole('button', { name: 'End desktop session', exact: true }).click();
    await page.getByRole('button', { name: 'End session', exact: true }).click();
    await page.getByText('Your space is ready', { exact: true }).waitFor({ timeout: 10000 });
    assert.equal((await page.evaluate(() => window.nest.info())).state, 'stopped');
    assert.deepEqual(errors, [], 'No renderer errors');
    await fs.writeFile('test-output/result.json', JSON.stringify({ passed: true, nativeWindows, rendererErrors: errors }, null, 2));
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
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
