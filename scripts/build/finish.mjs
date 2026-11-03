// Последний шаг сборки (после vite build), всё в dist/:
// 1. Если задан пароль (переменная LAGER_PASSWORD), шифрует код игры и ставит на страницу замок.
// 2. Вписывает в страницу Content-Security-Policy.
// 3. Собирает service worker со списком всех файлов, чтобы игра работала без сети.
//
// На GitHub Actions без пароля сборка падает, чтобы сайт не вышел открытым по ошибке.
// Открытый сайт там можно собрать только явно: LAGER_PUBLIC=1.
import { createCipheriv, createHash, pbkdf2Sync, randomBytes } from 'node:crypto';
import { readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const dist = fileURLToPath(new URL('../../dist/', import.meta.url));

/** Соль и итерации должны совпадать в шифровании и в замке. Если их поменять, всем придётся ввести пароль заново. */
const SALT = 'taskcraft-lager/1';
const ITERATIONS = 600_000;

const password = (process.env.LAGER_PASSWORD ?? '').trim().normalize('NFC');
if (!password && process.env.GITHUB_ACTIONS === 'true' && process.env.LAGER_PUBLIC !== '1') {
  console.error(
    'Нет пароля для сайта. Добавь секрет LAGER_PASSWORD: Settings → Secrets and variables → Actions → New repository secret.',
  );
  process.exit(1);
}

/** Стили замка: страница с паролем показывается до того, как загрузится игра. */
const LOCK_STYLE = `    <style>
      .lock { position: fixed; inset: 0; z-index: 1000; display: flex; align-items: center; justify-content: center; padding: 24px;
        background: radial-gradient(120% 60% at 50% 0%, rgba(255, 154, 74, 0.16), transparent 70%), #211912;
        color: #f3ead8; font-family: 'Alegreya Sans', 'Segoe UI', system-ui, sans-serif; }
      .lock[hidden] { display: none; }
      .lock form { width: 100%; max-width: 340px; text-align: center; }
      .lock fieldset { border: 0; margin: 0; padding: 0; }
      .lock img { border-radius: 18px; box-shadow: 0 8px 30px rgba(0, 0, 0, 0.5); }
      .lock h1 { margin: 16px 0 6px; font-family: 'Alegreya', Georgia, serif; font-size: 28px; color: #fbf3e2; }
      .lock p { margin: 0 0 18px; color: #c9b79a; font-size: 15px; line-height: 1.45; }
      .lock input[type='password'] { width: 100%; min-height: 48px; padding: 0 14px; border-radius: 12px; border: 1.5px solid rgba(255, 236, 200, 0.16);
        background: #17110c; color: #fbf3e2; font: inherit; font-size: 17px; }
      .lock input[type='password']:focus { outline: none; border-color: #f1c45a; }
      .lock label { display: flex; align-items: center; justify-content: center; gap: 8px; margin: 14px 0; color: #c9b79a; font-size: 15px; }
      .lock input[type='checkbox'] { width: 18px; height: 18px; accent-color: #f1c45a; }
      .lock button { width: 100%; min-height: 48px; border: 0; border-radius: 12px; background: #f1c45a; color: #2a1d10;
        font: inherit; font-size: 17px; font-weight: 800; box-shadow: 0 3px 0 #a8811f; cursor: pointer; }
      .lock button:disabled { opacity: 0.6; }
      .lock .lock-msg { min-height: 22px; margin: 12px 0 0; color: #ffa194; font-weight: 700; }
      .lock-icon { position: relative; display: grid; place-items: center; width: 132px; height: 132px; margin: 0 auto; }
      .lock-icon img { position: relative; }
      .lock-seal { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; color: #f1c45a;
        transition: color 300ms ease, opacity 300ms ease; }
      .lock-seal * { fill: none; stroke: currentColor; stroke-width: 2.6; stroke-linecap: round; stroke-linejoin: round; }
      .lock-seal .seal-glow { stroke-width: 8; opacity: 0.22; }
      .lock.is-wrong .lock-seal { color: #ff7b6b; opacity: 0.75; }
      .lock[data-motion='full'] .seal-c { stroke-dasharray: 100; stroke-dashoffset: 100; animation: seal-draw 900ms cubic-bezier(.2, .7, .2, 1) 100ms forwards; }
      .lock[data-motion='full'] .seal-rune { opacity: 0; animation: seal-rune 320ms ease-out forwards; animation-delay: calc(450ms + var(--i) * 55ms); }
      .lock[data-motion='full'] .seal-spin { animation: seal-spin 60s linear infinite; }
      .lock[data-motion='full'].is-busy .seal-spin { animation-duration: 3s; }
      .lock[data-motion='full'].is-busy .lock-seal { animation: seal-pulse 900ms ease-in-out infinite alternate; }
      .lock[data-motion='full'].is-wrong .lock-icon { animation: seal-shake 380ms ease-out; }
      .lock[data-motion='full'] .lock-msg.is-new { animation: msg-in 260ms ease-out; }
      .lock[data-motion='full'].is-open .lock-seal { animation: seal-open 520ms ease-out forwards; }
      .lock[data-motion='full'].is-open { animation: lock-out 420ms ease-in 220ms forwards; }
      .lock[data-motion='calm'] .lock-seal { animation: lock-in 500ms ease-out; }
      .lock[data-motion='calm'] .lock-msg.is-new { animation: lock-in 260ms ease-out; }
      .lock[data-motion='calm'].is-open { animation: lock-out 380ms ease-in forwards; }
      .lock[data-motion='off'] .lock-seal { transition: none; }
      .lock.is-open { pointer-events: none; }
      @keyframes seal-draw { to { stroke-dashoffset: 0; } }
      @keyframes seal-rune { from { opacity: 0; } 60% { opacity: 1; filter: drop-shadow(0 0 4px #ffe7a0); } to { opacity: 1; } }
      @keyframes seal-spin { to { transform: rotate(360deg); } }
      @keyframes seal-pulse { from { filter: drop-shadow(0 0 0 rgba(241, 196, 90, 0)); } to { filter: drop-shadow(0 0 8px rgba(241, 196, 90, 0.9)); } }
      @keyframes seal-shake { 0%, 100% { transform: translateX(0); } 20% { transform: translateX(-7px); } 45% { transform: translateX(6px); } 70% { transform: translateX(-3px); } }
      @keyframes msg-in { from { opacity: 0; transform: translateY(-6px); } }
      @keyframes seal-open { 0% { transform: scale(1); filter: brightness(1); } 35% { transform: scale(1.12); filter: brightness(2) drop-shadow(0 0 14px #ffe7a0); opacity: 1; } 100% { transform: scale(1.7); filter: brightness(2.4); opacity: 0; } }
      @keyframes lock-in { from { opacity: 0; } }
      @keyframes lock-out { to { opacity: 0; } }
      .lock-fail { margin: 40px 24px; color: #ffa194; font-family: system-ui, sans-serif; text-align: center; }
    </style>
`;

// Руны печати те же, что в кругах призыва в игре.
const RUNES = [
  'M5 0V14M5 0L0 5M5 0L10 5',
  'M5 0V14M5 6L0 0M5 6L10 0',
  'M2 0V14M2 3L9 0M2 7L9 4',
  'M2 0V14M2 0L8 3L2 7L8 14',
  'M5 0L10 5L5 10L0 5ZM2.5 7.5L0 14M7.5 7.5L10 14',
  'M0 0V14M10 0V14M0 0L10 14M10 0L0 14',
  'M2 0V14M2 0L9 4M2 5L9 9',
  'M1 0V14M9 0V14M1 0L9 7M9 0L1 7',
  'M8 0L2 5L8 9L2 14',
  'M5 0V14',
  'M8 0L2 7L8 14',
  'M2 0V14M2 0L8 3.5L2 7L8 10.5L2 14',
];

/** Печать вокруг значка: два круга и кольцо рун. Только украшение, диктор её не слышит. */
function sealSVG() {
  const runes = RUNES.map((d, i) => `<path class="seal-rune" style="--i:${i}" d="${d}" transform="rotate(${i * 30}) translate(-5 -88)"/>`).join('');
  return `<svg class="lock-seal" viewBox="-100 -100 200 200" aria-hidden="true" focusable="false"><g class="seal-glow"><circle r="96" pathLength="100" class="seal-c"/><circle r="72" pathLength="100" class="seal-c"/></g><g class="seal-spin"><circle r="96" pathLength="100" class="seal-c"/><circle r="72" pathLength="100" class="seal-c"/>${runes}</g></svg>`;
}

/** Форма пароля. Пока замок проверяет запомненный ключ, она скрыта. */
const LOCK_FORM = `    <main id="lock" class="lock" hidden>
      <form id="lock-form">
        <fieldset>
          <div class="lock-icon">
            ${sealSVG()}
            <img src="./icons/icon-192.png" alt="" width="76" height="76" />
          </div>
          <h1>Лагерь у костра</h1>
          <p>Сайт закрыт паролем. Его знает тот, кто дал тебе ссылку.</p>
          <input id="lock-pass" type="password" autocomplete="current-password" placeholder="Пароль" aria-label="Пароль" />
          <label><input id="lock-keep" type="checkbox" checked /> Запомнить на этом устройстве</label>
          <button id="lock-btn" type="submit">Войти</button>
          <p id="lock-msg" class="lock-msg" role="alert"></p>
        </fieldset>
      </form>
    </main>
`;

const hash = (data) => createHash('sha256').update(data).digest('hex').slice(0, 12);
const read = (path) => readFileSync(join(dist, path));
const write = (path, data) => writeFileSync(join(dist, path), data);

let html = read('index.html').toString();
const entry = html.match(/<script type="module" crossorigin src="\.\/(assets\/[^"]+\.js)"><\/script>\s*/);
if (!entry) throw new Error('В dist/index.html не нашёлся скрипт игры');

if (password) {
  const key = pbkdf2Sync(password, SALT, ITERATIONS, 32, 'sha256');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const body = Buffer.concat([iv, cipher.update(read(entry[1])), cipher.final(), cipher.getAuthTag()]);
  const appFile = `assets/app-${hash(body)}.bin`;
  write(appFile, body);
  rmSync(join(dist, entry[1]));

  const lock = readFileSync(join(here, 'lock.js'), 'utf8')
    .replace("'__SALT__'", JSON.stringify(SALT))
    .replace('__ITERATIONS__', String(ITERATIONS));
  const lockFile = `assets/lock-${hash(lock)}.js`;
  write(lockFile, lock);

  html = html.replace(entry[0], '').replace('  </head>', `${LOCK_STYLE}  </head>`);
  html = html.replace('  </body>', `${LOCK_FORM}    <script src="./${lockFile}" data-app="./${appFile}"></script>\n  </body>`);
  console.log(`Замок поставлен: ${appFile}`);
} else {
  console.log('LAGER_PASSWORD не задан: сайт собран без пароля.');
}

const csp = [
  "default-src 'self'",
  `script-src 'self'${password ? ' blob:' : ''}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self' https://api.github.com https://gist.githubusercontent.com",
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
