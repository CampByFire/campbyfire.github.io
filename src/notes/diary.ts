// Дневник Летописи: файл на день, записи в нём с временем. Здесь только чистые функции без сети.
//
//   diary/2026/2026-11-04.md
//
//   ## 08:12
//
//   Проснулся раньше будильника.
//
//   ## 21:40 Новая глава
//
//   Вечером дописал главу.
//
// Название записи идёт в её заголовке после времени, его можно не писать.
// Текст до первого «## ЧЧ:ММ» (например, написанный руками на GitHub) тоже запись, только без времени
// и без названия: в файле ему негде лежать.
// День считается игровым: запись в 01:30 ночи попадает во вчерашний день, как и в игре.
import { DAY_STARTS_AT_HOUR } from '../game/rules';
import { dayKey } from '../game/time';
import type { DayKey } from '../game/types';
import { DIARY_DIR } from '../sync/github';

export interface DiaryEntry {
  /** «08:12»; пустая строка у текста без времени. */
  time: string;
  /** Название записи; у записи без названия поля нет. */
  title?: string;
  text: string;
}

/** Запись из того, что ввели: название в одну строку, пустое не хранится. */
export function diaryEntry(time: string, text: string, title = ''): DiaryEntry {
  const name = time ? title.replace(/\s+/g, ' ').trim() : '';
  return name ? { time, title: name, text } : { time, text };
}

/** Одна и та же запись: совпали время, название и текст. */
export const sameEntry = (a: DiaryEntry, b: DiaryEntry) => a.time === b.time && (a.title ?? '') === (b.title ?? '') && a.text.trim() === b.text.trim();

export interface DiaryDay {
  day: DayKey;
  path: string;
  entries: DiaryEntry[];
}

/** Файл дня: diary/2026/2026-11-04.md. */
export const diaryPath = (day: DayKey) => `${DIARY_DIR}/${day.slice(0, 4)}/${day}.md`;

/** День по пути файла дневника; годится и файл без папки года (diary/2026-11-04.md). */
export function diaryDay(path: string): DayKey | null {
  const m = path.match(/^diary\/(?:[^/]+\/)?(\d{4}-\d{2}-\d{2})\.md$/);
  return m ? m[1] : null;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Время записи в файле: «08:12». */
export function entryTime(t: number): string {
  const d = new Date(t);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Игровой день записи, сделанной в момент t. */
export const entryDay = (t: number): DayKey => dayKey(t);

const HEAD = /^##[ \t]+(\d{1,2}:\d{2})(?:[ \t]+(.+?))?[ \t]*$/;

export function parseDiary(text: string): DiaryEntry[] {
  const out: DiaryEntry[] = [];
  let time = '';
  let title = '';
  const lines: string[] = [];
  const flush = () => {
    const body = lines.join('\n').trim();
    if (time || body) out.push(diaryEntry(time, body, title));
    lines.length = 0;
  };
  for (const line of text.replace(/\r\n?/g, '\n').split('\n')) {
    const m = line.match(HEAD);
    if (m) {
      flush();
      time = m[1].padStart(5, '0');
      title = m[2] ?? '';
    } else lines.push(line);
  }
  flush();
  return out;
}

export function diaryText(entries: DiaryEntry[]): string {
  return entries
    .filter((e) => e.time || e.text.trim())
    .map((e) => (e.time ? `## ${e.time}${e.title ? ` ${e.title}` : ''}\n\n${e.text.trim()}` : e.text.trim()))
    .join('\n\n')
    .concat('\n')
    .replace(/^\n$/, '');
}

/** Порядок записей в дне: текст без времени первым, ночные (до начала игрового дня) последними. */
function order(e: DiaryEntry): number {
  if (!e.time) return -1;
  const [h, m] = e.time.split(':').map(Number);
  return (h < DAY_STARTS_AT_HOUR ? h + 24 : h) * 60 + m;
}

export const sortEntries = (list: DiaryEntry[]) => list.map((e, i) => ({ e, i })).sort((a, b) => order(a.e) - order(b.e) || a.i - b.i).map((x) => x.e);

const key = (e: DiaryEntry) => `${e.time}\n${e.title ?? ''}\n${e.text.trim()}`;

/**
 * Слияние дня, который меняли на двух устройствах. base это версия из GitHub, от которой шли свои
 * правки ('' если файла не было), local своя, remote та, что сейчас в GitHub. Записи сравниваются
 * целиком: новые с обеих сторон остаются, удалённая на одной стороне запись удаляется, если другая
 * её не трогала. Поправленная запись это удаление старой и новая. Ничего написанного не теряется.
 */
export function mergeDiary(base: string, local: string, remote: string): string {
  const b = new Set(parseDiary(base).map(key));
  const l = parseDiary(local);
  const lKeys = new Set(l.map(key));
  const r = parseDiary(remote);
  const rKeys = new Set(r.map(key));
  const out = r.filter((e) => lKeys.has(key(e)) || !b.has(key(e)));
  for (const e of l) if (!rKeys.has(key(e)) && !b.has(key(e))) out.push(e);
  return diaryText(sortEntries(out));
}
