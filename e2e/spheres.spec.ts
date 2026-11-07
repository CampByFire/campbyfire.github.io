// Королевство: сферы как в колесе баланса, их оценка, проекты в сферах и напоминание оценить сферы.
import { expect, test, type Page } from '@playwright/test';
import { addTask, at, axe, openGame, openSettings, setTime, sheet, tab, toast } from './helpers';

/** Кнопки и поля в открытом листе, которые меньше 44×44. */
const tooSmall = (page: Page) =>
  page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('[role="dialog"] button, [role="dialog"] input')]
      .filter((el) => !el.closest('[inert]') && !el.classList.contains('link-btn'))
      .map((el) => ({ el, box: el.getBoundingClientRect() }))
      .filter(({ box }) => box.width > 0 && (box.width < 43.5 || box.height < 43.5))
      .map(({ el, box }) => `${el.getAttribute('aria-label') ?? el.textContent ?? el.className}: ${Math.round(box.width)}×${Math.round(box.height)}`),
  );

test('оценка сфер рисует колесо, а вторая оценка показывает, что изменилось', async ({ page }) => {
  await openGame(page);
  await tab(page, 'Королевство').click();
  await expect(page.getByRole('heading', { name: 'Колесо баланса' })).toBeVisible();
  await expect(page.locator('.wheel-legend li')).toHaveCount(8);
  await expect(page.locator('.wheel-legend')).toContainText('нет оценки');

  await page.getByRole('button', { name: 'Оценить сферы' }).click();
  const rate = sheet(page, 'Оценить сферы');
  expect(await axe(page), 'Оценить сферы').toEqual([]);
  expect(await tooSmall(page), 'Оценить сферы').toEqual([]);
  const work = rate.getByRole('slider', { name: 'Работа' });
  await expect(work).toHaveValue('6');
  await work.focus();
  for (let i = 0; i < 2; i++) await page.keyboard.press('ArrowRight');
  await expect(work).toHaveAttribute('aria-valuetext', '8 из 10');
  await rate.getByRole('button', { name: 'Сохранить оценку' }).click();
  await expect(rate).toBeHidden();
  await expect(toast(page)).toHaveText('Оценка сохранена');
  await expect(page.locator('.wheel-legend li').first()).toContainText('8 из 10');
  await expect(page.locator('.wheel-sector')).toHaveCount(8);
  expect(await axe(page), 'Королевство с колесом').toEqual([]);

  // Через неделю оценка ниже: в легенде видно, на сколько, а на колесе бледный контур прошлой.
  // Новый день открывается сбором отряда, в Королевство переходим сами. Неделю в игру не заглядывали,
  // поэтому сначала встречает «Костёр ждал».
  await setTime(page, at(10, 0, 30));
  await sheet(page, 'Костёр ждал').getByRole('button', { name: 'Собрать отряд' }).click();
  await tab(page, 'Королевство').click();
  await page.getByRole('button', { name: 'Оценить сферы' }).click();
  const again = sheet(page, 'Оценить сферы');
  await expect(again.getByText('в прошлый раз 8')).toBeVisible();
  const w2 = again.getByRole('slider', { name: 'Работа' });
  await w2.focus();
  await page.keyboard.press('ArrowLeft');
  await again.getByRole('button', { name: 'Сохранить оценку' }).click();
  await expect(page.locator('.wheel-legend li').first()).toContainText('7 из 10 −1');
  await expect(page.locator('.wheel-prev')).toHaveCount(8);
});

test('проект в сфере: задачи, выполнение и возврат из зала трофеев', async ({ page }) => {
  await openGame(page);
  await tab(page, 'Королевство').click();
  await page.locator('.sphere-card').filter({ hasText: 'Здоровье' }).click();
  const health = sheet(page, 'Здоровье');
  await expect(health).toContainText('личная сфера');
  expect(await axe(page), 'Сфера').toEqual([]);
  await health.getByRole('button', { name: 'Проект в этой сфере' }).click();
  const form = sheet(page, 'Новый проект');
  await expect(form.getByRole('radiogroup', { name: 'В какой сфере' }).getByRole('radio', { name: 'Здоровье' })).toBeChecked();
  await expect(form.getByText('как у сферы «Здоровье»')).toBeVisible();
  expect(await axe(page), 'Новый проект').toEqual([]);
  await form.getByLabel('Название').fill('Марафон');
  await form.getByRole('button', { name: 'Начать проект' }).click();
  await expect(form).toBeHidden();

  await addTask(page, 'Пробежать 10 км', { quest: 'Марафон', size: '1 ч' });
  await addTask(page, 'Купить кроссовки', { quest: 'Марафон', size: '30 мин' });
  await tab(page, 'Королевство').click();
  const card = page.locator('.project-card').filter({ hasText: 'Марафон' });
  await expect(card).toContainText('2 в отряде');
  await card.click();
  const project = sheet(page, 'Марафон');
  await expect(project).toContainText('проект в сфере «Здоровье»');
  expect(await axe(page), 'Проект').toEqual([]);

  // Выполнен раньше, чем сделаны все задачи: незаконченные переходят в сферу.
  page.once('dialog', (d) => {
    expect(d.message()).toContain('перейдут в сферу «Здоровье»');
    void d.accept();
  });
  await project.getByRole('button', { name: 'Проект выполнен' }).click();
  await expect(toast(page)).toContainText('Проект выполнен');
  const trophy = page.locator('.trophy').filter({ hasText: 'Марафон' });
  await expect(trophy).toBeVisible();
  await expect(page.locator('.sphere-card').filter({ hasText: 'Здоровье' })).toContainText('2 в отряде');

  await trophy.click();
  await sheet(page, 'Марафон').getByRole('button', { name: 'Вернуть в работу' }).click();
  await expect(toast(page)).toHaveText('Проект снова в работе');
});

test('напоминание оценить сферы: в Настройках, по умолчанию раз в месяц', async ({ page }) => {
  await openGame(page);
  await openSettings(page);
  const every = page.getByRole('radiogroup', { name: 'Напоминать оценить сферы' });
  await expect(every.getByRole('radio', { name: 'Раз в месяц' })).toBeChecked();
  await every.getByRole('radio', { name: 'Раз в неделю' }).click();
  await expect(every.getByRole('radio', { name: 'Раз в неделю' })).toBeChecked();

  // Игре три дня: лагерь просит оценить сферы, кнопка ведёт прямо в оценку.
  // В выходные в игру не заглядывали, поэтому сначала встречает «Костёр ждал».
  await setTime(page, at(10, 0, 26));
  await sheet(page, 'Костёр ждал').getByRole('button', { name: 'Собрать отряд' }).click();
  await tab(page, 'Лагерь').click();
  const notice = page.locator('.notice');
  await expect(notice).toContainText('Пора оценить сферы');
  await notice.getByRole('button', { name: 'Оценить' }).click();
  const rate = sheet(page, 'Оценить сферы');
  await rate.getByRole('button', { name: 'Сохранить оценку' }).click();
  await expect(page.locator('.notice')).toBeHidden();

  // Не напоминать: подсказка не приходит.
  await openSettings(page);
  await every.getByRole('radio', { name: 'Не напоминать' }).click();
  await setTime(page, at(10, 0, 30));
  await sheet(page, 'Костёр ждал').getByRole('button', { name: 'Собрать отряд' }).click();
  await tab(page, 'Лагерь').click();
  await expect(page.locator('.notice')).toBeHidden();
});
