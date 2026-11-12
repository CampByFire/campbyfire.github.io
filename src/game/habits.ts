// Привычки и главные задачи недели. Неделя с понедельника, ключ как у горизонта: «2026-W46».
// Счёт привычки не хранится, а считается по сделанным задачам, поэтому слияние двух устройств его не ломает.
import { HABIT_GOAL_GOLD, HABIT_GOAL_XP, WEEK_MAIN_MAX } from './rules';
import { periodOf, type PeriodKey } from './period';
import type { DayKey, Repeat, Reward, Routine, State, Task } from './types';

export function weekOf(day: DayKey): PeriodKey {
  return periodOf('week', day);
}

/** Сколько дней в неделю приходит повторяющаяся задача. */
export function daysPerWeek(repeat: Repeat): number {
  return repeat.every === 'day' ? 7 : repeat.every === 'week' ? 1 : Math.max(1, repeat.days.length);
}

/** Цель привычки по умолчанию: все её дни, как в шаблоне. Игрок может снизить. */
export function defaultHabitGoal(repeat: Repeat): number {
  return daysPerWeek(repeat);
}

/** Цель привычки, не больше числа её дней и не меньше одного. */
export function habitGoal(r: Routine): number {
  const most = daysPerWeek(r.repeat);
  return Math.min(most, Math.max(1, Math.round(r.habit?.goal ?? most)));
}

function habitDone(s: State, routineId: string): Task[] {
  return s.tasks.filter((t) => t.routineId === routineId && t.status === 'done' && t.doneDay);
}

/** Привычка за неделю: в какие дни сделана, сколько это дней и какая цель. */
export function habitWeek(s: State, r: Routine, week: PeriodKey): { done: number; goal: number; days: DayKey[] } {
  const days = [...new Set(habitDone(s, r.id).map((t) => t.doneDay!).filter((d) => weekOf(d) === week))].sort();
  return { done: days.length, goal: habitGoal(r), days };
}

/** Сколько недель привычка дошла до цели. Это сумма, а не серия подряд: она только растёт. */
export function habitWeeksWon(s: State, r: Routine): number {
  const byWeek = new Map<PeriodKey, Set<DayKey>>();
  for (const t of habitDone(s, r.id)) {
    const w = weekOf(t.doneDay!);
    if (!byWeek.has(w)) byWeek.set(w, new Set());
    byWeek.get(w)!.add(t.doneDay!);
  }
  const goal = habitGoal(r);
  let won = 0;
  for (const days of byWeek.values()) if (days.size >= goal) won++;
  return won;
}

/** Задача, которая держит бонус привычки за эту неделю. */
export function habitBonusHolder(s: State, routineId: string, week: PeriodKey): Task | undefined {
  return s.tasks.find((t) => t.routineId === routineId && t.status === 'done' && t.reward?.habitBonus?.week === week);
}

/**
 * Бонус для задачи привычки, которую сейчас отмечают сделанной в день day: есть, если вместе с ней
 * счёт недели доходит до цели, а бонуса за эту неделю ещё нет.
 */
export function habitBonusFor(s: State, r: Routine | undefined, t: Task, day: DayKey): Reward['habitBonus'] {
  if (!r?.habit) return undefined;
  const week = weekOf(day);
  if (habitBonusHolder(s, r.id, week)) return undefined;
  const days = new Set(habitDone(s, r.id).filter((x) => x.id !== t.id && weekOf(x.doneDay!) === week).map((x) => x.doneDay!));
  days.add(day);
  return days.size >= habitGoal(r) ? { gold: HABIT_GOAL_GOLD, xp: HABIT_GOAL_XP, week } : undefined;
}

/** Снять бонус привычки с задачи: золото и опыт уходят из сундука и из итогов её дня. */
export function stripHabitBonus(s: State, t: Task): void {
  const b = t.reward?.habitBonus;
  if (!b || !t.reward) return;
  t.reward.gold -= b.gold;
  t.reward.xp -= b.xp;
  delete t.reward.habitBonus;
  s.hero.gold -= b.gold;
  s.hero.xp -= b.xp;
  const l = t.doneDay ? s.log[t.doneDay] : undefined;
  if (l) {
    l.gold -= b.gold;
    l.xp -= b.xp;
  }
}

/** После «Вернуть»: если счёт недели упал ниже цели, бонус уходит с той задачи, что его держит. */
export function recheckHabitBonus(s: State, r: Routine | undefined, week: PeriodKey): void {
  if (!r) return;
  const holder = habitBonusHolder(s, r.id, week);
  if (holder && (!r.habit || habitWeek(s, r, week).done < habitGoal(r))) stripHabitBonus(s, holder);
}

/**
 * После слияния: два устройства без связи могли дать бонус за одну неделю дважды. Остаётся ранний,
 * у остальных он снимается вместе с золотом и опытом.
 */
export function tidyHabits(s: State): void {
  const seen = new Map<string, Task>();
  const done = s.tasks.filter((t) => t.status === 'done' && t.reward?.habitBonus && t.routineId).sort((a, b) => (a.doneAt ?? 0) - (b.doneAt ?? 0));
  for (const t of done) {
    const key = `${t.routineId}|${t.reward!.habitBonus!.week}`;
    if (seen.has(key)) stripHabitBonus(s, t);
    else seen.set(key, t);
  }
}

// ---------- главные задачи недели ----------

/** Главные задачи недели, сделанные тоже: по ним считается лимит. */
export function mainOf(s: State, week: PeriodKey): Task[] {
  return s.tasks.filter((t) => t.main === week && (t.status === 'open' || t.status === 'inbox' || t.status === 'done'));
}

/** Может ли задача стать главной на эту неделю: не повторяющаяся, не сделанная и стоит в этой неделе. */
export function canBeMain(t: Task, week: PeriodKey): boolean {
  if (t.routineId || (t.status !== 'open' && t.status !== 'inbox')) return false;
  return t.period === week || (!!t.day && weekOf(t.day) === week);
}

/** Есть ли ещё место для главной задачи на этой неделе. */
export function mainRoom(s: State, week: PeriodKey): number {
  return Math.max(0, WEEK_MAIN_MAX - mainOf(s, week).length);
}
