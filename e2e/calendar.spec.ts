// Календарь: события и задачи на дату, шкала дня по часам, что стоит на завтра, вход из плана и из лагеря.
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

test('событие и задача на завтра: шкала дня, план и следующий день в лагере', async ({ page }) => {
  // Пятница, 23 октября, 9:00. Строка про завтра в плане открывает завтрашний день по часам.
  await openGame(page, { time: at(9) });
  await page.getByRole('button', { name: /На завтра ничего не запланировано/ }).click();
  await expect(page.getByRole('heading', { name: 'Суббота, 24 октября', level: 1 })).toBeVisible();
  await expect(page.getByText('Завтра · ничего не запланировано')).toBeVisible();
  expect(await axe(page), 'Пустой день').toEqual([]);
  expect(await tooSmall(page), 'Пустой день').toEqual([]);
  await expectNoSideScroll(page);

  // Событие одной фразой: день и время понимаются сами.
  await page.getByRole('button', { name: 'Событие', exact: true }).click();
  const form = sheet(page, 'Новое событие');
  await form.getByLabel('Что за событие').fill('завтра в 10 стоматолог');
  await expect(form.locator('#meet-hint')).toHaveText('Понял: завтра, суббота, 24 октября, в 10:00');
  await form.getByLabel('Конец').fill('10:45');
  await form.getByLabel('Где').fill('Ленина, 5');
  expect(await axe(page), 'Новое событие').toEqual([]);
  expect(await tooSmall(page), 'Новое событие').toEqual([]);
  await form.getByRole('button', { name: 'Добавить в календарь' }).click();
  await expect(form).toBeHidden();
  await expect(toast(page)).toHaveText('Событие в календаре: завтра в 10:00');
  await expect(timeline(page).getByRole('button', { name: '10:00–10:45, Стоматолог, событие · Ленина, 5' })).toBeVisible();

  // Нажатие на пустой час заводит событие на этот час.
  await page.locator('.tl').click({ position: { x: 200, y: 15 * 56 + 20 } });
  const slot = sheet(page, 'Новое событие');
  await expect(slot.getByLabel('Начало')).toHaveValue('15:00');
  await slot.getByLabel('Что за событие').fill('Созвон');
  await slot.getByRole('button', { name: 'Добавить в календарь' }).click();
  await expect(timeline(page).getByRole('button', { name: '15:00–16:00, Созвон, событие' })).toBeVisible();

  // Задача без времени встаёт в «Весь день».
  await page.getByRole('button', { name: 'Задача', exact: true }).click();
  const task = sheet(page, 'Новая задача');
  await task.getByLabel('Что сделать').fill('Купить торт');
  await task.getByRole('radiogroup', { name: 'Сфера или проект' }).getByRole('radio', { name: 'Дом и быт' }).click();
  await task.getByRole('button', { name: 'Взять в отряд' }).click();
  await expect(task).toBeHidden();
  await expect(page.getByRole('region', { name: 'Весь день' })).toContainText('Купить торт');
  await expect(page.getByText('Завтра · 2 события и 1 задача')).toBeVisible();
  expect(await axe(page), 'День по часам').toEqual([]);
  await expectNoSideScroll(page);

  // К месяцу: день выбран, под сеткой его список.
  await page.getByRole('button', { name: 'Октябрь' }).click();
  await expect(page.getByRole('heading', { name: 'Календарь', level: 1 })).toBeVisible();
  await expect(page.getByRole('button', { name: '24 октября, суббота: 2 события и 1 задача' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.cal-list .cal-row')).toHaveCount(3);
  await expect(page.locator('.page-sub')).toHaveText('Завтра 2 события и 1 задача, с 10:00.');
  expect(await axe(page), 'Месяц').toEqual([]);
  expect(await tooSmall(page), 'Месяц').toEqual([]);
  await expectNoSideScroll(page);

  // В плане на сегодня видно, что стоит на завтра. К костру торт сегодня не позван: он придёт завтра.
  await tab(page, 'План').click();
  await expect(page.getByRole('button', { name: /Завтра 2 события и 1 задача, с 10:00/ })).toBeVisible();
  await expect(page.locator('section').filter({ has: page.getByRole('heading', { name: 'К костру сегодня' }) })).not.toContainText('Купить торт');

  // Наступила суббота: события в плане дня, торт пришёл к костру, на кнопке календаря в лагере час ближайшего события.
  await setTime(page, at(9, 0, 24));
  await expect(page.locator('section').filter({ has: page.getByRole('heading', { name: 'События сегодня' }) })).toContainText('Стоматолог');
  await expect(page.locator('section').filter({ has: page.getByRole('heading', { name: 'К костру сегодня' }) })).toContainText('Купить торт');
  await tab(page, 'Лагерь').click();
  await page.getByRole('button', { name: 'Календарь: сегодня в 10:00 Стоматолог' }).click();
  await expect(page.getByText('Сегодня · 2 события и 1 задача')).toBeVisible();

  // Событие можно поправить и удалить, а удалённую вернуть.
  await timeline(page).getByRole('button', { name: /Стоматолог/ }).click();
  const edit = sheet(page, 'Событие');
  await expect(edit.getByLabel('Начало')).toHaveValue('10:00');
  await edit.getByLabel('Начало').fill('11:30');
  await edit.getByRole('button', { name: 'Сохранить' }).click();
  await expect(timeline(page).getByRole('button', { name: /^11:30–12:30, Стоматолог/ })).toBeVisible();
  await timeline(page).getByRole('button', { name: /Стоматолог/ }).click();
  await sheet(page, 'Событие').getByRole('button', { name: 'Удалить событие' }).click();
  await expect(timeline(page).getByRole('button', { name: /Стоматолог/ })).toHaveCount(0);
  await toast(page).getByRole('button', { name: 'Вернуть' }).click();
  await expect(timeline(page).getByRole('button', { name: /Стоматолог/ })).toHaveCount(1);

  // «Назад» на телефоне из дня ведёт к месяцу.
  await page.goBack();
  await expect(page.getByRole('heading', { name: 'Календарь', level: 1 })).toBeVisible();
});

test('серия событий: повтор до даты, цвет, пропуск одного дня и удаление всей серии', async ({ page }) => {
  // Пятница, 23 октября. Каждую неделю до 13 ноября включительно, зелёным.
  await openGame(page, { time: at(9) });
  await page.getByRole('button', { name: /На завтра/ }).click();
  await page.getByRole('button', { name: /^Раньше: Сегодня/ }).click();
  await page.getByRole('button', { name: 'Событие', exact: true }).click();
  const form = sheet(page, 'Новое событие');
  await form.getByLabel('Что за событие').fill('Планёрка в 10');
  await expect(form.getByLabel('Повторять до')).toHaveCount(0);
  await form.getByRole('radiogroup', { name: 'Повтор' }).getByRole('radio', { name: 'Каждую неделю' }).click();
  await expect(form.getByLabel('Первый день')).toHaveValue('2026-10-23');
  await form.getByLabel('Повторять до').fill('2026-11-13');
  await form.getByRole('radiogroup', { name: 'Цвет' }).getByRole('radio', { name: 'зелёное' }).click();
  expect(await axe(page), 'Новая серия').toEqual([]);
  expect(await tooSmall(page), 'Новая серия').toEqual([]);
  await expectNoSideScroll(page);
  await form.getByRole('button', { name: 'Добавить в календарь' }).click();
  await expect(form).toBeHidden();
  await expect(toast(page)).toHaveText(/Событие в календаре: .*в 10:00, каждую неделю/);

  // Дело на шкале в своём цвете, диктор слышит повтор и цвет словами.
  const first = timeline(page).getByRole('button', { name: /^10:00–11:00, Планёрка, событие · каждую неделю, цвет / });
  await expect(first).toHaveCSS('border-left-color', 'rgb(106, 168, 79)');
  expect(await axe(page), 'День с цветным событием').toEqual([]);

  // В сетке месяца серия стоит на своих днях, раньше первого и после последнего её нет.
  await page.getByRole('button', { name: 'Октябрь' }).click();
  await expect(page.getByRole('button', { name: '30 октября, пятница: 1 событие' })).toBeVisible();
  await expect(page.getByRole('button', { name: '16 октября, пятница: ничего' })).toBeVisible();
  await expect(page.locator('[data-day="2026-10-30"] .cal-mark-meet')).toHaveCSS('background-color', 'rgb(106, 168, 79)');
  await page.getByRole('button', { name: 'Позже: Ноябрь' }).click();
  await expect(page.getByRole('button', { name: '13 ноября, пятница: 1 событие' })).toBeVisible();
  await expect(page.getByRole('button', { name: '20 ноября, пятница: ничего' })).toBeVisible();
  expect(await axe(page), 'Месяц с цветной серией').toEqual([]);

  // Пропуск одного дня: остальные остаются, «Вернуть» отменяет.
  await page.getByRole('button', { name: /^6 ноября, пятница/ }).click();
  await timeline(page).getByRole('button', { name: /Планёрка/ }).click();
  const edit = sheet(page, 'Событие');
  await expect(edit.getByLabel('Первый день')).toHaveValue('2026-10-23');
  await expect(edit.getByRole('radiogroup', { name: 'Цвет' }).getByRole('radio', { name: 'зелёное' })).toBeChecked();
  expect(await axe(page), 'Лист серии').toEqual([]);
  expect(await tooSmall(page), 'Лист серии').toEqual([]);
  await edit.getByRole('button', { name: /Пропустить только этот день/ }).click();
  await expect(timeline(page).getByRole('button', { name: /Планёрка/ })).toHaveCount(0);
  await toast(page).getByRole('button', { name: 'Вернуть' }).click();
  await expect(timeline(page).getByRole('button', { name: /Планёрка/ })).toHaveCount(1);
  await timeline(page).getByRole('button', { name: /Планёрка/ }).click();
  await sheet(page, 'Событие').getByRole('button', { name: /Пропустить только этот день/ }).click();
  await expect(timeline(page).getByRole('button', { name: /Планёрка/ })).toHaveCount(0);

  // Правка из другого дня меняет всю серию: свой цвет кодом, новое время.
  await page.getByRole('button', { name: /^Позже: / }).click();
  await page.getByRole('button', { name: /^Позже: / }).click();
  await expect(page.getByRole('heading', { name: 'Воскресенье, 8 ноября', level: 1 })).toBeVisible();
  for (let i = 0; i < 5; i++) await page.getByRole('button', { name: /^Позже: / }).click();
  await expect(page.getByRole('heading', { name: 'Пятница, 13 ноября', level: 1 })).toBeVisible();
  await timeline(page).getByRole('button', { name: /Планёрка/ }).click();
  const series = sheet(page, 'Событие');
  await series.getByLabel('Начало').fill('12:00');
  await series.getByRole('radiogroup', { name: 'Цвет' }).getByRole('radio', { name: /Свой цвет/ }).click();
  await series.getByLabel('Код цвета').fill('#2BB3A3');
  await series.getByRole('button', { name: 'Сохранить всю серию' }).click();
  await expect(timeline(page).getByRole('button', { name: /^12:00–13:00, Планёрка/ })).toHaveCSS('border-left-color', 'rgb(43, 179, 163)');
  await page.getByRole('button', { name: /^Раньше: / }).click();
  await expect(page.getByRole('heading', { name: 'Четверг, 12 ноября', level: 1 })).toBeVisible();
  await expect(timeline(page).getByRole('button', { name: /Планёрка/ })).toHaveCount(0);
  for (let i = 0; i < 6; i++) await page.getByRole('button', { name: /^Раньше: / }).click();
  await expect(page.getByRole('heading', { name: 'Пятница, 6 ноября', level: 1 })).toBeVisible();
  await expect(timeline(page).getByRole('button', { name: /Планёрка/ })).toHaveCount(0);

  // Обычный цвет можно вернуть, серию удалить целиком и вернуть.
  await page.getByRole('button', { name: /^Раньше: / }).click();
  for (let i = 0; i < 6; i++) await page.getByRole('button', { name: /^Раньше: / }).click();
  await expect(page.getByRole('heading', { name: 'Пятница, 30 октября', level: 1 })).toBeVisible();
  await timeline(page).getByRole('button', { name: /^12:00–13:00, Планёрка/ }).click();
  const again = sheet(page, 'Событие');
  await again.getByRole('radiogroup', { name: 'Цвет' }).getByRole('radio', { name: 'Обычный' }).click();
  await again.getByRole('button', { name: 'Сохранить всю серию' }).click();
  await expect(timeline(page).getByRole('button', { name: /^12:00–13:00, Планёрка, событие · каждую неделю$/ })).toBeVisible();
  await timeline(page).getByRole('button', { name: /Планёрка/ }).click();
  await sheet(page, 'Событие').getByRole('button', { name: 'Удалить всю серию' }).click();
  await expect(toast(page)).toContainText('Серия событий удалена');
  await expect(timeline(page).getByRole('button', { name: /Планёрка/ })).toHaveCount(0);
  await toast(page).getByRole('button', { name: 'Вернуть' }).click();
  await expect(timeline(page).getByRole('button', { name: /Планёрка/ })).toHaveCount(1);
});

test('по месяцу ходят стрелками, день листается, событие на весь день', async ({ page }) => {
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

  await page.getByRole('button', { name: 'Событие', exact: true }).click();
  const form = sheet(page, 'Новое событие');
  await form.getByLabel('Что за событие').fill('День рождения Кати');
  await form.getByRole('button', { name: 'Добавить в календарь' }).click();
  await expect(page.getByRole('region', { name: 'Весь день' })).toContainText('День рождения Кати');
  await page.getByRole('button', { name: 'Ноябрь' }).click();
  await expect(page.getByRole('button', { name: '6 ноября, пятница: 1 событие' })).toBeVisible();

  // Месяцы листаются, а выбранный день остаётся прежним.
  await page.getByRole('button', { name: 'Позже: Декабрь' }).click();
  await expect(page.getByRole('heading', { name: 'Декабрь', level: 2 })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Пятница, 6 ноября' })).toBeVisible();
  await expectNoSideScroll(page);
});

/**
 * Где дело, когда оно встало на место. Дело ставим в середину шкалы: у нижнего края его может закрыть
 * сообщение внизу экрана (например, «Разбойник в отряде»), и мышь возьмёт сообщение, а не дело.
 * Сразу после нового дела шкала ещё может ехать, поэтому ждём, пока оно перестанет двигаться.
 */
async function steadyBox(ev: ReturnType<Page['locator']>) {
  await ev.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  let prev = await ev.boundingBox();
  for (let i = 0; i < 40; i++) {
    await ev.page().waitForTimeout(50);
    const box = await ev.boundingBox();
    if (box && prev && box.x === prev.x && box.y === prev.y && box.height === prev.height) return box;
    prev = box;
  }
  return prev!;
}

/** Протащить дело мышью на dy пикселей вниз (вверх, если меньше нуля). */
async function dragMouse(page: Page, ev: ReturnType<Page['locator']>, dy: number) {
  const box = await steadyBox(ev);
  const x = box.x + box.width / 2;
  const y = box.y + Math.min(12, box.height / 2);
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (let i = 1; i <= 6; i++) await page.mouse.move(x, y + (dy * i) / 6);
  await page.mouse.up();
}

/** Долгое нажатие пальцем и протаскивание на dy пикселей, как на телефоне. */
async function dragTouch(page: Page, ev: ReturnType<Page['locator']>, dy: number, holdMs = 600) {
  const box = await steadyBox(ev);
  const x = Math.round(box.x + box.width / 2);
  const y = Math.round(box.y + Math.min(12, box.height / 2));
  const cdp = await page.context().newCDPSession(page);
  const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', ty: number) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y: ty }] });
  await touch('touchStart', y);
  await page.waitForTimeout(holdMs);
  for (let i = 1; i <= 6; i++) await touch('touchMove', Math.round(y + (dy * i) / 6));
  await touch('touchEnd', y + dy);
  await cdp.detach();
}

test('дела на шкале дня переносятся перетаскиванием, пальцем и с клавиатуры', async ({ page }) => {
  // Пятница, 23 октября. На завтра событие с 10:00 до 10:45.
  await openGame(page, { time: at(9) });
  await page.getByRole('button', { name: /На завтра ничего не запланировано/ }).click();
  await page.getByRole('button', { name: 'Событие', exact: true }).click();
  const form = sheet(page, 'Новое событие');
  await form.getByLabel('Что за событие').fill('завтра в 10 стоматолог');
  await form.getByLabel('Конец').fill('10:45');
  await form.getByRole('button', { name: 'Добавить в календарь' }).click();
  await expect(form).toBeHidden();
  const dentist = timeline(page).getByRole('button', { name: /Стоматолог/ });
  await expect(dentist).toHaveAccessibleName('10:00–10:45, Стоматолог, событие');

  // Мышью на два часа ниже: длина та же, лист не открылся, «Вернуть» ставит обратно.
  await dragMouse(page, dentist, 2 * 56);
  await expect(toast(page)).toContainText('Событие перенесено на 12:00');
  await expect(dentist).toHaveAccessibleName('12:00–12:45, Стоматолог, событие');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await toast(page).getByRole('button', { name: 'Вернуть' }).click();
  await expect(dentist).toHaveAccessibleName('10:00–10:45, Стоматолог, событие');

  // Пальцем: короткое касание открывает лист, долгое нажатие берёт дело и переносит на час позже.
  await dragTouch(page, dentist, 56);
  await expect(dentist).toHaveAccessibleName('11:00–11:45, Стоматолог, событие');
  await expect(page.getByRole('dialog')).toHaveCount(0);

  // С клавиатуры: Alt со стрелкой сдвигает на 15 минут.
  await dentist.focus();
  await page.keyboard.press('Alt+ArrowUp');
  await expect(dentist).toHaveAccessibleName('10:45–11:30, Стоматолог, событие');
  await expect(dentist).toBeFocused();

  // Задача со временем тоже переезжает.
  await page.getByRole('button', { name: 'Задача', exact: true }).click();
  const task = sheet(page, 'Новая задача');
  await task.getByLabel('Что сделать').fill('Купить торт в 17:00');
  await task.getByRole('radiogroup', { name: 'Сфера или проект' }).getByRole('radio', { name: 'Дом и быт' }).click();
  await task.getByRole('button', { name: 'Взять в отряд' }).click();
  await expect(task).toBeHidden();
  const cake = timeline(page).getByRole('button', { name: /Купить торт/ });
  await expect(cake).toHaveAccessibleName(/^17:00–/);
  await dragMouse(page, cake, -56);
  await expect(toast(page)).toContainText('Задача перенесена на 16:00');
  await expect(cake).toHaveAccessibleName(/^16:00–/);

  // Повторяющееся событие спрашивает: только этот день или вся серия.
  await page.getByRole('button', { name: 'Событие', exact: true }).click();
  const meet = sheet(page, 'Новое событие');
  await meet.getByLabel('Что за событие').fill('Планёрка в 8');
  await meet.getByRole('radiogroup', { name: 'Повтор' }).getByRole('radio', { name: 'Каждую неделю' }).click();
  await meet.getByRole('button', { name: 'Добавить в календарь' }).click();
  await expect(meet).toBeHidden();
  const standup = timeline(page).getByRole('button', { name: /Планёрка/ });
  await dragMouse(page, standup, 56);
  const ask = sheet(page, 'Перенести событие');
  await expect(ask).toContainText('Перенести на 9:00 только этот день или все дни серии?');
  expect(await axe(page), 'Перенос дня серии').toEqual([]);
  expect(await tooSmall(page), 'Перенос дня серии').toEqual([]);
  await ask.getByRole('button', { name: /Только этот день/ }).click();
  await expect(ask).toBeHidden();
  await expect(standup).toHaveAccessibleName('9:00–10:00, Планёрка, событие');
  // Через неделю серия стоит как была.
  for (let i = 0; i < 7; i++) await page.getByRole('button', { name: /^Позже: / }).click();
  await expect(page.getByRole('heading', { name: 'Суббота, 31 октября', level: 1 })).toBeVisible();
  await expect(standup).toHaveAccessibleName('8:00–9:00, Планёрка, событие · каждую неделю');
  // А «Все дни серии» двигает и этот день, и остальные.
  await dragMouse(page, standup, 2 * 56);
  await sheet(page, 'Перенести событие').getByRole('button', { name: 'Все дни серии' }).click();
  await expect(toast(page)).toContainText('Вся серия теперь в 10:00');
  await expect(standup).toHaveAccessibleName('10:00–11:00, Планёрка, событие · каждую неделю');
  await page.getByRole('button', { name: /^Позже: / }).click();
  for (let i = 0; i < 6; i++) await page.getByRole('button', { name: /^Позже: / }).click();
  await expect(standup).toHaveAccessibleName('10:00–11:00, Планёрка, событие · каждую неделю');
  expect(await axe(page), 'День после переноса').toEqual([]);
});
