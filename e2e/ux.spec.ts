// Компактные разделы, порядок плана и сообщения над нижним действием.
import { expect, test, type Page } from '@playwright/test';
import { newState, addTask as addGameTask } from '../src/game/state';
import { addTask, at, axe, openGame, openSettings, seedGame, sheet, tab, toast } from './helpers';

test('настройки открываются отдельно, Назад возвращает фокус в список', async ({ page }) => {
  await openGame(page);
  await openSettings(page);
  await expect(page.getByLabel('Работа с')).toHaveCount(0);
  for (const part of ['Распорядок', 'Напоминания', 'Сохранение', 'Магия', 'Справка', 'Стереть']) {
    const button = page.getByRole('navigation', { name: 'Разделы настроек' }).getByRole('button', { name: part, exact: true });
    await button.click();
    await expect(page.getByRole('heading', { level: 1, name: part, exact: true })).toBeFocused();
    if (part === 'Сохранение') {
      const steps = page.locator('details').filter({ hasText: 'Как подключить GitHub' });
      await expect(steps).not.toHaveAttribute('open');
      await steps.locator('summary').click();
      await expect(steps.locator('.steps')).toBeVisible();
    }
    await page.goBack();
    await expect(button).toBeFocused();
  }
});

test('пояснения разделов доступны по вопросительному знаку', async ({ page }) => {
  await openGame(page);
  for (const name of ['Королевство', 'Летопись']) {
    await tab(page, name).click();
    const help = page.locator('.screen .page-heading .page-help');
    await expect(help).not.toHaveAttribute('open');
    await help.locator('summary').focus();
    await page.keyboard.press('Enter');
    await expect(help.locator('.note')).toBeVisible();
    expect(await axe(page), name).toEqual([]);
  }
  await openSettings(page);
  await page.getByRole('button', { name: 'В лавку' }).click();
  await expect(page.locator('.screen .page-help')).not.toHaveAttribute('open');
  await page.locator('.screen .page-help summary').click();
  expect(await axe(page), 'Справка Лавки').toEqual([]);
});

test('все пять горизонтов доступны вкладками и с клавиатуры', async ({ page }) => {
  await openGame(page);
  const tabs = page.getByRole('radiogroup', { name: 'Что собирать' });
  await expect(tabs.getByRole('radio')).toHaveCount(5);
  await tabs.getByRole('radio', { name: 'День', exact: true }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(tabs.getByRole('radio', { name: 'Неделя', exact: true })).toBeFocused();
  for (const period of ['Месяц', 'Квартал', 'Год']) {
    await page.keyboard.press('ArrowRight');
    await expect(tabs.getByRole('radio', { name: period, exact: true })).toBeFocused();
    await expect(tabs.getByRole('radio', { name: period, exact: true })).toBeChecked();
    expect(await axe(page), period).toEqual([]);
  }
  await tabs.getByRole('radio', { name: 'День', exact: true }).click();
  await expect(tabs.getByRole('radio', { name: 'День', exact: true })).toBeChecked();
});

async function plan(page: Page) {
  const now = at(9).getTime();
  const s = newState(now);
  for (const title of ['Первое дело', 'Второе дело', 'Третье дело']) addGameTask(s, now, { title, level: 1, day: s.day, questId: s.quests[0].id });
  await seedGame(page, s);
  await openGame(page);
  return page.locator('.plan-rows').first();
}

test('меню строки меняет порядок с клавиатуры и возвращает фокус', async ({ page }) => {
  const rows = await plan(page);
  const button = rows.getByRole('button', { name: 'Действия: Первое дело' });
  await button.focus();
  await page.keyboard.press('Enter');
  const menu = sheet(page, 'Действия задачи');
  await expect(menu.getByRole('button', { name: 'Выше', exact: true })).toBeDisabled();
  expect(await axe(page), 'Действия задачи').toEqual([]);
  await menu.getByRole('button', { name: 'Ниже', exact: true }).click();
  await expect(button).toBeFocused();
  await expect(rows.locator('.row-title')).toHaveText(['Второе дело', 'Первое дело', 'Третье дело']);
  await button.click();
  await expect.poll(async () => {
    const r = (await toast(page).boundingBox())!;
    const actions = (await menu.locator('.actions').boundingBox())!;
    return r.y + r.height - actions.y;
  }).toBeLessThanOrEqual(0);
  await menu.getByRole('button', { name: 'Не сегодня', exact: true }).click();
  await expect(rows.locator('.row-title')).toHaveText(['Второе дело', 'Третье дело']);
  await expect(page.getByRole('button', { name: 'К костру сегодня: Первое дело' })).toBeVisible();
});

test('порядок плана меняется мышью и удержанием пальца, отмена не меняет план', async ({ page }) => {
  const rows = await plan(page);
  const bounds = async (n: number) => (await rows.locator('.prow-main').nth(n).boundingBox())!;
  let a = await bounds(0);
  let b = await bounds(2);
  const x = a.x + 40;
  await page.mouse.move(x, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(x, b.y + b.height / 2, { steps: 6 });
  await page.mouse.up();
  await expect(rows.locator('.row-title')).toHaveText(['Второе дело', 'Третье дело', 'Первое дело']);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  a = await bounds(2);
  b = await bounds(0);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y: a.y + a.height / 2 }] });
  await page.waitForTimeout(600);
  await expect(rows.locator('.is-held')).toHaveCount(1);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: b.y + b.height / 2 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect(rows.locator('.row-title')).toHaveText(['Первое дело', 'Второе дело', 'Третье дело']);
  await page.mouse.move(x, b.y + b.height / 2);
  await page.mouse.down();
  await page.mouse.move(x, a.y + a.height / 2, { steps: 6 });
  await page.keyboard.press('Escape');
  await page.mouse.up();
  await expect(rows.locator('.row-title')).toHaveText(['Первое дело', 'Второе дело', 'Третье дело']);
  await page.reload();
  await expect(page.locator('.plan-rows').first().locator('.row-title')).toHaveText(['Первое дело', 'Второе дело', 'Третье дело']);
});

test('в Плане мана видна только при низких силах', async ({ page }) => {
  const now = at(9).getTime();
  const s = newState(now);
  s.hero.mana = 14;
  s.breakSince = now;
  await seedGame(page, s);
  await openGame(page);
  await expect(page.locator('.page .chip-mana')).toBeVisible();
  await page.clock.runFor(5 * 60 * 1000);
  await expect(page.locator('.page .chip-mana')).toHaveCount(0);
});

for (const width of [360, 390, 1280]) {
  test(`сообщение не закрывает нижние действия при ширине ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 360 ? 640 : 844 });
    await openGame(page);
    await addTask(page, 'Проверить сообщение');
    const message = toast(page);
    await expect(message).toBeVisible();
    const fire = (await page.getByRole('button', { name: /Разжечь костёр/ }).boundingBox())!;
    let r = (await message.boundingBox())!;
    expect(r.y + r.height).toBeLessThanOrEqual(fire.y);
    await tab(page, 'Добавить задачу').click();
    await expect.poll(async () => {
      const submit = (await sheet(page, 'Новая задача').getByRole('button', { name: 'Взять в отряд' }).boundingBox())!;
      r = (await message.boundingBox())!;
      return r.y + r.height - submit.y;
    }).toBeLessThanOrEqual(0);
    expect(r.y).toBeGreaterThanOrEqual(0);
  });
}
