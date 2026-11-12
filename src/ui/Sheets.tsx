// Листы поверх экрана: новая задача, карточка задачи, письма, сфера и проект, оценка сфер, итоги дня.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import { PRESETS, questHex } from '../game/color';
import { PERIOD_KINDS, periodKind, periodOf, shiftPeriod, type PeriodKey, type PeriodKind } from '../game/period';
import { parsePhrase, type Parsed } from '../game/phrase';
import { ESTIMATE_BY_LEVEL, IMPROVE_MAX, MERCY_XP, MORE_TIME_MIN, RESTED_XP_BONUS, SCORE_MAX, SCORE_MIN, UNDEAD_XP_BONUS, estimateOf, levelForEstimate, undeadRank } from '../game/rules';
import {
  addQuest,
  addRoutine,
  amnesty,
  addTask,
  daysOverdue,
  endDay,
  findQuest,
  findRoutine,
  findTask,
  inboxOf,
  isStarted,
  isUndead,
  lairOf,
  lastRating,
  pickableQuests,
  lightFire,
  planOf,
  projectsOf,
  rateSpheres,
  reopenQuest,
  sphereOf,
  spheresOf,
  switchCostOf,
  moreTime,
  planTask,
  postpone,
  release,
  removeQuest,
  restedLeft,
  restoreDues,
  setImprove,
  setEstimate,
  setPeriod,
  spentNow,
  tailTargets,
  tailsOf,
  stopRoutine,
  undeadOf,
  unrelease,
  updateQuest,
  updateRoutine,
  updateTask,
  waitingOf,
  winQuest,
} from '../game/state';
import { addDays, formatDue, formatDuration, formatSpent, nextRepeat, parseDay, plural, repeatOnDays } from '../game/time';
import type { DayKey, Level, Quest, QuestColor, QuestKind, Repeat, State, Task } from '../game/types';
import type { DiaryEntry } from '../notes/diary';
import {
  CLASS_BY_LEVEL,
  CLASS_NAME,
  IN_WEEKDAY,
  LEVEL_HINT,
  LEVEL_ROMAN,
  PERIOD_KIND_NAME,
  QUEST_KIND_HINT,
  QUEST_KIND_NAME,
  SPHERE_KIND_NAME,
  UNDEAD_NAME,
  W,
  WEEKDAY_CHIPS,
  periodName,
  periodTo,
  repeatName,
} from '../game/words';
import type { Ui } from './App';
import { CallLabel, backToWork, callToFire, finish, pauseHere } from './Camp';
import { heroLevel } from '../game/rules';
import { GIcon, LIcon } from './Icon';
import { comeBack, ignite, letGo } from './magic/spells';
import { bedtime, expectJoin, expectLetter, lairFall } from './magic/world';
import { Chips, LevelMark, QuestDot, TaskMeta, WeekdayPicker, questName } from './parts';
import { QuestColorPicker } from './QuestColorPicker';
import { AboutSheet, RulesSheet } from './Info';
import { WipeSheet } from './Settings';
import { DiarySheet, FolderSheet, MoveSheet, NoteSheet, SectionSheet, ThoughtSheet } from './NoteSheets';
import { SyncConflictSheet, SyncSheet } from './SyncPanel';
import { setSheetBack } from './back';
import { MeetingSheet, MoveMeetingSheet } from './MeetingSheet';
import { PrizeSheet } from './Shop';

export type SheetState =
  | { kind: 'add'; questId?: string | null; day?: DayKey | null; period?: PeriodKey | null }
  | { kind: 'edit'; taskId: string }
  | { kind: 'routine'; routineId: string }
  | { kind: 'task'; taskId: string }
  | { kind: 'duration'; taskId: string }
  | { kind: 'summary' }
  | { kind: 'letters' }
  | { kind: 'tails' }
  | { kind: 'quest'; questId: string }
  | { kind: 'newQuest'; sphere?: boolean; sphereId?: string | null }
  | { kind: 'editQuest'; questId: string }
  | { kind: 'rate' }
  | { kind: 'improve'; questId: string }
  | { kind: 'sync' }
  | { kind: 'syncConflict' }
  | { kind: 'rules' }
  | { kind: 'about' }
  | { kind: 'wipe' }
  | { kind: 'thought'; slug?: string }
  | { kind: 'note'; slug: string; path?: string; folder?: string }
  | { kind: 'section'; slug?: string }
  | { kind: 'folder'; slug: string; parent?: string; path?: string }
  | { kind: 'move'; slug: string; path: string; what: 'note' | 'folder' }
  | { kind: 'diary'; path: string; entry: DiaryEntry }
  | { kind: 'welcome' }
  | { kind: 'meeting'; meetingId?: string; day?: DayKey; at?: string }
  | { kind: 'moveMeeting'; meetingId: string; day: DayKey; at: string }
  | { kind: 'prize'; prizeId?: string };

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
    case 'duration':
      return <DurationSheet ui={ui} taskId={sheet.taskId} />;
    case 'summary':
      return <SummarySheet ui={ui} />;
    case 'letters':
      return <LettersSheet ui={ui} />;
    case 'tails':
      return <TailsSheet ui={ui} />;
    case 'quest':
      return <QuestSheet ui={ui} questId={sheet.questId} />;
    case 'newQuest':
      return <QuestForm ui={ui} sphere={sheet.sphere} sphereId={sheet.sphereId} />;
    case 'rate':
      return <RateSheet ui={ui} />;
    case 'improve':
      return <ImproveSheet key={sheet.questId} ui={ui} questId={sheet.questId} />;
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
    case 'thought':
      return <ThoughtSheet ui={ui} slug={sheet.slug} />;
    case 'note':
      return <NoteSheet key={sheet.path ?? `${sheet.slug}/${sheet.folder ?? ''}`} ui={ui} slug={sheet.slug} path={sheet.path} folder={sheet.folder} />;
    case 'folder':
      return <FolderSheet key={sheet.path ?? `+${sheet.parent ?? ''}`} ui={ui} slug={sheet.slug} parent={sheet.parent ?? ''} path={sheet.path} />;
    case 'move':
      return <MoveSheet key={sheet.path} ui={ui} slug={sheet.slug} path={sheet.path} what={sheet.what} />;
    case 'section':
      return <SectionSheet key={sheet.slug ?? ''} ui={ui} slug={sheet.slug} />;
    case 'diary':
      return <DiarySheet key={`${sheet.path}|${sheet.entry.time}|${sheet.entry.title ?? ''}|${sheet.entry.text}`} ui={ui} path={sheet.path} entry={sheet.entry} />;
    case 'welcome':
      return <WelcomeSheet ui={ui} />;
    case 'prize':
      return <PrizeSheet key={sheet.prizeId ?? '+'} ui={ui} prizeId={sheet.prizeId} />;
    case 'moveMeeting':
      return <MoveMeetingSheet ui={ui} meetingId={sheet.meetingId} day={sheet.day} at={sheet.at} />;
    case 'meeting':
      return <MeetingSheet key={sheet.meetingId ?? `${sheet.day ?? ''}${sheet.at ?? ''}`} ui={ui} meetingId={sheet.meetingId} day={sheet.day} at={sheet.at} />;
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
    // Лист ещё выезжает снизу: без preventScroll браузер прокрутил бы приложение вслед за ним.
    if (!ref.current?.contains(document.activeElement)) ref.current?.focus({ preventScroll: true });
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
  { value: 'week', label: 'Раз в неделю' },
  { value: 'days', label: 'Свои дни' },
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
  const quests = pickableQuests(s, from?.questId);
  const [title, setTitle] = useState(from?.title ?? '');
  const [questId, setQuestId] = useState<string | null>(from ? from.questId : preset?.questId ?? null);
  const [estimate, setEstimate] = useState<number | null>(from ? estimateOf(from) : 30);
  // Уровень следует за временем. У старой задачи он остаётся прежним, пока не тронули время.
  const [lvl, setLvl] = useState<Level>(from?.level ?? levelForEstimate(30));
  const [day, setDay] = useState<DayKey | null>(editing ? editing.day : preset?.day !== undefined ? preset.day : s.day);
  const [due, setDue] = useState<DayKey | null>(editing?.due ?? null);
  const [at, setAt] = useState<string>(from?.at ?? '');
  const [cue, setCue] = useState<string>(from?.cue ?? '');
  const [period, setPeriodKey] = useState<PeriodKey | null>(editing ? editing.period ?? null : preset?.period ?? null);
  const [repeatKind, setRepeatKind] = useState<RepeatKind>(routine?.repeat.every ?? 'none');
  const [weekday, setWeekday] = useState<number>(routine?.repeat.every === 'week' ? routine.repeat.weekday : parseDay(s.day).getDay());
  const [days, setDays] = useState<number[]>(routine?.repeat.every === 'days' ? routine.repeat.days : [weekday]);
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
  const repeat: Repeat | null = repeatKind === 'none' ? null : repeatKind === 'day' ? { every: 'day' } : repeatKind === 'week' ? { every: 'week', weekday } : repeatOnDays(days);
  const noDays = repeat?.every === 'days' && repeat.days.length === 0;
  const willBeLetter = !repeat && !v.questId && !v.day && !v.period;
  const name = parsed ? parsed.title : title.trim();

  const save = (e?: Event) => {
    e?.preventDefault();
    if (!name) {
      input.current?.focus();
      return;
    }
    if (noDays) {
      ui.toast('Выбери хотя бы один день');
      return;
    }
    const fields = { title: name, questId: v.questId, level: v.lvl, estimateMin: v.estimate === ESTIMATE_BY_LEVEL[v.lvl] ? null : v.estimate, at: v.at || null, cue: cue.trim() || null };
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
    const letters = inboxOf(ui.store.state).length;
    ui.store.act((st, now) => addTask(st, now, patch));
    const where = v.period && !v.day ? ` · ${periodName(v.period, s.day).toLowerCase()}` : v.day && v.day > s.day ? ` · ${formatDue(v.day, s.day)}` : '';
    ui.toast(willBeLetter ? 'Письмо у вестника: разберёшь в сборе отряда' : `${CLASS_NAME[CLASS_BY_LEVEL[v.lvl]]} в отряде${where}`);
    if (willBeLetter) expectLetter(letters);
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
        options={[...quests.map((q) => ({ value: q.id as string | null, label: q.name, sr: q.sphere ? `сфера ${q.name}` : `проект ${q.name}` })), { value: null, label: W.noSphere }]}
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
      {repeatKind === 'days' && <WeekdayPicker label="В какие дни" days={days} onChange={setDays} />}
      {noDays && <p class="note note-error">Выбери хотя бы один день.</p>}
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
      <label class="field">
        <span class="field-label">Когда начну</span>
        <input
          class="input"
          value={cue}
          onInput={(e) => setCue(e.currentTarget.value)}
          placeholder="Например, когда налью чай, открою документ"
          maxLength={140}
          aria-describedby="cue-hint"
        />
      </label>
      <p class="note" id="cue-hint">
        Необязательно. Момент, после которого начнёшь, и первый крошечный шаг. Лагерь покажет их, когда задача ждёт у огня.
      </p>
      {repeat && <p class="note">В свои дни задача сама встаёт в план дня. Пока прошлая не сделана, новая не приходит. В прогресс проекта повторяющиеся задачи не идут: они не кончаются.</p>}
      {!repeat && v.period && !v.day && <p class="note">Задача ждёт в отряде и видна в сборе отряда на вкладке «{PERIOD_KIND_NAME[kind!]}». К костру её можно позвать в любой день периода.</p>}
      {willBeLetter && <p class="note">Без сферы, без дня и без горизонта задача уходит письмом к вестнику. Разобрать письма можно в сборе отряда.</p>}
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
  quest: 'сфера',
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
          {f.kind === 'quest' && !findQuest(s, parsed.questId ?? null)?.sphere ? 'проект' : FOUND_NAME[f.kind]}: <b>{value(f.kind)}</b>
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
  const next = nextRepeat(repeat, addDays(s.day, 1));
  if (!next) return `Повторяется ${name}`;
  const when = next === addDays(s.day, 1) ? 'завтра' : IN_WEEKDAY[parseDay(next).getDay()];
  return repeat.every === 'week' ? `Придёт ${when}, а дальше каждую неделю` : `Повторяется ${name}. Придёт ${when}`;
}

// ---------- карточка задачи ----------

function TaskSheet({ ui, taskId }: { ui: Ui; taskId: string }) {
  const s = ui.store.state;
  const t = findTask(s, taskId);
  const [level, setLevel] = useState<Level | null>(null);
  const [moving, setMoving] = useState(false);
  if (!t) return null;
  const q = findQuest(s, t.questId);
  const cls = CLASS_BY_LEVEL[t.level];
  const undead = isUndead(t, s.day);
  const isCurrent = s.current?.taskId === t.id;
  const running = isCurrent && s.current!.runningSince !== null && s.breakSince === null;
  const started = isStarted(s, t);
  const inToday = t.day === s.day;
  const est = estimateOf(t);
  const spent = spentNow(s, t, ui.now);
  const switchCost = switchCostOf(s, t);
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
          {spent > 0 && <span>{done ? 'Потрачено' : 'У огня уже'} {formatSpent(spent)}</span>}
          {t.due && <span class={undead ? 'meta-undead' : ''}>Срок: {formatDue(t.due, s.day)}</span>}
          {t.at && <span>В {t.at}</span>}
          {t.period && <span>Горизонт: {periodName(t.period, s.day).toLowerCase()}</span>}
          {t.cue && <span class="fact-cue">{t.cue}</span>}
          {routine && (
            <span class="fact-repeat">
              <LIcon name="repeat" size={14} />
              Повторяется {repeatName(routine.repeat)}
            </span>
          )}
          {done && t.reward && <span>Сделано: +{t.reward.gold} золота, +{t.reward.xp} опыта</span>}
        </div>
      </div>

      {!done && t.status !== 'released' && undead && !isCurrent && (
        <UndeadChoice ui={ui} t={t} moving={moving} setMoving={setMoving} switchCost={switchCost} />
      )}

      {!done && t.status !== 'released' && (
        <>
          {!(undead && !isCurrent) && (
          <div class="btns">
            {!isCurrent && (
              <button class="btn btn-gold" onClick={() => { close(); callToFire(ui, t); }}>
                <GIcon name="campfire" size={18} />
                {started ? W.resume : switchCost > 0 ? W.callToFireShort : <CallLabel />}
                {switchCost > 0 && <small class="btn-cost">−{switchCost} маны</small>}
              </button>
            )}
            {isCurrent && (running ? (
              <button class="btn btn-ghost" onClick={() => { close(); pauseHere(ui); }}>
                <LIcon name="pause" size={16} stroke={2.6} />
                {W.pause}
              </button>
            ) : (
              <button class="btn btn-ghost" onClick={() => { close(); backToWork(ui); }}>
                <LIcon name="play" size={16} />
                {W.resume}
              </button>
            ))}
            <button class={`btn ${isCurrent ? 'btn-gold' : 'btn-ghost'}`} onClick={() => { close(); finish(ui, t, level ?? undefined); }}>
              <GIcon name="check" size={17} />
              {undead ? W.slay : W.done}
            </button>
          </div>
          )}
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
            {undead && !isCurrent && (
              <button class="act" onClick={() => { close(); finish(ui, t, level ?? undefined); }}>
                <GIcon name="check" size={16} />
                Уже сделано: упокоить сразу
              </button>
            )}
            {isCurrent && (
              <button class="act" onClick={() => ui.open({ kind: 'duration', taskId: t.id })}>
                <GIcon name="hourglass" size={16} />
                {W.duration}
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
            {!(undead && !isCurrent) && (
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
            )}
          </div>
        </>
      )}
    </Sheet>
  );
}

/** Подпись длительности: «~1 ч 30 мин» или «несколько дней». */
function estimateLabel(min: number | null): string {
  return min ? `~${formatDuration(min)}` : 'несколько дней';
}

/**
 * Сколько займёт задача у огня. «Нужно ещё» считает от уже отданного времени и сразу сохраняет,
 * а длительность всей задачи выбирается фишками. Таймер, пауза и уровень не меняются.
 */
function DurationSheet({ ui, taskId }: { ui: Ui; taskId: string }) {
  const s = ui.store.state;
  const t = findTask(s, taskId);
  const was = t ? estimateOf(t) : null;
  const [pick, setPick] = useState<number | null>(was ?? 60);
  if (!t) return null;
  const spent = spentNow(s, t, ui.now);
  const spentMin = Math.round(spent / 60_000);
  const before = t.estimateMin;
  const apply = (change: (st: State, now: number) => void) => {
    ui.store.act(change);
    ui.close();
    const now = findTask(ui.store.state, taskId);
    if (!now) return;
    ui.toast(`«${now.title}» теперь ${estimateLabel(estimateOf(now))}`, {
      label: 'Вернуть',
      run: () => ui.store.act((st) => updateTask(st, taskId, { estimateMin: before })),
    });
  };
  const options = ESTIMATES.filter((o): o is { value: number; label: string } => o.value !== null);
  const all = pick === null || options.some((o) => o.value === pick) ? options : [...options, { value: pick, label: formatDuration(pick) }].sort((a, b) => a.value - b.value);
  return (
    <Sheet
      title={W.duration}
      onClose={ui.close}
      footer={
        <button class="btn btn-gold btn-wide" onClick={() => pick !== null && apply((st) => setEstimate(st, taskId, pick))}>
          Сохранить
        </button>
      }
    >
      <div class="task-head">
        <div class="task-title">{t.title}</div>
        <div class="task-facts">
          <span>Было {estimateLabel(was)}</span>
          {spent > 0 && <span>У огня уже {formatSpent(spent)}</span>}
        </div>
      </div>
      <div class="field">
        <h3 class="field-label" id="more-time">Нужно ещё</h3>
        <div class="chips" role="group" aria-labelledby="more-time">
          {MORE_TIME_MIN.map((m) => (
            <button key={m} type="button" class="chipbtn" aria-label={`Ещё ${formatDuration(m)}, всего ${formatDuration(spentMin + m)}`} onClick={() => apply((st, now) => moreTime(st, now, taskId, m))}>
              +{formatDuration(m)}
            </button>
          ))}
        </div>
      </div>
      <Chips label="Или вся задача целиком" value={pick} options={all} onChange={setPick} />
      <p class="note">Отданное время, уровень и награда остаются прежними.</p>
    </Sheet>
  );
}

/**
 * Нежить: три равных решения, и каждое приносит опыт. Упокоить значит позвать к огню и начать,
 * перенести значит дать новый срок, отпустить значит честно решить, что делать не будем.
 */
function UndeadChoice(p: { ui: Ui; t: Task; moving: boolean; setMoving: (v: boolean) => void; switchCost: number }) {
  const { ui, t } = p;
  const s = ui.store.state;
  const rank = undeadRank(daysOverdue(t, s.day));
  const bonus = Math.round(UNDEAD_XP_BONUS[rank] * 100);
  const move = (due: DayKey | null, text: string) => {
    const xp = ui.store.act((st, now) => postpone(st, now, t.id, due));
    ui.close();
    ui.toast(xp ? `${text}: +${xp} опыта` : text);
  };
  return (
    <>
      <p class="note undead-note">
        {rank === 'rogue' ? 'Старая нежить страшнее не становится, а упокоить её выгоднее: опыта вдвое.' : `Нежить ждёт решения. Любое из трёх приносит опыт, а упокоенная даёт его на ${bonus}% больше.`}
      </p>
      <div class="btns btns-three" role="group" aria-label="Что сделать с нежитью">
        <button class="btn btn-gold btn-choice" onClick={() => { ui.close(); callToFire(ui, t); }}>
          <GIcon name="campfire" size={18} />
          {W.slay}
          <small class="btn-cost">{p.switchCost > 0 ? `к огню, −${p.switchCost} маны` : 'к огню'}</small>
        </button>
        <button class="btn btn-ghost btn-choice" aria-expanded={p.moving} onClick={() => p.setMoving(!p.moving)}>
          <LIcon name="calendar" size={17} />
          {W.postpone}
          <small class="btn-cost">+{MERCY_XP} опыта</small>
        </button>
        <button
          class="btn btn-ghost btn-choice"
          onClick={() => {
            releaseWithUndo(ui, t.id, 'Нежить отпущена на покой');
            ui.close();
          }}
        >
          <LIcon name="trash" size={16} />
          {W.release}
          <small class="btn-cost">+{MERCY_XP} опыта</small>
        </button>
      </div>
      {p.moving && (
        <div class="chips postpone" role="group" aria-label="Новый срок">
          <button class="chipbtn" onClick={() => move(addDays(s.day, 1), 'Срок на завтра')}>
            На завтра
          </button>
          <button class="chipbtn" onClick={() => move(addDays(s.day, 7), 'Срок через неделю')}>
            Через неделю
          </button>
          <button class="chipbtn" onClick={() => move(null, 'Срок снят, задача ждёт в отряде')}>
            Без срока
          </button>
        </div>
      )}
    </>
  );
}

// ---------- возвращение ----------

/**
 * Возвращение после перерыва. Пропуски не считаются, нежить можно отпустить на покой разом,
 * первые дела дня дают опыт сверху, а утренний сбор сегодня по желанию.
 */
function WelcomeSheet({ ui }: { ui: Ui }) {
  const s = ui.store.state;
  const left = restedLeft(s);
  const undead = undeadOf(s).length > 0;
  const toFire = () => {
    const before = heroLevel(ui.store.state.hero.xp).level;
    const xp = ui.store.state.litDay === ui.store.state.day ? 0 : ui.store.act((st, n) => lightFire(st, n));
    ui.go('camp');
    if (xp > 0) ignite(xp, before, heroLevel(ui.store.state.hero.xp).level);
  };
  const calm = () => {
    const was = ui.store.act((st, n) => amnesty(st, n));
    ui.toast('Нежить ушла на покой, задачи ждут в отряде без сроков', {
      label: 'Вернуть',
      run: () => ui.store.act((st) => restoreDues(st, was)),
    });
  };
  return (
    <Sheet
      title="Костёр ждал"
      onClose={ui.close}
      footer={
        <div class="btns">
          <button class="btn btn-gold" onClick={toFire}>
            <GIcon name="campfire" size={18} />
            Сразу к огню
          </button>
          <button class="btn btn-ghost" onClick={() => ui.go('plan')}>
            <GIcon name="sunrise" size={18} />
            Собрать отряд
          </button>
        </div>
      }
    >
      <p class="welcome-lead">Хорошо, что ты здесь. Пропуски тут не считают: начнём с того, что есть.</p>
      {left > 0 && (
        <div class="rested">
          <GIcon name="heart" size={15} />
          <span>
            Отдохнувший герой: первые {left} {left === 1 ? 'дело' : left < 5 ? 'дела' : 'дел'} сегодня {RESTED_XP_BONUS === 1 ? 'дают вдвое больше опыта' : 'дают опыт сверху'}.
          </span>
        </div>
      )}
      {undead && (
        <>
          <p class="note">На дороге стоит нежить. Её можно разобрать по одной, а можно отпустить на покой всю разом: сроки снимутся, задачи подождут в отряде.</p>
          <div class="actions">
            <button class="act" onClick={calm}>
              <GIcon name="skull" size={16} />
              Дать нежити покой
            </button>
          </div>
        </>
      )}
      <p class="note">Утренний сбор сегодня по желанию. «Сразу к огню» разжигает костёр с тем, что уже в плане.</p>
    </Sheet>
  );
}

/** Отпустить задачу; несколько секунд её можно вернуть одной кнопкой, потом из Королевства. */
function releaseWithUndo(ui: Ui, id: string, text: string): void {
  const xp = ui.store.act((st, now) => release(st, now, id));
  letGo(id);
  ui.toast(xp ? `${text}: +${xp} опыта` : text, {
    label: 'Вернуть',
    run: () => {
      ui.store.act((st) => unrelease(st, id));
      comeBack(id);
    },
  });
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
  const quests = pickableQuests(s);
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
        <button
          class="btn btn-gold btn-sm"
          disabled={!questId}
          onClick={() => {
            ui.store.act((st) => {
              updateTask(st, t.id, { questId });
              planTask(st, t.id, st.day);
            });
            expectJoin(t.id);
          }}
        >
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
          <button
            class="btn btn-gold"
            onClick={() => {
              const ids = [...keep];
              ui.store.act((st, now) => endDay(st, now, ids));
              ui.close();
              ui.go('camp');
              bedtime(ids);
            }}
          >
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

// ---------- сферы и проекты ----------

/** Новая сфера или новый проект (sphere решает, что именно), а с questId правка существующего. */
function QuestForm({ ui, questId, sphere, sphereId }: { ui: Ui; questId?: string; sphere?: boolean; sphereId?: string | null }) {
  const s = ui.store.state;
  const q = questId ? findQuest(s, questId) : undefined;
  const isSphere = q ? !!q.sphere : !!sphere;
  const spheres = spheresOf(s);
  const [name, setName] = useState(q?.name ?? '');
  const [kind, setKind] = useState<QuestKind>(q?.kind ?? (isSphere ? 'personal' : 'work'));
  const [home, setHome] = useState<string | null>(q ? sphereOf(s, q.id)?.id ?? null : sphereId ?? null);
  const homeSphere = home && !isSphere ? findQuest(s, home) : undefined;
  const [first] = useState<QuestColor>(() => q?.color ?? homeSphere?.color ?? PRESETS[s.quests.length % PRESETS.length]);
  // null: в поле кода сейчас не цвет, под ним уже сказано, что не так.
  const [color, setColor] = useState<QuestColor | null>(first);
  const save = () => {
    if (!name.trim() || !color) return;
    if (q) ui.store.act((st) => updateQuest(st, q.id, { name: name.trim(), kind, color, ...(isSphere ? {} : { sphereId: home }) }));
    else ui.store.act((st, now) => addQuest(st, now, { name, kind, color, sphere: isSphere, sphereId: isSphere ? null : home }));
    ui.close();
  };
  const what = isSphere ? 'Сфера' : 'Проект';
  return (
    <Sheet
      title={q ? what : isSphere ? 'Новая сфера' : 'Новый проект'}
      onClose={ui.close}
      footer={<button class="btn btn-gold btn-wide" onClick={save}>{q ? 'Сохранить' : isSphere ? 'Добавить сферу' : 'Начать проект'}</button>}
    >
      <label class="field">
        <span class="field-label">Название</span>
        <input class="input" value={name} onInput={(e) => setName(e.currentTarget.value)} placeholder={isSphere ? 'Например, Творчество' : 'Например, сертификат Fullstack'} maxLength={60} />
      </label>
      {!isSphere && (
        <Chips
          label="В какой сфере"
          value={home}
          options={[...spheres.map((x) => ({ value: x.id as string | null, label: x.name })), { value: null, label: W.noSphere }]}
          onChange={setHome}
        />
      )}
      {isSphere || !homeSphere ? (
        <Chips
          label={`Когда: ${QUEST_KIND_HINT[kind]}`}
          value={kind}
          options={(['work', 'personal', 'any'] as QuestKind[]).map((k) => ({ value: k, label: (isSphere ? SPHERE_KIND_NAME : QUEST_KIND_NAME)[k] }))}
          onChange={setKind}
        />
      ) : (
        <p class="note">Когда: как у сферы «{homeSphere.name}», {QUEST_KIND_HINT[homeSphere.kind]}.</p>
      )}
      <QuestColorPicker initial={first} onChange={setColor} />
    </Sheet>
  );
}

function QuestSheet({ ui, questId }: { ui: Ui; questId: string }) {
  const s = ui.store.state;
  const q = findQuest(s, questId);
  if (!q) return null;
  if (q.sphere) return <SphereSheet ui={ui} q={q} />;
  const lair = lairOf(s, q.id);
  const home = sphereOf(s, q.id);
  const open = s.tasks.filter((t) => t.questId === q.id && t.status === 'open');
  const done = s.tasks.filter((t) => t.questId === q.id && t.status === 'done').length;
  const where = home ? `проект в сфере «${home.name}»` : q.kind === 'any' ? 'проект в любое время' : `${QUEST_KIND_NAME[q.kind]} проект`;
  const finishIt = () => {
    const rest = open.filter((t) => !t.routineId).length;
    if (rest > 0 && !confirm(`Отметить проект «${q.name}» выполненным? ${rest} ${plural(rest, 'незаконченная задача перейдёт', 'незаконченные задачи перейдут', 'незаконченных задач перейдут')} ${home ? `в сферу «${home.name}»` : 'к вестнику письмами'}.`)) return;
    ui.store.act((st, now) => winQuest(st, now, q.id));
    ui.toast('Проект выполнен! Его знамя в зале трофеев');
    ui.close();
    lairFall(q.id, q.name, q.color);
  };
  return (
    <Sheet title={q.name} onClose={ui.close}>
      <div class="task-sub">
        <QuestDot q={q} />
        {where} · {done} сделано · {open.length} в отряде
      </div>
      {q.wonAt && <p class="note">Выполнен {new Date(q.wonAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })}, знамя в зале трофеев.</p>}
      {lair.max > 0 && (
        <div class="lair lair-progress">
          <span>
            Сделано {lair.max - lair.hp} из {lair.max}
          </span>
          <span class="bar bar-gold" aria-hidden="true">
            <span style={{ width: `${((lair.max - lair.hp) / lair.max) * 100}%` }} />
          </span>
        </div>
      )}
      {!q.wonAt && (
        <button class="btn btn-gold btn-wide" onClick={finishIt}>
          Проект выполнен
        </button>
      )}
      <TaskList ui={ui} s={s} tasks={open} />
      <div class="actions">
        {!q.wonAt && (
          <button class="act" onClick={() => ui.open({ kind: 'add', questId: q.id, day: null })}>
            <LIcon name="plus" size={16} />
            Задача в этот проект
          </button>
        )}
        {q.wonAt && (
          <button
            class="act"
            onClick={() => {
              ui.store.act((st) => reopenQuest(st, q.id));
              ui.toast('Проект снова в работе');
            }}
          >
            <LIcon name="undo" size={16} />
            Вернуть в работу
          </button>
        )}
        <button class="act" onClick={() => ui.open({ kind: 'editQuest', questId: q.id })}>
          <LIcon name="edit" size={16} />
          Изменить проект
        </button>
        <button
          class="act act-danger"
          onClick={() => {
            if (!confirm(`Убрать проект «${q.name}»? ${home ? `Его задачи перейдут в сферу «${home.name}».` : 'Его задачи вернутся письмами к вестнику.'}`)) return;
            ui.store.act((st) => removeQuest(st, q.id));
            ui.close();
          }}
        >
          <LIcon name="trash" size={16} />
          Убрать проект
        </button>
      </div>
    </Sheet>
  );
}

function SphereSheet({ ui, q }: { ui: Ui; q: Quest }) {
  const s = ui.store.state;
  const open = s.tasks.filter((t) => t.questId === q.id && t.status === 'open');
  const projects = projectsOf(s, q.id);
  const score = lastRating(s)?.scores[q.id];
  return (
    <Sheet title={q.name} onClose={ui.close}>
      <div class="task-sub">
        <QuestDot q={q} />
        {SPHERE_KIND_NAME[q.kind]} сфера · {open.length} в отряде{score !== undefined && ` · оценка ${score} из ${SCORE_MAX}`}
      </div>
      <p class="note">Сфера не кончается. {QUEST_KIND_HINT[q.kind][0].toUpperCase() + QUEST_KIND_HINT[q.kind].slice(1)}.</p>
      <div class="field-label">{W.improve}</div>
      <button class="row improve-row" onClick={() => ui.open({ kind: 'improve', questId: q.id })}>
        <span class={q.improve ? 'improve-text' : 'improve-text row-muted'}>{q.improve ?? 'Запиши, что сделать, чтобы эта сфера стала лучше'}</span>
        <LIcon name="edit" size={16} />
      </button>
      <div class="field-label">{W.quests}</div>
      {projects.length === 0 && <p class="note">Проектов пока нет.</p>}
      <div class="sublist">
        {projects.map((p) => (
          <button key={p.id} class="row" onClick={() => ui.open({ kind: 'quest', questId: p.id })}>
            <QuestDot q={p} />
            <span class="row-title">{p.name}</span>
            <span class="meta">{s.tasks.filter((t) => t.questId === p.id && t.status === 'open').length} в отряде</span>
          </button>
        ))}
      </div>
      {open.length > 0 && <div class="field-label">Задачи сферы</div>}
      <TaskList ui={ui} s={s} tasks={open} />
      <div class="actions">
        <button class="act" onClick={() => ui.open({ kind: 'add', questId: q.id, day: null })}>
          <LIcon name="plus" size={16} />
          Задача в эту сферу
        </button>
        <button class="act" onClick={() => ui.open({ kind: 'newQuest', sphereId: q.id })}>
          <LIcon name="plus" size={16} />
          Проект в этой сфере
        </button>
        <button class="act" onClick={() => ui.open({ kind: 'editQuest', questId: q.id })}>
          <LIcon name="edit" size={16} />
          Изменить сферу
        </button>
        <button
          class="act act-danger"
          onClick={() => {
            if (!confirm(`Убрать сферу «${q.name}»? Её задачи вернутся письмами к вестнику, а проекты останутся без сферы.`)) return;
            ui.store.act((st) => removeQuest(st, q.id));
            ui.close();
          }}
        >
          <LIcon name="trash" size={16} />
          Убрать сферу
        </button>
      </div>
    </Sheet>
  );
}

function TaskList({ ui, s, tasks }: { ui: Ui; s: State; tasks: Task[] }) {
  return (
    <div class="sublist">
      {tasks.map((t) => (
        <button key={t.id} class="row" onClick={() => ui.open({ kind: 'task', taskId: t.id })}>
          <span class={`num num-${isUndead(t, s.day) ? 'undead' : t.day === s.day ? 'today' : 'idle'} num-sm`} aria-hidden="true">
            {LEVEL_ROMAN[t.level]}
          </span>
          <span class="row-title">{t.title}</span>
          <TaskMeta s={s} t={t} />
        </button>
      ))}
    </div>
  );
}

// ---------- оценка сфер ----------

/**
 * Заметка «Как улучшить» у сферы: свободный текст, что сделать, чтобы сфера стала лучше.
 * Открывается нажатием на сферу в колесе баланса. Закрыть лист значит сохранить: набранное не теряется.
 */
function ImproveSheet({ ui, questId }: { ui: Ui; questId: string }) {
  const s = ui.store.state;
  const q = findQuest(s, questId);
  const [text, setText] = useState(q?.improve ?? '');
  const area = useRef<HTMLTextAreaElement>(null);
  // Лист открывают, чтобы писать: поле сразу в фокусе, на телефоне выезжает клавиатура.
  useEffect(() => area.current?.focus({ preventScroll: true }), []);
  if (!q?.sphere) return null;
  const score = lastRating(s)?.scores[q.id];
  // Escape и «Назад» зовут закрытие, запомненное листом чуть раньше: текст берётся из ref, а не из замыкания.
  const typed = useRef(text);
  typed.current = text;
  const keep = () => {
    const now = typed.current;
    if (now.trim() !== (findQuest(ui.store.state, q.id)?.improve ?? '')) {
      ui.store.act((st) => setImprove(st, q.id, now));
      return true;
    }
    return false;
  };
  const close = () => {
    keep();
    ui.close();
  };
  const save = () => {
    if (keep()) ui.toast(typed.current.trim() ? 'Заметка сохранена' : 'Заметка убрана');
    ui.close();
  };
  const id = `improve-${q.id}`;
  return (
    <Sheet title={q.name} onClose={close} footer={<button class="btn btn-gold btn-wide" onClick={save}>Сохранить</button>}>
      <div class="task-sub">
        <QuestDot q={q} />
        {SPHERE_KIND_NAME[q.kind]} сфера{score !== undefined ? ` · оценка ${score} из ${SCORE_MAX}` : ' · ещё без оценки'}
      </div>
      <label class="field">
        <span class="field-label">Что сделать, чтобы эта сфера стала лучше</span>
        <textarea
          ref={area}
          id={id}
          class="input improve-input"
          rows={7}
          maxLength={IMPROVE_MAX}
          value={text}
          placeholder={'Например:\nложиться до полуночи\nгулять полчаса после обеда'}
          onInput={(e) => {
            typed.current = e.currentTarget.value;
            setText(e.currentTarget.value);
          }}
        />
      </label>
      <p class="note">Записи видишь только ты. Каждый шаг можно писать с новой строки.</p>
    </Sheet>
  );
}

/** Оценить каждую сферу от 1 до 10. Ползунок стоит на прошлой оценке, а без неё посередине. */
function RateSheet({ ui }: { ui: Ui }) {
  const s = ui.store.state;
  const spheres = spheresOf(s);
  const last = lastRating(s);
  const [scores, setScores] = useState<Record<string, number>>(() =>
    Object.fromEntries(spheres.map((q) => [q.id, last?.scores[q.id] ?? Math.round((SCORE_MIN + SCORE_MAX) / 2)])),
  );
  const save = () => {
    ui.store.act((st, now) => rateSpheres(st, now, scores));
    ui.toast('Оценка сохранена');
    ui.close();
  };
  return (
    <Sheet title={W.rate} onClose={ui.close} footer={<button class="btn btn-gold btn-wide" onClick={save}>Сохранить оценку</button>}>
      <p class="note">Насколько ты доволен каждой сферой сейчас: 1 совсем плохо, {SCORE_MAX} лучше не бывает. Оценивай честно, это видишь только ты.</p>
      {spheres.map((q) => {
        const v = scores[q.id];
        const was = last?.scores[q.id];
        const id = `rate-${q.id}`;
        return (
          <div key={q.id} class="rate-row">
            <label class="rate-head" for={id}>
              <QuestDot q={q} />
              <span class="row-title">{q.name}</span>
              <span class="rate-v" aria-hidden="true">{v}</span>
            </label>
            <input
              id={id}
              class="qslider rate-range"
              style={{ '--track': `linear-gradient(90deg, rgba(255, 236, 200, 0.1), ${questHex(q.color)})`, '--thumb': questHex(q.color) }}
              type="range"
              min={SCORE_MIN}
              max={SCORE_MAX}
              step={1}
              value={v}
              aria-valuetext={`${v} из ${SCORE_MAX}`}
              onInput={(e) => {
                const n = Number(e.currentTarget.value);
                setScores((x) => ({ ...x, [q.id]: n }));
              }}
            />
            {was !== undefined && <span class="rate-was">в прошлый раз {was}</span>}
          </div>
        );
      })}
    </Sheet>
  );
}
