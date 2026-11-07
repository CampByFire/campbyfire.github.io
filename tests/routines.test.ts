import { describe, expect, it } from 'vitest';
import { isPristine, mergeGames } from '../src/game/merge';
import {
  addQuest,
  addRoutine,
  addTask,
  complete,
  endDay,
  findTask,
  lairOf,
  newState,
  planOf,
  planTask,
  release,
  removeQuest,
  settle,
  stopRoutine,
  updateRoutine,
  waitingOf,
  winQuest,
  type RoutineInput,
} from '../src/game/state';
import { SAVE_VERSION, Store, checkSave, type Storage } from '../src/game/store';
import { nextRepeat, repeatOnDays } from '../src/game/time';
import type { Repeat, State } from '../src/game/types';
import { repeatName } from '../src/game/words';

// Пятница, 23 октября 2026.
const at = (h: number, m = 0, d = 23) => new Date(2026, 9, d, h, m).getTime();

function fresh(now = at(8)) {
  const s = newState(now);
  const [work, personal, home] = s.quests.map((q) => q.id);
  return { s, work, personal, home };
}

const routine = (title: string, repeat: Repeat, questId: string | null = null): RoutineInput => ({
  title,
  questId,
  level: 1,
  estimateMin: 15,
  at: null,
  repeat,
});

/** Задачи, которые прислала повторяющаяся, по дням прихода. */
const sent = (s: State, id: string) => s.tasks.filter((t) => t.routineId === id || t.id.startsWith(`${id}@`));

describe('повторяющиеся задачи', () => {
  it('каждый день: сама встаёт в план сегодня и завтра, сделанная остаётся в истории', () => {
    const { s, personal } = fresh();
    const r = addRoutine(s, at(8), routine('Зарядка', { every: 'day' }, personal));
    expect(planOf(s).map((t) => t.title)).toEqual(['Зарядка']);
    const today = waitingOf(s, r)!;
    complete(s, at(9), today.id);
    settle(s, at(8, 0, 24));
    const tomorrow = waitingOf(s, r)!;
    expect(tomorrow.id).not.toBe(today.id);
    expect(tomorrow.day).toBe('2026-10-24');
    expect(findTask(s, today.id)!.status).toBe('done');
    expect(sent(s, r)).toHaveLength(2);
  });

  it('несделанная не размножается: на следующий день зовётся та же', () => {
    const { s } = fresh();
    const r = addRoutine(s, at(8), routine('Почта', { every: 'day' }));
    const first = waitingOf(s, r)!.id;
    // День не закрыли: задача переезжает сама.
    settle(s, at(8, 0, 24));
    expect(sent(s, r).map((t) => t.id)).toEqual([first]);
    expect(findTask(s, first)!.day).toBe('2026-10-24');
    // Отбой без галочки: задача уходит в отряд, а утром повторяющаяся зовёт её снова.
    endDay(s, at(22, 0, 24), []);
    expect(findTask(s, first)!.day).toBeNull();
    settle(s, at(8, 0, 25));
    expect(sent(s, r).map((t) => t.id)).toEqual([first]);
    expect(findTask(s, first)!.day).toBe('2026-10-25');
    // Пропущенные дни не копятся.
    settle(s, at(8, 0, 28));
    expect(sent(s, r)).toHaveLength(1);
  });

  it('в свои дни приходит только в выбранные, распорядок на это не влияет', () => {
    const { s } = fresh();
    s.settings.workDays = [1];
    const r = addRoutine(s, at(8), routine('Планёрка', { every: 'days', days: [2, 5, 6] }));
    expect(waitingOf(s, r)?.day).toBe('2026-10-23'); // пятница
    complete(s, at(9), waitingOf(s, r)!.id);
    settle(s, at(8, 0, 24)); // суббота
    expect(waitingOf(s, r)?.day).toBe('2026-10-24');
    complete(s, at(9, 0, 24), waitingOf(s, r)!.id);
    settle(s, at(8, 0, 25)); // воскресенье
    settle(s, at(8, 0, 26)); // понедельник
    expect(waitingOf(s, r)).toBeUndefined();
    settle(s, at(8, 0, 27)); // вторник
    expect(waitingOf(s, r)?.day).toBe('2026-10-27');
  });

  it('один выбранный день это раз в неделю, все семь это каждый день', () => {
    expect(repeatOnDays([3])).toEqual({ every: 'week', weekday: 3 });
    expect(repeatOnDays([0, 1, 2, 3, 4, 5, 6])).toEqual({ every: 'day' });
    expect(repeatOnDays([5, 1, 3, 1])).toEqual({ every: 'days', days: [1, 3, 5] });
    expect(nextRepeat({ every: 'days', days: [] }, '2026-10-23')).toBeNull();
  });

  it('название повтора называет дни словами, с понедельника', () => {
    expect(repeatName({ every: 'days', days: [1, 2, 3, 4, 5] })).toBe('по будням');
    expect(repeatName({ every: 'days', days: [0, 6] })).toBe('по выходным');
    expect(repeatName({ every: 'days', days: [0, 1] })).toBe('по понедельникам и воскресеньям');
    expect(repeatName({ every: 'days', days: [5, 1, 3] })).toBe('по понедельникам, средам и пятницам');
  });

  it('«по рабочим дням» из старого сохранения становится выбором дней из распорядка', () => {
    const old = (workDays: number[]) => {
      const { s } = fresh();
      s.settings.workDays = workDays;
      addRoutine(s, at(8), routine('Почта', { every: 'day' }));
      addRoutine(s, at(8), routine('Цветы', { every: 'week', weekday: 3 }));
      s.routines[0].repeat = { every: 'workday' } as unknown as Repeat;
      (s as { v: number }).v = 3;
      return checkSave(JSON.parse(JSON.stringify(s)))!;
    };
    const s = old([1, 2, 3, 4, 5]);
    expect(s.v).toBe(SAVE_VERSION);
    expect(s.routines.map((r) => r.repeat)).toEqual([
      { every: 'days', days: [1, 2, 3, 4, 5] },
      { every: 'week', weekday: 3 },
    ]);
    expect(old([2, 3, 4, 5, 6]).routines[0].repeat).toEqual({ every: 'days', days: [2, 3, 4, 5, 6] });
    expect(old([]).routines[0].repeat).toEqual({ every: 'days', days: [1, 2, 3, 4, 5] });
  });

  it('свои дни, изменённые на двух устройствах, сливаются целиком: берётся более поздняя правка', () => {
    const { s: base } = fresh();
    const r = addRoutine(base, at(8), routine('Почта', { every: 'days', days: [1, 3] }));
    const local = JSON.parse(JSON.stringify(base)) as State;
    const remote = JSON.parse(JSON.stringify(base)) as State;
    updateRoutine(local, r, routine('Почта', { every: 'days', days: [1, 3, 5] }));
    local.touchedAt = at(9);
    updateRoutine(remote, r, routine('Почта', { every: 'days', days: [2, 4] }));
    remote.touchedAt = at(10);
    expect(mergeGames(base, local, remote, at(11)).routines[0].repeat).toEqual({ every: 'days', days: [2, 4] });
    // Если дни меняли только с одной стороны, они берутся оттуда.
    const untouched = JSON.parse(JSON.stringify(base)) as State;
    untouched.touchedAt = at(10);
    expect(mergeGames(base, local, untouched, at(11)).routines[0].repeat).toEqual({ every: 'days', days: [1, 3, 5] });
  });

  it('раз в неделю приходит только в свой день', () => {
    const { s } = fresh();
    const r = addRoutine(s, at(8), routine('Полить цветы', { every: 'week', weekday: 3 }));
    expect(waitingOf(s, r)).toBeUndefined();
    settle(s, at(8, 0, 27));
    expect(waitingOf(s, r)).toBeUndefined();
    settle(s, at(8, 0, 28));
    expect(waitingOf(s, r)?.id).toBe(`${r}@2026-10-28`);
    expect(planOf(s).map((t) => t.title)).toEqual(['Полить цветы']);
  });

  it('отпущенная сегодня не возвращается до следующего своего дня', () => {
    const { s } = fresh();
    const r = addRoutine(s, at(8), routine('Почта', { every: 'day' }));
    release(s, at(9), waitingOf(s, r)!.id);
    updateRoutine(s, r, routine('Почта', { every: 'days', days: [1, 2, 3, 4, 5] }));
    expect(waitingOf(s, r)).toBeUndefined();
    settle(s, at(8, 0, 26));
    expect(waitingOf(s, r)?.day).toBe('2026-10-26');
  });

  it('после отбоя новая повторяющаяся приходит только завтра', () => {
    const { s } = fresh();
    endDay(s, at(22), []);
    const r = addRoutine(s, at(22, 30), routine('Почта', { every: 'day' }));
    expect(waitingOf(s, r)).toBeUndefined();
    settle(s, at(8, 0, 24));
    expect(waitingOf(s, r)?.day).toBe('2026-10-24');
  });

  it('в прогресс проекта не идут и завершить его не мешают', () => {
    const { s, work: sphere } = fresh();
    const work = addQuest(s, at(8), { name: 'Сертификат', kind: 'work', color: 'blue', sphereId: sphere });
    const task = addTask(s, at(8), { title: 'Отчёт', questId: work, level: 2, day: s.day });
    const r = addRoutine(s, at(8), routine('Почта', { every: 'day' }, work));
    expect(lairOf(s, work)).toEqual({ hp: 2, max: 2 });
    const res = complete(s, at(9), waitingOf(s, r)!.id)!;
    expect(res.reward.damage).toBe(0);
    expect(res.reward.gold).toBe(25);
    expect(res.lair).toBeNull();
    complete(s, at(10), task);
    settle(s, at(8, 0, 24));
    expect(waitingOf(s, r)).toBeDefined();
    expect(lairOf(s, work)).toEqual({ hp: 0, max: 2 });
    expect(winQuest(s, at(9, 0, 24), work)).toBe(true);
  });

  it('обычная задача становится повторяющейся и сама считается первым приходом', () => {
    const { s, home } = fresh();
    const id = addTask(s, at(8), { title: 'Мусор', questId: home, due: '2026-10-30' });
    const r = addRoutine(s, at(8), routine('Мусор', { every: 'day' }, home), id);
    expect(s.tasks).toHaveLength(1);
    expect(findTask(s, id)).toMatchObject({ routineId: r, due: null, day: '2026-10-23' });
  });

  it('правка меняет ждущую задачу, «больше не повторять» оставляет её обычной', () => {
    const { s, work, personal } = fresh();
    const r = addRoutine(s, at(8), routine('Почта', { every: 'day' }, work));
    const id = waitingOf(s, r)!.id;
    updateRoutine(s, r, { ...routine('Разобрать почту', { every: 'day' }, personal), level: 2, at: '10:00' });
    expect(findTask(s, id)).toMatchObject({ title: 'Разобрать почту', questId: personal, level: 2, at: '10:00' });
    stopRoutine(s, r);
    expect(s.routines).toHaveLength(0);
    expect(findTask(s, id)!.routineId).toBeUndefined();
    expect(findTask(s, id)!.status).toBe('open');
    settle(s, at(8, 0, 24));
    expect(s.tasks).toHaveLength(1);
  });

  it('убранный поход: повторяющаяся остаётся без похода, позванная задача в плане', () => {
    const { s, work } = fresh();
    const r = addRoutine(s, at(8), routine('Почта', { every: 'day' }, work));
    removeQuest(s, work);
    expect(s.routines[0].questId).toBeNull();
    expect(waitingOf(s, r)).toMatchObject({ status: 'open', questId: null, day: '2026-10-23' });
  });

  it('позванную на другой день в свой день зовёт сегодня', () => {
    const { s } = fresh();
    const r = addRoutine(s, at(8), routine('Почта', { every: 'day' }));
    const id = waitingOf(s, r)!.id;
    planTask(s, id, '2026-10-26');
    settle(s, at(8, 0, 24));
    expect(findTask(s, id)!.day).toBe('2026-10-24');
  });
});

describe('повторяющиеся задачи на двух устройствах', () => {
  const clone = (s: State): State => JSON.parse(JSON.stringify(s)) as State;

  it('оба устройства разбудили задачу у себя: после слияния она одна', () => {
    const { s } = fresh();
    const r = addRoutine(s, at(8), routine('Почта', { every: 'day' }));
    complete(s, at(9), waitingOf(s, r)!.id);
    const base = clone(s);
    const phone = clone(s);
    const laptop = clone(s);
    settle(phone, at(8, 0, 24));
    settle(laptop, at(9, 0, 24));
    complete(laptop, at(9, 30, 24), waitingOf(laptop, r)!.id);
    const m = mergeGames(base, phone, laptop, at(10, 0, 24));
    expect(sent(m, r)).toHaveLength(2);
    expect(waitingOf(m, r)).toBeUndefined();
    expect(m.hero.gold).toBe(50);
  });

  it('устройство пропустило день: в отряде всё равно одна несделанная', () => {
    const { s } = fresh();
    const r = addRoutine(s, at(8), routine('Почта', { every: 'day' }));
    const old = clone(s);
    // Ноутбук жил два дня и вчерашнюю не сделал.
    const laptop = clone(s);
    addTask(laptop, at(9), { title: 'Отчёт', questId: laptop.quests[0].id });
    settle(laptop, at(8, 0, 24));
    // Телефон проспал эти дни и слился без общей версии.
    const phone = clone(old);
    phone.tasks = phone.tasks.filter((t) => !t.routineId);
    settle(phone, at(8, 0, 24));
    const m = mergeGames(null, phone, laptop, at(9, 0, 24));
    expect(m.tasks.filter((t) => t.routineId === r && t.status === 'open')).toHaveLength(1);
  });

  it('на одном устройстве перестали повторять: на другом она не возвращается', () => {
    const { s } = fresh();
    const r = addRoutine(s, at(8), routine('Почта', { every: 'day' }));
    complete(s, at(9), waitingOf(s, r)!.id);
    const base = clone(s);
    const phone = clone(s);
    const laptop = clone(s);
    stopRoutine(phone, r);
    settle(laptop, at(8, 0, 24));
    const m = mergeGames(base, phone, laptop, at(9, 0, 24));
    expect(m.routines).toHaveLength(0);
    expect(m.tasks.filter((t) => t.status === 'open')).toHaveLength(0);
  });

  it('новая игра с одной лишь повторяющейся задачей уже не пустая', () => {
    const { s } = fresh();
    expect(isPristine(s)).toBe(true);
    addRoutine(s, at(8), routine('Почта', { every: 'week', weekday: 1 }));
    expect(isPristine(s)).toBe(false);
  });
});

describe('сохранение прошлой версии', () => {
  it('сохранение 0.2 открывается: повторяющихся задач в нём просто нет', () => {
    const { s, work } = fresh();
    addTask(s, at(8), { title: 'Отчёт', questId: work, day: s.day });
    const old = JSON.parse(JSON.stringify(s)) as Record<string, unknown>;
    old.v = 1;
    delete old.routines;
    let raw: string | null = JSON.stringify(old);
    const storage: Storage = { load: () => raw, save: (j) => { raw = j; } };
    const st = new Store(storage, () => at(9));
    expect(st.problem).toBeNull();
    expect(st.state.v).toBe(SAVE_VERSION);
    expect(st.state.routines).toEqual([]);
    expect(st.state.tasks.map((t) => t.title)).toEqual(['Отчёт']);
    expect(JSON.parse(raw!).v).toBe(SAVE_VERSION);
  });
});
