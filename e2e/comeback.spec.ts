// Спокойная нежить, награда за старт и возвращение после перерыва.
import { expect, test } from '@playwright/test';
import { addTask as addGameTask, newState } from '../src/game/state';
import { at, axe, openGame, seedGame, setTime, sheet, tab, toast } from './helpers';

const day = (page: import('@playwright/test').Page) => page.getByRole('region', { name: 'Задачи дня' });

test('нежить: туман без счёта, три решения с опытом, искра за старт', async ({ page }) => {
  const s = newState(at(8).getTime());
  const work = s.quests[0].id;
  addGameTask(s, at(8).getTime(), { title: 'Старый отчёт', questId: work, level: 1, due: '2026-10-10' });
  addGameTask(s, at(8).getTime(), { title: 'Оплатить счёт', questId: work, level: 1, due: '2026-10-20' });
  for (const t of ['Письмо Ане', 'Письмо Боре', 'Письмо Вере']) addGameTask(s, at(8).getTime(), { title: t, questId: work, level: 1, due: '2026-10-21' });
  s.touchedAt = at(8).getTime();
  s.litDay = s.day;
  await seedGame(page, s);
  await openGame(page, { time: at(9) });

  // Нежити больше, чем мест на дороге: дальний конец в тумане, и нежить не пересчитывают.
  await expect(page.getByRole('button', { name: 'на дороге туман' })).toBeVisible();
  await expect(page.locator('.road-fog')).toBeAttached();
  await expect(page.getByText(/ещё \d+ на дороге/)).toHaveCount(0);

  // Старая нежить: страшнее не стала, упокоить её выгоднее. Три равных решения.
  await page.getByRole('button', { name: /Старый скелет на дороге.*Старый отчёт/ }).click();
  const old = sheet(page, 'Старый скелет');
  await expect(old).toContainText('опыта вдвое');
  const choice = old.getByRole('group', { name: 'Что сделать с нежитью' });
  await expect(choice.getByRole('button')).toHaveText([/Упокоить/, /Перенести/, /Отпустить/]);
  expect(await axe(page), 'Нежить').toEqual([]);

  // Перенести: новый срок и опыт за решение.
  await choice.getByRole('button', { name: /Перенести/ }).click();
  await old.getByRole('group', { name: 'Новый срок' }).getByRole('button', { name: 'Через неделю' }).click();
  await expect(toast(page)).toHaveText('Срок через неделю: +5 опыта');
  await expect(page.getByRole('button', { name: /Старый отчёт/ })).toHaveCount(0);

  // Отпустить: тоже опыт, а «Вернуть» его забирает.
  await page.getByRole('button', { name: /Скелет-миньон на дороге.*Оплатить счёт/ }).click();
  await sheet(page, 'Скелет-миньон').getByRole('button', { name: /Отпустить/ }).click();
  await expect(toast(page)).toContainText('Нежить отпущена на покой: +5 опыта');

  // Упокоить: нежить идёт к огню. Через две минуты подряд зажигается искра.
  await page.getByRole('button', { name: /Скелет-миньон на дороге.*Письмо Ане/ }).click();
  await sheet(page, 'Скелет-миньон').getByRole('button', { name: /Упокоить/ }).click();
  await expect(day(page).getByRole('heading', { name: 'Сейчас у огня' })).toBeVisible();
  await expect(day(page).locator('.fire-line')).toContainText('зажжётся искра: +5 опыта');
  await setTime(page, new Date(at(9).getTime() + 2 * 60_000 + 5_000));
  await expect(toast(page)).toHaveText('Искра зажглась: +5 опыта за старт');
  await expect(day(page).locator('.fire-line')).toContainText('Искра горит');

  // Сдать: за нежить опыта на половину больше.
  await day(page).getByRole('button', { name: 'Готово' }).click();
  await expect(day(page).getByRole('heading', { name: 'Сделано!' })).toBeVisible();
  await expect(day(page)).toContainText('+38 опыта');
  await expect(day(page)).toContainText('нежить упокоена, +13 опыта сверху');
});

test('возвращение после перерыва: «Костёр ждал», бонус отдохнувшего героя и покой нежити', async ({ page }) => {
  // Последнее действие во вторник вечером, вернулись в пятницу утром.
  const s = newState(at(9, 0, 20).getTime());
  addGameTask(s, at(9, 0, 20).getTime(), { title: 'Позвонить в банк', questId: s.quests[0].id, level: 1, due: '2026-10-19' });
  addGameTask(s, at(9, 0, 20).getTime(), { title: 'Прочитать главу', questId: s.quests[1].id, level: 1, day: s.day });
  s.touchedAt = at(20, 0, 20).getTime();
  s.settledAt = at(20, 0, 20).getTime();
  await seedGame(page, s);
  await openGame(page, { time: at(9, 0, 23) });

  const welcome = sheet(page, 'Костёр ждал');
  await expect(welcome).toBeVisible();
  await expect(welcome).toContainText('Пропуски тут не считают');
  await expect(welcome).toContainText('первые 3 дела сегодня дают вдвое больше опыта');
  await expect(welcome).not.toContainText(/\d+ (день|дня|дней)/);
  expect(await axe(page), 'Костёр ждал').toEqual([]);

  // Покой нежити разом, с «Вернуть».
  await welcome.getByRole('button', { name: 'Дать нежити покой' }).click();
  await expect(toast(page)).toContainText('Нежить ушла на покой');
  await expect(toast(page).getByRole('button', { name: 'Вернуть' })).toBeVisible();
  await expect(welcome.getByRole('button', { name: 'Дать нежити покой' })).toHaveCount(0);

  // Сбор сегодня по желанию: сразу к огню.
  await welcome.getByRole('button', { name: 'Сразу к огню' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Лагерь' })).toBeAttached();
  await expect(day(page)).toContainText('Отдохнувший герой: ещё 3 дела сегодня с двойным опытом');
  await day(page).getByRole('button', { name: 'Позвать к огню' }).click();
  await day(page).getByRole('button', { name: 'Готово' }).click();
  await expect(day(page)).toContainText('+50 опыта');
  await expect(day(page)).toContainText('отдохнувший герой: +25 опыта');
  await expect(day(page)).toContainText('ещё 2 дела');

  // Второй раз за этот день «Костёр ждал» не встречает.
  await page.reload();
  await expect(page.locator('.app')).toBeVisible();
  await tab(page, 'Лагерь').click();
  await expect(sheet(page, 'Костёр ждал')).toHaveCount(0);
});
