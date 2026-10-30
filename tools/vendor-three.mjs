// Copies the Three.js build and the addons the game uses into vendor/three, following
// each addon's relative imports, so the browser loads them without a bundler or CDN.
//   node tools/vendor-three.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.join(root, 'node_modules/three');
const out = path.join(root, 'vendor/three');
const ADDONS = [
  'postprocessing/EffectComposer.js',
  'postprocessing/RenderPass.js',
  'postprocessing/ShaderPass.js',
  'postprocessing/UnrealBloomPass.js',
  'postprocessing/OutputPass.js',
  'environments/RoomEnvironment.js',
  'utils/BufferGeometryUtils.js',
];

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
fs.copyFileSync(path.join(src, 'build/three.module.min.js'), path.join(out, 'three.module.js'));
fs.copyFileSync(path.join(src, 'LICENSE'), path.join(out, 'LICENSE'));

const seen = new Set();
function copy(rel) {
  if (seen.has(rel)) return;
  seen.add(rel);
  const from = path.join(src, 'examples/jsm', rel);
  const text = fs.readFileSync(from, 'utf8');
  const to = path.join(out, 'addons', rel);
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.writeFileSync(to, text);
  for (const m of text.matchAll(/from\s+'(\.{1,2}\/[^']+)'/g)) copy(path.posix.join(path.posix.dirname(rel), m[1]));
}
ADDONS.forEach(copy);
const version = JSON.parse(fs.readFileSync(path.join(src, 'package.json'), 'utf8')).version;
fs.writeFileSync(path.join(out, 'VERSION'), `${version}\n`);
console.log(`three ${version}: ${seen.size} addon files`);
