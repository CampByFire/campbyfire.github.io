// Долгое нажатие на поляну лагеря: браузер не предлагает сохранить или скопировать картинку,
// а номер над спутником и кнопки под сценой нажимаются как раньше.
import { expect, test, type Page } from '@playwright/test';
import { addTask, openGame } from './helpers';

/**
 * Попросить у браузера меню в точке экрана. На телефоне его просит долгое нажатие, но Chromium в тестах
 * по долгому касанию меню не открывает, поэтому то же событие contextmenu шлёт правая кнопка.
 * Возвращает, какие меню браузер собирался открыть.
 */
async function menuAt(page: Page, x: number, y: number): Promise<{ tag: string; prevented: boolean }[]> {
  await page.mouse.click(x, y, { button: 'right' });
  return page.evaluate(() => (window as unknown as { menus: { tag: string; prevented: boolean }[] }).menus.splice(0));
}

test('долгое нажатие на поляну не открывает меню картинки', async ({ page }) => {
  await openGame(page);
  await addTask(page, 'Сдать отчёт', { quest: 'Работа', size: '1 ч' });
  await page.getByRole('button', { name: /Разжечь костёр/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Лагерь' })).toBeAttached();

  // Слушаем меню после обработчиков сцены: так видно, отменила ли его игра.
  await page.evaluate(() => {
    const menus: { tag: string; prevented: boolean }[] = [];
    (window as unknown as { menus: typeof menus }).menus = menus;
    addEventListener('contextmenu', (e) => menus.push({ tag: (e.target as Element).tagName, prevented: e.defaultPrevented }));
  });

  const box = (await page.locator('.scene-wrap').boundingBox())!;
  const spots = {
    'деревья вверху слева': [box.x + 40, box.y + 90],
    'поляна у костра': [box.x + box.width * 0.3, box.y + box.height * 0.8],
    'деревья справа': [box.x + box.width - 24, box.y + box.height * 0.4],
  };
  for (const [name, [x, y]] of Object.entries(spots)) {
    // Под пальцем не картинка: именно на картинке браузер предлагает «Скачать» и «Копировать».
    const under = await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.tagName, [x, y]);
    expect(under, name).not.toBe('IMG');
    const menus = await menuAt(page, x, y);
    expect(menus, name).toHaveLength(1);
    expect(menus[0].tag, name).not.toBe('IMG');
    expect(menus[0].prevented, name).toBe(true);
  }

  // Нажатия в игре на месте: номер над спутником открывает задачу, «Позвать к огню» зовёт.
  await page.getByRole('button', { name: /^1\. .*Сдать отчёт/ }).tap();
  const card = page.getByRole('dialog');
  await expect(card).toBeVisible();
  await card.getByRole('button', { name: 'Закрыть' }).click();
  await expect(card).toBeHidden();
  const day = page.getByRole('region', { name: 'Задачи дня' });
  await day.getByRole('button', { name: 'Позвать к огню' }).tap();
  await expect(day.getByRole('heading', { name: 'Сейчас у огня' })).toBeVisible();
});
