import { describe, expect, it } from 'vitest';
import { ISSUES_URL, newIssueUrl } from '../src/ui/report';

describe('сообщить о проблеме', () => {
  it('ведёт в Issues репозитория Лагеря', () => {
    expect(ISSUES_URL).toBe('https://github.com/CampByFire/campbyfire.github.io/issues');
  });

  it('открывает новую запись с заголовком и вставленным отчётом', () => {
    const url = new URL(newIssueUrl('Лагерь у костра 0.10.1\nОшибка: TypeError: x & y?'));
    expect(url.origin + url.pathname).toBe(`${ISSUES_URL}/new`);
    expect(url.searchParams.get('title')).toBe('Ошибка в Лагере');
    const body = url.searchParams.get('body')!;
    expect(body).toContain('Что я делал, когда это случилось');
    expect(body).toContain('Ошибка: TypeError: x & y?');
  });
});
