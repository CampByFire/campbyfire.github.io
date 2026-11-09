// Поиск по Летописи: заметки всех разделов и записи дневника, без учёта регистра и «ё».
import type { DayKey } from '../game/types';
import type { DiaryEntry } from './diary';
import { plainText } from './markdown';
import type { Notes } from './notes';

export type Hit =
  | { kind: 'note'; path: string; slug: string; where: string; title: string; snippet: Snippet }
  | { kind: 'diary'; path: string; day: DayKey; entry: DiaryEntry; snippet: Snippet };

/** Кусок текста вокруг найденного: до, найденное, после. */
export interface Snippet {
  before: string;
  match: string;
  after: string;
}

const norm = (s: string) => s.toLowerCase().replace(/ё/g, 'е');

/** Где в тексте запрос; null, если нет. Длина совпадает с исходной, поэтому кусок берётся из оригинала. */
export function snippet(text: string, query: string, around = 40): Snippet | null {
  const flat = text.replace(/\s+/g, ' ').trim();
  const q = norm(query.trim().replace(/\s+/g, ' '));
  if (!q) return null;
  const at = norm(flat).indexOf(q);
  if (at < 0) return null;
  const from = Math.max(0, at - around);
  const to = Math.min(flat.length, at + q.length + around * 2);
  return {
    before: `${from > 0 ? '…' : ''}${flat.slice(from, at)}`,
    match: flat.slice(at, at + q.length),
    after: `${flat.slice(at + q.length, to)}${to < flat.length ? '…' : ''}`,
  };
}

/** Найденное, сначала заметки по разделам, потом дневник от новых дней. Не больше limit. */
export function search(notes: Notes, query: string, limit = 50): Hit[] {
  if (query.trim().length < 2) return [];
  const hits: Hit[] = [];
  for (const s of notes.sections()) {
    for (const n of notes.notes(s.slug)) {
      const text = s.vid === 'stati' ? `${n.title}\n${plainText(n.body)}` : plainText(n.text);
      const sn = snippet(text, query);
      const folder = n.folder ? notes.folder(s.slug, n.folder) : null;
      const where = folder ? `${s.title} · ${folder.title}` : s.title;
      if (sn) hits.push({ kind: 'note', path: n.path, slug: s.slug, where, title: s.vid === 'stati' ? n.title || 'Без названия' : '', snippet: sn });
    }
  }
  for (const d of notes.diary()) {
    for (const e of d.entries) {
      const sn = snippet(`${e.title ?? ''}\n${plainText(e.text)}`, query);
      if (sn) hits.push({ kind: 'diary', path: d.path, day: d.day, entry: e, snippet: sn });
    }
  }
  return hits.slice(0, limit);
}
