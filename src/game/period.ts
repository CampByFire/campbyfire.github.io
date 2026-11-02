// Горизонты задач: неделя, месяц, квартал, год. Период хранится строкой, по её виду понятно, какой он:
// «2026-W45» неделя (по ISO, с понедельника), «2026-11» месяц, «2026-Q4» квартал, «2026» год.
import { addDays, parseDay } from './time';
import type { DayKey } from './types';

export type PeriodKind = 'week' | 'month' | 'quarter' | 'year';
export type PeriodKey = string;

export const PERIOD_KINDS: PeriodKind[] = ['week', 'month', 'quarter', 'year'];

/** Следующий горизонт по величине: в него уходит хвост, который не влез в свой. */
export const BIGGER: Record<PeriodKind, PeriodKind | null> = { week: 'month', month: 'quarter', quarter: 'year', year: null };

const pad = (n: number) => (n < 10 ? `0${n}` : String(n));
const keyOf = (d: Date): DayKey => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** Понедельник недели этого дня. */
export function mondayOf(day: DayKey): DayKey {
  const wd = parseDay(day).getDay();
  return addDays(day, wd === 0 ? -6 : 1 - wd);
}

/** Неделя по ISO: год недели и номер. Неделя принадлежит году, на который приходится её четверг. */
function isoWeek(day: DayKey): { year: number; week: number } {
  const thu = parseDay(addDays(mondayOf(day), 3));
  const year = thu.getFullYear();
  const jan4 = keyOf(new Date(year, 0, 4));
  const week = Math.round((parseDay(mondayOf(keyOf(thu))).getTime() - parseDay(mondayOf(jan4)).getTime()) / (7 * 24 * 3600_000)) + 1;
  return { year, week };
}

export function periodKind(key: PeriodKey): PeriodKind | null {
  if (/^\d{4}-W\d{2}$/.test(key)) return 'week';
  if (/^\d{4}-\d{2}$/.test(key)) return 'month';
  if (/^\d{4}-Q[1-4]$/.test(key)) return 'quarter';
  if (/^\d{4}$/.test(key)) return 'year';
  return null;
}

export function isPeriod(key: unknown): key is PeriodKey {
  return typeof key === 'string' && periodKind(key) !== null;
}

/** Период этого вида, в который попадает день. */
export function periodOf(kind: PeriodKind, day: DayKey): PeriodKey {
  const d = parseDay(day);
  switch (kind) {
    case 'week': {
      const w = isoWeek(day);
      return `${w.year}-W${pad(w.week)}`;
    }
    case 'month':
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
    case 'quarter':
      return `${d.getFullYear()}-Q${Math.floor(d.getMonth() / 3) + 1}`;
    case 'year':
      return String(d.getFullYear());
  }
}

/** Первый день периода. */
export function periodStart(key: PeriodKey): DayKey {
  const y = Number(key.slice(0, 4));
  switch (periodKind(key)) {
    case 'week': {
      const w = Number(key.slice(6));
      return addDays(mondayOf(keyOf(new Date(y, 0, 4))), (w - 1) * 7);
    }
    case 'month':
      return keyOf(new Date(y, Number(key.slice(5)) - 1, 1));
    case 'quarter':
      return keyOf(new Date(y, (Number(key.slice(6)) - 1) * 3, 1));
    default:
      return keyOf(new Date(y, 0, 1));
  }
}

/** Последний день периода. */
export function periodEnd(key: PeriodKey): DayKey {
  return addDays(periodStart(shiftPeriod(key, 1)), -1);
}

/** Соседний период того же вида: n = 1 следующий, -1 прошлый. */
export function shiftPeriod(key: PeriodKey, n: number): PeriodKey {
  const kind = periodKind(key);
  const start = parseDay(periodStart(key));
  switch (kind) {
    case 'week':
      return periodOf('week', addDays(periodStart(key), 7 * n));
    case 'month':
      return periodOf('month', keyOf(new Date(start.getFullYear(), start.getMonth() + n, 1)));
    case 'quarter':
      return periodOf('quarter', keyOf(new Date(start.getFullYear(), start.getMonth() + 3 * n, 1)));
    default:
      return String(start.getFullYear() + n);
  }
}

/** День попадает в период. */
export function inPeriod(key: PeriodKey, day: DayKey): boolean {
  return day >= periodStart(key) && day <= periodEnd(key);
}

/**
 * Меньший период лежит внутри большего. Неделя, которая пересекает границу месяца, относится к тому
 * месяцу, где её четверг: так же, как по ISO неделя на стыке лет относится к году своего четверга.
 */
export function within(child: PeriodKey, parent: PeriodKey): boolean {
  const ck = periodKind(child);
  const pk = periodKind(parent);
  if (!ck || !pk || PERIOD_KINDS.indexOf(ck) >= PERIOD_KINDS.indexOf(pk)) return false;
  const day = ck === 'week' ? addDays(periodStart(child), 3) : periodStart(child);
  return inPeriod(parent, day);
}

/** Период кончился раньше этого дня: незакрытые задачи в нём становятся хвостами. */
export function isPast(key: PeriodKey, today: DayKey): boolean {
  return periodEnd(key) < today;
}
