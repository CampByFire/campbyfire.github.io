// Календарь: месяц сеткой и что стоит на выбранный день. События (Meeting) живут только здесь,
// а задачи берутся из игры: на какой день позваны к костру, какой у них срок, когда придут повторы.
import { useLayoutEffect, useRef, useState } from 'preact/hooks';
import { SLOT_MIN_SHOWN, agendaOf, clockOf, dropStart, moveMeeting, restoreMeetingTime, dayCount, meetingsOn, monthOf, monthWeeks, shiftMonth, timelineOf, type AgendaItem, type MonthKey, type Slot } from '../game/calendar';
import { colorName, isDark, meetingTint, questHex } from '../game/color';
import { findQuest, setRoutineAt, updateTask } from '../game/state';
import { DRAG_STEP_MIN } from '../game/rules';
import { addDays, formatClock, formatDate, minutesOfDay, parseDay } from '../game/time';
import type { DayKey, Meeting, State } from '../game/types';
import { MEETING_REPEAT_NAME, MONTH_NAME, MONTH_OF, W, WEEKDAY_NAME, agendaCount, dayTitle, repeatName } from '../game/words';
import type { Ui } from './App';
import { useTimelineDrag } from './drag';
import { GIcon, LIcon } from './Icon';
import { ColorDot, QuestDot } from './parts';

/** Какой день был выбран: вернувшись в календарь, игрок видит тот же. Сбрасывается на сегодня с новым днём. */
let picked: { day: DayKey; on: DayKey } | null = null;

/** Открыть в календаре день шкалой по часам, например завтрашний. Вернувшись к месяцу, игрок увидит этот день выбранным. */
export function openCalendar(ui: Ui, day: DayKey): void {
  picked = { day, on: ui.store.state.day };
  ui.openDay(day);
}

const WEEK_HEAD = [1, 2, 3, 4, 5, 6, 0];
const SHORT = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];

const monthName = (m: MonthKey, today: DayKey) => {
  const [y, mm] = m.split('-').map(Number);
  return `${MONTH_NAME[mm - 1]}${y === parseDay(today).getFullYear() ? '' : ` ${y}`}`;
};

/** «Завтра 1 событие и 2 задачи, с 9:00» или «На завтра ничего не запланировано». */
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
  if (ui.calDay) return <DayView key={ui.calDay} ui={ui} day={ui.calDay} />;
  return <MonthView ui={ui} />;
}

function MonthView({ ui }: { ui: Ui }) {
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
  /** Открыть день шкалой по часам; вернувшись к месяцу, он будет выбран. */
  const open = (d: DayKey) => {
    setDay(d);
    ui.openDay(d);
  };
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
        <button class="chipbtn" onClick={() => open(s.day)}>
          Сегодня
        </button>
        <button class="chipbtn" onClick={() => open(tomorrow)}>
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

      <MonthGrid s={s} month={month} day={day} onPick={setDay} onOpen={open} />

      <DayAgenda ui={ui} day={day} />
    </div>
  );
}

/**
 * Месяц сеткой. Дни это кнопки: Tab попадает на выбранный день, стрелки ходят по дням и неделям,
 * Home и End к началу и концу недели, нажатие открывает день шкалой по часам. Диктор слышит дату
 * и сколько на ней событий и задач.
 */
function MonthGrid({ s, month, day, onPick, onOpen }: { s: State; month: MonthKey; day: DayKey; onPick: (d: DayKey) => void; onOpen: (d: DayKey) => void }) {
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
                    onClick={() => onOpen(d)}
                    onKeyDown={(e) => onKey(e, d)}
                  >
                    <span class="cal-num" aria-hidden="true">
                      {date.getDate()}
                    </span>
                    <span class="cal-marks" aria-hidden="true">
                      {[...new Set(meetingsOn(s, d).map((m) => (m.color ? questHex(m.color) : '')))].slice(0, 3).map((hex) => (
                        <span key={hex} class={`cal-mark cal-mark-meet${hex && isDark(hex) ? ' cal-mark-dark' : ''}`} style={hex ? { background: hex } : undefined} />
                      ))}
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
        <button class="link-btn" onClick={() => ui.openDay(day)}>
          по часам
          <LIcon name="chevron" size={15} />
        </button>
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
      <AddButtons ui={ui} day={day} />
      {!past && <p class="note">Задача на этот день сама придёт к костру утром. Событие к костру не идёт и опыта не даёт: оно просто стоит в календаре и в плане своего дня.</p>}
    </section>
  );
}

/** «+ Событие» и «+ Задача» на этот день. Задачу в прошлое не добавить. */
function AddButtons({ ui, day, small = false }: { ui: Ui; day: DayKey; small?: boolean }) {
  const past = day < ui.store.state.day;
  const cls = `btn btn-ghost${small ? ' btn-sm' : ''}`;
  return (
    <div class="cal-add">
      <button class={cls} onClick={() => ui.open({ kind: 'meeting', day })}>
        <LIcon name="plus" size={16} />
        Событие
      </button>
      {!past && (
        <button class={cls} onClick={() => ui.open({ kind: 'add', day })}>
          <LIcon name="plus" size={16} />
          Задача
        </button>
      )}
    </div>
  );
}

/** Высота часа на шкале дня, в пикселях. */
const HOUR_PX = 56;
const HOURS = Array.from({ length: 24 }, (_, h) => h);
const hm = (min: number) => `${Math.floor(min / 60)}:${String(min % 60).padStart(2, '0')}`;

/**
 * День шкалой по часам, как в календаре телефона. Сверху то, что без времени («Весь день»),
 * ниже часы с делами. Нажатие на пустое место шкалы заводит событие на этот час. Стрелки
 * у заголовка и смахивание вбок листают дни. Дело на шкале можно перетащить на другое время
 * (с клавиатуры Alt со стрелкой), повторяющееся событие спросит, сдвинуть один день или всю серию.
 */
function DayView({ ui, day }: { ui: Ui; day: DayKey }) {
  const s = ui.store.state;
  const items = agendaOf(s, day);
  const allDay = items.filter((x) => !x.at);
  const slots = timelineOf(items);
  const c = countOf(items);
  const box = useRef<HTMLDivElement>(null);
  const isToday = day === s.day;
  const nowMin = minutesOfDay(ui.now);

  // Шкала сразу открывается там, где интересно: сегодня около «сейчас», в другой день у первого дела, иначе с утра.
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const from = isToday && nowMin < 24 * 60 ? nowMin - 60 : slots.length ? slots[0].start - 30 : 8 * 60;
    el.scrollTop = Math.max(0, (from / 60) * HOUR_PX);
  }, [day]);

  const go = (n: number) => ui.openDay(addDays(day, n));
  /** Дело перетащили (или сдвинули с клавиатуры) на новое время. */
  const moveTo = (slot: Slot, start: number) => {
    const x = slot.item;
    if (start === slot.start) return;
    const at = clockOf(start);
    const when = hm(start);
    if (x.kind === 'meeting') {
      const id = x.meeting.id;
      if (x.meeting.repeat) {
        ui.open({ kind: 'moveMeeting', meetingId: id, day: x.day, at });
        return;
      }
      const was = ui.store.act((st) => moveMeeting(st, id, at));
      if (was) ui.toast(`Событие перенесено на ${when}`, { label: 'Вернуть', run: () => ui.store.act((st) => restoreMeetingTime(st, id, was)) });
    } else if (x.kind === 'routine') {
      const id = x.routine.id;
      const was = ui.store.act((st) => setRoutineAt(st, id, at));
      if (was !== undefined) ui.toast(`Повтор теперь каждый раз в ${when}`, { label: 'Вернуть', run: () => ui.store.act((st) => setRoutineAt(st, id, was)) });
    } else {
      const id = x.task.id;
      const was = x.task.at ?? null;
      ui.store.act((st) => updateTask(st, id, { at }));
      ui.toast(`Задача перенесена на ${when}`, { label: 'Вернуть', run: () => ui.store.act((st) => updateTask(st, id, { at: was })) });
    }
  };
  const drag = useTimelineDrag(box, HOUR_PX, moveTo);
  const touch = useRef<{ x: number; y: number } | null>(null);
  const newAt = (e: MouseEvent) => {
    if ((e.target as HTMLElement).closest('.tl-ev') || drag.held) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const h = Math.min(23, Math.max(0, Math.floor((e.clientY - rect.top) / HOUR_PX)));
    ui.open({ kind: 'meeting', day, at: `${String(h).padStart(2, '0')}:00` });
  };
  const what = agendaCount(c.meetings, c.tasks);
  const rel = dayTitle(day, s.day).split(',')[0];
  return (
    <div class="page cal-dayview">
      <div class="page-top">
        <button class="link-btn" onClick={() => ui.openDay(null)}>
          <LIcon name="back" size={16} />
          {monthName(monthOf(day), s.day)}
        </button>
        <button class="link-btn" onClick={() => ui.go('camp')}>
          В лагерь
          <LIcon name="chevron" size={16} />
        </button>
      </div>
      <div class="period-nav tl-nav">
        <button class="icon-btn" aria-label={`Раньше: ${dayTitle(addDays(day, -1), s.day)}`} onClick={() => go(-1)}>
          <LIcon name="back" size={18} />
        </button>
        <div class="period-title">
          <h1 class="tl-title">{dayLong(day, s.day)}</h1>
          <span>
            {/^(Сегодня|Завтра|Вчера)$/.test(rel) ? `${rel} · ` : ''}
            {what || 'ничего не запланировано'}
          </span>
        </div>
        <button class="icon-btn" aria-label={`Позже: ${dayTitle(addDays(day, 1), s.day)}`} onClick={() => go(1)}>
          <LIcon name="chevron" size={18} />
        </button>
      </div>
      {!isToday && (
        <button class="link-btn period-back" onClick={() => ui.openDay(s.day)}>
          К сегодняшнему дню
        </button>
      )}
      <AddButtons ui={ui} day={day} small />

      {allDay.length > 0 && (
        <section class="tl-allday" aria-labelledby="tl-allday-h">
          <h2 class="sc" id="tl-allday-h">
            Весь день
          </h2>
          <ul class="cal-list">
            {allDay.map((x) => (
              <li key={key(x)}>
                <AgendaRow ui={ui} s={s} x={x} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <section
        class="tl-scroll"
        ref={box}
        tabIndex={0}
        aria-label="По часам"
        onTouchStart={(e) => {
          const t = e.touches[0];
          touch.current = { x: t.clientX, y: t.clientY };
        }}
        onTouchEnd={(e) => {
          const from = touch.current;
          touch.current = null;
          const t = e.changedTouches[0];
          if (!from || !t || drag.justDropped()) return;
          const dx = t.clientX - from.x;
          if (Math.abs(dx) > 70 && Math.abs(t.clientY - from.y) < 40) go(dx < 0 ? 1 : -1);
        }}
      >
        <p class="sr-only" id="tl-drag-hint">
          Чтобы поменять время, перетащи дело или нажми Alt со стрелкой вверх или вниз.
        </p>
        <div class={`tl${drag.held ? ' is-dragging' : ''}`} style={{ height: `${24 * HOUR_PX}px` }} onClick={newAt} onClickCapture={drag.onClickCapture}>
          {HOURS.map((h) => (
            <div key={h} class="tl-hour" style={{ top: `${h * HOUR_PX}px` }} aria-hidden="true">
              <span class="tl-label">{h ? `${h}:00` : ''}</span>
            </div>
          ))}
          {isToday && nowMin < 24 * 60 && <div class="tl-now" style={{ top: `${(nowMin / 60) * HOUR_PX}px` }} aria-hidden="true" />}
          {slots.length === 0 && <p class="tl-empty">Нажми на час, чтобы добавить событие</p>}
          <ul class="tl-evs">
            {slots.map((x) => {
              const held = drag.held && key(drag.held.slot.item) === key(x.item) ? drag.held : null;
              const start = held ? held.start : x.start;
              const shown = held ? { ...x, start, end: start + x.end - x.start } : x;
              return (
                <li
                  key={key(x.item)}
                  class={`tl-slot${held ? ' is-held' : ''}`}
                  style={{
                    top: `${(start / 60) * HOUR_PX}px`,
                    height: `${Math.max(((x.end - x.start) / 60) * HOUR_PX, (SLOT_MIN_SHOWN / 60) * HOUR_PX) - 2}px`,
                    left: `calc(var(--tl-gutter) + (100% - var(--tl-gutter)) * ${x.col / x.cols})`,
                    width: `calc((100% - var(--tl-gutter)) / ${x.cols} - 3px)`,
                  }}
                >
                  <TimelineEvent ui={ui} s={s} slot={shown} onPointerDown={movable(x.item) ? (e) => drag.onPointerDown(e, x) : undefined} onShift={(n) => moveTo(x, dropStart(x.start + n, x.end - x.start))} />
                </li>
              );
            })}
          </ul>
        </div>
      </section>
    </div>
  );
}

/** «Суббота, 8 ноября» без «Сегодня» и «Завтра»: они стоят строкой ниже. */
function dayLong(day: DayKey, today: DayKey): string {
  const t = dayTitle(day, today);
  return /^(Сегодня|Завтра|Вчера), /.test(t) ? t.replace(/^[^,]+, /, '').replace(/^./, (c) => c.toUpperCase()) : t;
}

/** Дело на шкале дня: название, часы и что это такое. Нажатие открывает его лист. */
/** Что можно перетащить: события, задачи плана и повторы. Сделанное остаётся там, где его сделали. */
const movable = (x: AgendaItem) => x.kind !== 'due' && !(x.kind === 'task' && x.done);

function TimelineEvent({ ui, s, slot, onPointerDown, onShift }: { ui: Ui; s: State; slot: Slot; onPointerDown?: (e: PointerEvent) => void; onShift: (min: number) => void }) {
  const x = slot.item;
  const range = `${hm(slot.start)}–${hm(slot.end)}`;
  let title: string;
  let kind: string;
  let cls = 'tl-ev';
  let open: () => void;
  let color: string | undefined;
  let tint: string | undefined;
  if (x.kind === 'meeting') {
    title = x.meeting.title;
    kind = ['событие', repeatOf(x.meeting), x.meeting.place].filter(Boolean).join(' · ');
    cls += ' tl-ev-meet';
    open = () => ui.open({ kind: 'meeting', meetingId: x.meeting.id, day: x.day });
    if (x.meeting.color) {
      color = questHex(x.meeting.color);
      tint = meetingTint(color);
      kind += `, цвет ${colorName(color)}`;
    }
  } else if (x.kind === 'routine') {
    title = x.routine.title;
    kind = 'повторяется';
    cls += ' tl-ev-routine';
    open = () => ui.open({ kind: 'routine', routineId: x.routine.id });
    color = questHex(findQuest(s, x.routine.questId)?.color);
  } else {
    title = x.task.title;
    kind = x.kind === 'task' && x.done ? 'сделано' : 'задача';
    if (x.kind === 'task' && x.done) cls += ' tl-ev-done';
    open = () => ui.open({ kind: 'task', taskId: x.task.id });
    color = questHex(findQuest(s, x.task.questId)?.color);
  }
  const short = slot.end - slot.start <= 30;
  return (
    <button class={`${cls}${short ? ' is-short' : ''}`} style={color ? { borderLeftColor: color, ...(tint ? { background: tint } : {}) } : undefined} aria-label={`${range}, ${title}, ${kind}`}
      aria-describedby={onPointerDown ? 'tl-drag-hint' : undefined}
      onClick={open}
      onPointerDown={onPointerDown}
      onKeyDown={(e) => {
        if (!onPointerDown || !e.altKey || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
        e.preventDefault();
        onShift(e.key === 'ArrowUp' ? -DRAG_STEP_MIN : DRAG_STEP_MIN);
      }}
    >
      <span class="tl-ev-title" aria-hidden="true">
        {title}
      </span>
      <span class="tl-ev-sub" aria-hidden="true">
        {range}
        {x.kind === 'meeting' && x.meeting.place ? ` · ${x.meeting.place}` : ''}
      </span>
    </button>
  );
}

const key = (x: AgendaItem) => (x.kind === 'meeting' ? `m-${x.meeting.id}` : x.kind === 'routine' ? `r-${x.routine.id}` : `${x.kind}-${x.task.id}`);

/** Повтор события словами для подписи строки: «каждую неделю». */
const repeatOf = (m: Meeting) => (m.repeat && MEETING_REPEAT_NAME[m.repeat]?.toLowerCase()) || null;

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
    sub = ['событие', repeatOf(m), m.until && `до ${m.until.replace(/^0/, '')}`, m.place].filter(Boolean).join(' · ');
    open = () => ui.open({ kind: 'meeting', meetingId: m.id, day: x.day });
    dot = m.color ? <ColorDot hex={questHex(m.color)} /> : <LIcon name="calendar" size={15} class="cal-ic-meet" />;
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
        {x.kind === 'meeting' && x.meeting.color && <span class="sr-only">, цвет {colorName(questHex(x.meeting.color))}</span>}
      </span>
    </button>
  );
}
