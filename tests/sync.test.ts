import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HOUR, MINUTE } from '../src/game/rules';
import { addQuest, addRoutine, addTask, complete, findTask, newState, pause, rateSpheres, removeQuest, settle, start, updateTask } from '../src/game/state';
import { mergeGames } from '../src/game/merge';
import { addPrize, buyPrize, goalOf, prizesOf, purchasesOf, refund, removePrize, setGoal, updatePrize } from '../src/game/shop';
import { Store, type Storage } from '../src/game/store';
import type { State } from '../src/game/types';
import { SAVE_PATH, fromBase64, toBase64, type Fetch } from '../src/sync/github';
import { Sync, type Prefs } from '../src/sync/sync';

// Пятница, 23 октября 2026.
const at = (h: number, m = 0, d = 23) => new Date(2026, 9, d, h, m).getTime();

interface FakeRepo {
  private: boolean;
  files: Map<string, { text: string; sha: string }>;
  /** Сообщения коммитов, от старого к новому. */
  commits: string[];
}

/**
 * Поддельный GitHub: репозитории с файлами и sha (Contents API), токены с владельцами
 * и списком репозиториев, которые токен видит; можно «выключить сеть». Если задан net.expiry,
 * GitHub сообщает срок токена в заголовке, как настоящий.
 */
function fakeGitHub() {
  const repos = new Map<string, FakeRepo>([['igor/lager-data', { private: true, files: new Map(), commits: [] }]]);
  const tokens: Record<string, string> = { good: 'igor' };
  /** Какие репозитории видит токен; кого нет в списке, видит все репозитории владельца. */
  const scope: Record<string, string[]> = {};
  let n = 0;
  const net = { down: false, writes: 0, expiry: null as string | null, big: false, stale: null as null | { text: string; sha: string } };
  const json = (body: unknown, status = 200, extra: Record<string, string> = {}) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...extra } });
  const notFound = () => json({ message: 'Not Found' }, 404);
  const visible = (token: string, login: string) =>
    [...repos.keys()].filter((name) => (scope[token] ? scope[token].includes(name) : name.startsWith(`${login}/`)));
  const fetchFn: Fetch = async (url, init) => {
    if (net.down) throw new TypeError('Failed to fetch');
    const headers = (init?.headers ?? {}) as Record<string, string>;
    const token = (headers.Authorization ?? '').replace('Bearer ', '');
    const login = tokens[token];
    if (!login) return json({ message: 'Bad credentials' }, 401);
    const u = new URL(url);
    const method = init?.method ?? 'GET';
    if (u.pathname === '/user') return json({ login }, 200, net.expiry ? { 'GitHub-Authentication-Token-Expiration': net.expiry } : {});
    if (u.pathname === '/user/repos') {
      return json(visible(token, login).map((name) => ({ full_name: name, name: name.split('/')[1], private: repos.get(name)!.private, default_branch: 'main' })));
    }
    const m = u.pathname.match(/^\/repos\/([\w-]+\/[\w-]+)(?:\/contents\/(.+))?$/);
    if (!m || !repos.has(m[1]) || !visible(token, login).includes(m[1])) return notFound();
    const repo = repos.get(m[1])!;
    if (!m[2]) return json({ full_name: m[1], name: m[1].split('/')[1], private: repo.private, default_branch: 'main' });
    const path = m[2];
    const file = repo.files.get(path);
    if (method === 'GET') {
      // Старый ответ: GitHub один раз отдаёт прошлую версию файла.
      const f = net.stale ?? file;
      net.stale = null;
      if (!f) return notFound();
      if (headers.Accept === 'application/vnd.github.raw+json') return new Response(f.text, { status: 200 });
      return json(net.big ? { sha: f.sha, content: '', encoding: 'none' } : { sha: f.sha, content: toBase64(f.text), encoding: 'base64' });
    }
    const body = JSON.parse((init?.body as string) ?? '{}');
    if (method === 'PUT') {
      if (file && !body.sha) return json({ message: '"sha" wasn\'t supplied.' }, 422);
      if (file && body.sha !== file.sha) return json({ message: 'does not match' }, 409);
      if (!file && body.sha) return notFound();
      const sha = `s${++n}`;
      repo.files.set(path, { text: fromBase64(body.content), sha });
      repo.commits.push(body.message);
      net.writes++;
      return json({ content: { sha } }, file ? 200 : 201);
    }
    if (method === 'DELETE') {
      if (!file) return notFound();
      if (body.sha !== file.sha) return json({ message: 'does not match' }, 409);
      repo.files.delete(path);
      repo.commits.push(body.message);
      return json({ commit: {} });
    }
    return notFound();
  };
  const repo = () => repos.get('igor/lager-data')!;
  const doc = () => JSON.parse(repo().files.get(SAVE_PATH)!.text);
  const saved = (): State => doc().state;
  return { fetchFn, repos, repo, net, saved, doc, tokens, scope };
}

type FakeGitHub = ReturnType<typeof fakeGitHub>;

/** Устройство: своё хранилище, свои часы, свой Sync, общий GitHub. */
function device(gh: FakeGitHub, name: string, now: { t: number }, fetchFn: Fetch = gh.fetchFn, prefs: string | null = null) {
  let raw: string | null = null;
  const storage: Storage = { load: () => raw, save: (j) => { raw = j; } };
  const p: Prefs = { load: () => prefs, save: (j) => (prefs = j) };
  const store = new Store(storage, () => now.t);
  const sync = new Sync(store, p, fetchFn, name);
  return { store, sync, prefs: () => prefs };
}

const titles = (s: State) => s.tasks.map((t) => t.title).sort();

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
});
afterEach(() => {
  vi.useRealTimers();
});

describe('сохранение в GitHub', () => {
  it('первое подключение пишет игру в репозиторий, второе устройство находит её по токену', async () => {
    const gh = fakeGitHub();
    gh.repo().files.set('diary/2026/2026-11-03.md', { text: '# Мысли', sha: 'd1' });
    const now = { t: at(9) };
    const pc = device(gh, 'компьютер', now);
    pc.store.act((s, t) => addTask(s, t, { title: 'Сдать модуль', questId: s.quests[0].id, day: s.day }));
    await pc.sync.connect('good');
    expect(titles(gh.saved())).toEqual(['Сдать модуль']);
    expect(pc.sync.status.login).toBe('igor');
    expect(pc.sync.repo).toEqual({ repo: 'igor/lager-data', branch: 'main' });
    expect(gh.repo().commits).toEqual(['Лагерь: сохранение (компьютер)']);

    // На телефоне новая пустая игра: она молча заменяется игрой из GitHub.
    const phone = device(gh, 'телефон', now);
    await phone.sync.connect(' good ');
    expect(phone.store.state.gameId).toBe(pc.store.state.gameId);
    expect(titles(phone.store.state)).toEqual(['Сдать модуль']);
    expect(phone.sync.status.phase).toBe('ok');
    expect(gh.net.writes).toBe(1);
    // Дневник игра не трогает.
    expect(gh.repo().files.get('diary/2026/2026-11-03.md')?.text).toBe('# Мысли');
  });

  it('репозиторий ищется по токену: по имени, иначе единственный приватный; публичный не годится', async () => {
    const gh = fakeGitHub();
    const now = { t: at(9) };
    gh.repos.set('igor/notes', { private: true, files: new Map(), commits: [] });
    gh.repos.set('igor/site', { private: false, files: new Map(), commits: [] });

    // Токен выдан только на другой репозиторий: он единственный приватный, его и берём.
    gh.tokens.only = 'igor';
    gh.scope.only = ['igor/notes', 'igor/site'];
    const a = device(gh, 'компьютер', now);
    await a.sync.connect('only');
    expect(a.sync.repo?.repo).toBe('igor/notes');

    gh.tokens.none = 'igor';
    gh.scope.none = ['igor/site'];
    const b = device(gh, 'компьютер', now);
    await expect(b.sync.connect('none')).rejects.toThrow('Токен не видит репозиторий lager-data');
    expect(b.sync.connected).toBe(false);

    gh.repo().private = false;
    const c = device(gh, 'компьютер', now);
    await expect(c.sync.connect('good')).rejects.toThrow('публичный');
    expect(c.sync.connected).toBe(false);
  });

  it('кириллица доходит целой, большой файл читается отдельно', async () => {
    const gh = fakeGitHub();
    const now = { t: at(9) };
    const pc = device(gh, 'компьютер', now);
    pc.store.act((s, t) => addTask(s, t, { title: 'Ёжик в тумане — «пятница» 🔥', questId: s.quests[0].id }));
    await pc.sync.connect('good');
    expect(titles(gh.saved())).toEqual(['Ёжик в тумане — «пятница» 🔥']);

    gh.net.big = true;
    const phone = device(gh, 'телефон', now);
    await phone.sync.connect('good');
    expect(titles(phone.store.state)).toEqual(['Ёжик в тумане — «пятница» 🔥']);
  });

  it('сохранение в браузере сломалось: игра возвращается из GitHub целиком', async () => {
    const gh = fakeGitHub();
    const now = { t: at(9) };
    const pc = device(gh, 'компьютер', now);
    pc.store.act((s, t) => addTask(s, t, { title: 'Сдать модуль', questId: s.quests[0].id, day: s.day }));
    await pc.sync.connect('good');

    // Новая пустая игра после «Взять игру из GitHub» не сливается с сохранением и не затирает его.
    pc.store.startOver();
    pc.sync.pullFresh();
    await pc.sync.syncNow();
    expect(titles(pc.store.state)).toEqual(['Сдать модуль']);
    expect(titles(gh.saved())).toEqual(['Сдать модуль']);
    pc.store.act((s, t) => addTask(s, t, { title: 'Ещё одна', questId: s.quests[0].id, day: s.day }));
    await vi.advanceTimersByTimeAsync(5000);
    expect(titles(gh.saved())).toEqual(['Ещё одна', 'Сдать модуль']);
  });

  it('неверный токен не подключается и объясняет почему', async () => {
    const gh = fakeGitHub();
    const pc = device(gh, 'компьютер', { t: at(9) });
    await expect(pc.sync.connect('bad')).rejects.toThrow('GitHub не принял токен');
    expect(pc.sync.connected).toBe(false);
  });

  it('в GitHub игра из новой версии или испорченная: ошибка говорит, что именно', async () => {
    const gh = fakeGitHub();
    const pc = device(gh, 'компьютер', { t: at(9) });
    await pc.sync.connect('good');
    const spoil = (change: (doc: { stamp: string; state: Record<string, unknown> }) => void) => {
      const doc = gh.doc();
      doc.stamp = `${doc.stamp}-other`;
      change(doc);
      gh.repo().files.set(SAVE_PATH, { text: JSON.stringify(doc), sha: `x${doc.stamp}` });
    };
    spoil((doc) => (doc.state.v = 99));
    await pc.sync.syncNow();
    expect(pc.sync.status.error).toBe('В GitHub игра из более новой версии Лагеря. Обнови страницу');
    spoil((doc) => {
      doc.state.v = 1;
      delete doc.state.tasks;
    });
    await pc.sync.syncNow();
    expect(pc.sync.status.error).toBe('В GitHub повреждённое сохранение');
  });

  it('действие уходит в GitHub, другое устройство его забирает', async () => {
    const gh = fakeGitHub();
    const now = { t: at(9) };
    const pc = device(gh, 'компьютер', now);
    await pc.sync.connect('good');
    const phone = device(gh, 'телефон', now);
    await phone.sync.connect('good');

    now.t = at(10);
    phone.store.act((s, t) => addTask(s, t, { title: 'Купить хлеб', questId: s.quests[2].id }));
    await vi.advanceTimersByTimeAsync(5000);
    expect(titles(gh.saved())).toEqual(['Купить хлеб']);
    expect(gh.repo().commits.at(-1)).toBe('Лагерь: сохранение (телефон)');

    const before = gh.net.writes;
    await pc.sync.syncNow();
    expect(titles(pc.store.state)).toEqual(['Купить хлеб']);
    // Компьютер ничего не делал, поэтому ничего и не пишет.
    expect(gh.net.writes).toBe(before);
  });

  it('оба устройства меняли игру без связи: задачи обеих сторон остаются, золото складывается', async () => {
    const gh = fakeGitHub();
    const now = { t: at(9) };
    const pc = device(gh, 'компьютер', now);
    const ids = pc.store.act((s, t) => [
      addTask(s, t, { title: 'Отчёт', questId: s.quests[0].id, day: s.day }),
      addTask(s, t, { title: 'Зарядка', questId: s.quests[1].id, day: s.day }),
    ]);
    await pc.sync.connect('good');
    const phone = device(gh, 'телефон', now);
    await phone.sync.connect('good');

    gh.net.down = true;
    now.t = at(11);
    pc.store.act((s, t) => complete(s, t, ids[0]));
    pc.store.act((s, t) => addTask(s, t, { title: 'Созвон', questId: s.quests[0].id }));
    now.t = at(12);
    phone.store.act((s, t) => complete(s, t, ids[1]));
    phone.store.act((s) => updateTask(s, ids[0], { title: 'Отчёт за октябрь' }));
    phone.store.act((s, t) => addTask(s, t, { title: 'Аптека', questId: s.quests[2].id }));
    await pc.sync.syncNow();
    expect(pc.sync.status.phase).toBe('offline');

    gh.net.down = false;
    await pc.sync.syncNow();
    await phone.sync.syncNow();
    await pc.sync.syncNow();
    for (const d of [pc, phone]) {
      const s = d.store.state;
      expect(titles(s)).toEqual(['Аптека', 'Зарядка', 'Отчёт за октябрь', 'Созвон']);
      expect(findTask(s, ids[0])!.status).toBe('done');
      expect(findTask(s, ids[1])!.status).toBe('done');
      // Обе награды: 25 золота за задачу I уровня с каждой стороны.
      expect(s.hero.gold).toBe(50);
      expect(s.log[s.day].done).toBe(2);
    }
  });

  it('два устройства пишут одновременно: GitHub не даёт затереть, задачи обеих сторон остаются', async () => {
    const gh = fakeGitHub();
    const now = { t: at(9) };
    // Запись компьютера можно придержать: он уже прочитал сохранение, но ещё не записал.
    const hold = { on: false, release: null as null | (() => void) };
    const pcFetch: Fetch = async (url, init) => {
      if (hold.on && init?.method === 'PUT') {
        hold.on = false;
        await new Promise<void>((r) => (hold.release = r));
      }
      return gh.fetchFn(url, init);
    };
    const pc = device(gh, 'компьютер', now, pcFetch);
    await pc.sync.connect('good');
    const phone = device(gh, 'телефон', now);
    await phone.sync.connect('good');

    now.t = at(10);
    pc.store.act((s, t) => addTask(s, t, { title: 'С компьютера', questId: s.quests[0].id }));
    phone.store.act((s, t) => addTask(s, t, { title: 'С телефона', questId: s.quests[0].id }));
    pc.store.act((s) => (s.hero.gold += 10));
    phone.store.act((s) => (s.hero.gold += 5));
    hold.on = true;
    const pcRun = pc.sync.syncNow();
    await vi.advanceTimersByTimeAsync(0);
    await phone.sync.syncNow(); // телефон записал своё, пока компьютер ждал
    hold.release!();
    await pcRun; // GitHub не принял запись компьютера: версия уже не та
    expect(titles(gh.saved())).toEqual(['С телефона']);
    await vi.advanceTimersByTimeAsync(10_000); // компьютер перечитал, слил и записал
    await phone.sync.syncNow();

    expect(titles(gh.saved())).toEqual(['С компьютера', 'С телефона']);
    expect(titles(phone.store.state)).toEqual(['С компьютера', 'С телефона']);
    expect(titles(pc.store.state)).toEqual(['С компьютера', 'С телефона']);
    expect(gh.saved().hero.gold).toBe(15);
    expect(pc.store.state.hero.gold).toBe(15);
    expect(phone.store.state.hero.gold).toBe(15);
    expect(pc.sync.status.phase).toBe('ok');
  });

  it('запись после слияния не прошла: прирост с другого устройства не считается дважды', async () => {
    const gh = fakeGitHub();
    const now = { t: at(9) };
    // У компьютера можно оборвать только запись: прочитать и слить он успевает.
    const cut = { put: false };
    const pc = device(gh, 'компьютер', now, async (url, init) => {
      if (cut.put && init?.method === 'PUT') throw new TypeError('Failed to fetch');
      return gh.fetchFn(url, init);
    });
    await pc.sync.connect('good');
    const phone = device(gh, 'телефон', now);
    await phone.sync.connect('good');

    phone.store.act((s) => (s.hero.gold += 5));
    await phone.sync.syncNow();
    pc.store.act((s) => (s.hero.gold += 10));
    cut.put = true;
    await pc.sync.syncNow();
    expect(pc.sync.status.phase).toBe('offline');
    expect(pc.store.state.hero.gold).toBe(15);
    cut.put = false;
    await pc.sync.syncNow();
    expect(pc.store.state.hero.gold).toBe(15);
    expect(gh.saved().hero.gold).toBe(15);
  });

  it('GitHub отдал старую версию: она не сливается поверх новой', async () => {
    const gh = fakeGitHub();
    const now = { t: at(9) };
    const pc = device(gh, 'компьютер', now);
    await pc.sync.connect('good');
    pc.store.act((s, t) => addTask(s, t, { title: 'Первая', questId: s.quests[0].id }));
    await vi.advanceTimersByTimeAsync(5000);
    const old = { ...gh.repo().files.get(SAVE_PATH)! };
    pc.store.act((s, t) => addTask(s, t, { title: 'Вторая', questId: s.quests[0].id }));
    pc.store.act((s) => (s.hero.gold += 7));
    await vi.advanceTimersByTimeAsync(5000);
    expect(titles(gh.saved())).toEqual(['Вторая', 'Первая']);

    gh.net.stale = old;
    await pc.sync.syncNow();
    expect(titles(pc.store.state)).toEqual(['Вторая', 'Первая']);
    expect(pc.store.state.hero.gold).toBe(7);
    expect(titles(gh.saved())).toEqual(['Вторая', 'Первая']);
  });

  it('таймер с другого устройства досчитывается, а не удваивается', async () => {
    const gh = fakeGitHub();
    const now = { t: at(9) };
    const pc = device(gh, 'компьютер', now);
    const id = pc.store.act((s, t) => addTask(s, t, { title: 'Код', questId: s.quests[0].id, day: s.day }));
    await pc.sync.connect('good');
    const phone = device(gh, 'телефон', now);
    await phone.sync.connect('good');

    pc.store.act((s, t) => start(s, t, id));
    await vi.advanceTimersByTimeAsync(5000);
    now.t = at(9, 30);
    await phone.sync.syncNow();
    expect(findTask(phone.store.state, id)!.spentMs).toBeCloseTo(30 * MINUTE, -4);

    now.t = at(9, 40);
    pc.store.act((s, t) => pause(s, t));
    await vi.advanceTimersByTimeAsync(5000);
    now.t = at(9, 50);
    phone.store.tick();
    await phone.sync.syncNow();
    expect(findTask(phone.store.state, id)!.spentMs).toBeCloseTo(40 * MINUTE, -4);
  });

  it('в GitHub другая игра: спрашивает и делает, что выбрали', async () => {
    const gh = fakeGitHub();
    const now = { t: at(9) };
    const pc = device(gh, 'компьютер', now);
    pc.store.act((s, t) => addTask(s, t, { title: 'С компьютера', questId: s.quests[0].id }));
    await pc.sync.connect('good');

    const phone = device(gh, 'телефон', now);
    phone.store.act((s, t) => addTask(s, t, { title: 'С телефона', questId: s.quests[0].id }));
    await phone.sync.connect('good');
    expect(phone.sync.status.phase).toBe('conflict');
    expect(phone.sync.status.conflict?.device).toBe('компьютер');
    expect(titles(gh.saved())).toEqual(['С компьютера']);

    await phone.sync.resolve('local');
    expect(titles(gh.saved())).toEqual(['С телефона']);

    // Теперь уже компьютер видит другую игру и берёт её.
    pc.store.act((s, t) => addTask(s, t, { title: 'Ещё с компьютера', questId: s.quests[0].id }));
    await pc.sync.syncNow();
    expect(pc.sync.status.phase).toBe('conflict');
    await pc.sync.resolve('remote');
    expect(titles(pc.store.state)).toEqual(['С телефона']);
    expect(pc.store.state.gameId).toBe(phone.store.state.gameId);
  });

  it('игра из файла уходит в GitHub целиком', async () => {
    const gh = fakeGitHub();
    const now = { t: at(9) };
    const pc = device(gh, 'компьютер', now);
    pc.store.act((s, t) => addTask(s, t, { title: 'Старое', questId: s.quests[0].id }));
    await pc.sync.connect('good');

    const file = newState(at(8));
    addTask(file, at(8), { title: 'Из файла', questId: file.quests[0].id });
    pc.sync.replaceGame(file);
    await vi.advanceTimersByTimeAsync(10);
    expect(titles(gh.saved())).toEqual(['Из файла']);
    expect(pc.sync.status.phase).toBe('ok');
  });
});

describe('старые настройки', () => {
  it('подключение к гисту без репозитория не читается: GitHub подключают заново', () => {
    const gh = fakeGitHub();
    const now = { t: at(9) };
    const prefs = JSON.stringify({ token: 'old', login: 'igor', gistId: 'g1', stamp: null, base: null, dirty: false, replaced: false, syncedAt: null });
    const pc = device(gh, 'компьютер', now, gh.fetchFn, prefs);
    expect(pc.sync.connected).toBe(false);
    expect(pc.sync.status.phase).toBe('off');
  });

  it('ссылка на старый гист после переезда забывается, репозиторий остаётся', async () => {
    const gh = fakeGitHub();
    const now = { t: at(9) };
    const first = device(gh, 'компьютер', now);
    await first.sync.connect('good');
    const prefs = JSON.stringify({ ...JSON.parse(first.prefs()!), gistId: 'g1' });

    const pc = device(gh, 'компьютер', now, gh.fetchFn, prefs);
    expect(pc.sync.repo?.repo).toBe('igor/lager-data');
    pc.store.act((s, t) => addTask(s, t, { title: 'Своё', questId: s.quests[0].id }));
    await vi.advanceTimersByTimeAsync(5000);
    expect(JSON.parse(pc.prefs()!)).not.toHaveProperty('gistId');
  });
});

describe('токен', () => {
  it('срок токена: из ответа GitHub, а если его не видно, год от подключения', async () => {
    const gh = fakeGitHub();
    const now = { t: at(9) };
    const pc = device(gh, 'компьютер', now);
    await pc.sync.connect('good');
    expect(pc.sync.tokenExpiry).toEqual({ day: '2027-10-24', guessed: true });
    pc.sync.setTokenExpiry('2027-09-01');
    expect(pc.sync.tokenExpiry).toEqual({ day: '2027-09-01', guessed: false });

    gh.net.expiry = '2027-03-15 10:00:00 UTC';
    const phone = device(gh, 'телефон', now);
    await phone.sync.connect('good');
    expect(phone.sync.tokenExpiry).toEqual({ day: '2027-03-15', guessed: false });
  });

  it('новый токен того же аккаунта заменяет истёкший, сохранение снова идёт', async () => {
    const gh = fakeGitHub();
    const now = { t: at(9) };
    const pc = device(gh, 'компьютер', now);
    await pc.sync.connect('good');
    delete gh.tokens.good;
    pc.store.act((s, t) => addTask(s, t, { title: 'Отчёт', questId: s.quests[0].id, day: s.day }));
    await vi.advanceTimersByTimeAsync(5000);
    expect(pc.sync.status.phase).toBe('error');
    expect(pc.sync.status.error).toMatch('токен');

    gh.tokens.other = 'masha';
    await expect(pc.sync.replaceToken('other')).rejects.toThrow('аккаунта masha');
    await expect(pc.sync.replaceToken('nope')).rejects.toThrow('не принял токен');
    gh.tokens.blind = 'igor';
    gh.scope.blind = [];
    await expect(pc.sync.replaceToken('blind')).rejects.toThrow('Не нашёл репозиторий');
    expect(pc.sync.status.phase).toBe('error');

    gh.tokens.fresh = 'igor';
    now.t = at(10);
    await pc.sync.replaceToken(' fresh ');
    expect(pc.sync.status.phase).toBe('ok');
    expect(titles(gh.saved())).toEqual(['Отчёт']);
    expect(pc.sync.tokenExpiry).toEqual({ day: '2027-10-24', guessed: true });
  });

  it('сохранение можно удалить: уходит только game/save.json, без сети не уходит ничего', async () => {
    const gh = fakeGitHub();
    gh.repo().files.set('diary/2026/2026-11-03.md', { text: '# Мысли', sha: 'd1' });
    const now = { t: at(9) };
    const pc = device(gh, 'компьютер', now);
    await pc.sync.connect('good');
    gh.net.down = true;
    await expect(pc.sync.removeSave()).rejects.toThrow('Нет связи');
    expect(pc.sync.connected).toBe(true);
    expect(gh.repo().files.has(SAVE_PATH)).toBe(true);
    gh.net.down = false;
    await pc.sync.removeSave();
    expect(gh.repo().files.has(SAVE_PATH)).toBe(false);
    expect(gh.repo().files.has('diary/2026/2026-11-03.md')).toBe(true);
    expect(pc.sync.connected).toBe(false);
    expect(pc.sync.status.phase).toBe('off');
  });
});

describe('обновление игры', () => {
  it('настройки сохранения от прошлой версии игры читаются, повторяющиеся задачи приходят с другого устройства', async () => {
    const gh = fakeGitHub();
    const now = { t: at(9) };
    let raw: string | null = null;
    let prefs: string | null = null;
    const storage: Storage = { load: () => raw, save: (j) => { raw = j; } };
    const p: Prefs = { load: () => prefs, save: (j) => (prefs = j) };
    const pc = new Sync(new Store(storage, () => now.t), p, gh.fetchFn, 'компьютер');
    await pc.connect('good');
    pc['store'].act((s, t) => addTask(s, t, { title: 'Отчёт', questId: s.quests[0].id, day: s.day }));
    await vi.advanceTimersByTimeAsync(5000);
    // Так их записала 0.2: версия для слияния без повторяющихся задач.
    const cfg = JSON.parse(prefs!);
    cfg.base.v = 1;
    delete cfg.base.routines;
    prefs = JSON.stringify(cfg);
    const old = JSON.parse(raw!);
    old.v = 1;
    delete old.routines;
    raw = JSON.stringify(old);

    const phone = device(gh, 'телефон', now);
    await phone.sync.connect('good');
    now.t = at(10);
    phone.store.act((s, t) => addRoutine(s, t, { title: 'Почта', questId: null, level: 1, estimateMin: 15, at: null, repeat: { every: 'day' } }));
    await vi.advanceTimersByTimeAsync(5000);

    const store = new Store(storage, () => now.t);
    const again = new Sync(store, p, gh.fetchFn, 'компьютер');
    store.act((s, t) => addTask(s, t, { title: 'Созвон', questId: s.quests[0].id }));
    await again.syncNow();
    expect(again.status.phase).toBe('ok');
    expect(store.state.routines.map((r) => r.title)).toEqual(['Почта']);
    expect(titles(store.state)).toEqual(['Отчёт', 'Почта', 'Созвон']);
  });
});

describe('слияние версий', () => {
  function pair() {
    const base = newState(at(8));
    const id = addTask(base, at(8), { title: 'Задача', questId: base.quests[0].id, day: base.day });
    const copy = () => JSON.parse(JSON.stringify(base)) as State;
    return { base, local: copy(), remote: copy(), id };
  }

  it('разные поля одной задачи берутся с той стороны, где менялись', () => {
    const { base, local, remote, id } = pair();
    local.touchedAt = at(9);
    updateTask(local, id, { title: 'Новое имя' });
    remote.touchedAt = at(10);
    complete(remote, at(10), id);
    const m = mergeGames(base, local, remote, at(10, 5));
    const t = findTask(m, id)!;
    expect(t.title).toBe('Новое имя');
    expect(t.status).toBe('done');
    expect(t.reward?.gold).toBe(25);
    expect(m.hero.gold).toBe(25);
  });

  it('строка «когда начну» с одного устройства и время с другого не теряются', () => {
    const { base, local, remote, id } = pair();
    local.touchedAt = at(9);
    updateTask(local, id, { cue: 'Когда налью чай, открою документ' });
    remote.touchedAt = at(10);
    updateTask(remote, id, { at: '15:00' });
    const m = mergeGames(base, local, remote, at(10, 5));
    expect(findTask(m, id)!.cue).toBe('Когда налью чай, открою документ');
    expect(findTask(m, id)!.at).toBe('15:00');
  });

  it('удалённый поход уходит, если его с тех пор не меняли', () => {
    const { base, local, remote } = pair();
    const q = base.quests[2].id;
    removeQuest(remote, q);
    expect(mergeGames(base, local, remote, at(9)).quests.some((x) => x.id === q)).toBe(false);
    local.quests.find((x) => x.id === q)!.name = 'Дом';
    expect(mergeGames(base, local, remote, at(9)).quests.find((x) => x.id === q)?.name).toBe('Дом');
  });

  it('часы работы за день складываются приростами', () => {
    const { base, local, remote, id } = pair();
    start(local, at(9), id);
    pause(local, at(10));
    const other = addTask(remote, at(9), { title: 'Другая', questId: remote.quests[1].id, day: remote.day });
    start(remote, at(11), other);
    pause(remote, at(11, 30));
    const m = mergeGames(base, local, remote, at(12));
    expect(m.log[m.day].workedMs).toBe(HOUR + 30 * MINUTE);
  });

  it('оценки сфер с двух устройств: разные дни остаются оба, один день берётся у того, кто оценивал позже', () => {
    const { base, local, remote } = pair();
    const [work, health] = base.quests.map((q) => q.id);
    rateSpheres(local, at(9), { [work]: 6, [health]: 4 });
    rateSpheres(remote, at(9, 30), { [work]: 8 });
    const sameDay = mergeGames(base, local, remote, at(10));
    expect(sameDay.ratings).toEqual([{ id: base.day, at: at(9, 30), scores: { [work]: 8 } }]);

    // Оценка вчерашнего дня с телефона и сегодняшняя с компьютера.
    const older = JSON.parse(JSON.stringify(local)) as State;
    older.ratings[0].id = '2026-10-22';
    const both = mergeGames(base, older, remote, at(10));
    expect(both.ratings.map((r) => r.id)).toEqual(['2026-10-22', base.day]);
    // Без общей версии тоже не теряются.
    expect(mergeGames(null, older, remote, at(10)).ratings.map((r) => r.id)).toEqual(['2026-10-22', base.day]);
  });

  it('проект, перенесённый в другую сферу, и новый проект с другого устройства сливаются', () => {
    const { base, local, remote } = pair();
    const [work, health] = base.quests.map((q) => q.id);
    const p = addQuest(base, at(8), { name: 'Сертификат', kind: 'work', color: 'blue', sphereId: work });
    const l = JSON.parse(JSON.stringify(base)) as State;
    const r = JSON.parse(JSON.stringify(base)) as State;
    l.quests.find((q) => q.id === p)!.sphereId = health;
    l.touchedAt = at(9);
    const fresh = addQuest(r, at(9), { name: 'Марафон', kind: 'personal', color: 'red', sphereId: health });
    r.touchedAt = at(9, 30);
    settle(l, at(9));
    const m = mergeGames(base, l, r, at(10));
    expect(m.quests.find((q) => q.id === p)!.sphereId).toBe(health);
    expect(m.quests.some((q) => q.id === fresh)).toBe(true);
    void local;
    void remote;
  });
});

describe('лавка с двух устройств', () => {
  /** Общая версия с золотом и двумя наградами на полке. */
  function pair(gold = 500) {
    const base = newState(at(8));
    base.hero.gold = gold;
    const tea = addPrize(base, at(8), { title: 'Чай', price: 60 })!;
    const cafe = addPrize(base, at(8), { title: 'Кафе', price: 300 })!;
    const copy = () => JSON.parse(JSON.stringify(base)) as State;
    return { base, local: copy(), remote: copy(), tea, cafe };
  }

  it('покупки с обоих устройств остаются, золото уходит за обе', () => {
    const { base, local, remote, tea, cafe } = pair();
    local.touchedAt = at(9);
    buyPrize(local, at(9), tea);
    remote.touchedAt = at(10);
    buyPrize(remote, at(10), cafe);
    const m = mergeGames(base, local, remote, at(10, 5));
    expect(m.hero.gold).toBe(500 - 60 - 300);
    expect(purchasesOf(m).map((b) => b.title)).toEqual(['Чай', 'Кафе']);
  });

  it('покупка здесь и золото за дело там складываются', () => {
    const { base, local, remote, tea } = pair(100);
    const work = base.quests[0].id;
    local.touchedAt = at(9);
    buyPrize(local, at(9), tea);
    remote.touchedAt = at(10);
    const t = addTask(remote, at(10), { title: 'Отчёт', questId: work, level: 2 });
    complete(remote, at(10), t);
    const m = mergeGames(base, local, remote, at(10, 5));
    expect(m.hero.gold).toBe(100 - 60 + 50);
    expect(purchasesOf(m)).toHaveLength(1);
  });

  it('возвращённая на одном устройстве покупка уходит и на другом, золото возвращается один раз', () => {
    const { base, tea } = pair();
    const b = buyPrize(base, at(8, 30), tea)!;
    const local = JSON.parse(JSON.stringify(base)) as State;
    const remote = JSON.parse(JSON.stringify(base)) as State;
    local.touchedAt = at(9);
    refund(local, b.id);
    const m = mergeGames(base, local, remote, at(10));
    expect(purchasesOf(m)).toEqual([]);
    expect(m.hero.gold).toBe(500);
    expect('purchases' in m).toBe(false);
  });

  it('одно и то же золото, потраченное без связи на двух устройствах, уходит в минус, а покупки обе на месте', () => {
    const { base, local, remote, cafe } = pair(300);
    local.touchedAt = at(9);
    buyPrize(local, at(9), cafe);
    remote.touchedAt = at(10);
    buyPrize(remote, at(10), cafe);
    const m = mergeGames(base, local, remote, at(10, 5));
    expect(m.hero.gold).toBe(-300);
    expect(purchasesOf(m)).toHaveLength(2);
  });

  it('новые награды с обеих сторон остаются, правки одной награды берутся по полям', () => {
    const { base, local, remote, tea, cafe } = pair();
    local.touchedAt = at(9);
    addPrize(local, at(9), { title: 'Кино', price: 800 });
    updatePrize(local, tea, { title: 'Чай с пирожным', price: 60 });
    remote.touchedAt = at(10);
    addPrize(remote, at(10), { title: 'Книга', price: 1500 });
    updatePrize(remote, tea, { title: 'Чай', price: 90 });
    const m = mergeGames(base, local, remote, at(10, 5));
    expect(prizesOf(m).map((p) => p.title).sort()).toEqual(['Кафе', 'Кино', 'Книга', 'Чай с пирожным']);
    expect(prizesOf(m).find((p) => p.id === tea)).toMatchObject({ title: 'Чай с пирожным', price: 90 });
    expect(prizesOf(m).some((p) => p.id === cafe)).toBe(true);
  });

  it('убранная награда уходит, если её с тех пор не меняли, а покупки остаются', () => {
    const { base, local, remote, tea } = pair();
    buyPrize(local, at(9), tea);
    local.touchedAt = at(9);
    removePrize(remote, tea);
    remote.touchedAt = at(10);
    const m = mergeGames(base, local, remote, at(10, 5));
    expect(prizesOf(m).some((p) => p.id === tea)).toBe(false);
    expect(purchasesOf(m).map((b) => b.title)).toEqual(['Чай']);
  });

  it('цель берётся оттуда, где её меняли, а цель на убранную награду снимается', () => {
    const { base, local, remote, tea, cafe } = pair();
    local.touchedAt = at(9);
    setGoal(local, cafe);
    const m = mergeGames(base, local, remote, at(10));
    expect(goalOf(m)?.id).toBe(cafe);

    remote.touchedAt = at(10);
    removePrize(remote, cafe);
    const gone = mergeGames(base, local, remote, at(10, 5));
    expect(gone.goalId).toBeUndefined();
    expect(prizesOf(gone).map((p) => p.id)).toEqual([tea]);
  });

  it('без общей версии награды и покупки с обеих сторон остаются', () => {
    const { local, remote, tea, cafe } = pair();
    local.touchedAt = at(9);
    buyPrize(local, at(9), tea);
    addPrize(local, at(9), { title: 'Кино', price: 800 });
    remote.touchedAt = at(10);
    buyPrize(remote, at(10), cafe);
    const m = mergeGames(null, local, remote, at(10, 5));
    expect(prizesOf(m).map((p) => p.title)).toEqual(['Чай', 'Кафе', 'Кино']);
    expect(purchasesOf(m).map((b) => b.title)).toEqual(['Чай', 'Кафе']);
  });

  it('игра без лавки после слияния остаётся без её полей', () => {
    const base = newState(at(8));
    const local = JSON.parse(JSON.stringify(base)) as State;
    const remote = JSON.parse(JSON.stringify(base)) as State;
    local.touchedAt = at(9);
    addTask(local, at(9), { title: 'Отчёт', questId: base.quests[0].id, level: 1 });
    for (const m of [mergeGames(base, local, remote, at(10)), mergeGames(null, local, remote, at(10))]) {
      expect('prizes' in m).toBe(false);
      expect('purchases' in m).toBe(false);
      expect('goalId' in m).toBe(false);
    }
  });
});
