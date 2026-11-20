// Новая задача: уровень следует за временем, отдельно его не выбирают.
import { expect, test } from '@playwright/test';
import { expandTaskForm, addTask, axe, openGame, sheet, tab, toast } from './helpers';

test('короткая форма сохраняет задачу одной фразой без раскрытия подробностей', async ({ page }, testInfo) => {
  await openGame(page);
  await tab(page, 'Добавить задачу').click();
  const form = sheet(page, 'Новая задача');
  await expect(form.getByRole('radiogroup', { name: 'Сфера или проект' }).getByRole('radio')).toHaveCount(5);
  await expect(form.getByLabel('Во сколько')).toBeHidden();
  await expect(form.getByRole('radiogroup', { name: 'Повторять' })).toHaveCount(0);
  await form.getByLabel('Что сделать').fill('завтра в 19:00 позвонить маме #семья');
  await expect(form.getByRole('radio', { name: 'сфера Семья и отношения', exact: true })).toBeChecked();
  expect(await axe(page), 'Короткая форма').toEqual([]);
  await page.screenshot({ path: testInfo.outputPath('novaya-zadacha.png') });
  await form.getByLabel('Что сделать').press('Enter');
  await expect(form).toBeHidden();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('taskcraft-lager-v1')!).tasks[0]);
  expect(saved).toMatchObject({ title: 'Позвонить маме', day: '2026-10-24', at: '19:00' });
});

test('подробности сохраняют выбор при сворачивании, последняя сфера видна в новой форме', async ({ page }) => {
  await openGame(page);
  await tab(page, 'Добавить задачу').click();
  const form = sheet(page, 'Новая задача');
  await form.getByLabel('Что сделать').fill('Почитать книгу');
  await expandTaskForm(form);
  await form.getByRole('radio', { name: 'сфера Развитие', exact: true }).click();
  await form.getByLabel('Во сколько').fill('17:30');
  const details = form.locator('details.form-details');
  await details.locator('summary').click();
  await details.locator('summary').focus();
  await page.keyboard.press('Enter');
  await expect(form.getByLabel('Во сколько')).toHaveValue('17:30');
  expect(await axe(page), 'Подробная форма').toEqual([]);
  await details.locator('summary').click();
  await form.getByRole('button', { name: 'Взять в отряд' }).click();
  await tab(page, 'Добавить задачу').click();
  await expect(form.getByRole('radio', { name: 'сфера Развитие', exact: true })).toBeVisible();
  await expect(form.getByLabel('Во сколько')).toBeHidden();
});

test('время задачи само задаёт уровень и спутника', async ({ page }) => {
  await openGame(page);
  await tab(page, 'Добавить задачу').click();
  const form = sheet(page, 'Новая задача');
  await expandTaskForm(form);
  await expect(form.getByRole('radiogroup', { name: /уровень/i })).toHaveCount(1);
  const size = form.getByRole('radiogroup', { name: /^Сколько займёт/ });
  await expect(size).toHaveAccessibleName('Сколько займёт: разбойник, уровень 1');
  await size.getByRole('radio', { name: '4 ч', exact: true }).click();
  await expect(size).toHaveAccessibleName('Сколько займёт: маг, уровень 3');
  await expect(form).toContainText('маг, III уровень');
  await size.getByRole('radio', { name: 'дни', exact: true }).click();
  await expect(size).toHaveAccessibleName('Сколько займёт: рыцарь, уровень 4');
  await page.keyboard.press('Escape');

  await addTask(page, 'Собрать шкаф', { size: '4 ч' });
  await expect(toast(page)).toHaveText('Маг в отряде');
});
