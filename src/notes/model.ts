// Заметки Летописи в репозитории: что в каком файле лежит. Здесь только чистые функции без сети.
//
//   notes/<раздел>/_razdel.json   название, значок и вид раздела
//   notes/<раздел>/<имя>.md       одна заметка: обычный Markdown
//   notes/<раздел>/<папка>/…      папка внутри раздела: заметки и свои папки, сколько угодно вглубь
//   notes/<раздел>/<папка>/_papka.json   название папки
//
// В ленте имя файла это дата и время записи (2026-11-04-0812.md), у статьи это её заголовок
// латиницей (kak-ya-planiruyu.md), а сам заголовок стоит первой строкой «# …». Название раздела
// лежит в _razdel.json, а не в имени папки: переименовать раздел значит поправить один файл.
import { NOTES_DIR } from '../sync/github';

/** Лента: короткие записи по одному полю. Статьи: заголовок и длинный текст. */
export type SectionKind = 'lenta' | 'stati';

/** Значки разделов: контурные иконки из icons.ts. */
export const SECTION_ICONS = ['bulb', 'book', 'feather', 'star', 'list', 'flag'] as const;
export type SectionIcon = (typeof SECTION_ICONS)[number];

export const META_FILE = '_razdel.json';
/** Название папки внутри раздела; у самого раздела вместо него _razdel.json. */
export const FOLDER_FILE = '_papka.json';

export interface SectionMeta {
  title: string;
  icon: SectionIcon;
  vid: SectionKind;
}

export interface Section extends SectionMeta {
  /** Имя папки: notes/<slug>/. */
  slug: string;
}

/** Папка внутри раздела. */
export interface Folder {
  /** Раздел, в котором она лежит. */
  slug: string;
  /** Путь от папки раздела: «proekty» или «proekty/lager». */
  path: string;
  title: string;
}

export interface Note {
  path: string;
  slug: string;
  /** Папка внутри раздела; '' у заметки, которая лежит прямо в разделе. */
  folder: string;
  text: string;
  /** Для статьи: заголовок из первой строки «# …». */
  title: string;
  /** Текст без строки заголовка. */
  body: string;
  /** Когда записана, если это видно по имени файла (лента); иначе null. */
  at: number | null;
}

const RU: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm',
  н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch',
  ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
};

/** Имя для файла или папки из любого текста: латиница, цифры и дефисы, не длиннее 40 знаков. */
export function slugify(text: string, fallback: string): string {
  const latin = [...text.toLowerCase()].map((c) => RU[c] ?? c).join('');
  const slug = latin
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/g, '');
  return slug || fallback;
}

/** Первое свободное имя: name, name-2, name-3… */
export function freeName(name: string, taken: (candidate: string) => boolean): string {
  if (!taken(name)) return name;
  for (let i = 2; ; i++) if (!taken(`${name}-${i}`)) return `${name}-${i}`;
}

export const sectionDir = (slug: string) => `${NOTES_DIR}/${slug}`;
export const metaPath = (slug: string) => `${sectionDir(slug)}/${META_FILE}`;

/** Папка с заметками: сам раздел или папка внутри него. */
export const folderDir = (slug: string, folder: string) => (folder ? `${sectionDir(slug)}/${folder}` : sectionDir(slug));
export const folderMetaPath = (slug: string, folder: string) => `${folderDir(slug, folder)}/${FOLDER_FILE}`;

/** Раздел, папка внутри него и имя файла из пути notes/<slug>/[<папка>/…]<file>; null для файлов не из раздела. */
export function splitPath(path: string): { slug: string; folder: string; file: string } | null {
  const m = path.match(/^notes\/([^/]+)\/(?:(.+)\/)?([^/]+)$/);
  return m ? { slug: m[1], folder: m[2] ?? '', file: m[3] } : null;
}

/** Папка, в которой лежит папка: «a/b» → «a», «a» → ''. */
export const parentFolder = (folder: string) => folder.slice(0, Math.max(0, folder.lastIndexOf('/')));

/** Последняя часть пути папки: «a/b» → «b». */
export const folderName = (folder: string) => folder.slice(folder.lastIndexOf('/') + 1);

/** Папка folder лежит в папке parent (или это она сама). У раздела parent это ''. */
export const insideFolder = (folder: string, parent: string) => !parent || folder === parent || folder.startsWith(`${parent}/`);

/** Название папки из _papka.json; без файла или с испорченным файлом это имя самой папки. */
export function parseFolderMeta(slug: string, path: string, text: string | null): Folder {
  let title = '';
  try {
    const raw = (text ? JSON.parse(text) : null) as { title?: unknown } | null;
    if (raw && typeof raw.title === 'string') title = raw.title.trim();
  } catch {
    title = '';
  }
  return { slug, path, title: title || folderName(path) };
}

export const folderMetaText = (title: string) => `${JSON.stringify({ title }, null, 2)}\n`;

const pad = (n: number) => String(n).padStart(2, '0');

/** Имя файла записи в ленте по местному времени: 2026-11-04-0812. */
export function stampName(t: number): string {
  const d = new Date(t);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
}

/** Время записи по имени файла ленты, если оно в таком виде. */
export function stampTime(file: string): number | null {
  const m = file.match(/^(\d{4})-(\d{2})-(\d{2})-(\d{2})(\d{2})/);
  return m ? new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]).getTime() : null;
}

export function parseMeta(slug: string, text: string | null): Section {
  let raw: Partial<Record<keyof SectionMeta, unknown>> = {};
  try {
    raw = (text ? JSON.parse(text) : {}) ?? {};
  } catch {
    raw = {};
  }
  const title = typeof raw.title === 'string' && raw.title.trim() ? raw.title.trim() : slug;
  const icon = SECTION_ICONS.includes(raw.icon as SectionIcon) ? (raw.icon as SectionIcon) : 'book';
  const vid: SectionKind = raw.vid === 'stati' ? 'stati' : 'lenta';
  return { slug, title, icon, vid };
}

export function metaText(m: SectionMeta): string {
  return `${JSON.stringify({ title: m.title, icon: m.icon, vid: m.vid }, null, 2)}\n`;
}

/** Заметка из файла: у статьи первая строка «# …» это заголовок. */
export function parseNote(path: string, text: string): Note {
  const parts = splitPath(path);
  const file = parts?.file ?? path;
  const m = text.match(/^#[ \t]+(.*)\r?\n?/);
  const title = m ? m[1].trim() : '';
  const body = m ? text.slice(m[0].length).replace(/^\s*\n/, '') : text;
  return { path, slug: parts?.slug ?? '', folder: parts?.folder ?? '', text, title, body, at: stampTime(file) };
}

/** Текст файла статьи: заголовок первой строкой, потом пустая строка и текст. */
export function articleText(title: string, body: string): string {
  const t = title.trim();
  const b = body.trim();
  return t ? `# ${t}\n\n${b}${b ? '\n' : ''}` : `${b}\n`;
}

/** Текст файла записи ленты. */
export const feedText = (text: string) => `${text.trim()}\n`;

/** Где сохранить свою версию, если ту же заметку успели поменять на другом устройстве. */
export function conflictPath(path: string, device: string, taken: (p: string) => boolean): string {
  const dot = path.lastIndexOf('.');
  const base = dot > path.lastIndexOf('/') ? path.slice(0, dot) : path;
  const ext = dot > path.lastIndexOf('/') ? path.slice(dot) : '';
  const tag = device === 'телефон' ? 's-telefona' : device === 'компьютер' ? 's-kompyutera' : slugify(device, 'kopiya');
  const name = freeName(`${base}-${tag}`, (c) => taken(`${c}${ext}`));
  return `${name}${ext}`;
}
