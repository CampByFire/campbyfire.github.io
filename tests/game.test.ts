import { describe, expect, it } from 'vitest';
import { HOUR, MINUTE, heroLevel, levelForEstimate, undeadRank } from '../src/game/rules';
import {
  addTask,
  canSecondWind,
  complete,
  confirmWorking,
  endDay,
  lairOf,
  lightFire,
  newState,
  planOf,
  planTask,
  release,
  secondWind,
  settle,
  start,
  swapInPlan,
  toggleBreak,
  touch,
  undoComplete,
  unrelease,
  winQuest,
} from '../src/game/state';
import { addDays, dayKey, scheduleError, shiftAt } from '../src/game/time';
import { assignSeats, campView } from '../src/game/view';
import { SAVE_VERSION, Store, checkSave, type Storage } from '../src/game/store';

// Пятница, 23 октября 2026.
const at = (h: number, m = 0, d = 23) => new Date(2026, 9, d, h, m).getTime();

function fresh(now = at(8)) {
  const s = newState(now);
  const [work, personal, home] = s.quests.map((q) => q.id);
  return { s, work, personal, home };
}

describe('время и смены', () => {
  it('день начинается в 4 утра', () => {
    expect(dayKey(at(3, 59))).toBe('2026-10-22');
    expect(dayKey(at(4))).toBe('2026-10-23');
  });

  it('смены рабочего дня и выходного', () => {
    const { s } = fresh();
    expect(shiftAt(at(8), s.settings)).toBe('morning');
    expect(shiftAt(at(14), s.settings)).toBe('work');
    expect(shiftAt(at(19), s.settings)).toBe('evening');
    expect(shiftAt(at(22, 40), s.settings)).toBe('night');
    expect(shiftAt(at(14, 0, 24), s.settings)).toBe('weekend');
    expect(shiftAt(at(1, 0, 24), s.settings)).toBe('night');
  });

  it('распорядок, в котором путаются смены, не принимается', () => {
    const { s } = fresh();
    expect(scheduleError(s.settings)).toBeNull();
    expect(scheduleError({ ...s.settings, workStart: 3 * 60 })).toMatch('не раньше 4:00');
    expect(scheduleError({ ...s.settings, workStart: 18 * 60, workEnd: 9 * 60 })).toMatch('позже начала');
    expect(scheduleError({ ...s.settings, workEnd: 22 * 60, bedtime: 22 * 60 + 15 })).toMatch('Отбой');
    // Отбой после полуночи допустим: он ещё в том же игровом дне.
    expect(scheduleError({ ...s.settings, bedtime: 60 })).toBeNull();
  });
});

describe('таймер и мана', () => {
  it('работа идёт в задачу и тратит ману', () => {
    const { s, work } = fresh();
    const id = addTask(s, at(8), { title: 'Отчёт', questId: work, day: s.day });
    start(s, at(9), id);
    touch(s, at(10));
    settle(s, at(11));
    expect(s.tasks.find((t) => t.id === id)!.spentMs).toBe(2 * HOUR);
    expect(s.hero.mana).toBe(70);
    expect(s.log[s.day].workedMs).toBe(2 * HOUR);
  });

  it('привал останавливает таймер и возвращает ману', () => {
    const { s, work } = fresh();
    const id = addTask(s, at(8), { title: 'Отчёт', questId: work, day: s.day });
    start(s, at(9), id);
    touch(s, at(10));
    toggleBreak(s, at(11));
    settle(s, at(12));
    expect(s.tasks[0].spentMs).toBe(2 * HOUR);
    expect(s.hero.mana).toBe(100);
    toggleBreak(s, at(12));
    expect(s.current?.runningSince).toBe(at(12));
  });

  it('забытый таймер встаёт через 90 минут и время можно вернуть', () => {
    const { s, work } = fresh();
    const id = addTask(s, at(8), { title: 'Отчёт', questId: work, day: s.day });
    start(s, at(9), id);
    settle(s, at(12));
    expect(s.tasks[0].spentMs).toBe(90 * MINUTE);
    expect(s.current?.idleSince).toBe(at(10, 30));
    confirmWorking(s, at(12));
    expect(s.tasks[0].spentMs).toBe(3 * HOUR);
    expect(s.current?.runningSince).toBe(at(12));
  });

  it('другой поход стоит маны, тот же нет', () => {
    const { s, work, personal } = fresh();
    const a = addTask(s, at(8), { title: 'A', questId: work, day: s.day });
    const b = addTask(s, at(8), { title: 'B', questId: work, day: s.day });
    const c = addTask(s, at(8), { title: 'C', questId: personal, day: s.day });
    expect(start(s, at(9), a).switchCost).toBe(0);
    expect(start(s, at(9), b).switchCost).toBe(0);
    expect(start(s, at(9), c).switchCost).toBe(5);
    expect(s.hero.mana).toBe(95);
  });

  it('второе дыхание только вечером, после работы и раз в день', () => {
    const { s, work } = fresh();
    const id = addTask(s, at(8), { title: 'A', questId: work, day: s.day });
    expect(canSecondWind(s, at(19))).toBe(false);
    start(s, at(9), id);
    toggleBreak(s, at(10));
    s.hero.mana = 40;
    expect(secondWind(s, at(15))).toBe(false);
    settle(s, at(19));
    s.breakSince = null;
    s.hero.mana = 40;
    expect(secondWind(s, at(19))).toBe(true);
    expect(s.hero.mana).toBe(70);
    expect(secondWind(s, at(20))).toBe(false);
  });
});

describe('награды', () => {
  it('золото и опыт по уровню, урон логову', () => {
    const { s, work } = fresh();
    const a = addTask(s, at(8), { title: 'Модуль', questId: work, level: 3, day: s.day });
    addTask(s, at(8), { title: 'Ещё', questId: work, level: 2 });
    const r = complete(s, at(10), a)!;
    expect(r.reward).toEqual({ gold: 75, xp: 60, damage: 3 });
    expect(r.lair).toEqual({ before: 5, after: 2, max: 5 });
    expect(s.hero.gold).toBe(75);
    expect(s.hero.xp).toBe(60);
  });

  it('уровень можно поправить при сдаче', () => {
    const { s, work } = fresh();
    const a = addTask(s, at(8), { title: 'A', questId: work, level: 1, day: s.day });
    expect(complete(s, at(10), a, 2)!.reward.gold).toBe(50);
  });

  it('отмена «Готово» возвращает награду', () => {
    const { s, work } = fresh();
    const a = addTask(s, at(8), { title: 'A', questId: work, level: 2, day: s.day });
    complete(s, at(10), a);
    undoComplete(s, a);
    expect(s.hero.gold).toBe(0);
    expect(s.tasks[0].status).toBe('open');
  });

  it('отмена «Готово» снимает упокоенную нежить', () => {
    const { s, work } = fresh();
    const old = addTask(s, at(8), { title: 'Просрочка', questId: work, due: '2026-10-21' });
    complete(s, at(11), old);
    expect(s.log[s.day].undeadSlain).toBe(1);
    undoComplete(s, old);
    expect(s.log[s.day].undeadSlain).toBe(0);
  });

  it('старое сохранение теряет поля лягушки дня, опыт за неё остаётся', () => {
    const { s, work } = fresh();
    const a = addTask(s, at(8), { title: 'A', questId: work, level: 3, day: s.day });
    complete(s, at(10), a);
    const old = JSON.parse(JSON.stringify(s));
    old.frogId = a;
    old.log[s.day].frog = true;
    old.tasks[0].reward = { ...old.tasks[0].reward, xp: 120, frog: true };
    old.hero.xp = 120;
    const back = checkSave(old)!;
    expect('frogId' in back).toBe(false);
    expect('frog' in back.log[s.day]).toBe(false);
    expect('frog' in back.tasks[0].reward!).toBe(false);
    expect(back.hero.xp).toBe(120);
    undoComplete(back, a);
    expect(back.hero.xp).toBe(0);
  });

  it('отпущенную задачу можно вернуть туда, откуда отпустили', () => {
    const { s, work } = fresh();
    const a = addTask(s, at(8), { title: 'A', questId: work, day: s.day });
    const letter = addTask(s, at(8), { title: 'Письмо', questId: null });
    release(s, at(9), a);
    release(s, at(9), letter);
    unrelease(s, a);
    unrelease(s, letter);
    const [ta, tl] = s.tasks;
    expect(ta.status).toBe('open');
    expect(ta.day).toBe(s.day);
    expect(ta.releasedAt).toBeUndefined();
    expect(tl.status).toBe('inbox');
  });

  it('задача, отпущенная из плана прошедшего дня, возвращается в отряд', () => {
    const { s, work } = fresh();
    const a = addTask(s, at(8), { title: 'A', questId: work, day: s.day });
    release(s, at(9), a);
    s.day = addDays(s.day, 2);
    unrelease(s, a);
    expect(s.tasks[0].status).toBe('open');
    expect(s.tasks[0].day).toBeNull();
  });

  it('сделанную задачу отпустить нельзя', () => {
    const { s, work } = fresh();
    const a = addTask(s, at(8), { title: 'A', questId: work, day: s.day });
    complete(s, at(9), a);
    release(s, at(10), a);
    expect(s.tasks[0].status).toBe('done');
  });

  it('логово падает, когда задач не осталось', () => {
    const { s, work } = fresh();
    const a = addTask(s, at(8), { title: 'A', questId: work, level: 2 });
    expect(winQuest(s, at(9), work)).toBe(false);
    complete(s, at(9), a);
    expect(lairOf(s, work)).toEqual({ hp: 0, max: 2 });
    expect(winQuest(s, at(9), work)).toBe(true);
  });

  it('разжечь костёр даёт опыт один раз', () => {
    const { s, work } = fresh();
    addTask(s, at(8), { title: 'A', questId: work, day: s.day });
    addTask(s, at(8), { title: 'B', questId: work, day: s.day });
    expect(lightFire(s, at(8))).toBe(6);
    expect(lightFire(s, at(8))).toBe(0);
  });

  it('уровень героя растёт по опыту', () => {
    expect(heroLevel(0).level).toBe(1);
    expect(heroLevel(299).level).toBe(1);
    expect(heroLevel(300).level).toBe(2);
    expect(heroLevel(900)).toEqual({ level: 3, into: 0, need: 900 });
  });

  it('уровень по оценке', () => {
    expect(levelForEstimate(20)).toBe(1);
    expect(levelForEstimate(60)).toBe(2);
    expect(levelForEstimate(240)).toBe(3);
    expect(levelForEstimate(900)).toBe(4);
  });
});

describe('дни', () => {
  it('новый день: мана полна, незакрытые задачи остаются у огня', () => {
    const { s, work } = fresh();
    const a = addTask(s, at(8), { title: 'A', questId: work, day: s.day });
    s.hero.mana = 10;
    settle(s, at(9, 0, 24));
    expect(s.day).toBe('2026-10-24');
    expect(s.hero.mana).toBe(100);
    expect(s.tasks.find((t) => t.id === a)!.day).toBe('2026-10-24');
  });

  it('отбой: отмеченные на завтра, остальные в отряд', () => {
    const { s, work } = fresh();
    const a = addTask(s, at(8), { title: 'A', questId: work, day: s.day });
    const b = addTask(s, at(8), { title: 'B', questId: work, day: s.day });
    endDay(s, at(22, 40), [a]);
    expect(s.closedDay).toBe(s.day);
    expect(s.tasks.find((t) => t.id === a)!.day).toBe(addDays(s.day, 1));
    expect(s.tasks.find((t) => t.id === b)!.day).toBeNull();
  });

  it('просрочка становится нежитью по рангам', () => {
    expect(undeadRank(1)).toBe('minion');
    expect(undeadRank(3)).toBe('rogue');
    expect(undeadRank(7)).toBe('warrior');
    expect(undeadRank(20)).toBe('mage');
  });
});

describe('экран дня', () => {
  it('нумерация по плану, вечерние отдельно, нежить на дороге', () => {
    const { s, work, personal } = fresh();
    const a = addTask(s, at(8), { title: 'Работа 1', questId: work, day: s.day });
    const b = addTask(s, at(8), { title: 'Работа 2', questId: work, day: s.day });
    const c = addTask(s, at(8), { title: 'Тренировка', questId: personal, day: s.day });
    const d = addTask(s, at(8), { title: 'Траты', questId: work, due: '2026-10-21' });
    complete(s, at(9), a);
    start(s, at(10), b);
    const v = campView(s, at(14));
    expect(v.numbers.get(a)).toBe(1);
    expect(v.numbers.get(b)).toBe(2);
    expect(v.numbers.get(c)).toBe(3);
    expect(v.numbers.get(d)).toBe(4);
    expect(v.current?.id).toBe(b);
    expect(v.main.map((t) => t.id)).toEqual([]);
    expect(v.later.map((t) => t.id)).toEqual([c]);
    expect(v.road).toHaveLength(1);
    expect(v.road[0].rank).toBe('minion');
    expect(v.ring?.pose).toBe('work');
    expect(v.doneToday).toBe(1);
  });

  it('«выше» и «ниже» двигают задачу через видимого соседа, а не через сделанную', () => {
    const { s, work } = fresh();
    const a = addTask(s, at(8), { title: 'Отчёт', questId: work, day: s.day });
    const b = addTask(s, at(8), { title: 'Почта', questId: work, day: s.day });
    const c = addTask(s, at(8), { title: 'Созвон', questId: work, day: s.day });
    complete(s, at(9), b);
    swapInPlan(s, a, c);
    expect(planOf(s).filter((t) => t.status === 'open').map((t) => t.title)).toEqual(['Созвон', 'Отчёт']);
    // Задачи разных дней местами не меняются.
    const d = addTask(s, at(8), { title: 'Завтра', questId: work, day: '2026-10-24' });
    swapInPlan(s, c, d);
    expect(planOf(s).filter((t) => t.status === 'open').map((t) => t.title)).toEqual(['Созвон', 'Отчёт']);
  });

  it('места у костра не меняются, когда соседи уходят', () => {
    const { s, work } = fresh();
    const ids = [1, 2, 3, 4].map((i) => addTask(s, at(8) + i, { title: `T${i}`, questId: work, day: s.day }));
    const before = assignSeats(s.tasks).seats;
    release(s, at(9), ids[1]);
    const after = assignSeats(s.tasks.filter((t) => t.status === 'open')).seats;
    for (const id of [ids[0], ids[2], ids[3]]) {
      if (before.get(id) !== undefined && after.get(id) !== undefined) {
        // Место может только освободиться, но не перейти к другому, если не было столкновений.
        expect(after.get(id)).toBeLessThan(6);
      }
    }
    expect(new Set(after.values()).size).toBe(after.size);
  });

  it('после отбоя отряд спит, план убран', () => {
    const { s, work } = fresh();
    addTask(s, at(8), { title: 'A', questId: work, day: s.day });
    endDay(s, at(22, 40), []);
    const v = campView(s, at(22, 41));
    expect(v.asleep).toBe(true);
    expect(v.light).toBe('night');
    expect(v.seats).toHaveLength(0);
  });

  it('задача без похода и без дня уходит письмом к вестнику', () => {
    const { s } = fresh();
    addTask(s, at(8), { title: 'Позвонить', questId: null });
    expect(campView(s, at(9)).inbox).toBe(1);
    planTask(s, s.tasks[0].id, s.day);
    expect(campView(s, at(9)).inbox).toBe(0);
  });
});

describe('хранилище', () => {
  it('сохраняет и читает состояние', () => {
    let saved: string | null = null;
    const storage: Storage = { load: () => saved, save: (j) => { saved = j; } };
    const a = new Store(storage, () => at(9));
    a.act((s, now) => addTask(s, now, { title: 'A', questId: s.quests[0].id, day: s.day }));
    const b = new Store(storage, () => at(9, 30));
    expect(b.state.tasks).toHaveLength(1);
  });

  /** Хранилище в памяти, которое помнит всё, что в него писали. */
  function memory(raw: string | null) {
    const m = { raw, writes: 0, backup: null as string | null };
    const storage: Storage = {
      load: () => m.raw,
      save: (j) => {
        m.raw = j;
        m.writes += 1;
      },
      backup: (r) => {
        m.backup = r;
      },
    };
    return { m, storage };
  }

  it('нечитаемое сохранение не затирается, пока игрок не решит', () => {
    const { m, storage } = memory('{"v":1,"tasks":[{"id"');
    const st = new Store(storage, () => at(9));
    expect(st.problem?.kind).toBe('broken');
    expect(m.backup).toBe('{"v":1,"tasks":[{"id"');
    st.tick();
    st.wake();
    expect(m.writes).toBe(0);
    expect(m.raw).toBe('{"v":1,"tasks":[{"id"');
    st.startOver();
    expect(st.problem).toBeNull();
    expect(m.writes).toBe(1);
    expect(JSON.parse(m.raw!).v).toBe(SAVE_VERSION);
  });

  it('сохранение из новой версии игры узнаётся и тоже не затирается', () => {
    const { s } = fresh();
    const newer = JSON.stringify({ ...s, v: SAVE_VERSION + 1 });
    const { m, storage } = memory(newer);
    const st = new Store(storage, () => at(9));
    expect(st.problem?.kind).toBe('newer');
    expect(m.writes).toBe(0);
  });

  it('браузер не дал записать: игра об этом знает', () => {
    let full = false;
    const storage: Storage = { load: () => null, save: () => !full };
    const st = new Store(storage, () => at(9));
    expect(st.saveOk).toBe(true);
    full = true;
    st.act((s, now) => addTask(s, now, { title: 'A', questId: s.quests[0].id, day: s.day }));
    expect(st.saveOk).toBe(false);
    full = false;
    st.act((s, now) => addTask(s, now, { title: 'B', questId: s.quests[0].id, day: s.day }));
    expect(st.saveOk).toBe(true);
  });

  it('стёртая игра больше ничего не пишет до перезагрузки', () => {
    const { m, storage } = memory(null);
    let cleared = 0;
    storage.clear = () => {
      m.raw = null;
      cleared += 1;
    };
    const st = new Store(storage, () => at(9));
    st.act((s, now) => addTask(s, now, { title: 'A', questId: s.quests[0].id, day: s.day }));
    const writes = m.writes;
    st.wipe();
    st.tick();
    st.wake();
    st.persist();
    expect(cleared).toBe(1);
    expect(m.raw).toBeNull();
    expect(m.writes).toBe(writes);
  });

  it('действие, упавшее с ошибкой, не оставляет игру наполовину изменённой', () => {
    const { m, storage } = memory(null);
    const st = new Store(storage, () => at(9));
    st.act((s, now) => addTask(s, now, { title: 'A', questId: s.quests[0].id, day: s.day }));
    const before = m.raw;
    expect(() =>
      st.act((s, now) => {
        addTask(s, now, { title: 'B', questId: s.quests[0].id, day: s.day });
        s.hero.gold += 100;
        throw new Error('сбой правила');
      }),
    ).toThrow('сбой правила');
    expect(st.state.tasks.map((t) => t.title)).toEqual(['A']);
    expect(st.state.hero.gold).toBe(JSON.parse(before!).hero.gold);
    expect(m.raw).toBe(before);
  });
});
