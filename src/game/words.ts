// Все слова мира в одном месте: экраны берут названия только отсюда.
import { periodEnd, periodKind, periodOf, periodStart, shiftPeriod, type PeriodKey, type PeriodKind } from './period';
import type { UndeadRank } from './rules';
import { parseDay, type Shift } from './time';
import type { Level, QuestKind, QuestPreset, Repeat } from './types';

export type ClassId = 'rogue' | 'barbarian' | 'mage' | 'knight';

export const CLASS_BY_LEVEL: Record<Level, ClassId> = { 1: 'rogue', 2: 'barbarian', 3: 'mage', 4: 'knight' };

export const CLASS_NAME: Record<ClassId, string> = {
  rogue: 'Разбойник',
  barbarian: 'Варвар',
  mage: 'Маг',
  knight: 'Рыцарь',
};

/** «у разбойника», «у мага»: кто из отряда взял задачу. */
export const CLASS_AT: Record<ClassId, string> = {
  rogue: 'у разбойника',
  barbarian: 'у варвара',
  mage: 'у мага',
  knight: 'у рыцаря',
};

export const LEVEL_ROMAN: Record<Level, string> = { 1: 'I', 2: 'II', 3: 'III', 4: 'IV' };

export const LEVEL_HINT: Record<Level, string> = {
  1: 'до получаса',
  2: 'пара часов',
  3: 'целый день',
  4: 'несколько дней',
};

export const UNDEAD_NAME: Record<UndeadRank, string> = {
  minion: 'Скелет-миньон',
  rogue: 'Скелет-разбойник',
  warrior: 'Скелет-воин',
  mage: 'Скелет-маг',
};

export const QUEST_KIND_NAME: Record<QuestKind, string> = {
  work: 'рабочий',
  personal: 'личный',
  any: 'в любое время',
};

export const QUEST_KIND_HINT: Record<QuestKind, string> = {
  work: 'в полной силе в рабочие часы',
  personal: 'в полной силе вечером и в выходные',
  any: 'без привязки ко времени',
};

/** Готовые знамёна словами: так их называет экранный диктор. */
export const QUEST_COLOR_NAME: Record<QuestPreset, string> = {
  red: 'алое',
  blue: 'синее',
  green: 'зелёное',
  yellow: 'золотое',
  purple: 'лиловое',
  brown: 'бурое',
};

/** Дни недели для выбора, с понедельника. value: номер дня, 0 воскресенье; sr: как день прочтёт экранный диктор. */
export const WEEKDAY_CHIPS: { value: number; label: string; sr: string }[] = [
  { value: 1, label: 'Пн', sr: 'понедельник' },
  { value: 2, label: 'Вт', sr: 'вторник' },
  { value: 3, label: 'Ср', sr: 'среда' },
  { value: 4, label: 'Чт', sr: 'четверг' },
  { value: 5, label: 'Пт', sr: 'пятница' },
  { value: 6, label: 'Сб', sr: 'суббота' },
  { value: 0, label: 'Вс', sr: 'воскресенье' },
];

const ON_WEEKDAY = ['по воскресеньям', 'по понедельникам', 'по вторникам', 'по средам', 'по четвергам', 'по пятницам', 'по субботам'];
/** «в среду»: когда задача придёт в следующий раз. */
export const IN_WEEKDAY = ['в воскресенье', 'в понедельник', 'во вторник', 'в среду', 'в четверг', 'в пятницу', 'в субботу'];

/** «каждый день», «по рабочим дням», «по средам». */
export function repeatName(r: Repeat): string {
  if (r.every === 'day') return 'каждый день';
  if (r.every === 'workday') return 'по рабочим дням';
  return ON_WEEKDAY[r.weekday];
}

export const PERIOD_KIND_NAME: Record<PeriodKind, string> = {
  week: 'Неделя',
  month: 'Месяц',
  quarter: 'Квартал',
  year: 'Год',
};

export const MONTH_NAME = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
/** «2 ноября», «до 15 декабря». */
export const MONTH_OF = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const QUARTER_ROMAN = ['I', 'II', 'III', 'IV'];

/** «2–8 ноября», «27 октября – 2 ноября», «29 декабря 2026 – 4 января 2027». */
export function weekRange(key: PeriodKey): string {
  const a = parseDay(periodStart(key));
  const b = parseDay(periodEnd(key));
  if (a.getFullYear() !== b.getFullYear()) {
    return `${a.getDate()} ${MONTH_OF[a.getMonth()]} ${a.getFullYear()} – ${b.getDate()} ${MONTH_OF[b.getMonth()]} ${b.getFullYear()}`;
  }
  if (a.getMonth() !== b.getMonth()) return `${a.getDate()} ${MONTH_OF[a.getMonth()]} – ${b.getDate()} ${MONTH_OF[b.getMonth()]}`;
  return `${a.getDate()}–${b.getDate()} ${MONTH_OF[b.getMonth()]}`;
}

/**
 * Название периода относительно сегодняшнего дня: «Эта неделя», «Следующая неделя», «Ноябрь»,
 * «Январь 2027», «IV квартал», «2026 год». Год пишется, только если он не нынешний.
 */
export function periodName(key: PeriodKey, today: string): string {
  const kind = periodKind(key);
  const year = Number(key.slice(0, 4));
  const thisYear = parseDay(today).getFullYear();
  const tail = year === thisYear ? '' : ` ${year}`;
  if (kind === 'week') {
    const now = periodOf('week', today);
    if (key === now) return 'Эта неделя';
    if (key === shiftPeriod(now, 1)) return 'Следующая неделя';
    if (key === shiftPeriod(now, -1)) return 'Прошлая неделя';
    return `Неделя ${weekRange(key)}`;
  }
  if (kind === 'month') return `${MONTH_NAME[Number(key.slice(5)) - 1]}${tail}`;
  if (kind === 'quarter') return `${QUARTER_ROMAN[Number(key.slice(6)) - 1]} квартал${tail}`;
  return `${year} год`;
}

/** Коротко для строки задачи: «неделя», «ноябрь», «IV кв.», «2027». */
export function periodShort(key: PeriodKey, today: string): string {
  const kind = periodKind(key);
  if (kind === 'week') {
    const now = periodOf('week', today);
    if (key === now) return 'эта неделя';
    if (key === shiftPeriod(now, 1)) return 'след. неделя';
    return `нед. ${parseDay(periodStart(key)).getDate()} ${MONTH_OF[parseDay(periodStart(key)).getMonth()].slice(0, 3)}`;
  }
  if (kind === 'month') return periodName(key, today).toLowerCase();
  if (kind === 'quarter') return `${QUARTER_ROMAN[Number(key.slice(6)) - 1]} кв.${Number(key.slice(0, 4)) === parseDay(today).getFullYear() ? '' : ` ${key.slice(0, 4)}`}`;
  return key;
}

/** «на эту неделю», «на ноябрь», «на IV квартал», «на 2026 год»: куда перенести хвост. */
export function periodTo(key: PeriodKey, today: string): string {
  const name = periodName(key, today);
  const kind = periodKind(key);
  if (kind === 'week') return `на ${name.replace('Эта неделя', 'эту неделю').replace('Следующая неделя', 'следующую неделю').replace(/^Неделя/, 'неделю')}`;
  if (kind === 'quarter' || kind === 'year') return `на ${name}`;
  return `на ${name.toLowerCase()}`;
}

export const SHIFT_NAME: Record<Shift, string> = {
  morning: 'Утро',
  work: 'День',
  evening: 'Вечер',
  weekend: 'Выходной',
  night: 'Ночь',
};

export const W = {
  appName: 'Лагерь',
  camp: 'Лагерь',
  plan: 'Сбор отряда',
  realm: 'Королевство',
  chronicle: 'Летопись',
  gold: 'Золото',
  mana: 'Мана',
  xp: 'опыт',
  nowAtFire: 'Сейчас у огня',
  atFireEmpty: 'У огня пусто',
  moreToday: 'Ещё сегодня',
  evening: 'Вечером',
  done: 'Готово',
  rest: 'Привал',
  backOnRoad: 'Снова в путь',
  callToFire: 'Позвать к огню',
  callToFireShort: 'К огню',
  pause: 'Пауза',
  resume: 'Продолжить',
  release: 'Отпустить',
  frog: 'лягушка дня',
  frogTitle: 'Лягушка дня',
  secondWind: 'Второе дыхание',
  lightFire: 'Разжечь костёр',
  lightsOut: 'Отбой',
  notSleeping: 'Ещё не сплю',
  keepAtFire: 'Оставить у костра на завтра',
  lair: 'логово',
  trophies: 'Зал трофеев',
  inbox: 'Письма',
  quest: 'Поход',
  quests: 'Походы',
  undead: 'Нежить на дороге',
  slay: 'Упокоить',
  stillWorking: 'Да, работаю',
  notWorking: 'Нет, был перерыв',
  later: 'позже',
} as const;
