// Свой цвет проекта: кодом цвета и ползунками, и номера над спутниками у костра в цвете их проекта.
import { expect, test, type Locator } from '@playwright/test';
import { addTask, axe, openGame, sheet, tab } from './helpers';

/** «#2bb3a3» → «rgb(43, 179, 163)», как цвет отдаёт getComputedStyle. */
const rgb = (hex: string) => `rgb(${[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(', ')})`;
const fill = (el: Locator) => el.evaluate((e) => getComputedStyle(e).backgroundColor);

test('свой цвет проекта: кодом и ползунком, и он помнится', async ({ page }) => {
  await openGame(page);
  await tab(page, 'Королевство').click();
  await page.getByRole('button', { name: 'новый проект' }).click();
  const form = sheet(page, 'Новый проект');
  await form.getByLabel('Название').fill('Сертификат');

  // Знамя выбирается как радиокнопки: стрелки доходят и до своего цвета, тогда под ним открываются код и ползунки.
  const banner = form.getByRole('radiogroup', { name: 'Знамя' });
  await banner.getByRole('radio', { checked: true }).focus();
  // Новый проект берёт знамя своей сферы: у «Работы» синее, второе по счёту.
  await expect(banner.getByRole('radio', { name: 'синее' })).toBeChecked();
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft');
  const own = banner.getByRole('radio', { name: /^Свой цвет/ });
  await expect(own).toBeChecked();
  await expect(own).toBeFocused();
  const code = form.getByLabel('Код цвета');
  await expect(code).toBeVisible();
  expect(await axe(page), 'Новый проект со своим цветом').toEqual([]);

  // Не код цвета: проект не сохраняется, под полем сказано почему.
  await code.fill('#12');
  await form.getByRole('button', { name: 'Начать проект' }).click();
  await expect(form).toBeVisible();
  await expect(code).toHaveAttribute('aria-invalid', 'true');
  await expect(form.getByText('Код цвета: решётка и шесть знаков')).toBeVisible();

  // Код без решётки тоже годится, ползунки встают по нему.
  await code.fill('2bb3a3');
  await expect(code).toHaveAttribute('aria-invalid', 'false');
  await expect(own).toHaveAccessibleName(/^Свой цвет\s*,\s*бирюзовый$/);
  const hue = form.getByRole('slider', { name: 'Оттенок' });
  await expect(hue).toHaveValue('173');
  await expect(hue).toHaveAttribute('aria-valuetext', 'бирюзовый, 173°');

  // Ползунок яркости уводит цвет темнее, код идёт за ним.
  const light = form.getByRole('slider', { name: 'Яркость' });
  await light.focus();
  for (let i = 0; i < 15; i++) await page.keyboard.press('ArrowLeft');
  await expect(light).toHaveValue('29');
  await expect(code).toHaveValue('#1D776D');
  await form.getByRole('button', { name: 'Начать проект' }).click();
  await expect(form).toBeHidden();

  const card = page.getByRole('button', { name: /^Сертификат/ });
  expect(await fill(card.locator('.qdot'))).toBe(rgb('#1d776d'));

  // После перезагрузки проект открывается со своим цветом.
  await page.reload();
  await tab(page, 'Королевство').click();
  await page.getByRole('button', { name: /^Сертификат/ }).click();
  await sheet(page, 'Сертификат').getByRole('button', { name: 'Изменить проект' }).click();
  const edit = sheet(page, 'Проект');
  await expect(edit.getByRole('radio', { name: /^Свой цвет/ })).toBeChecked();
  await expect(edit.getByLabel('Код цвета')).toHaveValue('#1D776D');

  // Готовое знамя, потом снова своё: свой цвет никуда не делся.
  await edit.getByRole('radio', { name: 'синее' }).click();
  await expect(edit.getByLabel('Код цвета')).toBeHidden();
  await edit.getByRole('radio', { name: /^Свой цвет/ }).click();
  await expect(edit.getByLabel('Код цвета')).toHaveValue('#1D776D');
});

test('номера над спутниками у костра в цвете их проекта', async ({ page }) => {
  await openGame(page);
  await tab(page, 'Королевство').click();
  await page.getByRole('button', { name: 'новый проект' }).click();
  const form = sheet(page, 'Новый проект');
  await form.getByLabel('Название').fill('Сертификат');
  await form.getByRole('radio', { name: /^Свой цвет/ }).click();
  await form.getByLabel('Код цвета').fill('#2bb3a3');
  await form.getByRole('button', { name: 'Начать проект' }).click();
  await expect(form).toBeHidden();

  await tab(page, 'План').click();
  await addTask(page, 'Модуль React', { quest: 'Сертификат', size: '1 ч' });
  await addTask(page, 'Сдать отчёт', { quest: 'Работа', size: '1 ч' });
  await page.getByRole('button', { name: /Разжечь костёр/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Лагерь' })).toBeAttached();

  const scene = page.locator('.scene');
  const cert = scene.getByRole('button', { name: /^1\. .*Модуль React/ });
  const work = scene.getByRole('button', { name: /^2\. .*Сдать отчёт/ });
  expect(await fill(cert)).toBe(rgb('#2bb3a3'));
  expect(await fill(work)).toBe(rgb('#4f7be0'));
  // В списке дня номер того же цвета, что над головой.
  const day = page.getByRole('region', { name: 'Задачи дня' });
  expect(await fill(day.locator('.num').first())).toBe(rgb('#2bb3a3'));
  expect(await axe(page), 'Лагерь с номерами в цвете проектов').toEqual([]);

  // Спутник у огня: номер в цвете проекта, в золотой оправе.
  await day.getByRole('button', { name: 'Позвать к огню' }).click();
  await expect(day.getByRole('heading', { name: 'Сейчас у огня' })).toBeVisible();
  const ring = scene.getByRole('button', { name: /^1\. .*у огня: Модуль React/ });
  expect(await fill(ring)).toBe(rgb('#2bb3a3'));
  await expect(ring).toHaveClass(/num-current/);
});
