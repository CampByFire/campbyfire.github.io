// Листы поверх экрана: новая задача, карточка задачи, письма, поход, итоги дня.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import { PRESETS } from '../game/color';
import { PERIOD_KINDS, periodKind, periodOf, shiftPeriod, type PeriodKey, type PeriodKind } from '../game/period';
import { parsePhrase, type Parsed } from '../game/phrase';
import { ESTIMATE_BY_LEVEL, SWITCH_COST, estimateOf, levelForEstimate, undeadRank } from '../game/rules';
import {
  addQuest,
  addRoutine,
  addTask,
  daysOverdue,
  endDay,
  findQuest,
  findRoutine,
  findTask,
  inboxOf,
  isUndead,
  lairOf,
  planOf,
  planTask,
  release,
  removeQuest,
  setPeriod,
  spentNow,
  tailTargets,
  tailsOf,
  stopRoutine,
  unrelease,
  updateQuest,
  updateRoutine,
  updateTask,
  waitingOf,
  winQuest,
} from '../game/state';
import { addDays, formatDue, formatDuration, nextRepeat, parseDay } from '../game/time';
import type { DayKey, Level, QuestColor, QuestKind, Repeat, State, Task } from '../game/types';
import {
  CLASS_BY_LEVEL,
  CLASS_NAME,
  IN_WEEKDAY,
  LEVEL_HINT,
  LEVEL_ROMAN,
  PERIOD_KIND_NAME,
  QUEST_KIND_HINT,
  QUEST_KIND_NAME,
  UNDEAD_NAME,
  W,
  WEEKDAY_CHIPS,
  periodName,
  periodTo,
  repeatName,
} from '../game/words';
import type { Ui } from './App';
import { CallLabel, callToFire, finish } from './Camp';
import { GIcon, LIcon } from './Icon';
import { Chips, LevelMark, QuestDot, TaskMeta, questName } from './parts';
import { QuestColorPicker } from './QuestColorPicker';
import { AboutSheet, RulesSheet } from './Info';
import { WipeSheet } from './Chronicle';
import { SyncConflictSheet, SyncSheet } from './SyncPanel';
import { setSheetBack } from './back';

export type SheetState =
  | { kind: 'add'; questId?: string | null; day?: DayKey | null; period?: PeriodKey | null }
  | { kind: 'edit'; taskId: string }
  | { kind: 'routine'; routineId: string }
  | { kind: 'task'; taskId: string }
  | { kind: 'summary' }
  | { kind: 'letters' }
  | { kind: 'tails' }
  | { kind: 'quest'; questId: string }
  | { kind: 'newQuest' }
  | { kind: 'editQuest'; questId: string }
  | { kind: 'sync' }
  | { kind: 'syncConflict' }
  | { kind: 'rules' }
  | { kind: 'about' }
  | { kind: 'wipe' };

export function Sheets({ ui, sheet }: { ui: Ui; sheet: SheetState }) {
  switch (sheet.kind) {
    case 'add':
      return <TaskForm ui={ui} preset={sheet} />;
    case 'edit':
      return <TaskForm ui={ui} taskId={sheet.taskId} />;
    case 'routine':
      return <TaskForm ui={ui} routineId={sheet.routineId} />;
    case 'task':
      return <TaskSheet ui={ui} taskId={sheet.taskId} />;
    case 'summary':
      return <SummarySheet ui={ui} />;
    case 'letters':
      return <LettersSheet ui={ui} />;
    case 'tails':
      return <TailsSheet ui={ui} />;
    case 'quest':
      return <QuestSheet ui={ui} questId={sheet.questId} />;
    case 'newQuest':
      return <QuestForm ui={ui} />;
    case 'editQuest':
      return <QuestForm ui={ui} questId={sheet.questId} />;
    case 'sync':
      return <SyncSheet ui={ui} />;
    case 'syncConflict':
      return <SyncConflictSheet ui={ui} />;
    case 'rules':
      return <RulesSheet ui={ui} />;
    case 'about':
      return <AboutSheet ui={ui} />;
    case 'wipe':
      return <WipeSheet ui={ui} />;
  }
}

const FOCUSABLE = 'button, a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

/**
 * Лист поверх экрана. Фокус при открытии уходит в лист, если лист сам не поставил его в поле.
 * Экран под листом в это время недоступен (inert в App), поэтому Tab ходит только по листу,
 * а после закрытия App возвращает фокус туда, откуда лист открыли.
 */
export function Sheet(p: { title: string; onClose: () => void; children: preact.ComponentChildren; footer?: preact.ComponentChildren }) {
  const ref = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const [scrollOnly, setScrollOnly] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') p.onClose();
    };
    document.addEventListener('keydown', onKey);
    // «Назад» на телефоне закрывает лист так же, как Escape.
    const dropBack = setSheetBack(p.onClose);
    return () => {
      document.removeEventListener('keydown', onKey);
      dropBack();
    };
  }, [p.onClose]);
  useEffect(() => {
    if (!ref.current?.contains(document.activeElement)) ref.current?.focus();
  }, []);
  // Длинный текст без кнопок (правила) прокручивается только с клавиатуры, если до него можно дойти Tab.
  useLayoutEffect(() => {
    const el = body.current;
    if (el) setScrollOnly(el.scrollHeight > el.clientHeight && !el.querySelector(FOCUSABLE));
  });
  return (
    <div class="overlay" onClick={(e) => e.target === e.currentTarget && p.onClose()}>
      <div class="modal" role="dialog" aria-modal="true" aria-label={p.title} ref={ref} tabIndex={-1}>
        <div class="modal-head">
          <h2>{p.title}</h2>
          <button class="icon-btn" aria-label="Закрыть" onClick={p.onClose}>
            <LIcon name="close" size={20} />
          </button>
        </div>
        <div class="modal-body" ref={body} tabIndex={scrollOnly ? 0 : undefined}>
          {p.children}
        </div>
        {p.footer && <div class="modal-foot">{p.footer}</div>}
      </div>
    </div>
  );
}

// ---------- новая задача и правка ----------

const ESTIMATES: { value: number | null; label: string }[] = [
  { value: 15, label: '15 мин' },
  { value: 30, label: '30 мин' },
  { value: 60, label: '1 ч' },
  { value: 120, label: '2 ч' },
  { value: 240, label: '4 ч' },
  { value: 480, label: 'день' },
  { value: null, label: 'дни' },
];

/** Уровень по времени. «Дни» без оценки это IV уровень. */
function levelOfEstimate(min: number | null): Level {
  return min === null ? 4 : levelForEstimate(min);
}

type RepeatKind = 'none' | Repeat['every'];

const REPEATS: { value: RepeatKind; label: string }[] = [
  { value: 'none', label: 'Не повторять' },
  { value: 'day', label: 'Каждый день' },
  { value: 'workday', label: 'По рабочим дням' },
  { value: 'week', label: 'Раз в неделю' },
];

/**
 * Новая задача, правка задачи и правка повторяющейся задачи. У задачи, которую прислала
 * повторяющаяся, правка меняет и саму повторяющуюся. Повторяющаяся без ждущей задачи
 * правится отдельно (routineId): у неё нет дня и срока, а перестать повторять её можно кнопкой.
 */
function TaskForm({ ui, preset, taskId, routineId }: { ui: Ui; preset?: { questId?: string | null; day?: DayKey | null; period?: PeriodKey | null }; taskId?: string; routineId?: string }) {
  const s = ui.store.state;
  const editing = taskId ? findTask(s, taskId) : undefined;
  const routine = findRoutine(s, routineId ?? editing?.routineId);
  const from = editing ?? routine;
  const quests = s.quests.filter((q) => !q.wonAt || q.id === from?.questId);
  const [title, setTitle] = useState(from?.title ?? '');
  const [questId, setQuestId] = useState<string | null>(from ? from.questId : preset?.questId ?? null);
  const [estimate, setEstimate] = useState<number | null>(from ? estimateOf(from) : 30);
  // Уровень следует за временем. У старой задачи он остаётся прежним, пока не тронули время.
  const [lvl, setLvl] = useState<Level>(from?.level ?? levelForEstimate(30));
  const [day, setDay] = useState<DayKey | null>(editing ? editing.day : preset?.day !== undefined ? preset.day : s.day);
  const [due, setDue] = useState<DayKey | null>(editing?.due ?? null);
  const [at, setAt] = useState<string>(from?.at ?? '');
  const [period, setPeriodKey] = useState<PeriodKey | null>(editing ? editing.period ?? null : preset?.period ?? null);
  const [repeatKind, setRepeatKind] = useState<RepeatKind>(routine?.repeat.every ?? 'none');
  const [weekday, setWeekday] = useState<number>(routine?.repeat.every === 'week' ? routine.repeat.weekday : parseDay(s.day).getDay());
  // Что игрок выбрал руками: это сильнее слов во фразе.
  const [touched, setTouched] = useState<Partial<Record<Field, true>>>({});
  const touch = (f: Field) => setTouched((x) => (x[f] ? x : { ...x, [f]: true }));
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!from) input.current?.focus();
  }, []);

  // Фразу разбирает только новая задача: в правке название уже какое есть.
  const parsed = useMemo(() => (from ? null : parsePhrase(title, s.day, quests)), [title]);
  const v = effective(parsed, touched, { questId, estimate, lvl, day, due, at, period }, preset?.day !== undefined);

  const tomorrow = addDays(s.day, 1);
  const repeat: Repeat | null = repeatKind === 'none' ? null : repeatKind === 'week' ? { every: 'week', weekday } : { every: repeatKind };
  const willBeLetter = !repeat && !v.questId && !v.day && !v.period;
  const name = parsed ? parsed.title : title.trim();

  const save = (e?: Event) => {
    e?.preventDefault();
    if (!name) {
      input.current?.focus();
      return;
    }
    const fields = { title: name, questId: v.questId, level: v.lvl, estimateMin: v.estimate === ESTIMATE_BY_LEVEL[v.lvl] ? null : v.estimate, at: v.at || null };
    if (repeat) {
      const rid = ui.store.act((st, now) => {
        if (routine) {
          updateRoutine(st, routine.id, { ...fields, repeat });
          return routine.id;
        }
        if (editing) updateTask(st, editing.id, { ...fields, due: null });
        return addRoutine(st, now, { ...fields, repeat }, editing?.id);
      });
      if (!routine || JSON.stringify(routine.repeat) !== JSON.stringify(repeat)) ui.toast(routineNews(ui.store.state, rid, repeat));
      ui.close();
      return;
    }
    const patch = { ...fields, day: v.day, due: v.due, period: v.period };
    if (editing) {
      ui.store.act((st) => {
        if (routine) stopRoutine(st, routine.id);
        updateTask(st, editing.id, patch);
        if (patch.day !== editing.day) planTask(st, editing.id, patch.day);
      });
      if (routine) ui.toast('Задача больше не повторяется');
      ui.close();
      return;
    }
    ui.store.act((st, now) => addTask(st, now, patch));
    const where = v.period && !v.day ? ` · ${periodName(v.period, s.day).toLowerCase()}` : '';
    ui.toast(willBeLetter ? 'Письмо у вестника: разберёшь в сборе отряда' : `${CLASS_NAME[CLASS_BY_LEVEL[v.lvl]]} в отряде${where}`);
    ui.close();
  };

  const kind = v.period ? periodKind(v.period) : null;
  const pickKind = (k: PeriodKind | null) => {
    touch('period');
    setPeriodKey(k ? periodOf(k, s.day) : null);
    // Задаче с горизонтом день у костра не нужен: новая уходит в отряд, если день не выбирали руками.
    if (k && !from && !touched.day && preset?.day === undefined) setDay(null);
  };
  const estimates = ESTIMATES.some((o) => o.value === v.estimate) ? ESTIMATES : [...ESTIMATES, { value: v.estimate, label: v.estimate === null ? 'дни' : formatDuration(v.estimate) }];

  return (
    <Sheet
      title={editing ? 'Задача' : routine ? 'Повторяющаяся задача' : 'Новая задача'}
      onClose={ui.close}
      footer={
        <button class="btn btn-gold btn-wide" onClick={save}>
          {from ? 'Сохранить' : willBeLetter ? 'Отдать вестнику' : 'Взять в отряд'}
        </button>
      }
    >
      <form onSubmit={save}>
        <label class="field">
          <span class="field-label">Что сделать</span>
          <input
            ref={input}
            class="input"
            value={title}
            onInput={(e) => setTitle(e.currentTarget.value)}
            placeholder={from ? 'Например, сдать модуль React' : 'Например, завтра в 19:00 позвонить маме'}
            maxLength={200}
            enterKeyHint="done"
            aria-describedby={parsed ? 'phrase-hint' : undefined}
          />
        </label>
        {parsed && <PhraseHint s={s} parsed={parsed} raw={title} />}
      </form>
      <Chips
        label={W.quest}
        value={v.questId}
        options={[...quests.map((q) => ({ value: q.id as string | null, label: q.name })), { value: null, label: 'Без похода' }]}
        onChange={(x) => { touch('questId'); setQuestId(x); }}
      />
      <Chips
        label={`Сколько займёт: ${CLASS_NAME[CLASS_BY_LEVEL[v.lvl]].toLowerCase()}, ${LEVEL_ROMAN[v.lvl]} уровень`}
        sr={`Сколько займёт: ${CLASS_NAME[CLASS_BY_LEVEL[v.lvl]].toLowerCase()}, уровень ${v.lvl}`}
        value={v.estimate}
        options={estimates.map((o) => ({ ...o, mark: LEVEL_ROMAN[levelOfEstimate(o.value)] }))}
        onChange={(x) => { touch('estimate'); setEstimate(x); setLvl(levelOfEstimate(x)); }}
      />
      <Chips label="Повторять" value={repeatKind} options={routine && !editing ? REPEATS.slice(1) : REPEATS} onChange={setRepeatKind} />
      {repeatKind === 'week' && <Chips label="В какой день недели" value={weekday} options={WEEKDAY_CHIPS} onChange={setWeekday} />}
      {!repeat && (
        <Chips
          label="Горизонт"
          value={kind}
          options={[{ value: null as PeriodKind | null, label: 'Нет' }, ...PERIOD_KINDS.map((k) => ({ value: k as PeriodKind | null, label: PERIOD_KIND_NAME[k] }))]}
          onChange={pickKind}
        />
      )}
      {!repeat && kind && v.period && (
        <Chips
          label="Какой"
          value={v.period}
          options={periodChoices(kind, v.period, s.day).map((k) => ({ value: k, label: periodName(k, s.day) }))}
          onChange={(x) => { touch('period'); setPeriodKey(x); }}
        />
      )}
      {!repeat && (
        <Chips
          label="Когда к костру"
          value={v.day}
          options={[
            { value: s.day, label: 'Сегодня' },
            { value: tomorrow, label: 'Завтра' },
            { value: null, label: 'Потом' },
            ...(v.day && v.day !== s.day && v.day !== tomorrow ? [{ value: v.day, label: formatDue(v.day, s.day) }] : []),
          ]}
          onChange={(x) => { touch('day'); setDay(x); }}
        />
      )}
      <div class="field-row">
        {!repeat && (
          <label class="field">
            <span class="field-label">Срок</span>
            <input class="input" type="date" value={v.due ?? ''} onInput={(e) => { touch('due'); setDue(e.currentTarget.value || null); }} />
          </label>
        )}
        <label class="field">
          <span class="field-label">Во сколько</span>
          <input class="input" type="time" value={v.at} onInput={(e) => { touch('at'); setAt(e.currentTarget.value); }} />
        </label>
      </div>
      {repeat && <p class="note">В свои дни задача сама встаёт в план дня. Пока прошлая не сделана, новая не приходит. Логово похода повторяющиеся задачи не ранят: они не кончаются.</p>}
      {!repeat && v.period && !v.day && <p class="note">Задача ждёт в отряде и видна в сборе отряда на вкладке «{PERIOD_KIND_NAME[kind!]}». К костру её можно позвать в любой день периода.</p>}
      {willBeLetter && <p class="note">Без похода, без дня и без горизонта задача уходит письмом к вестнику. Разобрать письма можно в сборе отряда.</p>}
      {routine && !editing && (
        <div class="actions">
          <button
            class="act act-danger"
            onClick={() => {
              ui.store.act((st) => stopRoutine(st, routine.id));
              ui.toast('Задача больше не повторяется');
              ui.close();
            }}
          >
            <LIcon name="close" size={16} />
            Больше не повторять
          </button>
        </div>
      )}
    </Sheet>
  );
}

type Field = 'questId' | 'estimate' | 'day' | 'due' | 'at' | 'period';

interface FormValues {
  questId: string | null;
  estimate: number | null;
  lvl: Level;
  day: DayKey | null;
  due: DayKey | null;
  at: string;
  period: PeriodKey | null;
}

/**
 * Что в итоге стоит в форме: узнанное во фразе, если это поле не выбирали руками, иначе выбранное.
 * Срок или горизонт из фразы без дня уводят новую задачу из сегодняшнего плана в отряд.
 */
function effective(p: Parsed | null, touched: Partial<Record<Field, true>>, f: FormValues, dayPreset: boolean): FormValues {
  if (!p) return f;
  const use = <K extends Field>(k: K, got: FormValues[K] | undefined): FormValues[K] => (!touched[k] && got !== undefined ? got : f[k]);
  const estimate = use('estimate', p.estimate);
  const lvl = !touched.estimate && p.estimate !== undefined ? levelOfEstimate(estimate) : f.lvl;
  let day = use('day', p.day);
  if (!touched.day && p.day === undefined && !dayPreset && (p.due !== undefined || p.period !== undefined)) day = null;
  return { questId: use('questId', p.questId), estimate, lvl, day, due: use('due', p.due), at: use('at', p.at), period: use('period', p.period) };
}

/** Выбор периода: нынешний, следующий и тот, что уже выбран, если он другой. */
function periodChoices(kind: PeriodKind, chosen: PeriodKey, today: DayKey): PeriodKey[] {
  const now = periodOf(kind, today);
  const list = [now, shiftPeriod(now, 1)];
  if (kind !== 'year') list.push(shiftPeriod(now, 2));
  if (!list.includes(chosen)) list.push(chosen);
  return list;
}

const FOUND_NAME: Record<Parsed['found'][number]['kind'], string> = {
  day: 'к костру',
  due: 'срок',
  at: 'время',
  estimate: 'займёт',
  period: 'горизонт',
  quest: 'поход',
};

/** Под полем: что игра узнала во фразе и каким выйдет название. */
function PhraseHint({ s, parsed, raw }: { s: State; parsed: Parsed; raw: string }) {
  const changed = parsed.title !== raw.trim();
  if (!parsed.found.length && !changed) {
    return (
      <p class="field-hint" id="phrase-hint">
        Можно фразой: «завтра», «до пятницы», «на неделю», «в 19:00», «на 2 часа», «#работа». Название в кавычках берётся как есть.
      </p>
    );
  }
  const value = (k: Parsed['found'][number]['kind']): string => {
    if (k === 'day') return formatDue(parsed.day!, s.day);
    if (k === 'due') return formatDue(parsed.due!, s.day);
    if (k === 'at') return parsed.at!;
    if (k === 'estimate') return parsed.estimate === null || parsed.estimate === undefined ? 'дни' : formatDuration(parsed.estimate);
    if (k === 'period') return periodName(parsed.period!, s.day).toLowerCase();
    return findQuest(s, parsed.questId ?? null)?.name ?? '';
  };
  return (
    <div class="phrase" id="phrase-hint" aria-live="polite">
      {parsed.found.map((f) => (
        <span key={f.kind} class="phrase-tag">
          {FOUND_NAME[f.kind]}: <b>{value(f.kind)}</b>
        </span>
      ))}
      {changed && (
        <span class="phrase-title">
          Название: {parsed.title ? `«${parsed.title}»` : <em>напиши, что сделать</em>}
        </span>
      )}
    </div>
  );
}

/** Что сказать после сохранения повторяющейся задачи: когда она придёт. */
function routineNews(s: State, routineId: string, repeat: Repeat): string {
  const name = repeatName(repeat);
  if (waitingOf(s, routineId)?.day === s.day) return `Повторяется ${name}. Сегодня уже у костра`;
  const next = nextRepeat(repeat, addDays(s.day, 1), s.settings);
  if (!next) return `Повторяется ${name}, но в распорядке нет рабочих дней`;
  const when = next === addDays(s.day, 1) ? 'завтра' : IN_WEEKDAY[parseDay(next).getDay()];
  return repeat.every === 'week' ? `Придёт ${when}, а дальше каждую неделю` : `Повторяется ${name}. Придёт ${when}`;
}

// ---------- карточка задачи ----------

function TaskSheet({ ui, taskId }: { ui: Ui; taskId: string }) {
  const s = ui.store.state;
  const t = findTask(s, taskId);
  const [level, setLevel] = useState<Level | null>(null);
  if (!t) return null;
  const q = findQuest(s, t.questId);
  const cls = CLASS_BY_LEVEL[t.level];
  const undead = isUndead(t, s.day);
  const isCurrent = s.current?.taskId === t.id;
  const inToday = t.day === s.day;
  const est = estimateOf(t);
  const spent = spentNow(s, t, ui.now);
  const switchCost = s.lastQuestId !== null && t.questId !== s.lastQuestId && !isCurrent ? SWITCH_COST : 0;
  const done = t.status === 'done';
  const routine = findRoutine(s, t.routineId);

  const close = ui.close;
  return (
    <Sheet title={undead ? UNDEAD_NAME[undeadRank(daysOverdue(t, s.day))] : CLASS_NAME[cls]} onClose={close}>
      <div class="task-head">
        <div class="task-title">{t.title}</div>
        <div class="task-sub">
          <QuestDot q={q} />
          <span>
            {questName(s, t)} · <LevelMark level={t.level} /> · {est ? `~${formatDuration(est)}` : 'несколько дней'}
          </span>
        </div>
        <div class="task-facts">
          {spent > 0 && <span>Потрачено {formatDuration(Math.max(1, Math.round(spent / 60_000)))}</span>}
          {t.due && <span class={undead ? 'meta-undead' : ''}>Срок: {formatDue(t.due, s.day)}</span>}
          {t.at && <span>В {t.at}</span>}
          {t.period && <span>Горизонт: {periodName(t.period, s.day).toLowerCase()}</span>}
          {routine && (
            <span class="fact-repeat">
              <LIcon name="repeat" size={14} />
              Повторяется {repeatName(routine.repeat)}
            </span>
          )}
          {done && t.reward && <span>Сделано: +{t.reward.gold} золота, +{t.reward.xp} опыта</span>}
        </div>
      </div>

      {!done && t.status !== 'released' && (
        <>
          <div class="btns">
            {!isCurrent && (
              <button class="btn btn-gold" onClick={() => { close(); callToFire(ui, t); }}>
                <GIcon name="campfire" size={18} />
                {switchCost > 0 ? W.callToFireShort : <CallLabel />}
                {switchCost > 0 && <small class="btn-cost">−{switchCost} маны</small>}
              </button>
            )}
            <button class={`btn ${isCurrent ? 'btn-gold' : 'btn-ghost'}`} onClick={() => { close(); finish(ui, t, level ?? undefined); }}>
              <GIcon name="check" size={17} />
              {undead ? W.slay : W.done}
            </button>
          </div>
          <Chips
            label="Уровень при сдаче"
            value={level ?? t.level}
            options={([1, 2, 3, 4] as Level[]).map((l) => ({ value: l, label: LEVEL_ROMAN[l], sr: `уровень ${l},`, hint: LEVEL_HINT[l] }))}
            onChange={setLevel}
          />
          <div class="actions">
            {inToday ? (
              <button class="act" onClick={() => ui.store.act((st) => planTask(st, t.id, null))}>
                <LIcon name="close" size={16} />
                Убрать из плана дня
              </button>
            ) : (
              <button class="act" onClick={() => ui.store.act((st) => planTask(st, t.id, st.day))}>
                <GIcon name="campfire" size={16} />
                К костру сегодня
              </button>
            )}
            <button class="act" onClick={() => ui.store.act((st) => planTask(st, t.id, addDays(st.day, 1)))}>
              <LIcon name="calendar" size={16} />
              На завтра
            </button>
            {undead && (
              <button class="act" onClick={() => ui.store.act((st) => updateTask(st, t.id, { due: addDays(st.day, 1) }))}>
                <LIcon name="calendar" size={16} />
                Перенести срок на завтра
              </button>
            )}
            <button class="act" onClick={() => ui.open({ kind: 'edit', taskId: t.id })}>
              <LIcon name="edit" size={16} />
              Изменить
            </button>
            {routine && (
              <button
                class="act"
                onClick={() => {
                  ui.store.act((st) => stopRoutine(st, routine.id));
                  ui.toast('Больше не повторяется. Эта задача осталась в отряде');
                }}
              >
                <LIcon name="repeat" size={16} />
                Больше не повторять
              </button>
            )}
            <button
              class="act act-danger"
              onClick={() => {
                releaseWithUndo(ui, t.id, routine ? 'Спутник отпущен до следующего раза' : 'Спутник отпущен');
                close();
              }}
            >
              <LIcon name="trash" size={16} />
              {W.release}
            </button>
          </div>
        </>
      )}
    </Sheet>
  );
}

/** Отпустить задачу; несколько секунд её можно вернуть одной кнопкой, потом из Королевства. */
function releaseWithUndo(ui: Ui, id: string, text: string): void {
  ui.store.act((st, now) => release(st, now, id));
  ui.toast(text, { label: 'Вернуть', run: () => ui.store.act((st) => unrelease(st, id)) });
}

// ---------- хвосты ----------

/**
 * Хвосты: задачи недели, месяца, квартала или года, которые не успели в свой период. В нежить они
 * не встают (нежить только для сроков), а ждут, пока игрок решит: в нынешний период, в период
 * побольше или отпустить.
 */
function TailsSheet({ ui }: { ui: Ui }) {
  const s = ui.store.state;
  const tails = tailsOf(s);
  const moveAll = () =>
    ui.store.act((st) => {
      for (const t of tailsOf(st)) setPeriod(st, t.id, tailTargets(st, t).same);
    });
  return (
    <Sheet
      title="Хвосты"
      onClose={ui.close}
      footer={
        <button class={`btn btn-wide ${tails.length ? 'btn-ghost' : 'btn-gold'}`} onClick={ui.close}>
          {tails.length ? 'Разберу потом' : 'Готово'}
        </button>
      }
    >
      {tails.length === 0 ? (
        <p class="note">Хвостов нет. Всё разобрано.</p>
      ) : (
        <p class="note">Эти задачи не успели в свой период. Перенеси их в нынешний, в период побольше или отпусти.</p>
      )}
      {tails.map((t) => {
        const { same, bigger } = tailTargets(s, t);
        return (
          <div key={t.id} class="letter">
            <div class="letter-title">
              <LIcon name="calendar" size={16} />
              <span>
                {t.title}
                <small class="letter-sub">{periodName(t.period!, s.day)}</small>
              </span>
            </div>
            <div class="letter-btns">
              <button class="btn btn-gold btn-sm" aria-label={`${capital(periodTo(same, s.day))}: ${t.title}`} onClick={() => ui.store.act((st) => setPeriod(st, t.id, same))}>
                {capital(periodTo(same, s.day))}
              </button>
              {bigger && (
                <button class="btn btn-ghost btn-sm" aria-label={`${capital(periodTo(bigger, s.day))}: ${t.title}`} onClick={() => ui.store.act((st) => setPeriod(st, t.id, bigger))}>
                  {capital(periodTo(bigger, s.day))}
                </button>
              )}
              <button class="btn btn-ghost btn-sm" aria-label={`${W.release}: ${t.title}`} onClick={() => releaseWithUndo(ui, t.id, 'Задача отпущена')}>
                {W.release}
              </button>
            </div>
          </div>
        );
      })}
      {tails.length > 1 && (
        <div class="actions">
          <button class="act" onClick={moveAll}>
            <LIcon name="repeat" size={16} />
            Все в нынешние периоды
          </button>
        </div>
      )}
    </Sheet>
  );
}

const capital = (x: string) => x[0].toUpperCase() + x.slice(1);

// ---------- письма ----------

function LettersSheet({ ui }: { ui: Ui }) {
  const s = ui.store.state;
  const letters = inboxOf(s);
  const quests = s.quests.filter((q) => !q.wonAt);
  return (
    <Sheet title={`${W.inbox} у вестника`} onClose={ui.close}>
      {letters.length === 0 && <p class="note">Писем нет. Всё разобрано.</p>}
      {letters.map((t) => (
        <Letter key={t.id} ui={ui} t={t} quests={quests} />
      ))}
    </Sheet>
  );
}

function Letter({ ui, t, quests }: { ui: Ui; t: Task; quests: State['quests'] }) {
  const [questId, setQuestId] = useState<string | null>(quests[0]?.id ?? null);
  return (
    <div class="letter">
      <div class="letter-title">
        <LIcon name="envelope" size={16} />
        {t.title}
      </div>
      <div class="chips">
        {quests.map((q) => (
          <button key={q.id} class={`chipbtn${questId === q.id ? ' is-on' : ''}`} onClick={() => setQuestId(q.id)} aria-pressed={questId === q.id}>
            {q.name}
          </button>
        ))}
      </div>
      <div class="letter-btns">
        <button class="btn btn-gold btn-sm" disabled={!questId} onClick={() => ui.store.act((st) => { updateTask(st, t.id, { questId }); planTask(st, t.id, st.day); })}>
          На сегодня
        </button>
        <button class="btn btn-ghost btn-sm" disabled={!questId} onClick={() => ui.store.act((st) => updateTask(st, t.id, { questId }))}>
          В отряд
        </button>
        <button class="btn btn-ghost btn-sm" onClick={() => releaseWithUndo(ui, t.id, 'Письмо отпущено')}>
          {W.release}
        </button>
      </div>
    </div>
  );
}

// ---------- итоги дня ----------

function SummarySheet({ ui }: { ui: Ui }) {
  const s = ui.store.state;
  const l = s.log[s.day];
  const open = planOf(s).filter((t) => t.status === 'open');
  const [keep, setKeep] = useState<Set<string>>(() => new Set(open.map((t) => t.id)));
  const toggle = (id: string) => {
    const next = new Set(keep);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setKeep(next);
  };
  const hm = (ms: number) => formatDuration(Math.round(ms / 60_000));
  return (
    <Sheet
      title="Итоги дня"
      onClose={ui.close}
      footer={
        <div class="btns">
          <button class="btn btn-gold" onClick={() => { ui.store.act((st, now) => endDay(st, now, [...keep])); ui.close(); ui.go('camp'); }}>
            <GIcon name="zzz" size={17} />
            {W.lightsOut}
          </button>
          <button class="btn btn-ghost" onClick={ui.close}>
            {W.notSleeping}
          </button>
        </div>
      }
    >
      <div class="stats">
        <Stat v={String(l?.done ?? 0)} label="сделано" />
        <Stat v={`+${l?.gold ?? 0}`} label="золота" />
        <Stat v={`+${l?.xp ?? 0}`} label="опыта" />
        <Stat v={hm(l?.workedMs ?? 0)} label="в пути" />
        <Stat v={hm(l?.restMs ?? 0)} label="на привале" />
        <Stat v={String(l?.undeadSlain ?? 0)} label="нежити упокоено" />
      </div>
      {open.length > 0 && (
        <>
          <div class="field-label">{W.keepAtFire}?</div>
          {open.map((t) => (
            <label key={t.id} class="check-row">
              <input type="checkbox" checked={keep.has(t.id)} onChange={() => toggle(t.id)} />
              <span class="row-title">{t.title}</span>
              <TaskMeta s={s} t={t} />
            </label>
          ))}
          <p class="note">Без галочки задача вернётся в отряд и будет ждать следующего сбора.</p>
        </>
      )}
    </Sheet>
  );
}

function Stat({ v, label }: { v: string; label: string }) {
  return (
    <div class="stat">
      <div class="stat-v">{v}</div>
      <div class="stat-l">{label}</div>
    </div>
  );
}

// ---------- походы ----------

function QuestForm({ ui, questId }: { ui: Ui; questId?: string }) {
  const s = ui.store.state;
  const q = questId ? findQuest(s, questId) : undefined;
  const [name, setName] = useState(q?.name ?? '');
  const [kind, setKind] = useState<QuestKind>(q?.kind ?? 'work');
  const [first] = useState<QuestColor>(() => q?.color ?? PRESETS[s.quests.length % PRESETS.length]);
  // null: в поле кода сейчас не цвет, под ним уже сказано, что не так.
  const [color, setColor] = useState<QuestColor | null>(first);
  const save = () => {
    if (!name.trim() || !color) return;
    if (q) ui.store.act((st) => updateQuest(st, q.id, { name: name.trim(), kind, color }));
    else ui.store.act((st, now) => addQuest(st, now, { name, kind, color }));
    ui.close();
  };
  return (
    <Sheet title={q ? 'Поход' : 'Новый поход'} onClose={ui.close} footer={<button class="btn btn-gold btn-wide" onClick={save}>{q ? 'Сохранить' : 'Выступить в поход'}</button>}>
      <label class="field">
        <span class="field-label">Название</span>
        <input class="input" value={name} onInput={(e) => setName(e.currentTarget.value)} placeholder="Например, сертификат Fullstack" maxLength={60} />
      </label>
      <Chips
        label={`Когда: ${QUEST_KIND_HINT[kind]}`}
        value={kind}
        options={(['work', 'personal', 'any'] as QuestKind[]).map((k) => ({ value: k, label: QUEST_KIND_NAME[k] }))}
        onChange={setKind}
      />
      <QuestColorPicker initial={first} onChange={setColor} />
    </Sheet>
  );
}

function QuestSheet({ ui, questId }: { ui: Ui; questId: string }) {
  const s = ui.store.state;
  const q = findQuest(s, questId);
  if (!q) return null;
  const lair = lairOf(s, q.id);
  const open = s.tasks.filter((t) => t.questId === q.id && t.status === 'open');
  const done = s.tasks.filter((t) => t.questId === q.id && t.status === 'done').length;
  return (
    <Sheet title={q.name} onClose={ui.close}>
      <div class="task-sub">
        <QuestDot q={q} />
        {q.kind === 'any' ? 'поход в любое время' : `${QUEST_KIND_NAME[q.kind]} поход`} · {done} сделано · {open.length} в отряде
      </div>
      {lair.max > 0 && (
        <div class="lair">
          <span>
            Логово: {lair.hp} из {lair.max}
          </span>
          <span class="bar bar-red" aria-hidden="true">
            <span style={{ width: `${(lair.hp / lair.max) * 100}%` }} />
          </span>
        </div>
      )}
      {lair.max > 0 && lair.hp === 0 && !q.wonAt && (
        <button class="btn btn-gold btn-wide" onClick={() => { ui.store.act((st, now) => winQuest(st, now, q.id)); ui.toast('Логово пало! Поход в зале трофеев'); ui.close(); }}>
          Логово пало: завершить поход
        </button>
      )}
      <div class="sublist">
        {open.map((t) => (
          <button key={t.id} class="row" onClick={() => ui.open({ kind: 'task', taskId: t.id })}>
            <span class={`num num-${isUndead(t, s.day) ? 'undead' : t.day === s.day ? 'today' : 'idle'} num-sm`} aria-hidden="true">
              {LEVEL_ROMAN[t.level]}
            </span>
            <span class="row-title">{t.title}</span>
            <TaskMeta s={s} t={t} />
          </button>
        ))}
      </div>
      <div class="actions">
        <button class="act" onClick={() => ui.open({ kind: 'add', questId: q.id, day: null })}>
          <LIcon name="plus" size={16} />
          Задача в этот поход
        </button>
        <button class="act" onClick={() => ui.open({ kind: 'editQuest', questId: q.id })}>
          <LIcon name="edit" size={16} />
          Изменить поход
        </button>
        <button
          class="act act-danger"
          onClick={() => {
            if (!confirm(`Убрать поход «${q.name}»? Его задачи вернутся письмами к вестнику.`)) return;
            ui.store.act((st) => removeQuest(st, q.id));
            ui.close();
          }}
        >
          <LIcon name="trash" size={16} />
          Убрать поход
        </button>
      </div>
    </Sheet>
  );
}
