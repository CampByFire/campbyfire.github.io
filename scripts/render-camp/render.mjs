// Снимает картинки лагеря: node render.mjs [preview [day|evening|night ...] | points | bbox <файлы>]
// Пишет public/camp/*.webp и src/scene/camp.json в приложении.
import { createServer } from 'node:http';
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { chromium } from 'playwright-core';
import sharp from 'sharp';

const HERE = import.meta.dirname;
const APP = join(HERE, '..', '..');
const OUT_DIR = join(APP, 'public', 'camp');
const MANIFEST = join(APP, 'src', 'scene', 'camp.json');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.bin': 'application/octet-stream', '.gltf': 'model/gltf+json', '.glb': 'model/gltf-binary' };

function serve() {
  const server = createServer((req, res) => {
    const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^([/\\])+/, '');
    const file = join(HERE, path === '' ? 'scene/index.html' : path);
    if (!file.startsWith(HERE)) return res.writeHead(403).end();
    try {
      const st = statSync(file);
      const f = st.isDirectory() ? join(file, 'index.html') : file;
      res.writeHead(200, { 'content-type': TYPES[extname(f)] ?? 'application/octet-stream' });
      res.end(readFileSync(f));
    } catch {
      res.writeHead(404).end();
    }
  });
  return new Promise((ok) => server.listen(0, '127.0.0.1', () => ok(server)));
}

function png(dataUrl) {
  return Buffer.from(dataUrl.split(',')[1], 'base64');
}

/** Обрезает прозрачные края; возвращает прямоугольник в координатах полной картинки. */
async function crop(buf) {
  const img = sharp(buf);
  const { info } = await img.clone().trim({ threshold: 1 }).toBuffer({ resolveWithObject: true });
  const x = -(info.trimOffsetLeft ?? 0);
  const y = -(info.trimOffsetTop ?? 0);
  const pad = 2;
  const meta = await sharp(buf).metadata();
  const left = Math.max(0, x - pad);
  const top = Math.max(0, y - pad);
  const w = Math.min(meta.width - left, info.width + pad * 2);
  const h = Math.min(meta.height - top, info.height + pad * 2);
  const out = await sharp(buf).extract({ left, top, width: w, height: h }).webp({ quality: 88, alphaQuality: 95 }).toBuffer();
  return { out, x: left, y: top, w, h };
}

const server = await serve();
const url = `http://127.0.0.1:${server.address().port}/scene/index.html`;
/** Нужен Chrome или Edge с компьютера; путь к другому Chromium можно задать в переменной CHROMIUM. */
async function launch() {
  const args = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
  if (process.env.CHROMIUM) return chromium.launch({ executablePath: process.env.CHROMIUM, args });
  for (const channel of ['chrome', 'msedge']) {
    try {
      return await chromium.launch({ channel, args });
    } catch {
      // нет такого браузера, пробуем следующий
    }
  }
  throw new Error('Не нашёл Chrome или Edge. Укажи путь к браузеру в переменной CHROMIUM.');
}

const browser = await launch();
const page = await browser.newPage({ viewport: { width: 800, height: 860 } });
page.on('console', (m) => console.log('[page]', m.text()));
page.on('pageerror', (e) => console.error('[page error]', e));
await page.goto(url);
await page.evaluate(() => window.camp.ready);

const mode = process.argv[2] ?? 'all';

if (mode === 'bbox') {
  for (const f of process.argv.slice(3)) {
    const r = await page.evaluate((u) => window.camp.bbox(u), f);
    console.log(f.split('/').pop(), r.min.map((v) => v.toFixed(2)).join(','), '|', r.max.map((v) => v.toFixed(2)).join(','));
  }
  await browser.close();
  server.close();
  process.exit(0);
}

if (mode === 'preview') {
  const outDir = join(HERE, 'out');
  mkdirSync(outDir, { recursive: true });
  const figs = [
    ['ring', 'mage', 'work'],
    ['seat0', 'rogue-b', 'sit'],
    ['seat1', 'barbarian-c', 'sit'],
    ['seat2', 'knight-b', 'sit'],
    ['seat3', 'rogue-c', 'sit'],
    ['seat4', 'mage-b', 'sit'],
    ['seat5', 'barbarian-b', 'sit'],
    ['road0', 'skeleton-minion', 'stand'],
    ['road1', 'skeleton-warrior', 'stand'],
    ['road2', 'skeleton-mage', 'stand'],
  ];
  const lights = process.argv.length > 3 ? process.argv.slice(3) : ['day', 'evening', 'night'];
  for (const light of lights) {
    // Ночью отряд спит, как в приложении.
    const f = light === 'night' ? figs.map(([s, w, p]) => [s, w, s.startsWith('seat') ? 'lie' : p]) : figs;
    const d = await page.evaluate(([l, ff]) => window.camp.renderPreview(l, ff), [light, f]);
    writeFileSync(join(outDir, `preview-${light}.png`), png(d));
    console.log('preview', light);
  }
  await browser.close();
  server.close();
  process.exit(0);
}

/** Точки сцены в пикселях картинки: костёр, сундук, вестник и места фигур. */
async function points(manifest) {
  const P = (x, y, z) => page.evaluate(([a, b, c]) => window.camp.project(a, b, c), [x, y, z]);
  const spots = await page.evaluate(() => window.camp.spots);
  const chest = await page.evaluate(() => window.camp.chest);
  const messenger = await page.evaluate(() => window.camp.messenger);
  manifest.fire = await P(0, 0.2, 0);
  manifest.chest = await P(chest[0], 0.9, chest[1]);
  // Письма лежат у столба вестника, кнопка встаёт у его подножия.
  manifest.messenger = await P(messenger[0] + 0.45, 0.75, messenger[1] + 0.3);
  manifest.spots = {};
  for (const [k, [x, z]] of Object.entries(spots)) manifest.spots[k] = await P(x, 0, z);
}

if (mode === 'probe') {
  for (const a of process.argv.slice(3)) {
    const [x, y, z] = a.split(',').map(Number);
    console.log(a, '->', JSON.stringify(await page.evaluate(([p, q, r]) => window.camp.project(p, q, r), [x, y, z])));
  }
  await browser.close();
  server.close();
  process.exit(0);
}

if (mode === 'points') {
  const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
  await points(manifest);
  writeFileSync(MANIFEST, JSON.stringify(manifest, null, 1) + '\n');
  console.log('Точки обновлены:', JSON.stringify(manifest.spots));
  await browser.close();
  server.close();
  process.exit(0);
}

mkdirSync(OUT_DIR, { recursive: true });
// version попадает в адреса картинок: после новой съёмки телефон не покажет старые из кэша.
const manifest = { version: Date.now().toString(36), size: [780, 840], backgrounds: {}, layers: {}, spots: {}, sprites: {} };
await points(manifest);

for (const light of ['day', 'evening', 'night']) {
  const bg = png(await page.evaluate((l) => window.camp.renderBackground(l), light));
  const file = `bg-${light}.webp`;
  await sharp(bg).webp({ quality: 82 }).toFile(join(OUT_DIR, file));
  manifest.backgrounds[light] = file;
  const fire = await crop(png(await page.evaluate((l) => window.camp.renderFire(l), light)));
  const ff = `fire-${light}.webp`;
  writeFileSync(join(OUT_DIR, ff), fire.out);
  manifest.layers[`fire/${light}`] = { file: ff, x: fire.x, y: fire.y, w: fire.w, h: fire.h };
  console.log('background', light);
}

// Герои со всеми обликами: «rogue», «rogue-b», «rogue-c» и так далее.
const heroes = await page.evaluate(() => window.camp.heroes);
const jobs = [];
for (const c of heroes) {
  for (const pose of ['work', 'sit', 'cheer']) jobs.push(['ring', c, pose, 'day']);
  for (let i = 0; i < 6; i++) {
    jobs.push([`seat${i}`, c, 'sit', 'day']);
    jobs.push([`seat${i}`, c, 'lie', 'night']);
  }
}
for (const rank of ['minion', 'rogue', 'warrior', 'mage']) {
  for (let i = 0; i < 3; i++) jobs.push([`road${i}`, `skeleton-${rank}`, 'stand', 'day']);
}

for (const [spot, who, pose, light] of jobs) {
  const d = await page.evaluate((j) => window.camp.renderSprite(...j), [spot, who, pose, light]);
  const c = await crop(png(d.url));
  const file = `${spot}-${who}-${pose}.webp`;
  writeFileSync(join(OUT_DIR, file), c.out);
  // Плащ героя отдельным белым слоем: приложение красит его в цвет похода.
  let cape;
  if (d.cape) {
    const k = await crop(png(d.cape));
    const cf = `${spot}-${who}-${pose}-cape.webp`;
    writeFileSync(join(OUT_DIR, cf), k.out);
    cape = { file: cf, x: k.x, y: k.y, w: k.w, h: k.h };
  }
  manifest.sprites[`${spot}/${who}/${pose}`] = { file, x: c.x, y: c.y, w: c.w, h: c.h, head: d.head, ...(light === 'night' ? { lit: true } : {}), ...(cape ? { cape } : {}) };
  process.stdout.write('.');
}
console.log();
writeFileSync(MANIFEST, JSON.stringify(manifest, null, 1) + '\n');
console.log('Готово:', jobs.length, 'фигур, манифест', MANIFEST);
await browser.close();
server.close();
