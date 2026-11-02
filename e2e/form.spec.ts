// Новая задача: уровень следует за временем, отдельно его не выбирают.
import { expect, test } from '@playwright/test';
import { addTask, openGame, sheet, tab, toast } from './helpers';

test('время задачи само задаёт уровень и спутника', async ({ page }) => {
  await openGame(page);
  await tab(page, 'Добавить задачу').click();
  const form = sheet(page, 'Новая задача');
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
