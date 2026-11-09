// Летопись: дневник, свои разделы и заметки. Быстрая мысль из лагеря, лента, статьи, «Назад» внутри
// Летописи, заметки и дни дневника в GitHub отдельными файлами в notes/ и diary/.
import { expect, test, type Page } from '@playwright/test';
import { axe, connectGitHub, expectNoSideScroll, fakeGitHub, openGame, openSettings, sheet, tab, toast } from './helpers';

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

  await expect(page.locator('.camp-book').getByRole('button', { name: 'Летопись' })).toHaveCount(0);
  await tab(page, 'Летопись').click();
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

test('дневник: метки в тексте, быстрые метки под полем и фильтр по метке', async ({ page }) => {
  const gh = await fakeGitHub(page);
  await openGame(page);
  await connectGitHub(page);
  await tab(page, 'Летопись').click();
  await page.getByRole('button', { name: /^Дневник/ }).click();
  const box = page.locator('.screen').getByLabel('Запись в дневник');
  const write = page.locator('.screen').getByRole('button', { name: 'Записать', exact: true });
  // Пока меток нет, фильтра тоже нет.
  await expect(page.getByRole('radiogroup', { name: 'Показать записи с меткой' })).toHaveCount(0);
  await box.fill('Планёрка затянулась #работа');
  await write.click();
  await box.fill('Летал над лесом #сны');
  await write.click();

  // Знакомая метка дописывается кнопкой под полем; уже написанной там нет.
  await box.fill('Сдал отчёт');
  const add = page.getByRole('group', { name: 'Добавить метку' });
  await expect(add.getByRole('button')).toHaveText(['#работа', '#сны']);
  await add.getByRole('button', { name: 'Добавить метку работа' }).click();
  await expect(box).toHaveValue('Сдал отчёт #работа ');
  await expect(add.getByRole('button')).toHaveText(['#сны']);
  await expect(box).toBeFocused();
  await write.click();

  // Фильтр: частые метки первыми, выбранная показывает только свои записи.
  const filter = page.getByRole('radiogroup', { name: 'Показать записи с меткой' });
  await expect(filter.getByRole('radio')).toHaveCount(3);
  await expect(filter.getByRole('radio').nth(1)).toHaveAccessibleName('#работа, 2 записи');
  await expect(filter.getByRole('radio').nth(2)).toHaveAccessibleName('#сны, 1 запись');
  await expect(filter.getByRole('radio', { name: 'все записи' })).toHaveAttribute('aria-checked', 'true');
  await filter.getByRole('radio', { name: /#сны/ }).click();
  await expect(page.getByText('С меткой #сны: 1 запись.')).toBeVisible();
  await expect(page.locator('.screen .nday .ncard')).toHaveCount(1);
  await expect(page.getByRole('button', { name: /Летал над лесом/ })).toBeVisible();
  await filter.getByRole('radio', { name: /#работа/ }).click();
  await expect(page.locator('.screen .nday .ncard')).toHaveCount(2);
  await filter.getByRole('radio', { name: 'все записи' }).click();
  await expect(page.locator('.screen .nday .ncard')).toHaveCount(3);
  await expectNoSideScroll(page);

  // В файле дня метки это просто текст записи.
  await page.clock.runFor(3000);
  await expect.poll(() => gh.notes.get('diary/2026/2026-10-23.md')?.text).toContain('Сдал отчёт #работа\n');
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
  // Панель оформления появляется, когда курсор в поле.
  await expect(sheet(page, 'Запись').getByRole('toolbar', { name: 'Оформление' })).toBeHidden();
  await sheet(page, 'Запись').getByRole('textbox', { name: 'Текст' }).click();
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

/** Новая статья с двумя разделами. Курсор в поле, файл ещё не сохранён. */
async function draftArticle(page: Page) {
  const gh = await fakeGitHub(page);
  await openGame(page);
  await connectGitHub(page);
  await tab(page, 'Летопись').click();
  await page.getByRole('button', { name: 'Новый раздел' }).click();
  const make = sheet(page, 'Новый раздел');
  await make.getByLabel('Название').fill('Статьи');
  await make.getByRole('radio', { name: 'Статьи' }).click();
  await make.getByRole('button', { name: 'Создать' }).click();
  await page.getByRole('button', { name: 'Новая статья' }).click();
  const form = sheet(page, 'Новая статья');
  await form.getByLabel('Заголовок', { exact: true }).fill('Поход');
  const box = form.getByRole('textbox', { name: 'Текст' });
  await box.click();
  await page.keyboard.type('Разведка');
  await form.getByRole('button', { name: 'Подзаголовок' }).click();
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Лес тихий');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Лагерь');
  await form.getByRole('button', { name: 'Подзаголовок' }).click();
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Костёр горит');
  return { gh, form, box };
}

const articleFile = (gh: Awaited<ReturnType<typeof fakeGitHub>>) => [...gh.notes.entries()].find(([p]) => p.startsWith('notes/stati/') && !p.endsWith('_razdel.json'))?.[1].text;

test('раздел сворачивается стрелкой и кнопкой, пометка ложится в файл, при чтении раздел свёрнут', async ({ page }) => {
  const { gh, form, box } = await draftArticle(page);
  const heads = box.locator('h3');
  await expect(heads).toHaveCount(2);

  // Стрелка у заголовка прячет текст раздела, соседний раздел остаётся.
  await heads.first().click({ position: { x: 12, y: 20 } });
  await expect(box.getByText('Лес тихий')).toBeHidden();
  await expect(box.getByText('Костёр горит')).toBeVisible();
  await heads.first().click({ position: { x: 12, y: 20 } });
  await expect(box.getByText('Лес тихий')).toBeVisible();

  // Кнопка на панели сворачивает раздел, где стоит курсор, и курсор уходит на заголовок.
  await box.getByText('Лес тихий').click();
  const foldBtn = form.getByRole('button', { name: 'Свернуть раздел' });
  await foldBtn.click();
  await expect(foldBtn).toHaveAttribute('aria-pressed', 'true');
  await expect(box.getByText('Лес тихий')).toBeHidden();

  // Enter в конце свёрнутого заголовка раскрывает раздел: новая строка не прячется.
  await page.keyboard.press('Enter');
  await expect(box.getByText('Лес тихий')).toBeVisible();
  await page.keyboard.press('Backspace');
  await heads.first().click({ position: { x: 12, y: 20 } });
  await expect(box.getByText('Лес тихий')).toBeHidden();

  await form.getByRole('button', { name: 'Сохранить' }).click();
  await page.clock.runFor(3000);
  await expect.poll(() => articleFile(gh)).toBe('# Поход\n\n### Разведка <!-- свёрнуто -->\n\nЛес тихий\n\n### Лагерь\n\nКостёр горит\n');

  // При чтении разделы сворачиваются, первый свёрнут, как сохранён.
  await page.getByRole('button', { name: /Поход/ }).click();
  const reading = sheet(page, 'Статья');
  await expect(reading.getByText('Лес тихий')).toBeHidden();
  await expect(reading.getByText('Костёр горит')).toBeVisible();
  await reading.getByRole('heading', { name: 'Разведка' }).click();
  await expect(reading.getByText('Лес тихий')).toBeVisible();
  expect(await axe(page), 'Статья с разделами').toEqual([]);

  // Правка открывается со свёрнутым разделом, текст из файла не теряется.
  await reading.getByRole('button', { name: 'Править' }).click();
  await expect(reading.getByRole('textbox', { name: 'Текст' }).getByText('Лес тихий')).toBeHidden();
});

test('удаление не съедает спрятанный текст: сначала раздел раскрывается', async ({ page }) => {
  const { form, box } = await draftArticle(page);
  await box.locator('h3').first().click({ position: { x: 12, y: 20 } });
  await expect(box.getByText('Лес тихий')).toBeHidden();

  await box.click();
  await page.keyboard.press('Control+A');
  await page.keyboard.press('Delete');
  await expect(toast(page)).toContainText('Раздел раскрыт');
  await expect(box.getByText('Лес тихий')).toBeVisible();
  await expect(form.getByRole('textbox', { name: 'Текст' })).toContainText('Костёр горит');
});

test('подчёркнутый, код цвета и снятие стилей; счётчик знаков и размер поля', async ({ page }) => {
  const { gh, form, box } = await draftArticle(page);
  await expect(form.locator('.rich-count')).toHaveText('35 знаков');

  // Статья сразу во всю длину, кнопка ограничивает поле, панель стоит у верха листа.
  const size = form.getByRole('button', { name: 'Свернуть поле' });
  await expect(box).toHaveCSS('max-height', 'none');
  await size.click();
  await expect(box).not.toHaveCSS('max-height', 'none');
  await form.getByRole('button', { name: 'Развернуть поле' }).click();
  await expect(box).toHaveCSS('max-height', 'none');
  await expect(form.locator('.rich-tools')).toHaveCSS('position', 'sticky');

  const select = (text: string) =>
    box.evaluate((el, what) => {
      const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      for (let n = w.nextNode(); n; n = w.nextNode()) {
        const at = n.textContent!.indexOf(what);
        if (at < 0) continue;
        const r = document.createRange();
        r.setStart(n, at);
        r.setEnd(n, at + what.length);
        getSelection()!.removeAllRanges();
        getSelection()!.addRange(r);
        return;
      }
    }, text);

  await select('тихий');
  await form.getByRole('button', { name: 'Подчёркнутый' }).click();
  await expect(box.locator('u')).toHaveText('тихий');
  await expect(form.getByRole('button', { name: 'Подчёркнутый' })).toHaveAttribute('aria-pressed', 'true');

  await select('Костёр');
  await form.getByRole('button', { name: 'Цвет', exact: true }).click();
  const code = form.getByLabel('Код цвета');
  await code.fill('нет');
  await page.keyboard.press('Enter');
  await expect(code).toHaveAttribute('aria-invalid', 'true');
  expect(await axe(page), 'Неверный код цвета').toEqual([]);
  await code.fill('f80');
  await form.getByRole('button', { name: 'Применить' }).click();
  await expect(form.getByRole('group', { name: 'Цвет' })).toBeHidden();
  await expect(box.locator('font')).toHaveText('Костёр');

  await select('горит');
  await form.getByRole('button', { name: 'Жирный' }).click();
  await box.evaluate((el) => getSelection()!.selectAllChildren(el.lastElementChild!));
  await form.getByRole('button', { name: 'Убрать стили' }).click();
  await expect(box.locator('font, b')).toHaveCount(0);

  await form.getByRole('button', { name: 'Сохранить' }).click();
  await page.clock.runFor(3000);
  await expect.poll(() => articleFile(gh)).toBe('# Поход\n\n### Разведка\n\nЛес <u>тихий</u>\n\n### Лагерь\n\nКостёр горит\n');
});

test('клавиатура телефона: лист с редактором встаёт над ней', async ({ page }) => {
  const { form } = await draftArticle(page);
  const overlay = page.locator('.overlay');
  const bottomOf = () => form.evaluate((el) => el.getBoundingClientRect().bottom);
  const before = await bottomOf();
  const covered = 300;
  await page.evaluate((px) => {
    const vv = window.visualViewport!;
    Object.defineProperty(vv, 'height', { configurable: true, get: () => window.innerHeight - px });
    vv.dispatchEvent(new Event('resize'));
  }, covered);
  await expect(overlay).toHaveCSS('bottom', `${covered}px`);
  expect(await bottomOf()).toBeLessThanOrEqual(before - covered + 1);
  await expect(form.getByRole('button', { name: 'Сохранить' })).toBeInViewport();
  await page.evaluate(() => {
    const vv = window.visualViewport!;
    delete (vv as unknown as Record<string, unknown>).height;
    vv.dispatchEvent(new Event('resize'));
  });
  await expect(overlay).toHaveCSS('bottom', '0px');
});

test('черновик: не в списке и не на GitHub, переживает закрытие, уходит после сохранения', async ({ page }) => {
  const { gh, form } = await draftArticle(page);
  await page.keyboard.press('Escape');
  await expect(form).toBeHidden();

  // В разделе строка черновика, статьи нет в файлах.
  const row = page.getByRole('button', { name: /Несохранённый черновик/ });
  await expect(row).toContainText('Поход');
  await page.clock.runFor(3000);
  expect(articleFile(gh)).toBeUndefined();
  expect(await axe(page), 'Раздел с черновиком').toEqual([]);

  // Лист открывается заново с тем же текстом и с предупреждением.
  await row.click();
  const open = sheet(page, 'Новая статья');
  await expect(open.getByText('Черновик не сохранён, он есть только на этом устройстве.')).toBeVisible();
  await expect(open.getByLabel('Заголовок', { exact: true })).toHaveValue('Поход');
  await expect(open.getByRole('textbox', { name: 'Текст' })).toContainText('Костёр горит');
  await expect(open.getByRole('button', { name: /Выбросить/ })).toHaveCount(0);
  expect(await axe(page), 'Лист с черновиком').toEqual([]);

  await open.getByRole('button', { name: 'Сохранить' }).click();
  await expect(row).toHaveCount(0);
  await page.clock.runFor(3000);
  await expect.poll(() => articleFile(gh)).toContain('Костёр горит');

  // Правка статьи: чтение черновика не создаёт, правка создаёт, и статья сразу открывается в поле.
  await page.getByRole('button', { name: /Поход/ }).click();
  await sheet(page, 'Статья').getByRole('button', { name: 'Править' }).click();
  await expect(row).toHaveCount(0);
  await sheet(page, 'Статья').getByLabel('Заголовок', { exact: true }).fill('Поход на север');
  await page.keyboard.press('Escape');
  await expect(row).toContainText('Поход на север');
  await row.click();
  await expect(sheet(page, 'Статья').getByLabel('Заголовок', { exact: true })).toHaveValue('Поход на север');

  // Вернул как было: черновика больше нет.
  await sheet(page, 'Статья').getByLabel('Заголовок', { exact: true }).fill('Поход');
  await page.keyboard.press('Escape');
  await expect(row).toHaveCount(0);
});
