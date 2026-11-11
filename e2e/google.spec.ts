// Напоминания через Google Календарь: вход, обновление календаря, «Войти снова» и отключение. Google поддельный.
import { expect, test, type Page } from '@playwright/test';
import { at, axe, fakeGoogle, openGame, openSettings, setTime, sheet, tab, toast } from './helpers';

async function addTimed(page: Page, title: string, time: string) {
  await tab(page, 'Добавить задачу').click();
  const form = sheet(page, 'Новая задача');
  await form.getByLabel('Что сделать').fill(title);
  await form.getByRole('radiogroup', { name: 'Сфера или проект' }).getByRole('radio', { name: 'Работа' }).click();
  await form.getByLabel('Во сколько').fill(time);
  await form.getByRole('button', { name: 'Взять в отряд' }).click();
  await expect(form).toBeHidden();
}

const panel = (page: Page) => page.locator('.sync').filter({ has: page.getByRole('heading', { name: 'Google Календарь' }) });

test('Google Календарь: подключение, обновление, вход снова и отключение', async ({ page }) => {
  const g = await fakeGoogle(page);
  await openGame(page, { time: at(9) });
  await addTimed(page, 'Позвонить маме', '19:00');

  await openSettings(page);
  const google = panel(page);
  const connect = google.getByRole('button', { name: 'Подключить Google Календарь' });
  const key = google.getByLabel('Ключ Google (Client ID)');
  // Если сайт собран с ключом (LAGER_GOOGLE_CLIENT_ID), поля для ключа нет и кнопка доступна сразу.
  const builtIn = (await key.count()) === 0;
  if (!builtIn) {
    await expect(connect).toBeDisabled();
    await key.fill('test-key.apps.googleusercontent.com');
  }
  await expect(connect).toBeEnabled();
  expect(await axe(page), 'Google Календарь до подключения').toEqual([]);

  // Вход: Google возвращает на Лагерь, и Лагерь сам открывает Настройки.
  await connect.click();
  await expect(toast(page)).toHaveText('Google Календарь подключён');
  await expect(page.getByRole('heading', { level: 1, name: 'Настройки' })).toBeVisible();
  expect(page.url()).not.toContain('access_token');
  const login = g.logins[0];
  if (!builtIn) expect(login.searchParams.get('client_id')).toBe('test-key.apps.googleusercontent.com');
  expect(login.searchParams.get('scope')).toBe('https://www.googleapis.com/auth/calendar.app.created');
  expect(login.searchParams.get('redirect_uri')).toBe('http://localhost:4173/');
  await expect(panel(page)).toContainText('В календаре 2 события Лагеря');
  expect(g.live()).toEqual(['Позвонить маме', 'Разжечь костёр']);
  expect(await axe(page), 'Google Календарь подключён').toEqual([]);

  // Утренний костёр не нужен: из Google он уходит сам.
  const remind = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Напоминания' }) });
  await remind.getByRole('radiogroup', { name: 'Утренний костёр' }).getByRole('radio', { name: 'Не нужен' }).click();
  await expect(panel(page)).toContainText('В календаре 1 событие Лагеря');
  expect(g.live()).toEqual(['Позвонить маме']);

  // Прошло полтора часа: вход кончился, новое ждёт.
  await setTime(page, at(10, 30));
  await addTimed(page, 'Созвон', '18:00');
  await tab(page, 'Лагерь').click();
  const notice = page.locator('.notice');
  await expect(notice).toContainText('Новые напоминания ждут входа в Google');
  expect(g.live()).toEqual(['Позвонить маме']);
  await openSettings(page);
  await expect(panel(page)).toContainText('Нужно войти снова');
  await panel(page).getByRole('button', { name: 'Войти снова' }).click();
  await expect(toast(page)).toHaveText('Google Календарь подключён');
  await expect(panel(page)).toContainText('В календаре 2 события Лагеря');
  expect(g.live()).toEqual(['Позвонить маме', 'Созвон']);

  // Отключить и удалить календарь.
  await panel(page).getByRole('button', { name: 'Отключить' }).click();
  expect(await axe(page), 'Отключение Google Календаря').toEqual([]);
  await panel(page).getByRole('button', { name: 'Отключить и удалить календарь' }).click();
  await expect(toast(page)).toHaveText('Google отключён, календарь «Лагерь» удалён');
  expect(g.cals.size).toBe(0);
  await expect(panel(page).getByRole('button', { name: 'Подключить Google Календарь' })).toBeEnabled();
});

test('отменённый вход в Google ничего не подключает', async ({ page }) => {
  await page.route('https://accounts.google.com/**', async (route) => {
    const q = new URL(route.request().url()).searchParams;
    await route.fulfill({ status: 302, headers: { location: `${q.get('redirect_uri')}#error=access_denied&state=${q.get('state')}` } });
  });
  await openGame(page, { time: at(9) });
  await openSettings(page);
  const key = panel(page).getByLabel('Ключ Google (Client ID)');
  const builtIn = (await key.count()) === 0;
  if (!builtIn) await key.fill('test-key.apps.googleusercontent.com');
  await panel(page).getByRole('button', { name: 'Подключить Google Календарь' }).click();
  await expect(toast(page)).toHaveText('Google Календарь не подключён: вход отменили');
  // Ключ запомнился, подключить можно ещё раз.
  if (!builtIn) await expect(key).toHaveValue('test-key.apps.googleusercontent.com');
  await expect(panel(page).getByRole('button', { name: 'Подключить Google Календарь' })).toBeEnabled();
});
