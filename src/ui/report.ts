// Отчёт об ошибке: его игрок копирует и отправляет. Игры и токена в нём нет.
import { BUILD, VERSION } from '../version';
import { isStandalone } from './device';

export function errorReport(error: unknown): string {
  const e = error instanceof Error ? error : new Error(String(error));
  const stack = (e.stack ?? '')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith(`${e.name}: `))
    .slice(0, 12);
  return [
    `Лагерь у костра ${VERSION} (${BUILD})`,
    `Когда: ${new Date().toLocaleString('ru-RU')}`,
    `Браузер: ${navigator.userAgent}`,
    `Экран: ${window.innerWidth}×${window.innerHeight}${isStandalone() ? ', с экрана «Домой»' : ''}`,
    `Ошибка: ${e.name}: ${e.message}`,
    ...stack,
  ].join('\n');
}

/** Куда игроки пишут о проблемах: раздел Issues репозитория Лагеря. */
export const ISSUES_URL = 'https://github.com/CampByFire/campbyfire.github.io/issues';

/** Новая запись в Issues, в которую уже вставлен отчёт: игроку остаётся рассказать, что он делал. */
export function newIssueUrl(report: string): string {
  const body = `Что я делал, когда это случилось:\n\n\n<details><summary>Отчёт</summary>\n\n\`\`\`\n${report}\n\`\`\`\n</details>\n`;
  return `${ISSUES_URL}/new?title=${encodeURIComponent('Ошибка в Лагере')}&body=${encodeURIComponent(body)}`;
}
