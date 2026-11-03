// Кнопка «Назад» телефона: закрывает лист и знакомство, с других разделов ведёт в Лагерь,
// и только из Лагеря без листов выходит из приложения.
import { expect, test } from '@playwright/test';
import { addTask, at, openGame, sheet, tab } from './helpers';

const camp = (page: import('@playwright/test').Page) => page.getByRole('heading', { level: 1, name: 'Лагерь' });
const plan = (page: import('@playwright/test').Page) => page.getByRole('heading', { level: 1, name: 'Сбор отряда' });

test('«Назад» закрывает открытое, а не приложение', async ({ page }) => {
  await openGame(page, { time: at(9), intro: true });

  // Знакомство.
  await expect(sheet(page, 'Знакомство')).toBeVisible();
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
  await expect(camp(page)).toBeAttached();
  await expect(tab(page, 'Лагерь')).toHaveAttribute('aria-current', 'page');

  // Новая задача из Лагеря: «Назад» закрывает лист.
  await tab(page, 'Добавить задачу').click();
  await expect(sheet(page, 'Новая задача')).toBeVisible();
  await page.goBack();
  await expect(sheet(page, 'Новая задача')).toBeHidden();
  await expect(camp(page)).toBeAttached();

  // Лист закрыт крестиком: следующее «Назад» уже не пропадает впустую и уходит из игры.
  await tab(page, 'Добавить задачу').click();
  await sheet(page, 'Новая задача').getByRole('button', { name: 'Закрыть' }).click();
  await expect(sheet(page, 'Новая задача')).toBeHidden();
  await tab(page, 'Летопись').click();
  await tab(page, 'Лагерь').click();
  await expect(camp(page)).toBeAttached();
  await page.goBack();
  await expect(page).toHaveURL('about:blank');
});
