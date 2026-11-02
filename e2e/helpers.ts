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
  if (quest) await form.getByRole('radiogroup', { name: 'Поход' }).getByRole('radio', { name: quest }).click();
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
 * Поддельный GitHub вместо api.github.com: один гист в памяти с историей версий и токены с владельцами.
 * Токен good в режиме expired GitHub больше не принимает, fresh того же аккаунта годится всегда.
 */
export async function fakeGitHub(page: Page) {
  const gh = { mode: 'ok' as GitHubMode, content: null as string | null, version: 1, tokens: { good: 'igor', fresh: 'igor' } as Record<string, string> };
  const FILE = 'taskcraft-lager.json';
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
    const history = () => [{ version: `v${gh.version}` }, ...(gh.version > 1 ? [{ version: `v${gh.version - 1}` }] : [])];
    if (path === '/user') return json({ login });
    if (path === '/gists' && method === 'GET') return json(gh.content ? [{ id: 'g1', updated_at: '2026-10-23T06:00:00Z', files: { [FILE]: {} } }] : []);
    if (path === '/gists' && method === 'POST') {
      gh.content = JSON.parse(req.postData() ?? '{}').files[FILE].content;
      return json({ id: 'g1' }, 201);
    }
    if (path === '/gists/g1' && !gh.content) return json({ message: 'Not Found' }, 404);
    if (path === '/gists/g1' && method === 'GET') return json({ files: { [FILE]: { content: gh.content, truncated: false } }, history: history() });
    if (path === '/gists/g1' && method === 'PATCH') {
      gh.content = JSON.parse(req.postData() ?? '{}').files[FILE].content;
      gh.version += 1;
      return json({ id: 'g1', history: history() });
    }
    if (path === '/gists/g1' && method === 'DELETE') {
      gh.content = null;
      return route.fulfill({ status: 204, headers });
    }
    return json({ message: 'Not Found' }, 404);
  });
  return gh;
}

/** Подключить GitHub в Летописи токеном good. */
export async function connectGitHub(page: Page) {
  await tab(page, 'Летопись').click();
  await page.getByLabel('Токен GitHub').fill('good');
  await page.getByRole('button', { name: 'Подключить' }).click();
  await expect(toast(page)).toHaveText('GitHub подключён');
}
