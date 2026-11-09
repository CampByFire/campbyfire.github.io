// Доступность: проверка axe на главных экранах и листах, работа с клавиатуры.
// Как звучит игра в VoiceOver и TalkBack, проверяется руками: docs/screen-reader-check.md.
import { expect, test, type Page } from '@playwright/test';
import { addTask, axe, newFolder, newSection, openGame, openSettings, sheet, tab, write } from './helpers';

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
  await openSettings(page);
  expect(await axe(page), 'Настройки').toEqual([]);
  await tab(page, 'Добавить задачу').click();
  expect(await axe(page), 'Новая задача').toEqual([]);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Правила' }).click();
  expect(await axe(page), 'Правила').toEqual([]);
});

/** Кнопки и поля на экране и в открытом листе, которые меньше 44×44. Пустой список, если всё в порядке. */
const tooSmall = (page: Page) =>
  page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('.screen button, .screen input, [role="dialog"] button, [role="dialog"] input')]
      .filter((el) => !el.closest('[inert]') && !el.classList.contains('link-btn'))
      .map((el) => ({ el, box: el.getBoundingClientRect() }))
      .filter(({ box }) => box.width > 0 && (box.width < 43.5 || box.height < 43.5))
      .map(({ el, box }) => `${el.getAttribute('aria-label') ?? el.textContent ?? el.className}: ${Math.round(box.width)}×${Math.round(box.height)}`),
  );

test('axe не находит нарушений в Летописи и её листах', async ({ page }) => {
  await openGame(page);
  await tab(page, 'Летопись').click();
  expect(await axe(page), 'Летопись').toEqual([]);

  // Быстрая мысль. Первая заводит раздел ленты «Идеи».
  await page.getByRole('button', { name: 'Записать мысль' }).click();
  const thought = sheet(page, 'Записать мысль');
  expect(await axe(page), 'Записать мысль').toEqual([]);
  expect(await tooSmall(page), 'Записать мысль').toEqual([]);
  await thought.getByLabel('Мысль').fill('Искры над костром');
  await thought.getByRole('button', { name: 'Записать', exact: true }).click();
  await expect(thought).toBeHidden();

  // Поиск.
  await page.getByLabel('Поиск по Летописи').fill('искры');
  await expect(page.locator('.nhit')).toBeVisible();
  expect(await axe(page), 'Поиск').toEqual([]);
  await page.getByLabel('Поиск по Летописи').fill('такого нет');
  await expect(page.getByText('Ничего не нашлось.')).toBeVisible();
  expect(await axe(page), 'Поиск без результатов').toEqual([]);
  await page.getByLabel('Поиск по Летописи').fill('');

  // Лента и запись в ней.
  await page.getByRole('button', { name: /^Идеи/ }).click();
  expect(await axe(page), 'Лента').toEqual([]);
  expect(await tooSmall(page), 'Лента').toEqual([]);
  await page.getByRole('button', { name: /Искры над костром/ }).click();
  const note = sheet(page, 'Запись');
  await note.getByRole('textbox', { name: 'Текст' }).click();
  await expect(note.getByRole('toolbar', { name: 'Оформление' })).toBeVisible();
  expect(await axe(page), 'Запись').toEqual([]);
  await page.keyboard.press('Escape');
  await expect(note).toBeHidden();

  // Настройки раздела.
  await page.getByRole('button', { name: 'Настроить раздел' }).click();
  const conf = sheet(page, 'Раздел');
  await expect(conf.getByRole('radiogroup', { name: 'Значок' })).toBeVisible();
  expect(await axe(page), 'Раздел').toEqual([]);
  expect(await tooSmall(page), 'Раздел').toEqual([]);
  await page.keyboard.press('Escape');
  await expect(conf).toBeHidden();
  await page.goBack();

  // Новый раздел статей.
  await page.getByRole('button', { name: 'Новый раздел' }).click();
  const make = sheet(page, 'Новый раздел');
  expect(await axe(page), 'Новый раздел').toEqual([]);
  await make.getByLabel('Название').fill('Статьи');
  await make.getByRole('radio', { name: 'Статьи' }).click();
  await make.getByRole('button', { name: 'Создать' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Статьи' })).toBeVisible();
  expect(await axe(page), 'Раздел статей').toEqual([]);

  // Новая статья: панель оформления и выбор цвета.
  await page.getByRole('button', { name: 'Новая статья' }).click();
  const article = sheet(page, 'Новая статья');
  await article.getByLabel('Заголовок', { exact: true }).fill('Как я планирую день');
  await article.getByRole('textbox', { name: 'Текст' }).fill('Утро начинается с плана.');
  expect(await axe(page), 'Новая статья').toEqual([]);
  await article.getByRole('button', { name: 'Цвет', exact: true }).click();
  await expect(article.getByRole('group', { name: 'Цвет' })).toBeVisible();
  expect(await axe(page), 'Выбор цвета').toEqual([]);
  expect(await tooSmall(page), 'Выбор цвета').toEqual([]);
  await article.getByRole('button', { name: 'Сохранить' }).click();
  await expect(article).toBeHidden();

  // Статья для чтения.
  await page.getByRole('button', { name: /Как я планирую день/ }).click();
  const reading = sheet(page, 'Статья');
  await expect(reading.getByRole('button', { name: 'Править' })).toBeVisible();
  expect(await axe(page), 'Статья').toEqual([]);
  await page.keyboard.press('Escape');
  await expect(reading).toBeHidden();
  await page.goBack();

  // Дневник и запись в нём.
  await page.getByRole('button', { name: /^Дневник/ }).click();
  expect(await axe(page), 'Дневник').toEqual([]);
  await page.getByLabel('Название записи').fill('Прогулка');
  await page.getByLabel('Запись в дневник').fill('Утром прошёлся пешком.');
  await page.getByRole('button', { name: 'Записать', exact: true }).click();
  expect(await axe(page), 'Дневник с названием записи').toEqual([]);
  await page.getByRole('button', { name: /Утром прошёлся пешком/ }).click();
  await sheet(page, 'Запись в дневнике').getByRole('textbox', { name: 'Текст' }).click();
  await expect(sheet(page, 'Запись в дневнике').getByRole('toolbar', { name: 'Оформление' })).toBeVisible();
  expect(await axe(page), 'Запись в дневнике').toEqual([]);
  await page.keyboard.press('Escape');
  await page.goBack();

  // Последние дни.
  await page.getByRole('button', { name: /Последние дни/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Последние дни' })).toBeVisible();
  expect(await axe(page), 'Последние дни').toEqual([]);
});

test('axe не находит нарушений в папках Летописи и их листах', async ({ page }) => {
  await openGame(page);
  await newSection(page, 'Идеи');
  await write(page, 'Искры');
  await newFolder(page, 'Проекты');
  expect(await axe(page), 'Раздел с папками').toEqual([]);
  expect(await tooSmall(page), 'Раздел с папками').toEqual([]);
  await page.getByRole('button', { name: /^Проекты/ }).click();
  await newFolder(page, 'Сад');
  await page.getByRole('button', { name: /^Сад/ }).click();
  await expect(page.getByRole('navigation', { name: 'Где эта папка' })).toBeVisible();
  expect(await axe(page), 'Вложенная папка').toEqual([]);
  expect(await tooSmall(page), 'Вложенная папка').toEqual([]);

  await page.getByRole('button', { name: 'Новая папка' }).click();
  expect(await axe(page), 'Новая папка').toEqual([]);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Настроить папку' }).click();
  await expect(sheet(page, 'Папка')).toBeVisible();
  expect(await axe(page), 'Папка').toEqual([]);
  expect(await tooSmall(page), 'Папка').toEqual([]);
  await sheet(page, 'Папка').getByRole('button', { name: 'Перенести папку…' }).click();
  await expect(sheet(page, 'Перенести')).toBeVisible();
  expect(await axe(page), 'Перенести папку').toEqual([]);
  expect(await tooSmall(page), 'Перенести папку').toEqual([]);
  await page.keyboard.press('Escape');
  // После закрытия листа фокус возвращается на кнопку, которая его открыла.
  await expect(page.getByRole('button', { name: 'Настроить папку' })).toBeFocused();
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
