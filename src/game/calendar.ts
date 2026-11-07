// Календарь: встречи и что стоит на каждый день. Встречи живут в State.meetings, а дела берутся
// из задач (день у костра, срок, сделано в этот день) и повторяющихся задач.
import { parsePhrase } from './phrase';
import { nextId, waitingOf } from './state';
import { addDays, parseDay, repeatsOn } from './time';
import type { DayKey, Meeting, Routine, State, Task } from './types';

export interface MeetingInput {
  title: string;
  day: DayKey;
  at?: string | null;
  until?: string | null;
  place?: string | null;
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
    .filter((m) => m.day === day)
    .sort((a, b) => (a.at ?? '').localeCompare(b.at ?? '') || a.createdAt - b.createdAt);
}

/**
 * Одна строка дня в календаре.
 * meeting: встреча. task: задача позвана к костру на этот день (или сделана в этот день).
 * due: у задачи в этот день срок, а к костру она позвана на другой день или ещё никуда.
 * routine: повторяющаяся задача придёт в этот день сама (только для дней после сегодняшнего).
 */
export type AgendaItem =
  | { kind: 'meeting'; at: string | null; meeting: Meeting }
  | { kind: 'task'; at: string | null; task: Task; done: boolean }
  | { kind: 'due'; at: string | null; task: Task }
  | { kind: 'routine'; at: string | null; routine: Routine };

const rank = (x: AgendaItem) => (x.kind === 'meeting' && !x.at ? 0 : x.at ? 1 : 2);

/** Что стоит на этот день: встречи, дела, сроки и повторы. Сначала встречи на весь день, потом всё со временем по часам, потом дела без времени. */
export function agendaOf(s: State, day: DayKey): AgendaItem[] {
  const out: AgendaItem[] = meetingsOn(s, day).map((m) => ({ kind: 'meeting', at: m.at, meeting: m }));
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
      if (shown.has(`r:${r.id}`) || !repeatsOn(r.repeat, day, s.settings)) continue;
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
