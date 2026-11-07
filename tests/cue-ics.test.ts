// Строка «если — то» и файл календаря.
import { describe, expect, it } from 'vitest';
import { buildIcs, calendarEvents, fold } from '../src/game/ics';
import { addRoutine, addTask, findTask, newState, planRoutines, updateRoutine, updateTask, waitingOf } from '../src/game/state';

// Пятница, 23 октября 2026.
const at = (h: number, m = 0, d = 23) => new Date(2026, 9, d, h, m).getTime();
const URL = 'https://igor.github.io/lager/';

describe('когда начну', () => {
  it('пустая строка не сохраняется, правка меняет и убирает её', () => {
    const s = newState(at(8));
    const id = addTask(s, at(8), { title: 'Отчёт', questId: s.quests[0].id, day: s.day, cue: '  Когда налью кофе, открою документ ' });
    expect(findTask(s, id)!.cue).toBe('Когда налью кофе, открою документ');
    updateTask(s, id, { cue: '   ' });
    expect(findTask(s, id)!.cue).toBeUndefined();
    expect(findTask(s, addTask(s, at(8), { title: 'Б', questId: null, cue: '' }))!.cue).toBeUndefined();
  });

  it('у повторяющейся строка переходит в пришедшую задачу', () => {
    const s = newState(at(8));
    const r = addRoutine(s, at(8), { title: 'Зарядка', questId: null, level: 1, estimateMin: 15, at: '07:30', cue: 'Когда встану, раскатаю коврик', repeat: { every: 'day' } });
    planRoutines(s);
    expect(waitingOf(s, r)!.cue).toBe('Когда встану, раскатаю коврик');
    updateRoutine(s, r, { title: 'Зарядка', questId: null, level: 1, estimateMin: 15, at: '07:30', cue: null, repeat: { every: 'day' } });
    expect(waitingOf(s, r)!.cue).toBeUndefined();
  });
});

describe('файл календаря', () => {
  function game() {
    const s = newState(at(8));
    const q = s.quests[0].id;
    addTask(s, at(8), { title: 'Позвонить маме, папе; бабушке', questId: q, day: s.day, at: '19:00', estimateMin: 15, cue: 'Когда приду домой, наберу номер' });
    addTask(s, at(8), { title: 'Вчерашнее со временем', questId: q, day: '2026-10-22', at: '10:00' });
    addTask(s, at(8), { title: 'Без времени', questId: q, day: s.day });
    addRoutine(s, at(8), { title: 'Планёрка', questId: q, level: 1, estimateMin: 30, at: '10:00', repeat: { every: 'week', weekday: 1 } });
    return s;
  }

  it('утренний костёр по рабочим дням, задача со временем и повторяющаяся', () => {
    const s = game();
    const ics = buildIcs(s, at(9), { morning: 8 * 60 + 30, morningDays: 'work', url: URL });
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
    const flat = ics.replace(/\r\n /g, '');
    expect(flat).toContain('SUMMARY:Разжечь костёр');
    expect(flat).toContain('DTSTART:20261023T083000');
    expect(flat).toContain('RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR');
    expect(flat).toContain('SUMMARY:Позвонить маме\\, папе\\; бабушке');
    expect(flat).toContain('DTSTART:20261023T190000');
    expect(flat).toContain('DURATION:PT15M');
    expect(flat).toContain('DESCRIPTION:Когда приду домой\\, наберу номер\\nОткрыть Лагерь: https://igor.github.io/lager/');
    expect(flat).toContain('TRIGGER:-PT10M');
    // Понедельник, 26 октября: первая планёрка.
    expect(flat).toContain('DTSTART:20261026T100000');
    expect(flat).toContain('RRULE:FREQ=WEEKLY;BYDAY=MO');
    expect(flat).not.toContain('Вчерашнее');
    expect(flat).not.toContain('Без времени');
    expect(flat.match(/BEGIN:VEVENT/g)).toHaveLength(3);
  });

  it('утренний костёр каждый день или без него', () => {
    const s = game();
    expect(buildIcs(s, at(9), { morning: 9 * 60, morningDays: 'all', url: URL })).toContain('RRULE:FREQ=DAILY');
    const none = buildIcs(s, at(9), { morning: null, morningDays: 'work', url: URL });
    expect(none).not.toContain('Разжечь костёр');
    expect(calendarEvents(s, { morning: null, morningDays: 'work', url: URL })).toEqual({ morning: false, tasks: [expect.objectContaining({ at: '19:00' })], routines: 1, meetings: [] });
  });

  it('длинные строки переносятся по 75 байт, буквы не разрываются', () => {
    const line = `SUMMARY:${'Ж'.repeat(100)}`;
    const parts = fold(line).split('\r\n');
    for (const p of parts) expect(new TextEncoder().encode(p).length).toBeLessThanOrEqual(75);
    expect(parts.map((p, i) => (i ? p.slice(1) : p)).join('')).toBe(line);
  });

  it('без задач со временем после правки их нет и в файле', () => {
    const s = game();
    const t = s.tasks.find((x) => x.at === '19:00')!;
    updateTask(s, t.id, { at: null });
    expect(buildIcs(s, at(9), { morning: null, morningDays: 'work', url: URL })).not.toContain('Позвонить');
  });
});
