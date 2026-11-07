// Летопись: дневник, свои разделы и заметки. Быстрая мысль из лагеря, лента, статьи, «Назад» внутри
// Летописи, заметки и дни дневника в GitHub отдельными файлами в notes/ и diary/.
import { expect, test, type Page } from '@playwright/test';
import { connectGitHub, expectNoSideScroll, fakeGitHub, openGame, openSettings, sheet, tab, toast } from './helpers';

const inCamp = (page: Page) => expect(tab(page, 'Лагерь')).toHaveAttribute('aria-current', 'page');

test('мысль из лагеря: первый раз заводит раздел «Идеи», запись видна в Летописи', async ({ page }) => {
  await openGame(page);
  await page.getByRole('button', { name: /Разжечь костёр/ }).click();
  await inCamp(page);

  await page.getByRole('button', { name: 'Записать мысль' }).click();
  const form = sheet(page, 'Записать мысль');
  await expect(form.getByLabel('Название раздела')).toHaveValue('Идеи');
  await form.getByLabel('Мысль').fill('Книга заметок у костра');
  await form.getByRole('button', { name: 'Записать', exact: true }).click();
  await expect(toast(page)).toHaveText('Записал, не потеряется');
  await inCamp(page);

  await page.locator('.camp-book').getByRole('button', { name: 'Летопись' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Летопись' })).toBeVisible();
  await expect(page.getByText('Заметки пока только в этом браузере')).toBeVisible();
  await page.getByRole('button', { name: /^Идеи/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Идеи' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Книга заметок у костра/ })).toBeVisible();

  // Вторая мысль идёт в тот же раздел без вопросов, прямо из поля ленты.
  await page.getByLabel('Новая запись').fill('Звук костра ночью');
  await page.getByRole('button', { name: 'Записать', exact: true }).click();
  await expect(page.locator('.ncard-text').first()).toHaveText('Звук костра ночью');
  await expectNoSideScroll(page);

  // «Назад»: из раздела к списку разделов, потом в Лагерь.
  await page.goBack();
  await expect(page.getByRole('heading', { level: 1, name: 'Летопись' })).toBeVisible();
  await page.goBack();
  await inCamp(page);
});

test('раздел статей: новая статья, правка заголовка, удаление; раздел переименовывается', async ({ page }) => {
  await openGame(page);
  await tab(page, 'Летопись').click();
  await page.getByRole('button', { name: 'Новый раздел' }).click();
  const make = sheet(page, 'Новый раздел');
  await make.getByLabel('Название').fill('Статьи');
  await make.getByRole('radio', { name: 'перо' }).click();
  await make.getByRole('radio', { name: 'Статьи' }).click();
  await make.getByRole('button', { name: 'Создать' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Статьи' })).toBeVisible();

  await page.getByRole('button', { name: 'Новая статья' }).click();
  const art = sheet(page, 'Новая статья');
  await art.getByLabel('Заголовок', { exact: true }).fill('Как я планирую день');
  await art.getByLabel('Текст').fill('Утро начинается с плана.\n\nПотом поход.');
  await art.getByRole('button', { name: 'Сохранить' }).click();
  await expect(page.locator('.ncard-title')).toHaveText('Как я планирую день');
  await expect(page.locator('.ncard-line')).toHaveText('Утро начинается с плана.');

  await page.getByRole('button', { name: /Как я планирую день/ }).click();
  const edit = sheet(page, 'Статья');
  await expect(edit.getByText('notes/stati/kak-ya-planiruyu-den.md')).toBeVisible();
  await expect(edit.locator('.nread p').last()).toHaveText('Потом поход.');
  await edit.getByRole('button', { name: 'Править' }).click();
  await edit.getByLabel('Заголовок', { exact: true }).fill('Мой день');
  await edit.getByRole('button', { name: 'Сохранить' }).click();
  await expect(page.locator('.ncard-title')).toHaveText('Мой день');

  await page.getByRole('button', { name: /Мой день/ }).click();
  await sheet(page, 'Статья').getByRole('button', { name: 'Править' }).click();
  page.once('dialog', (d) => void d.accept());
  await sheet(page, 'Статья').getByRole('button', { name: 'Удалить заметку' }).click();
  await expect(page.getByText('Статей пока нет.')).toBeVisible();

  await page.getByRole('button', { name: 'Настроить раздел' }).click();
  const conf = sheet(page, 'Раздел');
  await conf.getByLabel('Название').fill('Тексты');
  await conf.getByRole('button', { name: 'Сохранить' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Тексты' })).toBeVisible();
});

test('«Последние дни» теперь в Летописи, а распорядок и магия в Настройках', async ({ page }) => {
  await openGame(page);
  await tab(page, 'Летопись').click();
  await page.getByRole('button', { name: /Последние дни/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Последние дни' })).toBeVisible();
  await openSettings(page);
  await expect(page.getByRole('heading', { level: 1, name: 'Настройки' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Распорядок' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Последние дни' })).toHaveCount(0);
});

test('с GitHub заметка ложится в notes/ отдельным файлом и приходит на другое устройство', async ({ page, browser }) => {
  const gh = await fakeGitHub(page);
  await openGame(page);
  await connectGitHub(page);
  await tab(page, 'Летопись').click();
  await page.getByRole('button', { name: 'Записать мысль' }).click();
  const form = sheet(page, 'Записать мысль');
  await form.getByLabel('Мысль').fill('Идея для статьи о СДВГ');
  await form.getByRole('button', { name: 'Записать', exact: true }).click();
  await page.clock.runFor(3000);
  await expect(page.getByText('Всё сохранено в GitHub')).toBeVisible();
  expect([...gh.notes.keys()].sort()).toEqual(['notes/idei/2026-10-23-0900.md', 'notes/idei/_razdel.json']);
  expect(gh.notes.get('notes/idei/2026-10-23-0900.md')?.text).toBe('Идея для статьи о СДВГ\n');
  expect(gh.content).not.toContain('СДВГ');

  // Второе устройство с тем же GitHub видит раздел и запись.
  const other = await browser.newPage();
  const gh2 = await fakeGitHub(other);
  gh2.content = gh.content;
  gh2.sha = gh.sha;
  gh2.notes = new Map(gh.notes);
  await openGame(other);
  await connectGitHub(other);
  await tab(other, 'Летопись').click();
  await other.getByRole('button', { name: /^Идеи/ }).click();
  await expect(other.getByRole('button', { name: /Идея для статьи о СДВГ/ })).toBeVisible();
  await other.close();
});

test('дневник: записи за день в одном файле diary/2026/…, правка записи; мысль из лагеря тоже идёт в дневник', async ({ page }) => {
  const gh = await fakeGitHub(page);
  await openGame(page);
  await connectGitHub(page);
  await tab(page, 'Летопись').click();
  await page.getByRole('button', { name: /^Дневник/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Дневник' })).toBeVisible();
  await page.getByLabel('Запись в дневник').fill('Утром прошёлся пешком.');
  await page.getByRole('button', { name: 'Записать', exact: true }).click();
  await expect(page.locator('.nday-date').first()).toHaveText('Сегодня');
  await expect(page.locator('.ncard-text').first()).toHaveText('Утром прошёлся пешком.');

  await page.getByRole('button', { name: /Утром прошёлся пешком/ }).click();
  const edit = sheet(page, 'Запись в дневнике');
  await expect(edit.getByText('diary/2026/2026-10-23.md')).toBeVisible();
  await edit.getByLabel('Текст').fill('Утром прошёлся пешком до работы.');
  await edit.getByRole('button', { name: 'Сохранить' }).click();
  await expect(page.locator('.ncard-text').first()).toHaveText('Утром прошёлся пешком до работы.');
  await expectNoSideScroll(page);

  // Из лагеря: выбираю «Дневник», и в следующий раз он уже выбран.
  await tab(page, 'Лагерь').click();
  await page.getByRole('button', { name: 'Записать мысль' }).click();
  const form = sheet(page, 'Записать мысль');
  await form.getByRole('radio', { name: 'Дневник' }).click();
  await form.getByLabel('Мысль').fill('Вспомнил про отчёт.');
  await form.getByRole('button', { name: 'Записать', exact: true }).click();
  await page.clock.runFor(3000);
  await expect
    .poll(() => gh.notes.get('diary/2026/2026-10-23.md')?.text)
    .toMatch(/^## 09:0\d\n\nУтром прошёлся пешком до работы\.\n\n## 09:0\d\n\nВспомнил про отчёт\.\n$/);
  await page.getByRole('button', { name: 'Записать мысль' }).click();
  await expect(sheet(page, 'Записать мысль').getByRole('radio', { name: 'Дневник' })).toHaveAttribute('aria-checked', 'true');
});

test('дневник: у записи есть название, оно видно на карточке, правится и находится поиском', async ({ page }) => {
  const gh = await fakeGitHub(page);
  await openGame(page);
  await connectGitHub(page);
  await tab(page, 'Летопись').click();
  await page.getByRole('button', { name: /^Дневник/ }).click();
  await page.getByLabel('Название записи').fill('Прогулка');
  await page.getByLabel('Запись в дневник').fill('Утром прошёлся пешком.');
  await page.getByRole('button', { name: 'Записать', exact: true }).click();
  await expect(page.locator('.nday .ncard-title')).toHaveText('Прогулка');
  await expect(page.getByLabel('Название записи')).toHaveValue('');

  await page.getByRole('button', { name: /Прогулка/ }).click();
  const edit = sheet(page, 'Запись в дневнике');
  await expect(edit.getByLabel('Название')).toHaveValue('Прогулка');
  await edit.getByLabel('Название').fill('Утренняя прогулка');
  await edit.getByRole('button', { name: 'Сохранить' }).click();
  await expect(page.locator('.nday .ncard-title')).toHaveText('Утренняя прогулка');
  await page.clock.runFor(3000);
  await expect.poll(() => gh.notes.get('diary/2026/2026-10-23.md')?.text).toMatch(/^## 09:0\d Утренняя прогулка\n\nУтром прошёлся пешком\.\n$/);

  // Быстрая мысль: поле названия появляется, только когда выбран дневник.
  await tab(page, 'Лагерь').click();
  await page.getByRole('button', { name: 'Записать мысль' }).click();
  const form = sheet(page, 'Записать мысль');
  await form.getByRole('radio', { name: 'Дневник' }).click();
  await form.getByLabel('Название').fill('Отчёт');
  await form.getByLabel('Мысль').fill('Вспомнил про него.');
  await form.getByRole('button', { name: 'Записать', exact: true }).click();

  await tab(page, 'Летопись').click();
  await expect(page.locator('.nday .ncard-title')).toHaveText(['Утренняя прогулка', 'Отчёт']);
  await page.getByRole('main').getByRole('button', { name: 'Летопись' }).click();
  await page.getByLabel('Поиск по Летописи').fill('утренняя');
  await expect(page.locator('.nhit .ncard-title')).toHaveText('Утренняя прогулка');
  await expectNoSideScroll(page);
});

test('оформление: жирный и свой цвет в записи ленты ложатся в Markdown; поиск находит запись', async ({ page }) => {
  const gh = await fakeGitHub(page);
  await openGame(page);
  await connectGitHub(page);
  await tab(page, 'Летопись').click();
  await page.getByRole('button', { name: 'Записать мысль' }).click();
  const form = sheet(page, 'Записать мысль');
  await form.getByLabel('Мысль').fill('Важная идея про костёр');
  await form.getByRole('button', { name: 'Записать', exact: true }).click();
  await page.getByRole('button', { name: /^Идеи/ }).click();
  await page.getByRole('button', { name: /Важная идея про костёр/ }).click();

  const edit = sheet(page, 'Запись');
  const box = edit.getByRole('textbox', { name: 'Текст' });
  await expect(box).toHaveText('Важная идея про костёр');
  // Выделяю «Важная» и делаю жирным.
  await box.evaluate((el) => {
    const t = el.querySelector('p')!.firstChild!;
    const r = document.createRange();
    r.setStart(t, 0);
    r.setEnd(t, 6);
    getSelection()!.removeAllRanges();
    getSelection()!.addRange(r);
  });
  await edit.getByRole('button', { name: 'Жирный' }).click();
  await expect(edit.getByRole('button', { name: 'Жирный' })).toHaveAttribute('aria-pressed', 'true');
  // Выделяю «костёр» и красю своим цветом.
  await box.evaluate((el) => {
    const p = el.querySelector('p')!;
    const t = p.lastChild!;
    const at = t.textContent!.indexOf('костёр');
    const r = document.createRange();
    r.setStart(t, at);
    r.setEnd(t, at + 6);
    getSelection()!.removeAllRanges();
    getSelection()!.addRange(r);
  });
  await edit.getByRole('button', { name: 'Цвет', exact: true }).click();
  await edit.getByLabel('Свой цвет').evaluate((el: HTMLInputElement) => {
    el.value = '#12ab34';
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await edit.getByRole('button', { name: 'Сохранить' }).click();

  const card = page.locator('.ncard-text').first();
  await expect(card.locator('strong')).toHaveText('Важная');
  await expect(card.locator('span[style*="color"]')).toHaveText('костёр');
  await page.clock.runFor(3000);
  await expect
    .poll(() => [...gh.notes.entries()].find(([p]) => p.startsWith('notes/idei/2'))?.[1].text)
    .toBe('**Важная** идея про <span style="color:#12ab34">костёр</span>\n');

  // Свой цвет запомнился в палитре.
  await page.getByRole('button', { name: /Важная идея/ }).click();
  await sheet(page, 'Запись').getByRole('button', { name: 'Цвет', exact: true }).click();
  await expect(sheet(page, 'Запись').getByRole('button', { name: 'свой #12ab34' })).toBeVisible();
  await page.keyboard.press('Escape');

  // Поиск без учёта регистра и «ё».
  await page.goBack();
  await page.getByLabel('Поиск по Летописи').fill('КОСТЕР');
  await expect(page.locator('.nhit mark')).toHaveText('костёр');
  await page.locator('.nhit').click();
  await expect(sheet(page, 'Запись')).toBeVisible();
});
