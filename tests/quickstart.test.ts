// Короткий утренний сбор: сразу к огню, быстрый сбор вчерашних дел, опыт за план не больше чем за 5 задач.
import { describe, expect, it } from 'vitest';
import { addTask, complete, endDay, findTask, leftoversOf, lightFire, newState, planTask, quickGather, settle } from '../src/game/state';
import { mergeGames } from '../src/game/merge';
import type { State } from '../src/game/types';

// Пятница, 23 октября 2026.
const at = (h: number, m = 0, d = 23) => new Date(2026, 9, d, h, m).getTime();

describe('утренний сбор по желанию', () => {
  it('опыт за план не больше чем за 5 задач', () => {
    const s = newState(at(8));
    for (let i = 0; i < 8; i++) addTask(s, at(8), { title: `З${i}`, questId: s.quests[0].id, day: s.day });
    expect(lightFire(s, at(9))).toBe(15);
  });

  it('быстрый сбор возвращает то, что вчерашний отбой отправил в отряд, и разжигает костёр', () => {
    const s = newState(at(8, 0, 22));
    const q = s.quests[0].id;
    const a = addTask(s, at(8, 0, 22), { title: 'A', questId: q, day: s.day });
    const b = addTask(s, at(8, 0, 22), { title: 'B', questId: q, day: s.day });
    const c = addTask(s, at(8, 0, 22), { title: 'C', questId: q, day: s.day });
    const old = addTask(s, at(8, 0, 22), { title: 'Давнее', questId: q });
    complete(s, at(10, 0, 22), c);
    endDay(s, at(23, 0, 22), [b]);
    expect(findTask(s, a)!.leftDay).toBe('2026-10-22');
    settle(s, at(8, 0, 23));
    expect(leftoversOf(s).map((t) => t.id)).toEqual([a]);
    const r = quickGather(s, at(8, 0, 23));
    expect(r.added).toBe(1);
    expect(r.xp).toBe(6);
    expect(s.litDay).toBe(s.day);
    expect(findTask(s, a)!.day).toBe(s.day);
    expect(findTask(s, a)!.leftDay).toBeUndefined();
    expect(findTask(s, b)!.day).toBe(s.day);
    expect(findTask(s, old)!.day).toBeNull();
    expect(leftoversOf(s)).toEqual([]);
  });

  it('вчерашние дела только с последнего отбоя, позванное руками больше не вчерашнее', () => {
    const s = newState(at(8, 0, 21));
    const q = s.quests[0].id;
    const a = addTask(s, at(8, 0, 21), { title: 'A', questId: q, day: s.day });
    endDay(s, at(23, 0, 21), []);
    settle(s, at(8, 0, 22));
    const b = addTask(s, at(8, 0, 22), { title: 'B', questId: q, day: s.day });
    const c = addTask(s, at(8, 0, 22), { title: 'C', questId: q, day: s.day });
    endDay(s, at(23, 0, 22), []);
    settle(s, at(8, 0, 23));
    expect(leftoversOf(s).map((t) => t.id)).toEqual([b, c]);
    planTask(s, b, s.day);
    expect(leftoversOf(s).map((t) => t.id)).toEqual([c]);
    expect(findTask(s, a)!.leftDay).toBe('2026-10-21');
  });

  it('вчерашняя задача и её день сливаются вместе', () => {
    const base = newState(at(8, 0, 22));
    const id = addTask(base, at(8, 0, 22), { title: 'A', questId: base.quests[0].id, day: base.day });
    endDay(base, at(23, 0, 22), []);
    base.touchedAt = at(23, 0, 22);
    const copy = () => JSON.parse(JSON.stringify(base)) as State;
    const local = copy();
    const remote = copy();
    local.touchedAt = at(9, 0, 23);
    planTask(local, id, '2026-10-23');
    remote.touchedAt = at(8, 0, 23);
    const m = mergeGames(base, local, remote, at(9, 5, 23));
    expect(findTask(m, id)!.day).toBe('2026-10-23');
    expect(findTask(m, id)!.leftDay).toBeUndefined();
  });
});
