// Google Календарь: события Лагеря в виде Google, сверка, вход и работа с поддельным Google.
import { describe, expect, it } from 'vitest';
import { addMeeting, skipMeetingDay } from '../src/game/calendar';
import { calendarEntries, type IcsOptions } from '../src/game/ics';
import { addRoutine, addTask, complete, newState, release, updateTask } from '../src/game/state';
import { Store, type Storage } from '../src/game/store';
import type { Fetch } from '../src/sync/github';
import { GOOGLE_API, GOOGLE_SCOPE, GoogleCalendar, authUrl, eventId, parseAuthHash, planSync, toGoogle, type GEvent, type Prefs } from '../src/sync/gcal';

// Пятница, 23 октября 2026.
const at = (h: number, m = 0, d = 23) => new Date(2026, 9, d, h, m).getTime();
const URL = 'https://igor.github.io/lager/';
const TZ = 'Europe/Moscow';
const opts = (morning: number | null = 8 * 60): IcsOptions => ({ morning, morningDays: 'all', url: URL });

function entry(s: ReturnType<typeof newState>, key: string, o = opts()) {
  const e = calendarEntries(s, o).find((x) => x.key.startsWith(key));
  if (!e) throw new Error(`нет события ${key}`);
  return toGoogle(e, TZ);
}

describe('события Лагеря в Google', () => {
  it('id события постоянный и из разрешённых Google букв', () => {
    const id = eventId('task-t1-zx9w');
    expect(id).toMatch(/^[a-v0-9]{5,1024}$/);
    expect(eventId('task-t1-zx9w')).toBe(id);
    expect(eventId('task-t2-zx9w')).not.toBe(id);
    expect(eventId('routine-ё')).toMatch(/^[a-v0-9]+$/);
  });

  it('задача со временем: начало и конец в поясе устройства, напоминание за 10 минут', () => {
    const s = newState(at(8));
    addTask(s, at(8), { title: 'Позвонить маме', questId: s.quests[0].id, day: s.day, at: '19:00', estimateMin: 15, cue: 'Когда приду домой' });
    const ev = entry(s, 'task-');
    expect(ev.start).toEqual({ dateTime: '2026-10-23T19:00:00', timeZone: TZ });
    expect(ev.end).toEqual({ dateTime: '2026-10-23T19:15:00', timeZone: TZ });
    expect(ev.summary).toBe('Позвонить маме');
    expect(ev.description).toBe(`Когда приду домой\nОткрыть Лагерь: ${URL}`);
    expect(ev.reminders).toEqual({ useDefault: false, overrides: [{ method: 'popup', minutes: 10 }] });
    expect(ev.recurrence).toBeUndefined();
  });

  it('дело поздно вечером кончается уже завтра', () => {
    const s = newState(at(8));
    addTask(s, at(8), { title: 'Ночное', questId: s.quests[0].id, day: s.day, at: '23:50', estimateMin: 30 });
    expect(entry(s, 'task-').end.dateTime).toBe('2026-10-24T00:20:00');
  });

  it('утренний костёр и повторяющаяся идут сериями', () => {
    const s = newState(at(8));
    addRoutine(s, at(8), { title: 'Планёрка', questId: s.quests[0].id, level: 1, estimateMin: 30, at: '10:00', repeat: { every: 'week', weekday: 1 } });
    const morning = entry(s, 'morning');
    expect(morning.summary).toBe('Разжечь костёр');
    expect(morning.start.dateTime).toBe('2026-10-23T08:00:00');
    expect(morning.recurrence).toEqual(['RRULE:FREQ=DAILY']);
    expect(morning.reminders.overrides[0].minutes).toBe(0);
    const r = entry(s, 'routine-');
    expect(r.start.dateTime).toBe('2026-10-26T10:00:00');
    expect(r.recurrence).toEqual(['RRULE:FREQ=WEEKLY;BYDAY=MO']);
  });

  it('событие на весь день, пропущенный день серии и конец серии', () => {
    const s = newState(at(8));
    addMeeting(s, at(8), { title: 'День рождения', day: '2026-10-31', repeat: 'year' });
    const yoga = addMeeting(s, at(8), { title: 'Йога', day: '2026-10-23', at: '18:00', until: '19:30', repeat: 'week', repeatUntil: '2026-12-31', place: 'Зал' });
    skipMeetingDay(s, yoga, '2026-10-30');
    const bd = entry(s, 'meeting-', opts(null));
    expect(bd.start).toEqual({ date: '2026-10-31' });
    expect(bd.end).toEqual({ date: '2026-11-01' });
    expect(bd.reminders.overrides[0].minutes).toBe(6 * 60);
    const ev = calendarEntries(s, opts(null))
      .filter((e) => e.title === 'Йога')
      .map((e) => toGoogle(e, TZ))[0];
    expect(ev.location).toBe('Зал');
    expect(ev.end.dateTime).toBe('2026-10-23T19:30:00');
    expect(ev.recurrence![0]).toMatch(/^RRULE:FREQ=WEEKLY;UNTIL=\d{8}T\d{6}Z$/);
    expect(ev.recurrence![1]).toBe(`EXDATE;TZID=${TZ}:20261030T180000`);
  });

  it('отпечаток меняется вместе с событием', () => {
    const s = newState(at(8));
    const id = addTask(s, at(8), { title: 'Отчёт', questId: s.quests[0].id, day: s.day, at: '11:00' });
    const a = entry(s, 'task-');
    updateTask(s, id, { at: '12:00' });
    const b = entry(s, 'task-');
    expect(b.id).toBe(a.id);
    expect(b.extendedProperties.private.lager).not.toBe(a.extendedProperties.private.lager);
  });
});

describe('сверка с Google', () => {
  const ev = (key: string, title = key): GEvent =>
    toGoogle({ key, day: '2026-10-23', start: 600, min: 30, title, note: '', alarm: 10 }, TZ);
  const had = (e: GEvent, status = 'confirmed') => ({ id: e.id, status, extendedProperties: { private: { lager: e.extendedProperties.private.lager } } });

  it('новое заводится, изменённое и удалённое раньше правится, лишнее уходит', () => {
    const same = ev('task-a');
    const changed = ev('task-b', 'Новое имя');
    const back = ev('task-c');
    const fresh = ev('task-d');
    const gone = ev('task-e');
    const plan = planSync(
      [same, changed, back, fresh],
      [had(same), had(ev('task-b', 'Старое имя')), had(back, 'cancelled'), had(gone), had(ev('task-f'), 'cancelled')],
    );
    expect(plan.insert.map((e) => e.id)).toEqual([fresh.id]);
    expect(plan.update.map((e) => e.id)).toEqual([changed.id, back.id]);
    expect(plan.remove).toEqual([gone.id]);
  });

  it('чужие события и дни серий, поправленные в самом Google, не трогаются', () => {
    const series = ev('routine-x');
    const plan = planSync([], [{ id: 'abc123', status: 'confirmed' }, { id: `${series.id}_20261026T070000Z`, status: 'confirmed', recurringEventId: series.id }]);
    expect(plan).toEqual({ insert: [], update: [], remove: [] });
  });
});

describe('вход в Google', () => {
  it('адрес входа просит только календари, созданные Лагерем', () => {
    const u = new globalThis.URL(authUrl('key.apps.googleusercontent.com', URL, 'st8'));
    expect(u.origin + u.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(u.searchParams.get('response_type')).toBe('token');
    expect(u.searchParams.get('scope')).toBe(GOOGLE_SCOPE);
    expect(u.searchParams.get('redirect_uri')).toBe(URL);
    expect(u.searchParams.get('state')).toBe('st8');
  });

  it('ответ Google в адресе', () => {
    expect(parseAuthHash('', 's')).toBeNull();
    expect(parseAuthHash('#/notes', 's')).toBeNull();
    expect(parseAuthHash(`#access_token=ya29.x&token_type=Bearer&expires_in=3599&state=s&scope=${encodeURIComponent(GOOGLE_SCOPE)}`, 's')).toEqual({ ok: true, token: 'ya29.x', expiresIn: 3599 });
    expect(parseAuthHash('#access_token=ya29.x&expires_in=3599&state=чужой', 's')).toEqual({ ok: false, reason: 'state' });
    expect(parseAuthHash('#access_token=ya29.x&expires_in=3599&state=s', null)).toEqual({ ok: false, reason: 'state' });
    expect(parseAuthHash('#error=access_denied&state=s', 's')).toEqual({ ok: false, reason: 'denied' });
    expect(parseAuthHash('#access_token=ya29.x&state=s&scope=email', 's')).toEqual({ ok: false, reason: 'scope' });
  });
});

/** Поддельный Google Calendar API: календари с событиями, удалённые события помнятся по id, как в настоящем. */
function fakeGoogle() {
  const cals = new Map<string, Map<string, Omit<GEvent, 'status'> & { status: string }>>();
  const net = { down: false, token: 'ya29.good', calls: [] as string[] };
  let n = 0;
  const json = (body: unknown, status = 200) => new Response(body === null ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  const fetchFn: Fetch = async (url, init) => {
    if (net.down) throw new TypeError('Failed to fetch');
    expect(url.startsWith(GOOGLE_API)).toBe(true);
    const method = init?.method ?? 'GET';
    const headers = (init?.headers ?? {}) as Record<string, string>;
    net.calls.push(`${method} ${url.slice(GOOGLE_API.length).split('?')[0]}`);
    if (headers.Authorization !== `Bearer ${net.token}`) return json({ error: { code: 401, message: 'Invalid Credentials' } }, 401);
    const path = decodeURIComponent(url.slice(GOOGLE_API.length).split('?')[0]);
    const body = init?.body ? (JSON.parse(init.body as string) as GEvent) : null;
    let m: RegExpExecArray | null;
    if (path === '/calendars' && method === 'POST') {
      const id = `cal${++n}@group.calendar.google.com`;
      cals.set(id, new Map());
      return json({ id, summary: (body as unknown as { summary: string }).summary });
    }
    if ((m = /^\/calendars\/([^/]+)$/.exec(path)) && method === 'DELETE') {
      return cals.delete(m[1]) ? json(null, 204) : json({ error: { code: 404 } }, 404);
    }
    if ((m = /^\/calendars\/([^/]+)\/events(?:\/([^/]+))?$/.exec(path))) {
      const cal = cals.get(m[1]);
      if (!cal) return json({ error: { code: 404, message: 'Not Found' } }, 404);
      const id = m[2];
      if (method === 'GET') return json({ items: [...cal.values()].map((e) => ({ id: e.id, status: e.status, extendedProperties: e.extendedProperties })) });
      if (method === 'POST') {
        if (cal.has(body!.id)) return json({ error: { code: 409, message: 'The requested identifier already exists.' } }, 409);
        cal.set(body!.id, { ...body!, status: 'confirmed' });
        return json(body);
      }
      if (method === 'PUT') {
        if (!cal.has(id!)) return json({ error: { code: 404 } }, 404);
        cal.set(id!, { ...body!, status: body!.status ?? 'confirmed' });
        return json(body);
      }
      if (method === 'DELETE') {
        const e = cal.get(id!);
        if (!e || e.status === 'cancelled') return json({ error: { code: 410, message: 'Resource has been deleted' } }, 410);
        e.status = 'cancelled';
        return json(null, 204);
      }
    }
    return json({ error: { code: 400 } }, 400);
  };
  /** Живые события календаря по названию. */
  const live = (cal: string) => [...(cals.get(cal)?.values() ?? [])].filter((e) => e.status !== 'cancelled').map((e) => e.summary).sort();
  return { cals, net, fetchFn, live };
}

type FakeGoogle = ReturnType<typeof fakeGoogle>;

/** Устройство: своя игра, свои часы, свой вход в Google. */
function device(g: FakeGoogle, now: { t: number }, raw: string | null = null) {
  const storage: Storage = { load: () => raw, save: (j) => { raw = j; } };
  let prefs: string | null = null;
  const p: Prefs = { load: () => prefs, save: (j) => (prefs = j) };
  const store = new Store(storage, () => now.t);
  const google = new GoogleCalendar(store, { options: () => opts(), prefs: p, fetchFn: g.fetchFn, buildClientId: 'key.apps.googleusercontent.com', timeZone: () => TZ });
  const login = () => {
    const state = new globalThis.URL(google.loginUrl(URL)).searchParams.get('state')!;
    return google.takeRedirect(`#access_token=${g.net.token}&token_type=Bearer&expires_in=3599&state=${state}&scope=${encodeURIComponent(GOOGLE_SCOPE)}`);
  };
  return { store, google, login, prefs: () => prefs, raw: () => raw };
}

describe('Google Календарь на устройстве', () => {
  it('после входа заводит календарь «Лагерь» и ставит туда дела, а сделанное и отпущенное убирает', async () => {
    const g = fakeGoogle();
    const now = { t: at(9) };
    const d = device(g, now);
    const q = d.store.state.quests[0].id;
    const call = d.store.act((s, t) => addTask(s, t, { title: 'Позвонить маме', questId: q, day: s.day, at: '19:00' }));
    const letGo = d.store.act((s, t) => addTask(s, t, { title: 'Отчёт', questId: q, day: s.day, at: '15:00' }));
    d.store.act((s, t) => addTask(s, t, { title: 'Без времени', questId: q, day: s.day }));

    expect(d.login()).toEqual({ ok: true, text: 'Google Календарь подключён' });
    expect(d.google.connected).toBe(true);
    await d.google.syncNow();
    const cal = d.store.state.googleCalendar!;
    expect(cal).toBe('cal1@group.calendar.google.com');
    expect(g.live(cal)).toEqual(['Позвонить маме', 'Отчёт', 'Разжечь костёр'].sort());
    expect(d.google.status).toMatchObject({ phase: 'ok', events: 3, error: null });

    d.store.act((s, t) => complete(s, t, call));
    d.store.act((s, t) => release(s, t, letGo));
    await d.google.syncNow();
    expect(g.live(cal)).toEqual(['Разжечь костёр']);

    // Ничего не поменялось: Google только читают.
    g.net.calls = [];
    await d.google.syncNow();
    expect(g.net.calls).toEqual([`GET /calendars/${encodeURIComponent(cal)}/events`]);
  });

  it('правка задачи меняет то же событие, а вернувшаяся задача встаёт на место удалённого', async () => {
    const g = fakeGoogle();
    const now = { t: at(9) };
    const d = device(g, now);
    d.login();
    const q = d.store.state.quests[0].id;
    const id = d.store.act((s, t) => addTask(s, t, { title: 'Отчёт', questId: q, day: s.day, at: '15:00' }));
    await d.google.syncNow();
    const cal = d.store.state.googleCalendar!;
    d.store.act((s) => updateTask(s, id, { at: '16:30', title: 'Отчёт за месяц' }));
    await d.google.syncNow();
    const events = [...g.cals.get(cal)!.values()].filter((e) => e.summary.startsWith('Отчёт'));
    expect(events).toHaveLength(1);
    expect(events[0].start.dateTime).toBe('2026-10-23T16:30:00');

    // Время убрали: событие уходит. Вернули: Google помнит удалённое, поэтому событие правится, а не заводится.
    d.store.act((s) => updateTask(s, id, { at: null }));
    await d.google.syncNow();
    expect(g.live(cal)).toEqual(['Разжечь костёр']);
    d.store.act((s) => updateTask(s, id, { at: '17:00' }));
    await d.google.syncNow();
    expect(g.live(cal)).toEqual(['Отчёт за месяц', 'Разжечь костёр']);
    expect(d.google.status.phase).toBe('ok');
  });

  it('вход кончился: календарь ждёт, а Лагерь просит войти снова', async () => {
    const g = fakeGoogle();
    const now = { t: at(9) };
    const d = device(g, now);
    d.login();
    await d.google.syncNow();
    now.t = at(10, 30);
    g.net.calls = [];
    d.store.act((s, t) => addTask(s, t, { title: 'Созвон', questId: s.quests[0].id, day: s.day, at: '18:00' }));
    d.google.changed();
    await d.google.syncNow();
    expect(g.net.calls).toEqual([]);
    expect(d.google.status.phase).toBe('expired');
    expect(d.google.waiting).toBe(true);

    d.login();
    await d.google.syncNow();
    expect(g.live(d.store.state.googleCalendar!)).toContain('Созвон');
    expect(d.google.waiting).toBe(false);
  });

  it('Google отозвал вход: тоже «войти снова»; без сети календарь ждёт связи', async () => {
    const g = fakeGoogle();
    const now = { t: at(9) };
    const d = device(g, now);
    d.login();
    await d.google.syncNow();
    g.net.token = 'ya29.other';
    await d.google.syncNow();
    expect(d.google.status.phase).toBe('expired');

    const g2 = fakeGoogle();
    const f = device(g2, now);
    f.login();
    g2.net.down = true;
    await f.google.syncNow();
    expect(f.google.status.phase).toBe('offline');
    g2.net.down = false;
    await f.google.syncNow();
    expect(f.google.status.phase).toBe('ok');
  });

  it('календарь удалили прямо в Google: Лагерь заводит новый', async () => {
    const g = fakeGoogle();
    const now = { t: at(9) };
    const d = device(g, now);
    d.login();
    await d.google.syncNow();
    const first = d.store.state.googleCalendar!;
    g.cals.delete(first);
    await d.google.syncNow();
    const second = d.store.state.googleCalendar!;
    expect(second).not.toBe(first);
    expect(g.live(second)).toEqual(['Разжечь костёр']);
  });

  it('два устройства пишут в один календарь, а лишний календарь второго устройства уходит', async () => {
    const g = fakeGoogle();
    const now = { t: at(9) };
    const phone = device(g, now);
    const pc = device(g, now);
    phone.login();
    pc.login();
    await phone.google.syncNow();
    await pc.google.syncNow();
    expect(g.cals.size).toBe(2);
    // Игра с телефона пришла на компьютер (через GitHub) и выбрала календарь телефона.
    pc.store.act((s) => {
      s.googleCalendar = phone.store.state.googleCalendar;
    });
    await pc.google.syncNow();
    expect([...g.cals.keys()]).toEqual([phone.store.state.googleCalendar]);
  });

  it('«Отключить и удалить календарь» убирает его из Google и из игры, токен забывается', async () => {
    const g = fakeGoogle();
    const now = { t: at(9) };
    const d = device(g, now);
    d.login();
    await d.google.syncNow();
    expect(await d.google.disconnect(true)).toBe(true);
    expect(g.cals.size).toBe(0);
    expect(d.store.state.googleCalendar).toBeUndefined();
    expect(d.google.connected).toBe(false);
    expect(d.prefs()).not.toContain(g.net.token);
    // В игре календаря тоже нет: в сохранение токен не попадал никогда.
    expect(d.raw()).not.toContain('ya29');
  });

  it('отменённый вход и чужой ответ в адресе не подключают Google', () => {
    const g = fakeGoogle();
    const d = device(g, { t: at(9) });
    const state = new globalThis.URL(d.google.loginUrl(URL)).searchParams.get('state')!;
    expect(d.google.takeRedirect(`#error=access_denied&state=${state}`)).toEqual({ ok: false, text: 'Google Календарь не подключён: вход отменили' });
    expect(d.google.takeRedirect('#access_token=ya29.evil&state=чужой')?.ok).toBe(false);
    expect(d.google.connected).toBe(false);
    expect(d.google.takeRedirect('')).toBeNull();
  });
});
