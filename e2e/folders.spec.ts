// Папки в разделах Летописи: папка в папке, путь и «Назад», перенос заметки и папки, переименование,
// удаление с подъёмом содержимого наверх, файлы в GitHub. Идёт на телефоне и на компьютере; axe для папок в a11y.spec.ts.
import { expect, test, type Page } from '@playwright/test';
import { connectGitHub, expectNoSideScroll, fakeGitHub, newFolder, newSection, openGame, sheet, tab, toast, write } from './helpers';

const h1 = (page: Page, name: string) => page.getByRole('heading', { level: 1, name });

test('папка в папке: путь, «Назад» по уровням, перенос заметки с «Вернуть», переименование и удаление', async ({ page }) => {
  await openGame(page);
  await newSection(page, 'Идеи');
  await write(page, 'Верхняя мысль');

  await newFolder(page, 'Проекты');
  await expect(toast(page)).toHaveText('Папка создана');
  await expect(page.getByRole('heading', { level: 2, name: 'Папки' })).toBeVisible();
  await page.getByRole('button', { name: /^Проекты.*0 заметок/ }).click();
  await expect(h1(page, 'Проекты')).toBeVisible();
  await expect(page.getByText('В папке пока пусто.')).toBeVisible();
  await write(page, 'Мысль в проектах');

  await newFolder(page, 'Сад');
  await page.getByRole('button', { name: /^Сад/ }).click();
  await expect(h1(page, 'Сад')).toBeVisible();
  // Глубже первого уровня виден путь: раздел и папка над этой.
  const path = page.getByRole('navigation', { name: 'Где эта папка' });
  await expect(path.getByRole('button')).toHaveText(['Идеи', 'Проекты']);
  await expect(page.locator('.screen .nback')).toHaveText('Проекты');
  await expectNoSideScroll(page);

  // «Назад» телефона поднимается на одну папку, потом к разделу, потом к списку разделов.
  await page.goBack();
  await expect(h1(page, 'Проекты')).toBeVisible();
  await page.getByRole('button', { name: /^Сад/ }).click();
  await path.getByRole('button', { name: 'Идеи' }).click();
  await expect(h1(page, 'Идеи')).toBeVisible();
  await expect(page.getByRole('button', { name: /^Проекты.*1 заметка/ })).toBeVisible();

  // Перенос заметки в папку и «Вернуть».
  await page.getByRole('button', { name: /Верхняя мысль/ }).click();
  await sheet(page, 'Запись').getByRole('button', { name: 'Перенести в папку…' }).click();
  const move = sheet(page, 'Перенести');
  await expect(move.getByRole('button', { name: /Идеи.*сейчас здесь/ })).toBeDisabled();
  await move.getByRole('button', { name: 'Сад' }).click();
  await expect(toast(page)).toContainText('Заметка теперь в «Сад»');
  await expect(page.getByRole('button', { name: /Верхняя мысль/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^Проекты.*2 заметки/ })).toBeVisible();
  await toast(page).getByRole('button', { name: 'Вернуть' }).click();
  await expect(page.getByRole('button', { name: /Верхняя мысль/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Проекты.*1 заметка/ })).toBeVisible();

  // Папку можно переименовать.
  await page.getByRole('button', { name: /^Проекты/ }).click();
  await page.getByRole('button', { name: 'Настроить папку' }).click();
  const conf = sheet(page, 'Папка');
  await expect(conf.getByText('1 заметка, вложенных папок: 1')).toBeVisible();
  await conf.getByLabel('Название').fill('Дела');
  await conf.getByRole('button', { name: 'Сохранить' }).click();
  await expect(h1(page, 'Дела')).toBeVisible();

  // Удаление непустой папки: всё из неё поднимается в раздел.
  await page.getByRole('button', { name: 'Настроить папку' }).click();
  await sheet(page, 'Папка').getByRole('button', { name: 'Удалить папку, всё из неё в «Идеи»' }).click();
  await expect(toast(page)).toContainText('Папка удалена, всё из неё теперь в «Идеи»');
  await expect(h1(page, 'Идеи')).toBeVisible();
  await expect(page.getByRole('button', { name: /Мысль в проектах/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Сад.*0 заметок/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Дела/ })).toHaveCount(0);

  // Пустая папка удаляется одной кнопкой.
  await page.getByRole('button', { name: /^Сад/ }).click();
  await page.getByRole('button', { name: 'Настроить папку' }).click();
  await sheet(page, 'Папка').getByRole('button', { name: 'Удалить папку', exact: true }).click();
  await expect(h1(page, 'Идеи')).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: 'Папки' })).toHaveCount(0);
});

test('статья в папке и перенос папки в другую; в GitHub это подпапки раздела', async ({ page }) => {
  const gh = await fakeGitHub(page);
  await openGame(page);
  await connectGitHub(page);
  await tab(page, 'Летопись').click();
  await page.getByRole('button', { name: 'Новый раздел' }).click();
  const make = sheet(page, 'Новый раздел');
  await make.getByLabel('Название').fill('Статьи');
  await make.getByRole('radio', { name: 'Статьи' }).click();
  await make.getByRole('button', { name: 'Создать' }).click();

  await newFolder(page, 'Походы');
  await newFolder(page, 'Архив');
  await page.getByRole('button', { name: /^Походы/ }).click();
  await page.getByRole('button', { name: 'Новая статья' }).click();
  const art = sheet(page, 'Новая статья');
  await art.getByLabel('Заголовок', { exact: true }).fill('Кавказ');
  await art.getByLabel('Текст').fill('Горы и тропы.');
  await art.getByRole('button', { name: 'Сохранить' }).click();
  await expect(page.locator('.ncard-title')).toHaveText('Кавказ');

  // Папку «Походы» вместе со статьёй переносим в «Архив», и она остаётся открытой на новом месте.
  await page.getByRole('button', { name: 'Настроить папку' }).click();
  await sheet(page, 'Папка').getByRole('button', { name: 'Перенести папку…' }).click();
  const move = sheet(page, 'Перенести');
  await expect(move.getByRole('button', { name: /^Походы/ })).toHaveCount(0);
  await move.getByRole('button', { name: 'Архив' }).click();
  await expect(toast(page)).toContainText('Папка теперь в «Архив»');
  await expect(h1(page, 'Походы')).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Где эта папка' }).getByRole('button')).toHaveText(['Статьи', 'Архив']);

  await page.goBack();
  await expect(h1(page, 'Архив')).toBeVisible();
  await page.goBack();
  await expect(h1(page, 'Статьи')).toBeVisible();
  await page.goBack();
  await expect(h1(page, 'Летопись')).toBeVisible();
  await page.clock.runFor(3000);
  await expect(page.getByText('Всё сохранено в GitHub')).toBeVisible();
  expect([...gh.notes.keys()].sort()).toEqual([
    'notes/stati/_razdel.json',
    'notes/stati/arhiv/_papka.json',
    'notes/stati/arhiv/pohody/_papka.json',
    'notes/stati/arhiv/pohody/kavkaz.md',
  ]);
  expect(gh.notes.get('notes/stati/arhiv/pohody/_papka.json')?.text).toBe('{\n  "title": "Походы"\n}\n');

  // Поиск говорит, в какой папке нашлось.
  await page.getByLabel('Поиск по Летописи').fill('тропы');
  await expect(page.locator('.nhit .ncard-date')).toHaveText('Статьи · Походы');
});
