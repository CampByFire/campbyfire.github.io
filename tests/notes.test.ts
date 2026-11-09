import { describe, expect, it } from 'vitest';
import { addTag, diaryDay, diaryEntry, diaryPath, diaryTags, diaryText, entryTags, filterDiary, mergeDiary, parseDiary, textTags } from '../src/notes/diary';
import { parseMarkdown, toMarkdown } from '../src/notes/markdown';
import { clearDrafts, draftKey, draftOutdated, dropDraft, loadDraft, moveDraft, putDraft, sectionDrafts, type DraftStorage } from '../src/notes/drafts';
import { conflictPath, parseFolderMeta, parseMeta, parseNote, slugify, splitPath, stampName, stampTime } from '../src/notes/model';
import { Notes, type NotesHost, type NotesStorage } from '../src/notes/notes';
import { search } from '../src/notes/search';
import { SAVE_PATH, fromBase64, toBase64, type Fetch } from '../src/sync/github';

// Среда, 4 ноября 2026, 08:12.
const T = new Date(2026, 10, 4, 8, 12).getTime();

/**
 * Поддельный GitHub для заметок: Contents API для записи и удаления, дерево и blob для чтения.
 * sha у файла меняется при каждой записи; можно «выключить сеть».
 */
function fakeGitHub() {
  const files = new Map<string, { text: string; sha: string }>();
  const blobs = new Map<string, string>();
  const commits: string[] = [];
  const net = { down: false, calls: 0, blobReads: 0, empty: false };
  let n = 0;
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  const write = (path: string, text: string) => {
    const sha = `b${++n}`;
    blobs.set(sha, text);
    files.set(path, { text, sha });
    return sha;
  };
  const fetchFn: Fetch = async (url, init) => {
    net.calls++;
    if (net.down) throw new TypeError('Failed to fetch');
    const u = new URL(url);
    const method = init?.method ?? 'GET';
    if (u.pathname === '/repos/igor/lager-data/git/trees/main') {
      if (net.empty) return json({ message: 'Git Repository is empty.' }, 409);
      return json({ sha: 't', truncated: false, tree: [...files].map(([path, f]) => ({ path, type: 'blob', sha: f.sha })) });
    }
    const b = u.pathname.match(/^\/repos\/igor\/lager-data\/git\/blobs\/(.+)$/);
    if (b) {
      net.blobReads++;
      return blobs.has(b[1]) ? json({ sha: b[1], content: toBase64(blobs.get(b[1])!), encoding: 'base64' }) : json({}, 404);
    }
    const c = u.pathname.match(/^\/repos\/igor\/lager-data\/contents\/(.+)$/);
    if (!c) return json({ message: 'Not Found' }, 404);
    const path = c[1].split('/').map(decodeURIComponent).join('/');
    const file = files.get(path);
    const body = JSON.parse((init?.body as string) ?? '{}');
    if (method === 'PUT') {
      if (file && !body.sha) return json({ message: '"sha" wasn\'t supplied.' }, 422);
      if (file && body.sha !== file.sha) return json({ message: 'does not match' }, 409);
      commits.push(body.message);
      return json({ content: { sha: write(path, fromBase64(body.content)) } }, file ? 200 : 201);
    }
    if (method === 'DELETE') {
      if (!file) return json({ message: 'Not Found' }, 404);
      if (body.sha !== file.sha) return json({ message: 'does not match' }, 409);
      files.delete(path);
      commits.push(body.message);
      return json({ commit: {} });
    }
    return json({ message: 'Not Found' }, 404);
  };
  return { files, commits, net, fetchFn, write };
}

function memory(): NotesStorage & { data: string | null } {
  return {
    data: null,
    load() {
      return this.data;
    },
    save(json) {
      this.data = json;
    },
    clear() {
      this.data = null;
    },
  };
}

function host(connected = true, device = 'телефон'): NotesHost & { connect(): void; disconnect(): void } {
  const fns = new Set<() => void>();
  let access: NotesHost['access'] = connected ? { token: 'good', repo: 'igor/lager-data', branch: 'main' } : null;
  return {
    get access() {
      return access;
    },
    deviceName: device,
    subscribe(fn) {
      fns.add(fn);
      return () => fns.delete(fn);
    },
    connect() {
      access = { token: 'good', repo: 'igor/lager-data', branch: 'main' };
      for (const fn of fns) fn();
    },
    disconnect() {
      access = null;
      for (const fn of fns) fn();
    },
  };
}

const make = (gh: ReturnType<typeof fakeGitHub>, opts: { host?: NotesHost; storage?: NotesStorage; now?: number } = {}) =>
  new Notes(opts.host ?? host(), { fetchFn: gh.fetchFn, storage: opts.storage ?? memory(), now: () => opts.now ?? T, delay: 1e9 });

describe('файлы заметок', () => {
  it('имя папки и файла латиницей из русского', () => {
    expect(slugify('Идеи', 'x')).toBe('idei');
    expect(slugify('Как я планирую день!', 'x')).toBe('kak-ya-planiruyu-den');
    expect(slugify('Щука и ёж', 'x')).toBe('schuka-i-ezh');
    expect(slugify('???', 'razdel')).toBe('razdel');
  });

  it('запись ленты называется по времени, и время читается обратно', () => {
    expect(stampName(T)).toBe('2026-11-04-0812');
    expect(stampTime('2026-11-04-0812.md')).toBe(T);
    expect(stampTime('kak-ya-planiruyu.md')).toBeNull();
  });

  it('у статьи заголовок из первой строки', () => {
    const n = parseNote('notes/stati/plan.md', '# Как я планирую\n\nУтро начинается с…\n');
    expect(n.title).toBe('Как я планирую');
    expect(n.body).toBe('Утро начинается с…\n');
    expect(n.slug).toBe('stati');
  });

  it('раздел без _razdel.json или с испорченным: название по папке, лента', () => {
    expect(parseMeta('idei', null)).toEqual({ slug: 'idei', title: 'idei', icon: 'book', vid: 'lenta' });
    expect(parseMeta('idei', '{oops')).toMatchObject({ title: 'idei', vid: 'lenta' });
    expect(parseMeta('st', '{"title":"Статьи","icon":"star","vid":"stati"}')).toMatchObject({ title: 'Статьи', icon: 'star', vid: 'stati' });
  });

  it('копия при столкновении ложится рядом и не занимает чужое имя', () => {
    const taken = new Set(['notes/idei/a-s-telefona.md']);
    expect(conflictPath('notes/idei/a.md', 'телефон', (p) => taken.has(p))).toBe('notes/idei/a-s-telefona-2.md');
    expect(conflictPath('notes/idei/a.md', 'компьютер', () => false)).toBe('notes/idei/a-s-kompyutera.md');
  });
});

describe('разделы и заметки', () => {
  it('раздел и заметка в нём сразу видны, даже без GitHub', () => {
    const gh = fakeGitHub();
    const notes = make(gh, { host: host(false) });
    const slug = notes.createSection({ title: 'Идеи', icon: 'bulb', vid: 'lenta' });
    const path = notes.addNote(slug, { text: '  Книга заметок у костра  ' });
    expect(slug).toBe('idei');
    expect(path).toBe('notes/idei/2026-11-04-0812.md');
    expect(notes.sections()).toMatchObject([{ slug: 'idei', title: 'Идеи', icon: 'bulb', vid: 'lenta' }]);
    expect(notes.notes('idei').map((n) => n.text)).toEqual(['Книга заметок у костра\n']);
    expect(notes.status.phase).toBe('local');
    expect(notes.pending).toBe(2);
    expect(gh.net.calls).toBe(0);
  });

  it('две записи в одну минуту не затирают друг друга, новые сверху', () => {
    const gh = fakeGitHub();
    let now = T;
    const notes = new Notes(host(false), { fetchFn: gh.fetchFn, storage: memory(), now: () => now, delay: 1e9 });
    const slug = notes.createSection({ title: 'Идеи', icon: 'bulb', vid: 'lenta' });
    notes.addNote(slug, { text: 'первая' });
    notes.addNote(slug, { text: 'вторая' });
    now += 60_000;
    notes.addNote(slug, { text: 'третья' });
    expect(notes.notes(slug).map((n) => n.path)).toEqual(['notes/idei/2026-11-04-0813.md', 'notes/idei/2026-11-04-0812-2.md', 'notes/idei/2026-11-04-0812.md']);
  });

  it('статья: файл по заголовку, смена заголовка файл не переименовывает', () => {
    const notes = make(fakeGitHub(), { host: host(false) });
    const slug = notes.createSection({ title: 'Статьи', icon: 'feather', vid: 'stati' });
    const path = notes.addNote(slug, { title: 'Как я планирую день', text: 'Утро.' });
    expect(path).toBe('notes/stati/kak-ya-planiruyu-den.md');
    notes.saveNote(path, { title: 'Мой день', text: 'Утро и вечер.' });
    expect(notes.note(path)).toMatchObject({ title: 'Мой день', body: 'Утро и вечер.\n' });
    expect(notes.notes(slug)).toHaveLength(1);
  });

  it('два раздела с одним названием получают разные папки', () => {
    const notes = make(fakeGitHub(), { host: host(false) });
    expect(notes.createSection({ title: 'Идеи', icon: 'bulb', vid: 'lenta' })).toBe('idei');
    expect(notes.createSection({ title: 'идеи', icon: 'bulb', vid: 'lenta' })).toBe('idei-2');
  });

  it('заметки переживают перезапуск: лежат в браузере', () => {
    const storage = memory();
    const gh = fakeGitHub();
    const a = make(gh, { host: host(false), storage });
    a.addNote(a.createSection({ title: 'Идеи', icon: 'bulb', vid: 'lenta' }), { text: 'мысль' });
    const b = make(gh, { host: host(false), storage });
    expect(b.notes('idei').map((n) => n.body)).toEqual(['мысль\n']);
    expect(b.pending).toBe(2);
  });

  it('«Стереть всё» убирает заметки из браузера', () => {
    const storage = memory();
    const gh = fakeGitHub();
    const a = make(gh, { host: host(false), storage });
    a.addNote(a.createSection({ title: 'Идеи', icon: 'bulb', vid: 'lenta' }), { text: 'мысль' });
    a.clear();
    expect(a.sections()).toEqual([]);
    expect(storage.data).toBeNull();
    expect(make(gh, { host: host(false), storage }).sections()).toEqual([]);
  });
});

describe('заметки в GitHub', () => {
  it('новый раздел и заметка уходят в notes/ отдельными файлами, сохранение игры не трогается', async () => {
    const gh = fakeGitHub();
    gh.write(SAVE_PATH, '{"app":"taskcraft-lager"}');
    const notes = make(gh);
    const slug = notes.createSection({ title: 'Идеи', icon: 'bulb', vid: 'lenta' });
    notes.addNote(slug, { text: 'Книга заметок у костра' });
    await notes.syncNow();
    expect(notes.status.phase).toBe('ok');
    expect(notes.pending).toBe(0);
    expect(JSON.parse(gh.files.get('notes/idei/_razdel.json')!.text)).toEqual({ title: 'Идеи', icon: 'bulb', vid: 'lenta' });
    expect(gh.files.get('notes/idei/2026-11-04-0812.md')!.text).toBe('Книга заметок у костра\n');
    expect(gh.files.get(SAVE_PATH)!.text).toBe('{"app":"taskcraft-lager"}');
    expect(gh.commits).toEqual(['Лагерь: новый раздел «Идеи» (телефон)', 'Лагерь: новая заметка (телефон)']);
  });

  it('второе устройство получает разделы и заметки; повторная сверка ничего не качает заново', async () => {
    const gh = fakeGitHub();
    const phone = make(gh);
    phone.addNote(phone.createSection({ title: 'Идеи', icon: 'bulb', vid: 'lenta' }), { text: 'мысль' });
    await phone.syncNow();
    const pc = make(gh, { host: host(true, 'компьютер') });
    await pc.syncNow();
    expect(pc.sections().map((s) => s.title)).toEqual(['Идеи']);
    expect(pc.notes('idei').map((n) => n.body)).toEqual(['мысль\n']);
    const reads = gh.net.blobReads;
    await pc.syncNow();
    expect(gh.net.blobReads).toBe(reads);
  });

  it('правка и удаление с другого устройства доходят сюда', async () => {
    const gh = fakeGitHub();
    const phone = make(gh);
    const path = phone.addNote(phone.createSection({ title: 'Идеи', icon: 'bulb', vid: 'lenta' }), { text: 'мысль' });
    await phone.syncNow();
    const pc = make(gh, { host: host(true, 'компьютер') });
    await pc.syncNow();
    pc.saveNote(path, { text: 'мысль, додуманная' });
    await pc.syncNow();
    await phone.syncNow();
    expect(phone.note(path)?.body).toBe('мысль, додуманная\n');
    pc.deleteNote(path);
    await pc.syncNow();
    expect(gh.files.has(path)).toBe(false);
    await phone.syncNow();
    expect(phone.note(path)).toBeNull();
    expect(gh.commits.at(-1)).toBe('Лагерь: заметка удалена (компьютер)');
  });

  it('одну заметку поправили на двух устройствах: обе версии целы, своя рядом копией', async () => {
    const gh = fakeGitHub();
    const phone = make(gh);
    const path = phone.addNote(phone.createSection({ title: 'Идеи', icon: 'bulb', vid: 'lenta' }), { text: 'мысль' });
    await phone.syncNow();
    const pc = make(gh, { host: host(true, 'компьютер') });
    await pc.syncNow();
    pc.saveNote(path, { text: 'версия с компьютера' });
    await pc.syncNow();
    const notices: string[] = [];
    phone.onNotice = (t) => notices.push(t);
    phone.saveNote(path, { text: 'версия с телефона' });
    await phone.syncNow();
    expect(phone.status.phase).toBe('ok');
    expect(gh.files.get(path)!.text).toBe('версия с компьютера\n');
    expect(gh.files.get('notes/idei/2026-11-04-0812-s-telefona.md')!.text).toBe('версия с телефона\n');
    expect(phone.note(path)?.body).toBe('версия с компьютера\n');
    expect(phone.notes('idei')).toHaveLength(2);
    expect(phone.pending).toBe(0);
    expect(notices).toHaveLength(1);
  });

  it('удаление раздела удаляет его файлы, другие разделы целы', async () => {
    const gh = fakeGitHub();
    const notes = make(gh);
    const a = notes.createSection({ title: 'Идеи', icon: 'bulb', vid: 'lenta' });
    notes.addNote(a, { text: 'раз' });
    const b = notes.createSection({ title: 'Статьи', icon: 'feather', vid: 'stati' });
    notes.addNote(b, { title: 'Тема', text: 'текст' });
    await notes.syncNow();
    expect(notes.deleteSection(a)).toBe(1);
    expect(notes.sections().map((s) => s.slug)).toEqual(['stati']);
    await notes.syncNow();
    expect([...gh.files.keys()].sort()).toEqual(['notes/stati/_razdel.json', 'notes/stati/tema.md']);
  });

  it('переименование раздела правит только _razdel.json', async () => {
    const gh = fakeGitHub();
    const notes = make(gh);
    const slug = notes.createSection({ title: 'Идеи', icon: 'bulb', vid: 'lenta' });
    const path = notes.addNote(slug, { text: 'раз' });
    await notes.syncNow();
    const sha = gh.files.get(path)!.sha;
    notes.updateSection(slug, { title: 'Мысли', icon: 'star', vid: 'lenta' });
    await notes.syncNow();
    expect(notes.section(slug)?.title).toBe('Мысли');
    expect(gh.files.get(path)!.sha).toBe(sha);
    expect(gh.commits.at(-1)).toBe('Лагерь: раздел «Мысли» (телефон)');
  });

  it('без сети заметки ждут и уходят, когда сеть вернулась', async () => {
    const gh = fakeGitHub();
    const notes = make(gh);
    gh.net.down = true;
    notes.addNote(notes.createSection({ title: 'Идеи', icon: 'bulb', vid: 'lenta' }), { text: 'в метро' });
    await notes.syncNow();
    expect(notes.status.phase).toBe('offline');
    expect(notes.pending).toBe(2);
    gh.net.down = false;
    await notes.syncNow();
    expect(notes.status.phase).toBe('ok');
    expect(notes.pending).toBe(0);
    expect(gh.files.get('notes/idei/2026-11-04-0812.md')!.text).toBe('в метро\n');
  });

  it('заметки, записанные до подключения GitHub, уходят туда при подключении', async () => {
    const gh = fakeGitHub();
    const h = host(false);
    const notes = make(gh, { host: h });
    notes.addNote(notes.createSection({ title: 'Идеи', icon: 'bulb', vid: 'lenta' }), { text: 'до GitHub' });
    h.connect();
    await notes.syncNow();
    expect(gh.files.get('notes/idei/2026-11-04-0812.md')!.text).toBe('до GitHub\n');
  });

  it('пустой репозиторий не ошибка', async () => {
    const gh = fakeGitHub();
    gh.net.empty = true;
    const notes = make(gh);
    await notes.syncNow();
    expect(notes.status.phase).toBe('ok');
  });

  it('папка, сделанная руками на GitHub, видна разделом; файлы не .md не качаются', async () => {
    const gh = fakeGitHub();
    gh.write('notes/knigi/spisok.md', '# Список\n\nДюна\n');
    gh.write('notes/knigi/cover.png', 'PNG');
    const notes = make(gh);
    await notes.syncNow();
    expect(notes.sections()).toMatchObject([{ slug: 'knigi', title: 'knigi', vid: 'lenta' }]);
    expect(notes.notes('knigi').map((n) => n.path)).toEqual(['notes/knigi/spisok.md']);
    expect(gh.net.blobReads).toBe(1);
  });
});

describe('папки в разделах', () => {
  const idei = (notes: Notes) => notes.createSection({ title: 'Идеи', icon: 'bulb', vid: 'lenta' });

  it('путь заметки в папке разбирается на раздел, папку и файл; старые пути лежат прямо в разделе', () => {
    expect(splitPath('notes/idei/2026-11-04-0812.md')).toEqual({ slug: 'idei', folder: '', file: '2026-11-04-0812.md' });
    expect(splitPath('notes/idei/proekty/lager/plan.md')).toEqual({ slug: 'idei', folder: 'proekty/lager', file: 'plan.md' });
    expect(splitPath('diary/2026/2026-11-04.md')).toBeNull();
    expect(parseNote('notes/idei/proekty/a.md', 'текст\n').folder).toBe('proekty');
    expect(parseFolderMeta('idei', 'proekty/lager', null).title).toBe('lager');
    expect(parseFolderMeta('idei', 'proekty', 'не json').title).toBe('proekty');
    expect(parseFolderMeta('idei', 'proekty', '{"title":" Проекты "}').title).toBe('Проекты');
  });

  it('папка в папке: заметки видны в своей папке, а в разделе считаются все', () => {
    const notes = make(fakeGitHub(), { host: host(false) });
    const slug = idei(notes);
    notes.addNote(slug, { text: 'сверху' });
    const proekty = notes.createFolder(slug, '', 'Проекты');
    const lager = notes.createFolder(slug, proekty, 'Лагерь');
    expect([proekty, lager]).toEqual(['proekty', 'proekty/lager']);
    notes.addNote(slug, { text: 'в проектах' }, proekty);
    notes.addNote(slug, { text: 'в лагере' }, lager);
    expect(notes.folders(slug).map((f) => f.title)).toEqual(['Проекты']);
    expect(notes.folders(slug, proekty).map((f) => [f.path, f.title])).toEqual([['proekty/lager', 'Лагерь']]);
    expect(notes.allFolders(slug).map((f) => f.path)).toEqual(['proekty', 'proekty/lager']);
    expect(notes.notesIn(slug, '').map((n) => n.body)).toEqual(['сверху\n']);
    expect(notes.notesIn(slug, lager).map((n) => n.body)).toEqual(['в лагере\n']);
    expect(notes.notes(slug)).toHaveLength(3);
    expect([notes.count(slug), notes.count(slug, proekty), notes.count(slug, lager)]).toEqual([3, 2, 1]);
    expect(notes.folder(slug, 'netu')).toBeNull();
    // Пустая папка тоже есть: в ней лежит её _papka.json.
    const pusto = notes.createFolder(slug, '', 'Проекты');
    expect(pusto).toBe('proekty-2');
    expect(notes.folder(slug, pusto)?.title).toBe('Проекты');
    expect(notes.count(slug, pusto)).toBe(0);
  });

  it('папки уходят в GitHub подпапками раздела, второе устройство их видит', async () => {
    const gh = fakeGitHub();
    const phone = make(gh);
    const slug = idei(phone);
    const lager = phone.createFolder(slug, phone.createFolder(slug, '', 'Проекты'), 'Лагерь');
    phone.addNote(slug, { text: 'план' }, lager);
    await phone.syncNow();
    expect(JSON.parse(gh.files.get('notes/idei/proekty/_papka.json')!.text)).toEqual({ title: 'Проекты' });
    expect(gh.files.get('notes/idei/proekty/lager/2026-11-04-0812.md')!.text).toBe('план\n');
    expect(gh.commits).toContain('Лагерь: новая папка «Лагерь» (телефон)');
    const pc = make(gh, { host: host(true, 'компьютер') });
    await pc.syncNow();
    expect(pc.allFolders('idei').map((f) => f.title)).toEqual(['Проекты', 'Лагерь']);
    expect(pc.notesIn('idei', 'proekty/lager').map((n) => n.body)).toEqual(['план\n']);
    // Повторная сверка не удаляет _papka.json, который пришёл из GitHub.
    await pc.syncNow();
    expect(pc.folder('idei', 'proekty')?.title).toBe('Проекты');
  });

  it('заметка переносится в папку и обратно: в GitHub новый файл, старый удалён, занятое имя получает -2', async () => {
    const gh = fakeGitHub();
    const notes = make(gh);
    const slug = idei(notes);
    const folder = notes.createFolder(slug, '', 'Проекты');
    const a = notes.addNote(slug, { text: 'раз' });
    const b = notes.addNote(slug, { text: 'два' }, folder);
    await notes.syncNow();
    expect(a).toBe('notes/idei/2026-11-04-0812.md');
    expect(b).toBe('notes/idei/proekty/2026-11-04-0812.md');
    const moved = notes.moveNote(a, folder);
    expect(moved).toBe('notes/idei/proekty/2026-11-04-0812-2.md');
    expect(notes.note(a)).toBeNull();
    expect(notes.notesIn(slug, folder).map((n) => n.body).sort()).toEqual(['два\n', 'раз\n']);
    await notes.syncNow();
    expect(gh.files.has(a)).toBe(false);
    expect(gh.files.get(moved)!.text).toBe('раз\n');
    expect(notes.moveNote(moved, folder)).toBe(moved);
    const back = notes.moveNote(moved, '');
    // Имя файла едет как есть, вместе с -2.
    expect(back).toBe('notes/idei/2026-11-04-0812-2.md');
    await notes.syncNow();
    expect(gh.files.get(back)!.text).toBe('раз\n');
    expect(gh.files.has(moved)).toBe(false);
    // У записи ленты время берётся из имени файла и после переноса то же.
    expect(notes.note(back)?.at).toBe(T);
  });

  it('папка переносится со всем, что в ней; в саму себя и в свою вложенную нельзя', async () => {
    const gh = fakeGitHub();
    const notes = make(gh);
    const slug = idei(notes);
    const proekty = notes.createFolder(slug, '', 'Проекты');
    const lager = notes.createFolder(slug, proekty, 'Лагерь');
    const arhiv = notes.createFolder(slug, '', 'Архив');
    notes.addNote(slug, { text: 'план' }, lager);
    await notes.syncNow();
    expect(notes.moveFolder(slug, proekty, proekty)).toBeNull();
    expect(notes.moveFolder(slug, proekty, lager)).toBeNull();
    expect(notes.moveFolder(slug, lager, proekty)).toBe(lager);
    const moved = notes.moveFolder(slug, proekty, arhiv);
    expect(moved).toBe('arhiv/proekty');
    expect(notes.folder(slug, proekty)).toBeNull();
    expect(notes.folder(slug, 'arhiv/proekty/lager')?.title).toBe('Лагерь');
    expect(notes.notesIn(slug, 'arhiv/proekty/lager').map((n) => n.body)).toEqual(['план\n']);
    await notes.syncNow();
    expect([...gh.files.keys()].filter((p) => p.startsWith('notes/idei/proekty'))).toEqual([]);
    expect(gh.files.get('notes/idei/arhiv/proekty/lager/2026-11-04-0812.md')!.text).toBe('план\n');
  });

  it('переименование папки правит только _papka.json', async () => {
    const gh = fakeGitHub();
    const notes = make(gh);
    const slug = idei(notes);
    const folder = notes.createFolder(slug, '', 'Проекты');
    const path = notes.addNote(slug, { text: 'раз' }, folder);
    await notes.syncNow();
    const sha = gh.files.get(path)!.sha;
    const commits = gh.commits.length;
    notes.renameFolder(slug, folder, 'Дела');
    notes.renameFolder(slug, folder, 'Дела');
    await notes.syncNow();
    expect(notes.folder(slug, folder)?.title).toBe('Дела');
    expect(gh.files.get(path)!.sha).toBe(sha);
    expect(gh.commits.slice(commits)).toEqual(['Лагерь: папка «Дела» (телефон)']);
  });

  it('удаление папки: можно поднять всё из неё на уровень выше, а можно удалить вместе с заметками', async () => {
    const gh = fakeGitHub();
    const notes = make(gh);
    const slug = idei(notes);
    const proekty = notes.createFolder(slug, '', 'Проекты');
    const lager = notes.createFolder(slug, proekty, 'Лагерь');
    const top = notes.addNote(slug, { text: 'сверху' });
    notes.addNote(slug, { text: 'в проектах' }, proekty);
    notes.addNote(slug, { text: 'в лагере' }, lager);
    await notes.syncNow();
    expect(notes.deleteFolder(slug, proekty, true)).toBe(2);
    expect(notes.folder(slug, proekty)).toBeNull();
    expect(notes.folders(slug).map((f) => [f.path, f.title])).toEqual([['lager', 'Лагерь']]);
    expect(notes.notesIn(slug, '').map((n) => n.body).sort()).toEqual(['в проектах\n', 'сверху\n']);
    expect(notes.note(top)?.body).toBe('сверху\n');
    await notes.syncNow();
    expect([...gh.files.keys()].sort()).toEqual([
      'notes/idei/2026-11-04-0812-2.md',
      'notes/idei/2026-11-04-0812.md',
      'notes/idei/_razdel.json',
      'notes/idei/lager/2026-11-04-0812.md',
      'notes/idei/lager/_papka.json',
    ]);
    expect(notes.deleteFolder(slug, 'lager', false)).toBe(1);
    expect(notes.count(slug)).toBe(2);
    await notes.syncNow();
    expect([...gh.files.keys()].some((p) => p.startsWith('notes/idei/lager/'))).toBe(false);
    expect(gh.commits).toContain('Лагерь: папка удалена (телефон)');
  });

  it('удаление раздела уносит и его папки', async () => {
    const gh = fakeGitHub();
    const notes = make(gh);
    const slug = idei(notes);
    notes.addNote(slug, { text: 'глубоко' }, notes.createFolder(slug, notes.createFolder(slug, '', 'А'), 'Б'));
    await notes.syncNow();
    expect(notes.deleteSection(slug)).toBe(1);
    expect(notes.sections()).toEqual([]);
    await notes.syncNow();
    expect(gh.files.size).toBe(0);
  });

  it('заметку перенесли на телефоне, а на компьютере в это время поправили: обе версии целы', async () => {
    const gh = fakeGitHub();
    const phone = make(gh);
    const slug = idei(phone);
    const folder = phone.createFolder(slug, '', 'Проекты');
    const path = phone.addNote(slug, { text: 'мысль' });
    await phone.syncNow();
    const pc = make(gh, { host: host(true, 'компьютер') });
    await pc.syncNow();
    pc.saveNote(path, { text: 'мысль с компьютера' });
    await pc.syncNow();
    const moved = phone.moveNote(path, folder);
    await phone.syncNow();
    expect(phone.status.phase).toBe('ok');
    expect(gh.files.get(moved)!.text).toBe('мысль\n');
    expect(gh.files.get(path)!.text).toBe('мысль с компьютера\n');
    expect(phone.note(path)?.body).toBe('мысль с компьютера\n');
    expect(phone.pending).toBe(0);
  });

  it('папка, сделанная руками на GitHub, видна под своим именем; поиск говорит, в какой она папке', async () => {
    const gh = fakeGitHub();
    gh.write('notes/knigi/_razdel.json', '{"title":"Книги","icon":"book","vid":"stati"}');
    gh.write('notes/knigi/fantastika/dyuna.md', '# Дюна\n\nПесок и черви\n');
    const notes = make(gh);
    await notes.syncNow();
    expect(notes.folders('knigi')).toEqual([{ slug: 'knigi', path: 'fantastika', title: 'fantastika' }]);
    expect(notes.notesIn('knigi', '')).toEqual([]);
    notes.renameFolder('knigi', 'fantastika', 'Фантастика');
    expect(search(notes, 'черви')).toMatchObject([{ kind: 'note', where: 'Книги · Фантастика', title: 'Дюна' }]);
    // Перенос под новое имя (оно было занято) сохраняет название папки.
    notes.createFolder('knigi', 'arhiv', 'fantastika');
    expect(notes.moveFolder('knigi', 'fantastika', 'arhiv')).toBe('arhiv/fantastika-2');
    expect(notes.folder('knigi', 'arhiv/fantastika-2')?.title).toBe('Фантастика');
  });

  it('заметки, сделанные прошлой версией, остаются прямо в разделе', () => {
    const storage = memory();
    storage.data = JSON.stringify({
      v: 1,
      syncedAt: null,
      files: {
        'notes/idei/_razdel.json': { text: '{"title":"Идеи","icon":"bulb","vid":"lenta"}\n', sha: 's1', dirty: false, rev: 1 },
        'notes/idei/2026-11-04-0812.md': { text: 'старая\n', sha: 's2', dirty: false, rev: 1 },
      },
    });
    const notes = make(fakeGitHub(), { host: host(false), storage });
    expect(notes.folders('idei')).toEqual([]);
    expect(notes.notesIn('idei', '').map((n) => [n.body, n.folder])).toEqual([['старая\n', '']]);
  });
});

describe('метки в дневнике', () => {
  const day = (entries: ReturnType<typeof diaryEntry>[], d = '2026-11-04') => ({ day: d, path: diaryPath(d), entries });

  it('метки берутся из текста и названия: маленькими буквами, без повторов, цвет и ссылки не метки', () => {
    expect(textTags('Созвон #Работа и #сны, снова #работа.')).toEqual(['работа', 'сны']);
    expect(textTags('#идеи_на_потом в начале строки\nи #план-б в конце')).toEqual(['идеи_на_потом', 'план-б']);
    expect(textTags('<span style="color:#ef6b5e">красное</span> #ff8800 #abc #2026')).toEqual([]);
    expect(textTags('ссылка https://site.ru/a#якорь и почта a#b')).toEqual([]);
    expect(textTags('## Заголовок и # не метка')).toEqual([]);
    expect(entryTags(diaryEntry('08:12', 'текст', 'Сон #сны'))).toEqual(['сны']);
  });

  it('список меток: частые первыми, фильтр оставляет только записи с меткой', () => {
    const days = [
      day([diaryEntry('08:12', 'утро #работа'), diaryEntry('22:00', 'летал #сны')]),
      day([diaryEntry('09:00', 'планёрка #работа #важное')], '2026-11-03'),
      day([diaryEntry('10:00', 'без меток')], '2026-11-02'),
    ];
    expect(diaryTags(days)).toEqual([
      { tag: 'работа', count: 2 },
      { tag: 'важное', count: 1 },
      { tag: 'сны', count: 1 },
    ]);
    expect(filterDiary(days, 'работа').map((d) => [d.day, d.entries.map((e) => e.time)])).toEqual([
      ['2026-11-04', ['08:12']],
      ['2026-11-03', ['09:00']],
    ]);
    expect(filterDiary(days, '')).toBe(days);
  });

  it('метка дописывается в конец текста один раз', () => {
    expect(addTag('', 'сны')).toBe('#сны ');
    expect(addTag('Летал над лесом  ', 'сны')).toBe('Летал над лесом #сны ');
    expect(addTag('Летал #сны', 'сны')).toBe('Летал #сны');
  });

  it('метки живут в тексте записи: файл дня тот же, что у прошлой версии, и сливается как раньше', async () => {
    const gh = fakeGitHub();
    const phone = make(gh);
    const path = phone.addDiary('Созвон #работа', 'Планёрка');
    await phone.syncNow();
    expect(gh.files.get(path)!.text).toBe('## 08:12 Планёрка\n\nСозвон #работа\n');
    const pc = make(gh, { host: host(true, 'компьютер'), now: T + 60_000 });
    await pc.syncNow();
    pc.addDiary('Видел море #сны');
    await pc.syncNow();
    phone.addDiary('Ещё одна #работа');
    await phone.syncNow();
    expect(diaryTags(phone.diary())).toEqual([
      { tag: 'работа', count: 2 },
      { tag: 'сны', count: 1 },
    ]);
    expect(search(phone, '#сны')).toMatchObject([{ kind: 'diary' }]);
  });

  it('метка в начале строки не портится при сохранении из редактора, а заголовок по-прежнему экранируется', () => {
    expect(toMarkdown(parseMarkdown('#работа сегодня'))).toBe('#работа сегодня');
    expect(toMarkdown([{ t: 'p', c: [{ t: 'text', v: '# не заголовок' }] }])).toBe('\\# не заголовок');
  });
});

describe('дневник: файл дня', () => {
  it('день лежит в diary/<год>/; файл без папки года тоже читается', () => {
    expect(diaryPath('2026-11-04')).toBe('diary/2026/2026-11-04.md');
    expect(diaryDay('diary/2026/2026-11-04.md')).toBe('2026-11-04');
    expect(diaryDay('diary/2026-11-04.md')).toBe('2026-11-04');
    expect(diaryDay('diary/README.md')).toBeNull();
    expect(diaryDay('notes/idei/2026-11-04.md')).toBeNull();
  });

  it('записи с временем и текст без времени читаются и пишутся обратно', () => {
    const text = 'Написано руками\n\n## 8:12\n\nУтро.\n\nВторой абзац.\n\n## 21:40\n\nВечер.\n';
    expect(parseDiary(text)).toEqual([
      { time: '', text: 'Написано руками' },
      { time: '08:12', text: 'Утро.\n\nВторой абзац.' },
      { time: '21:40', text: 'Вечер.' },
    ]);
    expect(diaryText(parseDiary(text))).toBe('Написано руками\n\n## 08:12\n\nУтро.\n\nВторой абзац.\n\n## 21:40\n\nВечер.\n');
    expect(diaryText([])).toBe('');
  });

  it('название записи лежит в заголовке после времени, запись без названия пишется как раньше', () => {
    const text = '## 8:12 Новая глава\n\nУтро.\n\n## 21:40\n\nВечер.\n';
    expect(parseDiary(text)).toEqual([
      { time: '08:12', title: 'Новая глава', text: 'Утро.' },
      { time: '21:40', text: 'Вечер.' },
    ]);
    expect(diaryText(parseDiary(text))).toBe('## 08:12 Новая глава\n\nУтро.\n\n## 21:40\n\nВечер.\n');
  });

  it('название из нескольких строк ложится в одну и не ломает файл; у записи без времени его нет', () => {
    expect(diaryEntry('08:12', 'Утро.', '  Новая\n  глава ')).toEqual({ time: '08:12', title: 'Новая глава', text: 'Утро.' });
    expect(diaryEntry('08:12', 'Утро.', '   ')).toEqual({ time: '08:12', text: 'Утро.' });
    expect(diaryEntry('', 'Написано руками', 'Название')).toEqual({ time: '', text: 'Написано руками' });
  });

  it('слияние: название, поправленное на одной стороне, не задваивает запись', () => {
    const base = '## 08:12\n\nУтро.\n';
    const local = '## 08:12 Подъём\n\nУтро.\n';
    const remote = '## 08:12\n\nУтро.\n\n## 12:00 Обед\n\nСуп.\n';
    expect(parseDiary(mergeDiary(base, local, remote))).toEqual([
      { time: '08:12', title: 'Подъём', text: 'Утро.' },
      { time: '12:00', title: 'Обед', text: 'Суп.' },
    ]);
  });

  it('слияние: новые записи с обеих сторон остаются, ночная встаёт в конец', () => {
    const base = '## 08:12\n\nУтро.\n';
    const local = '## 08:12\n\nУтро.\n\n## 01:10\n\nНочью с телефона.\n';
    const remote = '## 08:12\n\nУтро.\n\n## 19:00\n\nВечер с компьютера.\n';
    expect(parseDiary(mergeDiary(base, local, remote)).map((e) => e.time)).toEqual(['08:12', '19:00', '01:10']);
  });

  it('слияние: удалённая и поправленная на одной стороне запись не возвращается', () => {
    const base = '## 08:12\n\nУтро.\n\n## 09:00\n\nОпечтка.\n';
    const local = '## 08:12\n\nУтро.\n\n## 09:00\n\nОпечатка.\n';
    const remote = '## 09:00\n\nОпечтка.\n\n## 12:00\n\nОбед.\n';
    expect(parseDiary(mergeDiary(base, local, remote))).toEqual([
      { time: '09:00', text: 'Опечатка.' },
      { time: '12:00', text: 'Обед.' },
    ]);
  });
});

describe('дневник в Летописи', () => {
  const clock = (t: number) => {
    const c = { t };
    return { c, now: () => c.t };
  };

  it('записи за день ложатся в один файл; ночью до четырёх это ещё вчерашний день', () => {
    const { c, now } = clock(T);
    const notes = new Notes(host(false), { storage: memory(), now, delay: 1e9 });
    notes.addDiary('Утро.');
    c.t = new Date(2026, 10, 4, 21, 40).getTime();
    notes.addDiary('Вечер.');
    c.t = new Date(2026, 10, 5, 1, 10).getTime();
    notes.addDiary('Не спится.');
    c.t = new Date(2026, 10, 5, 9, 0).getTime();
    notes.addDiary('Новый день.');
    expect(notes.diary().map((d) => [d.path, d.entries.map((e) => e.time)])).toEqual([
      ['diary/2026/2026-11-05.md', ['09:00']],
      ['diary/2026/2026-11-04.md', ['08:12', '21:40', '01:10']],
    ]);
    expect(notes.sections()).toEqual([]);
  });

  it('запись правится и удаляется; без записей уходит и файл дня', () => {
    const notes = make(fakeGitHub(), { host: host(false) });
    const path = notes.addDiary('Опечтка');
    const [entry] = notes.diary()[0].entries;
    notes.saveDiaryEntry(path, entry, 'Опечатка');
    expect(notes.diary()[0].entries).toEqual([{ time: '08:12', text: 'Опечатка' }]);
    notes.saveDiaryEntry(path, notes.diary()[0].entries[0], '');
    expect(notes.diary()).toEqual([]);
    expect(notes.pending).toBe(0);
  });

  it('запись с названием: название правится и убирается, правка текста его не теряет, поиск его находит', async () => {
    const gh = fakeGitHub();
    const notes = make(gh);
    const path = notes.addDiary('Утро.', 'Подъём');
    await notes.syncNow();
    expect(gh.files.get(path)?.text).toBe('## 08:12 Подъём\n\nУтро.\n');
    expect(search(notes, 'подъем').map((h) => h.kind === 'diary' && h.entry.title)).toEqual(['Подъём']);

    notes.saveDiaryEntry(path, notes.diary()[0].entries[0], 'Раннее утро.');
    expect(notes.diary()[0].entries).toEqual([{ time: '08:12', title: 'Подъём', text: 'Раннее утро.' }]);
    notes.saveDiaryEntry(path, notes.diary()[0].entries[0], 'Раннее утро.', 'Рассвет');
    expect(notes.diary()[0].entries).toEqual([{ time: '08:12', title: 'Рассвет', text: 'Раннее утро.' }]);
    notes.saveDiaryEntry(path, notes.diary()[0].entries[0], 'Раннее утро.', '');
    expect(notes.diary()[0].entries).toEqual([{ time: '08:12', text: 'Раннее утро.' }]);
  });

  it('две записи в одну минуту с одним текстом различаются названием: правится нужная', () => {
    const notes = make(fakeGitHub(), { host: host(false) });
    notes.addDiary('Текст.', 'Первая');
    const path = notes.addDiary('Текст.', 'Вторая');
    notes.saveDiaryEntry(path, notes.diary()[0].entries[1], 'Новый текст.');
    expect(notes.diary()[0].entries).toEqual([
      { time: '08:12', title: 'Первая', text: 'Текст.' },
      { time: '08:12', title: 'Вторая', text: 'Новый текст.' },
    ]);
  });

  it('день уходит в GitHub файлом diary/2026/…, рядом с заметками; сохранение игры не трогается', async () => {
    const gh = fakeGitHub();
    gh.write(SAVE_PATH, '{"app":"taskcraft-lager"}');
    const notes = make(gh);
    notes.addDiary('Первая запись.');
    await notes.syncNow();
    expect(gh.files.get('diary/2026/2026-11-04.md')?.text).toBe('## 08:12\n\nПервая запись.\n');
    expect(gh.commits).toEqual(['Лагерь: дневник, 2026-11-04 (телефон)']);
    expect(gh.files.get(SAVE_PATH)!.text).toBe('{"app":"taskcraft-lager"}');
  });

  it('в один день писали с телефона без сети и с компьютера: в GitHub обе записи', async () => {
    const gh = fakeGitHub();
    const phoneClock = clock(T);
    const phone = new Notes(host(true, 'телефон'), { fetchFn: gh.fetchFn, storage: memory(), now: phoneClock.now, delay: 1e9 });
    phone.addDiary('Утро.');
    await phone.syncNow();
    const pcClock = clock(new Date(2026, 10, 4, 12, 0).getTime());
    const pc = new Notes(host(true, 'компьютер'), { fetchFn: gh.fetchFn, storage: memory(), now: pcClock.now, delay: 1e9 });
    await pc.syncNow();

    gh.net.down = true;
    phoneClock.c.t = new Date(2026, 10, 4, 19, 0).getTime();
    phone.addDiary('Вечер в метро.');
    await phone.syncNow();
    gh.net.down = false;
    pc.addDiary('Обед за компьютером.');
    await pc.syncNow();
    await phone.syncNow();
    await pc.syncNow();

    const want = [
      { time: '08:12', text: 'Утро.' },
      { time: '12:00', text: 'Обед за компьютером.' },
      { time: '19:00', text: 'Вечер в метро.' },
    ];
    expect(parseDiary(gh.files.get('diary/2026/2026-11-04.md')!.text)).toEqual(want);
    expect(phone.diary()[0].entries).toEqual(want);
    expect(pc.diary()[0].entries).toEqual(want);
    expect(phone.pending).toBe(0);
    expect([...gh.files.keys()].filter((p) => p.includes('s-telefona'))).toEqual([]);
  });

  it('запись удалили на компьютере, а телефон в тот же день дописал свою: удалённая не возвращается', async () => {
    const gh = fakeGitHub();
    const phoneClock = clock(T);
    const phone = new Notes(host(true, 'телефон'), { fetchFn: gh.fetchFn, storage: memory(), now: phoneClock.now, delay: 1e9 });
    const path = phone.addDiary('Лишнее.');
    await phone.syncNow();
    const pc = make(gh, { host: host(true, 'компьютер') });
    await pc.syncNow();
    pc.saveDiaryEntry(path, pc.diary()[0].entries[0], '');
    await pc.syncNow();
    expect(gh.files.has(path)).toBe(false);

    phoneClock.c.t = new Date(2026, 10, 4, 10, 0).getTime();
    phone.addDiary('Нужное.');
    await phone.syncNow();
    expect(parseDiary(gh.files.get(path)!.text)).toEqual([{ time: '10:00', text: 'Нужное.' }]);
    expect(phone.diary()[0].entries).toEqual([{ time: '10:00', text: 'Нужное.' }]);
  });

  it('день, записанный руками на GitHub, виден в дневнике, и запись дописывается в тот же файл', async () => {
    const gh = fakeGitHub();
    gh.write('diary/2026-11-04.md', 'Написал в Obsidian.\n');
    gh.write('diary/README.md', 'не день');
    const notes = make(gh);
    await notes.syncNow();
    expect(notes.diary().map((d) => d.path)).toEqual(['diary/2026-11-04.md']);
    notes.addDiary('А это из Лагеря.');
    await notes.syncNow();
    expect(gh.files.get('diary/2026-11-04.md')!.text).toBe('Написал в Obsidian.\n\n## 08:12\n\nА это из Лагеря.\n');
    expect(gh.net.blobReads).toBe(1);
  });

  it('GitHub не принял запись дня (его как раз записал компьютер): записи сливаются и уходят второй раз', async () => {
    const gh = fakeGitHub();
    const path = 'diary/2026/2026-11-04.md';
    let raced = false;
    const fetchFn: Fetch = async (url, init) => {
      if (!raced && init?.method === 'PUT' && url.includes('2026-11-04')) {
        raced = true;
        gh.write(path, '## 07:30\n\nС компьютера.\n');
      }
      return gh.fetchFn(url, init);
    };
    const phone = new Notes(host(), { fetchFn, storage: memory(), now: () => T, delay: 1e9 });
    phone.addDiary('С телефона.');
    await phone.syncNow();
    expect(gh.files.get(path)!.text).toBe('## 07:30\n\nС компьютера.\n\n## 08:12\n\nС телефона.\n');
    expect(phone.pending).toBe(0);
    expect(phone.status.phase).toBe('ok');
  });
});

describe('черновики заметок', () => {
  const memory = (): DraftStorage => {
    const m = new Map<string, string>();
    return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k) };
  };
  const EMPTY = { title: '', text: '' };

  it('новая статья: один черновик на раздел, виден только в своём разделе', () => {
    const store = memory();
    putDraft(draftKey('stati'), { title: 'Поход', text: 'Лес' }, EMPTY, T, store);
    expect(loadDraft('new:stati', store)).toEqual({ title: 'Поход', text: 'Лес', at: T });
    expect(sectionDrafts('stati', store).map((d) => [d.title, d.path])).toEqual([['Поход', undefined]]);
    expect(sectionDrafts('idei', store)).toEqual([]);
  });

  it('черновики папки видны только в ней, черновик едет вместе с перенесённой заметкой', () => {
    const store = memory();
    putDraft(draftKey('stati', undefined, 'proekty'), { title: 'План', text: 'шаги' }, EMPTY, T, store);
    putDraft('notes/stati/proekty/plan.md', { title: 'План', text: 'новое' }, { title: 'План', text: 'старое' }, T + 1, store);
    putDraft('notes/stati/verh.md', { title: 'Верх', text: 'новое' }, { title: 'Верх', text: 'старое' }, T, store);
    expect(loadDraft('new:stati/proekty', store)?.title).toBe('План');
    expect(sectionDrafts('stati', store, 'proekty').map((d) => d.key)).toEqual(['notes/stati/proekty/plan.md', 'new:stati/proekty']);
    expect(sectionDrafts('stati', store).map((d) => d.key)).toEqual(['notes/stati/verh.md']);
    moveDraft('notes/stati/verh.md', 'notes/stati/proekty/verh.md', store);
    expect(loadDraft('notes/stati/verh.md', store)).toBeNull();
    expect(loadDraft('notes/stati/proekty/verh.md', store)?.title).toBe('Верх');
  });

  it('стёртый текст выбрасывает черновик', () => {
    const store = memory();
    putDraft('new:stati', { title: '', text: 'Лес' }, EMPTY, T, store);
    putDraft('new:stati', { title: ' ', text: '' }, EMPTY, T, store);
    expect(loadDraft('new:stati', store)).toBeNull();
  });

  it('правка, вернувшаяся к сохранённому тексту, черновика не оставляет, в том числе в виде из редактора', () => {
    const store = memory();
    const path = 'notes/stati/pohod.md';
    const base = { title: 'Поход', text: '* один\n* два' };
    putDraft(path, { title: 'Поход', text: 'новое' }, base, T, store);
    expect(sectionDrafts('stati', store).map((d) => d.path)).toEqual([path]);
    putDraft(path, { title: 'Поход', text: '- один\n- два' }, base, T, store);
    expect(loadDraft(path, store)).toBeNull();
  });

  it('видно, что заметка изменилась после начала черновика', () => {
    const store = memory();
    putDraft('notes/stati/a.md', { title: 'А', text: 'моё' }, { title: 'А', text: 'было' }, T, store);
    const d = loadDraft('notes/stati/a.md', store)!;
    expect(draftOutdated(d, 'было')).toBe(false);
    expect(draftOutdated(d, 'с телефона')).toBe(true);
  });

  it('сохранение и «Стереть всё» убирают черновики, испорченная запись не мешает', () => {
    const store = memory();
    putDraft('new:stati', { title: 'А', text: 'б' }, EMPTY, T, store);
    putDraft('new:idei', { title: 'В', text: 'г' }, EMPTY, T, store);
    dropDraft('new:stati', store);
    expect(loadDraft('new:stati', store)).toBeNull();
    expect(loadDraft('new:idei', store)?.title).toBe('В');
    clearDrafts(store);
    expect(loadDraft('new:idei', store)).toBeNull();
    store.setItem('taskcraft-lager-drafts', 'не json');
    expect(sectionDrafts('stati', store)).toEqual([]);
  });
});
