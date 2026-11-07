// Черновики заметок: то, что набрано и ещё не сохранено кнопкой. Лежат только в этом браузере и в
// GitHub не уходят, поэтому не тратят обращения к нему. Черновик живёт отдельно от заметок: его нет
// в списках и поиске, пока игрок не нажмёт «Сохранить».
import { parseMarkdown, toMarkdown } from './markdown';

const KEY = 'taskcraft-lager-drafts';

export interface DraftText {
  title: string;
  text: string;
}

export interface Draft extends DraftText {
  at: number;
  /** Текст заметки, с которого начат черновик. У новой статьи его нет. */
  base?: string;
}

/** Часть localStorage, которая нужна черновикам. */
export type DraftStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/** У правки черновик по пути заметки, у новой статьи один на раздел. */
export const draftKey = (slug: string, path?: string) => path ?? `new:${slug}`;

function readAll(store: DraftStorage): Record<string, Draft> {
  try {
    return (JSON.parse(store.getItem(KEY) ?? '{}') as Record<string, Draft> | null) ?? {};
  } catch {
    return {};
  }
}

function writeAll(all: Record<string, Draft>, store: DraftStorage): void {
  try {
    if (Object.keys(all).length) store.setItem(KEY, JSON.stringify(all));
    else store.removeItem(KEY);
  } catch {
    // Не поместилось: текст остаётся в открытом листе, и его можно сохранить кнопкой.
  }
}

export function loadDraft(key: string, store: DraftStorage = localStorage): Draft | null {
  return readAll(store)[key] ?? null;
}

/** Редактор отдаёт Markdown в своём виде, поэтому заметка без правок сравнивается и в этом виде тоже. */
const sameText = (a: string, b: string) => a === b || a === toMarkdown(parseMarkdown(b));

/**
 * Запомнить набранное. Если текст стёрт или вернулся к сохранённому, черновика больше нет: так его
 * и выбрасывают, отдельной кнопки для этого нет.
 */
export function putDraft(key: string, now: DraftText, base: DraftText, at: number, store: DraftStorage = localStorage): void {
  const all = readAll(store);
  const empty = !now.title.trim() && !now.text.trim();
  if (empty || (now.title === base.title && sameText(now.text, base.text))) delete all[key];
  else all[key] = { ...now, at, ...(base.text || base.title ? { base: base.text } : {}) };
  writeAll(all, store);
}

export function dropDraft(key: string, store: DraftStorage = localStorage): void {
  const all = readAll(store);
  delete all[key];
  writeAll(all, store);
}

/** Черновики раздела, свежие сверху. path есть у правки заметки, у новой статьи его нет. */
export function sectionDrafts(slug: string, store: DraftStorage = localStorage): (Draft & { key: string; path?: string })[] {
  const newKey = draftKey(slug);
  return Object.entries(readAll(store))
    .filter(([key]) => key === newKey || key.startsWith(`notes/${slug}/`))
    .map(([key, d]) => ({ ...d, key, ...(key === newKey ? {} : { path: key }) }))
    .sort((a, b) => b.at - a.at);
}

/** Заметка изменилась с тех пор, как начат черновик (например, на другом устройстве). */
export const draftOutdated = (draft: Draft, current: string) => draft.base !== undefined && draft.base !== current;

/** «Стереть всё»: черновики стираются вместе с заметками в браузере. */
export function clearDrafts(store: DraftStorage = localStorage): void {
  try {
    store.removeItem(KEY);
  } catch {
    // Нечего забывать.
  }
}
