// Доступность: проверка axe на главных экранах и листах, работа с клавиатуры.
// Как звучит игра в VoiceOver и TalkBack, проверяется руками: docs/screen-reader-check.md.
import { expect, test } from '@playwright/test';
import { addTask, axe, openGame, sheet, tab } from './helpers';

test('axe не находит нарушений на экранах и в листах', async ({ page }) => {
  await openGame(page);
  await addTask(page, 'Сдать отчёт', { quest: 'Работа', size: '1 ч' });
  await addTask(page, 'Зарядка', { size: '15 мин', repeat: 'Каждый день' });
  expect(await axe(page), 'Сбор отряда').toEqual([]);
  await page.getByRole('button', { name: /Разжечь костёр/ }).click();
  expect(await axe(page), 'Лагерь').toEqual([]);
  await tab(page, 'Королевство').click();
  expect(await axe(page), 'Королевство').toEqual([]);
  await tab(page, 'Летопись').click();
  expect(await axe(page), 'Летопись').toEqual([]);
  await tab(page, 'Настройки').click();
  expect(await axe(page), 'Настройки').toEqual([]);
  await tab(page, 'Добавить задачу').click();
  expect(await axe(page), 'Новая задача').toEqual([]);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Правила' }).click();
  expect(await axe(page), 'Правила').toEqual([]);
});

test('с клавиатуры: лист ловит фокус, Escape возвращает его на кнопку', async ({ page }) => {
  await openGame(page);
  const add = tab(page, 'Добавить задачу');
  await add.focus();
  await page.keyboard.press('Enter');
  const form = sheet(page, 'Новая задача');
  await expect(form.getByLabel('Что сделать')).toBeFocused();

  // Tab ходит только по листу. После последней кнопки фокус уходит в браузер, как у встроенных
  // модальных окон, и следующий Tab возвращает его в начало листа, а не на экран под ним.
  let wrapped = false;
  for (let i = 1; i <= 60 && !wrapped; i++) {
    await page.keyboard.press('Tab');
    const where = await form.evaluate((el) => (el.contains(document.activeElement) ? 'лист' : document.activeElement === document.body ? 'браузер' : 'экран'));
    expect(where, `Tab № ${i}`).not.toBe('экран');
    wrapped = where === 'браузер';
  }
  expect(wrapped, 'Tab дошёл до конца листа').toBe(true);
  await page.keyboard.press('Tab');
  await expect(form.getByRole('button', { name: 'Закрыть' })).toBeFocused();
  // Стрелки выбирают соседний вариант, как у радиокнопок.
  const size = form.getByRole('radiogroup', { name: 'Сколько займёт' });
  await size.getByRole('radio', { checked: true }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(size.getByRole('radio', { name: '1 ч' })).toBeChecked();
  await expect(size.getByRole('radio', { name: '1 ч' })).toBeFocused();

  await page.keyboard.press('Escape');
  await expect(form).toBeHidden();
  await expect(add).toBeFocused();
});
