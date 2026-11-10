/// <reference types="node" />
// Автотесты экранов: собранный сайт из dist/ в настоящем браузере. День проходит на трёх размерах экрана, папки Летописи и Лавка на телефоне и компьютере,
// остальные проверки на одном телефоне. День, магия и Лавка ещё раз идут на телефоне с «Уменьшить движение»
// в системе: там магия спокойная. Перед запуском нужна сборка: npm run build, затем npm run e2e.
import { existsSync } from 'node:fs';
import { defineConfig, devices } from '@playwright/test';

if (!existsSync(new URL('./dist/index.html', import.meta.url))) {
  throw new Error('Автотесты проверяют собранный сайт из dist/. Сначала собери его: npm run build');
}

const PORT = 4173;
const CI = !!process.env.CI;

/** Телефон без привязки к конкретной модели: Chromium с касаниями и мобильной вёрсткой. */
const phone = (width: number, height: number) => ({
  ...devices['Pixel 7'],
  viewport: { width, height },
});

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: CI,
  retries: CI ? 1 : 0,
  // Только в консоль: что упало, видно в логе.
  reporter: 'list',
  use: {
    baseURL: `http://localhost:${PORT}/`,
    locale: 'ru-RU',
    timezoneId: 'Europe/Moscow',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'phone', use: phone(390, 844) },
    { name: 'small-phone', use: phone(360, 640), testMatch: 'day.spec.ts' },
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } }, testMatch: ['day.spec.ts', 'folders.spec.ts', 'shop.spec.ts'] },
    { name: 'calm', use: { ...phone(390, 844), reducedMotion: 'reduce' }, testMatch: ['day.spec.ts', 'magic.spec.ts', 'shop.spec.ts'] },
  ],
  webServer: {
    command: `npx vite preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}/`,
    reuseExistingServer: !CI,
  },
});
