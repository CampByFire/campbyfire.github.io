import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import type { Store } from '../game/store';
import type { Notes } from '../notes/notes';
import type { Sync } from '../sync/sync';
import type { CompleteResult } from '../game/state';
import { W } from '../game/words';
import { Camp } from './Camp';
import { sheetBack, useBackButton } from './back';
import { isLost, restoreFocus, spotOf, type FocusSpot } from './focus';
import { useStore } from './hooks';
import { Intro } from './Intro';
import { loadLocal, updateLocal } from './local';
import { GIcon, LIcon } from './Icon';
import { setMotion } from './magic/engine';
import { MagicLayers, SheetLayer } from './magic/layers';
import { onSystemReduced, resolveMotion, systemReduced, type Motion } from './magic/mode';
import { pageEnter, pageLeave } from './magic/spells';
import { Notices } from './Notices';
import { NotesScreen, useNotes } from './Notes';
import { Plan } from './Plan';
import { Realm } from './Realm';
import { Settings } from './Settings';
import { Sheets, type SheetState } from './Sheets';
import { useSync } from './SyncPanel';

export type Screen = 'camp' | 'plan' | 'realm' | 'notes' | 'settings';

export interface ToastAction {
  label: string;
  run: () => void;
}

export interface Cheer {
  taskId: string;
  result: CompleteResult;
  until: number;
}

/** То, чем экраны управляют приложением. */
export interface Ui {
  store: Store;
  sync: Sync;
  notes: Notes;
  now: number;
  go(screen: Screen): void;
  /** Открытый раздел Летописи (имя папки или 'days' для «Последних дней»); null, когда виден список разделов. */
  section: string | null;
  /** Открыть раздел Летописи (и саму Летопись) или вернуться к списку разделов. */
  openSection(slug: string | null): void;
  open(sheet: SheetState): void;
  close(): void;
  /** Короткое сообщение внизу; с действием живёт дольше, чтобы успеть нажать. */
  toast(text: string, action?: ToastAction): void;
  cheer: Cheer | null;
  setCheer(c: Cheer | null): void;
  /** Поверх экрана лист или знакомство: экран под ними недоступен. */
  covered: boolean;
  showIntro(): void;
  /** Сила магии на этом устройстве. */
  motion: Motion;
  setMotion(m: Motion): void;
}

/** Знакомство показываем новичку. Тому, у кого уже есть задачи (обновился или взял игру из GitHub), не показываем. */
function needIntro(store: Store): boolean {
  const now = store.now();
  if (loadLocal(now).introDone) return false;
  if (store.state.tasks.length === 0) return true;
  updateLocal(now, (l) => {
    l.introDone = true;
  });
  return false;
}

const CHEER_MS = 12_000;
/** Столько лист уезжает вниз после закрытия, потом его нет. */
const SHEET_OUT_MS = 200;

/** Сила магии: выбранная в Настройках или по настройке системы «Уменьшить движение». */
const motionOf = (now: number) => resolveMotion(loadLocal(now).magic, systemReduced());

export function App({ store, sync, notes }: { store: Store; sync: Sync; notes: Notes }) {
  useStore(store);
  useSync(sync);
  useNotes(notes);
  const s = store.state;
  const [screen, setScreen] = useState<Screen>(() => (s.litDay !== s.day && s.closedDay !== s.day ? 'plan' : 'camp'));
  const [section, setSection] = useState<string | null>(null);
  const [sheet, setSheet] = useState<SheetState | null>(null);
  /** Лист закрыт, но ещё уезжает вниз. */
  const [closing, setClosing] = useState(false);
  /** Новый лист поверх уезжающего открывается заново, со своим выездом. */
  const [sheetKey, setSheetKey] = useState(0);
  const closeTimer = useRef(0);
  /** Лист открыт и не закрывается: знают сразу, не дожидаясь перерисовки. */
  const sheetShown = useRef(false);
  const [toast, setToast] = useState<{ text: string; id: number; action?: ToastAction } | null>(null);
  const [cheer, setCheerState] = useState<Cheer | null>(null);
  /** Откуда открыли лист: туда вернётся фокус, когда листов не останется. */
  const opener = useRef<FocusSpot | null>(null);
  /** Где фокус стоял последним: если кнопка пропадёт после действия, он вернётся рядом. */
  const lastFocus = useRef<FocusSpot | null>(null);
  const [day, setDay] = useState(s.day);
  const [intro, setIntro] = useState(() => needIntro(store));
  const [motion, setMotionState] = useState<Motion>(() => motionOf(store.now()));
  const main = useRef<HTMLElement>(null);
  const shownScreen = useRef(screen);

  const dropSheet = () => {
    window.clearTimeout(closeTimer.current);
    closeTimer.current = 0;
    sheetShown.current = false;
    setClosing(false);
    setSheet(null);
  };
  const showSheet = (next: SheetState) => {
    if (closeTimer.current) {
      window.clearTimeout(closeTimer.current);
      closeTimer.current = 0;
      setSheetKey((k) => k + 1);
    }
    sheetShown.current = true;
    setClosing(false);
    setSheet(next);
  };
  /** Лист уезжает вниз, а экран под ним сразу снова доступен. Без анимаций лист пропадает сразу. */
  const closeSheet = () => {
    if (!sheetShown.current) return;
    if (motion === 'off') return dropSheet();
    sheetShown.current = false;
    setClosing(true);
    closeTimer.current = window.setTimeout(dropSheet, SHEET_OUT_MS);
  };

  useLayoutEffect(() => setMotion(motion), [motion]);
  useEffect(() => onSystemReduced(() => setMotionState(motionOf(store.now()))), [store]);

  // Перелистывание: новая страница поднимается, когда она уже на месте, но ещё не на экране.
  useLayoutEffect(() => {
    if (shownScreen.current === screen) return;
    shownScreen.current = screen;
    pageEnter(main.current);
  }, [screen]);

  useEffect(() => {
    const id = window.setInterval(() => store.tick(), 1000);
    const onVis = () => {
      if (document.visibilityState === 'visible') store.wake();
      else store.persist();
    };
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('pagehide', () => store.persist());
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [store]);

  // Новый день открывается сбором отряда.
  useEffect(() => {
    if (s.day !== day) {
      setDay(s.day);
      setScreen('plan');
      dropSheet();
    }
  }, [s.day, day]);

  // В GitHub другая игра: сразу спрашиваем, какую оставить.
  const phase = sync.status.phase;
  useEffect(() => {
    if (phase === 'conflict') showSheet({ kind: 'syncConflict' });
  }, [phase]);

  // Ошибку GitHub показываем один раз, а не при каждой новой попытке; пропавшая сеть не ошибка,
  // о ней сказано в Настройках.
  const shownError = useRef<string | null>(null);
  const syncError = sync.status.error;
  useEffect(() => {
    if (phase === 'ok') shownError.current = null;
    if (phase === 'error' && syncError && syncError !== shownError.current) {
      shownError.current = syncError;
      setToast({ text: syncError, id: Date.now() });
    }
  }, [phase, syncError]);

  // Фокус возвращается, как только лист начал закрываться: экран под ним уже доступен.
  const openSheet = closing ? null : sheet;
  useEffect(() => {
    if (openSheet || !opener.current) return;
    const spot = opener.current;
    opener.current = null;
    restoreFocus(spot);
  }, [openSheet]);

  useEffect(() => {
    const onFocus = (e: FocusEvent) => {
      lastFocus.current = spotOf(e.target as Element);
    };
    document.addEventListener('focusin', onFocus);
    return () => document.removeEventListener('focusin', onFocus);
  }, []);

  // После каждого обновления: фокус пропал вместе с кнопкой, а не потому что человек сам ушёл с неё.
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      const spot = lastFocus.current;
      if (!spot || (document.activeElement && document.activeElement !== document.body) || !isLost(spot)) return;
      lastFocus.current = null;
      restoreFocus(spot);
    });
    return () => cancelAnimationFrame(id);
  });

  // Свою версию заметки положили рядом копией: говорим об этом.
  useEffect(() => {
    notes.onNotice = (text) => setToast({ text, id: Date.now() });
    return () => {
      notes.onNotice = null;
    };
  }, [notes]);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), toast.action ? 6000 : 2600);
    return () => window.clearTimeout(id);
  }, [toast]);

  const now = store.now();
  const liveCheer = cheer && cheer.until > now ? cheer : null;
  // Пока открыт лист или знакомство, экран под ним недоступен ни пальцу, ни экранному чтецу, ни Tab.
  const covered = !!openSheet || intro;

  const ui: Ui = {
    store,
    sync,
    notes,
    now,
    go: (sc) => {
      closeSheet();
      if (sc !== screen) pageLeave(main.current);
      setScreen(sc);
      if (sc === 'notes' && screen === 'notes') setSection(null);
    },
    section: screen === 'notes' ? section : null,
    openSection: (slug) => {
      closeSheet();
      if (screen !== 'notes' || slug !== section) pageLeave(main.current);
      setSection(slug);
      setScreen('notes');
    },
    open: (next) => {
      if (!sheetShown.current) opener.current = spotOf(document.activeElement);
      showSheet(next);
    },
    close: closeSheet,
    toast: (text, action) => setToast({ text, id: Date.now(), action }),
    cheer: liveCheer,
    setCheer: (c) => setCheerState(c ? { ...c, until: store.now() + CHEER_MS } : null),
    covered,
    showIntro: () => {
      dropSheet();
      setIntro(true);
    },
    motion,
    setMotion: (m) => {
      updateLocal(store.now(), (l) => {
        l.magic = m;
      });
      setMotionState(m);
    },
  };
  const closeIntro = () => {
    setIntro(false);
    updateLocal(store.now(), (l) => {
      l.introDone = true;
    });
  };

  // «Назад» на телефоне закрывает знакомство или лист, из раздела Летописи ведёт к списку разделов,
  // с других разделов в Лагерь, и только из Лагеря без открытых листов выходит из приложения.
  const inSection = screen === 'notes' && section !== null;
  useBackButton((covered ? 1 : 0) + (screen !== 'camp' ? 1 : 0) + (inSection ? 1 : 0), () => {
    if (intro) closeIntro();
    else if (sheetShown.current) (sheetBack() ?? closeSheet)();
    else if (inSection) ui.openSection(null);
    else if (screen !== 'camp') ui.go('camp');
  });
  return (
    <div class="app">
      <main class="screen" inert={covered} ref={main}>
        {screen === 'camp' && <Camp ui={ui} />}
        {screen === 'plan' && <Plan ui={ui} />}
        {screen === 'realm' && <Realm ui={ui} />}
        {screen === 'notes' && <NotesScreen ui={ui} />}
        {screen === 'settings' && <Settings ui={ui} />}
      </main>
      <Notices ui={ui} covered={covered} />
      <nav class="tabbar" aria-label="Разделы" inert={covered}>
        <TabButton icon="campfire" label={W.camp} active={screen === 'camp'} onClick={() => ui.go('camp')} />
        <TabButton icon="sunrise" label="План" active={screen === 'plan'} onClick={() => ui.go('plan')} />
        <button class="tab-add" aria-label="Добавить задачу" onClick={() => ui.open({ kind: 'add' })}>
          <span>
            <LIcon name="plus" size={22} stroke={2.6} />
          </span>
        </button>
        <TabButton icon="kingdom" label={W.realm} active={screen === 'realm'} onClick={() => ui.go('realm')} />
        <TabButton icon="scroll" label={W.chronicle} active={screen === 'notes'} onClick={() => ui.go('notes')} />
        <TabButton icon="gear" label={W.settings} active={screen === 'settings'} onClick={() => ui.go('settings')} />
      </nav>
      {sheet && (
        <SheetLayer key={sheetKey} closing={closing}>
          <Sheets ui={ui} sheet={sheet} />
        </SheetLayer>
      )}
      {intro && <Intro onDone={closeIntro} />}
      <MagicLayers />
      {/* Живая область есть всегда: экранный диктор надёжнее читает текст, который появился в ней, чем новый блок.
          Вместе с сообщением он прочтёт и кнопку «Вернуть», если она есть. */}
      <div role="status">
        {toast && (
          <div class={`toast${toast.action ? ' toast-act' : ''}`} key={toast.id}>
            {toast.text}
            {toast.action && (
              <button
                class="toast-btn"
                onClick={() => {
                  toast.action?.run();
                  setToast(null);
                }}
              >
                {toast.action.label}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function TabButton(p: { icon: 'campfire' | 'sunrise' | 'kingdom' | 'scroll' | 'gear'; label: string; active: boolean; onClick: () => void }) {
  return (
    <button class={`tab${p.active ? ' is-active' : ''}`} aria-current={p.active ? 'page' : undefined} onClick={p.onClick}>
      {p.icon === 'gear' ? <LIcon name="gear" size={22} /> : <GIcon name={p.icon} size={24} />}
      {p.label}
    </button>
  );
}
