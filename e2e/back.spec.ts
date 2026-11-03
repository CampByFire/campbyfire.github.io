// Кнопка «Назад» телефона: закрывает лист и знакомство, с других разделов ведёт в Лагерь,
// и только из Лагеря без листов выходит из приложения.
import { expect, test, type Page } from '@playwright/test';
import { addTask, at, openGame, sheet, tab } from './helpers';

const camp = (page: Page) => page.getByRole('heading', { level: 1, name: 'Лагерь' });
const plan = (page: Page) => page.getByRole('heading', { level: 1, name: 'Сбор отряда' });
const inCamp = async (page: Page) => {
  await expect(camp(page)).toBeAttached();
  await expect(tab(page, 'Лагерь')).toHaveAttribute('aria-current', 'page');
};

test('«Назад» закрывает открытое, а не приложение', async ({ page }) => {
  await openGame(page, { time: at(9), intro: true });

  // Знакомство: человек листает карточки, потом жмёт «Назад».
  await expect(sheet(page, 'Знакомство')).toBeVisible();
  await page.getByRole('button', { name: 'Дальше' }).click();
  await page.goBack();
  await expect(sheet(page, 'Знакомство')).toBeHidden();
  await expect(plan(page)).toBeVisible();

  // Карточка задачи в сборе отряда: «Назад» закрывает её, план остаётся.
  await addTask(page, 'Сдать отчёт', { quest: 'Работа', size: '1 ч' });
  const today = page.locator('section').filter({ has: page.getByRole('heading', { name: 'К костру сегодня' }) });
  await today.getByRole('button', { name: /^Сдать отчёт/ }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.goBack();
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(plan(page)).toBeVisible();

  // С плана «Назад» ведёт в Лагерь.
  await page.goBack();
  await inCamp(page);

  // Новая задача из Лагеря: «Назад» закрывает лист.
  await tab(page, 'Добавить задачу').click();
  await expect(sheet(page, 'Новая задача')).toBeVisible();
  await page.goBack();
  await expect(sheet(page, 'Новая задача')).toBeHidden();
  await inCamp(page);

  // Лист закрыт крестиком: следующее «Назад» уже не пропадает впустую и уходит из игры.
  await tab(page, 'Добавить задачу').click();
  await sheet(page, 'Новая задача').getByRole('button', { name: 'Закрыть' }).click();
  await expect(sheet(page, 'Новая задача')).toBeHidden();
  await tab(page, 'Летопись').click();
  await tab(page, 'Лагерь').click();
  await inCamp(page);
  await page.goBack();
  await expect(page).toHaveURL('about:blank');
});

test('«Назад» с любого раздела возвращает в Лагерь за одно нажатие', async ({ page }) => {
  await openGame(page, { time: at(9) });
  await page.getByRole('button', { name: /Разжечь костёр/ }).click();
  await inCamp(page);

  for (const name of ['План', 'Королевство', 'Летопись']) {
    await tab(page, name).click();
    await expect(tab(page, name)).toHaveAttribute('aria-current', 'page');
    await page.goBack();
    await inCamp(page);
  }

  // Несколько разделов подряд: всё равно одно «Назад» до Лагеря, второе выходит.
  await tab(page, 'План').click();
  await tab(page, 'Королевство').click();
  await tab(page, 'Летопись').click();
  await page.goBack();
  await inCamp(page);

  // Лист поверх раздела: первое «Назад» закрывает лист, второе ведёт в Лагерь.
  await tab(page, 'Летопись').click();
  await tab(page, 'Добавить задачу').click();
  await expect(sheet(page, 'Новая задача')).toBeVisible();
  await page.goBack();
  await expect(sheet(page, 'Новая задача')).toBeHidden();
  await expect(tab(page, 'Летопись')).toHaveAttribute('aria-current', 'page');
  await page.goBack();
  await inCamp(page);

  await page.goBack();
  await expect(page).toHaveURL('about:blank');
});
