// Утренний сбор по желанию: «Сразу к огню» и «Быстрый сбор» вчерашних дел.
import { expect, test } from '@playwright/test';
import { addTask as addGameTask, endDay, newState } from '../src/game/state';
import { at, axe, openGame, seedGame, toast } from './helpers';

/** Вчера два дела в плане: одно оставили у костра на завтра, другое отбой вернул в отряд. */
function yesterday() {
  const s = newState(at(8, 0, 22).getTime());
  const q = s.quests[0].id;
  const kept = addGameTask(s, at(8, 0, 22).getTime(), { title: 'Сдать отчёт', questId: q, level: 2, day: s.day });
  addGameTask(s, at(8, 0, 22).getTime(), { title: 'Ответить на почту', questId: q, level: 1, day: s.day });
  endDay(s, at(23, 0, 22).getTime(), [kept]);
  s.touchedAt = at(23, 0, 22).getTime();
  return s;
}

const startDay = (page: import('@playwright/test').Page) => page.getByRole('region', { name: 'Начать день' });
const camp = (page: import('@playwright/test').Page) => page.getByRole('heading', { level: 1, name: 'Лагерь' });

test('быстрый сбор возвращает вчерашние дела и сразу разжигает костёр', async ({ page }) => {
  await seedGame(page, yesterday());
  await openGame(page, { time: at(9) });
  await expect(page.getByRole('heading', { level: 1, name: 'Сбор отряда' })).toBeVisible();
  await expect(startDay(page)).toContainText('У костра уже 1 задача');
  await expect(startDay(page)).toContainText('Со вчера ждут в отряде: 1 задача');
  expect(await axe(page), 'Начать день').toEqual([]);

  await startDay(page).getByRole('button', { name: /Быстрый сбор/ }).click();
  await expect(camp(page)).toBeAttached();
  await expect(toast(page)).toHaveText('Вчерашние дела у костра: 1: +6 опыта за план');
  const day = page.getByRole('region', { name: 'Задачи дня' });
  await expect(day).toContainText('Сдать отчёт');
  await expect(day).toContainText('Ответить на почту');
});

test('«Сразу к огню» разжигает костёр без сбора, а после этого карточки нет', async ({ page }) => {
  await seedGame(page, yesterday());
  await openGame(page, { time: at(9) });
  await startDay(page).getByRole('button', { name: 'Сразу к огню' }).click();
  await expect(camp(page)).toBeAttached();
  await expect(toast(page)).toHaveText('Костёр горит: +3 опыта за план');
  await page.getByRole('navigation', { name: 'Разделы' }).getByRole('button', { name: 'План', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Сбор отряда' })).toBeVisible();
  await expect(startDay(page)).toHaveCount(0);
});
