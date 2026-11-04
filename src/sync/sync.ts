// Сохранение в GitHub. Игра всегда живёт в localStorage этого браузера, а если подключён
// токен, ещё и в приватном репозитории (game/save.json), чтобы телефон и компьютер видели
// одну и ту же игру.
//
// Устройство помнит версию из GitHub, с которой совпадало в последний раз (base и её stamp).
// Там ничего не менялось, а здесь были действия: пишем свою версию. Сохранение поменяло другое
// устройство: сливаем обе (merge.ts) и пишем результат, если здесь тоже что-то делали. Запись
// идёт с sha прочитанной версии: если другое устройство успело записать между нашим чтением
// и записью, GitHub её не примет, и сверка повторится. Тики времени сами по себе не пишутся:
// время одинаково досчитывает каждое устройство.
import { isPristine, mergeGames } from '../game/merge';
import { randomId, settle } from '../game/state';
import { SAVE_VERSION, checkSave, type Store } from '../game/store';
import { addDays, dayKey } from '../game/time';
import type { State } from '../game/types';
import { GitHub, GitHubError, type Fetch, type GitHubErrorKind, type RepoInfo, type SaveDoc } from './github';

const KEY = 'taskcraft-lager-github';
/** Пауза после действия перед записью: серия нажатий уходит одной записью. */
const PUSH_DELAY = 4000;
/** Как часто смотреть, не сохранило ли что-то другое устройство. */
const POLL_EVERY = 2 * 60_000;
/** Срок токена, который ставит ссылка на его создание (TOKEN_URL). */
const TOKEN_DAYS = 366;
/** Пауза перед новой попыткой, когда GitHub не принял запись: сохранение успели обновить. */
const STALE_RETRY = 1500;
/** Сколько раз подряд пробовать заново, прежде чем показать ошибку. */
const STALE_TRIES = 3;

interface Config {
  token: string;
  login: string;
  /** owner/name репозитория с сохранением. */
  repo: string;
  branch?: string;
  /** stamp версии из GitHub, с которой это устройство совпадало в последний раз. */
  stamp: string | null;
  base: State | null;
  /**
   * stamp последних версий, которые устройство записало или уже слило. Если GitHub отдаст одну
   * из них снова (старый ответ), она не сольётся поверх более новой.
   */
  seen?: string[];
  /** Были действия игрока, которых ещё нет в GitHub. */
  dirty: boolean;
  /** С какого времени они ждут. */
  dirtyAt?: number;
  /** Игру заменили здесь (загрузили из файла): в GitHub она идёт как есть, без слияния. */
  replaced: boolean;
  syncedAt: number | null;
  /** День, когда токен перестанет работать; null, если неизвестно. */
  tokenExpires?: string | null;
  /** Срок не сообщил GitHub и не указал игрок: он посчитан от дня подключения. */
  tokenGuessed?: boolean;
}

export interface TokenExpiry {
  day: string;
  guessed: boolean;
}

export type SyncPhase = 'off' | 'syncing' | 'ok' | 'offline' | 'error' | 'conflict';

/** В GitHub другая игра: какую оставить, решает игрок. */
export interface SyncConflict {
  remote: State;
  savedAt: number;
  device: string;
}

export interface SyncStatus {
  phase: SyncPhase;
  login: string | null;
  syncedAt: number | null;
  error: string | null;
  /** Что за ошибка: по 'auth' экран сразу предлагает заменить токен. */
  errorKind: GitHubErrorKind | null;
  conflict: SyncConflict | null;
}

export interface Prefs {
  load(): string | null;
  save(json: string | null): void;
}

export const browserPrefs: Prefs = {
  load() {
    try {
      return localStorage.getItem(KEY);
    } catch {
      return null;
    }
  },
  save(json) {
    try {
      if (json === null) localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, json);
    } catch {
      // Без localStorage игра всё равно идёт, просто не помнит подключение.
    }
  },
};

export function guessDevice(): string {
  const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent;
  return /Android|iPhone|iPad|Mobile/i.test(ua) ? 'телефон' : 'компьютер';
}

const snapshot = (s: State): State => JSON.parse(JSON.stringify(s)) as State;

export class Sync {
  status: SyncStatus;
  private cfg: Config | null;
  private listeners = new Set<() => void>();
  private running: Promise<void> | null = null;
  private again = false;
  private actions = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;
  /** stamp версии из GitHub, которая ждёт выбора игрока, когда там другая игра. */
  private pendingStamp: string | null = null;
  /** Сколько раз подряд GitHub не принял запись, потому что сохранение успели обновить. */
  private staleTries = 0;

  constructor(
    private store: Store,
    private prefs: Prefs = browserPrefs,
    private fetchFn?: Fetch,
    private device: string = guessDevice(),
  ) {
    this.cfg = this.loadConfig();
    this.status = { phase: this.cfg ? 'ok' : 'off', login: this.cfg?.login ?? null, syncedAt: this.cfg?.syncedAt ?? null, error: null, errorKind: null, conflict: null };
    store.onAction(() => this.onAction());
  }

  get connected(): boolean {
    return this.cfg !== null;
  }

  /** Репозиторий с сохранением. */
  get repo(): RepoInfo | null {
    return this.cfg ? { repo: this.cfg.repo, branch: this.cfg.branch || 'main' } : null;
  }

  /** Токен и репозиторий для заметок Летописи; null, пока GitHub не подключён. */
  get access(): { token: string; repo: string; branch: string } | null {
    const c = this.cfg;
    return c ? { token: c.token, repo: c.repo, branch: c.branch || 'main' } : null;
  }

  /** Откуда записано: «телефон» или «компьютер». */
  get deviceName(): string {
    return this.device;
  }

  /** С какого времени действия игрока ждут записи в GitHub; null, если всё записано. */
  get pendingSince(): number | null {
    return this.cfg?.dirty ? this.cfg.dirtyAt ?? null : null;
  }

  /** Когда токен перестанет работать. */
  get tokenExpiry(): TokenExpiry | null {
    const c = this.cfg;
    return c?.tokenExpires ? { day: c.tokenExpires, guessed: !!c.tokenGuessed } : null;
  }

  /** Игрок сам указал срок токена (он виден на странице токенов GitHub). */
  setTokenExpiry(day: string): void {
    if (!this.cfg) return;
    this.cfg.tokenExpires = day;
    this.cfg.tokenGuessed = false;
    this.saveConfig();
    this.setStatus({});
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /**
   * Подключает GitHub по токену. Находит репозиторий lager-data и сохранение в нём, а если
   * сохранения ещё нет, записывает туда эту игру. Ошибку бросает, чтобы экран показал её у поля токена.
   */
  async connect(token: string): Promise<void> {
    token = token.trim();
    if (!token) throw new GitHubError('Вставь токен', 'auth');
    const gh = new GitHub(token, this.fetchFn);
    const { login, expires } = await gh.user();
    const { repo, branch } = await gh.findRepo(login);
    const { doc: found } = await gh.read(repo);
    const cfg: Config = { token, login, repo, branch, stamp: null, base: null, dirty: false, replaced: false, syncedAt: null, ...this.expiry(expires) };
    if (!found) {
      const { doc, state } = this.makeDoc(this.store.state);
      try {
        await gh.write(repo, doc, null, this.message());
        Object.assign(cfg, { stamp: doc.stamp, base: state, seen: [doc.stamp], syncedAt: this.store.now() });
      } catch (e) {
        // Другое устройство записало как раз сейчас: сверка ниже сольёт игры.
        if (!(e instanceof GitHubError && e.kind === 'stale')) throw e;
      }
    }
    this.cfg = cfg;
    this.saveConfig();
    this.setStatus({ phase: 'ok', login, syncedAt: cfg.syncedAt, error: null, conflict: null });
    if (!cfg.stamp) await this.syncNow();
  }

  /**
   * Новый токен вместо старого (срок кончается или токен отозвали). Он должен быть от того же
   * аккаунта и видеть репозиторий с сохранением; иначе ошибка, и остаётся старый.
   */
  async replaceToken(token: string): Promise<void> {
    const cfg = this.cfg;
    if (!cfg) return;
    token = token.trim();
    if (!token) throw new GitHubError('Вставь токен', 'auth');
    const gh = new GitHub(token, this.fetchFn);
    const { login, expires } = await gh.user();
    if (login !== cfg.login) {
      throw new GitHubError(`Это токен аккаунта ${login}, а игра сохраняется у ${cfg.login}. Чтобы сменить аккаунт, отключи GitHub и подключи снова`, 'other');
    }
    await gh.repo(cfg.repo);
    if (this.cfg !== cfg) return;
    Object.assign(cfg, { token }, this.expiry(expires));
    this.saveConfig();
    this.setStatus({ phase: 'ok', error: null });
    await this.syncNow();
  }

  /** Забыть токен на этом устройстве. Сохранение на GitHub остаётся. */
  disconnect(): void {
    clearTimeout(this.timer);
    this.cfg = null;
    this.prefs.save(null);
    this.setStatus({ phase: 'off', login: null, syncedAt: null, error: null, conflict: null });
  }

  /**
   * Удалить сохранение из GitHub и забыть токен. Удаляется только game/save.json: репозиторий
   * и дневник остаются. Если GitHub не ответил, ничего не меняется.
   */
  async removeSave(): Promise<void> {
    const cfg = this.cfg;
    if (!cfg) return;
    clearTimeout(this.timer);
    await new GitHub(cfg.token, this.fetchFn).remove(cfg.repo, `Лагерь: сохранение удалено (${this.device})`);
    if (this.cfg === cfg) this.disconnect();
  }

  /**
   * Сохранение в браузере не открылось, и игрок начал заново: следующая сверка возьмёт игру
   * из GitHub как есть, а не станет сливать её с новой пустой.
   */
  pullFresh(): void {
    if (!this.cfg) return;
    Object.assign(this.cfg, { stamp: null, base: null, seen: [], dirty: false, replaced: false });
    this.saveConfig();
  }

  /** Игру заменили копией из файла: в GitHub она пойдёт целиком. */
  replaceGame(next: State): void {
    this.store.replace(next);
    if (!this.cfg) return;
    this.cfg.replaced = true;
    this.markDirty(this.cfg);
    this.saveConfig();
    this.schedule(0);
  }

  /** Сверить с GitHub сейчас. Если сверка уже идёт, после неё будет ещё одна. */
  syncNow(): Promise<void> {
    if (!this.cfg || this.status.phase === 'conflict') return Promise.resolve();
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

  /** Выбор игрока, когда в GitHub другая игра. */
  async resolve(choice: 'remote' | 'local' | 'cancel'): Promise<void> {
    const c = this.status.conflict;
    const cfg = this.cfg;
    if (!c || !cfg) return;
    if (choice === 'cancel') {
      this.disconnect();
      return;
    }
    if (choice === 'remote') {
      this.adopt(cfg, c.remote, this.pendingStamp, this.store.now());
      cfg.syncedAt = this.store.now();
      this.saveConfig();
      this.setStatus({ phase: 'ok', conflict: null, syncedAt: cfg.syncedAt });
      return;
    }
    cfg.replaced = true;
    this.markDirty(cfg);
    this.saveConfig();
    this.setStatus({ phase: 'ok', conflict: null });
    await this.syncNow();
  }

  /** Для браузера: сверка при запуске, по таймеру, при возвращении в приложение и появлении сети. */
  start(): () => void {
    void this.syncNow();
    const poll = setInterval(() => {
      if (document.visibilityState === 'visible') void this.syncNow();
    }, POLL_EVERY);
    const onVis = () => {
      if (document.visibilityState === 'visible' || this.cfg?.dirty) void this.syncNow();
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

  private onAction(): void {
    this.actions += 1;
    if (!this.cfg) return;
    if (!this.cfg.dirty) {
      this.markDirty(this.cfg);
      this.saveConfig();
    }
    this.schedule(PUSH_DELAY);
  }

  private markDirty(cfg: Config): void {
    if (!cfg.dirty) cfg.dirtyAt = this.store.now();
    cfg.dirty = true;
  }

  private schedule(ms: number): void {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.syncNow(), ms);
  }

  private async run(): Promise<void> {
    const cfg = this.cfg;
    if (!cfg) return;
    const gh = new GitHub(cfg.token, this.fetchFn);
    this.setStatus({ phase: 'syncing', error: null });
    try {
      const { doc: remote, sha } = await gh.read(cfg.repo);
      if (this.cfg !== cfg) return;
      // Отсюда и до записи без await: действие игрока не может вклиниться между чтением и слиянием.
      const now = this.store.now();
      const local = this.store.state;
      let write = false;
      if (!remote) {
        write = true;
      } else {
        const rs = checkSave(remote.state);
        if (!rs) {
          const v = (remote.state as { v?: unknown } | null)?.v;
          const newer = typeof v === 'number' && v > SAVE_VERSION;
          throw new GitHubError(newer ? 'В GitHub игра из более новой версии Лагеря. Обнови страницу' : 'В GitHub повреждённое сохранение', 'other');
        }
        if (remote.stamp === cfg.stamp || cfg.replaced || cfg.seen?.includes(remote.stamp)) {
          // Своя версия или уже слитая: сливать нечего. Если это старый ответ GitHub, запись
          // с его sha не пройдёт, и сверка повторится.
          write = cfg.dirty || cfg.replaced;
        } else if (rs.gameId !== local.gameId) {
          if (!isPristine(local)) {
            this.pendingStamp = remote.stamp;
            this.setStatus({ phase: 'conflict', conflict: { remote: rs, savedAt: remote.savedAt, device: remote.device } });
            return;
          }
          // Здесь ещё ничего не делали: просто берём игру из GitHub.
          this.adopt(cfg, rs, remote.stamp, now);
          this.remember(cfg, remote.stamp);
        } else {
          const merged = mergeGames(cfg.stamp ? cfg.base : null, local, rs, now);
          this.store.replace(merged);
          // Своё, чего нет в GitHub, помечаем несохранённым: если запись сейчас не пройдёт, следующая
          // сверка всё равно его запишет.
          if (cfg.dirty || !cfg.stamp) {
            this.markDirty(cfg);
            write = true;
          }
          // Игра здесь уже включает версию из GitHub: дальше сливаем от неё, даже если запись
          // сейчас не пройдёт. Иначе прирост золота и опыта с другого устройства посчитался бы дважды.
          cfg.base = rs;
          cfg.stamp = remote.stamp;
          this.remember(cfg, remote.stamp);
        }
      }
      if (write) {
        const seen = this.actions;
        const { doc, state } = this.makeDoc(this.store.state);
        await gh.write(cfg.repo, doc, sha, this.message());
        if (this.cfg !== cfg) return;
        cfg.stamp = doc.stamp;
        cfg.base = state;
        cfg.replaced = false;
        this.remember(cfg, doc.stamp);
        // Пока шла запись, игрок мог что-то сделать: это уйдёт следующей записью.
        cfg.dirty = false;
        if (this.actions !== seen) this.markDirty(cfg);
        if (cfg.dirty) this.schedule(PUSH_DELAY);
      }
      this.staleTries = 0;
      cfg.syncedAt = this.store.now();
      this.saveConfig();
      this.setStatus({ phase: 'ok', syncedAt: cfg.syncedAt, error: null });
    } catch (e) {
      // GitHub отключили, пока шла сверка: её ошибка уже ни о чём.
      if (this.cfg !== cfg) return;
      this.saveConfig();
      const err = e instanceof GitHubError ? e : new GitHubError('Не получилось сохранить в GitHub', 'other');
      // Другое устройство записало между нашим чтением и записью: читаем, сливаем и пишем заново.
      if (err.kind === 'stale' && ++this.staleTries <= STALE_TRIES) {
        this.schedule(STALE_RETRY);
        return;
      }
      this.staleTries = 0;
      this.setStatus({ phase: err.kind === 'network' ? 'offline' : 'error', error: err.message, errorKind: err.kind });
    }
  }

  private remember(cfg: Config, stamp: string): void {
    cfg.seen = [stamp, ...(cfg.seen ?? []).filter((x) => x !== stamp)].slice(0, 20);
  }

  private message(): string {
    return `Лагерь: сохранение (${this.device})`;
  }

  private expiry(expires: string | null): Pick<Config, 'tokenExpires' | 'tokenGuessed'> {
    return { tokenExpires: expires ?? addDays(dayKey(this.store.now()), TOKEN_DAYS), tokenGuessed: !expires };
  }

  private adopt(cfg: Config, remote: State, stamp: string | null, now: number): void {
    const next = snapshot(remote);
    settle(next, now);
    this.store.replace(next);
    cfg.base = remote;
    cfg.stamp = stamp;
    cfg.dirty = false;
    cfg.replaced = false;
  }

  private makeDoc(s: State): { doc: SaveDoc; state: State } {
    const state = snapshot(s);
    return { doc: { app: 'taskcraft-lager', format: 1, stamp: randomId(10), savedAt: this.store.now(), device: this.device, state }, state };
  }

  private setStatus(patch: Partial<SyncStatus>): void {
    if (patch.error === null) patch.errorKind = null;
    this.status = { ...this.status, ...patch };
    for (const fn of this.listeners) fn();
  }

  private loadConfig(): Config | null {
    const raw = this.prefs.load();
    if (!raw) return null;
    try {
      const c = JSON.parse(raw) as Config;
      // Подключение к гисту от старых версий игры (без repo) не читается: GitHub подключают заново.
      if (!c || typeof c.token !== 'string' || typeof c.repo !== 'string' || !c.repo) return null;
      // Ссылка на старый гист, которая осталась после переезда, больше не нужна.
      delete (c as { gistId?: unknown }).gistId;
      // Версия для слияния могла быть записана прошлой версией игры: доводим её до нынешней.
      // Если она не читается, следующая сверка сольёт игры без неё, ничего не теряя.
      if (c.base) c.base = checkSave(c.base);
      if (!c.base) c.stamp = null;
      return c;
    } catch {
      return null;
    }
  }

  private saveConfig(): void {
    if (this.cfg) this.prefs.save(JSON.stringify(this.cfg));
  }
}
