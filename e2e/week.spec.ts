// Привычки со счётом недели и главное на неделе.
import { expect, test, type Page } from '@playwright/test';
import { axe, openGame, setTime, sheet, tab, toast } from './helpers';

/** Вкладка сбора отряда: День, Неделя, Месяц, Квартал, Год. */
const view = (page: Page, name: string) => page.getByRole('radiogroup', { name: 'Что собирать' }).getByRole('radio', { name, exact: true });
// Понедельник, 2 ноября 2026, по Москве.
const nov = (day: number, h = 9) => new Date(`2026-11-${String(day).padStart(2, '0')}T${String(h).padStart(2, '0')}:00:00+03:00`);

test('привычка: счёт недели, бонус за цель и без долга за пропуск', async ({ page }) => {
  await openGame(page, { time: nov(2) });
  await tab(page, 'Добавить задачу').click();
  const form = sheet(page, 'Новая задача');
  await form.getByLabel('Что сделать').fill('Зарядка');
  await form.getByRole('radiogroup', { name: 'Повторять' }).getByRole('radio', { name: 'Каждый день' }).click();
  const goal = form.getByRole('radiogroup', { name: 'Привычка: цель на неделю' });
  await expect(goal.getByRole('radio', { name: 'Нет' })).toHaveAttribute('aria-checked', 'true');
  await goal.getByRole('radio', { name: '2 дня из 7' }).click();
  await expect(form).toContainText('Пропуск ничего не отнимает');
  expect(await axe(page), 'Форма с привычкой').toEqual([]);
  await form.getByRole('button', { name: /^(Взять в отряд|Отдать вестнику)$/ }).click();
  await expect(form).toBeHidden();

  const today = page.locator('section').filter({ has: page.getByRole('heading', { name: 'К костру сегодня' }) });
  const row = today.getByRole('button', { name: /^Зарядка/ });
  await expect(row).toContainText('0/2');
  await row.click();
  const card = sheet(page, 'Разбойник');
  await expect(card).toContainText('Привычка каждый день');
  await expect(card).toContainText('0 из 2 на этой неделе');
  expect(await axe(page), 'Лист привычки').toEqual([]);
  await card.getByRole('button', { name: 'Готово' }).click();
  await tab(page, 'Лагерь').click();
  await expect(page.locator('.card-done')).toContainText('+25 золота');
  await expect(page.locator('.card-done')).not.toContainText('привычка недели');

  // Вторник пропущен: в среду в плане одна сегодняшняя Зарядка, вчерашней нет.
  await setTime(page, nov(4));
  // Два дня без дел: встречает «Костёр ждал», его можно просто закрыть.
  await sheet(page, 'Костёр ждал').getByRole('button', { name: 'Закрыть' }).click();
  await tab(page, 'План').click();
  await expect(today.getByRole('button', { name: /^Зарядка/ })).toHaveCount(1);
  await expect(today.getByRole('button', { name: /^Зарядка/ })).toContainText('1/2');
  await today.getByRole('button', { name: /^Зарядка/ }).click();
  await sheet(page, 'Разбойник').getByRole('button', { name: 'Готово' }).click();
  await tab(page, 'Лагерь').click();
  await expect(page.locator('.card-done')).toContainText('привычка недели: 2 из 2, +50 золота');

  // На вкладке «Неделя» привычка со счётом и днями.
  await tab(page, 'План').click();
  await view(page, 'Неделя').click();
  const habits = page.locator('section.week-habits');
  await expect(habits).toContainText('2 из 2 на этой неделе');
  await expect(habits).toContainText('недель с целью: 1');
  await expect(habits.getByRole('list', { name: 'Сделано в понедельник и среду' })).toBeVisible();
  expect(await axe(page), 'Неделя с привычками').toEqual([]);
});

test('главное на неделе: звезда, условие победы, бонус и лимит три', async ({ page }) => {
  await openGame(page, { time: nov(2) });
  await tab(page, 'План').click();
  await view(page, 'Неделя').click();
  const block = page.locator('section.week-main');
  await expect(block).toContainText('Главное: до трёх дел');
  expect(await axe(page), 'Пустое главное').toEqual([]);

  for (const [title, win] of [
    ['Запустить оплату', 'страница оплаты видна на сайте'],
    ['Отчёт', ''],
    ['Позвонить в банк', ''],
  ]) {
    await block.locator('.main-empty').click();
    const form = sheet(page, 'Новая задача');
    await expect(form.getByRole('radiogroup', { name: 'Главное на этой неделе' }).getByRole('radio', { name: 'Да, со звездой' })).toHaveAttribute('aria-checked', 'true');
    await form.getByLabel('Что сделать').fill(title);
    if (win) await form.getByLabel('Победа, это когда…').fill(win);
    if (win) expect(await axe(page), 'Форма главного').toEqual([]);
    await form.getByRole('button', { name: 'Взять в отряд' }).click();
    await expect(form).toBeHidden();
  }
  await expect(block.locator('.main-slot:not(.main-empty)')).toHaveCount(3);
  await expect(block.locator('.main-empty')).toHaveCount(0);
  await expect(block).toContainText('Победа: страница оплаты видна на сайте');
  await expect(block).toContainText('0 из 3');

  // Четвёртую звезду поставить нельзя: кнопка объясняет почему.
  await page.getByRole('button', { name: 'Новая задача: эта неделя' }).click();
  const fourth = sheet(page, 'Новая задача');
  await fourth.getByLabel('Что сделать').fill('Разобрать шкаф');
  await fourth.getByRole('button', { name: 'Взять в отряд' }).click();
  await page.locator('.prow', { hasText: 'Разобрать шкаф' }).getByRole('button', { name: /^Разобрать шкаф/ }).click();
  await sheet(page, 'Разбойник').getByRole('button', { name: 'Главное на неделе' }).click();
  await expect(toast(page)).toHaveText('Главного уже 3. Сними звезду с другой задачи');
  await sheet(page, 'Разбойник').getByRole('button', { name: 'Закрыть' }).click();

  // Главное у огня показывает условие победы, «Готово» приносит бонус.
  await page.locator('.prow', { hasText: 'Запустить оплату' }).getByRole('button', { name: 'К костру сегодня: Запустить оплату' }).click();
  await tab(page, 'Лагерь').click();
  await page.getByRole('button', { name: /Запустить оплату/ }).first().click();
  const task = sheet(page, 'Разбойник');
  await expect(task).toContainText('Главное на этой неделе');
  await expect(task).toContainText('Победа: страница оплаты видна на сайте');
  await task.getByRole('button', { name: 'Готово' }).click();
  await expect(page.locator('.card-done')).toContainText('главное на неделе: +75 золота сверху');

  await tab(page, 'План').click();
  await view(page, 'Неделя').click();
  await expect(block).toContainText('1 из 3');
});
