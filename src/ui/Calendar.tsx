// Календарь: месяц сеткой и что стоит на выбранный день. Встречи живут только здесь,
// а задачи берутся из игры: на какой день позваны к костру, какой у них срок, когда придут повторы.
import { useLayoutEffect, useRef, useState } from 'preact/hooks';
import { agendaOf, dayCount, monthOf, monthWeeks, shiftMonth, type AgendaItem, type MonthKey } from '../game/calendar';
import { findQuest } from '../game/state';
import { addDays, formatClock, formatDate, parseDay } from '../game/time';
import type { DayKey, State } from '../game/types';
import { MONTH_NAME, MONTH_OF, W, WEEKDAY_NAME, agendaCount, dayTitle, repeatName } from '../game/words';
import type { Ui } from './App';
import { GIcon, LIcon } from './Icon';
import { QuestDot } from './parts';

/** Какой день был выбран: вернувшись в календарь, игрок видит тот же. Сбрасывается на сегодня с новым днём. */
let picked: { day: DayKey; on: DayKey } | null = null;

/** Открыть календарь сразу на нужном дне, например на завтра. */
export function openCalendar(ui: Ui, day: DayKey): void {
  picked = { day, on: ui.store.state.day };
  ui.go('calendar');
}

const WEEK_HEAD = [1, 2, 3, 4, 5, 6, 0];
const SHORT = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];

const monthName = (m: MonthKey, today: DayKey) => {
  const [y, mm] = m.split('-').map(Number);
  return `${MONTH_NAME[mm - 1]}${y === parseDay(today).getFullYear() ? '' : ` ${y}`}`;
};

/** «Завтра 1 встреча и 2 задачи, с 9:00» или «На завтра ничего не запланировано». */
export function tomorrowNews(s: State): string {
  const items = agendaOf(s, addDays(s.day, 1));
  const c = countOf(items);
  if (!c.meetings && !c.tasks) return 'На завтра ничего не запланировано';
  const first = items.find((x) => x.at && !(x.kind === 'task' && x.done));
  return `Завтра ${agendaCount(c.meetings, c.tasks)}${first ? `, с ${first.at!.replace(/^0/, '')}` : ''}`;
}

function countOf(items: AgendaItem[]): { meetings: number; tasks: number } {
  let meetings = 0;
  let tasks = 0;
  for (const x of items) {
    if (x.kind === 'meeting') meetings += 1;
    else if (!(x.kind === 'task' && x.done)) tasks += 1;
  }
  return { meetings, tasks };
}

export function CalendarScreen({ ui }: { ui: Ui }) {
  const s = ui.store.state;
  const start = picked && picked.on === s.day ? picked.day : s.day;
  const [day, setDayState] = useState<DayKey>(start);
  const [month, setMonth] = useState<MonthKey>(monthOf(start));
  const setDay = (d: DayKey) => {
    picked = { day: d, on: s.day };
    setDayState(d);
    setMonth(monthOf(d));
  };
  const tomorrow = addDays(s.day, 1);
  return (
    <div class="page">
      <div class="page-top">
        <span class="page-date">
          <LIcon name="calendar" size={15} class="ic-gold" />
          {formatDate(s.day)} · {formatClock(ui.now)}
        </span>
        <button class="link-btn" onClick={() => ui.go('camp')}>
          В лагерь
          <LIcon name="chevron" size={16} />
        </button>
      </div>
      <h1 class="page-title">{W.calendar}</h1>
      <p class="page-sub">{tomorrowNews(s)}.</p>

      <div class="cal-jump">
        <button class={`chipbtn${day === s.day ? ' is-on' : ''}`} aria-pressed={day === s.day} onClick={() => setDay(s.day)}>
          Сегодня
        </button>
        <button class={`chipbtn${day === tomorrow ? ' is-on' : ''}`} aria-pressed={day === tomorrow} onClick={() => setDay(tomorrow)}>
          Завтра
        </button>
      </div>

      <div class="period-nav">
        <button class="icon-btn" aria-label={`Раньше: ${monthName(shiftMonth(month, -1), s.day)}`} onClick={() => setMonth(shiftMonth(month, -1))}>
          <LIcon name="back" size={18} />
        </button>
        <div class="period-title" aria-live="polite">
          <h2 id="cal-month">{monthName(month, s.day)}</h2>
        </div>
        <button class="icon-btn" aria-label={`Позже: ${monthName(shiftMonth(month, 1), s.day)}`} onClick={() => setMonth(shiftMonth(month, 1))}>
          <LIcon name="chevron" size={18} />
        </button>
      </div>

      <MonthGrid s={s} month={month} day={day} onPick={setDay} />

      <DayAgenda ui={ui} day={day} />
    </div>
  );
}

/**
 * Месяц сеткой. Дни это кнопки: Tab попадает на выбранный день, стрелки ходят по дням и неделям,
 * Home и End к началу и концу недели. Диктор слышит дату и сколько на ней встреч и задач.
 */
function MonthGrid({ s, month, day, onPick }: { s: State; month: MonthKey; day: DayKey; onPick: (d: DayKey) => void }) {
  const weeks = monthWeeks(month);
  const focusable = monthOf(day) === month ? day : `${month}-01`;
  // День, на который ушли стрелкой: фокус встаёт на него, как только сетка перерисована (и в другом месяце тоже).
  const moveTo = useRef<DayKey | null>(null);
  useLayoutEffect(() => {
    if (!moveTo.current) return;
    (document.querySelector(`[data-day="${moveTo.current}"]`) as HTMLElement | null)?.focus();
    moveTo.current = null;
  });
  const onKey = (e: KeyboardEvent, d: DayKey) => {
    const wd = (parseDay(d).getDay() + 6) % 7;
    const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7, Home: -wd, End: 6 - wd }[e.key];
    if (step === undefined) return;
    e.preventDefault();
    const next = addDays(d, step);
    moveTo.current = next;
    onPick(next);
  };
  return (
    <table class="cal-grid" aria-labelledby="cal-month">
      <thead>
        <tr>
          {WEEK_HEAD.map((wd) => (
            <th key={wd} scope="col" abbr={WEEKDAY_NAME[wd]}>
              {SHORT[wd]}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {weeks.map((week) => (
          <tr key={week[0]}>
            {week.map((d) => {
              const out = monthOf(d) !== month;
              const c = dayCount(s, d);
              const date = parseDay(d);
              const what = agendaCount(c.meetings, c.tasks);
              const label = `${date.getDate()} ${MONTH_OF[date.getMonth()]}, ${WEEKDAY_NAME[date.getDay()]}${d === s.day ? ', сегодня' : ''}: ${what || 'ничего'}`;
              const cls = ['cal-day', out && 'is-out', d === s.day && 'is-today', d === day && 'is-on', d < s.day && 'is-past'].filter(Boolean).join(' ');
              return (
                <td key={d}>
                  <button
                    class={cls}
                    data-day={d}
                    aria-label={label}
                    aria-pressed={d === day}
                    aria-current={d === s.day ? 'date' : undefined}
                    tabIndex={d === focusable ? 0 : -1}
                    onClick={() => onPick(d)}
                    onKeyDown={(e) => onKey(e, d)}
                  >
                    <span class="cal-num" aria-hidden="true">
                      {date.getDate()}
                    </span>
                    <span class="cal-marks" aria-hidden="true">
                      {c.meetings > 0 && <span class="cal-mark cal-mark-meet" />}
                      {c.tasks > 0 && <span class="cal-mark cal-mark-task" />}
                    </span>
                  </button>
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function DayAgenda({ ui, day }: { ui: Ui; day: DayKey }) {
  const s = ui.store.state;
  const items = agendaOf(s, day);
  const past = day < s.day;
  return (
    <section class="group cal-agenda">
      <div class="group-head">
        <h2 class="sc">{dayTitle(day, s.day)}</h2>
      </div>
      {items.length === 0 && <p class="note">{past ? 'В этот день ничего не было.' : 'Ничего не запланировано.'}</p>}
      {items.length > 0 && (
        <ul class="cal-list">
          {items.map((x) => (
            <li key={key(x)}>
              <AgendaRow ui={ui} s={s} x={x} />
            </li>
          ))}
        </ul>
      )}
      <div class="cal-add">
        <button class="btn btn-ghost" onClick={() => ui.open({ kind: 'meeting', day })}>
          <LIcon name="plus" size={16} />
          Встреча
        </button>
        {!past && (
          <button class="btn btn-ghost" onClick={() => ui.open({ kind: 'add', day })}>
            <LIcon name="plus" size={16} />
            Задача
          </button>
        )}
      </div>
      {!past && <p class="note">Задача на этот день сама придёт к костру утром. Встреча к костру не идёт и опыта не даёт: она просто стоит в календаре и в плане своего дня.</p>}
    </section>
  );
}

const key = (x: AgendaItem) => (x.kind === 'meeting' ? `m-${x.meeting.id}` : x.kind === 'routine' ? `r-${x.routine.id}` : `${x.kind}-${x.task.id}`);

/** Строка дня: время, название и что это такое. */
export function AgendaRow({ ui, s, x }: { ui: Ui; s: State; x: AgendaItem }) {
  const time = x.at ? x.at.replace(/^0/, '') : x.kind === 'meeting' ? 'весь день' : '';
  let title: string;
  let sub: string;
  let open: () => void;
  let dot: preact.ComponentChildren = null;
  if (x.kind === 'meeting') {
    const m = x.meeting;
    title = m.title;
    sub = ['встреча', m.until && `до ${m.until.replace(/^0/, '')}`, m.place].filter(Boolean).join(' · ');
    open = () => ui.open({ kind: 'meeting', meetingId: m.id });
    dot = <LIcon name="calendar" size={15} class="cal-ic-meet" />;
  } else if (x.kind === 'routine') {
    const r = x.routine;
    title = r.title;
    sub = `повторяется ${repeatName(r.repeat)}`;
    open = () => ui.open({ kind: 'routine', routineId: r.id });
    dot = <LIcon name="repeat" size={15} class="ic-gold" />;
  } else {
    const t = x.task;
    const q = findQuest(s, t.questId);
    title = t.title;
    sub = [x.kind === 'due' ? 'срок' : x.done ? 'сделано' : 'задача', q?.name].filter(Boolean).join(' · ');
    open = () => ui.open({ kind: 'task', taskId: t.id });
    dot = x.kind === 'task' && x.done ? <GIcon name="check" size={14} class="cal-ic-done" /> : <QuestDot q={q} />;
  }
  const done = x.kind === 'task' && x.done;
  return (
    <button class={`cal-row${done ? ' row-done' : ''}`} onClick={open}>
      <span class="cal-time">{time}</span>
      <span class="cal-dot">{dot}</span>
      <span class="cal-text">
        <span class="row-title">{title}</span>
        <span class="cal-sub">{sub}</span>
      </span>
    </button>
  );
}
