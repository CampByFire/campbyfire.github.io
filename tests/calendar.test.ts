// Календарь: встречи, что стоит на день, сетка месяца, файл календаря и слияние встреч.
import { describe, expect, it } from 'vitest';
import { addMeeting, agendaOf, dropStart, moveMeeting, moveMeetingOnce, restoreMeetingTime, undoMoveOnce, cleanTime, meetingOccursOn, nextMeetingDay, parseMeeting, skipMeetingDay, timelineOf, unskipMeetingDay, dayCount, findMeeting, meetingsOn, monthWeeks, removeMeeting, restoreMeeting, shiftMonth, updateMeeting } from '../src/game/calendar';
import { contrast, meetingTint } from '../src/game/color';
import { buildIcs } from '../src/game/ics';
import { mergeGames } from '../src/game/merge';
import { addRoutine, addTask, complete, findRoutine, findTask, newState, planTask, setRoutineAt, settle, waitingOf } from '../src/game/state';
import { checkSave } from '../src/game/store';
import type { Meeting, MeetingRepeat, State } from '../src/game/types';

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
    expect(findMeeting(s, id)).toMatchObject({ title: 'Событие', day: '2026-10-25', at: null });
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

describe('повторы встреч', () => {
  /** Дни серии в промежутке от from до to включительно. */
  function days(repeat: MeetingRepeat | undefined, first: string, from: string, to: string, extra: Partial<Meeting> = {}): string[] {
    const m: Meeting = { id: 'm1', title: 'Серия', day: first, at: null, createdAt: 0, ...(repeat ? { repeat } : {}), ...extra };
    const out: string[] = [];
    for (let d = new Date(`${from}T12:00`); ; d.setDate(d.getDate() + 1)) {
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      if (key > to) return out;
      if (meetingOccursOn(m, key)) out.push(key);
    }
  }

  it('без повтора встреча стоит только в свой день, как в старых сохранениях', () => {
    expect(days(undefined, '2026-10-23', '2026-10-01', '2026-11-30')).toEqual(['2026-10-23']);
  });

  it('каждый день, начиная с первого, раньше него серии нет', () => {
    expect(days('day', '2026-10-30', '2026-10-28', '2026-11-02')).toEqual(['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02']);
  });

  it('по будням пропускает субботу и воскресенье, даже если первый день выходной', () => {
    // 24 октября 2026 это суббота.
    expect(days('workday', '2026-10-24', '2026-10-24', '2026-10-31')).toEqual(['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30']);
  });

  it('каждую неделю и каждые 2 недели считаются от первого дня, смена времени на часах не мешает', () => {
    expect(days('week', '2026-10-23', '2026-10-23', '2026-11-13')).toEqual(['2026-10-23', '2026-10-30', '2026-11-06', '2026-11-13']);
    expect(days('week2', '2026-10-23', '2026-10-23', '2026-11-20')).toEqual(['2026-10-23', '2026-11-06', '2026-11-20']);
    // Через весенний и осенний перевод часов в Европе и США.
    expect(days('week', '2026-03-02', '2026-03-23', '2026-04-06')).toEqual(['2026-03-23', '2026-03-30', '2026-04-06']);
    expect(days('week', '2026-10-19', '2026-10-26', '2026-11-09')).toEqual(['2026-10-26', '2026-11-02', '2026-11-09']);
  });

  it('каждый месяц: число сохраняется, 31-е в коротком месяце встаёт на последний день', () => {
    expect(days('month', '2026-10-15', '2026-10-01', '2027-01-31')).toEqual(['2026-10-15', '2026-11-15', '2026-12-15', '2027-01-15']);
    expect(days('month', '2027-01-31', '2027-01-01', '2027-04-30')).toEqual(['2027-01-31', '2027-02-28', '2027-03-31', '2027-04-30']);
    // Короткий февраль не сбивает следующие месяцы, в високосный год у февраля 29 дней.
    expect(days('month', '2028-01-30', '2028-02-01', '2028-03-31')).toEqual(['2028-02-29', '2028-03-30']);
  });

  it('каждый год: та же дата, 29 февраля вне високосного года встаёт на 28-е', () => {
    expect(days('year', '2026-10-23', '2026-01-01', '2028-12-31')).toEqual(['2026-10-23', '2027-10-23', '2028-10-23']);
    expect(days('year', '2028-02-29', '2028-01-01', '2032-12-31')).toEqual(['2028-02-29', '2029-02-28', '2030-02-28', '2031-02-28', '2032-02-29']);
  });

  it('последний день серии включён, после него встреч нет', () => {
    expect(days('week', '2026-10-23', '2026-10-23', '2026-12-31', { repeatUntil: '2026-11-06' })).toEqual(['2026-10-23', '2026-10-30', '2026-11-06']);
  });

  it('повтор, которого эта версия не знает, считается одним разом', () => {
    expect(days('hour' as MeetingRepeat, '2026-10-23', '2026-10-23', '2026-10-25')).toEqual(['2026-10-23']);
  });

  it('следующий день серии: с учётом пропусков и конца', () => {
    const m: Meeting = { id: 'm1', title: 'Серия', day: '2026-10-23', at: null, createdAt: 0, repeat: 'week', skip: ['2026-10-30'], repeatUntil: '2026-11-06' };
    expect(nextMeetingDay(m, '2026-10-01')).toBe('2026-10-23');
    expect(nextMeetingDay(m, '2026-10-24')).toBe('2026-11-06');
    expect(nextMeetingDay(m, '2026-11-07')).toBeNull();
    expect(nextMeetingDay({ ...m, repeat: undefined, repeatUntil: undefined, skip: undefined }, '2026-10-24')).toBeNull();
  });

  it('серия это одна запись: день берётся на лету, на шкале и в счёте дня она есть', () => {
    const s = newState(at(8));
    const id = addMeeting(s, at(8), { title: 'Планёрка', day: '2026-10-23', at: '10:00', until: '10:30', repeat: 'week' });
    expect(s.meetings).toHaveLength(1);
    expect(meetingsOn(s, '2026-11-06').map((m) => m.id)).toEqual([id]);
    expect(meetingsOn(s, '2026-11-07')).toEqual([]);
    expect(agendaOf(s, '2026-11-06')[0]).toMatchObject({ kind: 'meeting', day: '2026-11-06', at: '10:00' });
    expect(timelineOf(agendaOf(s, '2026-11-06'))[0]).toMatchObject({ start: 600, end: 630 });
    expect(dayCount(s, '2026-11-06').meetings).toBe(1);
  });

  it('пропуск убирает один день и возвращается, остальные дни на месте', () => {
    const s = newState(at(8));
    const id = addMeeting(s, at(8), { title: 'Планёрка', day: '2026-10-23', repeat: 'week' });
    skipMeetingDay(s, id, '2026-10-30');
    skipMeetingDay(s, id, '2026-10-30');
    // День не из серии не пропускается.
    skipMeetingDay(s, id, '2026-10-31');
    expect(findMeeting(s, id)!.skip).toEqual(['2026-10-30']);
    expect(meetingsOn(s, '2026-10-30')).toEqual([]);
    expect(meetingsOn(s, '2026-11-06')).toHaveLength(1);
    unskipMeetingDay(s, id, '2026-10-30');
    expect(findMeeting(s, id)!.skip).toBeUndefined();
    expect(meetingsOn(s, '2026-10-30')).toHaveLength(1);
  });

  it('удаление серии убирает все её дни, «Вернуть» возвращает их вместе с пропусками', () => {
    const s = newState(at(8));
    const id = addMeeting(s, at(8), { title: 'Планёрка', day: '2026-10-23', repeat: 'week' });
    skipMeetingDay(s, id, '2026-10-30');
    const gone = removeMeeting(s, id)!;
    expect(meetingsOn(s, '2026-11-06')).toEqual([]);
    restoreMeeting(s, gone);
    expect(meetingsOn(s, '2026-11-06')).toHaveLength(1);
    expect(meetingsOn(s, '2026-10-30')).toEqual([]);
  });

  it('правка серии: пропуски остаются для дней нового расписания, без повтора уходят вместе с концом', () => {
    const s = newState(at(8));
    const id = addMeeting(s, at(8), { title: 'Планёрка', day: '2026-10-23', repeat: 'week', repeatUntil: '2026-12-31' });
    skipMeetingDay(s, id, '2026-10-30');
    const same = { title: 'Новое имя', day: '2026-10-23', repeatUntil: '2026-12-31' };
    updateMeeting(s, id, { ...same, repeat: 'week' });
    expect(findMeeting(s, id)).toMatchObject({ title: 'Новое имя', repeat: 'week', skip: ['2026-10-30'], repeatUntil: '2026-12-31' });
    updateMeeting(s, id, { ...same, repeat: 'week2' });
    expect(findMeeting(s, id)!.skip).toBeUndefined();
    skipMeetingDay(s, id, '2026-11-06');
    updateMeeting(s, id, { title: 'Один раз', day: '2026-10-23' });
    expect(findMeeting(s, id)!.repeat).toBeUndefined();
    expect(findMeeting(s, id)!.repeatUntil).toBeUndefined();
    expect(findMeeting(s, id)!.skip).toBeUndefined();
  });

  it('конец раньше первого дня не сохраняется', () => {
    const s = newState(at(8));
    const id = addMeeting(s, at(8), { title: 'Планёрка', day: '2026-10-23', repeat: 'day', repeatUntil: '2026-10-01' });
    expect(findMeeting(s, id)!.repeatUntil).toBeUndefined();
  });
});

describe('цвет встречи', () => {
  it('готовый и свой цвет сохраняются, без цвета поля нет', () => {
    const s = newState(at(8));
    const id = addMeeting(s, at(8), { title: 'Созвон', day: s.day, color: 'green' });
    expect(findMeeting(s, id)!.color).toBe('green');
    updateMeeting(s, id, { title: 'Созвон', day: s.day, color: '#2bb3a3' });
    expect(findMeeting(s, id)!.color).toBe('#2bb3a3');
    updateMeeting(s, id, { title: 'Созвон', day: s.day });
    expect('color' in findMeeting(s, id)!).toBe(false);
  });

  it('буквы на фоне встречи читаются при любом цвете', () => {
    for (const hex of ['#ffffff', '#ffff00', '#00ffff', '#000000', '#d64b3c', '#e6b739']) {
      expect(contrast(meetingTint(hex), '#fbf3e2')).toBeGreaterThanOrEqual(4.5);
      expect(contrast(meetingTint(hex), '#e3d6bd')).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe('шкала дня', () => {
  it('дела со временем по часам, накладки встают рядом, без времени на шкалу не попадает', () => {
    const s = newState(at(8));
    const q = s.quests[0].id;
    const day = '2026-10-24';
    addMeeting(s, at(8), { title: 'Стоматолог', day, at: '10:00', until: '11:00' });
    addMeeting(s, at(8), { title: 'Созвон', day, at: '10:30' });
    addTask(s, at(8), { title: 'Отчёт', questId: q, day, at: '10:45', estimateMin: 15 });
    addMeeting(s, at(8), { title: 'Ужин', day, at: '19:00' });
    addMeeting(s, at(8), { title: 'Весь день', day });
    const slots = timelineOf(agendaOf(s, day));
    const by = (t: string) => slots.find((x) => (x.item.kind === 'meeting' ? x.item.meeting.title : x.item.kind === 'task' ? x.item.task.title : '') === t)!;
    expect(slots).toHaveLength(4);
    expect(by('Стоматолог')).toMatchObject({ start: 600, end: 660, col: 0, cols: 3 });
    expect(by('Созвон')).toMatchObject({ start: 630, end: 690, col: 1, cols: 3 });
    expect(by('Отчёт')).toMatchObject({ start: 645, end: 660, col: 2, cols: 3 });
    expect(by('Ужин')).toMatchObject({ start: 1140, end: 1200, col: 0, cols: 1 });
  });

  it('свободная колонка занимается снова, поздняя встреча не уходит за полночь', () => {
    const s = newState(at(8));
    const day = '2026-10-24';
    addMeeting(s, at(8), { title: 'А', day, at: '09:00', until: '10:00' });
    addMeeting(s, at(8), { title: 'Б', day, at: '09:30', until: '11:00' });
    addMeeting(s, at(8), { title: 'В', day, at: '10:00', until: '10:30' });
    addMeeting(s, at(8), { title: 'Ночь', day, at: '23:30' });
    const slots = timelineOf(agendaOf(s, day));
    expect(slots.map((x) => [x.col, x.cols])).toEqual([[0, 2], [1, 2], [0, 2], [0, 1]]);
    expect(slots[3].end).toBe(24 * 60);
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

describe('серии в файле календаря', () => {
  const flat = (s: State, now = at(9)) => buildIcs(s, now, { morning: null, morningDays: 'work', url: 'https://x/' }).replace(/\r\n /g, '');

  it('каждый вид повтора записан правилом календаря', () => {
    const rule = (repeat: MeetingRepeat, day: string) => {
      const s = newState(at(8));
      addMeeting(s, at(8), { title: 'Серия', day, at: '10:00', repeat });
      return /RRULE:(.*)/.exec(flat(s))![1].trim();
    };
    expect(rule('day', '2026-10-24')).toBe('FREQ=DAILY');
    expect(rule('workday', '2026-10-26')).toBe('FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR');
    expect(rule('week', '2026-10-24')).toBe('FREQ=WEEKLY');
    expect(rule('week2', '2026-10-24')).toBe('FREQ=WEEKLY;INTERVAL=2');
    expect(rule('month', '2026-10-24')).toBe('FREQ=MONTHLY;BYMONTHDAY=24');
    expect(rule('month', '2026-10-31')).toBe('FREQ=MONTHLY;BYMONTHDAY=28,29,30,31;BYSETPOS=-1');
    expect(rule('year', '2026-10-24')).toBe('FREQ=YEARLY;BYMONTH=10;BYMONTHDAY=24');
    expect(rule('year', '2028-02-29')).toBe('FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=28,29;BYSETPOS=-1');
  });

  it('серия начинается со следующего дня, пропуски и конец на месте, закончившаяся не попадает', () => {
    const s = newState(at(8));
    const id = addMeeting(s, at(8), { title: 'Планёрка', day: '2026-10-09', at: '10:00', repeat: 'week', repeatUntil: '2026-11-13' });
    skipMeetingDay(s, id, '2026-10-16');
    skipMeetingDay(s, id, '2026-10-30');
    const allDay = addMeeting(s, at(8), { title: 'Отпуск', day: '2026-10-24', repeat: 'year', repeatUntil: '2030-10-24' });
    skipMeetingDay(s, allDay, '2027-10-24');
    addMeeting(s, at(8), { title: 'Закончилась', day: '2026-10-01', repeat: 'day', repeatUntil: '2026-10-05' });
    const text = flat(s);
    expect(text).toContain('DTSTART:20261023T100000');
    expect(text).toContain('RRULE:FREQ=WEEKLY;UNTIL=20261113T235959');
    expect(text).toContain('EXDATE:20261030T100000');
    expect(text).not.toContain('20261016');
    expect(text).toContain('UNTIL=20301024\r\n');
    expect(text).toContain('EXDATE;VALUE=DATE:20271024');
    expect(text).not.toContain('Закончилась');
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

  it('цвет и повтор с разных устройств не теряются, повтор с концом берётся вместе', () => {
    const { base, local, remote, id } = pair();
    local.touchedAt = at(9);
    updateMeeting(local, id, { title: 'Созвон', day: '2026-10-24', at: '15:00', color: 'green' });
    remote.touchedAt = at(10);
    updateMeeting(remote, id, { title: 'Созвон', day: '2026-10-24', at: '15:00', repeat: 'week', repeatUntil: '2026-12-31' });
    expect(findMeeting(mergeGames(base, local, remote, at(10, 5)), id)).toMatchObject({ color: 'green', repeat: 'week', repeatUntil: '2026-12-31' });
    // Повтор поменяли с обеих сторон: конец не переходит от одного к другому.
    const a = JSON.parse(JSON.stringify(remote)) as State;
    const c = JSON.parse(JSON.stringify(remote)) as State;
    a.touchedAt = at(11);
    updateMeeting(a, id, { title: 'Созвон', day: '2026-10-24', at: '15:00', repeat: 'day' });
    c.touchedAt = at(12);
    updateMeeting(c, id, { title: 'Созвон', day: '2026-10-24', at: '15:00', repeat: 'month', repeatUntil: '2027-06-30' });
    const both = findMeeting(mergeGames(remote, a, c, at(12, 5)), id)!;
    expect(both).toMatchObject({ repeat: 'month', repeatUntil: '2027-06-30' });
    const swapped = findMeeting(mergeGames(remote, c, a, at(12, 5)), id)!;
    expect(swapped).toMatchObject({ repeat: 'month', repeatUntil: '2027-06-30' });
  });

  it('пропуски с двух устройств складываются, возвращённый день не воскресает', () => {
    const { base, id } = pair();
    updateMeeting(base, id, { title: 'Созвон', day: '2026-10-24', at: '15:00', repeat: 'week' });
    skipMeetingDay(base, id, '2026-10-31');
    const local = JSON.parse(JSON.stringify(base)) as State;
    const remote = JSON.parse(JSON.stringify(base)) as State;
    skipMeetingDay(local, id, '2026-11-07');
    skipMeetingDay(remote, id, '2026-11-14');
    unskipMeetingDay(remote, id, '2026-10-31');
    expect(findMeeting(mergeGames(base, local, remote, at(9)), id)!.skip).toEqual(['2026-11-07', '2026-11-14']);
    // Единственный пропуск вернули: пустой список не хранится.
    const only = JSON.parse(JSON.stringify(base)) as State;
    unskipMeetingDay(only, id, '2026-10-31');
    expect(findMeeting(mergeGames(base, base, only, at(9)), id)!.skip).toBeUndefined();
  });

  it('встреча из прошлой версии без новых полей сливается как раньше', () => {
    const { base, local, remote, id } = pair();
    const m = findMeeting(mergeGames(base, local, remote, at(9)), id)!;
    expect(Object.keys(m).sort()).toEqual(['at', 'createdAt', 'day', 'id', 'title']);
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

describe('перенос на шкале дня', () => {
  it('время встаёт на шаг в 15 минут, и дело целиком остаётся в этих сутках', () => {
    expect(dropStart(9 * 60 + 7, 60)).toBe(9 * 60);
    expect(dropStart(9 * 60 + 8, 60)).toBe(9 * 60 + 15);
    expect(dropStart(-40, 30)).toBe(0);
    // Час длиной с 23:30 не влезет: начало встаёт так, чтобы конец был не позже 23:59.
    expect(dropStart(23 * 60 + 30, 60)).toBe(22 * 60 + 45);
    expect(dropStart(23 * 60 + 50, 5)).toBe(23 * 60 + 45);
  });

  it('событие переезжает вместе с концом, «Вернуть» ставит прежнее время', () => {
    const s = newState(at(8));
    const id = addMeeting(s, at(8), { title: 'Стоматолог', day: '2026-10-24', at: '10:00', until: '10:45' });
    const was = moveMeeting(s, id, '14:30')!;
    expect(findMeeting(s, id)).toMatchObject({ at: '14:30', until: '15:15' });
    restoreMeetingTime(s, id, was);
    expect(findMeeting(s, id)).toMatchObject({ at: '10:00', until: '10:45' });
    // Без конца события конца и не появляется, а время берётся только настоящее.
    const free = addMeeting(s, at(8), { title: 'Созвон', day: '2026-10-24', at: '15:00' });
    moveMeeting(s, free, '16:00');
    expect(findMeeting(s, free)!.until).toBeUndefined();
    expect(moveMeeting(s, free, '25:00')).toBeNull();
    expect(findMeeting(s, free)!.at).toBe('16:00');
  });

  it('один день серии переезжает отдельно, остальные дни остаются, «Вернуть» всё возвращает', () => {
    const s = newState(at(8));
    const id = addMeeting(s, at(8), { title: 'Планёрка', day: '2026-10-26', at: '10:00', until: '11:00', place: 'Зал', color: 'green', repeat: 'week' });
    const copy = moveMeetingOnce(s, at(9), id, '2026-11-02', '15:00')!;
    expect(meetingsOn(s, '2026-11-02').map((m) => [m.title, m.at, m.until, m.place, m.color, m.repeat])).toEqual([['Планёрка', '15:00', '16:00', 'Зал', 'green', undefined]]);
    expect(meetingsOn(s, '2026-11-09').map((m) => m.at)).toEqual(['10:00']);
    expect(findMeeting(s, id)!.skip).toEqual(['2026-11-02']);
    // Дня, которого нет в серии, не перенести, и одиночное событие так не переносится.
    expect(moveMeetingOnce(s, at(9), id, '2026-11-03', '15:00')).toBeNull();
    expect(moveMeetingOnce(s, at(9), copy, '2026-11-02', '16:00')).toBeNull();
    undoMoveOnce(s, id, '2026-11-02', copy);
    expect(findMeeting(s, copy)).toBeUndefined();
    expect(findMeeting(s, id)!.skip).toBeUndefined();
    expect(meetingsOn(s, '2026-11-02').map((m) => m.at)).toEqual(['10:00']);
  });

  it('вся серия переезжает на новое время', () => {
    const s = newState(at(8));
    const id = addMeeting(s, at(8), { title: 'Планёрка', day: '2026-10-26', at: '10:00', until: '11:00', repeat: 'workday' });
    moveMeeting(s, id, '09:15');
    expect(meetingsOn(s, '2026-10-28').map((m) => [m.at, m.until])).toEqual([['09:15', '10:15']]);
  });

  it('повторяющаяся задача переезжает на новое время вместе с ждущей задачей', () => {
    const s = newState(at(8));
    const r = addRoutine(s, at(8), { title: 'Зарядка', questId: null, level: 1, estimateMin: 15, at: '07:00', repeat: { every: 'day' } });
    expect(waitingOf(s, r)?.at).toBe('07:00');
    const was = setRoutineAt(s, r, '18:30');
    expect(was).toBe('07:00');
    expect(findRoutine(s, r)!.at).toBe('18:30');
    expect(waitingOf(s, r)!.at).toBe('18:30');
    expect(agendaOf(s, '2026-10-24').find((x) => x.kind === 'routine')?.at).toBe('18:30');
    expect(setRoutineAt(s, 'нет-такой', '10:00')).toBeUndefined();
    expect(findTask(s, waitingOf(s, r)!.id)).toBeDefined();
  });

  it('перенос одного дня серии на телефоне и правка серии на компьютере сливаются', () => {
    const base = newState(at(8));
    const id = addMeeting(base, at(8), { title: 'Планёрка', day: '2026-10-26', at: '10:00', repeat: 'week' });
    const local = JSON.parse(JSON.stringify(base)) as State;
    const remote = JSON.parse(JSON.stringify(base)) as State;
    local.touchedAt = at(9);
    const copy = moveMeetingOnce(local, at(9), id, '2026-11-02', '15:00')!;
    remote.touchedAt = at(10);
    updateMeeting(remote, id, { title: 'Планёрка отдела', day: '2026-10-26', at: '10:00', repeat: 'week' });
    const m = mergeGames(base, local, remote, at(10, 5));
    expect(findMeeting(m, id)).toMatchObject({ title: 'Планёрка отдела', skip: ['2026-11-02'] });
    expect(meetingsOn(m, '2026-11-02').map((x) => [x.id, x.at])).toEqual([[copy, '15:00']]);
  });
});
