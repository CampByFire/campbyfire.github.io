// Задача одной фразой: «Добавь задачу на неделю "Съесть мороженое"», «завтра в 19:00 позвонить маме»,
// «отчёт до пятницы на 2 часа #работа». Без ИИ: игра ищет знакомые слова, выставляет по ним день,
// срок, время, оценку, горизонт и поход, а остаток фразы делает названием. Текст в кавычках
// берётся названием как есть, и слова в нём ничего не выставляют.
import { periodEnd, periodOf, shiftPeriod, type PeriodKey } from './period';
import { addDays, parseDay } from './time';
import type { DayKey, Quest } from './types';

export type FoundKind = 'day' | 'due' | 'at' | 'estimate' | 'period' | 'quest';

export interface Parsed {
  /** Название без узнанных слов. Пустое, если во фразе только слова о времени. */
  title: string;
  day?: DayKey;
  due?: DayKey;
  at?: string;
  /** Оценка в минутах; null значит «дни», IV уровень. Нет поля, значит во фразе её нет. */
  estimate?: number | null;
  period?: PeriodKey;
  questId?: string;
  /** Что узнано, в порядке фразы: для подсказки под полем. */
  found: { kind: FoundKind; text: string }[];
}

// Границы слова для кириллицы: \b в JS знает только латиницу.
const L = '(?<![\\p{L}\\d])';
const R = '(?![\\p{L}\\d])';

const NUM_WORDS: Record<string, number> = {
  один: 1, одну: 1, одного: 1, два: 2, две: 2, двух: 2, три: 3, трёх: 3, трех: 3, четыре: 4, четырёх: 4, четырех: 4,
  пять: 5, шесть: 6, семь: 7, восемь: 8, девять: 9, десять: 10, пару: 2,
};
const NUM = `(\\d{1,3}|${Object.keys(NUM_WORDS).join('|')})`;
const num = (x: string): number => NUM_WORDS[x.toLowerCase()] ?? Number(x);

// Дни недели в разных падежах: «в пятницу», «до пятницы», «к пятнице». Номер дня: 0 воскресенье.
const WEEKDAY_FORMS: [RegExp, number][] = [
  [/^понедельник/, 1],
  [/^вторник/, 2],
  [/^сред/, 3],
  [/^четверг/, 4],
  [/^пятниц/, 5],
  [/^суббот/, 6],
  [/^воскресень/, 0],
];
const WEEKDAY = '(понедельник[аеуо]?|вторник[аеуо]?|сред[аеуыи]|четверг[аеуо]?|пятниц[аеуыи]|суббот[аеуыи]|воскресень[еяюи])';
const weekdayOf = (w: string): number => WEEKDAY_FORMS.find(([re]) => re.test(w.toLowerCase()))![1];

// Месяцы: «15 ноября», «в декабре», «на январь».
const MONTH_STEMS = ['январ', 'феврал', 'март', 'апрел', 'ма[йяе]', 'июн', 'июл', 'август', 'сентябр', 'октябр', 'ноябр', 'декабр'];
const MONTH = `(${MONTH_STEMS.map((m) => `${m}[ьяеюиа]?`).join('|')})`;
const monthOf = (w: string): number => MONTH_STEMS.findIndex((m) => new RegExp(`^${m}`, 'iu').test(w));

const QUARTER_WORDS: Record<string, number> = { перв: 1, втор: 2, трет: 3, четв: 4, i: 1, ii: 2, iii: 3, iv: 4, '1': 1, '2': 2, '3': 3, '4': 4 };
const QUARTER = '(перв\\p{L}*|втор\\p{L}*|трет\\p{L}*|четв\\p{L}*|iv|iii|ii|i|[1-4])(?:-?(?:м|й|ом|ий))?';
const quarterOf = (w: string): number => {
  const k = w.toLowerCase();
  return QUARTER_WORDS[k] ?? QUARTER_WORDS[k.slice(0, 4)];
};

const pad = (n: number) => (n < 10 ? `0${n}` : String(n));
const keyOf = (d: Date): DayKey => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** Ближайший такой день недели после сегодняшнего: «в пятницу» в пятницу значит через неделю. */
function nextWeekday(today: DayKey, wd: number): DayKey {
  const now = parseDay(today).getDay();
  return addDays(today, ((wd - now + 7) % 7) || 7);
}

/** Дата без года: в этом году, а если она уже прошла, в следующем. null, если такой даты нет. */
function dateOf(today: DayKey, d: number, m: number, y?: number): DayKey | null {
  if (m < 0 || m > 11 || d < 1 || d > 31) return null;
  const year = y ?? parseDay(today).getFullYear();
  const date = new Date(year, m, d);
  if (date.getMonth() !== m) return null;
  const key = keyOf(date);
  return y === undefined && key < today ? keyOf(new Date(year + 1, m, d)) : key;
}

function fullYear(y: string | undefined): number | undefined {
  if (!y) return undefined;
  const n = Number(y);
  return n < 100 ? 2000 + n : n;
}

/** Месяц по номеру (0–11): этот год, а если месяц уже прошёл, следующий. */
function monthKey(today: DayKey, m: number): PeriodKey {
  const d = parseDay(today);
  const year = m < d.getMonth() ? d.getFullYear() + 1 : d.getFullYear();
  return `${year}-${pad(m + 1)}`;
}

function quarterKey(today: DayKey, q: number, y?: number): PeriodKey {
  const d = parseDay(today);
  const now = Math.floor(d.getMonth() / 3) + 1;
  const year = y ?? (q < now ? d.getFullYear() + 1 : d.getFullYear());
  return `${year}-Q${q}`;
}

/** Часы с пометкой «утра», «дня», «вечера», «ночи» в 24-часовые. */
function hour24(h: number, part: string | undefined): number {
  const p = (part ?? '').toLowerCase();
  if ((p === 'дня' || p === 'вечера') && h < 12) return h + 12;
  if (p === 'ночи' && h === 12) return 0;
  return h;
}

interface Ctx {
  today: DayKey;
  quests: Quest[];
}

type Rule = {
  kind: FoundKind;
  re: string;
  /** Что выставить; null, если совпадение не подошло (например, 31 февраля). */
  set: (m: RegExpExecArray, c: Ctx) => Partial<Omit<Parsed, 'title' | 'found'>> | null;
};

const H = '(?:час(?:а|ов)?|ч\\.?)';
const MIN = '(?:минут[уы]?|мин\\.?)';
const TAKES = '(?:на|займ[её]т|занимает|минимум|примерно|около)';

/**
 * Правила по порядку: длинные и точные раньше коротких, чтобы «до конца недели» не стало «неделей»,
 * а «послезавтра» не стало «завтра». Найденный кусок вырезается, и следующие правила его уже не видят.
 */
const RULES: Rule[] = [
  // Сроки: «до конца недели», «до пятницы», «к 15 ноября», «до 15.11».
  { kind: 'due', re: `(?:до|к)\\s+конц[ау]\\s+(?:этой\\s+)?недели`, set: (_, c) => ({ due: addDays(c.today, (7 - parseDay(c.today).getDay()) % 7) }) },
  { kind: 'due', re: `(?:до|к)\\s+конц[ау]\\s+(?:этого\\s+)?месяца`, set: (_, c) => ({ due: endOf(c.today, 'month') }) },
  { kind: 'due', re: `(?:до|к)\\s+конц[ау]\\s+(?:этого\\s+)?квартала`, set: (_, c) => ({ due: endOf(c.today, 'quarter') }) },
  { kind: 'due', re: `(?:до|к)\\s+конц[ау]\\s+(?:этого\\s+)?года`, set: (_, c) => ({ due: endOf(c.today, 'year') }) },
  { kind: 'due', re: `(?:до|к)\\s+${WEEKDAY}`, set: (m, c) => ({ due: nextWeekday(c.today, weekdayOf(m[1])) }) },
  { kind: 'due', re: `(?:до|к)\\s+(\\d{1,2})\\s+${MONTH}(?:\\s+(\\d{4}))?(?:\\s+года)?`, set: (m, c) => opt('due', dateOf(c.today, Number(m[1]), monthOf(m[2]), fullYear(m[3]))) },
  { kind: 'due', re: `(?:до|к)\\s+(\\d{1,2})[./](\\d{1,2})(?:[./](\\d{2,4}))?`, set: (m, c) => opt('due', dateOf(c.today, Number(m[1]), Number(m[2]) - 1, fullYear(m[3]))) },
  { kind: 'due', re: `(?:до|к)\\s+(?:послезавтра)`, set: (_, c) => ({ due: addDays(c.today, 2) }) },
  { kind: 'due', re: `(?:до|к)\\s+(?:завтра|завтрашнему\\s+дню|завтрашнего\\s+дня)`, set: (_, c) => ({ due: addDays(c.today, 1) }) },

  // Оценка: «на 2 часа», «займёт полчаса», «на весь день», «займёт неделю».
  { kind: 'estimate', re: `${TAKES}\\s+полчаса`, set: () => ({ estimate: 30 }) },
  { kind: 'estimate', re: `${TAKES}\\s+полтора\\s+часа`, set: () => ({ estimate: 90 }) },
  { kind: 'estimate', re: `${TAKES}\\s+(?:один\\s+|1\\s+)?час`, set: () => ({ estimate: 60 }) },
  { kind: 'estimate', re: `${TAKES}\\s+(\\d{1,2}(?:[.,]5)?|${Object.keys(NUM_WORDS).join('|')})\\s*${H}(?:\\s+(\\d{1,2})\\s*${MIN})?`, set: (m) => ({ estimate: Math.round(Number(m[1].replace(',', '.')) * 60 || num(m[1]) * 60) + Number(m[2] ?? 0) }) },
  { kind: 'estimate', re: `${TAKES}\\s+(\\d{1,3})\\s*${MIN}`, set: (m) => ({ estimate: Number(m[1]) }) },
  { kind: 'estimate', re: `(?:${TAKES}\\s+)?(?:весь|целый)\\s+день|займ[её]т\\s+день`, set: () => ({ estimate: 480 }) },
  { kind: 'estimate', re: `${TAKES}\\s+(?:несколько|пару|${NUM})\\s+(?:дн(?:я|ей)|день)|займ[её]т\\s+(?:неделю|месяц)`, set: () => ({ estimate: null }) },

  // Горизонты: «на неделю», «на следующей неделе», «в декабре», «в первом квартале», «на год».
  { kind: 'period', re: `(?:на|в)\\s+(?:следующ(?:ую|ей)|будущ(?:ую|ей))\\s+недел[юе]`, set: (_, c) => ({ period: shiftPeriod(periodOf('week', c.today), 1) }) },
  { kind: 'period', re: `(?:на\\s+(?:эту|этой|текущую|текущей)?\\s*недел[юе]|в\\s+(?:эту|этой)\\s+недел[юе])`, set: (_, c) => ({ period: periodOf('week', c.today) }) },
  { kind: 'period', re: `(?:на\\s+следующий\\s+месяц|в\\s+следующем\\s+месяце)`, set: (_, c) => ({ period: shiftPeriod(periodOf('month', c.today), 1) }) },
  { kind: 'period', re: `(?:на\\s+(?:этот|текущий)?\\s*месяц|в\\s+(?:этом|текущем)\\s+месяце)`, set: (_, c) => ({ period: periodOf('month', c.today) }) },
  { kind: 'period', re: `(?:на|в)\\s+${MONTH}(?:\\s+(\\d{4}))?`, set: (m, c) => ({ period: m[2] ? `${m[2]}-${pad(monthOf(m[1]) + 1)}` : monthKey(c.today, monthOf(m[1])) }) },
  { kind: 'period', re: `(?:на\\s+следующий\\s+квартал|в\\s+следующем\\s+квартале)`, set: (_, c) => ({ period: shiftPeriod(periodOf('quarter', c.today), 1) }) },
  { kind: 'period', re: `(?:на\\s+(?:этот|текущий)?\\s*квартал|в\\s+(?:этом|текущем)\\s+квартале)`, set: (_, c) => ({ period: periodOf('quarter', c.today) }) },
  { kind: 'period', re: `(?:на|в)\\s+${QUARTER}\\s+квартал[е]?(?:\\s+(\\d{4}))?`, set: (m, c) => ({ period: quarterKey(c.today, quarterOf(m[1]), m[2] ? Number(m[2]) : undefined) }) },
  { kind: 'period', re: `(?:на\\s+следующий\\s+год|в\\s+следующем\\s+году)`, set: (_, c) => ({ period: String(parseDay(c.today).getFullYear() + 1) }) },
  { kind: 'period', re: `(?:на\\s+(?:этот|текущий)?\\s*год|в\\s+(?:этом|текущем)\\s+году)`, set: (_, c) => ({ period: String(parseDay(c.today).getFullYear()) }) },
  { kind: 'period', re: `(?:на|в)\\s+(20\\d{2})\\s*(?:год[у]?|г\\.?)`, set: (m) => ({ period: m[1] }) },

  // Время: «в 19:00», «в 8 вечера», «в 9 часов».
  { kind: 'at', re: `(?:в|во|к)\\s+(\\d{1,2})(?::(\\d{2})|\\.(00|30))(?:\\s+(утра|дня|вечера|ночи))?`, set: (m) => clock(hour24(Number(m[1]), m[4]), Number(m[2] ?? m[3])) },
  { kind: 'at', re: `(\\d{1,2}):(\\d{2})`, set: (m) => clock(Number(m[1]), Number(m[2])) },
  { kind: 'at', re: `(?:в|во|к)\\s+(\\d{1,2})\\s*(?:${H}\\s*)?(утра|дня|вечера|ночи)`, set: (m) => clock(hour24(Number(m[1]), m[2]), 0) },
  { kind: 'at', re: `(?:в|во|к)\\s+(\\d{1,2})\\s*${H}`, set: (m) => clock(Number(m[1]), 0) },

  // День у костра: «сегодня», «завтра», «в пятницу», «через 3 дня», «15 ноября».
  { kind: 'day', re: `(?:на\\s+)?послезавтра`, set: (_, c) => ({ day: addDays(c.today, 2) }) },
  { kind: 'day', re: `(?:на\\s+)?завтра`, set: (_, c) => ({ day: addDays(c.today, 1) }) },
  { kind: 'day', re: `(?:на\\s+)?сегодня|на\\s+день(?!\\s+рождени)`, set: (_, c) => ({ day: c.today }) },
  { kind: 'day', re: `(?:в|во|на)\\s+${WEEKDAY}`, set: (m, c) => ({ day: nextWeekday(c.today, weekdayOf(m[1])) }) },
  { kind: 'day', re: `через\\s+${NUM}?\\s*(?:дн(?:я|ей)|день)`, set: (m, c) => ({ day: addDays(c.today, m[1] ? num(m[1]) : 1) }) },
  { kind: 'day', re: `через\\s+${NUM}?\\s*недел[юие]`, set: (m, c) => ({ day: addDays(c.today, 7 * (m[1] ? num(m[1]) : 1)) }) },
  { kind: 'day', re: `(?:на\\s+)?(\\d{1,2})\\s+${MONTH}(?:\\s+(\\d{4}))?`, set: (m, c) => opt('day', dateOf(c.today, Number(m[1]), monthOf(m[2]), fullYear(m[3]))) },

  // Поход: «#работа», «в поход Дом», «поход: Работа».
  { kind: 'quest', re: `#(\\p{L}[\\p{L}\\d_-]*)`, set: (m, c) => questBy(m[1], c.quests) },
  { kind: 'quest', re: `(?:в\\s+)?поход(?:е)?[:\\s]+[«"]?(\\p{L}[\\p{L}\\d-]*)[»"]?`, set: (m, c) => questBy(m[1], c.quests) },
];

/** Слова-команды в начале фразы: их не должно быть в названии. */
const COMMAND = new RegExp(
  `^\\s*(?:(?:пожалуйста|плиз)[,\\s]+)?(?:(?:добав(?:ь|ьте|ить)|созда(?:й|йте|ть)|запиш(?:и|ите)|постав(?:ь|ьте)|заведи)(?:\\s+(?:мне\\s+)?(?:нов(?:ую|ая)\\s+)?(?:задач[уа]|дело))?|нов(?:ая|ую)\\s+задач[уа]|задач[аи]|напомн(?:и|ите)(?:\\s+мне)?|надо|нужно)${R}[:,\\s—-]*`,
  'iu',
);

function endOf(today: DayKey, kind: 'month' | 'quarter' | 'year'): DayKey {
  return periodEnd(periodOf(kind, today));
}

function opt<K extends 'day' | 'due'>(k: K, v: DayKey | null): { [P in K]: DayKey } | null {
  return v ? ({ [k]: v } as { [P in K]: DayKey }) : null;
}

function clock(h: number, m: number): { at: string } | null {
  if (h > 23 || m > 59) return null;
  return { at: `${pad(h)}:${pad(m)}` };
}

/** Поход по слову: точное имя, потом начало имени, потом начало любого слова в имени. */
function questBy(word: string, quests: Quest[]): { questId: string } | null {
  const w = word.toLowerCase().replace(/ё/g, 'е');
  const norm = (q: Quest) => q.name.toLowerCase().replace(/ё/g, 'е');
  const live = quests.filter((q) => !q.wonAt);
  if (w.length < 3) return null;
  const stem = w.length > 4 ? w.slice(0, w.length - 1) : w;
  const q =
    live.find((x) => norm(x) === w) ??
    live.find((x) => norm(x).startsWith(stem)) ??
    live.find((x) => norm(x).split(/[^\p{L}\d]+/u).some((part) => part.startsWith(stem)));
  return q ? { questId: q.id } : null;
}

const QUOTES = /["«“„]([^"»”“]+)["»”“]/u;

/** Разобрать фразу. Ничего не меняет в игре: что поставить, решает форма. */
export function parsePhrase(text: string, today: DayKey, quests: Quest[] = []): Parsed {
  const out: Parsed = { title: '', found: [] };
  let rest = text;
  let title: string | null = null;
  const q = QUOTES.exec(rest);
  if (q && q[1].trim()) {
    title = q[1].trim();
    rest = `${rest.slice(0, q.index)} \u0000 ${rest.slice(q.index + q[0].length)}`;
  }
  rest = rest.replace(COMMAND, ' ');
  const hits: { at: number; kind: FoundKind; text: string }[] = [];
  const ctx: Ctx = { today, quests };
  for (const rule of RULES) {
    if (out[FIELD[rule.kind]] !== undefined) continue;
    const re = new RegExp(`${L}(?:${rule.re})${R}`, "iu");
    const m = re.exec(rest);
    if (!m) continue;
    const got = rule.set(m, ctx);
    if (!got) continue;
    Object.assign(out, got);
    hits.push({ at: m.index, kind: rule.kind, text: m[0].trim() });
    rest = `${rest.slice(0, m.index)} \u0001 ${rest.slice(m.index + m[0].length)}`;
  }
  out.found = hits.sort((a, b) => a.at - b.at).map(({ kind, text }) => ({ kind, text }));
  const left = rest
    .replace(/[\u0000\u0001]/g, ' ')
    .replace(COMMAND, ' ')
    .replace(/\s+([,.;:!?])/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[\s,.;:—–-]+|[\s,;:—–-]+$/g, '')
    .trim();
  const name = title ?? left;
  out.title = name ? name[0].toUpperCase() + name.slice(1) : '';
  return out;
}

const FIELD: Record<FoundKind, 'day' | 'due' | 'at' | 'estimate' | 'period' | 'questId'> = {
  day: 'day',
  due: 'due',
  at: 'at',
  estimate: 'estimate',
  period: 'period',
  quest: 'questId',
};
