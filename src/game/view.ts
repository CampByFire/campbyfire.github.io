// Что показывает экран дня: чистая функция «состояние → лагерь».
import { questHex } from './color';
import { ROAD_SPOTS, SEATS, undeadRank, type UndeadRank } from './rules';
import { findQuest, inboxOf, isUndead, planOf, daysOverdue, undeadOf } from './state';
import { addDays, isMainFor, lightOf, shiftAt, type Light, type Shift } from './time';
import type { State, Task } from './types';
import { CLASS_BY_LEVEL, type ClassId } from './words';

export type Tone = 'today' | 'evening' | 'undead' | 'current';
export type Pose = 'sit' | 'work' | 'cheer' | 'lie';

export interface SeatFigure {
  seat: number;
  task: Task;
  cls: ClassId;
  pose: Pose;
  tone: Tone;
}

export interface RoadFigure {
  spot: number;
  task: Task;
  rank: UndeadRank;
  days: number;
}

export interface CampView {
  shift: Shift;
  light: Light;
  /** Прозвучал отбой: отряд спит. */
  asleep: boolean;
  /** Пора подводить итоги: последние полчаса до отбоя. */
  summaryDue: boolean;
  onBreak: boolean;
  current: Task | null;
  running: boolean;
  idle: boolean;
  numbers: Map<string, number>;
  tones: Map<string, Tone>;
  /** Цвет знамени похода у задач с номером: в него красится номер над спутником и в списках. У задачи без похода номер прежний, золотой. */
  colors: Map<string, string>;
  /** Открытые задачи дня без текущей, в порядке плана. */
  main: Task[];
  /** Задачи на вечер, пока идёт рабочий день. */
  later: Task[];
  doneToday: number;
  undead: Task[];
  inbox: number;
  ring: { task: Task; cls: ClassId; pose: Pose } | null;
  seats: SeatFigure[];
  extraSeated: number;
  road: RoadFigure[];
  extraRoad: number;
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Место у костра: своё по задаче, занятое уступает следующему. Спутник не прыгает между тиками. */
export function assignSeats(tasks: Task[], count = SEATS): { seats: Map<string, number>; extra: number } {
  const taken = new Array<boolean>(count).fill(false);
  const seats = new Map<string, number>();
  let extra = 0;
  const byAge = [...tasks].sort((a, b) => a.createdAt - b.createdAt || (a.id < b.id ? -1 : 1));
  for (const t of byAge) {
    if (seats.size >= count) {
      extra++;
      continue;
    }
    let i = hash(t.id) % count;
    while (taken[i]) i = (i + 1) % count;
    taken[i] = true;
    seats.set(t.id, i);
  }
  return { seats, extra };
}

export function campView(s: State, now: number, cheerTaskId: string | null = null): CampView {
  const shift = shiftAt(now, s.settings);
  const asleep = s.closedDay === s.day;
  const light = asleep ? 'night' : lightOf(shift, now, s.settings);
  const plan = planOf(s);
  const undead = undeadOf(s);

  const numbers = new Map<string, number>();
  const colors = new Map<string, string>();
  let n = 0;
  for (const t of plan) numbers.set(t.id, ++n);
  for (const t of undead) if (!numbers.has(t.id)) numbers.set(t.id, ++n);
  for (const t of [...plan, ...undead]) {
    const q = findQuest(s, t.questId);
    if (q) colors.set(t.id, questHex(q.color));
  }

  const cur = s.current ? plan.find((t) => t.id === s.current!.taskId) ?? null : null;
  const open = plan.filter((t) => t.status === 'open' && t.id !== cur?.id);

  const tones = new Map<string, Tone>();
  const main: Task[] = [];
  const later: Task[] = [];
  for (const t of open) {
    const kind = findQuest(s, t.questId)?.kind ?? 'any';
    const isMain = isMainFor(kind, shift);
    tones.set(t.id, isUndead(t, s.day) ? 'undead' : isMain ? 'today' : 'evening');
    (isMain ? main : later).push(t);
  }
  // Вечером сначала личное, потом то, что осталось от работы.
  if (shift === 'evening' || shift === 'weekend' || shift === 'night') {
    const personalFirst = (t: Task) => (findQuest(s, t.questId)?.kind === 'work' ? 1 : 0);
    main.sort((a, b) => personalFirst(a) - personalFirst(b) || a.order - b.order);
  }
  for (const t of undead) if (!tones.has(t.id)) tones.set(t.id, 'undead');
  if (cur) tones.set(cur.id, 'current');

  const onBreak = s.breakSince !== null;
  const running = !!(s.current && s.current.runningSince !== null);
  const sleepy = asleep || light === 'night';

  const cheer = cheerTaskId ? plan.find((t) => t.id === cheerTaskId) ?? null : null;
  let ring: CampView['ring'] = null;
  if (cheer) ring = { task: cheer, cls: CLASS_BY_LEVEL[cheer.level], pose: 'cheer' };
  else if (cur && !asleep) ring = { task: cur, cls: CLASS_BY_LEVEL[cur.level], pose: running ? 'work' : 'sit' };

  // После отбоя у костра спят те, кого оставили на завтра.
  const tomorrow = addDays(s.day, 1);
  const seated = asleep
    ? s.tasks.filter((t) => t.status === 'open' && t.day === tomorrow).sort((a, b) => a.order - b.order)
    : [...main, ...later].filter((t) => !isUndead(t, s.day));
  const { seats: seatMap, extra } = assignSeats(seated);
  const seats: SeatFigure[] = [];
  for (const t of seated) {
    const seat = seatMap.get(t.id);
    if (seat === undefined) continue;
    seats.push({ seat, task: t, cls: CLASS_BY_LEVEL[t.level], pose: sleepy ? 'lie' : 'sit', tone: tones.get(t.id) ?? 'today' });
  }

  const road = undead.slice(0, ROAD_SPOTS).map((t, spot) => {
    const days = daysOverdue(t, s.day);
    return { spot, task: t, rank: undeadRank(days), days };
  });

  return {
    shift,
    light,
    asleep,
    summaryDue: shift === 'night' && !asleep,
    onBreak,
    current: cur,
    running,
    idle: !!(s.current && s.current.idleSince !== null),
    numbers,
    tones,
    colors,
    main,
    later,
    doneToday: plan.filter((t) => t.status === 'done').length,
    undead,
    inbox: inboxOf(s).length,
    ring,
    seats,
    extraSeated: extra,
    road,
    extraRoad: Math.max(0, undead.length - ROAD_SPOTS),
  };
}
