// Горизонты (неделя, месяц, квартал, год) и задача одной фразой.
import { expect, test, type Page } from '@playwright/test';
import { at, axe, openGame, setTime, sheet, tab, toast } from './helpers';

/** Вкладка сбора отряда: День, Неделя, Месяц, Квартал, Год. */
const view = (page: Page, name: string) => page.getByRole('radiogroup', { name: 'Что собирать' }).getByRole('radio', { name, exact: true });

async function phrase(page: Page, text: string) {
  await tab(page, 'Добавить задачу').click();
  const form = sheet(page, 'Новая задача');
  await form.getByLabel('Что сделать').fill(text);
  return form;
}

test('фраза Игоря: задача на неделю с названием в кавычках', async ({ page }) => {
  // Понедельник, 2 ноября 2026.
  await openGame(page, { time: new Date('2026-11-02T09:00:00+03:00') });
  const form = await phrase(page, 'Добавь задачу на неделю "Съесть мороженое"');
  await expect(form.locator('#phrase-hint')).toContainText('горизонт: эта неделя');
  await expect(form.locator('#phrase-hint')).toContainText('Название: «Съесть мороженое»');
  await expect(form.getByRole('radiogroup', { name: 'Горизонт' }).getByRole('radio', { name: 'Неделя' })).toHaveAttribute('aria-checked', 'true');
  await expect(form.getByRole('radiogroup', { name: 'Когда к костру' }).getByRole('radio', { name: 'Потом' })).toHaveAttribute('aria-checked', 'true');
  expect(await axe(page), 'Новая задача с подсказкой').toEqual([]);
  await form.getByLabel('Что сделать').press('Enter');
  await expect(form).toBeHidden();
  await expect(toast(page)).toHaveText('Разбойник в отряде · эта неделя');

  await tab(page, 'План').click();
  await view(page, 'Неделя').click();
  await expect(page.getByRole('heading', { name: 'Эта неделя' })).toBeVisible();
  await expect(page.getByText('2–8 ноября')).toBeVisible();
  const row = page.locator('.prow', { hasText: 'Съесть мороженое' });
  await expect(row).toBeVisible();
  expect(await axe(page), 'Вкладка «Неделя»').toEqual([]);
  await row.getByRole('button', { name: 'К костру сегодня: Съесть мороженое' }).click();
  await expect(row).toContainText('сегодня');
  await view(page, 'День').click();
  await expect(page.locator('.prow', { hasText: 'Съесть мороженое' })).toBeVisible();
});

test('фраза выставляет день, время, оценку и поход, а руками можно поправить', async ({ page }) => {
  await openGame(page, { time: new Date('2026-11-02T09:00:00+03:00') });
  const form = await phrase(page, 'завтра в 19:00 позвонить маме на полчаса #личное');
  const hint = form.locator('#phrase-hint');
  await expect(hint).toContainText('к костру: завтра');
  await expect(hint).toContainText('время: 19:00');
  await expect(hint).toContainText('займёт: 30 мин');
  await expect(hint).toContainText('поход: Личное');
  await expect(form.getByLabel('Во сколько')).toHaveValue('19:00');
  // Выбранное руками сильнее фразы.
  await form.getByRole('radiogroup', { name: 'Когда к костру' }).getByRole('radio', { name: 'Сегодня' }).click();
  await form.getByRole('button', { name: 'Взять в отряд' }).click();
  await tab(page, 'План').click();
  await expect(page.locator('.prow', { hasText: 'Позвонить маме' })).toContainText('в 19:00');
});

test('год и вложенные задачи, листание периодов', async ({ page }) => {
  await openGame(page, { time: new Date('2026-11-02T09:00:00+03:00') });
  await tab(page, 'Добавить задачу').click();
  let form = sheet(page, 'Новая задача');
  await form.getByLabel('Что сделать').fill('Выучить испанский');
  await form.getByRole('radiogroup', { name: 'Горизонт' }).getByRole('radio', { name: 'Год' }).click();
  await expect(form.getByRole('radiogroup', { name: 'Какой' }).getByRole('radio', { name: '2026 год' })).toHaveAttribute('aria-checked', 'true');
  await form.getByRole('button', { name: 'Взять в отряд' }).click();
  form = await phrase(page, 'в декабре поменять резину');
  await form.getByRole('button', { name: 'Взять в отряд' }).click();

  await tab(page, 'План').click();
  await view(page, 'Год').click();
  await expect(page.locator('.prow', { hasText: 'Выучить испанский' })).toBeVisible();
  await page.getByText('Внутри года').click();
  await expect(page.locator('.period-nested')).toContainText('Поменять резину');
  await view(page, 'Месяц').click();
  await expect(page.getByRole('heading', { name: 'Ноябрь' })).toBeVisible();
  await page.getByRole('button', { name: 'Позже: Декабрь' }).click();
  await expect(page.getByRole('heading', { name: 'Декабрь' })).toBeVisible();
  await expect(page.locator('.prow', { hasText: 'Поменять резину' })).toBeVisible();
  await page.getByRole('button', { name: 'Вернуться: ноябрь' }).click();
  await expect(page.getByRole('heading', { name: 'Ноябрь' })).toBeVisible();
});

test('хвосты прошлой недели разбираются в сборе отряда', async ({ page }) => {
  // Пятница, 23 октября: неделя 19–25 октября.
  await openGame(page, { time: at(9) });
  for (const t of ['на неделю дочитать книгу', 'на неделю починить кран']) {
    const form = await phrase(page, t);
    await form.getByRole('button', { name: 'Взять в отряд' }).click();
    await expect(form).toBeHidden();
  }
  await tab(page, 'План').click();
  await expect(page.getByRole('button', { name: /остал/ })).toHaveCount(0);

  // Понедельник, 26 октября.
  await setTime(page, at(9, 0, 26));
  const banner = page.getByRole('button', { name: /С прошлой недели остались 2 задачи: разобрать/ });
  await expect(banner).toBeVisible();
  await banner.click();
  const tails = sheet(page, 'Хвосты');
  await expect(tails).toContainText('Прошлая неделя');
  expect(await axe(page), 'Хвосты').toEqual([]);
  await tails.getByRole('button', { name: 'На эту неделю: Дочитать книгу' }).click();
  await tails.getByRole('button', { name: 'Отпустить: Починить кран' }).click();
  await expect(tails).toContainText('Хвостов нет');
  await tails.getByRole('button', { name: 'Готово' }).click();
  await expect(banner).toHaveCount(0);
  await view(page, 'Неделя').click();
  await expect(page.locator('.prow', { hasText: 'Дочитать книгу' })).toBeVisible();
  await expect(page.locator('.prow', { hasText: 'Починить кран' })).toHaveCount(0);
});
