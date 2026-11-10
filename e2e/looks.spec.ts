// Облики героев у костра: у задач одного уровня фигурки разные, а плащ красится в цвет похода.
import { expect, test } from '@playwright/test';
import { addTask, newState } from '../src/game/state';
import { at, openGame, seedGame } from './helpers';

test('облики разные, плащ в цвет похода', async ({ page }) => {
  const s = newState(at(8).getTime());
  const work = s.quests[0].id;
  for (const title of ['Отчёт', 'Почта', 'Созвон', 'Счёт', 'Связь']) addTask(s, at(8).getTime(), { title, questId: work, level: 1, day: s.day });
  const free = addTask(s, at(8).getTime(), { title: 'Без похода', questId: null, level: 1, day: s.day });
  s.touchedAt = at(8).getTime();
  s.litDay = s.day;
  await seedGame(page, s);
  await openGame(page, { time: at(9) });

  const figs = page.locator('img.fig[data-task]');
  await expect(figs).toHaveCount(6);
  // Все шестеро разбойники, но не на одно лицо.
  const looks = await figs.evaluateAll((els) => els.map((el) => (el as HTMLElement).dataset.art!.split('/')[1]));
  expect(looks.every((l) => l.startsWith('rogue'))).toBe(true);
  expect(new Set(looks).size).toBeGreaterThan(1);

  // У задач похода картинка перекрашена, у задачи без похода осталась прежней.
  const inQuest = page.locator(`img.fig[data-task]:not([data-task="${free}"])`);
  for (const img of await inQuest.all()) await expect(img).toHaveAttribute('src', /^blob:/);
  await expect(page.locator(`img.fig[data-task="${free}"]`)).toHaveAttribute('src', /\.webp/);
});
