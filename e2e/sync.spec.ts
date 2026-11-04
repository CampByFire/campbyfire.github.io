// Сохранение в GitHub с поддельным GitHub: значок беды в лагере, замена токена, напоминание о сроке.
import { expect, test, type Page } from '@playwright/test';
import { addTask, at, connectGitHub, fakeGitHub, openGame, setTime, sheet, tab, toast } from './helpers';

const badge = (page: Page) => page.locator('.topbar').getByRole('button');

test('токен перестал работать: в лагере значок, токен заменяется, значок уходит', async ({ page }) => {
  const gh = await fakeGitHub(page);
  await openGame(page);
  await connectGitHub(page);
  expect(gh.content).not.toBeNull();

  await addTask(page, 'Отчёт', { quest: 'Работа' });
  await tab(page, 'Лагерь').click();
  await expect(badge(page)).toHaveCount(0);

  gh.mode = 'expired';
  await addTask(page, 'Созвон', { quest: 'Работа' });
  await page.clock.runFor(6000);
  await expect(badge(page)).toHaveAccessibleName('Игра не сохраняется в GitHub');

  await badge(page).click();
  const panel = sheet(page, 'Сохранение в GitHub');
  await expect(panel).toContainText('GitHub больше не принимает этот токен');
  await panel.getByLabel('Новый токен GitHub').fill('fresh');
  await panel.getByRole('button', { name: 'Заменить', exact: true }).click();
  await expect(toast(page)).toHaveText('Токен заменён');
  await panel.getByRole('button', { name: 'Закрыть' }).click();
  await expect(badge(page)).toHaveCount(0);
  expect(gh.content).toContain('Созвон');
});

test('без связи больше часа значок мягче: игра сохраняется здесь и догонит', async ({ page }) => {
  const gh = await fakeGitHub(page);
  await openGame(page);
  await connectGitHub(page);
  gh.mode = 'down';
  await addTask(page, 'Отчёт', { quest: 'Работа' });
  await tab(page, 'Лагерь').click();
  await page.clock.runFor(6000);
  // Сразу без связи значка нет: сеть часто пропадает ненадолго.
  await expect(badge(page)).toHaveCount(0);
  await setTime(page, at(10, 5));
  await expect(badge(page)).toHaveAccessibleName('Нет связи с GitHub: последние действия ещё не сохранены там');

  gh.mode = 'ok';
  await badge(page).click();
  await sheet(page, 'Сохранение в GitHub').getByRole('button', { name: 'Сохранить сейчас' }).click();
  await expect(sheet(page, 'Сохранение в GitHub')).toContainText('Сохранено');
  expect(gh.content).toContain('Отчёт');
});

test('за две недели до конца токена игра напоминает его заменить', async ({ page }) => {
  await fakeGitHub(page);
  await openGame(page);
  await connectGitHub(page);
  await page.evaluate(() => {
    const key = 'taskcraft-lager-github';
    const cfg = JSON.parse(localStorage.getItem(key) ?? '{}');
    localStorage.setItem(key, JSON.stringify({ ...cfg, tokenExpires: '2026-11-02', tokenGuessed: false }));
  });
  await page.reload();
  const notice = page.getByRole('status').filter({ hasText: 'Токен GitHub закончится через 10 дней' });
  await expect(notice).toBeVisible();
  await notice.getByRole('button', { name: 'Заменить' }).click();
  await expect(sheet(page, 'Сохранение в GitHub')).toContainText('Токен закончится через 10 дней');
});
