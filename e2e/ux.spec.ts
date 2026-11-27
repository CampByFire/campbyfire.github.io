// Компактные разделы, порядок плана и сообщения над нижним действием.
import { expect, test, type Page } from '@playwright/test';
import { newState, addTask as addGameTask } from '../src/game/state';
import { addTask, at, axe, chooseTime, expandTaskForm, expectTime, openGame, openSettings, seedGame, sheet, tab, toast } from './helpers';

test('настройки открываются отдельно, Назад возвращает фокус в список', async ({ page }) => {
  await openGame(page);
  await openSettings(page);
  await expect(page.getByRole('group', { name: 'Работа с', exact: true })).toHaveCount(0);
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
  for (const name of ['Алхимия', 'Летопись']) {
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

test('формат времени меняется в Распорядке, действует в календаре и помнится после перезагрузки', async ({ page }) => {
  await openGame(page, { time: at(15) });
  await openSettings(page, 'Распорядок');
  const formats = page.getByRole('radiogroup', { name: 'Формат времени' });
  const pageDate = page.getByRole('main').locator('.page-date');
  const clock24 = formats.getByRole('radio', { name: '24 часа', exact: true });
  const clock12 = formats.getByRole('radio', { name: '12 часов (AM/PM)' });
  await expect(clock24).toBeChecked();
  await expect(pageDate).toContainText('15:00');
  await clock24.focus();
  await page.keyboard.press('ArrowRight');
  await expect(clock12).toBeChecked();
  await expect(pageDate).toContainText('3:00 PM');
  const workEnd = page.getByRole('group', { name: 'до', exact: true });
  const workEndMinutes = workEnd.getByRole('combobox', { name: 'до, минуты' });
  await expect(workEnd.getByRole('combobox', { name: 'до, часы' })).toHaveValue('6');
  await expect(workEnd.getByRole('combobox', { name: 'до, половина дня' })).toHaveValue('PM');
  await workEndMinutes.focus();
  await workEndMinutes.selectOption('15');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await clock24.click();
  await expectTime(workEnd, 'до', '18:15');
  await clock12.click();
  expect(await axe(page), '12-часовой распорядок').toEqual([]);

  await page.reload();
  await openSettings(page, 'Распорядок');
  await expect(clock12).toBeChecked();
  await tab(page, 'План').click();
  await expect(pageDate).toContainText('3:00 PM');
  await page.getByRole('button', { name: /На завтра ничего не запланировано/ }).click();
  await page.locator('.tl').click({ position: { x: 200, y: 15 * 56 + 20 } });
  const form = sheet(page, 'Новое событие');
  await form.getByLabel('Что за событие').fill('Созвон');
  await expect(form.getByRole('combobox', { name: 'Начало, часы' })).toHaveValue('3');
  await expect(form.getByRole('combobox', { name: 'Начало, половина дня' })).toHaveValue('PM');
  await expect(form.getByRole('combobox', { name: 'Конец, часы' })).toHaveValue('4');
  await form.getByRole('combobox', { name: 'Конец, минуты' }).selectOption('15');
  expect(await axe(page), 'Событие с 12-часовым временем').toEqual([]);
  await form.getByRole('button', { name: 'Добавить в календарь' }).click();
  await expect(page.getByRole('button', { name: '3:00 PM–4:15 PM, Созвон, событие' })).toBeVisible();
});

test.describe('Браузер с 12-часовой локалью', () => {
  test.use({ locale: 'en-US' });

  test('в формате 24 часа время событий и задач выбирается без AM/PM', async ({ page }) => {
    await openGame(page);
    await openSettings(page, 'Распорядок');
    const formats = page.getByRole('radiogroup', { name: 'Формат времени' });
    await formats.getByRole('radio', { name: '12 часов (AM/PM)' }).click();
    await formats.getByRole('radio', { name: '24 часа', exact: true }).click();

    await tab(page, 'План').click();
    await page.getByRole('tab', { name: 'Календарь' }).click();
    await page.getByRole('button', { name: 'Событие', exact: true }).click();
    const meeting = sheet(page, 'Новое событие');
    await meeting.getByLabel('Что за событие').fill('Поездка');
    for (const label of ['Начало', 'Конец']) {
      const time = meeting.getByRole('group', { name: label, exact: true });
      await expect(time.getByRole('combobox')).toHaveCount(2);
      await expect(time.getByRole('option', { name: '00', exact: true }).first()).toBeAttached();
    }
    await chooseTime(meeting, 'Начало', '00:15');
    await chooseTime(meeting, 'Конец', '23:59');
    await expectTime(meeting, 'Начало', '00:15');
    await expectTime(meeting, 'Конец', '23:59');
    await meeting.getByRole('button', { name: 'Добавить в календарь' }).click();
    await expect(page.getByRole('button', { name: '0:15–23:59, Поездка, событие' })).toBeAttached();

    await tab(page, 'Добавить задачу').click();
    const task = sheet(page, 'Новая задача');
    await expandTaskForm(task);
    await task.getByLabel('Что сделать').fill('Проверить маршрут');
    await task.getByRole('radio', { name: 'сфера Работа', exact: true }).click();
    const taskTime = task.getByRole('group', { name: 'Во сколько', exact: true });
    await expect(taskTime.getByRole('combobox')).toHaveCount(2);
    await chooseTime(task, 'Во сколько', '23:45');
    await expectTime(task, 'Во сколько', '23:45');
    await task.getByRole('button', { name: 'Взять в отряд' }).click();
    await expect(task).toBeHidden();
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('taskcraft-lager-v1')!).tasks[0]);
    expect(saved).toMatchObject({ title: 'Проверить маршрут', at: '23:45' });
  });
});

test('формат даты меняется в Распорядке и помнится после перезагрузки', async ({ page }) => {
  await openGame(page);
  await openSettings(page, 'Распорядок');
  const formats = page.getByRole('radiogroup', { name: 'Формат даты' });
  const defaultDate = formats.getByRole('radio', { name: 'ДД.ММ.ГГГГ', exact: true });
  await expect(defaultDate).toBeChecked();
  await expect(page.locator('.page-date')).toContainText('23.10.2026');
  await defaultDate.focus();
  await page.keyboard.press('ArrowRight');
  await expect(formats.getByRole('radio', { name: 'ММ.ДД.ГГГГ', exact: true })).toBeChecked();
  await expect(page.locator('.page-date')).toContainText('10.23.2026');
  await page.reload();
  await tab(page, 'План').click();
  await expect(page.locator('.page-date')).toContainText('10.23.2026');
  await page.getByRole('button', { name: /На завтра ничего не запланировано/ }).click();
  await expect(page.getByRole('heading', { name: 'Суббота, 10.24.2026', exact: true })).toBeVisible();
  await expect(page.getByText('Завтра · ничего не запланировано')).toBeVisible();
  await page.getByRole('button', { name: 'Событие', exact: true }).click();
  const form = sheet(page, 'Новое событие');
  await form.getByLabel('Что за событие').fill('Созвон');
  await expect(form.getByRole('textbox', { name: 'День', exact: true })).toHaveValue('10.24.2026');
  await form.getByRole('radio', { name: 'Каждый день' }).click();
  const start = form.getByRole('textbox', { name: 'Начало серии' });
  const end = form.getByRole('textbox', { name: 'Повторять до' });
  await start.fill('10.25.2026');
  await end.fill('10.24.2026');
  await expect(end).toHaveAttribute('aria-invalid', 'true');
  await end.fill('11.31.2026');
  await expect(end).toHaveAttribute('aria-invalid', 'true');
  await end.fill('11.06.2026');
  await form.getByRole('button', { name: 'Добавить в календарь' }).click();
  await expect(form).toBeHidden();
  await openSettings(page, 'Распорядок');
  await defaultDate.click();
  await tab(page, 'План').click();
  await page.getByRole('tab', { name: 'Календарь' }).click();
  await page.getByRole('button', { name: /^Позже: Завтра/ }).click();
  await page.getByRole('button', { name: /^Позже: Воскресенье, 25\.10\.2026/ }).click();
  await page.getByRole('button', { name: /Созвон.*каждый день/ }).click();
  const edit = sheet(page, 'Событие');
  await expect(edit.getByRole('textbox', { name: 'Начало серии' })).toHaveValue('25.10.2026');
  await expect(edit.getByRole('textbox', { name: 'Повторять до' })).toHaveValue('06.11.2026');
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

test('время для Плана задаётся часами и минутами, сохраняется и сбрасывается', async ({ page }) => {
  await openGame(page);
  await addTask(page, 'Сдать отчёт', { quest: 'Работа', size: '2 ч' });
  await expect(page.locator('.capacity')).toContainText('а сил хватит на ~6 ч 40 мин');
  await openSettings(page, 'Распорядок');
  const hours = page.getByRole('spinbutton', { name: 'Часы', exact: true });
  const minutes = page.getByRole('spinbutton', { name: 'Минуты', exact: true });
  await hours.fill('1');
  await minutes.fill('25');
  await page.getByRole('button', { name: 'Сохранить время для Плана' }).click();
  await tab(page, 'План').click();
  await expect(page.locator('.capacity.is-over')).toContainText('План на ~2 ч, а сил хватит на 1 ч 25 мин');
  await page.reload();
  await openSettings(page, 'Распорядок');
  await expect(hours).toHaveValue('1');
  await expect(minutes).toHaveValue('25');
  await hours.fill('');
  await minutes.fill('');
  await page.getByRole('button', { name: 'Сохранить время для Плана' }).click();
  await tab(page, 'План').click();
  await expect(page.locator('.capacity')).toContainText('а сил хватит на ~6 ч 40 мин');
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
