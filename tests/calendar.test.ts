// Календарь: встречи, что стоит на день, сетка месяца, файл календаря и слияние встреч.
import { describe, expect, it } from 'vitest';
import { addMeeting, agendaOf, cleanTime, parseMeeting, dayCount, findMeeting, meetingsOn, monthWeeks, removeMeeting, restoreMeeting, shiftMonth, updateMeeting } from '../src/game/calendar';
import { buildIcs } from '../src/game/ics';
import { mergeGames } from '../src/game/merge';
import { addRoutine, addTask, complete, newState, planTask, settle } from '../src/game/state';
import { checkSave } from '../src/game/store';
import type { State } from '../src/game/types';

// Пятница, 23 октября 2026.
const at = (h: number, m = 0, d = 23) => new Date(2026, 9, d, h, m).getTime();
const titles = (s: State, day: string) => agendaOf(s, day).map((x) => (x.kind === 'meeting' ? x.meeting.title : x.kind === 'routine' ? x.routine.title : x.task.title));

describe('встречи', () => {
  it('встреча сохраняет дату, время, конец и место, лишнее убирается', () => {
    const s = newState(at(8));
    const id = addMeeting(s, at(8), { title: '  Стоматолог ', day: '2026-10-24', at: '9:05', until: '10:00', place: ' Ленина, 5 ' });
    expect(findMeeting(s, id)).toMatchObject({ title: 'Стоматолог', day: '2026-10-24', at: '09:05', until: '10:00', place: 'Ленина, 5' });
    // Конец раньше начала и пустое место не сохраняются, без времени нет и конца.
    updateMeeting(s, id, { title: 'Стоматолог', day: '2026-10-24', at: '11:00', until: '10:00', place: '  ' });
    expect(findMeeting(s, id)!.until).toBeUndefined();
    expect(findMeeting(s, id)!.place).toBeUndefined();
    updateMeeting(s, id, { title: '', day: '2026-10-25', at: '', until: '12:00' });
    expect(findMeeting(s, id)).toMatchObject({ title: 'Встреча', day: '2026-10-25', at: null });
    expect(findMeeting(s, id)!.until).toBeUndefined();
  });

  it('время понимается только настоящее', () => {
    expect(cleanTime('7:30')).toBe('07:30');
    expect(cleanTime('23:59')).toBe('23:59');
    expect(cleanTime('24:00')).toBeNull();
    expect(cleanTime('')).toBeNull();
    expect(cleanTime(null)).toBeNull();
  });

  it('удалённую встречу можно вернуть, пустой список не хранится', () => {
    const s = newState(at(8));
    const id = addMeeting(s, at(8), { title: 'Созвон', day: s.day, at: '15:00' });
    const gone = removeMeeting(s, id)!;
    expect(s.meetings).toBeUndefined();
    restoreMeeting(s, gone);
    expect(meetingsOn(s, s.day).map((m) => m.id)).toEqual([id]);
  });

  it('встреча не становится задачей и не переезжает на следующий день', () => {
    const s = newState(at(8));
    addMeeting(s, at(8), { title: 'Созвон', day: s.day, at: '15:00' });
    settle(s, at(9, 0, 24));
    expect(s.tasks).toHaveLength(0);
    expect(meetingsOn(s, '2026-10-23')).toHaveLength(1);
    expect(meetingsOn(s, s.day)).toHaveLength(0);
  });
});

describe('встреча одной фразой', () => {
  it('день и время, голый час тоже время, без слов о времени название как есть', () => {
    expect(parseMeeting('завтра в 10 стоматолог', '2026-10-23')).toEqual({ title: 'Стоматолог', day: '2026-10-24', at: '10:00' });
    expect(parseMeeting('в пятницу созвон в 15:30', '2026-10-23')).toEqual({ title: 'Созвон', day: '2026-10-30', at: '15:30' });
    expect(parseMeeting('Обед в 13', '2026-10-23')).toEqual({ title: 'Обед', at: '13:00' });
    expect(parseMeeting('Кафе в 25 метрах', '2026-10-23')).toEqual({ title: 'Кафе в 25 метрах' });
  });
});

describe('что стоит на день', () => {
  function game() {
    const s = newState(at(8));
    const q = s.quests[0].id;
    addMeeting(s, at(8), { title: 'Стоматолог', day: '2026-10-24', at: '10:00' });
    addMeeting(s, at(8), { title: 'День рождения Кати', day: '2026-10-24' });
    addTask(s, at(8), { title: 'Купить торт', questId: q, day: '2026-10-24' });
    addTask(s, at(8), { title: 'Позвонить в банк', questId: q, day: '2026-10-24', at: '09:00' });
    addTask(s, at(8), { title: 'Сдать отчёт', questId: q, due: '2026-10-24' });
    addRoutine(s, at(8), { title: 'Зарядка', questId: null, level: 1, estimateMin: 15, at: '07:30', repeat: { every: 'day' } });
    return s;
  }

  it('завтра: встреча на весь день, потом всё со временем по часам, потом дела без времени', () => {
    const s = game();
    expect(titles(s, '2026-10-24')).toEqual(['День рождения Кати', 'Зарядка', 'Позвонить в банк', 'Стоматолог', 'Купить торт', 'Сдать отчёт']);
    expect(agendaOf(s, '2026-10-24').map((x) => x.kind)).toEqual(['meeting', 'routine', 'task', 'meeting', 'task', 'due']);
    expect(dayCount(s, '2026-10-24')).toEqual({ meetings: 2, tasks: 4 });
  });

  it('пустой день пуст, повтор на сегодня не задваивается с пришедшей задачей', () => {
    const s = game();
    settle(s, at(9));
    expect(titles(s, s.day)).toEqual(['Зарядка']);
    expect(agendaOf(s, s.day)[0].kind).toBe('task');
    expect(titles(s, '2026-10-22')).toEqual([]);
  });

  it('сделанная задача остаётся в своём дне, срок у позванной на этот же день не повторяется', () => {
    const s = game();
    const id = s.tasks.find((t) => t.title === 'Сдать отчёт')!.id;
    planTask(s, id, s.day);
    complete(s, at(10), id);
    expect(titles(s, s.day)).toContain('Сдать отчёт');
    expect(agendaOf(s, s.day).find((x) => x.kind === 'task' && x.task.id === id)).toMatchObject({ done: true });
    expect(titles(s, '2026-10-24')).not.toContain('Сдать отчёт');
    // Сделанная задача в счёт дня не идёт, остаётся только зарядка.
    expect(dayCount(s, s.day).tasks).toBe(1);
  });
});

describe('сетка месяца', () => {
  it('недели с понедельника, весь месяц внутри', () => {
    const weeks = monthWeeks('2026-11');
    expect(weeks[0][0]).toBe('2026-10-26');
    expect(weeks[weeks.length - 1][6]).toBe('2026-12-06');
    expect(weeks).toHaveLength(6);
    expect(weeks.every((w) => w.length === 7)).toBe(true);
    // Февраль 2027 начинается в понедельник и занимает ровно четыре недели.
    expect(monthWeeks('2027-02')).toHaveLength(4);
  });

  it('месяцы листаются через год', () => {
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
  });
});

describe('встречи в файле календаря', () => {
  it('встреча со временем, местом и концом, встреча на весь день, прошедшая не попадает', () => {
    const s = newState(at(8));
    addMeeting(s, at(8), { title: 'Стоматолог', day: '2026-10-24', at: '10:00', until: '10:45', place: 'Ленина, 5; каб. 3' });
    addMeeting(s, at(8), { title: 'День рождения Кати', day: '2026-10-25' });
    addMeeting(s, at(8), { title: 'Вчерашняя', day: '2026-10-22', at: '10:00' });
    const flat = buildIcs(s, at(9), { morning: null, morningDays: 'work', url: 'https://x/' }).replace(/\r\n /g, '');
    expect(flat).toContain('DTSTART:20261024T100000');
    expect(flat).toContain('DURATION:PT45M');
    expect(flat).toContain('LOCATION:Ленина\\, 5\\; каб. 3');
    expect(flat).toContain('TRIGGER:-PT30M');
    expect(flat).toContain('DTSTART;VALUE=DATE:20261025');
    expect(flat).toContain('DURATION:P1D');
    expect(flat).toContain('TRIGGER:-PT360M');
    expect(flat).not.toContain('Вчерашняя');
    expect(flat.match(/BEGIN:VEVENT/g)).toHaveLength(2);
  });
});

describe('встречи при слиянии', () => {
  function pair() {
    const base = newState(at(8));
    const id = addMeeting(base, at(8), { title: 'Созвон', day: '2026-10-24', at: '15:00' });
    const copy = () => JSON.parse(JSON.stringify(base)) as State;
    return { base, local: copy(), remote: copy(), id };
  }

  it('встречи с двух устройств остаются обе, правки разных полей не теряются', () => {
    const { base, local, remote, id } = pair();
    local.touchedAt = at(9);
    const a = addMeeting(local, at(9), { title: 'С телефона', day: '2026-10-26' });
    updateMeeting(local, id, { title: 'Созвон с командой', day: '2026-10-24', at: '15:00' });
    remote.touchedAt = at(10);
    const b = addMeeting(remote, at(10), { title: 'С компьютера', day: '2026-10-27' });
    updateMeeting(remote, id, { title: 'Созвон', day: '2026-10-24', at: '16:00' });
    const m = mergeGames(base, local, remote, at(10, 5));
    expect(findMeeting(m, a)?.title).toBe('С телефона');
    expect(findMeeting(m, b)?.title).toBe('С компьютера');
    expect(findMeeting(m, id)).toMatchObject({ title: 'Созвон с командой', at: '16:00' });
  });

  it('удалённая на одном устройстве встреча уходит, последняя удалённая не оставляет пустого списка', () => {
    const { base, local, remote, id } = pair();
    removeMeeting(remote, id);
    const m = mergeGames(base, local, remote, at(9));
    expect(m.meetings).toBeUndefined();
  });

  it('без общей версии встречи берутся с обеих сторон', () => {
    const { local, remote } = pair();
    addMeeting(remote, at(9), { title: 'Ещё одна', day: '2026-10-28' });
    expect(mergeGames(null, local, remote, at(9)).meetings).toHaveLength(2);
  });

  it('сохранение с испорченным списком встреч открывается без него', () => {
    const raw = { ...newState(at(8)), meetings: 'не список' };
    expect(checkSave(JSON.parse(JSON.stringify(raw)))!.meetings).toBeUndefined();
  });
});
