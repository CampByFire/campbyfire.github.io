import { expect, test } from '@playwright/test';
import { addTask, openGame } from './helpers';

test('название и время задачи получает только порт оболочки', async ({ page }) => {
  await openGame(page);
  await addTask(page, 'Разобрать почту');
  await page.getByRole('button', { name: /Разжечь костёр/ }).click();
  await page.evaluate(() => {
    for (const origin of ['https://example.org', 'android-app://campbyfire.github.io/io.github.campbyfire.lager']) {
      const channel = new MessageChannel();
      const key = origin.startsWith('https:') ? 'outside' : 'timer';
      channel.port1.onmessage = event => { document.body.dataset[key] = event.data; };
      window.dispatchEvent(new MessageEvent('message', { origin, data: '', ports: [channel.port2] }));
    }
  });
  const body = page.locator('body');
  await expect(body).toHaveAttribute('data-timer', '{"status":"clear"}');
  const day = page.getByRole('region', { name: 'Задачи дня' });
  await day.getByRole('button', { name: 'Позвать к огню' }).click();
  await expect(body).toHaveAttribute('data-timer', /"status":"running","title":"Разобрать почту"/);
  await day.getByRole('button', { name: 'Пауза' }).click();
  await expect(body).toHaveAttribute('data-timer', /"status":"paused"/);
  expect(await body.getAttribute('data-outside')).toBeNull();
});
