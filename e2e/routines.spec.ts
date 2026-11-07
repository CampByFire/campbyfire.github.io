// Повторяющиеся задачи: сами встают в план в свои дни.
import { expect, test } from '@playwright/test';
import { addTask, at, axe, openGame, setTime, sheet, tab, toast } from './helpers';

test('каждый день: сделанная сегодня завтра приходит снова', async ({ page }) => {
  await openGame(page, { time: at(9) });
  await addTask(page, 'Зарядка', { size: '15 мин', repeat: 'Каждый день' });
  await expect(toast(page)).toHaveText('Повторяется каждый день. Сегодня уже у костра');

  const today = page.locator('section').filter({ has: page.getByRole('heading', { name: 'К костру сегодня' }) });
  const repeating = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Повторяются' }) });
  await expect(repeating).toContainText('каждый день');
  await today.getByRole('button', { name: /^Зарядка/ }).click();

  const card = sheet(page, 'Разбойник');
  await expect(card).toContainText('Повторяется каждый день');
  await card.getByRole('button', { name: 'Готово' }).click();
  await expect(today).toContainText('сегодня уже сделано: 1');

  // Наутро задача снова в плане сама.
  await setTime(page, at(8, 0, 24));
  await expect(page.getByRole('heading', { level: 1, name: 'Сбор отряда' })).toBeVisible();
  await expect(today.getByRole('button', { name: /^Зарядка/ })).toBeVisible();
  await expect(today).not.toContainText('сегодня уже сделано');
});

test('свои дни: приходит только в выбранные дни недели', async ({ page }) => {
  // Пятница: она выбрана сразу, остаётся добавить понедельник и среду.
  await openGame(page, { time: at(9) });
  await tab(page, 'Добавить задачу').click();
  const form = sheet(page, 'Новая задача');
  await form.getByLabel('Что сделать').fill('Растяжка');
  await form.getByRole('radiogroup', { name: 'Повторять' }).getByRole('radio', { name: 'Свои дни' }).click();
  await expect(form.getByRole('radio', { name: 'По рабочим дням' })).toHaveCount(0);
  const days = form.getByRole('group', { name: 'В какие дни' });
  await expect(days.getByRole('button', { name: 'пятница' })).toHaveAttribute('aria-pressed', 'true');

  // Без единого дня задача не сохраняется и говорит почему.
  await days.getByRole('button', { name: 'пятница' }).click();
  await expect(form).toContainText('Выбери хотя бы один день');
  await form.getByRole('button', { name: /^(Взять в отряд|Отдать вестнику)$/ }).click();
  await expect(toast(page)).toContainText('Выбери хотя бы один день');
  await expect(form).toBeVisible();

  await days.getByRole('button', { name: 'понедельник' }).click();
  await days.getByRole('button', { name: 'среда' }).click();
  await expect(await axe(page)).toEqual([]);
  await form.getByRole('button', { name: /^(Взять в отряд|Отдать вестнику)$/ }).click();
  await expect(toast(page)).toContainText('Повторяется по понедельникам и средам. Придёт в понедельник');

  const today = page.locator('section').filter({ has: page.getByRole('heading', { name: 'К костру сегодня' }) });
  const repeating = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Повторяются' }) });
  await expect(repeating).toContainText('по понедельникам и средам');
  await expect(today.getByRole('button', { name: /^Растяжка/ })).toHaveCount(0);

  // В правке выбранные дни на месте.
  await repeating.getByRole('button', { name: /Растяжка/ }).click();
  const edit = sheet(page, 'Повторяющаяся задача');
  const again = edit.getByRole('group', { name: 'В какие дни' });
  await expect(again.getByRole('button', { name: 'понедельник' })).toHaveAttribute('aria-pressed', 'true');
  await expect(again.getByRole('button', { name: 'среда' })).toHaveAttribute('aria-pressed', 'true');
  await expect(again.getByRole('button', { name: 'пятница' })).toHaveAttribute('aria-pressed', 'false');
  await edit.getByRole('button', { name: 'Закрыть' }).click();

  await setTime(page, at(8, 0, 26));
  await expect(today.getByRole('button', { name: /^Растяжка/ })).toBeVisible();
});

test('раз в неделю: приходит только в свой день', async ({ page }) => {
  // Пятница. Задача на среду.
  await openGame(page, { time: at(9) });
  await addTask(page, 'Полить цветы', { size: '15 мин', repeat: 'Раз в неделю', weekday: 'среда' });
  await expect(toast(page)).toHaveText('Придёт в среду, а дальше каждую неделю');
  const today = page.locator('section').filter({ has: page.getByRole('heading', { name: 'К костру сегодня' }) });
  await expect(today.getByRole('button', { name: /^Полить цветы/ })).toHaveCount(0);

  await setTime(page, at(8, 0, 27));
  await expect(today.getByRole('button', { name: /^Полить цветы/ })).toHaveCount(0);
  await setTime(page, at(8, 0, 28));
  await expect(today.getByRole('button', { name: /^Полить цветы/ })).toBeVisible();
});
