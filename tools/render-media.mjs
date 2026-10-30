// Renders the game's media from the same 3D code the game runs, in headless Chrome (GPU):
//   node tools/render-media.mjs portraits   → media/mon/<id>.webp, <id>-evo.webp (+ egg), transparent
//   node tools/render-media.mjs hero        → media/hero-wide.mp4 + .jpg, media/hero-tall.mp4 + .jpg
//   node tools/render-media.mjs all
// Options: --fps 30; --theme halloween renders the Night of Fangs look instead (costumed
// portraits <id>-hw.webp and <id>-evo-hw.webp, media/hero-hw-*.mp4); --ids a,b limits the
// portraits. CHROME_PATH and FFMPEG override the binaries.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';
import { COSTUME_NAMES } from '../src/event.js';
import { BOSSES } from '../src/data.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const what = process.argv[2] || 'all';
const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : fallback;
};
const fps = Number(arg('fps', '30'));
const theme = arg('theme', '');
const suffix = theme === 'halloween' ? '-hw' : '';
const only = arg('ids', '');
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const FFMPEG = process.env.FFMPEG || 'ffmpeg';
const media = path.join(root, 'media');
fs.mkdirSync(path.join(media, 'mon'), { recursive: true });

// Static server for the studio page (ES modules don't load from file://).
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' };
const server = http.createServer((req, res) => {
  const p = path.join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!p.startsWith(root) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) return res.writeHead(404).end();
  res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/tools/studio.html`;

function ffmpeg(args, input) {
  const ff = spawn(FFMPEG, ['-y', '-loglevel', 'error', ...args], { stdio: [input ? 'pipe' : 'ignore', 'inherit', 'inherit'] });
  const done = new Promise((ok, fail) => ff.on('close', (code) => (code === 0 ? ok() : fail(new Error(`ffmpeg exited with ${code}`)))));
  return { ff, done };
}

async function open(browser, query, width, height) {
  const page = await browser.newPage();
  page.on('console', (m) => m.type() === 'error' && !m.text().includes('404') && console.error('[page]', m.text()));
  page.on('pageerror', (e) => console.error('[page]', e.message));
  await page.setViewport({ width, height, deviceScaleFactor: 1 });
  await page.goto(`${base}?${query}&still=1${theme ? `&theme=${theme}` : ''}`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.studioReady, { timeout: 60000 });
  return page;
}

// Every monster in both forms (<id>.webp, <id>-evo.webp) and the egg; bosses have no
// evolved form. With a theme: only the monsters that wear a costume in it.
async function portraits(browser) {
  const page = await open(browser, 'view=portrait', 720, 720);
  let ids = await page.evaluate(() => window.studio.ids);
  if (suffix) ids = ids.filter((id) => Object.hasOwn(COSTUME_NAMES, id));
  if (only) ids = ids.filter((id) => only.split(',').includes(id));
  const boss = new Set(BOSSES.map((b) => b.id));
  const shots = [...ids.map((id) => [id, false]), ...ids.filter((id) => !boss.has(id)).map((id) => [id, true]), ...(suffix || only ? [] : [['egg', false]])];
  const tmp = path.join(media, 'mon', '_tmp.png');
  for (const [id, evo] of shots) {
    const url = await page.evaluate(async (x, e) => window.studio.portrait(x, 0.6, e), id, evo);
    fs.writeFileSync(tmp, Buffer.from(url.split(',')[1], 'base64'));
    const out = path.join(media, 'mon', `${id}${evo ? '-evo' : ''}${suffix}.webp`);
    await ffmpeg(['-i', tmp, '-vf', 'scale=480:480', '-c:v', 'libwebp', '-quality', '88', '-compression_level', '6', out]).done;
    console.log(path.relative(root, out), `${Math.round(fs.statSync(out).size / 1024)} KB`);
  }
  fs.rmSync(tmp, { force: true });
  await page.close();
}

async function hero(browser, name, width, height) {
  const page = await open(browser, 'view=hero', width, height);
  const duration = await page.evaluate(() => window.studio.duration);
  const file = path.join(media, `hero${suffix}-${name}.mp4`);
  const color = ['-vf', 'scale=in_range=pc:out_range=tv:out_color_matrix=bt709,format=yuv420p', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv'];
  const { ff, done } = ffmpeg(['-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'mjpeg', '-i', '-', ...color, '-c:v', 'libx264', '-preset', 'slow', '-crf', '24', '-profile:v', 'high', '-r', String(fps), '-an', '-movflags', '+faststart', file], true);
  const frames = Math.round(duration * fps);
  const started = Date.now();
  for (let i = 0; i < frames; i++) {
    await page.evaluate((t) => window.studio.seek(t), i / fps);
    const jpg = await page.screenshot({ type: 'jpeg', quality: 93 });
    if (i === 0) fs.writeFileSync(path.join(media, `hero${suffix}-${name}.jpg`), jpg);
    if (!ff.stdin.write(jpg)) await new Promise((r) => ff.stdin.once('drain', r));
    if (i % 60 === 0) console.log(`${name} ${i}/${frames} (${((Date.now() - started) / 1000).toFixed(0)} s)`);
  }
  ff.stdin.end();
  await done;
  console.log(path.relative(root, file), `${(fs.statSync(file).size / 1048576).toFixed(1)} MB`);
  await page.close();
}

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--force-color-profile=srgb', '--hide-scrollbars', '--ignore-gpu-blocklist'] });
try {
  if (what === 'portraits' || what === 'all') await portraits(browser);
  if (what === 'hero' || what === 'all') {
    await hero(browser, 'wide', 1920, 1080);
    await hero(browser, 'tall', 1080, 1440);
  }
} finally {
  await browser.close();
  server.close();
}
