// Напоминания через Google Календарь. Своего сервера у Лагеря нет, поэтому вход идёт прямо из браузера
// (OAuth 2.0 для приложений в браузере, response_type=token): Google возвращает игрока на страницу
// Лагеря с токеном в адресе, токен живёт около часа и хранится только на этом устройстве. Пока Лагерь
// открыт, он сверяет календарь «Лагерь» в Google с игрой: заводит новые события, правит изменившиеся
// и убирает лишние. Звонит сам Google, так что напоминания приходят, даже когда Лагерь закрыт.
//
// События те же, что в файле календаря (calendarEntries в ics.ts). У каждого постоянный id из ключа
// задачи или события, поэтому правка меняет событие, а не заводит второе. Календарь создаёт сам
// Лагерь, а доступ просится только к календарям, которые создал он (calendar.app.created): остальной
// календарь игрока Лагерь не видит. id календаря лежит в игре (State.googleCalendar), чтобы телефон и
// компьютер писали в один календарь.
import { calendarEntries, type CalEntry, type IcsOptions } from '../game/ics';
import { randomId } from '../game/state';
import type { Store } from '../game/store';
import { addDays } from '../game/time';
import type { DayKey } from '../game/types';
import type { Fetch } from './github';

export const GOOGLE_SCOPE = 'https://www.googleapis.com/auth/calendar.app.created';
export const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
export const GOOGLE_API = 'https://www.googleapis.com/calendar/v3';
/** Где в аккаунте Google снять доступ у Лагеря. */
export const GOOGLE_PERMISSIONS_URL = 'https://myaccount.google.com/permissions';
/** Как называется календарь в Google. */
export const CALENDAR_NAME = 'Лагерь';
/** С этого начинаются id всех событий Лагеря в Google. */
const ID_PREFIX = 'lager';

const KEY = 'taskcraft-lager-google';
/** Пауза после действия перед сверкой: серия нажатий уходит одной сверкой. */
const PUSH_DELAY = 3000;
/** Токен считается кончившимся на минуту раньше, чем скажет Google. */
const EXPIRY_MARGIN = 60_000;

// ———————————————————————— события ————————————————————————

/** Событие в виде, в каком его принимает Google Calendar API (events). */
export interface GEvent {
  id: string;
  status: 'confirmed';
  summary: string;
  description: string;
  location?: string;
  start: GTime;
  end: GTime;
  recurrence?: string[];
  reminders: { useDefault: false; overrides: { method: 'popup'; minutes: number }[] };
  extendedProperties: { private: { lager: string } };
}

export interface GTime {
  date?: string;
  dateTime?: string;
  timeZone?: string;
}

/** Событие, каким его отдаёт Google при чтении календаря (нужные поля). */
export interface GExisting {
  id: string;
  status?: string;
  recurringEventId?: string;
  extendedProperties?: { private?: Record<string, string> };
}

/** id события в Google: «lager» и ключ в шестнадцатеричном виде. Google разрешает в id только буквы a–v и цифры. */
export function eventId(key: string): string {
  return ID_PREFIX + [...new TextEncoder().encode(key)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Короткий отпечаток события: по нему видно, что событие в Google уже такое, как надо. */
function fingerprint(x: unknown): string {
  const str = JSON.stringify(x);
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

const pad = (n: number) => String(n).padStart(2, '0');

/** День и минуты от его полуночи → «2026-10-23T19:00:00»; минуты за полночь переходят на следующий день. */
function dateTime(day: DayKey, min: number): string {
  let d = day;
  let m = min;
  while (m >= 24 * 60) {
    d = addDays(d, 1);
    m -= 24 * 60;
  }
  return `${d}T${pad(Math.floor(m / 60))}:${pad(m % 60)}:00`;
}

const compact = (s: string) => s.replace(/[-:]/g, '');

/** «UNTIL=20261231T235959» в правиле повтора: Google, как и RFC 5545, ждёт его в UTC, когда у начала есть пояс. */
function untilUtc(rule: string): string {
  return rule.replace(/UNTIL=(\d{4})(\d{2})(\d{2})T235959(?!Z)/, (_, y: string, mo: string, d: string) => {
    const utc = new Date(Number(y), Number(mo) - 1, Number(d), 23, 59, 59).toISOString();
    return `UNTIL=${utc.replace(/[-:]/g, '').replace(/\.\d+/, '')}`;
  });
}

/**
 * Событие Лагеря → событие Google. Время Лагеря «плавающее», как на часах телефона, поэтому событию
 * ставится пояс этого устройства (tz).
 */
export function toGoogle(e: CalEntry, tz: string): GEvent {
  const allDay = e.start === null;
  const start: GTime = allDay ? { date: e.day } : { dateTime: dateTime(e.day, e.start!), timeZone: tz };
  const end: GTime = allDay ? { date: addDays(e.day, 1) } : { dateTime: dateTime(e.day, e.start! + Math.max(5, Math.round(e.min))), timeZone: tz };
  const recurrence = e.rule
    ? [
        `RRULE:${allDay ? e.rule : untilUtc(e.rule)}`,
        ...(e.except ?? []).map((d) => (allDay ? `EXDATE;VALUE=DATE:${compact(d)}` : `EXDATE;TZID=${tz}:${compact(dateTime(d, e.start!))}`)),
      ]
    : undefined;
  const body = {
    id: eventId(e.key),
    status: 'confirmed' as const,
    summary: e.title,
    description: e.note,
    ...(e.place ? { location: e.place } : {}),
    start,
    end,
    ...(recurrence ? { recurrence } : {}),
    reminders: { useDefault: false as const, overrides: [{ method: 'popup' as const, minutes: Math.max(0, Math.round(e.alarm)) }] },
  };
  return { ...body, extendedProperties: { private: { lager: fingerprint(body) } } };
}

export interface SyncPlan {
  insert: GEvent[];
  update: GEvent[];
  remove: string[];
}

/**
 * Что поменять в Google, чтобы там стало как в игре. Новое заводится, изменившееся и удалённое
 * раньше (Google помнит удалённые события по id) правится, а события Лагеря, которых в игре больше
 * нет, убираются. Чужие события в календаре и отдельные дни серий, поправленные прямо в Google, не трогаются.
 */
export function planSync(want: GEvent[], have: GExisting[]): SyncPlan {
  const byId = new Map(have.map((h) => [h.id, h]));
  const wanted = new Set(want.map((w) => w.id));
  const plan: SyncPlan = { insert: [], update: [], remove: [] };
  for (const w of want) {
    const h = byId.get(w.id);
    if (!h) plan.insert.push(w);
    else if (h.status === 'cancelled' || h.extendedProperties?.private?.lager !== w.extendedProperties.private.lager) plan.update.push(w);
  }
  for (const h of have) {
    if (h.status === 'cancelled' || h.recurringEventId || !h.id.startsWith(ID_PREFIX) || wanted.has(h.id)) continue;
    plan.remove.push(h.id);
  }
  return plan;
}

// ———————————————————————— вход ————————————————————————

/** Ответ Google в адресе страницы после входа. */
export type AuthResult = { ok: true; token: string; expiresIn: number } | { ok: false; reason: 'denied' | 'scope' | 'state' };

/** Разобрать «#access_token=…&expires_in=…&state=…» (или «#error=…»). null: в адресе не ответ Google. */
export function parseAuthHash(hash: string, expectState: string | null): AuthResult | null {
  const p = new URLSearchParams(hash.replace(/^#/, ''));
  const token = p.get('access_token');
  const error = p.get('error');
  if (!token && !error) return null;
  if (!expectState || p.get('state') !== expectState) return { ok: false, reason: 'state' };
  if (!token) return { ok: false, reason: 'denied' };
  const scope = p.get('scope');
  if (scope !== null && !scope.split(' ').includes(GOOGLE_SCOPE)) return { ok: false, reason: 'scope' };
  return { ok: true, token, expiresIn: Number(p.get('expires_in')) || 3600 };
}

export function authUrl(clientId: string, redirect: string, state: string): string {
  const q = new URLSearchParams({ client_id: clientId, redirect_uri: redirect, response_type: 'token', scope: GOOGLE_SCOPE, state });
  return `${GOOGLE_AUTH_URL}?${q}`;
}

// ———————————————————————— сверка ————————————————————————

export type GoogleErrorKind = 'auth' | 'offline' | 'gone' | 'conflict' | 'other';

export class GoogleError extends Error {
  constructor(
    message: string,
    readonly kind: GoogleErrorKind,
  ) {
    super(message);
    this.name = 'GoogleError';
  }
}

export type GooglePhase = 'off' | 'syncing' | 'ok' | 'expired' | 'offline' | 'error';

export interface GoogleStatus {
  phase: GooglePhase;
  /** Когда календарь последний раз совпал с игрой. */
  syncedAt: number | null;
  /** Сколько событий Лагеря сейчас в Google. */
  events: number | null;
  error: string | null;
}

interface Config {
  /** OAuth-ключ (Client ID), если его вписали в Настройках, а не при сборке. */
  clientId?: string;
  /** Google подключён на этом устройстве. */
  on: boolean;
  token: string | null;
  expiresAt: number;
  /** Ждём ответа Google после входа: случайная строка, которая должна вернуться. */
  pending?: string;
  /** Календарь, который создало это устройство: если игра выберет другой, этот уберётся. */
  own?: string;
  syncedAt: number | null;
  events?: number;
  /** Есть изменения, которых ещё нет в Google. */
  dirty?: boolean;
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
      // Без localStorage подключение просто не запомнится.
    }
  },
};

export interface GoogleDeps {
  /** Что ставить в календарь: утренний костёр и адрес Лагеря берутся из настроек устройства. */
  options: () => IcsOptions;
  prefs?: Prefs;
  fetchFn?: Fetch;
  /** OAuth-ключ, вписанный при сборке сайта (LAGER_GOOGLE_CLIENT_ID); пустая строка: его нет. */
  buildClientId?: string;
  /** Пояс этого устройства. */
  timeZone?: () => string;
}

export class GoogleCalendar {
  status: GoogleStatus;
  /** Что сказать игроку, когда страница открылась после входа в Google; экран забирает это один раз. */
  flash: { ok: boolean; text: string } | null = null;
  private cfg: Config;
  private listeners = new Set<() => void>();
  private running: Promise<void> | null = null;
  private again = false;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private day: DayKey;
  private readonly prefs: Prefs;
  private readonly fetchFn: Fetch;
  private readonly tz: () => string;

  constructor(
    private store: Store,
    private deps: GoogleDeps,
  ) {
    this.prefs = deps.prefs ?? browserPrefs;
    this.fetchFn = deps.fetchFn ?? ((url, init) => fetch(url, init));
    this.tz = deps.timeZone ?? (() => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC');
    this.cfg = this.loadConfig();
    this.day = store.state.day;
    this.status = { phase: 'off', syncedAt: this.cfg.syncedAt, events: this.cfg.events ?? null, error: null };
    this.status.phase = this.idlePhase();
  }

  /** Google подключали на этом устройстве (даже если вход уже кончился). */
  get connected(): boolean {
    return this.cfg.on;
  }

  get clientId(): string {
    return (this.cfg.clientId || this.deps.buildClientId || '').trim();
  }

  /** Ключ вписан при сборке сайта: поле для него в Настройках не нужно. */
  get builtIn(): boolean {
    return !!this.deps.buildClientId;
  }

  /** Изменения ждут, когда в Google снова войдут. */
  get waiting(): boolean {
    return this.cfg.on && !!this.cfg.dirty && this.status.phase === 'expired';
  }

  setClientId(id: string): void {
    this.cfg.clientId = id.trim() || undefined;
    this.saveConfig();
    this.emit();
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Адрес входа в Google. Перед уходом туда устройство запоминает, какой ответ ждать. */
  loginUrl(redirect: string): string {
    const state = randomId(16);
    this.cfg.pending = state;
    this.saveConfig();
    return authUrl(this.clientId, redirect, state);
  }

  /**
   * Страница открылась после входа в Google: забрать токен из адреса. null: в адресе не ответ Google.
   * Иначе понятная фраза для игрока и удалось ли войти.
   */
  takeRedirect(hash: string): { ok: boolean; text: string } | null {
    const r = parseAuthHash(hash, this.cfg.pending ?? null);
    if (!r) return null;
    delete this.cfg.pending;
    if (r.ok) {
      this.cfg.on = true;
      this.cfg.token = r.token;
      this.cfg.expiresAt = this.store.now() + r.expiresIn * 1000 - EXPIRY_MARGIN;
      this.cfg.dirty = true;
      this.saveConfig();
      this.setStatus({ phase: 'ok', error: null });
      return { ok: true, text: 'Google Календарь подключён' };
    }
    this.saveConfig();
    const text = {
      denied: 'Google Календарь не подключён: вход отменили',
      scope: 'Google Календарь не подключён: нужна галочка доступа к календарям',
      state: 'Google Календарь не подключён: попробуй войти ещё раз',
    }[r.reason];
    return { ok: false, text };
  }

  /** Сверять календарь, когда игра меняется и когда наступает новый день. Возвращает функцию остановки. */
  start(): () => void {
    const offAction = this.store.onAction(() => this.changed());
    const offState = this.store.subscribe(() => {
      if (this.store.state.day !== this.day) {
        this.day = this.store.state.day;
        this.changed();
      }
    });
    if (this.cfg.on) this.schedule(0);
    return () => {
      offAction();
      offState();
      clearTimeout(this.timer);
    };
  }

  /** Что-то поменялось: утренний костёр в Настройках, задача, день. */
  changed(): void {
    if (!this.cfg.on) return;
    this.cfg.dirty = true;
    this.saveConfig();
    this.schedule(PUSH_DELAY);
  }

  schedule(delay: number): void {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.syncNow(), delay);
  }

  /** Сверить сейчас. Если сверка уже идёт, после неё пройдёт ещё одна. */
  syncNow(): Promise<void> {
    if (this.running) {
      this.again = true;
      return this.running;
    }
    this.running = (async () => {
      try {
        do {
          this.again = false;
          await this.once();
        } while (this.again);
      } finally {
        this.running = null;
      }
    })();
    return this.running;
  }

  /**
   * Отключить Google на этом устройстве. removeCalendar: ещё и удалить календарь «Лагерь» из Google
   * вместе с напоминаниями (если вход ещё действует). Возвращает, удалился ли календарь.
   */
  async disconnect(removeCalendar: boolean): Promise<boolean> {
    clearTimeout(this.timer);
    let removed = false;
    const cal = this.store.state.googleCalendar;
    if (removeCalendar && cal && this.alive()) {
      try {
        await this.call('DELETE', `/calendars/${encodeURIComponent(cal)}`);
        removed = true;
      } catch (e) {
        if (!(e instanceof GoogleError) || e.kind !== 'gone') throw e;
        removed = true;
      }
      this.store.act((s) => {
        delete s.googleCalendar;
      });
    }
    this.forget();
    return removed;
  }

  /** Забыть вход и всё, что устройство помнит о Google («Стереть всё»). Календарь в Google остаётся. */
  forget(): void {
    clearTimeout(this.timer);
    this.cfg = { clientId: this.cfg.clientId, on: false, token: null, expiresAt: 0, syncedAt: null };
    this.saveConfig();
    this.setStatus({ phase: 'off', syncedAt: null, events: null, error: null });
  }

  private alive(): boolean {
    return !!this.cfg.token && this.store.now() < this.cfg.expiresAt;
  }

  private idlePhase(): GooglePhase {
    if (!this.cfg.on) return 'off';
    return this.alive() ? 'ok' : 'expired';
  }

  private async once(): Promise<void> {
    if (!this.cfg.on) return;
    if (!this.alive()) {
      this.setStatus({ phase: 'expired', error: null });
      return;
    }
    this.setStatus({ phase: 'syncing', error: null });
    try {
      let cal = await this.calendar();
      let have: GExisting[];
      try {
        have = await this.list(cal);
      } catch (e) {
        // Календарь удалили прямо в Google: заводим новый.
        if (!(e instanceof GoogleError) || e.kind !== 'gone') throw e;
        this.store.act((s) => {
          if (s.googleCalendar === cal) delete s.googleCalendar;
        });
        cal = await this.calendar();
        have = [];
      }
      const tz = this.tz();
      const want = calendarEntries(this.store.state, this.deps.options()).map((e) => toGoogle(e, tz));
      const plan = planSync(want, have);
      const base = `/calendars/${encodeURIComponent(cal)}/events`;
      for (const ev of plan.insert) {
        try {
          await this.call('POST', base, ev);
        } catch (e) {
          // Такое событие уже было и удалено: Google держит его id, поэтому его не заводят, а правят.
          if (!(e instanceof GoogleError) || e.kind !== 'conflict') throw e;
          await this.call('PUT', `${base}/${ev.id}`, ev);
        }
      }
      for (const ev of plan.update) await this.call('PUT', `${base}/${ev.id}`, ev);
      for (const id of plan.remove) {
        try {
          await this.call('DELETE', `${base}/${id}`);
        } catch (e) {
          if (!(e instanceof GoogleError) || e.kind !== 'gone') throw e;
        }
      }
      this.cfg.syncedAt = this.store.now();
      this.cfg.events = want.length;
      if (!this.again) this.cfg.dirty = false;
      this.saveConfig();
      this.setStatus({ phase: 'ok', syncedAt: this.cfg.syncedAt, events: want.length, error: null });
    } catch (e) {
      if (!(e instanceof GoogleError)) {
        console.error(e);
        this.setStatus({ phase: 'error', error: 'Не получилось обновить Google Календарь' });
        return;
      }
      if (e.kind === 'auth') {
        this.cfg.token = null;
        this.saveConfig();
        this.setStatus({ phase: 'expired', error: null });
      } else if (e.kind === 'offline') {
        this.setStatus({ phase: 'offline', error: null });
      } else {
        this.setStatus({ phase: 'error', error: e.message });
      }
    }
  }

  /** Календарь «Лагерь»: тот, что записан в игре, или новый. Лишний календарь этого устройства убирается. */
  private async calendar(): Promise<string> {
    const shared = this.store.state.googleCalendar;
    if (shared) {
      if (this.cfg.own && this.cfg.own !== shared) {
        try {
          await this.call('DELETE', `/calendars/${encodeURIComponent(this.cfg.own)}`);
        } catch (e) {
          if (!(e instanceof GoogleError) || e.kind !== 'gone') throw e;
        }
      }
      if (this.cfg.own !== shared) {
        delete this.cfg.own;
        this.saveConfig();
      }
      return shared;
    }
    const made = (await this.call('POST', '/calendars', {
      summary: CALENDAR_NAME,
      description: 'Напоминания из Лагеря у костра. Календарь ведёт сам Лагерь: правки здесь он перепишет.',
      timeZone: this.tz(),
    })) as { id?: string } | null;
    if (!made?.id) throw new GoogleError('Google не создал календарь', 'other');
    this.cfg.own = made.id;
    this.saveConfig();
    this.store.act((s) => {
      s.googleCalendar = made.id;
    });
    return made.id;
  }

  private async list(cal: string): Promise<GExisting[]> {
    const out: GExisting[] = [];
    let page: string | undefined;
    do {
      const q = new URLSearchParams({ showDeleted: 'true', maxResults: '2500', fields: 'items(id,status,recurringEventId,extendedProperties),nextPageToken' });
      if (page) q.set('pageToken', page);
      const res = (await this.call('GET', `/calendars/${encodeURIComponent(cal)}/events?${q}`)) as { items?: GExisting[]; nextPageToken?: string } | null;
      out.push(...(res?.items ?? []));
      page = res?.nextPageToken;
    } while (page);
    return out;
  }

  /** Запрос к Calendar API. Токен уходит только в заголовке и нигде не пишется. */
  private async call(method: string, path: string, body?: unknown): Promise<unknown> {
    let res: Response;
    try {
      res = await this.fetchFn(`${GOOGLE_API}${path}`, {
        method,
        headers: { Authorization: `Bearer ${this.cfg.token ?? ''}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch {
      throw new GoogleError('Нет связи с Google', 'offline');
    }
    if (res.ok) return res.status === 204 ? null : ((await res.json().catch(() => null)) as unknown);
    if (res.status === 401) throw new GoogleError('Вход в Google кончился', 'auth');
    if (res.status === 404 || res.status === 410) throw new GoogleError('Нет такого в Google', 'gone');
    if (res.status === 409) throw new GoogleError('Уже есть в Google', 'conflict');
    const err = ((await res.json().catch(() => null)) as { error?: { message?: string; errors?: { reason?: string }[] } } | null)?.error;
    const reason = err?.errors?.[0]?.reason;
    if (reason === 'accessNotConfigured') throw new GoogleError('В Google Cloud не включён Google Calendar API: включи его в своём проекте', 'other');
    if (res.status === 403 && (reason === 'insufficientPermissions' || reason === 'forbidden')) throw new GoogleError('Google не дал Лагерю доступ к календарю: подключи Google заново', 'auth');
    if (res.status === 403 || res.status === 429) throw new GoogleError('Google просит подождать: календарь обновится чуть позже', 'other');
    throw new GoogleError(`Google ответил ошибкой ${res.status}${err?.message ? `: ${err.message}` : ''}`, 'other');
  }

  private setStatus(patch: Partial<GoogleStatus>): void {
    this.status = { ...this.status, ...patch };
    this.emit();
  }

  private emit(): void {
    for (const fn of this.listeners) fn();
  }

  private loadConfig(): Config {
    const empty: Config = { on: false, token: null, expiresAt: 0, syncedAt: null };
    const raw = this.prefs.load();
    if (!raw) return empty;
    try {
      const c = JSON.parse(raw) as Partial<Config> | null;
      if (!c || typeof c !== 'object') return empty;
      return { ...empty, ...c, on: c.on === true, token: typeof c.token === 'string' ? c.token : null, expiresAt: Number(c.expiresAt) || 0 };
    } catch {
      return empty;
    }
  }

  private saveConfig(): void {
    this.prefs.save(JSON.stringify(this.cfg));
  }
}
