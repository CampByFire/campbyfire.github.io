// Заметки Летописи: свои разделы и заметки в них. Каждая заметка это отдельный файл в репозитории
// lager-data (раскладка в model.ts), а не часть сохранения игры: стереть игру можно, не теряя заметок.
//
// Устройство держит копию всех файлов notes/ в localStorage и показывает заметки из неё, поэтому
// записать мысль можно и без сети, и без GitHub. Изменённые файлы помечены dirty и уходят в GitHub,
// когда он подключён и есть сеть. Сверка: одним запросом список файлов notes/ с их sha, скачиваются
// только новые и изменённые, потом записываются свои изменения.
//
// Новая заметка всегда новый файл, поэтому с другим устройством она не сталкивается. Если одну и ту же
// заметку поменяли на двух устройствах, GitHub не примет запись со старым sha: тогда своя версия
// ложится рядом отдельным файлом «…-s-telefona.md», а заметка берётся из GitHub. Ничего не затирается.
//
// Дневник (diary/, раскладка в diary.ts) лежит здесь же, но в его день пишут с обоих устройств, поэтому
// столкновение там обычное дело: записи дня сливаются (mergeDiary), а не ложатся копией рядом.
import type { DayKey } from '../game/types';
import { DIARY_DIR, GitHub, GitHubError, NOTES_DIR, type Fetch } from '../sync/github';
import { diaryDay, diaryPath, diaryText, entryDay, entryTime, mergeDiary, parseDiary, sortEntries, type DiaryDay, type DiaryEntry } from './diary';
import {
  META_FILE,
  articleText,
  conflictPath,
  feedText,
  freeName,
  metaPath,
  metaText,
  parseMeta,
  parseNote,
  sectionDir,
  slugify,
  splitPath,
  stampName,
  type Note,
  type Section,
  type SectionMeta,
} from './model';

const KEY = 'taskcraft-lager-notes';
/** Пауза после правки перед записью: несколько правок подряд уходят вместе. */
const PUSH_DELAY = 2000;
/** Как часто смотреть, не появилось ли новое с другого устройства. */
const POLL_EVERY = 2 * 60_000;

interface FileRec {
  text: string;
  /** sha версии из GitHub, на которой основан текст; null, если файла там ещё нет. */
  sha: string | null;
  /** Есть изменения, которых нет в GitHub. */
  dirty: boolean;
  /** Удалён здесь, ждёт удаления в GitHub. */
  deleted?: boolean;
  /** Растёт при каждой правке: правка во время записи не теряется. */
  rev: number;
  /** Для дня дневника со своими правками: версия из GitHub, от которой они шли (для слияния). */
  base?: string;
}

interface Saved {
  v: 1;
  files: Record<string, FileRec>;
  syncedAt: number | null;
}

export interface NotesStorage {
  load(): string | null;
  save(json: string): void;
  clear(): void;
}

export const browserNotesStorage: NotesStorage = {
  load() {
    try {
      return localStorage.getItem(KEY);
    } catch {
      return null;
    }
  },
  save(json) {
    try {
      localStorage.setItem(KEY, json);
    } catch {
      // Без localStorage заметки живут, пока открыта страница, и уходят в GitHub, если он подключён.
    }
  },
  clear() {
    try {
      localStorage.removeItem(KEY);
    } catch {
      // Хранилище недоступно: стирать нечего.
    }
  },
};

/** Откуда Летопись берёт доступ к GitHub: из подключения игры. */
export interface NotesHost {
  readonly access: { token: string; repo: string; branch: string } | null;
  readonly deviceName: string;
  subscribe(fn: () => void): () => void;
}

/** local: GitHub не подключён, заметки только в этом браузере. */
export type NotesPhase = 'local' | 'syncing' | 'ok' | 'offline' | 'error';

export interface NotesStatus {
  phase: NotesPhase;
  error: string | null;
  syncedAt: number | null;
}

export interface NotesOptions {
  storage?: NotesStorage;
  fetchFn?: Fetch;
  now?: () => number;
  delay?: number;
}

const isNoteFile = (path: string) => /\.md$/i.test(path);
const isMetaFile = (path: string) => path.endsWith(`/${META_FILE}`);
const isDiary = (path: string) => diaryDay(path) !== null;
/** Какие файлы репозитория Летопись держит у себя: заметки, _razdel.json и дни дневника. */
const isOurs = (path: string) => (path.startsWith(`${NOTES_DIR}/`) ? isNoteFile(path) || isMetaFile(path) : isDiary(path));
const sameEntry = (a: DiaryEntry, b: DiaryEntry) => a.time === b.time && a.text.trim() === b.text.trim();

export class Notes {
  status: NotesStatus;
  /** Сообщение для игрока о том, что случилось при сверке (своя версия легла копией). */
  onNotice: ((text: string) => void) | null = null;
  private files: Record<string, FileRec>;
  private listeners = new Set<() => void>();
  private running: Promise<void> | null = null;
  private again = false;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private storage: NotesStorage;
  private fetchFn?: Fetch;
  private now: () => number;
  private delay: number;
  private connected: boolean;

  constructor(
    private host: NotesHost,
    opts: NotesOptions = {},
  ) {
    this.storage = opts.storage ?? browserNotesStorage;
    this.fetchFn = opts.fetchFn;
    this.now = opts.now ?? (() => Date.now());
    this.delay = opts.delay ?? PUSH_DELAY;
    const saved = this.load();
    this.files = saved.files;
    this.connected = !!host.access;
    this.status = { phase: this.connected ? 'ok' : 'local', error: null, syncedAt: saved.syncedAt };
    // GitHub подключили или отключили в Настройках: сверяемся сразу.
    host.subscribe(() => {
      const now = !!this.host.access;
      if (now === this.connected) return;
      this.connected = now;
      if (now) void this.syncNow();
      else this.setStatus({ phase: 'local', error: null });
    });
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  // ---------- что показывать ----------

  /** Разделы по алфавиту: папки notes/, где есть хоть один файл. */
  sections(): Section[] {
    const slugs = new Set<string>();
    for (const path of this.paths()) {
      const p = splitPath(path);
      if (p) slugs.add(p.slug);
    }
    return [...slugs].map((slug) => this.meta(slug)).sort((a, b) => a.title.localeCompare(b.title, 'ru'));
  }

  section(slug: string): Section | null {
    return this.paths().some((p) => splitPath(p)?.slug === slug) ? this.meta(slug) : null;
  }

  /** Заметки раздела: в ленте новые сверху, статьи по заголовку. */
  notes(slug: string): Note[] {
    const list = this.paths()
      .filter((p) => isNoteFile(p) && splitPath(p)?.slug === slug)
      .map((p) => parseNote(p, this.files[p].text));
    if (this.meta(slug).vid === 'stati') return list.sort((a, b) => (a.title || a.path).localeCompare(b.title || b.path, 'ru'));
    // Имена ленты это время записи: по ним и сортируем (без «.md», иначе 0812-2 встало бы после 0812).
    const key = (n: Note) => n.path.replace(/\.md$/i, '');
    return list.sort((a, b) => (key(a) < key(b) ? 1 : key(a) > key(b) ? -1 : 0));
  }

  note(path: string): Note | null {
    const f = this.files[path];
    return f && !f.deleted ? parseNote(path, f.text) : null;
  }

  /** Дни дневника, новые сверху. */
  diary(): DiaryDay[] {
    return this.paths()
      .flatMap((path) => {
        const day = diaryDay(path);
        return day ? [{ day, path, entries: parseDiary(this.files[path].text) }] : [];
      })
      .sort((a, b) => (a.day < b.day ? 1 : a.day > b.day ? -1 : a.path.localeCompare(b.path)));
  }

  /** Сколько изменений ещё не в GitHub. */
  get pending(): number {
    return Object.values(this.files).filter((f) => f.dirty).length;
  }

  // ---------- правки ----------

  /** Новый раздел; вернёт имя его папки. */
  createSection(meta: SectionMeta): string {
    const title = meta.title.trim();
    const slug = freeName(slugify(title, 'razdel'), (c) => this.taken(sectionDir(c), true));
    this.put(metaPath(slug), metaText({ ...meta, title }));
    return slug;
  }

  /** Новое название, значок или вид: правится только _razdel.json, папка и заметки на месте. */
  updateSection(slug: string, meta: SectionMeta): void {
    this.put(metaPath(slug), metaText({ ...meta, title: meta.title.trim() || slug }));
  }

  /** Удаляет раздел со всеми заметками; вернёт, сколько заметок удалено. */
  deleteSection(slug: string): number {
    const paths = this.paths().filter((p) => splitPath(p)?.slug === slug);
    for (const p of paths) this.drop(p);
    this.changed();
    return paths.filter(isNoteFile).length;
  }

  /** Новая заметка: в ленте имя по времени, у статьи по заголовку. Вернёт путь файла. */
  addNote(slug: string, note: { title?: string; text: string }): string {
    const section = this.meta(slug);
    const stati = section.vid === 'stati';
    const base = stati ? slugify(note.title ?? '', 'bez-nazvaniya') : stampName(this.now());
    const name = freeName(base, (c) => this.taken(`${sectionDir(slug)}/${c}.md`, false));
    const path = `${sectionDir(slug)}/${name}.md`;
    // Первая заметка в папке, у которой нет _razdel.json (её сделали руками): раздел остаётся как был.
    this.put(path, stati ? articleText(note.title ?? '', note.text) : feedText(note.text));
    return path;
  }

  saveNote(path: string, note: { title?: string; text: string }): void {
    const slug = splitPath(path)?.slug ?? '';
    const text = this.meta(slug).vid === 'stati' ? articleText(note.title ?? '', note.text) : feedText(note.text);
    if (this.files[path]?.text === text) return;
    this.put(path, text);
  }

  deleteNote(path: string): void {
    this.drop(path);
    this.changed();
  }

  /** Запись в дневник за сегодняшний (игровой) день: дописывается в файл дня. Вернёт путь файла. */
  addDiary(text: string): string {
    const t = this.now();
    const day: DayKey = entryDay(t);
    const path = this.paths().find((p) => diaryDay(p) === day) ?? diaryPath(day);
    const rec = this.files[path];
    const entries = rec && !rec.deleted ? parseDiary(rec.text) : [];
    entries.push({ time: entryTime(t), text: text.trim() });
    this.put(path, diaryText(sortEntries(entries)));
    return path;
  }

  /** Правит запись дня; пустой текст удаляет её, а с последней записью уходит и файл дня. */
  saveDiaryEntry(path: string, entry: DiaryEntry, text: string): void {
    const rec = this.files[path];
    if (!rec || rec.deleted) return;
    const entries = parseDiary(rec.text);
    const i = entries.findIndex((e) => sameEntry(e, entry));
    if (i < 0) return;
    if (text.trim()) entries[i] = { time: entry.time, text: text.trim() };
    else entries.splice(i, 1);
    if (entries.length) {
      const next = diaryText(entries);
      if (next !== rec.text) this.put(path, next);
    } else {
      this.drop(path);
      this.changed();
    }
  }

  // ---------- GitHub ----------

  /** Сверить с GitHub сейчас. Если сверка уже идёт, после неё будет ещё одна. */
  syncNow(): Promise<void> {
    if (!this.host.access) return Promise.resolve();
    if (this.running) {
      this.again = true;
      return this.running;
    }
    this.running = this.run().finally(() => {
      this.running = null;
      if (this.again) {
        this.again = false;
        void this.syncNow();
      }
    });
    return this.running;
  }

  /** «Стереть всё»: заметки уходят из этого браузера. Те, что уже в GitHub, там и остаются. */
  clear(): void {
    clearTimeout(this.timer);
    this.files = {};
    this.storage.clear();
    this.setStatus({ syncedAt: null });
  }

  /** Для браузера: сверка при запуске, по таймеру, при возвращении в приложение и появлении сети. */
  start(): () => void {
    void this.syncNow();
    const poll = setInterval(() => {
      if (document.visibilityState === 'visible') void this.syncNow();
    }, POLL_EVERY);
    const onVis = () => {
      if (document.visibilityState === 'visible' || this.pending > 0) void this.syncNow();
    };
    const onOnline = () => void this.syncNow();
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('online', onOnline);
    return () => {
      clearInterval(poll);
      clearTimeout(this.timer);
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('online', onOnline);
    };
  }

  // ---------- внутри ----------

  private async run(): Promise<void> {
    const acc = this.host.access;
    if (!acc) return;
    const gh = new GitHub(acc.token, this.fetchFn);
    this.setStatus({ phase: 'syncing', error: null });
    try {
      await this.pull(gh, acc.repo, acc.branch);
      // Свою версию положили рядом копией: заберём заметку из GitHub и запишем копию.
      if (await this.push(gh, acc.repo)) {
        await this.pull(gh, acc.repo, acc.branch);
        await this.push(gh, acc.repo);
      }
      this.setStatus({ phase: 'ok', error: null, syncedAt: this.now() });
      this.save();
    } catch (e) {
      const err = e instanceof GitHubError ? e : new GitHubError('Не получилось сохранить заметки в GitHub', 'other');
      this.save();
      this.setStatus({ phase: err.kind === 'network' ? 'offline' : 'error', error: err.message });
    }
  }

  /** Забирает новое и изменённое из GitHub; то, что удалили там, удаляется и здесь. */
  private async pull(gh: GitHub, repo: string, branch: string): Promise<void> {
    const remote = new Map((await gh.files(repo, branch, [NOTES_DIR, DIARY_DIR])).filter((f) => isOurs(f.path)).map((f) => [f.path, f.sha]));
    for (const [path, sha] of remote) {
      const rec = this.files[path];
      if (rec?.dirty && rec.sha !== sha && isDiary(path)) {
        await this.mergeDay(gh, repo, path, sha);
        continue;
      }
      if (rec && (rec.sha === sha || rec.dirty)) continue;
      const text = await gh.blob(repo, sha);
      // Пока качали, заметку поправили здесь: правку не трогаем, разницу решит запись.
      const now = this.files[path];
      if (now !== rec || (now && now.dirty)) continue;
      this.files[path] = { text, sha, dirty: false, rev: rec?.rev ?? 0 };
    }
    for (const [path, rec] of Object.entries(this.files)) {
      if (remote.has(path) || !rec.sha) continue;
      // В GitHub файла больше нет: его удалили на другом устройстве или руками.
      if (!rec.dirty || rec.deleted) delete this.files[path];
      else if (isDiary(path) && rec.base !== undefined) {
        // День дневника удалили там, а здесь дописали: остаются только свои новые записи.
        const left = mergeDiary(rec.base, rec.text, '');
        if (left) Object.assign(rec, { text: left, sha: null, base: undefined, rev: rec.rev + 1 });
        else delete this.files[path];
      } else Object.assign(rec, { sha: null, base: undefined });
    }
    this.changed(false);
  }

  /** День дневника поменяли и здесь, и на другом устройстве: записи сливаются, итог уйдёт записью. */
  private async mergeDay(gh: GitHub, repo: string, path: string, sha: string): Promise<void> {
    const rec = this.files[path];
    const rev = rec.rev;
    const remote = await gh.blob(repo, sha);
    if (this.files[path] !== rec || rec.rev !== rev) return; // правка пришла, пока качали: сольём в следующий раз
    const merged = mergeDiary(rec.base ?? '', rec.deleted ? '' : rec.text, remote);
    if (merged === diaryText(parseDiary(remote))) this.files[path] = { text: remote, sha, dirty: false, rev: rev + 1 };
    else if (!merged) this.files[path] = { text: remote, sha, dirty: true, deleted: true, rev: rev + 1, base: remote };
    else this.files[path] = { text: merged, sha, dirty: true, rev: rev + 1, base: remote };
  }

  /** Записывает свои изменения. Вернёт true, если чью-то правку пришлось обойти копией. */
  private async push(gh: GitHub, repo: string): Promise<boolean> {
    let conflict = false;
    const device = this.host.deviceName;
    for (const path of Object.keys(this.files)) {
      const rec = this.files[path];
      if (!rec?.dirty) continue;
      const rev = rec.rev;
      try {
        if (rec.deleted) {
          if (rec.sha) await gh.deleteFile(repo, path, rec.sha, `Лагерь: ${isDiary(path) ? `день дневника ${diaryDay(path)} удалён` : isMetaFile(path) ? 'раздел удалён' : 'заметка удалена'} (${device})`);
          if (this.files[path] === rec && rec.rev === rev) delete this.files[path];
        } else {
          const text = rec.text;
          const sha = await gh.putFile(repo, path, text, rec.sha, this.message(path, rec, device));
          if (this.files[path] === rec) {
            rec.sha = sha;
            if (rec.rev === rev) Object.assign(rec, { dirty: false, base: undefined });
            else if (isDiary(path)) rec.base = text;
          }
        }
      } catch (e) {
        if (!(e instanceof GitHubError && e.kind === 'stale') || this.files[path] !== rec) throw e;
        conflict = true;
        // День дневника: правка остаётся как есть, при следующем чтении записи сольются с версией из GitHub.
        if (isDiary(path)) {
          this.changed(false);
          continue;
        }
        if (isNoteFile(path) && !rec.deleted) {
          // Заметку успели поменять на другом устройстве: своя версия ложится рядом.
          const copy = conflictPath(path, device, (p) => p in this.files);
          this.files[copy] = { text: rec.text, sha: null, dirty: true, rev: 1 };
          this.onNotice?.('Эту заметку успели поменять на другом устройстве. Твоя версия сохранена рядом отдельной заметкой');
        }
        // Заметка (или раздел) берётся из GitHub при следующем чтении; удаление чужой правки отменяется.
        Object.assign(rec, { sha: null, dirty: false, deleted: false });
      }
      this.changed(false);
    }
    return conflict;
  }

  private message(path: string, rec: FileRec, device: string): string {
    if (isDiary(path)) return `Лагерь: дневник, ${diaryDay(path)} (${device})`;
    if (isMetaFile(path)) {
      const title = parseMeta('', rec.text).title;
      return rec.sha ? `Лагерь: раздел «${title}» (${device})` : `Лагерь: новый раздел «${title}» (${device})`;
    }
    return rec.sha ? `Лагерь: заметка изменена (${device})` : `Лагерь: новая заметка (${device})`;
  }

  private meta(slug: string): Section {
    const f = this.files[metaPath(slug)];
    return parseMeta(slug, f && !f.deleted ? f.text : null);
  }

  /** Пути живых файлов (без удалённых здесь). */
  private paths(): string[] {
    return Object.keys(this.files).filter((p) => !this.files[p].deleted);
  }

  /** Имя занято: есть такой файл (или папка), в том числе ещё не удалённый в GitHub. */
  private taken(path: string, dir: boolean): boolean {
    return Object.keys(this.files).some((p) => (dir ? p.startsWith(`${path}/`) : p === path));
  }

  private put(path: string, text: string): void {
    const rec = this.files[path];
    this.files[path] = { text, sha: rec?.sha ?? null, dirty: true, rev: (rec?.rev ?? 0) + 1, base: this.baseOf(path, rec) };
    this.changed();
  }

  /** От какой версии из GitHub идут правки дня дневника; у заметок не нужно. */
  private baseOf(path: string, rec: FileRec | undefined): string | undefined {
    if (!rec || !isDiary(path)) return undefined;
    return rec.dirty ? rec.base : rec.sha ? rec.text : undefined;
  }

  private drop(path: string): void {
    const rec = this.files[path];
    if (!rec) return;
    // Файла ещё нет в GitHub: удалять там нечего.
    if (!rec.sha) delete this.files[path];
    else Object.assign(rec, { deleted: true, dirty: true, rev: rec.rev + 1, base: this.baseOf(path, rec) });
  }

  /** После правки: сохранить, показать и, если GitHub подключён, записать через паузу. */
  private changed(schedule = true): void {
    this.save();
    for (const fn of this.listeners) fn();
    if (schedule && this.host.access) {
      clearTimeout(this.timer);
      this.timer = setTimeout(() => void this.syncNow(), this.delay);
    }
  }

  private setStatus(patch: Partial<NotesStatus>): void {
    this.status = { ...this.status, ...patch };
    for (const fn of this.listeners) fn();
  }

  private load(): Saved {
    try {
      const raw = JSON.parse(this.storage.load() ?? 'null') as Saved | null;
      if (raw && raw.v === 1 && raw.files && typeof raw.files === 'object') return raw;
    } catch {
      // Испорченная копия: заметки снова придут из GitHub.
    }
    return { v: 1, files: {}, syncedAt: null };
  }

  private save(): void {
    this.storage.save(JSON.stringify({ v: 1, files: this.files, syncedAt: this.status?.syncedAt ?? null } satisfies Saved));
  }
}
