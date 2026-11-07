// Календарь: встречи и задачи на дату, шкала дня по часам, что стоит на завтра, вход из плана и из лагеря.
import { expect, test, type Page } from '@playwright/test';
import { at, axe, expectNoSideScroll, openGame, setTime, sheet, tab, toast } from './helpers';

/** Кнопки и поля меньше 44×44 на экране и в листе. Дела на шкале дня не в счёт: их высота это их длительность. */
const tooSmall = (page: Page) =>
  page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('.screen button, .screen input, [role="dialog"] button, [role="dialog"] input')]
      .filter((el) => !el.closest('[inert]') && !el.classList.contains('link-btn') && !el.classList.contains('tl-ev'))
      .map((el) => ({ el, box: el.getBoundingClientRect() }))
      .filter(({ box }) => box.width > 0 && (box.width < 43.5 || box.height < 43.5))
      .map(({ el, box }) => `${el.getAttribute('aria-label') ?? el.textContent ?? el.className}: ${Math.round(box.width)}×${Math.round(box.height)}`),
  );

const timeline = (page: Page) => page.getByRole('region', { name: 'По часам' });

test('встреча и задача на завтра: шкала дня, план и следующий день в лагере', async ({ page }) => {
  // Пятница, 23 октября, 9:00. Строка про завтра в плане открывает завтрашний день по часам.
  await openGame(page, { time: at(9) });
  await page.getByRole('button', { name: /На завтра ничего не запланировано/ }).click();
  await expect(page.getByRole('heading', { name: 'Суббота, 24 октября', level: 1 })).toBeVisible();
  await expect(page.getByText('Завтра · ничего не запланировано')).toBeVisible();
  expect(await axe(page), 'Пустой день').toEqual([]);
  expect(await tooSmall(page), 'Пустой день').toEqual([]);
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
  await expect(timeline(page).getByRole('button', { name: '10:00–10:45, Стоматолог, встреча · Ленина, 5' })).toBeVisible();

  // Нажатие на пустой час заводит встречу на этот час.
  await page.locator('.tl').click({ position: { x: 200, y: 15 * 56 + 20 } });
  const slot = sheet(page, 'Новая встреча');
  await expect(slot.getByLabel('Начало')).toHaveValue('15:00');
  await slot.getByLabel('Что за встреча').fill('Созвон');
  await slot.getByRole('button', { name: 'Добавить в календарь' }).click();
  await expect(timeline(page).getByRole('button', { name: '15:00–16:00, Созвон, встреча' })).toBeVisible();

  // Задача без времени встаёт в «Весь день».
  await page.getByRole('button', { name: 'Задача', exact: true }).click();
  const task = sheet(page, 'Новая задача');
  await task.getByLabel('Что сделать').fill('Купить торт');
  await task.getByRole('radiogroup', { name: 'Сфера или проект' }).getByRole('radio', { name: 'Дом и быт' }).click();
  await task.getByRole('button', { name: 'Взять в отряд' }).click();
  await expect(task).toBeHidden();
  await expect(page.getByRole('region', { name: 'Весь день' })).toContainText('Купить торт');
  await expect(page.getByText('Завтра · 2 встречи и 1 задача')).toBeVisible();
  expect(await axe(page), 'День по часам').toEqual([]);
  await expectNoSideScroll(page);

  // К месяцу: день выбран, под сеткой его список.
  await page.getByRole('button', { name: 'Октябрь' }).click();
  await expect(page.getByRole('heading', { name: 'Календарь', level: 1 })).toBeVisible();
  await expect(page.getByRole('button', { name: '24 октября, суббота: 2 встречи и 1 задача' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.cal-list .cal-row')).toHaveCount(3);
  await expect(page.locator('.page-sub')).toHaveText('Завтра 2 встречи и 1 задача, с 10:00.');
  expect(await axe(page), 'Месяц').toEqual([]);
  expect(await tooSmall(page), 'Месяц').toEqual([]);
  await expectNoSideScroll(page);

  // В плане на сегодня видно, что стоит на завтра. К костру торт сегодня не позван: он придёт завтра.
  await tab(page, 'План').click();
  await expect(page.getByRole('button', { name: /Завтра 2 встречи и 1 задача, с 10:00/ })).toBeVisible();
  await expect(page.locator('section').filter({ has: page.getByRole('heading', { name: 'К костру сегодня' }) })).not.toContainText('Купить торт');

  // Наступила суббота: встречи в плане дня, торт пришёл к костру, на кнопке календаря в лагере час ближайшей встречи.
  await setTime(page, at(9, 0, 24));
  await expect(page.locator('section').filter({ has: page.getByRole('heading', { name: 'Встречи сегодня' }) })).toContainText('Стоматолог');
  await expect(page.locator('section').filter({ has: page.getByRole('heading', { name: 'К костру сегодня' }) })).toContainText('Купить торт');
  await tab(page, 'Лагерь').click();
  await page.getByRole('button', { name: 'Календарь: сегодня в 10:00 Стоматолог' }).click();
  await expect(page.getByText('Сегодня · 2 встречи и 1 задача')).toBeVisible();

  // Встречу можно поправить и удалить, а удалённую вернуть.
  await timeline(page).getByRole('button', { name: /Стоматолог/ }).click();
  const edit = sheet(page, 'Встреча');
  await expect(edit.getByLabel('Начало')).toHaveValue('10:00');
  await edit.getByLabel('Начало').fill('11:30');
  await edit.getByRole('button', { name: 'Сохранить' }).click();
  await expect(timeline(page).getByRole('button', { name: /^11:30–12:30, Стоматолог/ })).toBeVisible();
  await timeline(page).getByRole('button', { name: /Стоматолог/ }).click();
  await sheet(page, 'Встреча').getByRole('button', { name: 'Удалить встречу' }).click();
  await expect(timeline(page).getByRole('button', { name: /Стоматолог/ })).toHaveCount(0);
  await toast(page).getByRole('button', { name: 'Вернуть' }).click();
  await expect(timeline(page).getByRole('button', { name: /Стоматолог/ })).toHaveCount(1);

  // «Назад» на телефоне из дня ведёт к месяцу.
  await page.goBack();
  await expect(page.getByRole('heading', { name: 'Календарь', level: 1 })).toBeVisible();
});

test('по месяцу ходят стрелками, день листается, встреча на весь день', async ({ page }) => {
  await openGame(page, { time: at(9) });
  await page.getByRole('button', { name: /На завтра/ }).click();
  await page.getByRole('button', { name: /^Раньше: Сегодня/ }).click();
  await expect(page.getByRole('heading', { name: 'Пятница, 23 октября', level: 1 })).toBeVisible();
  await expect(page.locator('.tl-now')).toBeVisible();
  await page.getByRole('button', { name: 'Октябрь' }).click();

  const today = page.getByRole('button', { name: /^23 октября, пятница, сегодня/ });
  await expect(today).toHaveAttribute('aria-current', 'date');
  await today.focus();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('button', { name: /^6 ноября, пятница/ })).toBeFocused();
  await expect(page.getByRole('heading', { name: 'Ноябрь', level: 2 })).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Пятница, 6 ноября', level: 1 })).toBeVisible();

  await page.getByRole('button', { name: 'Встреча', exact: true }).click();
  const form = sheet(page, 'Новая встреча');
  await form.getByLabel('Что за встреча').fill('День рождения Кати');
  await form.getByRole('button', { name: 'Добавить в календарь' }).click();
  await expect(page.getByRole('region', { name: 'Весь день' })).toContainText('День рождения Кати');
  await page.getByRole('button', { name: 'Ноябрь' }).click();
  await expect(page.getByRole('button', { name: '6 ноября, пятница: 1 встреча' })).toBeVisible();

  // Месяцы листаются, а выбранный день остаётся прежним.
  await page.getByRole('button', { name: 'Позже: Декабрь' }).click();
  await expect(page.getByRole('heading', { name: 'Декабрь', level: 2 })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Пятница, 6 ноября' })).toBeVisible();
  await expectNoSideScroll(page);
});
