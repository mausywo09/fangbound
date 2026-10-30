// Screenshots a studio view with headless Chrome (GPU WebGL), for checking the 3D work.
//   node tools/shot.mjs "view=arena" out.png [width] [height] [time]
// Needs the studio server (`npx http-server . -p 4381`) or STUDIO=http://host:port.
import puppeteer from 'puppeteer-core';

const [query = 'view=arena', file = 'shot.png', w = '1280', h = '720', t = '1.2'] = process.argv.slice(2);
const base = process.env.STUDIO || 'http://127.0.0.1:4381';
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--force-color-profile=srgb', '--hide-scrollbars', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(e.message));
  await page.setViewport({ width: Number(w), height: Number(h), deviceScaleFactor: 1 });
  await page.goto(`${base}/tools/studio.html?${query}&still=1`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.studioReady || window.studioError, { timeout: 60000 }).catch(() => {});
  if (errors.length) console.error(errors.join('\n'));
  await page.evaluate((s) => window.studio?.seek(Number(s)), t);
  await page.evaluate((s) => window.studio?.seek(Number(s) + 0.016), t);
  await page.screenshot({ path: file });
  console.log(file);
} finally {
  await browser.close();
}
