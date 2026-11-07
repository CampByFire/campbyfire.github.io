// Обычный день целиком: знакомство, сбор отряда, работа у огня, привал, «Готово» и отбой.
// Идёт на маленьком телефоне, обычном телефоне и компьютере.
import { expect, test } from '@playwright/test';
import { addTask, at, expectNoSideScroll, openGame, setTime, sheet, tab } from './helpers';

test('день от знакомства до отбоя', async ({ page }) => {
  await openGame(page, { time: at(9), intro: true });

  // Первый запуск: знакомство, потом сбор отряда.
  await expect(sheet(page, 'Знакомство')).toBeVisible();
  await page.getByRole('button', { name: 'Пропустить' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Сбор отряда' })).toBeVisible();
  await expectNoSideScroll(page);

  // Две задачи на сегодня.
  await addTask(page, 'Сдать отчёт', { quest: 'Работа', size: '1 ч' });
  await expect(page.getByRole('status').filter({ hasText: 'Варвар в отряде' })).toBeAttached();
  await addTask(page, 'Ответить на почту', { quest: 'Работа', size: '15 мин' });
  const today = page.locator('section').filter({ has: page.getByRole('heading', { name: 'К костру сегодня' }) });
  await expect(today.getByRole('button', { name: /^Сдать отчёт/ })).toBeVisible();
  await expect(today.getByRole('button', { name: /^Ответить на почту/ })).toBeVisible();
  await expect(today).toContainText('2 задачи');

  // Разжечь костёр: игра уходит в лагерь.
  await page.getByRole('button', { name: /Разжечь костёр/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Лагерь' })).toBeAttached();
  const day = page.getByRole('region', { name: 'Задачи дня' });
  await expect(day.getByRole('heading', { name: 'У огня пусто' })).toBeVisible();
  await expectNoSideScroll(page);

  // Позвать к огню первую задачу и поработать полчаса.
  await day.getByRole('button', { name: 'Позвать к огню' }).click();
  await expect(day.getByRole('heading', { name: 'Сейчас у огня' })).toBeVisible();
  await expect(day.getByRole('button', { name: 'Сдать отчёт' })).toBeVisible();
  // Ровно полчаса от того, как позвали: на медленной машине до этого шага проходит несколько секунд.
  await setTime(page, new Date((await page.evaluate(() => Date.now())) + 30 * 60_000));
  await expect(day.locator('.timer')).toContainText('0:30');

  // Привал и обратно.
  await day.getByRole('button', { name: 'Привал' }).click();
  await expect(day.getByRole('heading', { name: 'Привал' })).toBeVisible();
  await expect(day.getByRole('button', { name: 'Снова в путь' })).toBeFocused();
  await day.getByRole('button', { name: 'Снова в путь' }).click();
  await expect(day.getByRole('heading', { name: 'Сейчас у огня' })).toBeVisible();

  // Готово: награда, и дальше вторая задача.
  await day.getByRole('button', { name: 'Готово' }).click();
  await expect(day.getByRole('heading', { name: 'Сделано!' })).toBeVisible();
  await expect(day).toContainText('+50 золота');
  await expect(day).toContainText('Дальше:');
  await expect(day).toContainText('Ответить на почту');
  await expect(page.locator('.topbar')).toContainText('Золото: 50');
  await expectNoSideScroll(page);

  // Вечер: перед отбоем лагерь подводит итоги.
  await setTime(page, at(22, 40));
  await page.getByRole('button', { name: 'Скоро отбой: подвести итоги дня' }).click();
  const summary = sheet(page, 'Итоги дня');
  await expect(summary).toBeVisible();
  await expect(summary).toContainText(/1\s*сделано/);
  const keep = summary.getByRole('checkbox', { name: /Ответить на почту/ });
  await expect(keep).toBeChecked();
  await summary.getByRole('button', { name: 'Отбой', exact: true }).click();
  await expect(day.getByRole('heading', { name: 'Отряд спит' })).toBeVisible();
  await expect(day.getByRole('heading', { name: 'Отряд спит' })).toBeFocused();
  await expectNoSideScroll(page);

  // Утром оставленная у костра задача снова в плане.
  await setTime(page, at(8, 0, 24));
  await expect(page.getByRole('heading', { level: 1, name: 'Сбор отряда' })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Ответить на почту/ })).toBeVisible();
  await tab(page, 'Летопись').click();
  await expect(page.getByRole('heading', { level: 1, name: 'Летопись' })).toBeVisible();
  await expectNoSideScroll(page);
});
