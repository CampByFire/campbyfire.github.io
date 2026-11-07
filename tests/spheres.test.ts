import { describe, expect, it } from 'vitest';
import { mergeGames } from '../src/game/merge';
import {
  DEFAULT_SPHERES,
  addQuest,
  addRoutine,
  addTask,
  complete,
  findTask,
  kindOf,
  lastRating,
  newState,
  pickableQuests,
  projectsOf,
  rateSpheres,
  ratingDue,
  removeQuest,
  reopenQuest,
  settle,
  sphereOf,
  spheresOf,
  start,
  updateQuest,
  winQuest,
} from '../src/game/state';
import { SAVE_VERSION, checkSave } from '../src/game/store';
import { campView } from '../src/game/view';
import type { State } from '../src/game/types';

const at = (h: number, m = 0, d = 23) => new Date(2026, 9, d, h, m).getTime();
const copy = (s: unknown) => JSON.parse(JSON.stringify(s)) as State;

/** Сохранение формата 2, как его писала 0.7.0: три похода по умолчанию, свой поход и выигранный. */
function oldSave(): Record<string, unknown> {
  const quest = (id: string, name: string, kind: string, color: string, extra = {}) => ({ id, name, kind, color, createdAt: at(8), ...extra });
  return {
    v: 2,
    gameId: 'abc',
    createdAt: at(8),
    touchedAt: at(9),
    day: '2026-10-23',
    hero: { xp: 0, gold: 0, mana: 100 },
    quests: [
      quest('q1', 'Работа', 'work', 'blue'),
      quest('q2', 'Личное', 'personal', 'green'),
      quest('q3', 'Дом и быт', 'any', 'brown'),
      quest('q4', 'Сертификат', 'work', '#2bb3a3'),
      quest('q5', 'Марафон', 'personal', 'red'),
      quest('q6', 'Переезд', 'any', 'yellow'),
      quest('q7', 'Старый отчёт', 'work', 'purple', { wonAt: at(9, 0, 1) }),
    ],
    tasks: [
      { id: 't1', title: 'Отчёт', questId: 'q1', level: 1, estimateMin: null, status: 'open', day: null, order: 0, due: null, at: null, spentMs: 0, createdAt: at(8) },
      { id: 't2', title: 'Модуль', questId: 'q4', level: 2, estimateMin: null, status: 'open', day: null, order: 0, due: null, at: null, spentMs: 0, createdAt: at(8) },
    ],
    routines: [],
    current: null,
    breakSince: null,
    lastQuestId: null,
    litDay: null,
    closedDay: null,
    secondWindDay: null,
    settledAt: at(9),
    log: {},
    settings: { workStart: 540, workEnd: 1080, workDays: [1, 2, 3, 4, 5], bedtime: 1380 },
    seq: 7,
  };
}

describe('сферы новой игры', () => {
  it('новая игра начинается с колеса баланса из восьми сфер', () => {
    const s = checkSave(copy(newGame()))!;
    expect(spheresOf(s).map((q) => q.name)).toEqual(DEFAULT_SPHERES.map((d) => d.name));
    expect(s.quests.every((q) => q.sphere)).toBe(true);
    expect(s.settings.rateEvery).toBe('month');
    expect(s.ratings).toEqual([]);
  });

  it('проект в сфере живёт по её типу, а без сферы по своему', () => {
    const s = newGame();
    const [work, health] = spheresOf(s);
    const cert = addQuest(s, at(8), { name: 'Сертификат', kind: 'personal', color: 'blue', sphereId: work.id });
    const solo = addQuest(s, at(8), { name: 'Переезд', kind: 'personal', color: 'red', sphereId: null });
    expect(kindOf(s, cert)).toBe('work');
    expect(kindOf(s, solo)).toBe('personal');
    expect(kindOf(s, null)).toBe('any');
    expect(sphereOf(s, cert)?.id).toBe(work.id);
    // Сфера сменила тип: проект следом.
    updateQuest(s, work.id, { kind: 'any' });
    expect(kindOf(s, cert)).toBe('any');
    // Проект переехал в другую сферу.
    updateQuest(s, cert, { sphereId: health.id });
    expect(kindOf(s, cert)).toBe('personal');
    expect(projectsOf(s, health.id).map((q) => q.id)).toEqual([cert]);
  });

  it('новая сфера встаёт после сфер, а в выборе каждая сфера идёт со своими проектами', () => {
    const s = newGame();
    const work = spheresOf(s)[0].id;
    const cert = addQuest(s, at(8), { name: 'Сертификат', kind: 'work', color: 'blue', sphereId: work });
    const art = addQuest(s, at(8), { name: 'Творчество', kind: 'personal', color: 'red', sphere: true });
    expect(spheresOf(s).at(-1)?.id).toBe(art);
    const order = pickableQuests(s).map((q) => q.name);
    expect(order.slice(0, 3)).toEqual(['Работа', 'Сертификат', 'Здоровье']);
    expect(order.at(-1)).toBe('Творчество');
    winQuest(s, at(9), cert);
    expect(pickableQuests(s).some((q) => q.id === cert)).toBe(false);
    expect(pickableQuests(s, cert).some((q) => q.id === cert)).toBe(true);
  });
});

describe('проекты', () => {
  it('проект завершается, когда игрок решит, даже с открытыми задачами: они уходят в сферу', () => {
    const s = newGame();
    const work = spheresOf(s)[0].id;
    const p = addQuest(s, at(8), { name: 'Сертификат', kind: 'work', color: 'blue', sphereId: work });
    const a = addTask(s, at(8), { title: 'A', questId: p, level: 2, day: s.day });
    const b = addTask(s, at(8), { title: 'B', questId: p, level: 1 });
    const r = addRoutine(s, at(8), { title: 'Почта', questId: p, level: 1, estimateMin: 15, at: null, repeat: { every: 'day' } });
    expect(complete(s, at(9), a)!.lair).toEqual({ before: 3, after: 1, max: 3 });
    expect(winQuest(s, at(10), p)).toBe(true);
    expect(winQuest(s, at(10), p)).toBe(false);
    expect(findTask(s, a)!.questId).toBe(p);
    expect(findTask(s, b)!.questId).toBe(work);
    expect(findTask(s, b)!.status).toBe('open');
    expect(s.routines.find((x) => x.id === r)!.questId).toBe(work);
    reopenQuest(s, p);
    expect(s.quests.find((q) => q.id === p)!.wonAt).toBeUndefined();
  });

  it('проект без сферы при завершении отдаёт открытые задачи вестнику', () => {
    const s = newGame();
    const p = addQuest(s, at(8), { name: 'Переезд', kind: 'any', color: 'red', sphereId: null });
    const a = addTask(s, at(8), { title: 'Коробки', questId: p });
    winQuest(s, at(9), p);
    expect(findTask(s, a)).toMatchObject({ questId: null, status: 'inbox' });
  });

  it('сферу нельзя завершить', () => {
    const s = newGame();
    expect(winQuest(s, at(9), spheresOf(s)[0].id)).toBe(false);
  });

  it('убранный проект отдаёт задачи сфере, убранная сфера отпускает проекты и шлёт задачи письмами', () => {
    const s = newGame();
    const work = spheresOf(s)[0].id;
    const p = addQuest(s, at(8), { name: 'Сертификат', kind: 'work', color: 'blue', sphereId: work });
    const inP = addTask(s, at(8), { title: 'Модуль', questId: p });
    removeQuest(s, p);
    expect(findTask(s, inP)).toMatchObject({ questId: work, status: 'open' });

    const p2 = addQuest(s, at(8), { name: 'Отчётность', kind: 'work', color: 'blue', sphereId: work });
    removeQuest(s, work);
    expect(findTask(s, inP)).toMatchObject({ questId: null, status: 'inbox' });
    const left = s.quests.find((q) => q.id === p2)!;
    expect(left.sphereId).toBeNull();
    expect(kindOf(s, p2)).toBe('work');
  });

  it('смена дела внутри сферы бесплатна, переход в другую сферу стоит маны', () => {
    const s = newGame();
    const [work, health] = spheresOf(s).map((q) => q.id);
    const p = addQuest(s, at(8), { name: 'Сертификат', kind: 'work', color: 'blue', sphereId: work });
    const a = addTask(s, at(8), { title: 'A', questId: work, day: s.day });
    const b = addTask(s, at(8), { title: 'B', questId: p, day: s.day });
    const c = addTask(s, at(8), { title: 'C', questId: health, day: s.day });
    expect(start(s, at(9), a).switchCost).toBe(0);
    expect(start(s, at(9, 10), b).switchCost).toBe(0);
    expect(start(s, at(9, 20), c).switchCost).toBe(5);
  });

  it('днём в будни рабочая сфера и её проекты в полной силе, личная ждёт вечера', () => {
    const s = newGame();
    const [work, health] = spheresOf(s).map((q) => q.id);
    const p = addQuest(s, at(8), { name: 'Сертификат', kind: 'personal', color: 'blue', sphereId: work });
    const a = addTask(s, at(8), { title: 'Модуль', questId: p, day: s.day });
    const b = addTask(s, at(8), { title: 'Зарядка', questId: health, day: s.day });
    settle(s, at(11));
    const v = campView(s, at(11));
    expect(v.tones.get(a)).toBe('today');
    expect(v.tones.get(b)).toBe('evening');
  });
});

describe('переход старого сохранения к сферам', () => {
  it('бесконечные походы становятся сферами на месте, остальные проектами', () => {
    const s = checkSave(oldSave())!;
    expect(s.v).toBe(SAVE_VERSION);
    const byName = (n: string) => s.quests.find((q) => q.name === n)!;
    for (const n of ['Работа', 'Личное', 'Дом и быт']) expect(byName(n).sphere).toBe(true);
    expect(byName('Работа').id).toBe('q1');
    // Недостающие сферы колеса добавлены, «Работа» и «Дом и быт» не задвоились.
    const names = spheresOf(s).map((q) => q.name);
    for (const d of DEFAULT_SPHERES) expect(names.filter((n) => n === d.name)).toHaveLength(1);
    expect(names).toContain('Личное');
    // Рабочий поход в «Работе», личный в «Личном», «в любое время» сам по себе.
    expect(byName('Сертификат')).toMatchObject({ sphereId: 'q1' });
    expect(byName('Марафон')).toMatchObject({ sphereId: 'q2' });
    expect(byName('Переезд')).toMatchObject({ sphereId: null });
    expect(kindOf(s, 'q6')).toBe('any');
    // Выигранный поход остаётся в зале трофеев проектом.
    expect(byName('Старый отчёт')).toMatchObject({ sphereId: 'q1', wonAt: at(9, 0, 1) });
    expect(byName('Старый отчёт').sphere).toBeUndefined();
    // Задачи на месте.
    expect(s.tasks.map((t) => t.questId)).toEqual(['q1', 'q4']);
    // Сначала сферы, потом проекты.
    const firstProject = s.quests.findIndex((q) => !q.sphere);
    expect(s.quests.slice(firstProject).every((q) => !q.sphere)).toBe(true);
    expect(s.settings.rateEvery).toBe('month');
    expect(s.ratings).toEqual([]);
  });

  it('два устройства переходят одинаково, и слияние не задваивает сферы', () => {
    const a = checkSave(oldSave())!;
    const b = checkSave(oldSave())!;
    expect(a).toEqual(b);
    const base = checkSave(oldSave())!;
    addTask(a, at(10), { title: 'С телефона', questId: 'sphere-health' });
    a.touchedAt = at(10);
    addTask(b, at(11), { title: 'С компьютера', questId: 'sphere-health' });
    b.touchedAt = at(11);
    const m = mergeGames(base, a, b, at(12));
    expect(spheresOf(m)).toHaveLength(spheresOf(base).length);
    expect(m.tasks.filter((t) => t.questId === 'sphere-health').map((t) => t.title).sort()).toEqual(['С компьютера', 'С телефона']);
  });
});

describe('оценка сфер', () => {
  it('баллы от 1 до 10, чужие id отбрасываются, вторая оценка за день заменяет первую', () => {
    const s = newGame();
    const [work, health] = spheresOf(s).map((q) => q.id);
    rateSpheres(s, at(9), { [work]: 7, [health]: 14, nope: 3 });
    expect(s.ratings).toEqual([{ id: '2026-10-23', at: at(9), scores: { [work]: 7, [health]: 10 } }]);
    rateSpheres(s, at(10), { [work]: 0.4 });
    expect(s.ratings).toHaveLength(1);
    expect(lastRating(s)!.scores).toEqual({ [work]: 1 });
    rateSpheres(s, at(10), { nope: 5 });
    expect(lastRating(s)!.scores).toEqual({ [work]: 1 });
  });

  it('прошлая оценка ищется по дню', () => {
    const s = newGame();
    const work = spheresOf(s)[0].id;
    rateSpheres(s, at(9), { [work]: 4 });
    settle(s, at(9, 0, 30));
    rateSpheres(s, at(9, 0, 30), { [work]: 6 });
    expect(lastRating(s)!.scores[work]).toBe(6);
    expect(lastRating(s, lastRating(s)!.id)!.scores[work]).toBe(4);
  });

  it('напоминание: в новой игре через три дня, потом по настройке, по умолчанию раз в месяц', () => {
    const s = newGame();
    expect(ratingDue(s)).toBe(false);
    settle(s, at(9, 0, 26));
    expect(ratingDue(s)).toBe(true);
    rateSpheres(s, at(9, 0, 26), { [spheresOf(s)[0].id]: 5 });
    expect(ratingDue(s)).toBe(false);
    settle(s, new Date(2026, 10, 2, 9).getTime());
    s.settings.rateEvery = 'week';
    expect(ratingDue(s)).toBe(true);
    s.settings.rateEvery = 'month';
    expect(ratingDue(s)).toBe(false);
    settle(s, new Date(2026, 10, 25, 9).getTime());
    expect(ratingDue(s)).toBe(true);
    s.settings.rateEvery = 'never';
    expect(ratingDue(s)).toBe(false);
  });
});

function newGame(): State {
  // Через checkSave: новая игра сразу в нынешнем формате.
  return checkSave(copy(newState(at(8))))!;
}
