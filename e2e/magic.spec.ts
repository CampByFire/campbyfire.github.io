// Магия: заклинания не держат игру, сила магии выбирается в Летописи и помнится на этом устройстве.
// Идёт на телефоне со всей магией и на телефоне с «Уменьшить движение» в системе, где магия спокойная.
import { expect, test, type Locator, type Page } from '@playwright/test';
import { addTask, openGame, sheet, tab, toast, unlock } from './helpers';

/** Ошибки страницы и предупреждения магии. Их не должно быть ни одного. */
function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' || m.text().startsWith('Магия:')) errors.push(m.text());
  });
  return errors;
}

/** В системе включено «Уменьшить движение»: тогда, пока ничего не выбрано, магия спокойная. */
const reducedMotion = (page: Page) => page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches);

/** Нажать сразу, не дожидаясь, пока кнопка перестанет двигаться: как палец посреди заклинания. */
async function tapNow(button: Locator) {
  const box = await button.boundingBox();
  if (!box) throw new Error('кнопки нет на экране');
  await button.page().mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}

/** Золото, уровень и мана наверху досчитались: видно то же, что на самом деле. */
async function expectNumbersSettled(page: Page) {
  const wrong = () =>
    page.locator('[data-magic$="-n"]').evaluateAll((els) =>
      els.filter((el) => el.textContent !== Number((el as HTMLElement).dataset.v).toLocaleString('ru-RU')).map((el) => `${(el as HTMLElement).dataset.magic}: ${el.textContent}`),
    );
  await expect.poll(wrong, { timeout: 6000 }).toEqual([]);
}

/**
 * Опыт героя к следующей загрузке страницы. Уходя со страницы, игра сама сохраняется поверх,
 * поэтому опыт подменяется в сохранении уже после этого, перед запуском игры.
 */
async function reloadWithXp(page: Page, xp: number) {
  await page.addInitScript(() => {
    const xp = sessionStorage.getItem('e2e-xp');
    if (!xp) return;
    sessionStorage.removeItem('e2e-xp');
    const key = 'taskcraft-lager-v1';
    const save = JSON.parse(localStorage.getItem(key) ?? 'null');
    if (!save) return;
    save.hero.xp = Number(xp);
    localStorage.setItem(key, JSON.stringify(save));
  });
  await page.evaluate((xp) => sessionStorage.setItem('e2e-xp', String(xp)), xp);
  await page.reload();
  await unlock(page);
}

test('заклинания не держат кнопки: следующее нажатие можно делать сразу', async ({ page }) => {
  const errors = watchErrors(page);
  await openGame(page);
  await addTask(page, 'Сдать отчёт', { quest: 'Работа', size: '1 ч' });
  await addTask(page, 'Купить продукты', { quest: 'Дом и быт', size: '30 мин' });
  await page.getByRole('button', { name: /Разжечь костёр/ }).click();
  const day = page.getByRole('region', { name: 'Задачи дня' });

  // Каждое нажатие сразу за предыдущим, пока прежнее заклинание ещё идёт.
  await tapNow(day.getByRole('button', { name: 'Позвать к огню' }));
  await tapNow(day.getByRole('button', { name: 'Готово' }));
  await expect(day.getByRole('heading', { name: 'Сделано!' })).toBeVisible();
  await expect(page.locator('.topbar')).toContainText('Золото: 50');

  // «Вернуть» посреди Победной искры: награда уходит, числа сразу встают на итог.
  await tapNow(day.getByRole('button', { name: 'Вернуть' }));
  await expect(toast(page)).toHaveText('Задача снова в плане');
  await expect(page.locator('.topbar')).toContainText('Золото: 0');
  await expectNumbersSettled(page);

  // Другой поход: смена стоит маны, и на привал можно уйти, не дожидаясь, пока она досчитается.
  await day.getByRole('button', { name: /Купить продукты/ }).first().click();
  await page.getByRole('dialog').filter({ hasText: 'Купить продукты' }).getByRole('button', { name: /^К огню/ }).click();
  await expect(toast(page)).toHaveText('Смена похода: −5 маны');
  await tapNow(day.getByRole('button', { name: 'Привал' }));
  await expect(day.getByRole('heading', { name: 'Привал' })).toBeVisible();
  await tapNow(day.getByRole('button', { name: 'Снова в путь' }));
  await tapNow(day.getByRole('button', { name: 'Готово' }));
  await expect(day.getByRole('heading', { name: 'Сделано!' })).toBeVisible();
  await expect(day).toContainText('Купить продукты');
  await expect(page.locator('.topbar')).toContainText('Мана: 95 из 100');
  await expectNumbersSettled(page);
  expect(errors).toEqual([]);
});

test('новый уровень: чудо проходит само, а уровень наверху встаёт на новый', async ({ page }) => {
  const errors = watchErrors(page);
  await openGame(page);
  await addTask(page, 'Сдать отчёт', { quest: 'Работа', size: '1 ч' });
  // До второго уровня 300 опыта: 290, ещё 3 за план и 40 за задачу.
  await reloadWithXp(page, 290);
  await page.getByRole('button', { name: /Разжечь костёр/ }).click();
  const day = page.getByRole('region', { name: 'Задачи дня' });
  await day.getByRole('button', { name: 'Позвать к огню' }).click();
  await day.getByRole('button', { name: 'Готово' }).click();

  // Вся магия рисует знак Света с надписью, Спокойная показывает табличку.
  const miracle = page.locator((await reducedMotion(page)) ? '.lvl-plate' : '.lvl-text');
  await expect(miracle).toHaveText(/Уровень 2/);
  await expect(page.locator('.topbar')).toContainText('уровень героя 2');
  await expect(miracle).toHaveCount(0, { timeout: 6000 });
  await expectNumbersSettled(page);
  expect(errors).toEqual([]);
});

test('закрытый лист ещё уезжает, но под ним уже можно нажать', async ({ page }) => {
  await openGame(page);
  await tab(page, 'Добавить задачу').click();
  const form = sheet(page, 'Новая задача');
  await expect(form.getByLabel('Что сделать')).toBeFocused();
  await page.keyboard.press('Escape');
  // Для пальца, фокуса и экранного диктора листа уже нет, хотя на экране он ещё тает.
  await expect(form).toBeHidden();
  await tapNow(tab(page, 'Летопись'));
  await expect(page.getByRole('heading', { level: 1, name: 'Летопись' })).toBeVisible();
});

test('сила магии выбирается в Летописи и помнится на этом устройстве', async ({ page }) => {
  await openGame(page);
  const html = page.locator('html');
  const reduced = await reducedMotion(page);
  await expect(html).toHaveAttribute('data-motion', reduced ? 'calm' : 'full');

  await tab(page, 'Летопись').click();
  const magic = page.getByRole('radiogroup', { name: 'Сколько анимаций' });
  await expect(magic.getByRole('radio', { name: reduced ? 'Спокойная' : 'Вся' })).toBeChecked();
  await magic.getByRole('radio', { name: 'Без анимаций' }).click();
  await expect(html).toHaveAttribute('data-motion', 'off');
  await expect(page.getByText('Никакого движения')).toBeVisible();

  await page.reload();
  await unlock(page);
  await expect(html).toHaveAttribute('data-motion', 'off');
  await tab(page, 'Летопись').click();
  await expect(magic.getByRole('radio', { name: 'Без анимаций' })).toBeChecked();
  await magic.getByRole('radio', { name: 'Вся' }).click();
  await expect(html).toHaveAttribute('data-motion', 'full');
});
