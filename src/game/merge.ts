// Слияние двух версий одной игры, когда телефон и компьютер менялись независимо.
// Трёхстороннее: base — версия из GitHub, с которой это устройство совпадало в последний раз,
// local — что стало здесь, remote — что лежит в GitHub сейчас. Перед слиянием все три
// доводятся до одного момента (settle), поэтому то, что сделало само время (таймер, мана,
// новый день), во всех трёх одинаково и ничьим изменением не считается.
//
// Что менялось только с одной стороны, берётся оттуда. Что менялось с обеих, берётся у той,
// где действовали позже. Золото, опыт, мана, итоги дня и время на задаче складываются
// приростами обеих сторон. Задачи, походы, повторяющиеся задачи и встречи сливаются поштучно: добавленные
// с обеих сторон остаются, удалённое на одной стороне уходит, если на другой его с тех пор не трогали.
import { MANA_MAX } from './rules';
import { settle, tidyRoutines } from './state';
import type { Current, DayLog, Meeting, Quest, Rating, Routine, State, Task } from './types';

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

/** Глубокое сравнение без учёта порядка ключей; отсутствующее поле равно undefined. */
export function eq(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((x, i) => eq(x, b[i]));
  }
  const ao = a as Record<string, unknown>;
  const bo = b as Record<string, unknown>;
  for (const k of new Set([...Object.keys(ao), ...Object.keys(bo)])) if (!eq(ao[k], bo[k])) return false;
  return true;
}

/** Одно значение: изменённое с одной стороны, а если с обеих, то у победителя. */
function pick<T>(b: T, l: T, r: T, localWins: boolean): T {
  if (eq(l, b) || eq(l, r)) return r;
  if (eq(r, b)) return l;
  return localWins ? l : r;
}

const sum = (b: number, l: number, r: number) => l + r - b;

type Row = Record<string, unknown>;

/**
 * Поля записи по отдельности. Поля из одной группы меняются только вместе (например, статус
 * задачи и её награда), поэтому и выбираются вместе, с одной стороны.
 */
function mergeFields<T extends object>(b: T, l: T, r: T, localWins: boolean, counters: string[], groups: string[][] = []): T {
  const B = b as Row;
  const L = l as Row;
  const R = r as Row;
  const out: Row = {};
  const grouped = new Set(groups.flat());
  for (const g of groups) {
    const part = (x: Row) => Object.fromEntries(g.map((k) => [k, x[k]]));
    Object.assign(out, pick(part(B), part(L), part(R), localWins));
  }
  for (const k of new Set([...Object.keys(L), ...Object.keys(R)])) {
    if (grouped.has(k)) continue;
    out[k] = counters.includes(k) ? sum(B[k] as number, L[k] as number, R[k] as number) : pick(B[k], L[k], R[k], localWins);
  }
  for (const k of Object.keys(out)) if (out[k] === undefined) delete out[k];
  return out as T;
}

/** Списки с id. Порядок: как здесь, потом то, что появилось только там. */
function mergeById<T extends { id: string }>(base: T[], local: T[], remote: T[], one: (b: T, l: T, r: T) => T, localWins: boolean): T[] {
  const B = new Map(base.map((x) => [x.id, x]));
  const R = new Map(remote.map((x) => [x.id, x]));
  const L = new Map(local.map((x) => [x.id, x]));
  const ids = [...L.keys(), ...[...R.keys()].filter((id) => !L.has(id))];
  const out: T[] = [];
  for (const id of ids) {
    const b = B.get(id);
    const l = L.get(id);
    const r = R.get(id);
    if (l && r) out.push(b ? one(b, l, r) : localWins ? l : r);
    else {
      // Есть только с одной стороны: новое, или удалённое там, но с тех пор изменённое здесь.
      const only = (l ?? r)!;
      if (!b || !eq(only, b)) out.push(only);
    }
  }
  return out;
}

const TASK_COUNTERS = ['spentMs'];
const TASK_GROUPS = [
  ['status', 'doneAt', 'doneDay', 'reward', 'releasedAt', 'releasedFrom', 'releasedXp'],
  ['day', 'order', 'leftDay'],
];
const LOG_COUNTERS = ['gold', 'xp', 'done', 'workedMs', 'restMs', 'undeadSlain'];
const EMPTY_LOG: DayLog = { gold: 0, xp: 0, done: 0, workedMs: 0, restMs: 0, undeadSlain: 0 };

function mergeLog(b: State['log'], l: State['log'], r: State['log'], localWins: boolean): State['log'] {
  const out: State['log'] = {};
  for (const day of new Set([...Object.keys(l), ...Object.keys(r)])) {
    out[day] = mergeFields(b[day] ?? EMPTY_LOG, l[day] ?? EMPTY_LOG, r[day] ?? EMPTY_LOG, localWins, LOG_COUNTERS);
  }
  return out;
}

/** Таймер: кто у огня и идёт ли время. «Последний раз видели» берётся самое позднее. */
function mergeCurrent(b: Current | null, l: Current | null, r: Current | null, localWins: boolean): Current | null {
  const core = (c: Current | null) => c && { taskId: c.taskId, runningSince: c.runningSince, idleSince: c.idleSince };
  let chosen: Current | null;
  if (eq(core(l), core(r)) || eq(core(l), core(b))) chosen = r;
  else if (eq(core(r), core(b))) chosen = l;
  else chosen = localWins ? l : r;
  const out = clone(chosen);
  if (out) {
    for (const c of [l, r]) if (c && c.taskId === out.taskId && c.runningSince === out.runningSince) out.seenAt = Math.max(out.seenAt, c.seenAt);
  }
  return out;
}

function mergeRested(b: State['rested'], l: State['rested'], r: State['rested'], localWins: boolean): State['rested'] {
  if (l && r && l.day === r.day) return { day: l.day, left: Math.min(l.left, r.left) };
  return pick(b, l, r, localWins);
}

/** Задачи и походы без общей версии: всё с обеих сторон, совпадающее берётся у победителя. */
function unionById<T extends { id: string }>(local: T[], remote: T[], localWins: boolean): T[] {
  const L = new Map(local.map((x) => [x.id, x]));
  const R = new Map(remote.map((x) => [x.id, x]));
  const ids = [...L.keys(), ...[...R.keys()].filter((id) => !L.has(id))];
  return ids.map((id) => {
    const l = L.get(id);
    const r = R.get(id);
    return l && r ? (localWins ? l : r) : (l ?? r)!;
  });
}

/**
 * Сливает версию отсюда с версией из GitHub. base может не быть (первая встреча с этим
 * сохранением): тогда остаётся всё с обеих сторон, а совпадающее берётся у того, кто
 * действовал позже. Возвращает новое состояние, доведённое до now; входы не меняются.
 */
export function mergeGames(base: State | null, local: State, remote: State, now: number): State {
  const at = (s: State) => {
    const c = clone(s);
    settle(c, now);
    return c;
  };
  const l = at(local);
  const r = at(remote);
  const localWins = (l.touchedAt ?? 0) >= (r.touchedAt ?? 0);
  const win = localWins ? l : r;
  const out = clone(win);
  out.gameId = l.gameId;
  out.createdAt = Math.min(l.createdAt, r.createdAt);
  out.touchedAt = Math.max(l.touchedAt ?? 0, r.touchedAt ?? 0) || null;
  out.seq = Math.max(l.seq, r.seq);
  out.settledAt = now;

  if (!base) {
    out.quests = unionById(l.quests, r.quests, localWins);
    out.tasks = unionById(l.tasks, r.tasks, localWins);
    out.routines = unionById(l.routines, r.routines, localWins);
    setMeetings(out, unionById(l.meetings ?? [], r.meetings ?? [], localWins));
    out.ratings = mergeRatings(l.ratings, r.ratings);
    out.log = {};
    for (const day of new Set([...Object.keys(l.log), ...Object.keys(r.log)])) {
      const a = l.log[day];
      const c = r.log[day];
      out.log[day] = a && c ? (localWins ? a : c) : clone((a ?? c)!);
    }
    tidyRoutines(out);
    return out;
  }

  const b = at(base);
  out.hero = {
    gold: sum(b.hero.gold, l.hero.gold, r.hero.gold),
    xp: sum(b.hero.xp, l.hero.xp, r.hero.xp),
    mana: Math.max(0, Math.min(MANA_MAX, sum(b.hero.mana, l.hero.mana, r.hero.mana))),
  };
  out.quests = mergeById<Quest>(b.quests, l.quests, r.quests, (x, y, z) => mergeFields(x, y, z, localWins, []), localWins);
  out.tasks = mergeById<Task>(b.tasks, l.tasks, r.tasks, (x, y, z) => mergeFields(x, y, z, localWins, TASK_COUNTERS, TASK_GROUPS), localWins);
  out.routines = mergeById<Routine>(b.routines, l.routines, r.routines, (x, y, z) => mergeFields(x, y, z, localWins, []), localWins);
  setMeetings(out, mergeById<Meeting>(b.meetings ?? [], l.meetings ?? [], r.meetings ?? [], (x, y, z) => mergeFields(x, y, z, localWins, []), localWins));
  out.ratings = mergeRatings(l.ratings, r.ratings);
  out.log = mergeLog(b.log, l.log, r.log, localWins);
  out.settings = mergeFields(b.settings, l.settings, r.settings, localWins, []);
  out.current = mergeCurrent(b.current, l.current, r.current, localWins);
  out.breakSince = pick(b.breakSince, l.breakSince, r.breakSince, localWins);
  out.lastQuestId = pick(b.lastQuestId, l.lastQuestId, r.lastQuestId, localWins);
  out.litDay = pick(b.litDay, l.litDay, r.litDay, localWins);
  out.closedDay = pick(b.closedDay, l.closedDay, r.closedDay, localWins);
  out.secondWindDay = pick(b.secondWindDay, l.secondWindDay, r.secondWindDay, localWins);
  // Бонус отдохнувшего героя: сколько дел с ним осталось, считается по меньшему, чтобы два устройства не дали его дважды.
  out.rested = mergeRested(b.rested, l.rested, r.rested, localWins);
  if (!out.rested) delete out.rested;
  // Таймер не может стоять на задаче, которой больше нет.
  if (out.current && !out.tasks.some((t) => t.id === out.current!.taskId)) out.current = null;
  tidyRoutines(out);
  return out;
}

/** Встречи календаря: пустой список не сохраняется, как и в самой игре. */
function setMeetings(s: State, list: Meeting[]): void {
  if (list.length) s.meetings = list;
  else delete s.meetings;
}

/**
 * Оценки сфер: все дни с обеих сторон. Оценка одного дня берётся целиком у того, кто оценивал позже,
 * баллы одной оценки не смешиваются. Удалять оценки игра не умеет, поэтому общая версия не нужна.
 */
function mergeRatings(local: Rating[], remote: Rating[]): Rating[] {
  const out = new Map<string, Rating>();
  for (const x of [...local, ...remote]) {
    const had = out.get(x.id);
    if (!had || x.at > had.at) out.set(x.id, clone(x));
  }
  return [...out.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** В игре ещё ничего не делали: такую можно молча заменить игрой из GitHub. */
export function isPristine(s: State): boolean {
  return s.tasks.length === 0 && s.routines.length === 0 && s.hero.xp === 0 && s.hero.gold === 0;
}
