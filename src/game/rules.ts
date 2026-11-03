// Числа баланса. Все правила, которые хочется крутить, лежат здесь.
import type { Level } from './types';

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;

export const MANA_MAX = 100;
/** Работа тратит силы: полной маны хватает примерно на 6 ч 40 мин. */
export const MANA_DRAIN_PER_HOUR = 15;
/** Привал возвращает силы вдвое быстрее, чем работа их тратит. */
export const MANA_REST_PER_HOUR = 30;
/** Позвать к огню задачу из другого похода стоит маны: это цена переключения. */
export const SWITCH_COST = 5;
/** Второе дыхание: ужин или прогулка после работы, раз в день. */
export const SECOND_WIND = 30;
/** Ниже этого лагерь просит привал. */
export const MANA_LOW = 15;

/** Таймер встаёт сам, если игрок не заглядывал так долго. */
export const FORGOTTEN_AFTER = 90 * MINUTE;

export const GOLD_PER_LEVEL = 25;
export const XP_BY_LEVEL: Record<Level, number> = { 1: 25, 2: 40, 3: 60, 4: 85 };
/** Опыт за каждую задачу в плане, когда разжигаешь костёр. */
export const PLAN_XP_PER_TASK = 3;

/** Оценка по умолчанию, если у задачи нет своей. У IV уровня оценки нет. */
export const ESTIMATE_BY_LEVEL: Record<Level, number | null> = { 1: 30, 2: 120, 3: 360, 4: null };

export const SEATS = 6;
export const ROAD_SPOTS = 3;

/** Игровой день начинается в 4:00, чтобы работа после полуночи шла в тот же день. */
export const DAY_STARTS_AT_HOUR = 4;
/** За столько до отбоя лагерь показывает итоги дня. */
export const SUMMARY_BEFORE_BED = 30 * MINUTE;

export function levelForEstimate(min: number): Level {
  if (min <= 30) return 1;
  if (min <= 150) return 2;
  if (min <= 480) return 3;
  return 4;
}

export function estimateOf(task: { level: Level; estimateMin: number | null }): number | null {
  return task.estimateMin ?? ESTIMATE_BY_LEVEL[task.level];
}

/** Сколько опыта нужно, чтобы получить уровень n. */
export function xpForLevel(n: number): number {
  return 150 * n * (n - 1);
}

export function heroLevel(xp: number): { level: number; into: number; need: number } {
  let level = 1;
  while (xp >= xpForLevel(level + 1)) level++;
  const base = xpForLevel(level);
  return { level, into: xp - base, need: xpForLevel(level + 1) - base };
}

export type UndeadRank = 'minion' | 'rogue' | 'warrior' | 'mage';

/** Чем дольше просрочка, тем страшнее нежить. */
export function undeadRank(daysOverdue: number): UndeadRank {
  if (daysOverdue >= 14) return 'mage';
  if (daysOverdue >= 7) return 'warrior';
  if (daysOverdue >= 3) return 'rogue';
  return 'minion';
}
