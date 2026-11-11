// Напоминания без сервера: файл календаря (iCalendar, RFC 5545) с будильниками. Телефонный
// календарь звонит сам, а Лагерь только один раз отдаёт ему события. Время «плавающее», без пояса:
// календарь ставит его в поясе телефона, как и показывает Лагерь.
import { ALL_DAY_REMIND_HOURS, EVENT_MIN, MEETING_MIN, MEETING_REMIND_MIN, REMIND_BEFORE_MIN, estimateOf } from './rules';
import { meetingsOf, nextMeetingDay } from './calendar';
import { nextRepeat, parseDay } from './time';
import type { DayKey, Meeting, Repeat, State, Task } from './types';

export interface IcsOptions {
  /** Утренний костёр, минуты от полуночи; null: без него. */
  morning: number | null;
  /** Утренний костёр только в рабочие дни из распорядка или каждый день. */
  morningDays: 'work' | 'all';
  /** Адрес Лагеря: ссылка в каждом событии открывает игру. */
  url: string;
}

const BYDAY = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

const pad = (n: number) => String(n).padStart(2, '0');

/** «2026-11-05» и 9:30 → «20261105T093000». */
function local(day: DayKey, min: number): string {
  return `${day.replace(/-/g, '')}T${pad(Math.floor(min / 60))}${pad(min % 60)}00`;
}

function utc(ms: number): string {
  return new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
}

function text(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

/** Строки длиннее 75 байт переносятся с пробелом в начале продолжения, буквы не разрываются. */
export function fold(line: string): string {
  const enc = new TextEncoder();
  const out: string[] = [];
  let cur = '';
  let len = 0;
  for (const ch of line) {
    const n = enc.encode(ch).length;
    if (len + n > (out.length ? 74 : 75)) {
      out.push(cur);
      cur = '';
      len = 0;
    }
    cur += ch;
    len += n;
  }
  out.push(cur);
  return out.join('\r\n ');
}

function minutesOf(at: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(at);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

function rrule(r: Repeat): string {
  if (r.every === 'day') return 'FREQ=DAILY';
  if (r.every === 'week') return `FREQ=WEEKLY;BYDAY=${BYDAY[r.weekday]}`;
  return `FREQ=WEEKLY;BYDAY=${[...r.days].sort().map((d) => BYDAY[d]).join(',')}`;
}

/** Правило повтора встречи. Даты 29–31 в коротком месяце встают на его последний день, как и в самом Лагере. */
function meetingRule(m: Meeting): string | undefined {
  if (!m.repeat) return undefined;
  const d = parseDay(m.day);
  const date = d.getDate();
  const days = date > 28 ? `BYMONTHDAY=${Array.from({ length: date - 27 }, (_, i) => 28 + i).join(',')};BYSETPOS=-1` : `BYMONTHDAY=${date}`;
  const rule = {
    day: 'FREQ=DAILY',
    workday: 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR',
    week: 'FREQ=WEEKLY',
    week2: 'FREQ=WEEKLY;INTERVAL=2',
    month: `FREQ=MONTHLY;${days}`,
    year: `FREQ=YEARLY;BYMONTH=${d.getMonth() + 1};${days}`,
  }[m.repeat];
  if (!rule) return undefined;
  if (!m.repeatUntil) return rule;
  return `${rule};UNTIL=${m.repeatUntil.replace(/-/g, '')}${m.at ? 'T235959' : ''}`;
}

/** Одно событие календаря: из него собираются и файл, и события Google Календаря. */
export interface CalEntry {
  /** Постоянный ключ: «morning», «task-…», «routine-…», «meeting-…». По нему событие обновляется, а не задваивается. */
  key: string;
  /** Первый день. */
  day: DayKey;
  /** Начало в минутах от полуночи; null: событие на весь день. */
  start: number | null;
  /** Длина в минутах; у события на весь день не нужна. */
  min: number;
  title: string;
  note: string;
  place?: string;
  /** Правило повтора без «RRULE:», как в файле календаря. */
  rule?: string;
  /** Пропущенные дни серии. */
  except?: DayKey[];
  /** За сколько минут до начала напомнить. */
  alarm: number;
}

/** Что попадёт в календарь: утренний костёр, задачи со временем на сегодня и дальше, повторяющиеся со временем, встречи и серии, у которых с сегодняшнего дня ещё что-то будет. */
export function calendarEvents(s: State, o: IcsOptions): { morning: boolean; tasks: Task[]; routines: number; meetings: Meeting[] } {
  const meetings = meetingsOf(s).filter((m) => nextMeetingDay(m, s.day));
  const tasks = s.tasks.filter((t) => t.status === 'open' && t.at && t.day && t.day >= s.day && !t.routineId && minutesOf(t.at) !== null);
  const routines = s.routines.filter((r) => r.at && minutesOf(r.at) !== null && nextRepeat(r.repeat, s.day)).length;
  const morning = o.morning !== null && (o.morningDays === 'all' || s.settings.workDays.length > 0);
  return { morning, tasks, routines, meetings };
}

/** Все события календаря одним списком. */
export function calendarEntries(s: State, o: IcsOptions): CalEntry[] {
  const evs: CalEntry[] = [];
  const link = `Открыть Лагерь: ${o.url}`;
  const what = calendarEvents(s, o);
  if (o.morning !== null) {
    const rule: Repeat = o.morningDays === 'all' ? { every: 'day' } : { every: 'days', days: s.settings.workDays };
    const first = nextRepeat(rule, s.day);
    if (first) {
      evs.push({
        key: 'morning',
        day: first,
        start: o.morning,
        min: 15,
        title: 'Разжечь костёр',
        note: `Утро в Лагере: позови к огню первую задачу дня. Сбор отряда по желанию.\n${link}`,
        rule: rrule(rule),
        alarm: 0,
      });
    }
  }
  for (const t of what.tasks) {
    evs.push({
      key: `task-${t.id}`,
      day: t.day!,
      start: minutesOf(t.at!)!,
      min: estimateOf(t) ?? EVENT_MIN,
      title: t.title,
      note: t.cue ? `${t.cue}\n${link}` : link,
      alarm: REMIND_BEFORE_MIN,
    });
  }
  for (const r of s.routines) {
    const at = r.at ? minutesOf(r.at) : null;
    const first = at !== null ? nextRepeat(r.repeat, s.day) : null;
    if (at === null || !first) continue;
    evs.push({
      key: `routine-${r.id}`,
      day: first,
      start: at,
      min: r.estimateMin ?? EVENT_MIN,
      title: r.title,
      note: r.cue ? `${r.cue}\n${link}` : link,
      rule: rrule(r.repeat),
      alarm: REMIND_BEFORE_MIN,
    });
  }
  for (const m of what.meetings) {
    const at = m.at ? minutesOf(m.at) : null;
    const end = m.until ? minutesOf(m.until) : null;
    const first = nextMeetingDay(m, s.day)!;
    evs.push({
      key: `meeting-${m.id}`,
      day: first,
      start: at,
      min: at !== null && end !== null && end > at ? end - at : MEETING_MIN,
      title: m.title,
      note: link,
      place: m.place,
      rule: meetingRule(m),
      except: m.skip?.filter((d) => d > first),
      alarm: at === null ? ALL_DAY_REMIND_HOURS * 60 : MEETING_REMIND_MIN,
    });
  }
  return evs;
}

export function buildIcs(s: State, now: number, o: IcsOptions): string {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Taskcraft//Lager//RU', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:Лагерь'];
  const stamp = utc(now);
  for (const e of calendarEntries(s, o)) {
    const allDay = e.start === null;
    const stampOf = (day: DayKey) => (e.start === null ? day.replace(/-/g, '') : local(day, e.start));
    lines.push(
      'BEGIN:VEVENT',
      `UID:${e.key}@${s.gameId}.lager`,
      `DTSTAMP:${stamp}`,
      `SEQUENCE:${Math.floor(now / 1000)}`,
      ...(allDay ? [`DTSTART;VALUE=DATE:${stampOf(e.day)}`, 'DURATION:P1D'] : [`DTSTART:${stampOf(e.day)}`, `DURATION:PT${Math.max(5, Math.round(e.min))}M`]),
      ...(e.rule ? [`RRULE:${e.rule}`] : []),
      ...(e.except ?? []).map((x) => (allDay ? `EXDATE;VALUE=DATE:${stampOf(x)}` : `EXDATE:${stampOf(x)}`)),
      `SUMMARY:${text(e.title)}`,
      `DESCRIPTION:${text(e.note)}`,
      ...(e.place ? [`LOCATION:${text(e.place)}`] : []),
      `URL:${o.url}`,
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      `DESCRIPTION:${text(e.title)}`,
      `TRIGGER:-PT${e.alarm}M`,
      'END:VALARM',
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}
