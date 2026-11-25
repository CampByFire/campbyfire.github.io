// Алхимия: сферы как в колесе баланса, их оценка, проекты в сферах и напоминание оценить сферы.
import { expect, test, type Page } from '@playwright/test';
import { addQuest, addTask as addGameTask, complete, newState, spheresOf } from '../src/game/state';
import { addTask, at, axe, openGame, openSettings, seedGame, setTime, sheet, tab, toast } from './helpers';

/** Кнопки и поля в открытом листе, которые меньше 44×44. */
const tooSmall = (page: Page) =>
  page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('[role="dialog"] button, [role="dialog"] input')]
      .filter((el) => !el.closest('[inert]') && !el.classList.contains('link-btn'))
      .map((el) => ({ el, box: el.getBoundingClientRect() }))
      .filter(({ box }) => box.width > 0 && (box.width < 43.5 || box.height < 43.5))
      .map(({ el, box }) => `${el.getAttribute('aria-label') ?? el.textContent ?? el.className}: ${Math.round(box.width)}×${Math.round(box.height)}`),
  );

test('личные оценки сохраняются отдельно от отвара', async ({ page }) => {
  await openGame(page);
  await tab(page, 'Алхимия').click();
  await expect(page.locator('.sphere-card')).toHaveCount(8);
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
  // Лист уже скрыт от диктора, но ещё закрывается. Переводим часы после его ухода.
  await expect(page.locator('.sheet-layer')).toHaveCount(0);
  await setTime(page, at(10, 0, 30));
  await sheet(page, 'Костёр ждал').getByRole('button', { name: 'Собрать отряд' }).click();
  await tab(page, 'Алхимия').click();
  await page.getByRole('button', { name: 'Оценить сферы' }).click();
  const again = sheet(page, 'Оценить сферы');
  await expect(again.getByText('в прошлый раз 8')).toBeVisible();
  const w2 = again.getByRole('slider', { name: 'Работа' });
  await w2.focus();
  await page.keyboard.press('ArrowLeft');
  await again.getByRole('button', { name: 'Сохранить оценку' }).click();
  await page.locator('.sphere-card').first().click();
  await expect(sheet(page, 'Работа')).toContainText('оценка 7 из 10');
});

test('котелки показывают уровень, дату и выбранный медальон на телефоне и компьютере', async ({ page }, testInfo) => {
  const time = at(9);
  const state = newState(time.getTime());
  const spheres = spheresOf(state);
  spheres[0].icon = 'pero';
  [1, 2, 1, 3].forEach((count, i) => {
    for (let n = 0; n < count; n++) {
      const id = addGameTask(state, time.getTime(), { title: 'Дело', questId: spheres[i].id, level: 1 });
      complete(state, time.getTime(), id);
    }
  });
  await seedGame(page, state);
  await openGame(page, { time });
  await tab(page, 'Алхимия').click();
  const cards = page.locator('.sphere-card');
  await expect(cards.first()).toHaveAccessibleName(/Работа.*сегодня.*3 из 8.*Перо/);
  await expect(cards.nth(1).locator('use')).toHaveAttribute('href', '#rostok');
  await expect(cards.nth(3)).toHaveAccessibleName(/8 из 8/);
  await expect(cards.last()).toHaveAccessibleName(/Пока нет выполненных дел.*0 из 8/);
  await page.getByLabel('Справка: Алхимия').click();
  await expect(page.getByText(/Каждое выполненное дело/)).toBeVisible();
  await page.getByLabel('Справка: Алхимия').click();
  expect(await axe(page)).toEqual([]);
  for (const [width, height] of [[390, 844], [360, 640], [1280, 800]]) {
    await page.setViewportSize({ width, height });
    const left = await cards.first().boundingBox();
    const right = await cards.nth(1).boundingBox();
    expect(left!.y).toBe(right!.y);
    expect(right!.x + right!.width).toBeLessThanOrEqual(width);
    await page.screenshot({ path: testInfo.outputPath(`алхимия-${width}.png`) });
  }
  const fire = cards.first().locator('.brew-fire');
  const bubble = cards.first().locator('.brew-bubble').first();
  await expect(fire).toHaveCSS('animation-name', 'brew-fire');
  await expect(bubble).toHaveCSS('animation-name', 'brew-rise');
  await expect(cards.first().locator('.brew-steam')).toBeVisible();
  await expect(cards.last().locator('.brew-bubble, .brew-steam')).toHaveCount(0);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(fire).toHaveCSS('animation-name', 'none');
  await expect(bubble).toHaveCSS('animation-name', 'none');
  await expect(fire).toBeVisible();
  await cards.nth(1).click();
  await sheet(page, 'Здоровье').getByRole('button', { name: 'Изменить сферу' }).click();
  const edit = sheet(page, 'Сфера');
  await edit.locator('.quest-icon-picker summary').click();
  await expect(edit.getByRole('radio', { name: 'Медальон котелка' })).toBeChecked();
  await edit.getByRole('radio', { name: 'Без иконки' }).click();
  await edit.getByRole('button', { name: 'Сохранить' }).click();
  await expect(cards.nth(1).locator('use')).toHaveCount(0);
});

test('из котелка можно открыть и сохранить заметку «Как улучшить»', async ({ page }) => {
  await openGame(page);
  await tab(page, 'Алхимия').click();
  const row = page.locator('.sphere-card').filter({ hasText: 'Здоровье' });
  await expect(page.locator('.sphere-card')).toHaveCount(8);
  await expect(page.getByText('Как улучшить?', { exact: true })).toHaveCount(0);
  await row.click();
  await sheet(page, 'Здоровье').locator('.improve-row').click();
  const note = sheet(page, 'Здоровье');
  const field = note.getByLabel('Что сделать, чтобы эта сфера стала лучше');
  await expect(field).toBeFocused();
  expect(await axe(page), 'Как улучшить').toEqual([]);
  expect(await tooSmall(page), 'Как улучшить').toEqual([]);
  await field.fill('Ложиться до полуночи\nГулять после обеда');
  await note.getByRole('button', { name: 'Сохранить' }).click();
  await expect(toast(page)).toHaveText('Заметка сохранена');
  await expect(note).toBeHidden();
  await expect(row).toBeFocused();
  expect(await axe(page), 'Алхимия с заметкой').toEqual([]);
  await page.reload();
  await tab(page, 'Алхимия').click();
  await page.locator('.sphere-card').filter({ hasText: 'Здоровье' }).click();
  const health = sheet(page, 'Здоровье');
  await expect(health.locator('.improve-row')).toContainText('Гулять после обеда');
  await health.locator('.improve-row').click();
  const again = sheet(page, 'Здоровье').getByLabel('Что сделать, чтобы эта сфера стала лучше');
  await expect(again).toHaveValue('Ложиться до полуночи\nГулять после обеда');

  // Пустая заметка убирается.
  await again.fill('');
  await sheet(page, 'Здоровье').getByRole('button', { name: 'Сохранить' }).click();
  await expect(toast(page)).toHaveText('Заметка убрана');
});

test('проект в сфере: задачи, выполнение и возврат из зала трофеев', async ({ page }) => {
  await openGame(page);
  await tab(page, 'Алхимия').click();
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
  await tab(page, 'Алхимия').click();
  await page.locator('.sphere-card').filter({ hasText: 'Здоровье' }).click();
  const card = health.getByRole('button', { name: /Марафон/ });
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
  await page.locator('.sphere-card').filter({ hasText: 'Здоровье' }).click();
  await expect(health).toContainText('2 в отряде');
  await page.keyboard.press('Escape');

  await trophy.click();
  await sheet(page, 'Марафон').getByRole('button', { name: 'Вернуть в работу' }).click();
  await expect(toast(page)).toHaveText('Проект снова в работе');
});

test('напоминание оценить сферы: в Настройках, по умолчанию раз в месяц', async ({ page }) => {
  await openGame(page);
  await openSettings(page, 'Распорядок');
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
  await openSettings(page, 'Распорядок');
  await every.getByRole('radio', { name: 'Не напоминать' }).click();
  await setTime(page, at(10, 0, 30));
  await sheet(page, 'Костёр ждал').getByRole('button', { name: 'Собрать отряд' }).click();
  await tab(page, 'Лагерь').click();
  await expect(page.locator('.notice')).toBeHidden();
});

test('длинный проект не сдвигает экран: под нижним меню нет пустого места', async ({ page }) => {
  const now = at(8).getTime();
  const s = newState(now);
  const id = addQuest(s, now, { name: 'Большой проект', kind: 'work', color: s.quests[0].color, sphereId: s.quests[0].id });
  for (let i = 1; i <= 40; i++) addGameTask(s, now, { title: `Шаг ${i}`, questId: id, level: 1 });
  s.touchedAt = now;
  s.litDay = s.day;
  await seedGame(page, s);
  await openGame(page);
  await tab(page, 'Алхимия').click();
  await page.locator('.sphere-card').first().click();
  await sheet(page, 'Работа').getByRole('button', { name: /Большой проект/ }).click();
  await expect(sheet(page, 'Большой проект')).toBeVisible();
  // Фокус уходит в лист, пока тот ещё выезжает снизу: приложение не должно проскроллиться вслед за ним.
  await page.evaluate(() => Promise.all(document.querySelector('.modal')!.getAnimations().map((a) => a.finished)));
  const box = await page.evaluate(() => ({
    height: innerHeight,
    scrolled: document.querySelector('.app')!.scrollTop,
    menu: document.querySelector('.tabbar')!.getBoundingClientRect().bottom,
    sheet: document.querySelector('.modal')!.getBoundingClientRect().bottom,
  }));
  expect(box.scrolled, 'приложение проскроллилось').toBe(0);
  expect(box.menu, 'нижнее меню уехало вверх').toBe(box.height);
  expect(box.sheet, 'лист не достаёт до низа экрана').toBe(box.height);
});
