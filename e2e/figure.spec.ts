// Нажатие на саму фигуру у костра открывает её задачу, как номер над ней.
// Прозрачные поля картинки вокруг фигуры нажатие не ловят.
import { expect, test, type Page } from '@playwright/test';
import { addTask, openGame } from './helpers';

/** Точки экрана на фигуре задачи: плотный пиксель у середины фигуры и прозрачный угол её картинки. */
async function figurePoints(page: Page, title: string) {
  const id = await page.locator('.fig-mark', { has: page.getByRole('button', { name: new RegExp(title) }) }).getAttribute('data-task');
  const img = page.locator(`img.fig[data-task="${id}"]`);
  await expect(img).toBeVisible();
  return img.evaluate(async (el: HTMLImageElement) => {
    await el.decode();
    const c = document.createElement('canvas');
    c.width = el.naturalWidth;
    c.height = el.naturalHeight;
    const ctx = c.getContext('2d')!;
    ctx.drawImage(el, 0, 0);
    const a = ctx.getImageData(0, 0, c.width, c.height).data;
    const r = el.getBoundingClientRect();
    const toScreen = (x: number, y: number) => ({ x: r.left + ((x + 0.5) / c.width) * r.width, y: r.top + ((y + 0.5) / c.height) * r.height });
    // Плотный пиксель, ближайший к середине непрозрачной части картинки.
    let sx = 0, sy = 0, n = 0;
    for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) if (a[(y * c.width + x) * 4 + 3] === 255) (sx += x), (sy += y), n++;
    const cx = sx / n, cy = sy / n;
    let best = { x: 0, y: 0, d: Infinity };
    for (let y = 0; y < c.height; y++)
      for (let x = 0; x < c.width; x++) {
        if (a[(y * c.width + x) * 4 + 3] !== 255) continue;
        const d = (x - cx) ** 2 + (y - cy) ** 2;
        if (d < best.d) best = { x, y, d };
      }
    // Прозрачный угол: ни сама картинка, ни соседние фигуры рядом не плотны.
    let empty = null as null | { x: number; y: number };
    for (const [x, y] of [[2, 2], [c.width - 3, 2], [2, c.height - 3], [c.width - 3, c.height - 3]]) {
      let clear = true;
      for (let dy = -30; dy <= 30 && clear; dy++)
        for (let dx = -30; dx <= 30 && clear; dx++) {
          const px = x + dx, py = y + dy;
          if (px >= 0 && py >= 0 && px < c.width && py < c.height && a[(py * c.width + px) * 4 + 3] > 0) clear = false;
        }
      if (clear) {
        empty = toScreen(x, y);
        break;
      }
    }
    return { solid: toScreen(best.x, best.y), empty };
  });
}

test('нажатие на спутника открывает его задачу', async ({ page }) => {
  await openGame(page);
  await addTask(page, 'Сдать отчёт', { quest: 'Работа', size: '1 ч' });
  await addTask(page, 'Полить цветы', { size: '15 мин' });
  await page.getByRole('button', { name: /Разжечь костёр/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Лагерь' })).toBeAttached();
  // Маски фигур читаются после разжигания, дадим им загрузиться.
  await page.waitForTimeout(500);

  for (const title of ['Сдать отчёт', 'Полить цветы']) {
    const { solid, empty } = await figurePoints(page, title);
    // Под пальцем картинка фигуры, а не кнопка: нажатие ловит сама сцена.
    const under = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest('button')?.tagName ?? null, solid);
    expect(under, title).toBeNull();
    await page.touchscreen.tap(solid.x, solid.y);
    const card = page.getByRole('dialog');
    await expect(card, title).toBeVisible();
    await expect(card).toContainText(title);
    await card.getByRole('button', { name: 'Закрыть' }).click();
    await expect(card).toBeHidden();

    if (empty) {
      const free = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest('button') === null, empty);
      if (free) {
        await page.touchscreen.tap(empty.x, empty.y);
        await page.waitForTimeout(300);
        await expect(page.getByRole('dialog'), `${title}: пустой угол картинки`).toBeHidden();
      }
    }
  }
});
