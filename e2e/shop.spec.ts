// Лавка: награды за золото. Идеи и своя награда, покупка и «Вернуть», цель и подсказка в лагере после «Готово».
import { expect, test, type Page } from '@playwright/test';
import { addTask as addGameTask, lightFire, newState } from '../src/game/state';
import { at, axe, expectNoSideScroll, openGame, seedGame, sheet, toast } from './helpers';

/** Игра с золотом, разожжённым костром и двумя задачами по часу в плане: каждая приносит 50 золота. */
function withGold(gold: number) {
  const now = at(8).getTime();
  const s = newState(now);
  const q = s.quests[0].id;
  addGameTask(s, now, { title: 'Сдать отчёт', questId: q, level: 2, day: s.day });
  addGameTask(s, now, { title: 'Разобрать почту', questId: q, level: 2, day: s.day });
  lightFire(s, now);
  s.hero.gold = gold;
  s.touchedAt = now;
  return s;
}

const shopTitle = (page: Page) => page.getByRole('heading', { level: 1, name: 'Лавка' });
const purse = (page: Page) => page.locator('.purse');
const shelf = (page: Page) => page.locator('.prizes');
const bought = (page: Page) => page.locator('section', { has: page.getByRole('heading', { name: 'Куплено' }) });

/** В лавку ведёт золото в верхней полосе Лагеря. */
async function openShop(page: Page) {
  await page.locator('.topbar').getByRole('button', { name: /^Лавка/ }).click();
  await expect(shopTitle(page)).toBeVisible();
}

/** Кнопки и поля, которые меньше 44×44; ссылки-кнопки нажимаются шире, чем видны. */
const tooSmall = (page: Page) =>
  page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('.screen button, .screen input, .screen summary, [role="dialog"] button, [role="dialog"] input')]
      .filter((el) => !el.closest('[inert]') && !el.classList.contains('link-btn'))
      .map((el) => ({ el, box: el.getBoundingClientRect() }))
      .filter(({ box }) => box.width > 0 && (box.width < 43.5 || box.height < 43.5))
      .map(({ el, box }) => `${el.getAttribute('aria-label') ?? el.textContent ?? el.className}: ${Math.round(box.width)}×${Math.round(box.height)}`),
  );

test('идея встаёт на полку, покупка тратит золото, «Вернуть» его возвращает', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await seedGame(page, withGold(240));
  await openGame(page, { time: at(14) });
  await openShop(page);
  await expect(purse(page)).toContainText('В кошеле 240 золота');
  await expect(page.getByText('На полке пусто.')).toBeVisible();
  expect(await axe(page), 'Пустая лавка').toEqual([]);
  expect(await tooSmall(page), 'Пустая лавка').toEqual([]);

  // Идеи раскрыты, пока полка пуста, и не сворачиваются, пока с них набирают награды.
  await page.getByRole('button', { name: /^Серия сериала/ }).click();
  await expect(toast(page)).toContainText('На полке: Серия сериала');
  await page.getByRole('button', { name: /^Кафе/ }).click();
  await expect(shelf(page).getByRole('listitem')).toHaveCount(2);
  await expect(page.getByRole('button', { name: /^Серия сериала, 150 золота/ })).toHaveCount(0);

  // На серию хватает, на кафе нет: у неё вместо кнопки видно, сколько не хватает.
  const series = shelf(page).getByRole('listitem').filter({ hasText: 'Серия сериала' });
  const cafe = shelf(page).getByRole('listitem').filter({ hasText: 'Кафе' });
  await expect(series).toContainText('Хватает золота');
  await expect(cafe).toContainText('Не хватает 60');
  await expect(cafe.getByRole('button', { name: /^Купить/ })).toHaveCount(0);

  await series.getByRole('button', { name: 'Купить: Серия сериала, 150 золота' }).click();
  await expect(toast(page)).toContainText('Куплено: Серия сериала. Это заслуженно!');
  await expect(purse(page)).toContainText('В кошеле 90 золота');
  await expect(purse(page)).toContainText('потрачено 150');
  await expect(series).toContainText('Не хватает 60 · куплено 1 раз');
  await expect(bought(page)).toContainText('1 награда на 150 золота');
  // Магия покупки досчитала число в кошеле до настоящего.
  await page.clock.runFor(2000);
  await expect(page.locator('[data-magic="purse-n"]')).toHaveText('90');
  expect(await axe(page), 'Лавка с покупкой').toEqual([]);
  expect(await tooSmall(page), 'Лавка с покупкой').toEqual([]);
  await expectNoSideScroll(page);

  // «Вернуть» в сообщении.
  await toast(page).getByRole('button', { name: 'Вернуть' }).click();
  await expect(purse(page)).toContainText('В кошеле 240 золота');
  await expect(bought(page)).toContainText('Пока ничего.');

  // Сегодняшнюю покупку можно вернуть и из истории.
  await series.getByRole('button', { name: /^Купить/ }).click();
  await expect(purse(page)).toContainText('В кошеле 90 золота');
  await bought(page).getByRole('button', { name: 'Вернуть покупку: Серия сериала' }).click();
  await expect(toast(page)).toContainText('Покупка возвращена: +150 золота');
  await expect(purse(page)).toContainText('В кошеле 240 золота');

  // Золото и полка пережили перезагрузку.
  await series.getByRole('button', { name: /^Купить/ }).click();
  await page.reload();
  await openShop(page);
  await expect(purse(page)).toContainText('В кошеле 90 золота');
  await expect(shelf(page).getByRole('listitem')).toHaveCount(2);
  await expect(bought(page)).toContainText('Серия сериала');
  expect(errors).toEqual([]);
});

test('своя награда становится целью, и лагерь после «Готово» говорит, сколько до неё осталось', async ({ page }) => {
  await seedGame(page, withGold(100));
  await openGame(page, { time: at(14) });
  await openShop(page);

  // Новая награда: без названия и цены не заводится, цена встаёт на шаг в 5.
  await page.getByRole('button', { name: 'новая награда' }).click();
  const form = sheet(page, 'Новая награда');
  await form.getByRole('button', { name: 'Поставить на полку' }).click();
  await expect(form.getByRole('alert')).toHaveText('Напиши, что это за награда.');
  await form.getByLabel('Чем себя порадовать').fill('Вечер с настолками');
  await form.getByRole('button', { name: 'Поставить на полку' }).click();
  await expect(form.getByRole('alert')).toHaveText('Назначь цену числом, например 150.');
  await form.getByLabel('Цена в золоте').fill('198');
  await expect(form).toContainText('200 золота. Как 8 задач до получаса.');
  expect(await axe(page), 'Новая награда').toEqual([]);
  expect(await tooSmall(page), 'Новая награда').toEqual([]);
  await form.getByRole('button', { name: 'Поставить на полку' }).click();
  await expect(form).toBeHidden();
  const prize = shelf(page).getByRole('listitem').filter({ hasText: 'Вечер с настолками' });
  await expect(prize).toContainText('Не хватает 100');

  // Цель.
  await prize.getByRole('button', { name: /Открыть награду/ }).click();
  const card = sheet(page, 'Награда');
  await card.getByRole('button', { name: 'Копить на это' }).click();
  await expect(card.getByRole('button', { name: 'Коплю на это. Снять цель' })).toHaveAttribute('aria-pressed', 'true');
  expect(await axe(page), 'Награда').toEqual([]);
  expect(await tooSmall(page), 'Награда').toEqual([]);
  await page.keyboard.press('Escape');
  await expect(card).toBeHidden();
  const goal = page.getByRole('region', { name: 'Коплю на' });
  await expect(goal).toContainText('Вечер с настолками');
  await expect(goal).toContainText('Осталось 100 золота: уже 50%.');
  expect(await axe(page), 'Лавка с целью').toEqual([]);

  // Первое «Готово»: до цели ещё 50.
  await page.getByRole('button', { name: 'В лагерь' }).click();
  const day = page.getByRole('region', { name: 'Задачи дня' });
  await day.getByRole('button', { name: 'Позвать к огню' }).click();
  await day.getByRole('button', { name: 'Готово' }).click();
  await expect(day.getByRole('heading', { name: 'Сделано!' })).toBeVisible();
  await expect(day).toContainText('До «Вечер с настолками» осталось 50 золота');
  expect(await axe(page), 'Сделано с подсказкой лавки').toEqual([]);
  await expectNoSideScroll(page);

  // Второе «Готово»: накоплено, и из лагеря можно сразу в лавку.
  await day.getByRole('button', { name: /Позвать к огню|К огню/ }).first().click();
  await day.getByRole('button', { name: 'Готово' }).click();
  await expect(day).toContainText('Теперь хватает на «Вечер с настолками»');
  await day.getByRole('button', { name: 'В лавку' }).click();
  await expect(shopTitle(page)).toBeVisible();
  await goal.getByRole('button', { name: 'Накоплено! Купить' }).click();
  await expect(purse(page)).toContainText('В кошеле 0 золота');
  // Купленная цель больше не цель, а «Вернуть» делает её целью снова.
  await expect(goal).toHaveCount(0);
  await toast(page).getByRole('button', { name: 'Вернуть' }).click();
  await expect(goal).toContainText('Вечер с настолками');
  await expect(purse(page)).toContainText('В кошеле 200 золота');
});

test('награду можно поправить, подвинуть и убрать с полки, а «Вернуть» ставит её на место', async ({ page }) => {
  await seedGame(page, withGold(500));
  await openGame(page, { time: at(14) });
  await openShop(page);
  await page.getByRole('button', { name: /^Серия сериала/ }).click();
  await page.getByRole('button', { name: /^Кафе/ }).click();
  const names = () => shelf(page).locator('.prize-name').allTextContents();
  expect(await names()).toEqual(['Серия сериала', 'Кафе']);

  await shelf(page).getByRole('button', { name: /^Кафе/ }).click();
  const card = sheet(page, 'Награда');
  await card.getByLabel('Чем себя порадовать').fill('Кафе с пирожным');
  await card.getByLabel('Цена в золоте').fill('350');
  await card.getByRole('button', { name: 'Сохранить' }).click();
  await expect(card).toBeHidden();
  await expect(shelf(page)).toContainText('Кафе с пирожным');
  await expect(shelf(page)).toContainText('350 золота');

  await shelf(page).getByRole('button', { name: /^Кафе с пирожным/ }).click();
  await expect(card.getByRole('button', { name: 'Ниже на полке' })).toBeDisabled();
  await card.getByRole('button', { name: 'Выше на полке' }).click();
  await expect(card.getByRole('button', { name: 'Выше на полке' })).toBeDisabled();
  await card.getByRole('button', { name: 'Убрать с полки' }).click();
  await expect(card).toBeHidden();
  expect(await names()).toEqual(['Серия сериала']);
  await expect(toast(page)).toContainText('Убрано с полки: Кафе с пирожным');
  await toast(page).getByRole('button', { name: 'Вернуть' }).click();
  expect(await names()).toEqual(['Кафе с пирожным', 'Серия сериала']);

  // В лавку можно попасть и из Настроек, а «Назад» ведёт в Лагерь.
  await page.getByRole('button', { name: 'В лагерь' }).click();
  await page.locator('.topbar').getByRole('button', { name: 'Настройки', exact: true }).click();
  await page.getByRole('button', { name: 'В лавку' }).click();
  await expect(shopTitle(page)).toBeVisible();
  await page.goBack();
  await expect(page.locator('.topbar')).toBeVisible();
});
