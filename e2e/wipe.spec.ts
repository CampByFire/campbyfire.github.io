// «Стереть всё» в Настройках: игра уходит из браузера, по желанию вместе с сохранением в GitHub.
import { expect, test } from '@playwright/test';
import { addTask, connectGitHub, fakeGitHub, openGame, openSettings, sheet, tab } from './helpers';

test('стёртая игра начинается заново со знакомства', async ({ page }) => {
  await openGame(page, { intro: true });
  await page.getByRole('button', { name: 'Пропустить' }).click();
  await addTask(page, 'Купить хлеб');
  await tab(page, 'Летопись').click();
  await page.getByRole('button', { name: 'Записать мысль' }).click();
  await sheet(page, 'Записать мысль').getByLabel('Мысль').fill('Личная мысль');
  await sheet(page, 'Записать мысль').getByRole('button', { name: 'Записать', exact: true }).click();
  await openSettings(page);
  await page.getByRole('button', { name: 'Стереть игру…' }).click();
  const confirm = sheet(page, 'Стереть всё');
  await expect(confirm.getByText('Часть заметок есть только в этом браузере')).toBeVisible();
  await confirm.getByRole('button', { name: 'Стереть игру', exact: true }).click();

  await expect(sheet(page, 'Знакомство')).toBeVisible();
  await page.getByRole('button', { name: 'Пропустить' }).click();
  await expect(page.getByRole('button', { name: /^Купить хлеб/ })).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('taskcraft-lager-github'))).toBeNull();
  expect(await page.evaluate(() => localStorage.getItem('taskcraft-lager-notes'))).toBeNull();
  await tab(page, 'Летопись').click();
  await expect(page.getByRole('button', { name: /^Идеи/ })).toHaveCount(0);
});

test('вместе с сохранением в GitHub: без связи ничего не стирается, со связью уходят оба', async ({ page }) => {
  const gh = await fakeGitHub(page);
  await openGame(page, { intro: true });
  await page.getByRole('button', { name: 'Пропустить' }).click();
  await connectGitHub(page);
  await addTask(page, 'Купить хлеб');
  await page.getByRole('button', { name: 'Стереть игру…' }).click();
  const confirm = sheet(page, 'Стереть всё');
  await confirm.getByLabel('Удалить и сохранение в GitHub').check();

  gh.mode = 'down';
  await confirm.getByRole('button', { name: 'Стереть игру и сохранение' }).click();
  await expect(confirm).toContainText('Сохранение в GitHub не удалилось, и игра не стёрта.');
  expect(gh.content).not.toBeNull();

  gh.mode = 'ok';
  await confirm.getByRole('button', { name: 'Стереть игру и сохранение' }).click();
  await expect(sheet(page, 'Знакомство')).toBeVisible();
  expect(gh.content).toBeNull();
});
