// Все слова мира в одном месте: экраны берут названия только отсюда.
import { periodEnd, periodKind, periodOf, periodStart, shiftPeriod, type PeriodKey, type PeriodKind } from './period';
import type { UndeadRank } from './rules';
import { parseDay, plural, type Shift } from './time';
import type { Level, MeetingRepeat, QuestKind, QuestPreset, RateEvery, Repeat } from './types';

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
  rogue: 'Старый скелет',
};

export const QUEST_KIND_NAME: Record<QuestKind, string> = {
  work: 'рабочий',
  personal: 'личный',
  any: 'в любое время',
};

/** Тип сферы: «рабочая сфера», «личная сфера». */
export const SPHERE_KIND_NAME: Record<QuestKind, string> = {
  work: 'рабочая',
  personal: 'личная',
  any: 'в любое время',
};

/** Как часто напоминать оценить сферы. */
export const RATE_EVERY_NAME: Record<RateEvery, string> = {
  week: 'Раз в неделю',
  month: 'Раз в месяц',
  quarter: 'Раз в квартал',
  never: 'Не напоминать',
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

/** «каждый день», «по средам», «по будням», «по понедельникам, средам и пятницам». */
export function repeatName(r: Repeat): string {
  if (r.every === 'day') return 'каждый день';
  if (r.every === 'week') return ON_WEEKDAY[r.weekday];
  const days = [...r.days].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7));
  if (days.join() === '1,2,3,4,5') return 'по будням';
  if (days.join() === '6,0') return 'по выходным';
  return `по ${days.map((d) => ON_WEEKDAY[d].slice(3)).join(', ').replace(/, ([^,]*)$/, ' и $1')}`;
}

/** Повторы события в том порядке, в каком их предлагает лист события. */
export const MEETING_REPEATS: MeetingRepeat[] = ['day', 'workday', 'week', 'week2', 'month', 'year'];

export const MEETING_REPEAT_NAME: Record<MeetingRepeat, string> = {
  day: 'Каждый день',
  workday: 'По будням',
  week: 'Каждую неделю',
  week2: 'Каждые 2 недели',
  month: 'Каждый месяц',
  year: 'Каждый год',
};

export const PERIOD_KIND_NAME: Record<PeriodKind, string> = {
  week: 'Неделя',
  month: 'Месяц',
  quarter: 'Квартал',
  year: 'Год',
};

/** Дни недели полностью, 0 воскресенье. */
export const WEEKDAY_NAME = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'];

/** «Сегодня, суббота, 7 ноября», «Завтра, воскресенье, 8 ноября», «Вторник, 10 ноября», «Пятница, 1 января 2027». */
export function dayTitle(day: string, today: string): string {
  const d = parseDay(day);
  const year = d.getFullYear() === parseDay(today).getFullYear() ? '' : ` ${d.getFullYear()}`;
  const date = `${d.getDate()} ${MONTH_OF[d.getMonth()]}${year}`;
  const wd = WEEKDAY_NAME[d.getDay()];
  const n = Math.round((d.getTime() - parseDay(today).getTime()) / 86_400_000);
  if (n === 0) return `Сегодня, ${wd}, ${date}`;
  if (n === 1) return `Завтра, ${wd}, ${date}`;
  if (n === -1) return `Вчера, ${wd}, ${date}`;
  return `${wd[0].toUpperCase()}${wd.slice(1)}, ${date}`;
}

/** «1 событие и 3 задачи», «2 события», «4 задачи»; пусто, если ничего. */
export function agendaCount(meetings: number, tasks: number): string {
  const parts: string[] = [];
  if (meetings) parts.push(`${meetings} ${plural(meetings, 'событие', 'события', 'событий')}`);
  if (tasks) parts.push(`${tasks} ${plural(tasks, 'задача', 'задачи', 'задач')}`);
  return parts.join(' и ');
}

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
  settings: 'Настройки',
  calendar: 'Календарь',
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
  secondWind: 'Второе дыхание',
  lightFire: 'Разжечь костёр',
  lightsOut: 'Отбой',
  notSleeping: 'Ещё не сплю',
  keepAtFire: 'Оставить у костра на завтра',
  lair: 'в проекте осталось',
  trophies: 'Зал трофеев',
  inbox: 'Письма',
  quest: 'Сфера или проект',
  quests: 'Проекты',
  spheres: 'Сферы',
  noSphere: 'Без сферы',
  wheel: 'Колесо баланса',
  rate: 'Оценить сферы',
  undead: 'Нежить на дороге',
  slay: 'Упокоить',
  postpone: 'Перенести',
  stillWorking: 'Да, работаю',
  notWorking: 'Нет, был перерыв',
  later: 'позже',
} as const;
