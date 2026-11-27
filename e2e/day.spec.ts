// Обычный день целиком: знакомство, сбор отряда, работа у огня, привал, «Готово» и отбой.
// Идёт на маленьком телефоне, обычном телефоне и компьютере.
import { expect, test } from '@playwright/test';
import { addTask as addGameTask, newState } from '../src/game/state';
import { addTask, at, expectNoSideScroll, openGame, seedGame, setTime, sheet, tab, toast } from './helpers';

test('лист сворачивается до карточки и освобождает место лагерю', async ({ page }) => {
  await openGame(page);
  for (const title of ['Первое дело', 'Второе дело', 'Третье дело']) await addTask(page, title);
  await page.getByRole('button', { name: /Разжечь костёр/ }).click();
  const day = page.getByRole('region', { name: 'Задачи дня' });
  const before = (await day.boundingBox())!.height;
  await day.getByRole('button', { name: 'Свернуть до текущей задачи' }).click();
  await expect(day.getByRole('button', { name: 'Показать задачи дня' })).toHaveAttribute('aria-expanded', 'false');
  await expect.poll(async () => (await day.boundingBox())!.height).toBeLessThan(before);
  await expect(day.getByRole('heading', { name: 'Ещё сегодня' })).toBeHidden();
  await day.getByRole('button', { name: 'Показать задачи дня' }).click();
  await expect(day.getByRole('heading', { name: 'Ещё сегодня' })).toBeVisible();
});

test('номера и кнопки лагеря нажимаются по всей области 44 на 44', async ({ page }, testInfo) => {
  const s = newState(at(9).getTime());
  for (let i = 0; i < 6; i++) addGameTask(s, at(9).getTime(), { title: `Дело ${i + 1}`, questId: s.quests[0].id, level: 1, day: s.day });
  for (let i = 0; i < 3; i++) addGameTask(s, at(9).getTime(), { title: `Просроченное дело ${i + 1}`, questId: s.quests[0].id, level: 1, day: null, due: '2026-10-22' });
  await seedGame(page, s);
  await openGame(page);
  await page.getByRole('button', { name: /Разжечь костёр/ }).click();
  const targets = page.locator('.figure-hit, .camp-hit');
  await expect(page.locator('.figure-hit')).toHaveCount(9);
  if (testInfo.project.use.isMobile) {
    await expect.poll(() => page.locator('.scene-wrap').evaluate((wrap) => {
      const area = wrap.getBoundingClientRect();
      const bg = wrap.querySelector('.scene-backdrop, .scene-bg');
      if (!bg) return false;
      const art = bg.getBoundingClientRect();
      return area.width === window.innerWidth && art.left <= area.left && art.right >= area.right &&
        art.top <= area.top && art.bottom >= area.bottom;
    })).toBe(true);
  }
  await page.screenshot({ path: testInfo.outputPath('lager.png') });
  const bad = await targets.evaluateAll((buttons) => buttons.flatMap((button) => {
    const r = button.getBoundingClientRect();
    const name = button.getAttribute('aria-label') ?? button.textContent;
    if (r.width < 44 || r.height < 44) return [`${name}: ${r.width}×${r.height}`];
    const points = [[r.left + 1, r.top + 1], [r.right - 1, r.bottom - 1], [r.left + r.width / 2, r.top + r.height / 2]];
    return points.filter(([x, y]) => !button.contains(document.elementFromPoint(x, y))).map(() => `${name}: область перекрыта`);
  }));
  expect(bad).toEqual([]);
  await expectNoSideScroll(page);
  const number = page.locator('.figure-hit').first();
  const bounds = (await number.boundingBox())!;
  await page.mouse.click(bounds.x + 2, bounds.y + 2);
  await expect(page.getByRole('dialog')).toContainText(/дело/i);
});

test('первое дело можно начать прямо в Лагере и получить искру', async ({ page }) => {
  await openGame(page, { intro: true });
  await sheet(page, 'Знакомство').getByRole('button', { name: 'К костру', exact: true }).click();
  const day = page.getByRole('region', { name: 'Задачи дня' });
  const first = day.getByRole('button', { name: 'Добавить первое дело' });
  await first.click();
  const form = sheet(page, 'Новая задача');
  await form.getByLabel('Что сделать').fill('Разобрать почту');
  await form.getByRole('button', { name: 'Взять в отряд' }).click();
  await expect(form).toBeHidden();
  await expect(day).toContainText('Разобрать почту');
  await day.getByRole('button', { name: 'Начать задачу' }).click();
  await expect(day.getByRole('heading', { name: 'Сейчас у огня' })).toBeVisible();
  await expect(day.getByRole('button', { name: 'Разобрать почту' })).toBeVisible();
  await expect(day.getByText(/зажжётся искра/)).toBeVisible();
  await setTime(page, new Date(await page.evaluate(() => Date.now()) + 2 * 60_000));
  await expect(day.getByText(/Искра горит/)).toBeVisible();
  await expect(toast(page)).toContainText('Искра зажглась');
  await expect(day.getByRole('button', { name: 'Пауза' })).toBeVisible();
  await expectNoSideScroll(page);
});

test('день от знакомства до отбоя', async ({ page }) => {
  await openGame(page, { time: at(9), intro: true });

  // Первый запуск: из знакомства в Лагерь, затем в сбор отряда.
  await expect(sheet(page, 'Знакомство')).toBeVisible();
  await page.getByRole('button', { name: 'К костру', exact: true }).click();
  await tab(page, 'План').click();
  await expect(page.getByRole('heading', { level: 1, name: 'Сбор отряда' })).toBeVisible();
  await expectNoSideScroll(page);

  // Две задачи на сегодня.
  await addTask(page, 'Сдать отчёт', { quest: 'Работа', size: '1 ч' });
  await expect(page.getByRole('status').filter({ hasText: 'Варвар в отряде' })).toBeAttached();
  await addTask(page, 'Ответить на почту', { quest: 'Работа', size: '15 мин' });
  const today = page.locator('section').filter({ has: page.getByRole('heading', { name: 'К костру сегодня' }) });
  await expect(today.getByRole('button', { name: /^Сдать отчёт/ })).toBeVisible();
  await expect(today.getByRole('button', { name: /^Ответить на почту/ })).toBeVisible();
  await expect(today).toContainText('2 задачи');

  // Разжечь костёр: игра уходит в лагерь.
  await page.getByRole('button', { name: /Разжечь костёр/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Лагерь' })).toBeAttached();
  const day = page.getByRole('region', { name: 'Задачи дня' });
  await expect(day.getByRole('heading', { name: 'У огня пусто' })).toBeVisible();
  await expectNoSideScroll(page);

  // Позвать к огню первую задачу и поработать полчаса.
  await day.getByRole('button', { name: 'Позвать к огню' }).click();
  await expect(day.getByRole('heading', { name: 'Сейчас у огня' })).toBeVisible();
  await expect(day.getByRole('button', { name: 'Сдать отчёт' })).toBeVisible();
  // Ровно полчаса от того, как позвали: на медленной машине до этого шага проходит несколько секунд.
  await setTime(page, new Date((await page.evaluate(() => Date.now())) + 30 * 60_000));
  await expect(day.locator('.timer')).toContainText('0:30');

  // Привал и обратно.
  await day.getByRole('button', { name: 'Привал' }).click();
  await expect(day.getByRole('heading', { name: 'Привал' })).toBeVisible();
  await expect(day.getByRole('button', { name: 'Снова в путь' })).toBeFocused();
  await day.getByRole('button', { name: 'Снова в путь' }).click();
  await expect(day.getByRole('heading', { name: 'Сейчас у огня' })).toBeVisible();

  // Готово: награда, и дальше вторая задача.
  await day.getByRole('button', { name: 'Готово' }).click();
  await expect(day.getByRole('heading', { name: 'Сделано!' })).toBeVisible();
  await expect(day).toContainText('+50 золота');
  await expect(day).toContainText('Дальше:');
  await expect(day).toContainText('Ответить на почту');
  await expect(page.locator('.topbar')).toContainText('Золото: 50');
  await expectNoSideScroll(page);

  // Вечер: перед отбоем лагерь подводит итоги.
  await setTime(page, at(22, 40));
  await page.getByRole('button', { name: 'Скоро отбой: подвести итоги дня' }).click();
  const summary = sheet(page, 'Итоги дня');
  await expect(summary).toBeVisible();
  await expect(summary).toContainText(/1\s*сделано/);
  const keep = summary.getByRole('checkbox', { name: /Ответить на почту/ });
  await expect(keep).toBeChecked();
  await summary.getByRole('button', { name: 'Отбой', exact: true }).click();
  await expect(day.getByRole('heading', { name: 'Отряд спит' })).toBeVisible();
  await expect(day.getByRole('heading', { name: 'Отряд спит' })).toBeFocused();
  await expectNoSideScroll(page);

  // Утром оставленная у костра задача снова в плане.
  await setTime(page, at(8, 0, 24));
  await expect(page.getByRole('heading', { level: 1, name: 'Сбор отряда' })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Ответить на почту/ })).toBeVisible();
  await tab(page, 'Летопись').click();
  await expect(page.getByRole('heading', { level: 1, name: 'Летопись' })).toBeVisible();
  await expectNoSideScroll(page);
});

test('между задачами можно переключаться, а таймер каждой продолжается с того же места', async ({ page }) => {
  await openGame(page, { time: at(9) });
  await addTask(page, 'Сдать отчёт', { quest: 'Работа', size: '1 ч' });
  await addTask(page, 'Ответить на почту', { quest: 'Работа', size: '15 мин' });
  await page.getByRole('button', { name: /Разжечь костёр/ }).click();
  const day = page.getByRole('region', { name: 'Задачи дня' });
  const minutesLater = async (min: number) => setTime(page, new Date((await page.evaluate(() => Date.now())) + min * 60_000));

  // Начать первую задачу и поработать 20 минут.
  await day.getByRole('button', { name: 'Позвать к огню' }).click();
  await expect(day.getByRole('heading', { name: 'Сейчас у огня' })).toBeVisible();
  await minutesLater(20);
  await expect(day.locator('.timer')).toContainText('0:20');

  // Пауза: задача остаётся у огня, таймер стоит.
  await day.getByRole('button', { name: 'Пауза' }).click();
  await expect(day.getByRole('button', { name: 'Продолжить' })).toBeVisible();
  await minutesLater(15);
  await expect(day.locator('.timer')).toContainText('0:20');
  await expectNoSideScroll(page);

  // Переключиться на вторую: время первой сохраняется и видно в списке.
  await day.getByRole('button', { name: /^Ответить на почту/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: /^(Позвать к огню|К огню)/ }).click();
  await expect(toast(page)).toContainText('«Сдать отчёт» ждёт у костра, 20 мин сохранено');
  await expect(day.getByRole('button', { name: 'Ответить на почту' })).toBeVisible();
  await expect(day.getByRole('button', { name: /^Сдать отчёт/ })).toContainText('20 мин');
  await minutesLater(10);

  // Вернуться к первой: «Продолжить», и таймер идёт дальше от 20 минут.
  await day.getByRole('button', { name: /^Сдать отчёт/ }).click();
  const card = page.getByRole('dialog');
  await expect(card).toContainText('У огня уже 20 мин');
  await card.getByRole('button', { name: /^Продолжить/ }).click();
  await expect(day.getByRole('button', { name: 'Сдать отчёт' })).toBeVisible();
  await expect(day.getByRole('button', { name: /^Ответить на почту/ })).toContainText('10 мин');
  await minutesLater(5);
  await expect(day.locator('.timer')).toContainText('0:25');
  await expectNoSideScroll(page);
});

test('у огня можно поменять, сколько займёт задача, и таймер не сбивается', async ({ page }) => {
  await openGame(page, { time: at(9) });
  await addTask(page, 'Сдать отчёт', { quest: 'Работа', size: '30 мин' });
  await page.getByRole('button', { name: /Разжечь костёр/ }).click();
  const day = page.getByRole('region', { name: 'Задачи дня' });
  const minutesLater = async (min: number) => setTime(page, new Date((await page.evaluate(() => Date.now())) + min * 60_000));
  await day.getByRole('button', { name: 'Позвать к огню' }).click();
  await minutesLater(25);
  await day.getByRole('button', { name: 'Пауза' }).click();
  await expect(day.locator('.timer')).toContainText('0:25');
  await expect(day.locator('.timer')).toContainText('из ~30 мин');

  // «Нужно ещё 15 минут»: считается от отданных 25, пауза остаётся.
  await day.getByRole('button', { name: /из ~30 мин, изменить длительность/ }).click();
  const form = sheet(page, 'Сколько займёт');
  await expect(form).toContainText('У огня уже 25 мин');
  await form.getByRole('button', { name: /^Ещё 15 мин, всего 40 мин$/ }).click();
  await expect(form).toBeHidden();
  await expect(toast(page)).toContainText('«Сдать отчёт» теперь ~40 мин');
  await expect(day.locator('.timer')).toContainText('из ~40 мин');
  await expect(day.locator('.timer')).toContainText('0:25');
  await expect(day.getByRole('button', { name: 'Продолжить' })).toBeVisible();
  await expectNoSideScroll(page);

  // Вся задача целиком: выбрать 2 часа и сохранить. Таймер идёт дальше от прежнего места.
  await day.getByRole('button', { name: 'Продолжить' }).click();
  await minutesLater(5);
  await day.getByRole('button', { name: /изменить длительность/ }).click();
  await form.getByRole('radiogroup', { name: 'Или вся задача целиком' }).getByRole('radio', { name: '2 ч', exact: true }).click();
  await form.getByRole('button', { name: 'Сохранить' }).click();
  await expect(day.locator('.timer')).toContainText('из ~2 ч');
  await expect(day.locator('.timer')).toContainText('0:30');

  // «Вернуть» отменяет правку.
  await toast(page).getByRole('button', { name: 'Вернуть' }).click();
  await expect(day.locator('.timer')).toContainText('из ~40 мин');

  // Из карточки задачи тоже можно открыть этот лист.
  await day.getByRole('button', { name: 'Сдать отчёт' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Сколько займёт' }).click();
  await expect(sheet(page, 'Сколько займёт')).toBeVisible();
});
