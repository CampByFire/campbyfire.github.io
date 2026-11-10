// Без сети: после первого визита игра открывается из сохранённых файлов.
import { expect, test } from '@playwright/test';
import { addTask, openGame } from './helpers';

test('после первого визита игра открывается без интернета', async ({ page, context }) => {
  await openGame(page);
  await addTask(page, 'Купить хлеб');
  // Service worker скачал файлы своей версии и взял страницу под себя.
  await page.waitForFunction(() => navigator.serviceWorker?.controller !== null && navigator.serviceWorker?.controller !== undefined);

  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('.app')).toBeVisible();
  await expect(page.getByRole('heading', { level: 1, name: 'Сбор отряда' })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Купить хлеб/ })).toBeVisible();
  // Картинки лагеря тоже из сохранённых.
  await page.getByRole('navigation', { name: 'Разделы' }).getByRole('button', { name: 'Лагерь', exact: true }).click();
  const bg = page.locator('.scene-bg');
  await expect(bg).toBeVisible();
  await expect.poll(() => bg.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
});
