import { describe, expect, it } from 'vitest';
import { habitBonusHolder, habitGoal, habitWeek, habitWeeksWon, mainOf, mainRoom, weekOf } from '../src/game/habits';
import { mergeGames } from '../src/game/merge';
import { HABIT_GOAL_GOLD, HABIT_GOAL_XP, MAIN_QUEST_GOLD, MAIN_QUEST_XP, WEEK_MAIN_MAX } from '../src/game/rules';
import {
  addRoutine,
  addTask,
  complete,
  endDay,
  findRoutine,
  findTask,
  newState,
  planTask,
  setMain,
  setPeriod,
  settle,
  undoComplete,
  updateRoutine,
  updateTask,
  waitingOf,
  type RoutineInput,
} from '../src/game/state';
import type { Repeat, State } from '../src/game/types';

// Понедельник, 2 ноября 2026, неделя 2026-W45.
const at = (h: number, m = 0, d = 2) => new Date(2026, 10, d, h, m).getTime();
const clone = (s: State): State => JSON.parse(JSON.stringify(s)) as State;

const habit = (title: string, repeat: Repeat, goal?: number): RoutineInput => ({
  title,
  questId: null,
  level: 1,
  estimateMin: 15,
  at: null,
  repeat,
  habit: goal === undefined ? { goal: 99 } : { goal },
});

/** Прожить дни с from по to: каждое утро сделать привычку, если день есть в списке. */
function liveDays(s: State, r: string, days: number[]) {
  for (const d of days) {
    settle(s, at(8, 0, d));
    const t = waitingOf(s, r);
    if (t && t.day === s.day) complete(s, at(9, 0, d), t.id);
  }
}

describe('привычки', () => {
  it('цель по умолчанию: все дни повтора, но не больше числа дней', () => {
    const s = newState(at(8));
    const daily = addRoutine(s, at(8), habit('Зарядка', { every: 'day' }));
    const weekdays = addRoutine(s, at(8), habit('Почта', { every: 'days', days: [1, 2, 3, 4, 5] }));
    const weekly = addRoutine(s, at(8), habit('Уборка', { every: 'week', weekday: 6 }));
    expect(habitGoal(findRoutine(s, daily)!)).toBe(7);
    expect(habitGoal(findRoutine(s, weekdays)!)).toBe(5);
    expect(habitGoal(findRoutine(s, weekly)!)).toBe(1);
    const low = addRoutine(s, at(8), habit('Чтение', { every: 'day' }, 4));
    expect(findRoutine(s, low)!.habit).toEqual({ goal: 4 });
  });

  it('бонус приходит ровно один раз, когда счёт недели доходит до цели', () => {
    const s = newState(at(8));
    const r = addRoutine(s, at(8), habit('Зарядка', { every: 'day' }, 3));
    const gold0 = s.hero.gold;
    liveDays(s, r, [2, 3]);
    expect(habitBonusHolder(s, r, '2026-W45')).toBeUndefined();
    liveDays(s, r, [4]);
    const holder = habitBonusHolder(s, r, '2026-W45')!;
    expect(holder.doneDay).toBe('2026-11-04');
    expect(holder.reward!.habitBonus).toEqual({ gold: HABIT_GOAL_GOLD, xp: HABIT_GOAL_XP, week: '2026-W45' });
    liveDays(s, r, [5, 6]);
    expect(s.tasks.filter((t) => t.reward?.habitBonus).length).toBe(1);
    expect(habitWeek(s, findRoutine(s, r)!, '2026-W45')).toMatchObject({ done: 5, goal: 3 });
    expect(s.hero.gold - gold0).toBe(5 * 25 + HABIT_GOAL_GOLD);
  });

  it('в понедельник счёт начинается заново, недели с целью складываются', () => {
    const s = newState(at(8));
    const r = addRoutine(s, at(8), habit('Зарядка', { every: 'day' }, 2));
    liveDays(s, r, [2, 3, 9]);
    const rr = findRoutine(s, r)!;
    expect(habitWeek(s, rr, '2026-W46')).toMatchObject({ done: 1, days: ['2026-11-09'] });
    expect(habitWeeksWon(s, rr)).toBe(1);
    liveDays(s, r, [10]);
    expect(habitWeeksWon(s, rr)).toBe(2);
    expect(habitBonusHolder(s, r, '2026-W46')!.doneDay).toBe('2026-11-10');
  });

  it('дело после полуночи в воскресенье идёт в старую неделю', () => {
    const s = newState(at(8, 0, 8));
    const r = addRoutine(s, at(8, 0, 8), habit('Зарядка', { every: 'day' }, 1));
    settle(s, at(1, 0, 9));
    complete(s, at(1, 0, 9), waitingOf(s, r)!.id);
    expect(weekOf(s.day)).toBe('2026-W45');
    expect(habitBonusHolder(s, r, '2026-W45')).toBeDefined();
  });

  it('«Вернуть» забирает бонус, и он приходит снова, когда цель снова достигнута', () => {
    const s = newState(at(8));
    const r = addRoutine(s, at(8), habit('Зарядка', { every: 'day' }, 2));
    liveDays(s, r, [2, 3]);
    const holder = habitBonusHolder(s, r, '2026-W45')!;
    const gold = s.hero.gold;
    undoComplete(s, holder.id);
    expect(s.hero.gold).toBe(gold - 25 - HABIT_GOAL_GOLD);
    expect(habitBonusHolder(s, r, '2026-W45')).toBeUndefined();
    complete(s, at(10, 0, 3), holder.id);
    expect(habitBonusHolder(s, r, '2026-W45')!.id).toBe(holder.id);
    expect(s.hero.gold).toBe(gold);
  });

  it('«Вернуть» более раннего дня тоже снимает бонус, если счёт упал ниже цели', () => {
    const s = newState(at(8));
    const r = addRoutine(s, at(8), habit('Зарядка', { every: 'day' }, 2));
    liveDays(s, r, [2, 3]);
    const first = s.tasks.find((t) => t.routineId === r && t.doneDay === '2026-11-02')!;
    const gold = s.hero.gold;
    undoComplete(s, first.id);
    expect(habitBonusHolder(s, r, '2026-W45')).toBeUndefined();
    expect(s.hero.gold).toBe(gold - 25 - HABIT_GOAL_GOLD);
    expect(s.log['2026-11-03'].gold).toBe(25);
  });

  it('у привычки нет долга: вчерашняя несделанная уходит, приходит сегодняшняя', () => {
    const s = newState(at(8));
    const r = addRoutine(s, at(8), habit('Зарядка', { every: 'day' }));
    const monday = waitingOf(s, r)!;
    endDay(s, at(23), []);
    settle(s, at(8, 0, 3));
    const today = waitingOf(s, r)!;
    expect(today.id).toBe(`${r}@2026-11-03`);
    expect(findTask(s, monday.id)).toBeUndefined();
    expect(s.tasks.filter((t) => t.routineId === r).length).toBe(1);
  });

  it('и в день без повтора вчерашняя не висит в отряде', () => {
    const s = newState(at(8));
    const r = addRoutine(s, at(8), habit('Бег', { every: 'days', days: [1, 3] }));
    expect(waitingOf(s, r)!.day).toBe('2026-11-02');
    settle(s, at(8, 0, 3));
    expect(waitingOf(s, r)).toBeUndefined();
  });

  it('обычная повторяющаяся по-прежнему ждёт, пока её не сделают', () => {
    const s = newState(at(8));
    const r = addRoutine(s, at(8), { ...habit('Почта', { every: 'day' }), habit: null });
    const monday = waitingOf(s, r)!;
    settle(s, at(8, 0, 3));
    expect(waitingOf(s, r)!.id).toBe(monday.id);
  });

  it('правка дней повтора подрезает цель под новое число дней', () => {
    const s = newState(at(8));
    const r = addRoutine(s, at(8), habit('Зарядка', { every: 'day' }, 6));
    updateRoutine(s, r, { ...habit('Зарядка', { every: 'days', days: [1, 3, 5] }), habit: undefined });
    expect(findRoutine(s, r)!.habit).toEqual({ goal: 3 });
    updateRoutine(s, r, { ...habit('Зарядка', { every: 'days', days: [1, 3, 5] }), habit: null });
    expect(findRoutine(s, r)!.habit).toBeUndefined();
  });

  it('два устройства без связи дали бонус за одну неделю: после слияния остаётся ранний', () => {
    const s = newState(at(8));
    const r = addRoutine(s, at(8), habit('Зарядка', { every: 'day' }, 2));
    liveDays(s, r, [2]);
    const base = clone(s);
    const phone = clone(s);
    const laptop = clone(s);
    liveDays(phone, r, [3]);
    phone.touchedAt = at(9, 0, 3);
    settle(laptop, at(8, 0, 4));
    // Ноутбук не видел вторника: у него свой второй день, среда.
    const lt = waitingOf(laptop, r)!;
    complete(laptop, at(9, 0, 4), lt.id);
    laptop.touchedAt = at(9, 0, 4);
    const m = mergeGames(base, phone, laptop, at(10, 0, 4));
    const holders = m.tasks.filter((t) => t.reward?.habitBonus);
    expect(holders.map((t) => t.doneDay)).toEqual(['2026-11-03']);
    expect(m.hero.gold).toBe(25 * 3 + HABIT_GOAL_GOLD);
  });
});

describe('главные задачи недели', () => {
  const week = '2026-W45';

  it('не больше трёх на неделю, сделанные тоже считаются', () => {
    const s = newState(at(8));
    const ids = [1, 2, 3, 4].map((n) => addTask(s, at(8), { title: `Дело ${n}`, questId: null, period: week }));
    expect(ids.slice(0, 3).map((id) => setMain(s, id, week))).toEqual([true, true, true]);
    expect(setMain(s, ids[3], week)).toBe(false);
    expect(mainRoom(s, week)).toBe(0);
    planTask(s, ids[0], s.day);
    complete(s, at(10), ids[0]);
    expect(mainOf(s, week).length).toBe(WEEK_MAIN_MAX);
    expect(setMain(s, ids[3], week)).toBe(false);
    expect(setMain(s, ids[1], null)).toBe(true);
    expect(setMain(s, ids[3], week)).toBe(true);
  });

  it('задача дня этой недели тоже может стать главной, повторяющаяся и чужая неделя нет', () => {
    const s = newState(at(8));
    const today = addTask(s, at(8), { title: 'Сегодня', questId: null, day: s.day });
    const next = addTask(s, at(8), { title: 'Потом', questId: null, period: '2026-W46' });
    const r = addRoutine(s, at(8), habit('Зарядка', { every: 'day' }));
    expect(setMain(s, today, week)).toBe(true);
    expect(setMain(s, next, week)).toBe(false);
    expect(setMain(s, waitingOf(s, r)!.id, week)).toBe(false);
  });

  it('«Готово» в свою неделю даёт бонус, «Вернуть» его забирает', () => {
    const s = newState(at(8));
    const id = addTask(s, at(8), { title: 'Запустить оплату', questId: null, period: week, win: '  страница оплаты видна  ' });
    expect(findTask(s, id)!.win).toBe('страница оплаты видна');
    setMain(s, id, week);
    planTask(s, id, s.day);
    const gold = s.hero.gold;
    const res = complete(s, at(10), id)!;
    expect(res.reward.mainGold).toBe(MAIN_QUEST_GOLD);
    expect(res.reward.mainXp).toBe(MAIN_QUEST_XP);
    expect(s.hero.gold).toBe(gold + 25 + MAIN_QUEST_GOLD);
    undoComplete(s, id);
    expect(s.hero.gold).toBe(gold);
  });

  it('сделанная в другую неделю бонуса не даёт', () => {
    const s = newState(at(8));
    const id = addTask(s, at(8), { title: 'Отчёт', questId: null, period: week });
    setMain(s, id, week);
    settle(s, at(8, 0, 9));
    planTask(s, id, s.day);
    // Задача осталась хвостом прошлой недели, позвали её в понедельник.
    const res = complete(s, at(10, 0, 9), id)!;
    expect(res.reward.mainGold).toBeUndefined();
  });

  it('перенос в другую неделю снимает звезду, в пределах недели нет', () => {
    const s = newState(at(8));
    const id = addTask(s, at(8), { title: 'Отчёт', questId: null, period: week });
    setMain(s, id, week);
    planTask(s, id, '2026-11-05');
    expect(findTask(s, id)!.main).toBe(week);
    setPeriod(s, id, '2026-W46');
    expect(findTask(s, id)!.main).toBeUndefined();
    const day = addTask(s, at(8), { title: 'Звонок', questId: null, day: s.day });
    setMain(s, day, week);
    planTask(s, day, '2026-11-10');
    expect(findTask(s, day)!.main).toBeUndefined();
  });

  it('пустое условие победы не сохраняется, правка меняет его', () => {
    const s = newState(at(8));
    const id = addTask(s, at(8), { title: 'Отчёт', questId: null, period: week, win: '   ' });
    expect('win' in findTask(s, id)!).toBe(false);
    updateTask(s, id, { win: 'отправлен' });
    expect(findTask(s, id)!.win).toBe('отправлен');
    updateTask(s, id, { win: null });
    expect('win' in findTask(s, id)!).toBe(false);
  });

  it('после слияния лишние звёзды не снимаются молча, но новую поставить нельзя', () => {
    const s = newState(at(8));
    const ids = [1, 2, 3, 4].map((n) => addTask(s, at(8), { title: `Дело ${n}`, questId: null, period: week }));
    setMain(s, ids[0], week);
    setMain(s, ids[1], week);
    const base = clone(s);
    const phone = clone(s);
    const laptop = clone(s);
    setMain(phone, ids[2], week);
    phone.touchedAt = at(9);
    setMain(laptop, ids[3], week);
    laptop.touchedAt = at(10);
    const m = mergeGames(base, phone, laptop, at(11));
    expect(mainOf(m, week).length).toBe(4);
    const extra = addTask(m, at(11), { title: 'Ещё', questId: null, period: week });
    expect(setMain(m, extra, week)).toBe(false);
  });
});
