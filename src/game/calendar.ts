// Календарь: встречи и что стоит на каждый день. Встречи живут в State.meetings, а дела берутся
// из задач (день у костра, срок, сделано в этот день) и повторяющихся задач.
import { parsePhrase } from './phrase';
import { EVENT_MIN, MEETING_MIN, estimateOf } from './rules';
import { nextId, waitingOf } from './state';
import { addDays, daysBetween, parseDay, repeatsOn } from './time';
import type { DayKey, Meeting, MeetingRepeat, QuestColor, Routine, State, Task } from './types';

export interface MeetingInput {
  title: string;
  day: DayKey;
  at?: string | null;
  until?: string | null;
  place?: string | null;
  color?: QuestColor | null;
  repeat?: MeetingRepeat | null;
  repeatUntil?: DayKey | null;
}

const TIME = /^([01]?\d|2[0-3]):([0-5]\d)$/;

/** «9:05» → «09:05»; что не похоже на время, даёт null. */
export function cleanTime(at: string | null | undefined): string | null {
  const m = TIME.exec((at ?? '').trim());
  return m ? `${m[1].padStart(2, '0')}:${m[2]}` : null;
}

function fill(m: Meeting, input: MeetingInput): void {
  m.title = input.title.trim() || 'Встреча';
  m.day = input.day;
  m.at = cleanTime(input.at);
  const until = m.at ? cleanTime(input.until) : null;
  if (until && until > m.at!) m.until = until;
  else delete m.until;
  const place = input.place?.trim();
  if (place) m.place = place;
  else delete m.place;
  if (input.color) m.color = input.color;
  else delete m.color;
  if (input.repeat) m.repeat = input.repeat;
  else delete m.repeat;
  if (m.repeat && input.repeatUntil && input.repeatUntil >= m.day) m.repeatUntil = input.repeatUntil;
  else delete m.repeatUntil;
  // Пропуск имеет смысл только для дня серии: иначе, вернув прежний повтор, игрок нашёл бы день пропущенным.
  const skip = m.repeat ? m.skip?.filter((d) => onRule(m, d)) : undefined;
  if (skip?.length) m.skip = skip;
  else delete m.skip;
}

/** В коротком месяце встреча с 31 числа стоит в его последний день, 29 февраля вне високосного года 28-го. */
function sameDayOfMonth(first: Date, d: Date): boolean {
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  return d.getDate() === Math.min(first.getDate(), last);
}

/** Попадает ли день в расписание встречи, пропуски здесь не в счёт. Повтор, которого эта версия не знает, считается одним разом. */
function onRule(m: Meeting, day: DayKey): boolean {
  if (day < m.day) return false;
  if (day === m.day && m.repeat !== 'workday') return true;
  if (m.repeatUntil && day > m.repeatUntil) return false;
  const first = parseDay(m.day);
  const d = parseDay(day);
  switch (m.repeat) {
    case 'day':
      return true;
    case 'workday':
      return d.getDay() >= 1 && d.getDay() <= 5;
    case 'week':
      return daysBetween(m.day, day) % 7 === 0;
    case 'week2':
      return daysBetween(m.day, day) % 14 === 0;
    case 'month':
      return sameDayOfMonth(first, d);
    case 'year':
      return d.getMonth() === first.getMonth() && sameDayOfMonth(first, d);
    default:
      return false;
  }
}

/** Стоит ли встреча в этот день: один раз или как день серии, если он не пропущен. */
export function meetingOccursOn(m: Meeting, day: DayKey): boolean {
  return onRule(m, day) && !m.skip?.includes(day);
}

/** Самое долгое, сколько ищется следующий день серии: годовой повтор, пропущенный несколько лет подряд, всё равно найдётся. */
const SEARCH_DAYS = 366 * 8;

/** Ближайший день встречи, начиная с from; null, если больше не будет. */
export function nextMeetingDay(m: Meeting, from: DayKey): DayKey | null {
  const start = from > m.day ? from : m.day;
  for (let i = 0; i < SEARCH_DAYS; i++) {
    const day = addDays(start, i);
    if (m.repeatUntil && day > m.repeatUntil) return null;
    if (meetingOccursOn(m, day)) return day;
    if (!m.repeat) return null;
  }
  return null;
}

/** Пропустить один день серии: остальные остаются как были. */
export function skipMeetingDay(s: State, id: string, day: DayKey): void {
  const m = findMeeting(s, id);
  if (!m || !m.repeat || !onRule(m, day) || m.skip?.includes(day)) return;
  (m.skip ??= []).push(day);
  m.skip.sort();
}

/** Вернуть пропущенный день серии. */
export function unskipMeetingDay(s: State, id: string, day: DayKey): void {
  const m = findMeeting(s, id);
  if (!m?.skip) return;
  m.skip = m.skip.filter((d) => d !== day);
  if (!m.skip.length) delete m.skip;
}

export function meetingsOf(s: State): Meeting[] {
  return s.meetings ?? [];
}

export function findMeeting(s: State, id: string): Meeting | undefined {
  return meetingsOf(s).find((m) => m.id === id);
}

export function addMeeting(s: State, now: number, input: MeetingInput): string {
  const m: Meeting = { id: nextId(s, 'm'), title: '', day: input.day, at: null, createdAt: now };
  fill(m, input);
  (s.meetings ??= []).push(m);
  return m.id;
}

export function updateMeeting(s: State, id: string, input: MeetingInput): void {
  const m = findMeeting(s, id);
  if (m) fill(m, input);
}

/** Убирает встречу и возвращает её, чтобы «Вернуть» могло положить её обратно. */
export function removeMeeting(s: State, id: string): Meeting | null {
  const list = meetingsOf(s);
  const i = list.findIndex((m) => m.id === id);
  if (i < 0) return null;
  const [m] = list.splice(i, 1);
  if (list.length === 0) delete s.meetings;
  return m;
}

export function restoreMeeting(s: State, m: Meeting): void {
  if (findMeeting(s, m.id)) return;
  (s.meetings ??= []).push(m);
}

/** Встречи дня: сначала на весь день, потом по времени. */
export function meetingsOn(s: State, day: DayKey): Meeting[] {
  return meetingsOf(s)
    .filter((m) => meetingOccursOn(m, day))
    .sort((a, b) => (a.at ?? '').localeCompare(b.at ?? '') || a.createdAt - b.createdAt);
}

/**
 * Одна строка дня в календаре.
 * meeting: встреча или день её серии (day). task: задача позвана к костру на этот день (или сделана в этот день).
 * due: у задачи в этот день срок, а к костру она позвана на другой день или ещё никуда.
 * routine: повторяющаяся задача придёт в этот день сама (только для дней после сегодняшнего).
 */
export type AgendaItem =
  | { kind: 'meeting'; at: string | null; meeting: Meeting; day: DayKey }
  | { kind: 'task'; at: string | null; task: Task; done: boolean }
  | { kind: 'due'; at: string | null; task: Task }
  | { kind: 'routine'; at: string | null; routine: Routine };

const rank = (x: AgendaItem) => (x.kind === 'meeting' && !x.at ? 0 : x.at ? 1 : 2);

/** Что стоит на этот день: встречи, дела, сроки и повторы. Сначала встречи на весь день, потом всё со временем по часам, потом дела без времени. */
export function agendaOf(s: State, day: DayKey): AgendaItem[] {
  const out: AgendaItem[] = meetingsOn(s, day).map((m) => ({ kind: 'meeting', at: m.at, meeting: m, day }));
  const shown = new Set<string>();
  for (const t of s.tasks) {
    const planned = t.status === 'open' && t.day === day;
    const doneHere = t.status === 'done' && t.doneDay === day;
    if (planned || doneHere) {
      out.push({ kind: 'task', at: cleanTime(t.at), task: t, done: doneHere });
      shown.add(t.id);
      if (t.routineId) shown.add(`r:${t.routineId}`);
    }
  }
  for (const t of s.tasks) {
    if (shown.has(t.id) || t.status !== 'open' || t.due !== day) continue;
    out.push({ kind: 'due', at: null, task: t });
  }
  if (day > s.day) {
    for (const r of s.routines) {
      if (shown.has(`r:${r.id}`) || !repeatsOn(r.repeat, day)) continue;
      // Ждущая задача повтора уже позвана на какой-то день: она и есть этот повтор, второй раз не показываем.
      const w = waitingOf(s, r.id);
      if (w && w.day === day) continue;
      out.push({ kind: 'routine', at: cleanTime(r.at), routine: r });
    }
  }
  return out
    .map((x, i) => ({ x, i }))
    .sort((a, b) => rank(a.x) - rank(b.x) || (a.x.at ?? '').localeCompare(b.x.at ?? '') || a.i - b.i)
    .map(({ x }) => x);
}

/** Сколько всего стоит на день: встречи и дела отдельно (дела без сделанных). Для точек в сетке месяца. */
export function dayCount(s: State, day: DayKey): { meetings: number; tasks: number } {
  let meetings = 0;
  let tasks = 0;
  for (const x of agendaOf(s, day)) {
    if (x.kind === 'meeting') meetings += 1;
    else if (!(x.kind === 'task' && x.done)) tasks += 1;
  }
  return { meetings, tasks };
}

/** Месяц в виде «2026-11». */
export type MonthKey = string;

export function monthOf(day: DayKey): MonthKey {
  return day.slice(0, 7);
}

export function shiftMonth(month: MonthKey, n: number): MonthKey {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** Дни сетки месяца по неделям с понедельника: от понедельника первой недели до воскресенья последней. */
export function monthWeeks(month: MonthKey): DayKey[][] {
  const first = `${month}-01`;
  const back = (parseDay(first).getDay() + 6) % 7;
  let day = addDays(first, -back);
  const weeks: DayKey[][] = [];
  do {
    const week: DayKey[] = [];
    for (let i = 0; i < 7; i++) {
      week.push(day);
      day = addDays(day, 1);
    }
    weeks.push(week);
  } while (monthOf(day) === month);
  return weeks;
}


/**
 * Встреча одной фразой: «завтра в 10 стоматолог», «в пятницу созвон в 15:30». День и время берутся
 * из разбора фраз задач, а голый час «в 10» у встречи тоже значит время (у задачи разбор его не трогает).
 * Срок («к пятнице») у встречи считается её днём.
 */
export function parseMeeting(text: string, today: DayKey): { title: string; day?: DayKey; at?: string } {
  const p = parsePhrase(text, today);
  let title = p.title;
  let at = p.at;
  if (!at) {
    const m = /(^|\s)в\s+([01]?\d|2[0-3])(?=\s|$)/i.exec(title);
    if (m) {
      at = `${m[2].padStart(2, '0')}:00`;
      title = (title.slice(0, m.index) + title.slice(m.index + m[0].length)).replace(/\s+/g, ' ').trim();
      title = title.charAt(0).toUpperCase() + title.slice(1);
    }
  }
  const day = p.day ?? p.due;
  if (!day && !at) return { title: text.trim() };
  return { title, ...(day ? { day } : {}), ...(at ? { at } : {}) };
}

/** Строка дня на шкале времени: с какой по какую минуту и в какой колонке, если дела накладываются. */
export interface Slot {
  item: AgendaItem;
  /** Минуты от полуночи. */
  start: number;
  end: number;
  /** Колонка и сколько всего колонок в группе дел, которые накладываются друг на друга. */
  col: number;
  cols: number;
}

const DAY_END = 24 * 60;
/** Короче этого дело на шкале не рисуется, чтобы название читалось; накладки считаются по этой длине. */
export const SLOT_MIN_SHOWN = 30;

const toMin = (at: string) => Number(at.slice(0, 2)) * 60 + Number(at.slice(3, 5));

/** Сколько длится строка дня: встреча до своего конца или час, задача по оценке или полчаса. */
function lengthOf(x: AgendaItem): number {
  if (x.kind === 'meeting') return x.meeting.until && x.at ? toMin(x.meeting.until) - toMin(x.at) : MEETING_MIN;
  if (x.kind === 'routine') return x.routine.estimateMin ?? EVENT_MIN;
  return Math.min(estimateOf(x.task) ?? EVENT_MIN, 8 * 60);
}

/**
 * Шкала дня как в календаре телефона: всё со временем раскладывается по часам. Дела, которые
 * накладываются, встают рядом в колонки, каждая группа накладок делит ширину поровну.
 * Без времени на шкалу не попадает: это строка «Весь день».
 */
export function timelineOf(items: AgendaItem[]): Slot[] {
  const slots = items
    .filter((x) => x.at)
    .map((item) => {
      const start = toMin(item.at!);
      return { item, start, end: Math.min(DAY_END, start + Math.max(5, lengthOf(item))), col: 0, cols: 1 };
    })
    .sort((a, b) => a.start - b.start || b.end - a.end);
  let group: Slot[] = [];
  let colEnds: number[] = [];
  let groupEnd = -1;
  const close = () => {
    for (const x of group) x.cols = colEnds.length;
    group = [];
    colEnds = [];
  };
  for (const x of slots) {
    const shownEnd = Math.max(x.end, x.start + SLOT_MIN_SHOWN);
    if (x.start >= groupEnd) close();
    let col = colEnds.findIndex((e) => e <= x.start);
    if (col < 0) {
      col = colEnds.length;
      colEnds.push(shownEnd);
    } else colEnds[col] = shownEnd;
    x.col = col;
    group.push(x);
    groupEnd = Math.max(groupEnd, shownEnd);
  }
  close();
  return slots;
}
