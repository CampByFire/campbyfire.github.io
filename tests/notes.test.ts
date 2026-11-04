import { describe, expect, it } from 'vitest';
import { conflictPath, parseMeta, parseNote, slugify, stampName, stampTime } from '../src/notes/model';
import { Notes, type NotesHost, type NotesStorage } from '../src/notes/notes';
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
