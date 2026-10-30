// Brand images for the $FANG launch and the X account, drawn from the site's own crest and
// arena stills. `node brand/render.mjs` writes brand/out/:
//   fang-token-1000.png   token logo for the launch metadata (square, safe inside a circle)
//   x-avatar-400.png      X profile picture (X crops it to a circle)
//   x-banner-1500x500.png X header, arena still; x-banner-hw-1500x500.png the Night of Fangs one
// The text stays right of centre because the avatar covers the banner's lower left.
import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';
import { logoArt } from '../src/art.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'brand', 'out');
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
mkdirSync(out, { recursive: true });

const FONTS = '<link href="https://fonts.googleapis.com/css2?family=Barlow+Semi+Condensed:wght@600;700&family=Cinzel:wght@800;900&display=block" rel="stylesheet">';
const still = (name) => `data:image/jpeg;base64,${readFileSync(path.join(root, 'media', name)).toString('base64')}`;
const BASE = `*{margin:0;box-sizing:border-box}html,body{width:100%;height:100%;overflow:hidden;background:#07060a}
.crest svg{display:block;width:100%;height:100%;filter:drop-shadow(0 0 4% rgba(255,110,40,.55))}`;

// The crest on a dark ember glow, sized so the shield's corners stay inside a circle crop.
const mark = (size, scale) => `<!doctype html><html><head><style>${BASE}
body{display:grid;place-items:center;background:radial-gradient(60% 60% at 50% 48%,#3a1a12 0%,#1a0c0e 45%,#07060a 78%)}
body::before{content:'';position:absolute;inset:0;background:radial-gradient(34% 30% at 50% 58%,rgba(255,110,30,.35),transparent 70%)}
.crest{position:relative;width:${size * scale}px;height:${size * scale}px}
.crest svg{filter:drop-shadow(0 0 ${size * 0.04}px rgba(255,120,40,.6)) drop-shadow(0 ${size * 0.02}px ${size * 0.03}px rgba(0,0,0,.7))}
</style></head><body><div class="crest">${logoArt()}</div></body></html>`;

const banner = (img, hw) => `<!doctype html><html><head>${FONTS}<style>${BASE}
body{position:relative;background:#07060a url(${img}) center 42%/cover}
.shade{position:absolute;inset:0;background:linear-gradient(90deg,rgba(7,6,10,.1) 0%,rgba(7,6,10,.5) 26%,rgba(7,6,10,.88) 44%,rgba(7,6,10,.94) 100%),linear-gradient(0deg,rgba(7,6,10,.7),transparent 40%)}
.copy{position:absolute;left:560px;top:50%;transform:translateY(-50%);display:flex;align-items:center;gap:28px}
.crest{width:136px;height:136px;flex:none}
.crest svg{filter:drop-shadow(0 0 18px rgba(255,120,40,.6))}
h1{font:900 76px/1 Cinzel,serif;letter-spacing:.06em;background:linear-gradient(180deg,#fff6dc 18%,${hw ? '#ffb04a 58%,#b8501a' : '#e8bf6a 60%,#a8742e'});-webkit-background-clip:text;background-clip:text;color:transparent;filter:drop-shadow(0 4px 18px rgba(0,0,0,.7))}
p{margin-top:14px;font:700 24px 'Barlow Semi Condensed',sans-serif;letter-spacing:.3em;text-transform:uppercase;color:#efe6d6}
p b{color:${hw ? '#ffa64a' : '#e8bf6a'}}
small{display:block;margin-top:16px;font:700 20px 'Barlow Semi Condensed',sans-serif;letter-spacing:.2em;text-transform:uppercase;color:#a39580}
</style></head><body><div class="shade"></div><div class="copy"><div class="crest">${logoArt()}</div>
<div><h1>FANGBOUND</h1><p>Summon. <b>${hw ? 'Haunt.' : 'Clash.'}</b> Conquer.</p><small>fangbound.com · $FANG on Solana</small></div></div></body></html>`;

const jobs = [
  ['fang-token-1000.png', 1000, 1000, mark(1000, 0.74)],
  ['x-avatar-400.png', 400, 400, mark(400, 0.72)],
  ['x-banner-1500x500.png', 1500, 500, banner(still('hero-wide.jpg'), false)],
  ['x-banner-hw-1500x500.png', 1500, 500, banner(still('hero-hw-wide.jpg'), true)],
];

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--force-color-profile=srgb', '--hide-scrollbars'] });
try {
  for (const [file, width, height, html] of jobs) {
    const page = await browser.newPage();
    await page.setViewport({ width, height, deviceScaleFactor: 1 });
    await page.setContent(html, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: path.join(out, file), type: 'png' });
    await page.close();
    console.log(`brand/out/${file}`);
  }
} finally {
  await browser.close();
}
