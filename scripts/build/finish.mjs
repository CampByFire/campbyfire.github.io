// Последний шаг сборки (после vite build), всё в dist/:
// 1. Вписывает в страницу Content-Security-Policy.
// 2. Собирает service worker со списком всех файлов, чтобы игра работала без сети.
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const dist = fileURLToPath(new URL('../../dist/', import.meta.url));

const hash = (data) => createHash('sha256').update(data).digest('hex').slice(0, 12);
const read = (path) => readFileSync(join(dist, path));
const write = (path, data) => writeFileSync(join(dist, path), data);

let html = read('index.html').toString();

const csp = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self' https://api.github.com",
  "worker-src 'self'",
  "manifest-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join('; ');
html = html.replace('<meta charset="utf-8" />', `<meta charset="utf-8" />\n    <meta http-equiv="Content-Security-Policy" content="${csp}" />`);
write('index.html', html);

// Service worker: все файлы сборки, кроме старого формата шрифтов (.woff, нужен только очень старым браузерам).
const files = [];
(function walk(dir) {
  for (const name of readdirSync(dir).sort()) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full);
    else files.push(relative(dist, full).split(sep).join('/'));
  }
})(dist);
const cached = files.filter((f) => f !== 'sw.js' && f !== 'index.html' && !f.endsWith('.woff') && !f.endsWith('.map'));
const version = hash(Buffer.concat([read('index.html'), ...cached.map((f) => Buffer.concat([Buffer.from(f), read(f)]))]));
const list = ['./', ...cached.map((f) => `./${f}`)];
const sw = readFileSync(join(here, 'sw.js'), 'utf8')
  .replace("'__VERSION__'", JSON.stringify(version))
  .replace('__FILES__', JSON.stringify(list, null, 2));
write('sw.js', sw);
const size = cached.reduce((n, f) => n + statSync(join(dist, f)).size, 0);
console.log(`Работа без сети: ${list.length} файлов, ${(size / 1024 / 1024).toFixed(1)} МБ, версия ${version}`);
