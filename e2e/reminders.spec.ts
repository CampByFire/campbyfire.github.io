// Строка «когда начну» и напоминания через файл календаря.
import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { at, axe, openGame, sheet, tab, toast } from './helpers';

test('«когда начну» видно у огня, а файл календаря несёт её в напоминание', async ({ page }) => {
  await openGame(page, { time: at(9) });
  await tab(page, 'Добавить задачу').click();
  const form = sheet(page, 'Новая задача');
  await form.getByLabel('Что сделать').fill('Позвонить маме');
  await form.getByRole('radiogroup', { name: 'Сфера или проект' }).getByRole('radio', { name: 'Работа' }).click();
  await form.getByLabel('Во сколько').fill('19:00');
  await form.getByLabel('Когда начну').fill('Когда приду домой, наберу номер');
  expect(await axe(page), 'Новая задача с «когда начну»').toEqual([]);
  await form.getByRole('button', { name: 'Взять в отряд' }).click();
  await expect(form).toBeHidden();

  await page.getByRole('button', { name: /Разжечь костёр/ }).click();
  const day = page.getByRole('region', { name: 'Задачи дня' });
  await expect(day.locator('.cue')).toHaveText('Когда начать: Когда приду домой, наберу номер');

  await tab(page, 'Настройки').click();
  const remind = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Напоминания' }) });
  await expect(remind).toContainText('утренний костёр в 09:00, 1 задача со временем');
  await remind.getByRole('radiogroup', { name: 'Утренний костёр' }).getByRole('radio', { name: 'Каждый день' }).click();
  await remind.getByLabel('Во сколько').fill('08:15');
  await expect(remind).toContainText('утренний костёр в 08:15');
  expect(await axe(page), 'Напоминания').toEqual([]);

  const [file] = await Promise.all([page.waitForEvent('download'), remind.getByRole('button', { name: 'Добавить в календарь' }).click()]);
  expect(file.suggestedFilename()).toBe('lager.ics');
  const ics = readFileSync((await file.path())!, 'utf8').replace(/\r\n /g, '');
  expect(ics).toContain('SUMMARY:Разжечь костёр');
  expect(ics).toContain('DTSTART:20261023T081500');
  expect(ics).toContain('RRULE:FREQ=DAILY');
  expect(ics).toContain('SUMMARY:Позвонить маме');
  expect(ics).toContain('DTSTART:20261023T190000');
  expect(ics).toContain('DESCRIPTION:Когда приду домой\\, наберу номер');
  await expect(toast(page)).toContainText('календарь добавит напоминания');

  // Выбор помнит устройство.
  await page.reload();
  await tab(page, 'Настройки').click();
  await expect(remind).toContainText('утренний костёр в 08:15');
});
