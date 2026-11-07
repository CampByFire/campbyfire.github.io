// Числа баланса. Все правила, которые хочется крутить, лежат здесь.
import type { Level, RateEvery } from './types';

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
/** Опыт за план дают только за столько задач: большой план не выгоднее реалистичного. */
export const PLAN_XP_MAX_TASKS = 5;

/** Опыт за план из n задач. */
export function planXp(n: number): number {
  return Math.min(n, PLAN_XP_MAX_TASKS) * PLAN_XP_PER_TASK;
}

/** Оценка по умолчанию, если у задачи нет своей. У IV уровня оценки нет. */
export const ESTIMATE_BY_LEVEL: Record<Level, number | null> = { 1: 30, 2: 120, 3: 360, 4: null };

/** Оценка сферы в колесе баланса: от 1 до 10. */
export const SCORE_MIN = 1;
export const SCORE_MAX = 10;
/** Через сколько дней после прошлой оценки напоминать оценить сферы снова. */
export const RATE_EVERY_DAYS: Record<Exclude<RateEvery, 'never'>, number> = { week: 7, month: 30, quarter: 91 };
/** Первый раз напоминать оценить сферы, когда игре столько дней. */
export const RATE_FIRST_AFTER_DAYS = 3;

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

export type UndeadRank = 'minion' | 'rogue';

/** С этой просрочки нежить старая: страшнее она не становится, но упокоить её выгоднее. */
export const OLD_UNDEAD_DAYS = 7;

/** Нежить бывает только двух видов: свежая и старая. Чем дольше она ждёт, тем больше за неё опыта, а не страха. */
export function undeadRank(daysOverdue: number): UndeadRank {
  return daysOverdue >= OLD_UNDEAD_DAYS ? 'rogue' : 'minion';
}

/** Сколько опыта сверху за упокоенную нежить, долей от обычного: свежая +50%, старая вдвое. */
export const UNDEAD_XP_BONUS: Record<UndeadRank, number> = { minion: 0.5, rogue: 1 };

/** Перенести срок нежити или отпустить её тоже дело: за это немного опыта. */
export const MERCY_XP = 5;

/** Искра: столько минут таймера подряд, и старт засчитан. */
export const SPARK_AFTER = 2 * MINUTE;
/** Опыт за искру, раз в день за задачу. */
export const SPARK_XP = 5;
/** Угольки: каждые столько минут работы у огня приносят опыт, не дожидаясь «Готово». */
export const EMBER_EVERY = 15 * MINUTE;
export const EMBER_XP = 2;

/** Напоминание о задаче со временем приходит за столько минут. */
export const REMIND_BEFORE_MIN = 10;
/** Длина события в календаре, если у задачи нет оценки. */
export const EVENT_MIN = 30;
/** Напоминание о встрече со временем приходит за столько минут. */
export const MEETING_REMIND_MIN = 30;
/** Встреча без конца стоит в календаре телефона столько минут. */
export const MEETING_MIN = 60;
/** Встреча на весь день напоминает о себе накануне вечером: за столько часов до полуночи. */
export const ALL_DAY_REMIND_HOURS = 6;

/** Перерыв не меньше стольких игровых дней, и герой возвращается отдохнувшим. */
export const RESTED_AFTER_DAYS = 2;
/** Столько первых дел в день возвращения дают опыт сверху. */
export const RESTED_TASKS = 3;
/** Опыт сверху за дело отдохнувшего героя, долей от обычного: вдвое. */
export const RESTED_XP_BONUS = 1;
