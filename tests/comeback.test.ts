// Спокойная нежить, награда за старт и возвращение после перерыва.
import { describe, expect, it } from 'vitest';
import {
  addTask,
  amnesty,
  complete,
  findTask,
  newState,
  pause,
  postpone,
  release,
  restedLeft,
  restoreDues,
  resume,
  settle,
  start,
  undeadOf,
  undoComplete,
  unrelease,
} from '../src/game/state';
import { mergeGames } from '../src/game/merge';
import { campView } from '../src/game/view';
import type { State } from '../src/game/types';

// Пятница, 23 октября 2026.
const at = (h: number, m = 0, d = 23) => new Date(2026, 9, d, h, m).getTime();

function fresh(now = at(8)) {
  const s = newState(now);
  return { s, work: s.quests[0].id };
}

describe('спокойная нежить', () => {
  it('за упокоенную нежить опыта больше: свежая +50%, старая вдвое', () => {
    const { s, work } = fresh();
    const fresh1 = addTask(s, at(8), { title: 'Вчера', questId: work, level: 2, due: '2026-10-22' });
    const old = addTask(s, at(8), { title: 'Давно', questId: work, level: 2, due: '2026-10-10' });
    const a = complete(s, at(9), fresh1)!;
    expect(a.reward.xp).toBe(60);
    expect(a.reward.undeadXp).toBe(20);
    const b = complete(s, at(10), old)!;
    expect(b.reward.xp).toBe(80);
    expect(b.reward.gold).toBe(50);
    undoComplete(s, old);
    expect(s.hero.xp).toBe(60);
  });

  it('перенести срок нежити: она уходит с дороги, за решение +5 опыта', () => {
    const { s, work } = fresh();
    const id = addTask(s, at(8), { title: 'Просрочка', questId: work, due: '2026-10-20' });
    expect(postpone(s, at(9), id, '2026-10-30')).toBe(5);
    expect(findTask(s, id)!.due).toBe('2026-10-30');
    expect(undeadOf(s)).toHaveLength(0);
    expect(s.hero.xp).toBe(5);
    expect(s.log[s.day].xp).toBe(5);
    // Обычной задаче перенос срока опыта не даёт.
    expect(postpone(s, at(9), id, null)).toBe(0);
    expect(s.hero.xp).toBe(5);
  });

  it('отпустить нежить даёт +5 опыта, «Вернуть» их забирает', () => {
    const { s, work } = fresh();
    const id = addTask(s, at(8), { title: 'Просрочка', questId: work, due: '2026-10-20' });
    const plain = addTask(s, at(8), { title: 'Обычная', questId: work });
    expect(release(s, at(9), id)).toBe(5);
    expect(release(s, at(9), plain)).toBe(0);
    expect(s.hero.xp).toBe(5);
    unrelease(s, id);
    expect(s.hero.xp).toBe(0);
    expect(s.log[s.day].xp).toBe(0);
    expect(findTask(s, id)!.releasedXp).toBeUndefined();
    // Отпустить ещё раз можно, но опыт не копится сверх одного раза.
    release(s, at(10), id);
    expect(s.hero.xp).toBe(5);
  });

  it('лишняя нежить уходит в туман без счёта', () => {
    const { s, work } = fresh();
    for (let i = 0; i < 5; i++) addTask(s, at(8), { title: `Н${i}`, questId: work, due: '2026-10-20' });
    const v = campView(s, at(9));
    expect(v.road).toHaveLength(3);
    expect(v.extraRoad).toBe(2);
    expect(new Set(v.road.map((r) => r.rank))).toEqual(new Set(['minion']));
  });
});

describe('награда за старт', () => {
  it('две минуты у огня подряд зажигают искру: +5 опыта раз в день', () => {
    const { s, work } = fresh();
    const id = addTask(s, at(8), { title: 'A', questId: work, day: s.day });
    start(s, at(9), id);
    settle(s, at(9, 1));
    expect(s.hero.xp).toBe(0);
    settle(s, at(9, 2));
    expect(findTask(s, id)!.sparkDay).toBe(s.day);
    expect(s.hero.xp).toBe(5);
    // Пауза и новый старт в тот же день второй искры не дают.
    pause(s, at(9, 3));
    resume(s, at(9, 10));
    settle(s, at(9, 13));
    expect(s.hero.xp).toBe(5);
  });

  it('искра не зажигается от коротких рывков', () => {
    const { s, work } = fresh();
    const id = addTask(s, at(8), { title: 'A', questId: work, day: s.day });
    start(s, at(9), id);
    pause(s, at(9, 1));
    resume(s, at(9, 5));
    pause(s, at(9, 6));
    expect(findTask(s, id)!.sparkDay).toBeUndefined();
    expect(s.hero.xp).toBe(0);
  });

  it('каждые 15 минут работы приносят уголёк: +2 опыта', () => {
    const { s, work } = fresh();
    const id = addTask(s, at(8), { title: 'A', questId: work, day: s.day });
    start(s, at(9), id);
    settle(s, at(9, 14));
    expect(s.hero.xp).toBe(5);
    settle(s, at(9, 15));
    expect(s.hero.xp).toBe(7);
    settle(s, at(9, 46));
    expect(s.hero.xp).toBe(11);
    expect(s.log[s.day].xp).toBe(11);
  });

  it('искра и угольки с двух устройств не удваиваются', () => {
    const { s, work } = fresh();
    const id = addTask(s, at(8), { title: 'A', questId: work, day: s.day });
    start(s, at(9), id);
    s.touchedAt = at(9);
    const copy = () => JSON.parse(JSON.stringify(s)) as State;
    const local = copy();
    const remote = copy();
    settle(local, at(9, 20));
    const m = mergeGames(s, local, remote, at(9, 20));
    expect(m.hero.xp).toBe(5 + 2);
    expect(findTask(m, id)!.sparkDay).toBe(m.day);
  });
});

describe('возвращение после перерыва', () => {
  it('после двух дней без действий герой отдохнул: первые 3 дела вдвое по опыту', () => {
    const { s, work } = fresh(at(8, 0, 1));
    s.touchedAt = at(20, 0, 21);
    settle(s, at(9, 0, 23));
    expect(s.rested).toEqual({ day: '2026-10-23', left: 3 });
    const ids = [1, 2, 3, 4].map((i) => addTask(s, at(9, 0, 23), { title: `Д${i}`, questId: work, level: 1, day: s.day }));
    expect(complete(s, at(10, 0, 23), ids[0])!.reward.xp).toBe(50);
    complete(s, at(10, 1, 23), ids[1]);
    complete(s, at(10, 2, 23), ids[2]);
    expect(restedLeft(s)).toBe(0);
    const last = complete(s, at(10, 3, 23), ids[3])!;
    expect(last.reward.xp).toBe(25);
    expect(last.reward.restedXp).toBeUndefined();
    // Отмена дела с бонусом возвращает бонус.
    undoComplete(s, ids[2]);
    expect(restedLeft(s)).toBe(1);
  });

  it('бонус не растёт с длиной перерыва и уходит на следующий день', () => {
    const { s } = fresh(at(8, 0, 1));
    s.touchedAt = at(20, 0, 1);
    settle(s, at(9, 0, 23));
    expect(s.rested?.left).toBe(3);
    s.touchedAt = at(9, 30, 23);
    settle(s, at(9, 0, 24));
    expect(s.rested).toBeUndefined();
    expect(restedLeft(s)).toBe(0);
  });

  it('вчерашний вечер не перерыв', () => {
    const { s } = fresh(at(8, 0, 1));
    s.touchedAt = at(23, 0, 22);
    settle(s, at(9, 0, 23));
    expect(s.rested).toBeUndefined();
    const n = newState(at(8));
    settle(n, at(9, 0, 30));
    expect(n.rested).toBeUndefined();
  });

  it('покой нежити разом снимает сроки, «Вернуть» их возвращает', () => {
    const { s, work } = fresh();
    const a = addTask(s, at(8), { title: 'A', questId: work, due: '2026-10-20' });
    const b = addTask(s, at(8), { title: 'B', questId: work, due: '2026-10-01' });
    const c = addTask(s, at(8), { title: 'C', questId: work, due: '2026-10-30' });
    const was = amnesty(s, at(9));
    expect(was).toHaveLength(2);
    expect(undeadOf(s)).toHaveLength(0);
    expect(findTask(s, c)!.due).toBe('2026-10-30');
    expect(findTask(s, a)!.status).toBe('open');
    restoreDues(s, was);
    expect(findTask(s, a)!.due).toBe('2026-10-20');
    expect(findTask(s, b)!.due).toBe('2026-10-01');
  });

  it('бонус с двух устройств сливается по меньшему остатку', () => {
    const { s, work } = fresh(at(8, 0, 1));
    s.touchedAt = at(20, 0, 20);
    settle(s, at(9, 0, 23));
    const a = addTask(s, at(9, 0, 23), { title: 'A', questId: work, day: s.day });
    const b = addTask(s, at(9, 0, 23), { title: 'B', questId: work, day: s.day });
    s.touchedAt = at(9, 0, 23);
    const copy = () => JSON.parse(JSON.stringify(s)) as State;
    const local = copy();
    const remote = copy();
    local.touchedAt = at(10, 0, 23);
    complete(local, at(10, 0, 23), a);
    remote.touchedAt = at(10, 5, 23);
    complete(remote, at(10, 5, 23), b);
    const m = mergeGames(s, local, remote, at(10, 10, 23));
    expect(m.rested).toEqual({ day: '2026-10-23', left: 2 });
    // Оба дела с бонусом: опыт сложился, а бонусов осталось меньше, чем было.
    expect(m.hero.xp).toBe(100);
  });
});
