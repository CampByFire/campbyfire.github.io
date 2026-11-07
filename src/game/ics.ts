// Напоминания без сервера: файл календаря (iCalendar, RFC 5545) с будильниками. Телефонный
// календарь звонит сам, а Лагерь только один раз отдаёт ему события. Время «плавающее», без пояса:
// календарь ставит его в поясе телефона, как и показывает Лагерь.
import { ALL_DAY_REMIND_HOURS, EVENT_MIN, MEETING_MIN, MEETING_REMIND_MIN, REMIND_BEFORE_MIN, estimateOf } from './rules';
import { meetingsOf } from './calendar';
import { nextRepeat } from './time';
import type { DayKey, Meeting, Repeat, Settings, State, Task } from './types';

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

function rrule(r: Repeat, st: Settings): string {
  if (r.every === 'day') return 'FREQ=DAILY';
  if (r.every === 'week') return `FREQ=WEEKLY;BYDAY=${BYDAY[r.weekday]}`;
  return `FREQ=WEEKLY;BYDAY=${[...st.workDays].sort().map((d) => BYDAY[d]).join(',')}`;
}

interface Ev {
  uid: string;
  /** Начало «20261105T093000» или, для события на весь день, «20261105». */
  start: string;
  /** Длина в минутах; у события на весь день не нужна. */
  min: number;
  allDay?: boolean;
  title: string;
  note: string;
  place?: string;
  rule?: string;
  /** За сколько минут до начала звонит будильник. */
  alarm: number;
}

/** Что попадёт в календарь: утренний костёр, задачи со временем на сегодня и дальше, повторяющиеся со временем, встречи с сегодняшней. */
export function calendarEvents(s: State, o: IcsOptions): { morning: boolean; tasks: Task[]; routines: number; meetings: Meeting[] } {
  const meetings = meetingsOf(s).filter((m) => m.day >= s.day);
  const tasks = s.tasks.filter((t) => t.status === 'open' && t.at && t.day && t.day >= s.day && !t.routineId && minutesOf(t.at) !== null);
  const routines = s.routines.filter((r) => r.at && minutesOf(r.at) !== null && nextRepeat(r.repeat, s.day, s.settings)).length;
  const morning = o.morning !== null && (o.morningDays === 'all' || s.settings.workDays.length > 0);
  return { morning, tasks, routines, meetings };
}

export function buildIcs(s: State, now: number, o: IcsOptions): string {
  const evs: Ev[] = [];
  const link = `Открыть Лагерь: ${o.url}`;
  if (o.morning !== null) {
    const rule: Repeat = o.morningDays === 'all' ? { every: 'day' } : { every: 'workday' };
    const first = nextRepeat(rule, s.day, s.settings);
    if (first) {
      evs.push({
        uid: `morning@${s.gameId}.lager`,
        start: local(first, o.morning),
        min: 15,
        title: 'Разжечь костёр',
        note: `Утро в Лагере: позови к огню первую задачу дня. Сбор отряда по желанию.\n${link}`,
        rule: rrule(rule, s.settings),
        alarm: 0,
      });
    }
  }
  for (const t of calendarEvents(s, o).tasks) {
    evs.push({
      uid: `task-${t.id}@${s.gameId}.lager`,
      start: local(t.day!, minutesOf(t.at!)!),
      min: estimateOf(t) ?? EVENT_MIN,
      title: t.title,
      note: t.cue ? `${t.cue}\n${link}` : link,
      alarm: REMIND_BEFORE_MIN,
    });
  }
  for (const r of s.routines) {
    const at = r.at ? minutesOf(r.at) : null;
    const first = at !== null ? nextRepeat(r.repeat, s.day, s.settings) : null;
    if (at === null || !first) continue;
    evs.push({
      uid: `routine-${r.id}@${s.gameId}.lager`,
      start: local(first, at),
      min: r.estimateMin ?? EVENT_MIN,
      title: r.title,
      note: r.cue ? `${r.cue}\n${link}` : link,
      rule: rrule(r.repeat, s.settings),
      alarm: REMIND_BEFORE_MIN,
    });
  }
  for (const m of calendarEvents(s, o).meetings) {
    const at = m.at ? minutesOf(m.at) : null;
    const end = m.until ? minutesOf(m.until) : null;
    evs.push({
      uid: `meeting-${m.id}@${s.gameId}.lager`,
      start: at === null ? m.day.replace(/-/g, '') : local(m.day, at),
      min: at !== null && end !== null && end > at ? end - at : MEETING_MIN,
      allDay: at === null,
      title: m.title,
      note: link,
      place: m.place,
      alarm: at === null ? ALL_DAY_REMIND_HOURS * 60 : MEETING_REMIND_MIN,
    });
  }
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Taskcraft//Lager//RU', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:Лагерь'];
  const stamp = utc(now);
  for (const e of evs) {
    lines.push(
      'BEGIN:VEVENT',
      `UID:${e.uid}`,
      `DTSTAMP:${stamp}`,
      `SEQUENCE:${Math.floor(now / 1000)}`,
      ...(e.allDay ? [`DTSTART;VALUE=DATE:${e.start}`, 'DURATION:P1D'] : [`DTSTART:${e.start}`, `DURATION:PT${Math.max(5, Math.round(e.min))}M`]),
      ...(e.rule ? [`RRULE:${e.rule}`] : []),
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
