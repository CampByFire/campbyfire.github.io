// Хранилище: держит State, сохраняет его в localStorage и оповещает экраны.
import { DEFAULT_SETTINGS, migrateToSpheres, newState, randomId, settle, touch } from './state';
import { repeatOnDays } from './time';
import type { State } from './types';

const KEY = 'taskcraft-lager-v1';
const SAVE_EVERY_MS = 15_000;

type Listener = () => void;

/** Версия формата сохранения. Растёт, когда меняется устройство State. */
export const SAVE_VERSION = 4;

/**
 * Переходы между версиями: MIGRATIONS[n] переводит сохранение версии n в версию n + 1.
 * Когда меняется State, SAVE_VERSION растёт на один, а сюда добавляется переход.
 */
const MIGRATIONS: Record<number, (s: Record<string, unknown>) => void> = {
  // 0.3.0: повторяющиеся задачи.
  1: (s) => {
    s.routines = [];
  },
  // 0.8.0: сферы как в колесе баланса, проекты внутри них, оценки сфер.
  2: (s) => {
    const st = s as unknown as State;
    st.ratings = [];
    if (st.settings) st.settings.rateEvery = DEFAULT_SETTINGS.rateEvery;
    migrateToSpheres(st);
  },
  // 0.9.4: повтор «по рабочим дням» стал выбором дней. Дни берутся из распорядка, чтобы задача приходила как раньше.
  3: (s) => {
    const st = s as unknown as State;
    const workDays = st.settings?.workDays?.length ? st.settings.workDays : [1, 2, 3, 4, 5];
    for (const r of st.routines ?? []) {
      if ((r.repeat as { every: string }).every === 'workday') r.repeat = repeatOnDays(workDays);
    }
  },
};

export interface Storage {
  load(): string | null;
  /** false, если браузер не дал записать (приватный режим, нет места). */
  save(json: string): boolean | void;
  /** Отложить нечитаемое сохранение в сторону, прежде чем игра пойдёт дальше. */
  backup?(raw: string): void;
  /** Стереть игру и отложенное сохранение. */
  clear?(): void;
}

export const browserStorage: Storage = {
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
      return true;
    } catch {
      return false;
    }
  },
  backup(raw) {
    try {
      localStorage.setItem(`${KEY}.broken`, raw);
    } catch {
      // Места нет: сохранение всё равно не затирается, пока игрок не выберет, что делать.
    }
  },
  clear() {
    try {
      localStorage.removeItem(KEY);
      localStorage.removeItem(`${KEY}.broken`);
    } catch {
      // Хранилище недоступно: стирать нечего.
    }
  },
};

/** Почему сохранение из браузера не открылось. Пока игрок не решил, поверх него ничего не пишется. */
export interface SaveProblem {
  kind: 'broken' | 'newer';
  raw: string;
}

export function parseSave(json: string): State | null {
  try {
    return checkSave(JSON.parse(json));
  } catch {
    return null;
  }
}

/** Сохранение записано более новой версией игры, чем эта. */
export function isNewerSave(json: string): boolean {
  try {
    const v = (JSON.parse(json) as { v?: unknown; state?: { v?: unknown } } | null)?.v;
    return typeof v === 'number' && v > SAVE_VERSION;
  } catch {
    return false;
  }
}

/** Проверяет, что это сохранение Лагеря, доводит старую версию до нынешней и дописывает недостающие поля. */
export function checkSave(raw: unknown): State | null {
  const s = raw as State | null;
  if (!s || typeof s !== 'object' || typeof s.v !== 'number' || !Array.isArray(s.tasks) || !Array.isArray(s.quests)) return null;
  if (s.v > SAVE_VERSION || s.v < 1) return null;
  while (s.v < SAVE_VERSION) {
    const step = MIGRATIONS[s.v];
    if (!step) return null;
    step(s as unknown as Record<string, unknown>);
    (s as { v: number }).v += 1;
  }
  s.gameId ??= randomId(12);
  s.touchedAt ??= null;
  if (!Array.isArray(s.routines)) s.routines = [];
  if (!Array.isArray(s.ratings)) s.ratings = [];
  if (s.meetings !== undefined && !Array.isArray(s.meetings)) delete s.meetings;
  if (s.settings) s.settings.rateEvery ??= DEFAULT_SETTINGS.rateEvery;
  dropFrog(s);
  return s;
}

/** Лягушки дня больше нет: старые сохранения теряют её поля. Опыт, уже полученный за неё, остаётся. */
function dropFrog(s: State): void {
  delete (s as { frogId?: unknown }).frogId;
  for (const l of Object.values(s.log ?? {})) delete (l as { frog?: unknown }).frog;
  for (const t of s.tasks) if (t.reward) delete (t.reward as { frog?: unknown }).frog;
}

export class Store {
  state: State;
  private listeners = new Set<Listener>();
  private actionListeners = new Set<Listener>();
  private lastSave = 0;
  /** Последнее записанное состояние: к нему игра откатывается, если действие упало на полпути. */
  private saved = '';
  /** Сохранение из браузера не открылось; пока это так, игра в браузер не пишется. */
  problem: SaveProblem | null = null;
  /** Последняя запись в браузер удалась. */
  saveOk = true;
  /** Игру стёрли: до перезагрузки страницы она больше ничего не пишет. */
  private wiped = false;

  constructor(
    private storage: Storage = browserStorage,
    private clock: () => number = Date.now,
  ) {
    const raw = storage.load();
    const now = clock();
    const loaded = raw ? parseSave(raw) : null;
    if (raw && !loaded) {
      this.problem = { kind: isNewerSave(raw) ? 'newer' : 'broken', raw };
      storage.backup?.(raw);
    }
    this.state = loaded || newState(now);
    settle(this.state, now);
    this.persist();
  }

  /** Игрок решил начать заново: нечитаемое сохранение остаётся отложенным, новая игра пишется. */
  startOver(): void {
    this.problem = null;
    this.state = newState(this.clock());
    this.persist();
    this.emit();
  }

  now(): number {
    return this.clock();
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Только действия игрока, без тиков времени: по ним сохранение в GitHub знает, что писать. */
  onAction(fn: Listener): () => void {
    this.actionListeners.add(fn);
    return () => this.actionListeners.delete(fn);
  }

  /**
   * Любое действие игрока: начисляем время, применяем правило, сохраняем. Если правило упало
   * с ошибкой, недоделанное действие не сохраняется: игра возвращается к последней записи.
   */
  act<R>(fn: (s: State, now: number) => R): R {
    const now = this.clock();
    let r: R;
    try {
      settle(this.state, now);
      touch(this.state, now);
      this.state.touchedAt = now;
      r = fn(this.state, now);
    } catch (e) {
      if (this.saved) this.state = JSON.parse(this.saved) as State;
      throw e;
    }
    this.persist();
    for (const l of this.actionListeners) l();
    this.emit();
    return r;
  }

  /** Раз в секунду: только время, без касания игрока. */
  tick(): void {
    const now = this.clock();
    const day = this.state.day;
    settle(this.state, now);
    if (now - this.lastSave >= SAVE_EVERY_MS || day !== this.state.day) this.persist();
    this.emit();
  }

  /** Игрок вернулся в приложение: таймер знает, что его видели, но это ещё не действие. */
  wake(): void {
    const now = this.clock();
    settle(this.state, now);
    touch(this.state, now);
    this.persist();
    this.emit();
  }

  replace(next: State): void {
    this.problem = null;
    this.state = next;
    settle(this.state, this.clock());
    this.persist();
    this.emit();
  }

  exportJson(): string {
    return JSON.stringify(this.state, null, 1);
  }

  /** «Стереть всё»: игра уходит из браузера. Страницу после этого перезагружают. */
  wipe(): void {
    this.wiped = true;
    this.storage.clear?.();
  }

  persist(): void {
    if (this.problem || this.wiped) return;
    this.lastSave = this.clock();
    this.saved = JSON.stringify(this.state);
    const ok = this.storage.save(this.saved) !== false;
    if (ok !== this.saveOk) {
      this.saveOk = ok;
      this.emit();
    }
  }

  private emit(): void {
    for (const fn of this.listeners) fn();
  }
}
