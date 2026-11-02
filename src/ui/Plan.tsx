// Сбор отряда: утренний план дня. Кого позвать к костру, кто лягушка, хватит ли сил.
import { MANA_DRAIN_PER_HOUR, MANA_MAX, PLAN_XP_PER_TASK, estimateOf, heroLevel } from '../game/rules';
import { useState } from 'preact/hooks';
import { PERIOD_KINDS, periodKind, periodOf, shiftPeriod, type PeriodKey, type PeriodKind } from '../game/period';
import { backlogOf, findQuest, inboxOf, isUndead, lightFire, nestedTasks, periodTasks, planOf, planTask, swapInPlan, tailsOf, waitingOf } from '../game/state';
import { formatClock, formatDate, formatDuration, isMainFor, plural, shiftAt } from '../game/time';
import type { State, Task } from '../game/types';
import { PERIOD_KIND_NAME, W, periodName, periodShort, repeatName, weekRange } from '../game/words';
import type { Ui } from './App';
import { GIcon, LIcon } from './Icon';
import { ascend } from './magic/spells';
import { QuestDot, TaskMeta } from './parts';

type View = 'day' | PeriodKind;

/** Какая вкладка была открыта: возвращаясь в сбор отряда, игрок видит ту же. */
let lastView: View = 'day';

export function Plan({ ui }: { ui: Ui }) {
  const s = ui.store.state;
  const [view, setView] = useState<View>(lastView);
  const pick = (v: View) => {
    lastView = v;
    setView(v);
  };
  const mana = Math.round(s.hero.mana);
  const canMin = Math.round((s.hero.mana / MANA_DRAIN_PER_HOUR) * 60);
  return (
    <div class="page">
      <div class="page-top">
        <span class="page-date">
          <GIcon name="sunrise" size={15} class="ic-sun" />
          {formatDate(s.day)} · {formatClock(ui.now)}
        </span>
        <button class="link-btn" onClick={() => ui.go('camp')}>
          В лагерь
          <LIcon name="chevron" size={16} />
        </button>
      </div>
      <h1 class="page-title">{W.plan}</h1>
      <div class="page-sub">
        {mana >= 95 ? 'Долгий отдых позади, силы полны' : `Сил осталось на ~${formatDuration(canMin)}`}
        <span class="chip chip-mana chip-inline">
          <span class="mana-gem" aria-hidden="true" />
          <span aria-hidden="true">{mana}</span>
          <span class="sr-only">{`${W.mana}: ${mana} из ${MANA_MAX}`}</span>
        </span>
      </div>
      <ViewTabs value={view} onChange={pick} />
      {view === 'day' ? <DayPlan ui={ui} /> : <PeriodPlan key={view} ui={ui} kind={view} />}
    </div>
  );
}

const VIEWS: { value: View; label: string }[] = [{ value: 'day', label: 'День' }, ...PERIOD_KINDS.map((k) => ({ value: k as View, label: PERIOD_KIND_NAME[k] }))];

/** Вкладки сбора отряда: день и горизонты. Как у радиокнопок: Tab на выбранную, стрелки на соседнюю. */
function ViewTabs({ value, onChange }: { value: View; onChange: (v: View) => void }) {
  const at = VIEWS.findIndex((v) => v.value === value);
  const onKey = (e: KeyboardEvent) => {
    const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const i = (at + step + VIEWS.length) % VIEWS.length;
    onChange(VIEWS[i].value);
    const group = (e.currentTarget as HTMLElement).parentElement;
    requestAnimationFrame(() => (group?.children[i] as HTMLElement | undefined)?.focus());
  };
  return (
    <div class="seg" role="radiogroup" aria-label="Что собирать">
      {VIEWS.map((v, i) => (
        <button
          key={v.value}
          type="button"
          role="radio"
          aria-checked={i === at}
          tabIndex={i === at ? 0 : -1}
          class={`seg-btn${i === at ? ' is-on' : ''}`}
          onClick={() => onChange(v.value)}
          onKeyDown={onKey}
        >
          {v.label}
        </button>
      ))}
    </div>
  );
}

/** План на сегодня: кто к костру, лягушка, нежить, отряд, повторяющиеся. */
function DayPlan({ ui }: { ui: Ui }) {
  const { store, now } = ui;
  const s = store.state;
  const plan = planOf(s);
  const open = plan.filter((t) => t.status === 'open');
  const done = plan.length - open.length;
  const shift = shiftAt(now, s.settings);
  const isWorkday = shift === 'morning' || shift === 'work';
  const kindOf = (t: Task) => findQuest(s, t.questId)?.kind ?? 'any';
  const dayTasks = isWorkday ? open.filter((t) => isMainFor(kindOf(t), 'work')) : open;
  const eveningTasks = isWorkday ? open.filter((t) => !isMainFor(kindOf(t), 'work')) : [];
  const backlog = backlogOf(s);
  const undead = backlog.filter((t) => isUndead(t, s.day));
  const rest = backlog.filter((t) => !isUndead(t, s.day));
  const letters = inboxOf(s).length;
  const frog = s.frogId ? plan.find((t) => t.id === s.frogId) : undefined;
  const lit = s.litDay === s.day;

  const planMin = open.reduce((m, t) => m + (estimateOf(t) ?? 0), 0);
  const canMin = Math.round((s.hero.mana / MANA_DRAIN_PER_HOUR) * 60);
  const tooMuch = planMin > canMin;

  const tails = tailsOf(s);

  return (
    <>
      {letters > 0 && (
        <button class="banner" onClick={() => ui.open({ kind: 'letters' })}>
          <LIcon name="envelope" size={16} />
          Вестник принёс {letters} {plural(letters, 'письмо', 'письма', 'писем')}: разобрать
          <LIcon name="chevron" size={16} />
        </button>
      )}

      {tails.length > 0 && (
        <button class="banner banner-tails" onClick={() => ui.open({ kind: 'tails' })}>
          <LIcon name="calendar" size={16} />
          {tailsNews(s, tails)}: разобрать
          <LIcon name="chevron" size={16} />
        </button>
      )}

      <button class="frog-card" onClick={() => ui.open({ kind: 'frog' })}>
        <GIcon name="frog" size={28} class="ic-green" />
        <span class="frog-body">
          <span class="sc">{W.frogTitle}</span>
          {frog ? (
            <>
              <span class="frog-title">{frog.title}</span>
              <span class="frog-sub">Опыт ×2. Лучше браться за неё первой</span>
            </>
          ) : (
            <span class="frog-sub">Выбери самую тяжёлую задачу дня: опыт за неё удвоится</span>
          )}
        </span>
        <span class="link-btn">{frog ? 'сменить' : 'выбрать'}</span>
      </button>

      <section class="group">
        <div class="group-head">
          <h2 class="sc">К костру сегодня</h2>
          <span class="group-meta">
            {open.length} {plural(open.length, 'задача', 'задачи', 'задач')}
            {planMin > 0 && ` · ~${formatDuration(planMin)}`}
          </span>
        </div>
        {open.length > 0 && (
          <div class={`capacity${tooMuch ? ' is-over' : ''}`}>
            <span class="bar" aria-hidden="true">
              <span style={{ width: `${Math.min(100, (planMin / Math.max(canMin, 1)) * 100)}%` }} />
            </span>
            <span>
              План на ~{formatDuration(planMin)}, а сил хватит на ~{formatDuration(canMin)}
              {tooMuch && '. Многовато: кого-то стоит оставить на завтра'}
            </span>
          </div>
        )}
        {dayTasks.length === 0 && eveningTasks.length === 0 && <p class="note">Пока никого. Позови задачи из отряда ниже или добавь новую.</p>}
        {dayTasks.map((t, i) => (
          <PlanRow key={t.id} ui={ui} s={s} t={t} prev={dayTasks[i - 1]} next={dayTasks[i + 1]} />
        ))}
        {done > 0 && (
          <div class="done-line">
            <GIcon name="check" size={13} />
            сегодня уже сделано: {done}
          </div>
        )}
      </section>

      {eveningTasks.length > 0 && (
        <section class="group">
          <div class="group-head">
            <h2 class="sc">После заката</h2>
          </div>
          {eveningTasks.map((t, i) => (
            <PlanRow key={t.id} ui={ui} s={s} t={t} prev={eveningTasks[i - 1]} next={eveningTasks[i + 1]} />
          ))}
        </section>
      )}

      {undead.length > 0 && (
        <section class="group">
          <div class="group-head">
            <h2 class="sc">{W.undead}</h2>
            <span class="group-meta">просроченные задачи</span>
          </div>
          {undead.map((t) => (
            <AddRow key={t.id} ui={ui} s={s} t={t} />
          ))}
        </section>
      )}

      <section class="group">
        <div class="group-head">
          <h2 class="sc">Из отряда</h2>
          <button class="link-btn" aria-label="Новая задача" onClick={() => ui.open({ kind: 'add', day: null })}>
            <LIcon name="plus" size={15} />
            новая
          </button>
        </div>
        {rest.length === 0 && (
          <p class="note">
            {s.tasks.some((t) => t.status === 'open' || t.status === 'inbox') ? 'В отряде никого, кроме уже позванных.' : 'Отряд пуст. Добавь первую задачу: кнопка «+ новая» выше или большой «+» внизу.'}
          </p>
        )}
        {groupByQuest(s, rest).map(([qid, tasks]) => {
          const q = findQuest(s, qid);
          return (
            <div key={qid ?? 'none'} class="quest-group">
              <div class="quest-name">
                <QuestDot q={q} />
                {q?.name ?? 'Без похода'}
              </div>
              {tasks.map((t) => (
                <AddRow key={t.id} ui={ui} s={s} t={t} />
              ))}
            </div>
          );
        })}
      </section>

      {s.routines.length > 0 && (
        <section class="group">
          <div class="group-head">
            <h2 class="sc">Повторяются</h2>
            <span class="group-meta">приходят к костру сами</span>
          </div>
          {s.routines.map((r) => {
            const w = waitingOf(s, r.id);
            return (
              <button key={r.id} class="row" onClick={() => ui.open(w ? { kind: 'edit', taskId: w.id } : { kind: 'routine', routineId: r.id })}>
                <LIcon name="repeat" size={15} class="ic-gold" />
                <span class="row-title">{r.title}</span>
                <span class="meta">
                  {repeatName(r.repeat)}
                  {r.at && `, в ${r.at}`}
                </span>
              </button>
            );
          })}
        </section>
      )}

      <div class="page-foot">
        {lit ? (
          <button class="btn btn-ghost btn-wide" onClick={() => ui.go('camp')}>
            Вернуться в лагерь
          </button>
        ) : (
          <button
            class="btn btn-gold btn-wide"
            onClick={() => {
              const before = heroLevel(store.state.hero.xp).level;
              const xp = store.act((st, n) => lightFire(st, n));
              ui.toast(xp > 0 ? `Костёр горит: +${xp} опыта за план` : 'Костёр горит');
              ui.go('camp');
              const after = heroLevel(store.state.hero.xp).level;
              if (after > before) ascend(before, after);
            }}
          >
            <GIcon name="campfire" size={19} />
            {W.lightFire}
            {open.length > 0 && <small class="btn-cost">+{open.length * PLAN_XP_PER_TASK} опыта</small>}
          </button>
        )}
      </div>
    </>
  );
}

/** «С прошлой недели остались 2 задачи», «С прошлых периодов осталось 5 задач». */
function tailsNews(s: State, tails: Task[]): string {
  const kinds = new Set(tails.map((t) => periodKind(t.period!)));
  const n = tails.length;
  const left = `${plural(n, 'осталась', 'остались', 'осталось')} ${n} ${plural(n, 'задача', 'задачи', 'задач')}`;
  if (kinds.size === 1) {
    const kind = [...kinds][0]!;
    const prev = shiftPeriod(periodOf(kind, s.day), -1);
    if (tails.every((t) => t.period === prev)) {
      const from = { week: 'С прошлой недели', month: 'С прошлого месяца', quarter: 'С прошлого квартала', year: 'С прошлого года' }[kind];
      return `${from} ${left}`;
    }
  }
  return `С прошлых периодов ${left}`;
}

/**
 * Горизонт: задачи недели, месяца, квартала или года. Стрелками листаются соседние периоды.
 * Ниже свёрнуты задачи меньших периодов внутри этого, чтобы было видно, как большая цель
 * раскладывается на мелкие.
 */
function PeriodPlan({ ui, kind }: { ui: Ui; kind: PeriodKind }) {
  const s = ui.store.state;
  const now = periodOf(kind, s.day);
  const [key, setKey] = useState<PeriodKey>(now);
  const tasks = periodTasks(s, key);
  const open = tasks.filter((t) => t.status === 'open');
  const done = tasks.filter((t) => t.status === 'done');
  const nested = nestedTasks(s, key);
  const nestedOpen = nested.filter((t) => t.status === 'open').length;
  const name = periodName(key, s.day);
  const sub = kind === 'week' && !name.startsWith('Неделя') ? weekRange(key) : null;
  const total = tasks.length;
  return (
    <>
      <div class="period-nav">
        <button class="icon-btn" aria-label={`Раньше: ${periodName(shiftPeriod(key, -1), s.day)}`} onClick={() => setKey(shiftPeriod(key, -1))}>
          <LIcon name="back" size={18} />
        </button>
        <div class="period-title" aria-live="polite">
          <h2>{name}</h2>
          {sub && <span>{sub}</span>}
        </div>
        <button class="icon-btn" aria-label={`Позже: ${periodName(shiftPeriod(key, 1), s.day)}`} onClick={() => setKey(shiftPeriod(key, 1))}>
          <LIcon name="chevron" size={18} />
        </button>
      </div>
      {key !== now && (
        <button class="link-btn period-back" onClick={() => setKey(now)}>
          Вернуться: {periodName(now, s.day).toLowerCase()}
        </button>
      )}

      <section class="group">
        <div class="group-head">
          <h2 class="sc">Задачи</h2>
          <button class="link-btn" aria-label={`Новая задача: ${name.toLowerCase()}`} onClick={() => ui.open({ kind: 'add', day: null, period: key })}>
            <LIcon name="plus" size={15} />
            новая
          </button>
        </div>
        {total > 0 && (
          <div class="capacity period-progress">
            <span class="bar" aria-hidden="true">
              <span style={{ width: `${(done.length / total) * 100}%` }} />
            </span>
            <span>
              Сделано {done.length} из {total}
            </span>
          </div>
        )}
        {total === 0 && <p class="note">{emptyNote(kind, key < now)}</p>}
        {groupByQuest(s, open).map(([qid, list]) => {
          const q = findQuest(s, qid);
          return (
            <div key={qid ?? 'none'} class="quest-group">
              <div class="quest-name">
                <QuestDot q={q} />
                {q?.name ?? 'Без похода'}
              </div>
              {list.map((t) => (
                <AddRow key={t.id} ui={ui} s={s} t={t} inPeriod />
              ))}
            </div>
          );
        })}
        {done.length > 0 && (
          <details class="period-done">
            <summary>
              <GIcon name="check" size={13} />
              сделано: {done.length}
            </summary>
            {done.map((t) => (
              <button key={t.id} class="row row-done" onClick={() => ui.open({ kind: 'task', taskId: t.id })}>
                <span class="row-title">{t.title}</span>
              </button>
            ))}
          </details>
        )}
      </section>

      {nested.length > 0 && (
        <section class="group">
          <details class="period-nested">
            <summary>
              <span class="sc">{NESTED_TITLE[kind]}</span>
              <span class="group-meta">
                {nestedOpen} в отряде{nested.length > nestedOpen && `, ${nested.length - nestedOpen} сделано`}
              </span>
            </summary>
            {nested.map((t) => (
              <button key={t.id} class={`row${t.status === 'done' ? ' row-done' : ''}`} onClick={() => ui.open({ kind: 'task', taskId: t.id })}>
                <QuestDot q={findQuest(s, t.questId)} />
                <span class="row-title">{t.title}</span>
                <span class="meta">{periodShort(t.period!, s.day)}</span>
              </button>
            ))}
          </details>
        </section>
      )}
    </>
  );
}

const NESTED_TITLE: Record<PeriodKind, string> = {
  week: '',
  month: 'Недели месяца',
  quarter: 'Месяцы и недели',
  year: 'Внутри года',
};

function emptyNote(kind: PeriodKind, past: boolean): string {
  if (past) return 'В этом периоде задач не было.';
  const what = { week: 'на неделю', month: 'на месяц', quarter: 'на квартал', year: 'на год' }[kind];
  return `Задач ${what} пока нет. Добавь кнопкой «+ новая» или напиши фразой в новой задаче: «${what} …».`;
}

function groupByQuest(s: State, tasks: Task[]): [string | null, Task[]][] {
  const order = new Map(s.quests.map((q, i) => [q.id, i]));
  const groups = new Map<string | null, Task[]>();
  for (const t of tasks) {
    const k = t.questId && order.has(t.questId) ? t.questId : null;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(t);
  }
  return [...groups.entries()].sort((a, b) => (order.get(a[0] ?? '') ?? 99) - (order.get(b[0] ?? '') ?? 99));
}

/**
 * Строка плана уезжает выше, ниже или уходит из списка, и браузер теряет фокус.
 * Вернуть его на ту же кнопку, на другую кнопку строки или на соседнюю строку, чтобы с клавиатуры и с экранным диктором не начинать с начала страницы.
 */
function keepFocus(e: Event, act: () => void) {
  const btn = e.currentTarget as HTMLButtonElement;
  const row = btn.closest('.prow');
  const near = [row?.nextElementSibling, row?.previousElementSibling].map((r) => r?.querySelector<HTMLElement>('.prow-main') ?? null);
  const section = btn.closest('section');
  act();
  requestAnimationFrame(() => {
    if (document.activeElement && document.activeElement !== document.body) return;
    const same = btn.isConnected && !btn.disabled ? btn : null;
    const other = row?.isConnected ? row.querySelector<HTMLElement>('.icon-btn:not(:disabled)') : null;
    const inSection = section?.isConnected ? section.querySelector<HTMLElement>('.prow-main, .link-btn') : null;
    [same, other, ...near, inSection].find((el) => el?.isConnected)?.focus();
  });
}

function PlanRow({ ui, s, t, prev, next }: { ui: Ui; s: State; t: Task; prev?: Task; next?: Task }) {
  return (
    <div class="prow">
      <button class="prow-main" onClick={() => ui.open({ kind: 'task', taskId: t.id })}>
        {s.frogId === t.id ? <GIcon name="frog" size={16} class="ic-green" /> : <QuestDot q={findQuest(s, t.questId)} />}
        <span class="row-title">{t.title}</span>
        <TaskMeta s={s} t={t} estimate />
      </button>
      <button class="icon-btn" aria-label={`Выше: ${t.title}`} disabled={!prev} onClick={(e) => keepFocus(e, () => ui.store.act((st) => prev && swapInPlan(st, t.id, prev.id)))}>
        <LIcon name="up" size={16} />
      </button>
      <button class="icon-btn" aria-label={`Ниже: ${t.title}`} disabled={!next} onClick={(e) => keepFocus(e, () => ui.store.act((st) => next && swapInPlan(st, t.id, next.id)))}>
        <LIcon name="down" size={16} />
      </button>
      <button class="icon-btn" aria-label={`Не сегодня: ${t.title}`} onClick={(e) => keepFocus(e, () => ui.store.act((st) => planTask(st, t.id, null)))}>
        <LIcon name="close" size={16} />
      </button>
    </div>
  );
}

function AddRow({ ui, s, t, inPeriod = false }: { ui: Ui; s: State; t: Task; inPeriod?: boolean }) {
  const today = t.day === s.day;
  return (
    <div class="prow">
      <button class="prow-main" onClick={() => ui.open({ kind: 'task', taskId: t.id })}>
        <span class="row-title">{t.title}</span>
        <TaskMeta s={s} t={t} period={!inPeriod} />
      </button>
      {today ? (
        <span class="prow-today">
          <GIcon name="campfire" size={15} />
          сегодня
        </span>
      ) : (
      <button class="icon-btn icon-btn-gold" aria-label={`К костру сегодня: ${t.title}`} onClick={(e) => keepFocus(e, () => ui.store.act((st) => planTask(st, t.id, st.day)))}>
        <LIcon name="plus" size={18} stroke={2.4} />
      </button>
      )}
    </div>
  );
}
