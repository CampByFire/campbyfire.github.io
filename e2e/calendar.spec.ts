// Календарь: встречи и задачи на дату, что стоит на завтра, вход из плана и из лагеря.
import { expect, test, type Page } from '@playwright/test';
import { at, axe, expectNoSideScroll, openGame, setTime, sheet, tab, toast } from './helpers';

/** Кнопки и поля меньше 44×44 на экране и в листе. */
const tooSmall = (page: Page) =>
  page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('.screen button, .screen input, [role="dialog"] button, [role="dialog"] input')]
      .filter((el) => !el.closest('[inert]') && !el.classList.contains('link-btn'))
      .map((el) => ({ el, box: el.getBoundingClientRect() }))
      .filter(({ box }) => box.width > 0 && (box.width < 43.5 || box.height < 43.5))
      .map(({ el, box }) => `${el.getAttribute('aria-label') ?? el.textContent ?? el.className}: ${Math.round(box.width)}×${Math.round(box.height)}`),
  );

test('встреча и задача на завтра: видно в календаре, в плане и на следующий день в лагере', async ({ page }) => {
  // Пятница, 23 октября, 9:00.
  await openGame(page, { time: at(9) });
  await page.getByRole('button', { name: /На завтра ничего не запланировано/ }).click();
  await expect(page.getByRole('heading', { name: 'Календарь', level: 1 })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Завтра', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('heading', { name: 'Завтра, суббота, 24 октября' })).toBeVisible();
  await expect(page.getByText('Ничего не запланировано.', { exact: true })).toBeVisible();
  expect(await axe(page), 'Календарь').toEqual([]);
  expect(await tooSmall(page), 'Календарь').toEqual([]);
  await expectNoSideScroll(page);

  // Встреча одной фразой: день и время понимаются сами.
  await page.getByRole('button', { name: 'Встреча', exact: true }).click();
  const form = sheet(page, 'Новая встреча');
  await form.getByLabel('Что за встреча').fill('завтра в 10 стоматолог');
  await expect(form.locator('#meet-hint')).toHaveText('Понял: завтра, суббота, 24 октября, в 10:00');
  await form.getByLabel('Конец').fill('10:45');
  await form.getByLabel('Где').fill('Ленина, 5');
  expect(await axe(page), 'Новая встреча').toEqual([]);
  expect(await tooSmall(page), 'Новая встреча').toEqual([]);
  await form.getByRole('button', { name: 'Добавить в календарь' }).click();
  await expect(form).toBeHidden();
  await expect(toast(page)).toHaveText('Встреча в календаре: завтра в 10:00');

  // И задача на этот же день.
  await page.getByRole('button', { name: 'Задача', exact: true }).click();
  const task = sheet(page, 'Новая задача');
  await task.getByLabel('Что сделать').fill('Купить торт');
  await task.getByRole('radiogroup', { name: 'Сфера или проект' }).getByRole('radio', { name: 'Дом и быт' }).click();
  await task.getByRole('button', { name: 'Взять в отряд' }).click();
  await expect(task).toBeHidden();

  const agenda = page.locator('.cal-list');
  await expect(agenda.locator('.cal-row')).toHaveCount(2);
  await expect(agenda.locator('.cal-row').first()).toContainText('10:00');
  await expect(agenda.locator('.cal-row').first()).toContainText('Стоматолог');
  await expect(agenda.locator('.cal-row').first()).toContainText('встреча · до 10:45 · Ленина, 5');
  await expect(agenda.locator('.cal-row').nth(1)).toContainText('Купить торт');
  await expect(page.getByRole('button', { name: '24 октября, суббота: 1 встреча и 1 задача' })).toBeVisible();
  await expect(page.locator('.page-sub')).toHaveText('Завтра 1 встреча и 1 задача, с 10:00.');
  expect(await axe(page), 'Календарь с делами').toEqual([]);
  await expectNoSideScroll(page);

  // В плане на сегодня видно, что стоит на завтра. К костру торт сегодня не позван: он придёт завтра.
  await tab(page, 'План').click();
  await expect(page.getByRole('button', { name: /Завтра 1 встреча и 1 задача, с 10:00/ })).toBeVisible();
  await expect(page.locator('section').filter({ has: page.getByRole('heading', { name: 'К костру сегодня' }) })).not.toContainText('Купить торт');

  // Наступила суббота: встреча стоит в плане дня, торт пришёл к костру, на кнопке календаря в лагере час встречи.
  await setTime(page, at(9, 0, 24));
  await expect(page.getByRole('heading', { name: 'Встречи сегодня' })).toBeVisible();
  await expect(page.locator('section').filter({ has: page.getByRole('heading', { name: 'Встречи сегодня' }) })).toContainText('Стоматолог');
  await expect(page.locator('section').filter({ has: page.getByRole('heading', { name: 'К костру сегодня' }) })).toContainText('Купить торт');
  await tab(page, 'Лагерь').click();
  await page.getByRole('button', { name: 'Календарь: сегодня в 10:00 Стоматолог' }).click();
  await expect(page.getByRole('heading', { name: 'Сегодня, суббота, 24 октября' })).toBeVisible();

  // Встречу можно поправить и удалить, а удалённую вернуть.
  await page.locator('.cal-row').filter({ hasText: 'Стоматолог' }).click();
  const edit = sheet(page, 'Встреча');
  await expect(edit.getByLabel('Начало')).toHaveValue('10:00');
  await edit.getByLabel('Начало').fill('11:30');
  await edit.getByRole('button', { name: 'Сохранить' }).click();
  await expect(page.locator('.cal-row').first()).toContainText('11:30');
  await page.locator('.cal-row').filter({ hasText: 'Стоматолог' }).click();
  await sheet(page, 'Встреча').getByRole('button', { name: 'Удалить встречу' }).click();
  await expect(page.locator('.cal-row').filter({ hasText: 'Стоматолог' })).toHaveCount(0);
  await toast(page).getByRole('button', { name: 'Вернуть' }).click();
  await expect(page.locator('.cal-row').filter({ hasText: 'Стоматолог' })).toHaveCount(1);
});

test('по месяцу ходят стрелками, встреча на весь день и вне текущего месяца', async ({ page }) => {
  await openGame(page, { time: at(9) });
  await page.getByRole('button', { name: /На завтра/ }).click();
  await page.getByRole('button', { name: 'Сегодня', exact: true }).click();
  const today = page.getByRole('button', { name: /^23 октября, пятница, сегодня/ });
  await expect(today).toHaveAttribute('aria-current', 'date');
  await today.focus();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('button', { name: /^6 ноября, пятница/ })).toBeFocused();
  await expect(page.getByRole('heading', { name: 'Ноябрь', level: 2 })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Пятница, 6 ноября' })).toBeVisible();

  await page.getByRole('button', { name: 'Встреча', exact: true }).click();
  const form = sheet(page, 'Новая встреча');
  await form.getByLabel('Что за встреча').fill('День рождения Кати');
  await form.getByRole('button', { name: 'Добавить в календарь' }).click();
  await expect(page.locator('.cal-row')).toContainText('весь день');
  await expect(page.getByRole('button', { name: '6 ноября, пятница: 1 встреча' })).toBeVisible();

  // Месяцы листаются, а выбранный день остаётся прежним.
  await page.getByRole('button', { name: 'Позже: Декабрь' }).click();
  await expect(page.getByRole('heading', { name: 'Декабрь', level: 2 })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Пятница, 6 ноября' })).toBeVisible();
  await page.getByRole('button', { name: 'Раньше: Ноябрь' }).click();
  await expect(page.getByRole('button', { name: '6 ноября, пятница: 1 встреча' })).toBeVisible();
  await expectNoSideScroll(page);
});
