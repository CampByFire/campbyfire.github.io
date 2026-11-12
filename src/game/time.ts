// Игровое время: дни, смены, освещение. Всё в местном времени устройства.
import { DAY_STARTS_AT_HOUR, HOUR, SUMMARY_BEFORE_BED } from './rules';
import type { DayKey, Repeat, Settings } from './types';

export type Shift = 'morning' | 'work' | 'evening' | 'weekend' | 'night';
export type Light = 'day' | 'evening' | 'night';

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function keyOf(d: Date): DayKey {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function dayKey(ts: number): DayKey {
  return keyOf(new Date(ts - DAY_STARTS_AT_HOUR * HOUR));
}

export function parseDay(day: DayKey): Date {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(day: DayKey, n: number): DayKey {
  const d = parseDay(day);
  d.setDate(d.getDate() + n);
  return keyOf(d);
}

export function daysBetween(from: DayKey, to: DayKey): number {
  return Math.round((parseDay(to).getTime() - parseDay(from).getTime()) / (24 * HOUR));
}

/** Минуты от полуночи; время после полуночи до начала дня идёт как 24:00+. */
export function minutesOfDay(ts: number): number {
  const d = new Date(ts);
  const m = d.getHours() * 60 + d.getMinutes();
  return d.getHours() < DAY_STARTS_AT_HOUR ? m + 24 * 60 : m;
}

export function isWorkDay(day: DayKey, s: Settings): boolean {
  return s.workDays.includes(parseDay(day).getDay());
}

/** Приходит ли повторяющаяся задача в этот день. */
export function repeatsOn(r: Repeat, day: DayKey): boolean {
  if (r.every === 'day') return true;
  const weekday = parseDay(day).getDay();
  return r.every === 'week' ? weekday === r.weekday : r.days.includes(weekday);
}

/** Ближайший день, начиная с from, когда задача придёт; null, если таких дней нет (не выбран ни один день). */
export function nextRepeat(r: Repeat, from: DayKey): DayKey | null {
  for (let i = 0; i < 7; i++) {
    const day = addDays(from, i);
    if (repeatsOn(r, day)) return day;
  }
  return null;
}

/** Повтор по выбранным дням недели. Все семь это «каждый день», один это «раз в неделю». */
export function repeatOnDays(days: number[]): Repeat {
  const set = [...new Set(days)].sort();
  if (set.length === 7) return { every: 'day' };
  if (set.length === 1) return { every: 'week', weekday: set[0] };
  return { every: 'days', days: set };
}

/** Что не так с распорядком, если смены в нём путаются; null, если всё в порядке. */
export function scheduleError(s: Settings): string | null {
  const dayStart = DAY_STARTS_AT_HOUR * 60;
  const bed = s.bedtime < dayStart ? s.bedtime + 24 * 60 : s.bedtime;
  if (s.workStart < dayStart) return `Работа может начаться не раньше ${DAY_STARTS_AT_HOUR}:00: в это время начинается новый игровой день.`;
  if (s.workEnd <= s.workStart) return 'Конец работы должен быть позже начала.';
  if (bed - SUMMARY_BEFORE_BED / 60_000 < s.workEnd) return `Отбой должен быть хотя бы на ${SUMMARY_BEFORE_BED / 60_000} минут позже конца работы.`;
  return null;
}

export function shiftAt(ts: number, s: Settings): Shift {
  const m = minutesOfDay(ts);
  const bed = s.bedtime < DAY_STARTS_AT_HOUR * 60 ? s.bedtime + 24 * 60 : s.bedtime;
  if (m >= bed - SUMMARY_BEFORE_BED / 60_000) return 'night';
  if (!isWorkDay(dayKey(ts), s)) return 'weekend';
  if (m < s.workStart) return 'morning';
  if (m < s.workEnd) return 'work';
  return 'evening';
}

export function lightOf(shift: Shift, ts: number, s: Settings): Light {
  if (shift === 'night') return 'night';
  if (shift === 'evening') return 'evening';
  // В выходные закат тоже наступает: после конца обычного рабочего дня.
  if (shift === 'weekend' && minutesOfDay(ts) >= s.workEnd) return 'evening';
  return 'day';
}

/** Смена, в которую у похода полная сила. */
export function isMainFor(kind: 'work' | 'personal' | 'any', shift: Shift): boolean {
  if (kind === 'any') return true;
  if (shift === 'work' || shift === 'morning') return kind === 'work';
  return true;
}

const WEEKDAYS = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
const MONTHS = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];

export function formatDate(day: DayKey): string {
  const d = parseDay(day);
  return `${WEEKDAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

export function formatClock(ts: number): string {
  const d = new Date(ts);
  return `${d.getHours()}:${pad(d.getMinutes())}`;
}

export function formatMinutes(m: number): string {
  return `${Math.floor(m / 60) % 24}:${pad(m % 60)}`;
}

/** Таймер задачи в часах и минутах: «0:42», «2:05». */
export function formatTimer(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 60_000));
  return `${Math.floor(total / 60)}:${pad(total % 60)}`;
}

/** Секунды таймера, мелко рядом с часами и минутами: «:07». */
export function formatTimerSeconds(ms: number): string {
  return `:${pad(Math.max(0, Math.floor(ms / 1000)) % 60)}`;
}

/** «40 мин», «2 ч», «1 ч 30 мин». */
export function formatDuration(min: number): string {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  if (h === 0) return `${m} мин`;
  if (m === 0) return `${h} ч`;
  return `${h} ч ${m} мин`;
}

/** Сколько отдано задаче: «7 мин», «1 ч 20 мин». Меньше минуты считается за минуту. */
export function formatSpent(ms: number): string {
  return formatDuration(Math.max(1, Math.round(ms / 60_000)));
}

/** «24 октября 2027 г.» */
export function formatDayLong(day: DayKey): string {
  return parseDay(day).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
}

export function formatDue(due: DayKey, today: DayKey): string {
  const n = daysBetween(today, due);
  if (n === 0) return 'сегодня';
  if (n === 1) return 'завтра';
  if (n === -1) return 'вчера';
  if (n < 0) return `${-n} ${plural(-n, 'день', 'дня', 'дней')} назад`;
  if (n < 7) return `через ${n} ${plural(n, 'день', 'дня', 'дней')}`;
  const d = parseDay(due);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

export function plural(n: number, one: string, few: string, many: string): string {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b === 1) return one;
  if (b >= 2 && b <= 4) return few;
  return many;
}
