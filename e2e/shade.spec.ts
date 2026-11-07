// Шторка задач дня в Лагере: разворачивается со всеми задачами и сворачивается обратно,
// кнопкой, «Назад», нажатием на сцену и пальцем. «N сделано» показывает сделанное внизу.
import { expect, test, type Page } from '@playwright/test';
import { addTask, complete, newState } from '../src/game/state';
import { at, axe, expectNoSideScroll, openGame, seedGame } from './helpers';

const TITLES = ['Сдать отчёт', 'Ответить на почту', 'Созвон с Петей', 'Проверить счёт', 'Оплатить связь', 'Разобрать стол', 'Позвонить маме', 'Купить хлеб', 'Полить цветы'];

async function seedDay(page: Page) {
  const s = newState(at(8).getTime());
  const work = s.quests[0].id;
  const ids = TITLES.map((title) => addTask(s, at(8).getTime(), { title, questId: work, level: 1, day: s.day }));
  complete(s, at(8, 30).getTime(), ids[0]);
  s.touchedAt = at(8, 30).getTime();
  s.litDay = s.day;
  await seedGame(page, s);
}

const day = (page: Page) => page.getByRole('region', { name: 'Задачи дня' });
const grip = (page: Page) => day(page).getByRole('button', { name: 'Все задачи дня' });

test('шторка: все задачи дня прямо в Лагере и обратно', async ({ page }) => {
  await seedDay(page);
  await openGame(page, { time: at(9) });
  await expect(page.getByRole('heading', { level: 1, name: 'Лагерь' })).toBeAttached();

  // Свёрнутая: видны не все, последняя строка зовёт развернуть.
  const more = day(page).getByRole('button', { name: /^Ещё \d в плане дня/ });
  await expect(more).toBeVisible();
  await expect(grip(page)).toHaveAttribute('aria-expanded', 'false');
  await expect(day(page).getByRole('button', { name: /^Полить цветы/ })).toHaveCount(0);

  // «Ещё N в плане дня» разворачивает шторку, а не ведёт в План.
  await more.click();
  await expect(grip(page)).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByRole('heading', { level: 1, name: 'Лагерь' })).toBeAttached();
  await day(page).getByRole('button', { name: /^Полить цветы/ }).scrollIntoViewIfNeeded();
  await expect(day(page).getByRole('button', { name: /^Полить цветы/ })).toBeVisible();
  await expect(more).toHaveCount(0);
  await expectNoSideScroll(page);
  expect(await axe(page)).toEqual([]);

  // Задача открывается из развёрнутой шторки, после закрытия листа шторка на месте.
  await day(page).getByRole('button', { name: /^Полить цветы/ }).click();
  await expect(page.getByRole('dialog')).toContainText('Полить цветы');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(grip(page)).toHaveAttribute('aria-expanded', 'true');

  // «Назад» сворачивает шторку, а не уходит из Лагеря.
  await page.goBack();
  await expect(grip(page)).toHaveAttribute('aria-expanded', 'false');
  await expect(more).toBeVisible();
  await expect(page.getByRole('heading', { level: 1, name: 'Лагерь' })).toBeAttached();

  // Ручка разворачивает, нажатие на притушенную сцену сворачивает.
  await grip(page).click();
  await expect(grip(page)).toHaveAttribute('aria-expanded', 'true');
  await page.locator('.shade-dim').click({ position: { x: 20, y: 20 } });
  await expect(grip(page)).toHaveAttribute('aria-expanded', 'false');
});

test('шторка: «1 сделано» показывает сделанные задачи внизу', async ({ page }) => {
  await seedDay(page);
  await openGame(page, { time: at(9) });
  const doneBtn = day(page).getByRole('button', { name: '1 сделано' });
  await expect(doneBtn).toHaveAttribute('aria-expanded', 'false');
  await expect(day(page).getByRole('button', { name: 'Сдать отчёт' })).toHaveCount(0);

  await doneBtn.click();
  await expect(grip(page)).toHaveAttribute('aria-expanded', 'true');
  await expect(doneBtn).toHaveAttribute('aria-expanded', 'true');
  const done = day(page).locator('#day-done');
  await expect(done.getByRole('button', { name: 'Сдать отчёт' })).toBeVisible();
  expect(await axe(page)).toEqual([]);

  // Второе нажатие прячет сделанное, шторка остаётся развёрнутой.
  await doneBtn.click();
  await expect(done).toHaveCount(0);
  await expect(grip(page)).toHaveAttribute('aria-expanded', 'true');
});

test('шторка: тянется пальцем вверх и вниз', async ({ page }) => {
  await seedDay(page);
  await openGame(page, { time: at(9) });
  const box = (await grip(page).boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  const cdp = await page.context().newCDPSession(page);
  const swipe = async (from: number, to: number) => {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y: from }] });
    for (let i = 1; i <= 8; i++) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: from + ((to - from) * i) / 8 }] });
      await page.waitForTimeout(16);
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  };

  await swipe(y, y - 400);
  await expect(grip(page)).toHaveAttribute('aria-expanded', 'true');
  // Шторка доезжает до места.
  await page.waitForTimeout(400);
  const up = (await grip(page).boundingBox())!;
  expect(up.y).toBeLessThan(y - 200);

  // Вниз тянут за ручку развёрнутой шторки.
  await swipe(up.y + up.height / 2, up.y + 500);
  await expect(grip(page)).toHaveAttribute('aria-expanded', 'false');
  await expect(day(page).getByRole('button', { name: /^Ещё \d в плане дня/ })).toBeVisible();
});
