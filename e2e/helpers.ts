/// <reference types="node" />
// Общее для автотестов экранов: открыть игру в нужный момент, войти по паролю, если сайт собран с ним.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { expect, type Locator, type Page } from '@playwright/test';

/** Сайт собран с паролем: тогда перед игрой страница входа. */
export const LOCKED = readFileSync(new URL('../dist/index.html', import.meta.url), 'utf8').includes('id="lock"');

const pad = (n: number) => String(n).padStart(2, '0');

/** Момент по Москве (в браузере тестов тот же пояс). По умолчанию пятница, 23 октября 2026, рабочий день. */
export const at = (h: number, m = 0, day = 23) => new Date(`2026-10-${pad(day)}T${pad(h)}:${pad(m)}:00+03:00`);

/**
 * Открыть игру. Часы браузера ставятся на time и дальше идут сами. Без intro знакомство считается
 * пройденным, а копия в файл сделанной, чтобы над меню не было подсказок.
 */
export async function openGame(page: Page, { time = at(9), intro = false }: { time?: Date; intro?: boolean } = {}) {
  await page.clock.install({ time });
  if (!intro) {
    await page.addInitScript(() => {
      const key = 'taskcraft-lager-device';
      if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify({ firstSeen: Date.now(), backupAt: Date.now(), introDone: true, quiet: {} }));
    });
  }
  await page.goto('./');
  await unlock(page);
}

/** Ввести пароль сайта, если спрашивают. Пароль запоминается, после перезагрузки его уже не спросят. */
export async function unlock(page: Page) {
  const app = page.locator('.app');
  if (!LOCKED) return expect(app).toBeVisible();
  const form = page.locator('#lock-form');
  await expect(form.or(app)).toBeVisible();
  if (await app.isVisible()) return;
  const password = process.env.LAGER_PASSWORD;
  if (!password) throw new Error('Сайт в dist/ собран с паролем: задай LAGER_PASSWORD, чтобы тесты могли войти');
  await page.getByLabel('Пароль').fill(password);
  await page.getByRole('button', { name: 'Войти' }).click();
  await expect(app).toBeVisible();
}

/** Кнопка меню внизу экрана. */
export const tab = (page: Page, name: string): Locator => page.getByRole('navigation', { name: 'Разделы' }).getByRole('button', { name, exact: true });

/** Открыть Настройки: шестерёнка в верхней полосе Лагеря. */
export async function openSettings(page: Page) {
  const nav = page.getByRole('navigation', { name: 'Разделы' });
  await nav.getByRole('button', { name: 'Лагерь', exact: true }).click();
  await page.locator('.topbar').getByRole('button', { name: 'Настройки', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Настройки' })).toBeVisible();
}

/** Всплывающее сообщение внизу экрана. */
export const toast = (page: Page): Locator => page.locator('.toast');

/** Открытый лист (окно поверх экрана) с этим заголовком. */
export const sheet = (page: Page, name: string): Locator => page.getByRole('dialog', { name });

/** Добавить задачу через большой «+» внизу. */
export async function addTask(
  page: Page,
  title: string,
  { quest, size, repeat, weekday }: { quest?: string; size?: string; repeat?: string; weekday?: string } = {},
) {
  await tab(page, 'Добавить задачу').click();
  const form = sheet(page, 'Новая задача');
  await form.getByLabel('Что сделать').fill(title);
  if (quest) await form.getByRole('radiogroup', { name: 'Сфера или проект' }).getByRole('radio', { name: quest }).click();
  if (size) await form.getByRole('radiogroup', { name: 'Сколько займёт' }).getByRole('radio', { name: size, exact: true }).click();
  if (repeat) await form.getByRole('radiogroup', { name: 'Повторять' }).getByRole('radio', { name: repeat }).click();
  if (weekday) await form.getByRole('radiogroup', { name: 'В какой день недели' }).getByRole('radio', { name: weekday }).click();
  await form.getByRole('button', { name: /^(Взять в отряд|Отдать вестнику)$/ }).click();
  await expect(form).toBeHidden();
}

/** Перевести часы игры. Игра замечает новое время на следующем тике, раз в секунду. */
export async function setTime(page: Page, time: Date) {
  await page.clock.setSystemTime(time);
  await page.clock.runFor(1100);
}

const AXE = readFileSync(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8');

/** Нарушения WCAG 2.2 AA и лучших практик на странице как есть, по axe. Пустой список, если всё чисто. */
export async function axe(page: Page): Promise<string[]> {
  await page.evaluate(AXE);
  return page.evaluate(async () => {
    const tags = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];
    const res = await (window as unknown as { axe: { run: (c: Document, o: object) => Promise<{ violations: { id: string; nodes: { target: string[] }[] }[] }> } }).axe.run(document, {
      runOnly: { type: 'tag', values: tags },
    });
    return res.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
  });
}

/** Ничего не вылезает за ширину экрана. */
export async function expectNoSideScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, 'страница шире экрана').toBeLessThanOrEqual(0);
}

/** Что умеет поддельный GitHub: нет сети, токен перестал работать, обычная работа. */
export type GitHubMode = 'ok' | 'down' | 'expired';

/**
 * Поддельный GitHub вместо api.github.com: приватный репозиторий igor/lager-data с файлом
 * game/save.json (content это его текст, sha меняется при каждой записи) и токены с владельцами.
 * Токен good в режиме expired GitHub больше не принимает, fresh того же аккаунта годится всегда.
 */
export async function fakeGitHub(page: Page) {
  const gh = {
    mode: 'ok' as GitHubMode,
    content: null as string | null,
    sha: 0,
    tokens: { good: 'igor', fresh: 'igor' } as Record<string, string>,
    /** Файлы Летописи в notes/ и diary/: путь, текст и sha. */
    notes: new Map<string, { text: string; sha: string }>(),
  };
  let blob = 0;
  const SAVE = '/repos/igor/lager-data/contents/game/save.json';
  const b64 = (text: string) => Buffer.from(text, 'utf8').toString('base64');
  await page.route('https://api.github.com/**', async (route) => {
    const req = route.request();
    if (gh.mode === 'down') return route.abort('internetdisconnected');
    const token = (req.headers().authorization ?? '').replace('Bearer ', '');
    const login = gh.mode === 'expired' && token === 'good' ? undefined : gh.tokens[token];
    const headers = { 'access-control-allow-origin': '*' };
    const json = (body: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', headers, body: JSON.stringify(body) });
    if (!login) return json({ message: 'Bad credentials' }, 401);
    const path = new URL(req.url()).pathname;
    const method = req.method();
    const body = JSON.parse(req.postData() ?? '{}');
    if (path === '/user') return json({ login });
    if (path === '/repos/igor/lager-data') return json({ full_name: 'igor/lager-data', name: 'lager-data', private: true, default_branch: 'main' });
    if (path === SAVE && method === 'GET') return gh.content === null ? json({ message: 'Not Found' }, 404) : json({ sha: `s${gh.sha}`, content: b64(gh.content), encoding: 'base64' });
    if (path === SAVE && method === 'PUT') {
      if (gh.content !== null && body.sha !== `s${gh.sha}`) return json({ message: 'conflict' }, gh.content !== null && !body.sha ? 422 : 409);
      gh.content = Buffer.from(body.content, 'base64').toString('utf8');
      gh.sha += 1;
      return json({ content: { sha: `s${gh.sha}` } });
    }
    // Заметки Летописи: список файлов деревом, текст по sha, запись и удаление через Contents API.
    if (path === '/repos/igor/lager-data/git/trees/main') {
      return json({ sha: 't', truncated: false, tree: [...gh.notes].map(([p, f]) => ({ path: p, type: 'blob', sha: f.sha })) });
    }
    const blobSha = path.match(/^\/repos\/igor\/lager-data\/git\/blobs\/(.+)$/)?.[1];
    if (blobSha) {
      const f = [...gh.notes.values()].find((x) => x.sha === blobSha);
      return f ? json({ sha: blobSha, content: b64(f.text), encoding: 'base64' }) : json({ message: 'Not Found' }, 404);
    }
    const note = path.match(/^\/repos\/igor\/lager-data\/contents\/((?:notes|diary)\/.+)$/)?.[1];
    if (note) {
      const p = note.split('/').map(decodeURIComponent).join('/');
      const f = gh.notes.get(p);
      if (method === 'PUT') {
        if (f && body.sha !== f.sha) return json({ message: 'conflict' }, body.sha ? 409 : 422);
        const sha = `n${++blob}`;
        gh.notes.set(p, { text: Buffer.from(body.content, 'base64').toString('utf8'), sha });
        return json({ content: { sha } });
      }
      if (method === 'DELETE') {
        if (!f) return json({ message: 'Not Found' }, 404);
        gh.notes.delete(p);
        return json({ commit: {} });
      }
    }
    if (path === SAVE && method === 'DELETE') {
      if (gh.content === null) return json({ message: 'Not Found' }, 404);
      gh.content = null;
      return json({ commit: {} });
    }
    return json({ message: 'Not Found' }, 404);
  });
  return gh;
}

/** Подключить GitHub в Настройках токеном good. */
export async function connectGitHub(page: Page) {
  await openSettings(page);
  await page.getByLabel('Токен GitHub').fill('good');
  await page.getByRole('button', { name: 'Подключить' }).click();
  await expect(toast(page)).toHaveText('GitHub подключён');
}

/**
 * Положить готовую игру в браузер до первого запуска страницы: так можно начать с просроченными задачами
 * или с давним последним действием. Только один раз, перезагрузка открывает то, что игра сохранила сама.
 */
export async function seedGame(page: Page, state: unknown) {
  await page.addInitScript((json) => {
    if (sessionStorage.getItem('e2e-seeded')) return;
    sessionStorage.setItem('e2e-seeded', '1');
    localStorage.setItem('taskcraft-lager-v1', json);
  }, JSON.stringify(state));
}

/** Летопись: новый раздел ленты, он сразу открывается. */
export async function newSection(page: Page, title: string) {
  await tab(page, 'Летопись').click();
  await page.getByRole('button', { name: 'Новый раздел' }).click();
  const make = sheet(page, 'Новый раздел');
  await make.getByLabel('Название').fill(title);
  await make.getByRole('button', { name: 'Создать' }).click();
  await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
}

/** Летопись: новая папка там, где сейчас открыт раздел или папка. */
export async function newFolder(page: Page, title: string) {
  await page.getByRole('button', { name: 'Новая папка' }).click();
  const form = sheet(page, 'Новая папка');
  await form.getByLabel('Название').fill(title);
  await form.getByRole('button', { name: 'Создать' }).click();
  await expect(form).toBeHidden();
}

/** Летопись: запись в поле ленты открытого раздела или папки. */
export async function write(page: Page, text: string) {
  // Через .screen: пока страница сменяется, её тающая копия тоже на экране.
  await page.locator('.screen').getByLabel('Новая запись').fill(text);
  await page.locator('.screen').getByRole('button', { name: 'Записать', exact: true }).click();
  await expect(page.getByRole('button', { name: new RegExp(text) })).toBeVisible();
}
