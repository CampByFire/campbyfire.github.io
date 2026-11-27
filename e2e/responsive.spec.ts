import { expect, test } from '@playwright/test';
import { addTask, newState } from '../src/game/state';
import { at, axe, expectNoSideScroll, openGame, seedGame, setTime, tab } from './helpers';

test('широкий Лагерь сохраняет таймер, поляну и список при изменении окна', async ({ page }, testInfo) => {
  const mobile = testInfo.project.use.isMobile;
  const narrow = { width: 390, height: 844 };
  const wide = mobile ? { width: 844, height: 390 } : { width: 1280, height: 800 };
  const sizes = mobile
    ? [wide, { width: 640, height: 360 }]
    : [wide, { width: 1024, height: 600 }, { width: 768, height: 1024 }, { width: 1024, height: 768 }];

  await page.setViewportSize(narrow);
  const now = at(9).getTime();
  const state = newState(now);
  for (let i = 1; i <= 24; i++) addTask(state, now, { title: `Дело ${i}`, questId: state.quests[0].id, level: 1, day: state.day });
  for (let i = 1; i <= 3; i++) addTask(state, now, { title: `Долг ${i}`, questId: state.quests[0].id, level: 1, day: null, due: '2026-10-22' });
  await seedGame(page, state);
  await openGame(page);
  await page.getByRole('button', { name: /Разжечь костёр/ }).click();
  const day = page.getByRole('region', { name: 'Задачи дня' });
  const scene = page.locator('.scene-wrap');
  const menu = page.getByRole('navigation', { name: 'Разделы' });
  const handle = day.getByRole('button', { name: 'Все задачи дня' });
  await day.getByRole('button', { name: 'Позвать к огню' }).click();
  const started = await page.evaluate(() => Date.now());
  await handle.click();
  await expect(handle).toHaveAttribute('aria-expanded', 'true');

  for (const size of sizes) {
    await page.setViewportSize(size);
    await expect(page.locator('.camp')).toHaveClass(/is-split/);
    await expect(day.getByRole('heading', { name: 'Сейчас у огня' })).toBeInViewport();
    await expect(handle).toHaveCount(0);
    await expect(scene).not.toHaveAttribute('inert', '');
    const field = (await scene.boundingBox())!;
    const tasks = (await day.boundingBox())!;
    const tabs = (await menu.boundingBox())!;
    expect(tasks.x).toBeCloseTo(field.x + field.width, 0);
    expect(tasks.y).toBeCloseTo(field.y, 0);
    expect(tasks.height).toBeCloseTo(field.height, 0);
    expect(tabs.y + tabs.height).toBeCloseTo(size.height, 0);
    const art = scene.locator('img.scene-backdrop');
    await expect.poll(() => art.evaluate((img: HTMLImageElement) => {
      const frame = img.parentElement!.getBoundingClientRect();
      const picture = img.getBoundingClientRect();
      const x = picture.width / img.naturalWidth;
      const y = picture.height / img.naturalHeight;
      return Math.abs(x - y) < 0.001 && picture.left <= frame.left + 0.1 &&
        picture.top <= frame.top + 0.1 && picture.right >= frame.right - 0.1 && picture.bottom >= frame.bottom - 0.1;
    })).toBe(true);
    const marks = scene.locator('.figure-hit');
    await expect(marks).toHaveCount(10);
    await expect.poll(() => marks.evaluateAll((buttons) => buttons.every((button) => {
      const r = button.getBoundingClientRect();
      const points = [[r.left + 1, r.top + 1], [r.right - 1, r.bottom - 1], [r.left + r.width / 2, r.top + r.height / 2]];
      return r.width >= 44 && r.height >= 44 && points.every(([x, y]) => button.contains(document.elementFromPoint(x, y)));
    }))).toBe(true);
    await expectNoSideScroll(page);
  }

  await page.setViewportSize(wide);
  await setTime(page, new Date(started + 5 * 60_000));
  await expect(day.locator('.timer')).toContainText('0:05');
  expect(await axe(page), 'Лагерь с двумя колонками').toEqual([]);
  await page.screenshot({ path: testInfo.outputPath('lager.png'), scale: 'css' });
  const fieldBefore = await scene.boundingBox();
  const menuBefore = await menu.boundingBox();
  const lastTask = day.getByRole('button', { name: /^Дело 24\b/ });
  await expect(lastTask).not.toBeInViewport();
  await day.focus();
  await page.keyboard.press('PageDown');
  await expect.poll(() => day.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
  await lastTask.scrollIntoViewIfNeeded();
  await expect(lastTask).toBeInViewport();
  expect(await scene.boundingBox()).toEqual(fieldBefore);
  expect(await menu.boundingBox()).toEqual(menuBefore);
  await lastTask.click();
  const details = page.getByRole('dialog');
  await expect(details).toContainText('Дело 24');
  expect(await axe(page), 'Лист задачи в широком окне').toEqual([]);
  await page.keyboard.press('Escape');
  await expect(details).toBeHidden();
  await expect(lastTask).toBeFocused();

  await page.setViewportSize(narrow);
  await expect(page.locator('.camp')).not.toHaveClass(/is-split/);
  await expect(handle).toHaveAttribute('aria-expanded', 'false');
  await expect(day.locator('.timer')).toContainText('0:05');
  await expect(menu).toBeInViewport();
  await expectNoSideScroll(page);

  await page.setViewportSize(wide);
  await tab(page, 'План').click();
  await page.getByRole('tab', { name: 'Календарь' }).click();
  const calendar = page.locator('main[data-screen="calendar"]');
  await expect(calendar).toBeVisible();
  const calendarWidth = (await calendar.boundingBox())!.width;
  await tab(page, 'Летопись').click();
  const notes = page.locator('main[data-screen="notes"]');
  await expect(notes).toBeVisible();
  expect((await notes.boundingBox())!.width).toBeLessThan(calendarWidth);
  await expectNoSideScroll(page);
});
