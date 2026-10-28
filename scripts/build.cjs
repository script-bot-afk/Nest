const fs = require('node:fs/promises');
const path = require('node:path');
const esbuild = require('esbuild');
(async () => {
  const root = path.join(__dirname, '..');
  const out = path.join(root, 'dist', 'ui');
  await fs.mkdir(out, { recursive: true });
  await esbuild.build({ entryPoints: [path.join(root, 'ui', 'app.js')], outfile: path.join(out, 'app.js'),
    bundle: true, format: 'esm', platform: 'browser', target: 'chrome130', legalComments: 'linked', minify: true });
  for (const file of ['index.html', 'style.css']) await fs.copyFile(path.join(root, 'ui', file), path.join(out, file));
  for (const file of ['wallpaper.jpg', 'icon.png']) await fs.copyFile(path.join(root, 'assets', file), path.join(out, file));
  console.log('Built Nest interface.');
})().catch(e => { console.error(e); process.exitCode = 1; });
