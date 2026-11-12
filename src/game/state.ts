// Правила игры как функции над State. Функции меняют переданное состояние на месте,
// поэтому store вызывает их на своей копии. DOM здесь нет, всё проверяется тестами.
import {
  DAY_STARTS_AT_HOUR,
  EMBER_EVERY,
  EMBER_XP,
  ESTIMATE_BY_LEVEL,
  ESTIMATE_MAX_MIN,
  FORGOTTEN_AFTER,
  GOLD_PER_LEVEL,
  HOUR,
  MANA_DRAIN_PER_HOUR,
  MANA_MAX,
  MANA_REST_PER_HOUR,
  MERCY_XP,
  MINUTE,
  RATE_EVERY_DAYS,
  RATE_FIRST_AFTER_DAYS,
  IMPROVE_MAX,
  SCORE_MAX,
  SCORE_MIN,
  planXp,
  RESTED_AFTER_DAYS,
  RESTED_TASKS,
  RESTED_XP_BONUS,
  SECOND_WIND,
  SPARK_AFTER,
  SPARK_XP,
  STARTED_AFTER,
  SWITCH_COST,
  UNDEAD_XP_BONUS,
  XP_BY_LEVEL,
  levelForEstimate,
  undeadRank,
} from './rules';
import { BIGGER, isPast, periodKind, periodOf, within, type PeriodKey } from './period';
import { addDays, dayKey, daysBetween, parseDay, repeatsOn, shiftAt } from './time';
import type { DayKey, DayLog, Level, Quest, QuestColor, QuestKind, Rating, Repeat, Reward, Routine, Settings, State, Task } from './types';

export const DEFAULT_SETTINGS: Settings = {
  workStart: 9 * 60,
  workEnd: 18 * 60,
  workDays: [1, 2, 3, 4, 5],
  bedtime: 23 * 60,
  rateEvery: 'month',
};

/**
 * Сферы новой игры, как в колесе баланса. id постоянные: так одно и то же старое сохранение
 * на двух устройствах переходит к сферам одинаково, и слияние не видит двух «Здоровий».
 */
export const DEFAULT_SPHERES: readonly Pick<Quest, 'id' | 'name' | 'kind' | 'color'>[] = [
  { id: 'sphere-work', name: 'Работа', kind: 'work', color: 'blue' },
  { id: 'sphere-health', name: 'Здоровье', kind: 'personal', color: 'green' },
  { id: 'sphere-home', name: 'Дом и быт', kind: 'any', color: 'brown' },
  { id: 'sphere-money', name: 'Финансы', kind: 'any', color: 'yellow' },
  { id: 'sphere-family', name: 'Семья и отношения', kind: 'personal', color: 'red' },
  { id: 'sphere-friends', name: 'Друзья', kind: 'personal', color: '#d9659e' },
  { id: 'sphere-growth', name: 'Развитие', kind: 'personal', color: 'purple' },
  { id: 'sphere-rest', name: 'Отдых', kind: 'personal', color: '#2bb3a3' },
];

/** Случайная строка для id: два устройства не выдадут одинаковых, даже без связи. */
export function randomId(len = 8): string {
  const abc = '0123456789abcdefghijklmnopqrstuvwxyz';
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  let out = '';
  for (const b of bytes) out += abc[b % abc.length];
  return out;
}

export function newState(now: number): State {
  const s: State = {
    v: 4,
    gameId: randomId(12),
    createdAt: now,
    touchedAt: null,
    day: dayKey(now),
    hero: { xp: 0, gold: 0, mana: MANA_MAX },
    quests: DEFAULT_SPHERES.map((d) => ({ ...d, sphere: true as const, createdAt: now })),
    ratings: [],
    tasks: [],
    routines: [],
    current: null,
    breakSince: null,
    lastQuestId: null,
    litDay: null,
    closedDay: null,
    secondWindDay: null,
    settledAt: now,
    log: {},
    settings: { ...DEFAULT_SETTINGS, workDays: [...DEFAULT_SETTINGS.workDays] },
    seq: 0,
  };
  return s;
}

export function nextId(s: State, prefix: string): string {
  s.seq += 1;
  return `${prefix}${s.seq.toString(36)}-${randomId(4)}`;
}

export function logOf(s: State, day: DayKey): DayLog {
  let l = s.log[day];
  if (!l) {
    l = { gold: 0, xp: 0, done: 0, workedMs: 0, restMs: 0, undeadSlain: 0 };
    s.log[day] = l;
  }
  return l;
}

export function findTask(s: State, id: string): Task | undefined {
  return s.tasks.find((t) => t.id === id);
}

export function findQuest(s: State, id: string | null): Quest | undefined {
  return id ? s.quests.find((q) => q.id === id) : undefined;
}

function clampMana(m: number): number {
  return Math.max(0, Math.min(MANA_MAX, m));
}

/** Опыт герою и в итоги дня. */
function grantXp(s: State, day: DayKey, xp: number): void {
  if (!xp) return;
  s.hero.xp += xp;
  logOf(s, day).xp += xp;
}

// ---------- время ----------

/** Начисляет время и ману с прошлого раза до now и переводит день, если он сменился. */
export function settle(s: State, now: number): void {
  const from = s.settledAt;
  if (now > from) {
    const cur = s.current;
    if (cur && cur.runningSince !== null) {
      const stopAt = cur.seenAt + FORGOTTEN_AFTER;
      const until = Math.min(now, stopAt);
      const start = Math.max(from, cur.runningSince);
      if (until > start) accrueWork(s, cur.taskId, until - start, start);
      if (until - cur.runningSince >= SPARK_AFTER) spark(s, cur.taskId, cur.runningSince + SPARK_AFTER);
      if (now >= stopAt) {
        cur.runningSince = null;
        cur.idleSince = stopAt;
      }
    } else if (s.breakSince !== null) {
      const start = Math.max(from, s.breakSince);
      const dt = now - start;
      s.hero.mana = clampMana(s.hero.mana + (MANA_REST_PER_HOUR * dt) / HOUR);
      logOf(s, dayKey(start)).restMs += dt;
    }
    s.settledAt = now;
  }
  const today = dayKey(now);
  if (today !== s.day) rollover(s, today);
}

/** Работа у огня: время в задачу, мана вниз, а каждые 15 минут работы уголёк опыта. */
function accrueWork(s: State, taskId: string, dt: number, at: number): void {
  const t = findTask(s, taskId);
  if (t) {
    const before = Math.floor(t.spentMs / EMBER_EVERY);
    t.spentMs += dt;
    grantXp(s, dayKey(at), (Math.floor(t.spentMs / EMBER_EVERY) - before) * EMBER_XP);
  }
  s.hero.mana = clampMana(s.hero.mana - (MANA_DRAIN_PER_HOUR * dt) / HOUR);
  logOf(s, dayKey(at)).workedMs += dt;
}

/** Искра: две минуты у огня подряд, и за старт уже есть опыт. Раз в день за задачу. */
function spark(s: State, taskId: string, at: number): void {
  const t = findTask(s, taskId);
  const day = dayKey(at);
  if (!t || t.status !== 'open' || t.sparkDay === day) return;
  t.sparkDay = day;
  grantXp(s, day, SPARK_XP);
}

/** Сколько угольков у задачи: по одному за каждые 15 минут у огня. */
export function embersOf(t: Task, spentMs: number = t.spentMs): number {
  return Math.floor(spentMs / EMBER_EVERY);
}

/**
 * Новый день: силы полны, план заново. Незакрытый вчера день переносит задачи сам,
 * повторяющиеся задачи встают в план сами.
 */
function rollover(s: State, today: DayKey): void {
  // Долго не заходили: герой отдохнул. Бонус один и тот же, сколько бы ни длился перерыв.
  if (s.touchedAt !== null && daysBetween(dayKey(s.touchedAt), today) >= RESTED_AFTER_DAYS) {
    s.rested = { day: today, left: RESTED_TASKS };
  } else if (s.rested && s.rested.day !== today) {
    delete s.rested;
  }
  for (const t of s.tasks) {
    if (t.status === 'open' && t.day !== null && t.day < today) t.day = today;
  }
  s.day = today;
  s.hero.mana = MANA_MAX;
  s.litDay = null;
  s.closedDay = null;
  s.breakSince = null;
  s.lastQuestId = null;
  if (s.current) {
    s.current.runningSince = null;
    s.current.idleSince = null;
  }
  planRoutines(s);
}

/** Игрок заглянул в приложение: защита от забытого таймера отодвигается. */
export function touch(s: State, now: number): void {
  if (s.current && s.current.runningSince !== null) s.current.seenAt = now;
}

// ---------- сферы и проекты ----------

/**
 * Старое сохранение (формат 2) переходит к сферам. Бесконечные походы по умолчанию («Работа»,
 * «Личное», «Дом и быт») и походы с именем сферы из колеса становятся сферами на месте, с тем же id,
 * поэтому их задачи никуда не переезжают. Недостающие сферы колеса добавляются. Остальные походы
 * становятся проектами: рабочий в сфере «Работа», личный в «Личном», если оно было, иначе сам по себе.
 * Результат зависит только от сохранения, так что два устройства переходят одинаково.
 */
export function migrateToSpheres(s: State): void {
  const norm = (x: string) => x.trim().toLowerCase().replace(/ё/g, 'е');
  const names = new Set([...DEFAULT_SPHERES.map((d) => norm(d.name)), 'личное']);
  for (const q of s.quests) if (!q.wonAt && names.has(norm(q.name)) && !s.quests.some((o) => o.sphere && norm(o.name) === norm(q.name))) q.sphere = true;
  for (const d of DEFAULT_SPHERES) {
    if (!s.quests.some((q) => q.sphere && norm(q.name) === norm(d.name))) s.quests.push({ ...d, sphere: true, createdAt: s.createdAt });
  }
  const spheres = s.quests.filter((q) => q.sphere);
  const work = spheres.find((q) => norm(q.name) === 'работа');
  const personal = spheres.find((q) => norm(q.name) === 'личное');
  for (const q of s.quests) {
    if (q.sphere) continue;
    q.sphereId = q.kind === 'work' ? work?.id ?? null : q.kind === 'personal' ? personal?.id ?? null : null;
  }
  s.quests = [...spheres, ...s.quests.filter((q) => !q.sphere)];
}

export function spheresOf(s: State): Quest[] {
  return s.quests.filter((q) => q.sphere);
}

/** Проекты сферы (null: проекты сами по себе). Завершённые не входят, если не попросить. */
export function projectsOf(s: State, sphereId: string | null, won = false): Quest[] {
  return s.quests.filter((q) => !q.sphere && (findSphere(s, q.sphereId ?? null)?.id ?? null) === sphereId && !!q.wonAt === won);
}

/**
 * Куда можно положить задачу, в порядке экрана: каждая сфера и следом её проекты, потом проекты
 * без сферы. Завершённые проекты не предлагаются, кроме keep (там задача уже лежит).
 */
export function pickableQuests(s: State, keep?: string | null): Quest[] {
  const out: Quest[] = [];
  const add = (list: Quest[]) => {
    for (const q of list) if (!q.wonAt || q.id === keep) out.push(q);
  };
  for (const sp of spheresOf(s)) {
    out.push(sp);
    add([...projectsOf(s, sp.id), ...projectsOf(s, sp.id, true)]);
  }
  add([...projectsOf(s, null), ...projectsOf(s, null, true)]);
  return out;
}

function findSphere(s: State, id: string | null): Quest | undefined {
  const q = findQuest(s, id);
  return q?.sphere ? q : undefined;
}

/** Сфера, к которой относится задача: сама сфера или сфера её проекта. */
export function sphereOf(s: State, questId: string | null): Quest | undefined {
  const q = findQuest(s, questId);
  if (!q) return undefined;
  return q.sphere ? q : findSphere(s, q.sphereId ?? null);
}

/** Когда задача в полной силе: по типу её сферы. Проект без сферы живёт по своему типу, задача без всего в любое время. */
export function kindOf(s: State, questId: string | null): QuestKind {
  const q = findQuest(s, questId);
  if (!q) return 'any';
  return (sphereOf(s, questId) ?? q).kind;
}

export function addQuest(
  s: State,
  now: number,
  q: { name: string; kind: QuestKind; color: QuestColor; sphere?: boolean; sphereId?: string | null },
): string {
  const id = nextId(s, q.sphere ? 's' : 'q');
  const home = q.sphere ? undefined : findSphere(s, q.sphereId ?? null);
  const quest: Quest = { id, name: q.name.trim() || 'Без названия', kind: home?.kind ?? q.kind, color: q.color, createdAt: now };
  if (q.sphere) quest.sphere = true;
  else quest.sphereId = home?.id ?? null;
  // Новая сфера встаёт после остальных сфер, проект в конец.
  const at = q.sphere ? s.quests.filter((x) => x.sphere).length : s.quests.length;
  s.quests.splice(at, 0, quest);
  return id;
}

export function updateQuest(s: State, id: string, patch: Partial<Pick<Quest, 'name' | 'kind' | 'color' | 'sphereId'>>): void {
  const q = findQuest(s, id);
  if (!q) return;
  if (q.sphere) delete patch.sphereId;
  Object.assign(q, patch);
  if (q.sphere) {
    for (const p of s.quests) if (!p.sphere && p.sphereId === q.id) p.kind = q.kind;
    return;
  }
  const home = findSphere(s, q.sphereId ?? null);
  if (home) q.kind = home.kind;
  else q.sphereId = null;
}

/**
 * Прогресс проекта (по-старому логово): сумма уровней его задач и сколько из них ещё не сделано.
 * Повторяющиеся задачи не в счёт: они не кончаются.
 */
export function lairOf(s: State, questId: string): { hp: number; max: number } {
  let hp = 0;
  let max = 0;
  for (const t of s.tasks) {
    if (t.questId !== questId || t.status === 'released' || t.status === 'inbox' || t.routineId) continue;
    max += t.level;
    if (t.status === 'open') hp += t.level;
  }
  return { hp, max };
}

/**
 * Проект завершён: игрок сам решил, что цель достигнута, и проект уходит в зал трофеев.
 * Незаконченные задачи и повторяющиеся задачи переходят в сферу проекта, а если её нет,
 * остаются без сферы, как у убранного проекта. Сферу завершить нельзя.
 */
export function winQuest(s: State, now: number, id: string): boolean {
  const q = findQuest(s, id);
  if (!q || q.wonAt || q.sphere) return false;
  q.wonAt = now;
  moveOut(s, id, findSphere(s, q.sphereId ?? null)?.id ?? null, (t) => t.status === 'open');
  return true;
}

/** Вернуть завершённый проект из зала трофеев. */
export function reopenQuest(s: State, id: string): void {
  const q = findQuest(s, id);
  if (q) delete q.wonAt;
}

/** Задачи и повторяющиеся задачи уходят из сферы или проекта к to. Без нового места открытая задача становится письмом. */
function moveOut(s: State, from: string, to: string | null, which: (t: Task) => boolean = () => true): void {
  for (const r of s.routines) if (r.questId === from) r.questId = to;
  for (const t of s.tasks) {
    if (t.questId !== from || !which(t)) continue;
    t.questId = to;
    if (!to && t.status === 'open' && !(t.routineId && t.day) && !t.period) t.status = 'inbox';
  }
}

/**
 * Убрать сферу или проект. Задачи проекта переходят в его сферу, а без сферы возвращаются письмами
 * к вестнику. Задачи сферы тоже становятся письмами, а её проекты остаются сами по себе.
 * Повторяющиеся задачи приходят как прежде, а уже позванная на день остаётся в плане.
 */
export function removeQuest(s: State, id: string): void {
  const q = findQuest(s, id);
  s.quests = s.quests.filter((x) => x.id !== id);
  if (q?.sphere) {
    for (const p of s.quests) if (p.sphereId === id) p.sphereId = null;
  }
  moveOut(s, id, q && !q.sphere ? findSphere(s, q.sphereId ?? null)?.id ?? null : null);
}

/** Сдвинуть сферу или проект на одно место среди соседей того же рода (dir: -1 выше, 1 ниже). */
export function moveQuest(s: State, id: string, dir: -1 | 1): void {
  const q = findQuest(s, id);
  if (!q) return;
  const same = s.quests.filter((x) => !!x.sphere === !!q.sphere && (q.sphere || (x.sphereId ?? null) === (q.sphereId ?? null)) && !!x.wonAt === !!q.wonAt);
  const other = same[same.indexOf(q) + dir];
  if (!other) return;
  const i = s.quests.indexOf(q);
  const j = s.quests.indexOf(other);
  [s.quests[i], s.quests[j]] = [s.quests[j], s.quests[i]];
}

// ---------- колесо баланса ----------

/** Оценить сферы сегодня. Баллы приводятся к целым от 1 до 10, чужие id отбрасываются. Вторая оценка за день заменяет первую. */
export function rateSpheres(s: State, now: number, scores: Record<string, number>): void {
  const clean: Record<string, number> = {};
  for (const q of spheresOf(s)) {
    const v = scores[q.id];
    if (typeof v === 'number' && Number.isFinite(v)) clean[q.id] = Math.max(SCORE_MIN, Math.min(SCORE_MAX, Math.round(v)));
  }
  if (Object.keys(clean).length === 0) return;
  s.ratings = s.ratings.filter((r) => r.id !== s.day);
  s.ratings.push({ id: s.day, at: now, scores: clean });
  s.ratings.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/**
 * Заметка «Как улучшить» у сферы: что сделать, чтобы сфера стала лучше. Пробелы по краям срезаются,
 * текст длиннее IMPROVE_MAX обрезается, пустой убирает поле. У проекта заметки нет.
 */
export function setImprove(s: State, id: string, text: string): void {
  const q = findQuest(s, id);
  if (!q?.sphere) return;
  const clean = text.replace(/\r\n?/g, '\n').trim().slice(0, IMPROVE_MAX).trimEnd();
  if (clean) q.improve = clean;
  else delete q.improve;
}

/** Последняя оценка и та, что была перед ней (до before, если задан день). */
export function lastRating(s: State, before?: DayKey): Rating | undefined {
  const list = before ? s.ratings.filter((r) => r.id < before) : s.ratings;
  return list[list.length - 1];
}

/** Пора напомнить оценить сферы: по настройке, считая от прошлой оценки, а в новой игре через несколько дней. */
export function ratingDue(s: State): boolean {
  const every = s.settings.rateEvery ?? 'month';
  if (every === 'never' || spheresOf(s).length === 0) return false;
  const last = lastRating(s);
  if (!last) return daysBetween(dayKey(s.createdAt), s.day) >= RATE_FIRST_AFTER_DAYS;
  return daysBetween(last.id, s.day) >= RATE_EVERY_DAYS[every];
}

// ---------- задачи ----------

export interface TaskInput {
  title: string;
  questId: string | null;
  level?: Level;
  estimateMin?: number | null;
  day?: DayKey | null;
  due?: DayKey | null;
  at?: string | null;
  /** Горизонт задачи (period.ts), null или нет поля: без горизонта. */
  period?: PeriodKey | null;
  /** План «если — то»; пустой не сохраняется. */
  cue?: string | null;
}

export function addTask(s: State, now: number, input: TaskInput): string {
  const id = nextId(s, 't');
  const estimateMin = input.estimateMin ?? null;
  const level = input.level ?? (estimateMin !== null ? levelForEstimate(estimateMin) : 1);
  const day = input.day ?? null;
  const t: Task = {
    id,
    title: input.title.trim() || 'Без названия',
    questId: input.questId,
    level,
    estimateMin,
    status: input.questId || day || input.period ? 'open' : 'inbox',
    day,
    order: day ? nextOrder(s, day) : 0,
    due: input.due ?? null,
    at: input.at ?? null,
    spentMs: 0,
    createdAt: now,
  };
  if (input.period) t.period = input.period;
  if (input.cue?.trim()) t.cue = input.cue.trim();
  s.tasks.push(t);
  return id;
}

/** Правка задачи. period: null снимает горизонт. */
export function updateTask(
  s: State,
  id: string,
  patch: Partial<Omit<Task, 'id' | 'status' | 'spentMs' | 'period' | 'cue'>> & { period?: PeriodKey | null; cue?: string | null },
): void {
  const t = findTask(s, id);
  if (!t) return;
  if (patch.day !== undefined && patch.day !== t.day && patch.day !== null) {
    t.order = nextOrder(s, patch.day);
    delete t.leftDay;
  }
  const { period, cue, ...rest } = patch;
  Object.assign(t, rest);
  if (cue !== undefined) setCue(t, cue);
  if (period !== undefined) setPeriod(s, id, period);
  if (t.status === 'inbox' && (t.questId || t.period)) t.status = 'open';
}

/** План «если — то» задачи или повторяющейся: пустой убирается. */
function setCue(x: { cue?: string }, cue: string | null): void {
  const c = cue?.trim();
  if (c) x.cue = c;
  else delete x.cue;
}

/** Поставить задаче горизонт или снять его. Письмо с горизонтом встаёт в отряд. */
export function setPeriod(s: State, id: string, period: PeriodKey | null): void {
  const t = findTask(s, id);
  if (!t) return;
  if (period && periodKind(period)) {
    t.period = period;
    if (t.status === 'inbox') t.status = 'open';
  } else {
    delete t.period;
    if (t.status === 'open' && !t.questId && !t.day && !t.routineId) t.status = 'inbox';
  }
}

function nextOrder(s: State, day: DayKey): number {
  let max = 0;
  for (const t of s.tasks) if (t.day === day && t.order > max) max = t.order;
  return max + 1;
}

/** Позвать в план на день (по умолчанию сегодня) или убрать из плана. */
export function planTask(s: State, id: string, day: DayKey | null): void {
  const t = findTask(s, id);
  if (!t || t.status === 'done' || t.status === 'released') return;
  if (day === null) {
    t.day = null;
    if (s.current?.taskId === id) s.current = null;
    return;
  }
  if (t.day !== day) {
    t.day = day;
    t.order = nextOrder(s, day);
  }
  delete t.leftDay;
  if (t.status === 'inbox') t.status = 'open';
}

// ---------- повторяющиеся задачи ----------

export interface RoutineInput {
  title: string;
  questId: string | null;
  level: Level;
  estimateMin: number | null;
  at: string | null;
  cue?: string | null;
  repeat: Repeat;
}

export function findRoutine(s: State, id: string | null | undefined): Routine | undefined {
  return id ? s.routines.find((r) => r.id === id) : undefined;
}

/** Задача, которую повторяющаяся прислала и которая ещё не сделана: такая всегда одна. */
export function waitingOf(s: State, routineId: string): Task | undefined {
  return s.tasks.find((t) => t.routineId === routineId && (t.status === 'open' || t.status === 'inbox'));
}

/**
 * Новая повторяющаяся задача. fromTaskId: обычная задача становится повторяющейся и сама
 * считается её первым приходом. Если сегодня её день, она сразу встаёт в план.
 */
export function addRoutine(s: State, now: number, input: RoutineInput, fromTaskId?: string): string {
  const id = nextId(s, 'r');
  const { cue, ...rest } = input;
  const r: Routine = { id, ...rest, title: input.title.trim() || 'Без названия', repeat: { ...input.repeat }, createdAt: now };
  setCue(r, cue ?? null);
  s.routines.push(r);
  const t = fromTaskId ? findTask(s, fromTaskId) : undefined;
  if (t && (t.status === 'open' || t.status === 'inbox')) {
    t.routineId = id;
    t.due = null;
  }
  planRoutines(s, id);
  return id;
}

/** Правка повторяющейся: ждущая в отряде задача меняется вместе с ней. */
export function updateRoutine(s: State, id: string, input: RoutineInput): void {
  const r = findRoutine(s, id);
  if (!r) return;
  const moved = JSON.stringify(r.repeat) !== JSON.stringify(input.repeat);
  const { cue, ...rest } = input;
  Object.assign(r, rest, { title: input.title.trim() || r.title, repeat: { ...input.repeat } });
  if (cue !== undefined) setCue(r, cue);
  const t = waitingOf(s, id);
  if (t) {
    Object.assign(t, { title: r.title, questId: r.questId, level: r.level, estimateMin: r.estimateMin, at: r.at });
    setCue(t, r.cue ?? null);
    if (t.status === 'inbox' && t.questId) t.status = 'open';
  }
  if (moved) planRoutines(s, id);
}

/** Новое время повторяющейся задачи: ждущая в отряде задача переезжает вместе с ней. Возвращает прежнее время. */
export function setRoutineAt(s: State, id: string, at: string | null): string | null | undefined {
  const r = findRoutine(s, id);
  if (!r) return undefined;
  const was = r.at;
  r.at = at;
  const t = waitingOf(s, id);
  if (t) t.at = at;
  return was;
}

/** Больше не повторять. Ждущая задача остаётся в отряде обычной задачей. */
export function stopRoutine(s: State, id: string): void {
  s.routines = s.routines.filter((r) => r.id !== id);
  const t = waitingOf(s, id);
  if (t) delete t.routineId;
}

/**
 * Повторяющиеся задачи, которым сегодня пора, встают в план. Если прошлая ещё не сделана,
 * в план зовётся она, а новая не приходит. Сделанная или отпущенная сегодня второй раз
 * за день не приходит. Id пришедшей задачи складывается из id повторяющейся и дня, поэтому
 * телефон и компьютер, разбудившие её каждый у себя, получают одну и ту же задачу.
 */
export function planRoutines(s: State, only?: string): void {
  if (s.closedDay === s.day) return;
  const dayStart = parseDay(s.day).getTime() + DAY_STARTS_AT_HOUR * HOUR;
  for (const r of s.routines) {
    if ((only && r.id !== only) || !repeatsOn(r.repeat, s.day)) continue;
    const waiting = waitingOf(s, r.id);
    if (waiting) {
      if (waiting.day !== s.day) planTask(s, waiting.id, s.day);
      continue;
    }
    const id = `${r.id}@${s.day}`;
    if (findTask(s, id)) continue;
    s.tasks.push({
      id,
      title: r.title,
      questId: r.questId,
      level: r.level,
      estimateMin: r.estimateMin,
      status: 'open',
      day: s.day,
      order: nextOrder(s, s.day),
      due: null,
      at: r.at,
      spentMs: 0,
      createdAt: Math.max(dayStart, r.createdAt),
      routineId: r.id,
      ...(r.cue ? { cue: r.cue } : {}),
    });
  }
}

/**
 * После слияния двух версий: у повторяющейся снова одна ждущая задача (лишние уходят,
 * их время достаётся оставшейся), а задача, чьей повторяющейся больше нет, становится обычной.
 */
export function tidyRoutines(s: State): void {
  const kept = new Map<string, Task>();
  const drop = new Set<Task>();
  const weight = (t: Task) => (s.current?.taskId === t.id ? 2 : 0) + (t.day === s.day ? 1 : 0);
  for (const t of s.tasks) {
    if (!t.routineId || (t.status !== 'open' && t.status !== 'inbox')) continue;
    if (!findRoutine(s, t.routineId)) {
      delete t.routineId;
      continue;
    }
    const k = kept.get(t.routineId);
    if (!k) {
      kept.set(t.routineId, t);
      continue;
    }
    const [stay, go] = weight(t) > weight(k) ? [t, k] : [k, t];
    stay.spentMs += go.spentMs;
    kept.set(t.routineId, stay);
    drop.add(go);
  }
  if (drop.size === 0) return;
  s.tasks = s.tasks.filter((t) => !drop.has(t));
  if (s.current && !findTask(s, s.current.taskId)) s.current = null;
}

/**
 * Поменять местами две задачи одного дня. Кнопки «выше» и «ниже» меняют задачу с соседом, которого видно в списке:
 * сделанные и вечерние задачи между ними не мешают.
 */
export function swapInPlan(s: State, a: string, b: string): void {
  const x = findTask(s, a);
  const y = findTask(s, b);
  if (!x || !y || x === y || !x.day || x.day !== y.day) return;
  [x.order, y.order] = [y.order, x.order];
}

/** Сфера задачи, а у проекта без сферы сам проект: переход между ними и есть смена дела. */
function rootOf(s: State, questId: string | null): string | null {
  return sphereOf(s, questId)?.id ?? questId;
}

/** Сколько маны стоит позвать задачу к огню: задача из другой сферы стоит SWITCH_COST, из той же сферы и её проектов ничего. */
export function switchCostOf(s: State, t: Task): number {
  if (s.lastQuestId === null || s.current?.taskId === t.id) return 0;
  return rootOf(s, t.questId) !== rootOf(s, s.lastQuestId) ? SWITCH_COST : 0;
}

/** Позвать к огню: таймер задачи пошёл. Задача из другой сферы стоит маны. */
export function start(s: State, now: number, id: string): { switchCost: number } {
  settle(s, now);
  const t = findTask(s, id);
  if (!t || t.status === 'done' || t.status === 'released') return { switchCost: 0 };
  if (t.status === 'inbox') t.status = 'open';
  if (t.day !== s.day) planTask(s, id, s.day);
  s.breakSince = null;
  const switchCost = switchCostOf(s, t);
  if (switchCost) s.hero.mana = clampMana(s.hero.mana - switchCost);
  s.lastQuestId = rootOf(s, t.questId);
  s.current = { taskId: id, runningSince: now, seenAt: now, idleSince: null };
  return { switchCost };
}

/**
 * Задача начата и ждёт, когда к ней вернутся: у неё уже набралось время, она не сделана и сейчас не у огня.
 * Её можно позвать снова, и таймер продолжит с того же места.
 */
export function isStarted(s: State, t: Task): boolean {
  return t.status === 'open' && s.current?.taskId !== t.id && t.spentMs >= STARTED_AFTER;
}

/**
 * Новая длительность задачи в минутах. Уровень и уже отданное время не меняются: таймер у огня
 * идёт дальше, меняется только «из ~…». Длительность, равная обычной для уровня, хранится пустой.
 */
export function setEstimate(s: State, id: string, min: number): void {
  const t = findTask(s, id);
  if (!t || t.status === 'done' || t.status === 'released' || !Number.isFinite(min)) return;
  const m = Math.min(ESTIMATE_MAX_MIN, Math.max(1, Math.round(min)));
  t.estimateMin = m === ESTIMATE_BY_LEVEL[t.level] ? null : m;
}

/** «Нужно ещё столько минут»: длительность становится уже отданным временем плюс add. */
export function moreTime(s: State, now: number, id: string, add: number): void {
  const t = findTask(s, id);
  if (!t) return;
  setEstimate(s, id, Math.round(spentNow(s, t, now) / MINUTE) + add);
}

/** Таймер стоит, задача остаётся у огня. */
export function pause(s: State, now: number): void {
  settle(s, now);
  if (s.current) s.current.runningSince = null;
}

export function resume(s: State, now: number): void {
  settle(s, now);
  if (!s.current) return;
  s.breakSince = null;
  s.current.runningSince = now;
  s.current.seenAt = now;
  s.current.idleSince = null;
}

/** Привал: отряд садится к огню, таймер стоит, мана растёт. Повторный вызов снимает лагерь. */
export function toggleBreak(s: State, now: number): void {
  settle(s, now);
  if (s.breakSince !== null) {
    s.breakSince = null;
    if (s.current) {
      s.current.runningSince = now;
      s.current.seenAt = now;
      s.current.idleSince = null;
    }
    return;
  }
  if (s.current) s.current.runningSince = null;
  s.breakSince = now;
}

/** Таймер встал сам, игрок говорит, что всё это время работал. */
export function confirmWorking(s: State, now: number): void {
  settle(s, now);
  const cur = s.current;
  if (!cur || cur.idleSince === null) return;
  accrueWork(s, cur.taskId, now - cur.idleSince, cur.idleSince);
  cur.idleSince = null;
  cur.runningSince = now;
  cur.seenAt = now;
}

/** Таймер встал сам, игрок не работал: оставляем как есть. */
export function dismissIdle(s: State): void {
  if (s.current) s.current.idleSince = null;
}

export function rewardFor(t: Task, level: Level): Reward {
  return { gold: GOLD_PER_LEVEL * level, xp: XP_BY_LEVEL[level], damage: t.routineId ? 0 : level };
}

export interface CompleteResult {
  reward: Reward;
  lair: { before: number; after: number; max: number } | null;
  undead: boolean;
}

/** Готово: золото в сундук, опыт герою, урон логову. Уровень можно поправить тут же. */
export function complete(s: State, now: number, id: string, level?: Level): CompleteResult | null {
  settle(s, now);
  const t = findTask(s, id);
  if (!t || t.status === 'done' || t.status === 'released') return null;
  if (level) t.level = level;
  if (t.status === 'inbox') t.status = 'open';
  const project = findQuest(s, t.questId);
  const lairBefore = project && !project.sphere && !t.routineId ? lairOf(s, project.id) : null;
  const undead = isUndead(t, s.day);
  const reward = rewardFor(t, t.level);
  const base = reward.xp;
  if (undead) {
    reward.undead = true;
    reward.undeadXp = Math.round(base * UNDEAD_XP_BONUS[undeadRank(daysOverdue(t, s.day))]);
    reward.xp += reward.undeadXp;
  }
  if (restedLeft(s) > 0) {
    s.rested!.left -= 1;
    reward.restedXp = Math.round(base * RESTED_XP_BONUS);
    reward.xp += reward.restedXp;
  }
  t.status = 'done';
  t.doneAt = now;
  t.doneDay = s.day;
  t.reward = reward;
  if (!t.day) t.day = s.day;
  s.hero.gold += reward.gold;
  s.hero.xp += reward.xp;
  const l = logOf(s, s.day);
  l.gold += reward.gold;
  l.xp += reward.xp;
  l.done += 1;
  if (undead) l.undeadSlain += 1;
  if (s.current?.taskId === id) s.current = null;
  const lairAfter = lairBefore && t.questId ? lairOf(s, t.questId) : null;
  return {
    reward,
    lair: lairBefore && lairAfter ? { before: lairBefore.hp, after: lairAfter.hp, max: lairAfter.max } : null,
    undead,
  };
}

/**
 * Отпустить: задача уходит без штрафа. Её можно вернуть (unrelease). Отпустить нежить тоже
 * решение, за него немного опыта: так разобраться с долгом всегда выгоднее, чем его обходить.
 * Возвращает, сколько опыта дали.
 */
export function release(s: State, now: number, id: string): number {
  settle(s, now);
  const t = findTask(s, id);
  if (!t || t.status === 'done' || t.status === 'released') return 0;
  const xp = isUndead(t, s.day) ? MERCY_XP : 0;
  t.releasedFrom = t.status;
  t.releasedAt = now;
  t.status = 'released';
  if (xp) {
    t.releasedXp = xp;
    grantXp(s, s.day, xp);
  }
  if (s.current?.taskId === id) s.current = null;
  return xp;
}

/**
 * Перенести срок нежити: она уходит с дороги и ждёт в отряде до нового срока (null: без срока).
 * Это тоже разбор долга, за него немного опыта. Возвращает, сколько опыта дали.
 */
export function postpone(s: State, now: number, id: string, due: DayKey | null): number {
  settle(s, now);
  const t = findTask(s, id);
  if (!t || t.status !== 'open') return 0;
  const xp = isUndead(t, s.day) ? MERCY_XP : 0;
  t.due = due;
  grantXp(s, s.day, xp);
  return xp;
}

/** Покой нежити одним касанием: сроки у всей нежити снимаются, задачи ждут в отряде. Возвращает прежние сроки для «Вернуть». */
export function amnesty(s: State, now: number): { id: string; due: DayKey }[] {
  settle(s, now);
  const was = undeadOf(s).map((t) => ({ id: t.id, due: t.due! }));
  for (const { id } of was) findTask(s, id)!.due = null;
  return was;
}

/** Вернуть сроки, снятые покоем. */
export function restoreDues(s: State, was: { id: string; due: DayKey }[]): void {
  for (const { id, due } of was) {
    const t = findTask(s, id);
    if (t && t.status === 'open' && t.due === null) t.due = due;
  }
}

/** Сколько ещё дел сегодня дадут бонус отдохнувшего героя. */
export function restedLeft(s: State): number {
  return s.rested && s.rested.day === s.day ? Math.max(0, s.rested.left) : 0;
}

/**
 * Вернуть отпущенную задачу туда, откуда её отпустили. Если её звали на уже прошедший день,
 * она ждёт в отряде.
 */
export function unrelease(s: State, id: string): void {
  const t = findTask(s, id);
  if (!t || t.status !== 'released') return;
  t.status = t.releasedFrom ?? 'open';
  if (t.releasedXp) grantXp(s, dayKey(t.releasedAt ?? s.settledAt), -t.releasedXp);
  delete t.releasedFrom;
  delete t.releasedAt;
  delete t.releasedXp;
  if (t.day && t.day < s.day) t.day = null;
  if (!t.questId && !t.day && !t.period) t.status = 'inbox';
}

/** Отпущенные задачи, недавние сверху. */
export function releasedOf(s: State): Task[] {
  return s.tasks.filter((t) => t.status === 'released').sort((a, b) => (b.releasedAt ?? b.createdAt) - (a.releasedAt ?? a.createdAt));
}

/** Вернуть сделанную задачу назад (если нажал «Готово» по ошибке). */
export function undoComplete(s: State, id: string): void {
  const t = findTask(s, id);
  if (!t || t.status !== 'done' || !t.reward || !t.doneDay) return;
  s.hero.gold -= t.reward.gold;
  s.hero.xp -= t.reward.xp;
  const l = logOf(s, t.doneDay);
  l.gold -= t.reward.gold;
  l.xp -= t.reward.xp;
  l.done -= 1;
  if (t.reward.undead) l.undeadSlain = Math.max(0, l.undeadSlain - 1);
  if (t.reward.restedXp && s.rested && s.rested.day === t.doneDay) s.rested.left = Math.min(RESTED_TASKS, s.rested.left + 1);
  t.status = 'open';
  delete t.doneAt;
  delete t.doneDay;
  delete t.reward;
}

/** Разжечь костёр: план дня утверждён, за него даётся немного опыта. */
export function lightFire(s: State, now: number): number {
  settle(s, now);
  if (s.litDay === s.day) return 0;
  const n = s.tasks.filter((t) => t.day === s.day && t.status === 'open').length;
  const xp = planXp(n);
  s.hero.xp += xp;
  logOf(s, s.day).xp += xp;
  s.litDay = s.day;
  return xp;
}

/**
 * Вчерашние дела: что последний отбой вернул из плана в отряд и что с тех пор никуда не позвали.
 * Нежить сюда не входит, она ждёт на дороге.
 */
export function leftoversOf(s: State): Task[] {
  let last = '';
  for (const t of s.tasks) if (t.leftDay && t.leftDay > last) last = t.leftDay;
  if (!last) return [];
  return s.tasks
    .filter((t) => t.status === 'open' && t.day === null && t.leftDay === last && !isUndead(t, s.day))
    .sort((a, b) => a.createdAt - b.createdAt);
}

/** Быстрый сбор: вчерашние дела снова у костра, и костёр сразу горит. Возвращает, сколько позвали и сколько опыта за план. */
export function quickGather(s: State, now: number): { added: number; xp: number } {
  settle(s, now);
  const back = leftoversOf(s);
  for (const t of back) planTask(s, t.id, s.day);
  return { added: back.length, xp: lightFire(s, now) };
}

export function canSecondWind(s: State, now: number): boolean {
  if (s.secondWindDay === s.day) return false;
  const shift = shiftAt(now, s.settings);
  if (shift !== 'evening' && shift !== 'weekend') return false;
  return (s.log[s.day]?.workedMs ?? 0) > 0;
}

export function secondWind(s: State, now: number): boolean {
  settle(s, now);
  if (!canSecondWind(s, now)) return false;
  s.hero.mana = clampMana(s.hero.mana + SECOND_WIND);
  s.secondWindDay = s.day;
  return true;
}

/** Отбой: отмеченные задачи остаются у огня на завтра, остальные возвращаются в отряд. */
export function endDay(s: State, now: number, keepIds: string[]): void {
  settle(s, now);
  const keep = new Set(keepIds);
  const tomorrow = addDays(s.day, 1);
  for (const t of s.tasks) {
    if (t.status !== 'open' || t.day !== s.day) continue;
    if (keep.has(t.id)) {
      t.day = tomorrow;
      t.order = nextOrder(s, tomorrow);
    } else {
      t.day = null;
      t.leftDay = s.day;
    }
  }
  s.current = null;
  s.breakSince = null;
  s.closedDay = s.day;
}

export function reopenDay(s: State): void {
  s.closedDay = null;
}

// ---------- выборки ----------

export function isUndead(t: Task, today: DayKey): boolean {
  return t.status === 'open' && t.due !== null && t.due < today;
}

export function daysOverdue(t: Task, today: DayKey): number {
  return t.due ? daysBetween(t.due, today) : 0;
}

/** Нежить на дороге: старшая (самая давняя просрочка) первой. */
export function undeadOf(s: State): Task[] {
  return s.tasks
    .filter((t) => isUndead(t, s.day))
    .sort((a, b) => (a.due! < b.due! ? -1 : a.due! > b.due! ? 1 : a.createdAt - b.createdAt));
}

export function inboxOf(s: State): Task[] {
  return s.tasks.filter((t) => t.status === 'inbox').sort((a, b) => a.createdAt - b.createdAt);
}

export function planOf(s: State, day: DayKey = s.day): Task[] {
  return s.tasks
    .filter((t) => t.day === day && (t.status === 'open' || (t.status === 'done' && t.doneDay === day)))
    .sort((a, b) => a.order - b.order);
}

/** Задачи в отряде, но не на сегодня: из них собирают план. */
export function backlogOf(s: State): Task[] {
  return s.tasks
    .filter((t) => t.status === 'open' && t.day !== s.day)
    .sort((a, b) => (a.due ?? '9999').localeCompare(b.due ?? '9999') || a.createdAt - b.createdAt);
}

// ---------- горизонты ----------

/** Задачи периода: в отряде и сделанные. Сначала незакрытые со сроком, потом без, сделанные в конце. */
export function periodTasks(s: State, key: PeriodKey): Task[] {
  return s.tasks.filter((t) => t.period === key && (t.status === 'open' || t.status === 'done')).sort(byPeriodOrder);
}

/** Задачи меньших периодов внутри этого: недели месяца, месяцы и недели квартала и так далее. */
export function nestedTasks(s: State, key: PeriodKey): Task[] {
  return s.tasks.filter((t) => t.period && t.period !== key && within(t.period, key) && (t.status === 'open' || t.status === 'done')).sort(byPeriodOrder);
}

function byPeriodOrder(a: Task, b: Task): number {
  const done = Number(a.status === 'done') - Number(b.status === 'done');
  if (done) return done;
  return (a.period ?? '').localeCompare(b.period ?? '') || (a.due ?? '9999').localeCompare(b.due ?? '9999') || a.createdAt - b.createdAt;
}

/** Хвосты: незакрытые задачи периодов, которые уже кончились. Давние первыми. */
export function tailsOf(s: State): Task[] {
  return s.tasks
    .filter((t) => t.status === 'open' && t.period && periodKind(t.period) && isPast(t.period, s.day))
    .sort((a, b) => a.period!.localeCompare(b.period!) || a.createdAt - b.createdAt);
}

/** Куда можно перенести хвост: в нынешний период того же вида или в нынешний побольше. */
export function tailTargets(s: State, t: Task): { same: PeriodKey; bigger: PeriodKey | null } {
  const kind = periodKind(t.period ?? '') ?? 'week';
  const big = BIGGER[kind];
  return { same: periodOf(kind, s.day), bigger: big ? periodOf(big, s.day) : null };
}

export function doneOn(s: State, day: DayKey): Task[] {
  return s.tasks.filter((t) => t.status === 'done' && t.doneDay === day).sort((a, b) => (a.doneAt ?? 0) - (b.doneAt ?? 0));
}

/** Время задачи вместе с идущим сейчас отрезком. */
export function spentNow(s: State, t: Task, now: number): number {
  const cur = s.current;
  if (cur && cur.taskId === t.id && cur.runningSince !== null) {
    const stopAt = cur.seenAt + FORGOTTEN_AFTER;
    return t.spentMs + Math.max(0, Math.min(now, stopAt) - Math.max(s.settledAt, cur.runningSince));
  }
  return t.spentMs;
}
