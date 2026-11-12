// Экран дня: сцена лагеря сверху, лист с текущей задачей и планом снизу. Всё на одном экране.
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { EMBER_EVERY, EMBER_XP, HOUR, MANA_LOW, MANA_MAX, MANA_REST_PER_HOUR, RESTED_XP_BONUS, SPARK_AFTER, SPARK_XP, estimateOf, heroLevel } from '../game/rules';
import {
  canSecondWind,
  complete,
  confirmWorking,
  dismissIdle,
  embersOf,
  findQuest,
  isStarted,
  isUndead,
  pause,
  reopenDay,
  restedLeft,
  resume,
  secondWind,
  spentNow,
  start,
  toggleBreak,
  undoComplete,
} from '../game/state';
import { addDays, formatClock, formatDate, formatDuration, formatMinutes, formatSpent, formatTimer, formatTimerSeconds, minutesOfDay } from '../game/time';
import { meetingsOn } from '../game/calendar';
import { canBuy, goalOf, shortOf, unlockedBy } from '../game/shop';
import type { State, Task } from '../game/types';
import { campView, type CampView, type Tone } from '../game/view';
import { CLASS_AT, CLASS_BY_LEVEL, SHIFT_NAME, W, goldText } from '../game/words';
import { SCENE, SCENE_H, SCENE_W, assetUrl } from '../scene/scene';
import type { Ui } from './App';
import { openCalendar, tomorrowNews } from './Calendar';
import { useSize } from './hooks';
import { GIcon, LIcon } from './Icon';
import { interrupt } from './magic/engine';
import { done, kindle, rest, summon, wind } from './magic/spells';
import { campShown, dusk, lightNow } from './magic/world';
import { LevelMark, SpentMark, TaskMeta, numLook } from './parts';
import { Scene } from './Scene';
import { dragHeight, snapUp } from './shade';
import { syncTrouble } from './SyncPanel';

export function Camp({ ui }: { ui: Ui }) {
  const { store, now } = ui;
  const s = store.state;
  const v = campView(s, now, ui.cheer?.taskId ?? null);
  const current = v.current;
  const spent = current ? spentNow(s, current, now) : 0;
  const timer = current ? formatTimer(spent) : null;

  const [rootRef, root] = useSize<HTMLDivElement>();
  const [wrapRef, wrap] = useSize<HTMLDivElement>();
  const sheetRef = useRef<HTMLElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const rowsRef = useRef<HTMLDivElement>(null);
  const doneRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<HTMLButtonElement>(null);
  const [fixedH, setFixedH] = useState(0);

  // Шторка: свёрнутая стоит под сценой, как раньше; развёрнутая поднимается поверх сцены со всеми задачами дня.
  // ui.shade говорит, куда она едет; up держит развёрнутый вид, пока она уезжает вниз; drag, пока её тянут.
  const [up, setUp] = useState(ui.shade);
  const [drag, setDrag] = useState(false);
  const [showDone, setShowDone] = useState(false);
  const isUp = ui.shade || up || drag;
  /** Высота свёрнутой шторки: на её место встаёт пустое место, пока она развёрнута, и сцена не прыгает. */
  const lowH = useRef(0);
  const wasUp = useRef(false);

  useLayoutEffect(() => {
    if (isUp) return;
    const sh = sheetRef.current?.getBoundingClientRect().height ?? 0;
    const rh = rowsRef.current?.getBoundingClientRect().height ?? 0;
    lowH.current = sh;
    const f = Math.round(sh - rh);
    if (Math.abs(f - fixedH) > 1) setFixedH(f);
  });

  // Искра и угольки приходят сами, пока идёт таймер: о них говорят сообщением, а магия несёт опыт к уровню.
  const seen = useRef(new Map<string, string>());
  const fireKey = current ? `${current.sparkDay === s.day ? 's' : '-'}${embersOf(current, spent)}` : '';
  useEffect(() => {
    if (!current) return;
    const was = seen.current.get(current.id);
    seen.current.set(current.id, fireKey);
    if (was === undefined || was === fireKey) return;
    if (was[0] !== 's' && fireKey[0] === 's') {
      ui.toast(`Искра зажглась: +${SPARK_XP} опыта за старт`);
      kindle(SPARK_XP);
    } else if (Number(fireKey.slice(1)) > Number(was.slice(1))) {
      kindle(EMBER_XP);
    }
  }, [current?.id, fireKey]);

  // Магия жизни лагеря: новая нежить, письмо и спутники показываются, когда лагерь видно без листа.
  useLayoutEffect(() => campShown(v, ui.covered));

  // Сумерки: свет меняется со временем. Заклинание зовётся до перерисовки, пока на сцене прежний свет.
  useEffect(() => {
    let light = lightNow(store.state, store.now());
    return store.subscribe(() => {
      const next = lightNow(store.state, store.now());
      if (next === light) return;
      light = next;
      dusk(next);
    });
  }, [store]);

  const compact = root.h > 0 && root.h < 700;
  const rowH = compact ? 40 : 44;
  // Сцене оставляем столько, чтобы все фигуры с номерами были видны почти во всю ширину экрана.
  // На низком экране она уменьшается сильнее (sceneBox), чтобы под ней уместилась ещё строка плана.
  const contentH = (CONTENT.bottom - CONTENT.top) * (root.w / SCENE_W) * (compact ? COMPACT_SCALE : ROW_SCALE);
  const sceneMin = Math.max(170, Math.round(contentH + TOPBAR_H + BADGE_H));
  const fit = Math.max(1, Math.min(5, Math.floor((root.h - fixedH - sceneMin) / rowH)));
  // Задача из карточки «Дальше» в списке не повторяется.
  const nextInCard = !v.asleep && !ui.cheer && !v.onBreak && !current;
  const list = nextInCard ? v.main.slice(1) : v.main;
  const cut = list.length > fit ? list.slice(0, fit - 1) : list;
  const hidden = list.length - cut.length;
  const shown = isUp ? list : cut;
  // Тянуть есть что, если в свёрнутой шторке не все задачи дня или за день уже что-то сделано.
  const canOpen = !v.asleep && (hidden > 0 || v.doneToday > 0);

  /** Выше шторка не поднимается: над ней остаётся верхняя полоса с датой, золотом и маной. */
  const highMax = () => {
    const rootEl = rootRef.current;
    if (!rootEl) return lowH.current;
    const top = rootEl.getBoundingClientRect().top;
    const bar = wrapRef.current?.querySelector('.topbar')?.getBoundingClientRect().bottom ?? top + TOPBAR_H;
    return Math.max(lowH.current, rootEl.clientHeight - (bar - top) - SHADE_GAP);
  };
  /** Развёрнутая шторка ровно по содержимому, но не выше highMax. */
  const highH = () => {
    const el = sheetRef.current;
    const body = bodyRef.current;
    if (!el || !body) return highMax();
    const pad = parseFloat(getComputedStyle(el).paddingBottom) || 0;
    return Math.max(lowH.current, Math.min(highMax(), body.offsetTop + body.scrollHeight + pad));
  };

  const setShade = (next: boolean) => {
    if (next && !isUp) lowH.current = sheetRef.current?.getBoundingClientRect().height ?? lowH.current;
    ui.setShade(next);
  };

  // Развернуть нечего (отбой, все дела видны и ничего не сделано): шторка сворачивается сама.
  useEffect(() => {
    if (!canOpen && ui.shade) ui.setShade(false);
  }, [canOpen, ui.shade]);

  // Свёрнутую шторку ещё показываем развёрнутой, пока она уезжает вниз.
  useEffect(() => {
    if (ui.shade) {
      setUp(true);
      return;
    }
    if (!up || drag) return;
    const id = window.setTimeout(
      () => {
        setUp(false);
        setShowDone(false);
      },
      ui.motion === 'off' ? 0 : SHADE_MS,
    );
    return () => window.clearTimeout(id);
  }, [ui.shade, up, drag, ui.motion]);

  // Высоту развёрнутой шторки ставим сами: от свёрнутой к нужной, и CSS её плавно ведёт.
  useLayoutEffect(() => {
    const el = sheetRef.current;
    const was = wasUp.current;
    wasUp.current = isUp;
    if (!el || drag) return;
    if (!isUp) {
      el.style.height = '';
      // Фокус был на строке, которой в свёрнутой шторке нет: он встаёт на ручку.
      if (was && (document.activeElement === document.body || !document.activeElement)) handleRef.current?.focus();
      return;
    }
    if (!was) {
      el.style.height = `${lowH.current}px`;
      void el.offsetHeight;
    }
    el.style.height = `${ui.shade ? highH() : lowH.current}px`;
  });

  // Сделанные задачи раскрылись внизу: подвинуть список, чтобы их было видно.
  useEffect(() => {
    if (showDone && ui.shade) doneRef.current?.scrollIntoView({ block: 'nearest', behavior: ui.motion === 'full' ? 'smooth' : 'auto' });
  }, [showDone, ui.shade]);

  const toggleDone = () => {
    if (!ui.shade) {
      setShowDone(true);
      setShade(true);
    } else setShowDone((d) => !d);
  };

  // Пальцем шторку тянут за любое место: вверх из свёрнутой, вниз из развёрнутой, когда её список
  // прокручен к началу. Мышью тянут за ручку. Отпущенная, она встаёт к ближайшему положению.
  const live = useRef({ canOpen, shade: ui.shade, isUp });
  live.current = { canOpen, shade: ui.shade, isUp };
  /** Только что тянули: нажатие, которым закончилось движение, не открывает задачу. */
  const dragged = useRef(false);
  const grab = useRef<{ y: number; x: number; h: number; low: number; high: number; inBody: boolean; on: boolean | null; ly: number; lt: number; v: number } | null>(null);

  const dragStart = (x: number, y: number, target: EventTarget | null) => {
    const el = sheetRef.current;
    if (!el || !live.current.canOpen) return;
    const h = el.getBoundingClientRect().height;
    if (!live.current.isUp) lowH.current = h;
    grab.current = {
      y,
      x,
      h,
      low: lowH.current,
      high: live.current.isUp ? highH() : highMax(),
      inBody: !!bodyRef.current && target instanceof Node && bodyRef.current.contains(target),
      on: null,
      ly: y,
      lt: performance.now(),
      v: 0,
    };
  };
  /** Вернёт true, если шторку тянут и движение пальца надо забрать у прокрутки. */
  const dragMove = (x: number, y: number): boolean => {
    const g = grab.current;
    const el = sheetRef.current;
    if (!g || !el) return false;
    const dy = y - g.y;
    if (g.on === null) {
      const body = bodyRef.current;
      const atTop = !body || body.scrollTop <= 0;
      // Из развёрнутой вниз тянут, только когда список у начала; вверх её список прокручивается.
      const could = !live.current.shade ? dy <= 0 : !g.inBody || (dy >= 0 && atTop);
      if (Math.abs(dy) < DRAG_SLOP && Math.abs(x - g.x) < DRAG_SLOP) return could;
      if (!could || Math.abs(x - g.x) > Math.abs(dy)) {
        grab.current = null;
        return false;
      }
      g.on = true;
      el.style.height = `${g.h}px`;
      setDrag(true);
    }
    const now = performance.now();
    if (now > g.lt) g.v = 0.6 * ((y - g.ly) / (now - g.lt)) + 0.4 * g.v;
    g.ly = y;
    g.lt = now;
    el.style.height = `${dragHeight(g.h, dy, g.low, g.high)}px`;
    return true;
  };
  const dragEnd = () => {
    const g = grab.current;
    grab.current = null;
    const el = sheetRef.current;
    if (!g || !g.on || !el) return;
    dragged.current = true;
    window.setTimeout(() => (dragged.current = false), 400);
    const open = snapUp(el.getBoundingClientRect().height, g.v, g.low, g.high);
    setDrag(false);
    ui.setShade(open);
  };

  useEffect(() => {
    const el = sheetRef.current;
    if (!el) return;
    const start = (e: TouchEvent) => {
      if (e.touches.length === 1) dragStart(e.touches[0].clientX, e.touches[0].clientY, e.target);
      else grab.current = null;
    };
    const move = (e: TouchEvent) => {
      if (e.touches.length === 1 && dragMove(e.touches[0].clientX, e.touches[0].clientY) && e.cancelable) e.preventDefault();
    };
    el.addEventListener('touchstart', start, { passive: true });
    el.addEventListener('touchmove', move, { passive: false });
    el.addEventListener('touchend', dragEnd);
    el.addEventListener('touchcancel', dragEnd);
    return () => {
      el.removeEventListener('touchstart', start);
      el.removeEventListener('touchmove', move);
      el.removeEventListener('touchend', dragEnd);
      el.removeEventListener('touchcancel', dragEnd);
    };
  }, []);

  const handleDown = (e: PointerEvent) => {
    if (e.pointerType === 'touch' || e.button !== 0) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragStart(e.clientX, e.clientY, e.currentTarget);
  };
  const handleMove = (e: PointerEvent) => {
    if (e.pointerType !== 'touch') dragMove(e.clientX, e.clientY);
  };
  const handleUp = (e: PointerEvent) => {
    if (e.pointerType !== 'touch') dragEnd();
  };

  const box = sceneBox(wrap.w, wrap.h);
  const bg = SCENE.backgrounds[v.light] ?? SCENE.backgrounds.day;

  return (
    <div class={`camp${compact ? ' is-compact' : ''}`} ref={rootRef}>
      <h1 class="sr-only">{W.camp}</h1>
      {/* Картинки поляны не ловят пальца, а меню по долгому нажатию в сцене не открывается совсем. */}
      <div class="scene-wrap" ref={wrapRef} inert={isUp} onContextMenu={(e) => e.preventDefault()}>
        {box.gaps && bg && <img class="scene-blur" src={assetUrl(bg)} alt="" aria-hidden="true" draggable={false} />}
        <div class="scene-box" style={box.style}>
          <Scene
            view={v}
            timer={v.running || (current && !v.onBreak) ? timer : null}
            onTask={(id) => ui.open({ kind: 'task', taskId: id })}
            onLetters={() => ui.open({ kind: 'letters' })}
            unit={box.unit}
          />
        </div>
        <TopBar ui={ui} v={v} />
        {/* Нижняя полоса сцены: слева «ещё у костра», справа мысль и календарь. Одна строка, чтобы они не наезжали друг на друга. */}
        <div class="camp-bottom">
          {(v.extraSeated > 0 || v.extraRoad > 0) && (
            <button class="scene-more" onClick={() => ui.go('plan')}>
              <span>
                {v.extraSeated > 0 && `ещё ${v.extraSeated} у костра`}
                {v.extraSeated > 0 && v.extraRoad > 0 && ' · '}
                {v.extraRoad > 0 && 'на дороге туман'}
              </span>
            </button>
          )}
          {/* Быстрая мысль, чтобы записать, не уходя из лагеря, и рядом ближайшее событие. */}
          <div class="camp-book">
            <button class="chip camp-book-btn" aria-label="Записать мысль" title="Записать мысль" onClick={() => ui.open({ kind: 'thought' })}>
              <LIcon name="bulb" size={18} />
            </button>
            <CalendarChip ui={ui} />
          </div>
        </div>
      </div>

      {/* Пока шторка развёрнута, она лежит поверх сцены, а на её прежнем месте пусто. Нажатие на сцену её сворачивает. */}
      {isUp && <div class="sheet-space" style={{ height: `${Math.max(0, lowH.current - SHEET_OVERLAP)}px` }} />}
      {isUp && <div class={`shade-dim${ui.shade ? ' is-on' : ''}`} aria-hidden="true" onClick={() => ui.setShade(false)} />}
      <section
        class={`sheet${isUp ? ' is-up' : ''}${drag ? ' is-dragging' : ''}`}
        ref={sheetRef}
        aria-label="Задачи дня"
        onClickCapture={(e) => {
          if (!dragged.current) return;
          dragged.current = false;
          e.preventDefault();
          e.stopPropagation();
        }}
      >
        {canOpen ? (
          <button
            class="sheet-grip"
            ref={handleRef}
            aria-label="Все задачи дня"
            aria-expanded={ui.shade}
            aria-controls="day-tasks"
            onClick={() => setShade(!ui.shade)}
            onPointerDown={handleDown}
            onPointerMove={handleMove}
            onPointerUp={handleUp}
            onPointerCancel={handleUp}
          >
            <span class="sheet-handle" />
          </button>
        ) : (
          <div class="sheet-grip" aria-hidden="true">
            <span class="sheet-handle" />
          </div>
        )}
        <div class="sheet-body" id="day-tasks" ref={bodyRef}>
          {v.summaryDue && (
            <button class="banner" onClick={() => ui.open({ kind: 'summary' })}>
              <GIcon name="zzz" size={16} />
              Скоро отбой: подвести итоги дня
              <LIcon name="chevron" size={16} />
            </button>
          )}
          {!v.asleep && restedLeft(s) > 0 && <RestedHint left={restedLeft(s)} />}
          <MainCard ui={ui} v={v} timer={timer} seconds={current ? formatTimerSeconds(spent) : ''} />

          {!v.asleep && (list.length > 0 || v.doneToday > 0) && (
            <div class="list-head">
              <h2 class="sc">{W.moreToday}</h2>
              {v.doneToday > 0 && (
                <button class="list-done" aria-expanded={isUp && showDone} aria-controls="day-done" onClick={toggleDone}>
                  <GIcon name="check" size={13} />
                  {v.doneToday} сделано
                </button>
              )}
            </div>
          )}
          <div ref={rowsRef}>
            {!v.asleep &&
              shown.map((t) => (
                <TaskRow
                  key={t.id}
                  s={s}
                  t={t}
                  n={v.numbers.get(t.id) ?? 0}
                  tone={v.tones.get(t.id) ?? 'today'}
                  color={v.colors.get(t.id)}
                  onClick={() => ui.open({ kind: 'task', taskId: t.id })}
                />
              ))}
            {!v.asleep && !isUp && hidden > 0 && (
              <button class="row row-more" aria-controls="day-tasks" aria-expanded={false} onClick={() => setShade(true)}>
                <span class="row-title">Ещё {hidden} в плане дня</span>
                <LIcon name="chevron" size={16} />
              </button>
            )}
          </div>
          {!v.asleep && v.later.length > 0 && (
            <button class="row row-later" onClick={() => ui.go('plan')}>
              <span class="num-stack" aria-hidden="true">
                {v.later.slice(0, 2).map((t) => (
                  <span key={t.id} {...numLook('evening', v.colors.get(t.id), 'num-sm')}>
                    {v.numbers.get(t.id)}
                  </span>
                ))}
              </span>
              <span class="row-title row-muted">
                {W.evening}: {v.later.map((t) => t.title).join(', ')}
              </span>
              <LIcon name="chevron" size={16} />
            </button>
          )}
          {isUp && showDone && v.done.length > 0 && (
            <div id="day-done" class="done-rows" ref={doneRef}>
              <h3 class="sr-only">Сделано сегодня</h3>
              {v.done.map((t) => (
                <button key={t.id} class="row row-done" onClick={() => ui.open({ kind: 'task', taskId: t.id })}>
                  <span class="done-mark" aria-hidden="true">
                    <GIcon name="check" size={13} />
                  </span>
                  <span class="row-title">{t.title}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

/** Лист заходит на сцену скруглённым краем. */
const SHEET_OVERLAP = 22;
/** Столько шторка задач дня едет вверх или вниз (как transition у .sheet.is-up в styles.css). */
const SHADE_MS = 260;
/** Зазор над развёрнутой шторкой под верхней полосой. */
const SHADE_GAP = 10;
/** Палец сдвинулся на столько, и понятно, тянут шторку или нажимают. */
const DRAG_SLOP = 8;
/** Нижний край верхней полосы с датой, золотом и маной. */
const TOPBAR_H = 42;
/** Номер над макушкой вместе с хвостиком, в пикселях экрана: от масштаба сцены не зависит. */
const BADGE_H = 40;

/** Что на картинке должно быть видно: от макушки самого дальнего скелета на дороге до ног тех, кто сидит впереди. */
const CONTENT = (() => {
  let top = SCENE_H;
  for (const sp of Object.values(SCENE.sprites)) if (sp.head) top = Math.min(top, sp.head[1]);
  const bottom = Math.max(...Object.values(SCENE.spots).map((p) => p[1])) + 12;
  return { top: Math.max(0, top), bottom: Math.min(SCENE_H, bottom) };
})();

/** Насколько сцена может уменьшиться ради строки плана: на обычном экране и на низком. */
const ROW_SCALE = 0.95;
const COMPACT_SCALE = 0.8;
/** Меньше сцена не становится: фигуры должны оставаться различимыми. */
const MIN_SCALE = 0.62;

/**
 * Картинка сцены покрывает место над листом (h; нижние SHEET_OVERLAP из них под краем листа). Если
 * нужная часть не помещается между верхней полосой и листом, картинка уменьшается, а по бокам
 * проступает размытый фон (gaps). Лишнее срезается так, чтобы нужная часть встала посередине.
 */
function sceneBox(w: number, h: number): { style: preact.JSX.CSSProperties; gaps: boolean; unit?: number } {
  if (!w || !h) return { style: { width: '100%', aspectRatio: `${SCENE_W} / ${SCENE_H}` }, gaps: false };
  const ratio = SCENE_H / SCENE_W;
  // Между этими линиями экрана должна встать нужная часть картинки.
  const from = TOPBAR_H + BADGE_H;
  const to = h - SHEET_OVERLAP;
  const coverW = Math.max(w, h / ratio);
  const fitW = ((to - from) / (CONTENT.bottom - CONTENT.top)) * SCENE_W;
  const boxW = Math.max(w * MIN_SCALE, Math.min(coverW, fitW));
  const boxH = boxW * ratio;
  const k = boxH / SCENE_H;
  const want = (from + to) / 2 - ((CONTENT.top + CONTENT.bottom) / 2) * k;
  // Сначала стараемся обойтись без пустот, но нужная часть важнее: номера не уходят под верхнюю полосу.
  const minTop = from - CONTENT.top * k;
  const maxTop = to - CONTENT.bottom * k;
  let top = Math.min(0, Math.max(h - boxH, want));
  top = minTop > maxTop ? minTop : Math.min(maxTop, Math.max(minTop, top));
  const gaps = boxW < w - 0.5 || top > 0.5 || top + boxH < h - 0.5;
  return { style: { width: `${boxW}px`, height: `${boxH}px`, left: `${(w - boxW) / 2}px`, top: `${top}px` }, gaps, unit: k };
}

function TopBar({ ui, v }: { ui: Ui; v: CampView }) {
  const { now } = ui;
  const s = ui.store.state;
  const mana = Math.round(s.hero.mana);
  const lvl = heroLevel(s.hero.xp);
  return (
    <div class="topbar">
      <div class="chip chip-date">
        <GIcon name={v.light === 'night' ? 'zzz' : v.light === 'evening' ? 'sunset' : 'sun'} size={15} class="ic-sun" />
        <span class="chip-day" aria-hidden="true">
          {formatDate(s.day).split(',')[0]}
        </span>
        <span aria-hidden="true">{formatClock(now)}</span>
        <span class="chip-shift" aria-hidden="true">
          {SHIFT_NAME[v.asleep ? 'night' : v.shift]}
        </span>
        <span class="sr-only">{`${formatDate(s.day)}, ${formatClock(now)}, ${SHIFT_NAME[v.asleep ? 'night' : v.shift]}`}</span>
      </div>
      <SyncBadge ui={ui} />
      <button class="chip chip-gold" data-magic="gold" title={W.shop} onClick={() => ui.go('shop')}>
        <GIcon name="coins" size={17} />
        <span aria-hidden="true" data-magic="gold-n" data-v={s.hero.gold}>
          {s.hero.gold.toLocaleString('ru-RU')}
        </span>
        <span class="chip-level" aria-hidden="true" data-magic="level">
          ур.{' '}
          <span data-magic="level-n" data-v={lvl.level}>
            {lvl.level}
          </span>
        </span>
        <span class="sr-only">{`${W.shop}. ${W.gold}: ${s.hero.gold}, уровень героя ${lvl.level}`}</span>
      </button>
      <div class={`chip chip-mana${v.onBreak ? ' is-regen' : ''}`} data-magic="mana">
        <span class="mana-gem" aria-hidden="true" />
        <span class="bar" aria-hidden="true">
          <span style={{ width: `${(mana / MANA_MAX) * 100}%` }} />
        </span>
        <span aria-hidden="true" data-magic="mana-n" data-v={mana}>
          {mana}
        </span>
        <span class="sr-only">{`${W.mana}: ${mana} из ${MANA_MAX}`}</span>
      </div>
      <button class="chip chip-gear" aria-label={W.settings} title={W.settings} onClick={() => ui.go('settings')}>
        <LIcon name="gear" size={18} />
      </button>
    </div>
  );
}

/**
 * Календарь над задачами. Если сегодня ещё будет встреча со временем, на кнопке её час, чтобы не забыть.
 * Иначе только значок, а диктор слышит, что стоит на завтра.
 */
function CalendarChip({ ui }: { ui: Ui }) {
  const s = ui.store.state;
  const nowAt = formatMinutes(Math.min(minutesOfDay(ui.now), 24 * 60 - 1)).padStart(5, '0');
  const next = meetingsOn(s, s.day).find((m) => m.at && m.at >= nowAt);
  const label = next ? `Календарь: сегодня в ${next.at!.replace(/^0/, '')} ${next.title}` : `Календарь. ${tomorrowNews(s)}`;
  return (
    <button class="chip camp-book-btn" aria-label={label} title={label} onClick={() => openCalendar(ui, next ? s.day : addDays(s.day, 1))}>
      <LIcon name="calendar" size={18} />
      {next && <span aria-hidden="true">{next.at!.replace(/^0/, '')}</span>}
    </button>
  );
}

/** Значок в верхней полосе, пока игра не сохраняется в GitHub. Открывает, что случилось и что делать. */
function SyncBadge({ ui }: { ui: Ui }) {
  const trouble = syncTrouble(ui.sync, ui.now);
  if (!trouble) return null;
  const label = trouble === 'stale' ? 'Нет связи с GitHub: последние действия ещё не сохранены там' : 'Игра не сохраняется в GitHub';
  return (
    <button
      class={`chip chip-alert${trouble === 'error' ? '' : ' is-mild'}`}
      aria-label={label}
      title={label}
      onClick={() => ui.open(ui.sync.status.phase === 'conflict' ? { kind: 'syncConflict' } : { kind: 'sync' })}
    >
      <LIcon name="cloudAlert" size={19} />
    </button>
  );
}

/** «Позвать к огню», на узком экране короче, чтобы не переносилось. */
export function CallLabel() {
  return (
    <>
      <span class="lbl-long">{W.callToFire}</span>
      <span class="lbl-short" aria-hidden="true">
        {W.callToFireShort}
      </span>
    </>
  );
}

function MainCard({ ui, v, timer, seconds }: { ui: Ui; v: CampView; timer: string | null; seconds: string }) {
  const { store, now } = ui;
  const s = store.state;

  if (v.asleep) {
    const l = s.log[s.day];
    return (
      <div class="card">
        <div class="card-head">
          <GIcon name="zzz" size={18} class="ic-gold" />
          <h2 class="sc">Отряд спит</h2>
        </div>
        <div class="card-title">Доброй ночи</div>
        <div class="card-sub">
          Сегодня сделано <Num k="night-done" v={l?.done ?? 0} />, золота +<Num k="night-gold" v={l?.gold ?? 0} />, опыта +<Num k="night-xp" v={l?.xp ?? 0} />. Завтра силы снова будут полны.
        </div>
        <div class="btns">
          <button class="btn btn-ghost" onClick={() => store.act((st) => reopenDay(st))}>
            {W.notSleeping}
          </button>
        </div>
      </div>
    );
  }

  const cheer = ui.cheer;
  if (cheer) {
    const t = s.tasks.find((x) => x.id === cheer.taskId);
    const next = v.current ?? v.main[0] ?? v.later[0] ?? null;
    const r = cheer.result;
    return (
      <div class="card card-done">
        <div class="card-head">
          <GIcon name="check" size={18} class="ic-green" />
          <h2 class="sc">Сделано!</h2>
          <button class="link-btn" onClick={() => {
            interrupt();
            store.act((st) => undoComplete(st, cheer.taskId));
            ui.setCheer(null);
            ui.toast('Задача снова в плане');
          }}>
            <LIcon name="undo" size={14} />
            Вернуть
          </button>
        </div>
        {t && <div class="card-title card-title-sm">{t.title}</div>}
        <div class="rewards">
          <span class="rw rw-gold" data-magic="rw-gold">
            <GIcon name="coins" size={15} />+{r.reward.gold} золота
          </span>
          <span class="rw rw-xp" data-magic="rw-xp">
            +{r.reward.xp} опыта
          </span>
          {r.lair && (
            <span class="rw rw-lair" data-magic="rw-lair">
              <span aria-hidden="true">
                {W.lair} {r.lair.before} → {r.lair.after}
              </span>
              <span class="sr-only">
                {W.lair}: было {r.lair.before}, стало {r.lair.after}
              </span>
            </span>
          )}
          {r.undead && <span class="rw rw-lair">нежить упокоена{r.reward.undeadXp ? `, +${r.reward.undeadXp} опыта сверху` : ''}</span>}
          {r.reward.restedXp ? <span class="rw rw-lair">отдохнувший герой: +{r.reward.restedXp} опыта</span> : null}
        </div>
        <ShopHint ui={ui} gain={r.reward.gold} />
        {next ? (
          <>
            <div class="next">
              <span class="next-label">Дальше:</span>
              <span {...numLook(v.tones.get(next.id) === 'undead' ? 'undead' : 'today', v.colors.get(next.id), 'num-sm')} aria-hidden="true">
                {v.numbers.get(next.id)}
              </span>
              <span class="next-title">{next.title}</span>
            </div>
            <div class="btns">
              <button class="btn btn-gold" onClick={() => callToFire(ui, next)}>
                <GIcon name="campfire" size={18} />
                {next.id === v.current?.id || isStarted(s, next) ? W.resume : <CallLabel />}
              </button>
              <button class="btn btn-ghost" onClick={() => toggleRest(ui)}>
                {W.rest}
              </button>
            </div>
          </>
        ) : (
          <div class="btns">
            <button class="btn btn-ghost" onClick={() => ui.setCheer(null)}>
              Отлично
            </button>
            <button class="btn btn-ghost" onClick={() => ui.go('plan')}>
              Собрать ещё
            </button>
          </div>
        )}
      </div>
    );
  }

  if (v.onBreak) {
    const mana = s.hero.mana;
    const fullAt = now + ((MANA_MAX - mana) / MANA_REST_PER_HOUR) * HOUR;
    const restMin = Math.floor((now - (s.breakSince ?? now)) / 60_000);
    return (
      <div class="card card-break">
        <div class="card-head">
          <GIcon name="campfire" size={18} class="ic-fire" />
          <h2 class="sc">Привал</h2>
          <span class="card-head-right">{formatDuration(restMin)}</span>
        </div>
        <div class="card-title">Отряд отдыхает у огня</div>
        <div class="card-sub">
          {mana >= MANA_MAX ? 'Мана полна, можно в путь.' : `Мана растёт на ${MANA_REST_PER_HOUR} в час, полной станет к ${formatClock(fullAt)}.`}
          {v.current && ` Ждёт: ${v.current.title}.`}
        </div>
        <SecondWind ui={ui} />
        <div class="btns btns-one">
          <button class="btn btn-gold" data-rest onClick={() => toggleRest(ui)}>
            {W.backOnRoad}
          </button>
        </div>
      </div>
    );
  }

  if (v.idle && v.current) {
    const since = s.current?.idleSince ?? now;
    return (
      <div class="card">
        <div class="card-head">
          <GIcon name="hourglass" size={16} class="ic-gold" />
          <h2 class="sc">Ты ещё у огня?</h2>
        </div>
        <div class="card-title card-title-sm">{v.current.title}</div>
        <div class="card-sub">В игру долго не заглядывали, и таймер встал в {formatClock(since)}. Если работа всё это время шла, нажми «{W.stillWorking}»: эти минуты вернутся в задачу.</div>
        <div class="btns">
          <button class="btn btn-gold" onClick={() => store.act((st, n) => confirmWorking(st, n))}>
            {W.stillWorking}
          </button>
          <button class="btn btn-ghost" onClick={() => store.act((st) => dismissIdle(st))}>
            {W.notWorking}
          </button>
        </div>
      </div>
    );
  }

  const cur = v.current;
  if (cur) {
    const q = findQuest(s, cur.questId);
    const est = estimateOf(cur);
    const spent = spentNow(s, cur, now);
    const progress = est ? Math.min(1, spent / (est * 60_000)) : 0;
    const estText = est ? `из ~${formatDuration(est)}` : 'несколько дней';
    const cls = CLASS_BY_LEVEL[cur.level];
    return (
      <div class="card">
        <div class="card-head">
          <span {...numLook('current', v.colors.get(cur.id), 'num-sm')} aria-hidden="true">
            {v.numbers.get(cur.id)}
          </span>
          <h2 class="sc">{W.nowAtFire}</h2>
        </div>
        <button class="card-title-btn" onClick={() => ui.open({ kind: 'task', taskId: cur.id })}>
          <span class="card-title">{cur.title}</span>
        </button>
        <div class="card-sub">
          {q ? q.name : W.noSphere} · <LevelMark level={cur.level} /> · {CLASS_AT[cls]}
        </div>
        {cur.cue && !cur.sparkDay && <Cue text={cur.cue} />}
        <div class="timer">
          <GIcon name="hourglass" size={16} class="ic-gold" />
          <span class="timer-val">
            {timer}
            <small>{seconds}</small>
          </span>
          <button class="timer-est" aria-label={`${estText}, изменить длительность`} onClick={() => ui.open({ kind: 'duration', taskId: cur.id })}>
            {estText}
            <LIcon name="edit" size={13} />
          </button>
          {est && (
            <span class="bar bar-gold" aria-hidden="true">
              <span style={{ width: `${progress * 100}%` }} />
            </span>
          )}
        </div>
        <FireLine s={s} t={cur} now={now} spent={spent} running={v.running} />
        {v.running && s.hero.mana < MANA_LOW && <div class="hint">Силы на исходе: самое время для привала.</div>}
        <SecondWind ui={ui} />
        <div class="btns btns-three btns-fire">
          <button class="btn btn-gold" onClick={() => finish(ui, cur)}>
            <GIcon name="check" size={17} />
            {W.done}
          </button>
          {v.running ? (
            <button class="btn btn-ghost" data-pause onClick={() => pauseHere(ui)}>
              <LIcon name="pause" size={16} stroke={2.6} />
              {W.pause}
            </button>
          ) : (
            <button class="btn btn-ghost" data-pause onClick={() => backToWork(ui)}>
              <LIcon name="play" size={16} />
              {W.resume}
            </button>
          )}
          <button class="btn btn-ghost" data-rest onClick={() => toggleRest(ui)}>
            <GIcon name="campfire" size={19} class="ic-fire" />
            {W.rest}
          </button>
        </div>
      </div>
    );
  }

  const next = v.main[0] ?? v.later[0] ?? null;
  if (next) {
    return (
      <div class="card">
        <div class="card-head">
          <GIcon name="campfire" size={18} class="ic-fire" />
          <h2 class="sc">{W.atFireEmpty}</h2>
        </div>
        <div class="next next-big">
          <span {...numLook(v.tones.get(next.id) ?? 'today', v.colors.get(next.id), 'num-sm')} aria-hidden="true">
            {v.numbers.get(next.id)}
          </span>
          <span class="next-title">{next.title}</span>
          {isStarted(s, next) ? <SpentMark ms={next.spentMs} /> : <TaskMeta s={s} t={next} />}
        </div>
        {next.cue && !isStarted(s, next) && <Cue text={next.cue} />}
        <SecondWind ui={ui} />
        <div class="btns">
          <button class="btn btn-gold" onClick={() => callToFire(ui, next)}>
            <GIcon name="campfire" size={18} />
            {isStarted(s, next) ? W.resume : <CallLabel />}
          </button>
          <button class="btn btn-ghost" onClick={() => toggleRest(ui)}>
            {W.rest}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div class="card">
      <div class="card-head">
        <GIcon name="campfire" size={18} class="ic-fire" />
        <h2 class="sc">{v.doneToday > 0 ? 'План дня выполнен' : 'Отряд не собран'}</h2>
      </div>
      <div class="card-sub">
        {v.doneToday > 0
          ? 'Все задачи дня сделаны. Можно позвать ещё кого-то из отряда или отдохнуть.'
          : 'Позови к костру задачи на сегодня: из отряда или новые.'}
      </div>
      <div class="btns">
        <button class="btn btn-gold" onClick={() => ui.go('plan')}>
          <GIcon name="sunrise" size={18} />
          {W.plan}
        </button>
        <button class="btn btn-ghost" onClick={() => ui.open({ kind: 'add', day: s.day })}>
          <LIcon name="plus" size={16} />
          Задача
        </button>
      </div>
    </div>
  );
}

/**
 * Что уже принёс огонь, не дожидаясь «Готово»: искра за первые две минуты подряд (раз в день за задачу)
 * и уголёк за каждые 15 минут работы.
 */
function FireLine({ s, t, now, spent, running }: { s: State; t: Task; now: number; spent: number; running: boolean }) {
  const lit = t.sparkDay === s.day;
  const embers = embersOf(t, spent);
  const since = s.current?.runningSince ?? null;
  let spark: string;
  if (lit) spark = `Искра горит: +${SPARK_XP} опыта за старт`;
  else if (running && since !== null) {
    const sec = Math.ceil(Math.max(0, SPARK_AFTER - (now - since)) / 1000);
    spark = `Через ${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')} зажжётся искра: +${SPARK_XP} опыта`;
  } else spark = `Две минуты у огня, и зажжётся искра: +${SPARK_XP} опыта`;
  const nextEmber = Math.ceil((EMBER_EVERY - (spent % EMBER_EVERY)) / 60_000);
  return (
    <div class={`fire-line${lit ? ' is-lit' : ''}`}>
      <span class="fire-spark" aria-hidden="true" />
      <span>
        {spark}
        {lit && (embers > 0 ? `. Угольков: ${embers}, +${embers * EMBER_XP} опыта` : `. Первый уголёк через ${nextEmber} мин`)}
      </span>
    </div>
  );
}

/** План «если — то»: когда начать и с какого шага. */
function Cue({ text }: { text: string }) {
  return (
    <div class="cue">
      <span class="sr-only">Когда начать: </span>
      {text}
    </div>
  );
}

/** Герой вернулся после перерыва: первые дела дня дают опыт сверху. */
function RestedHint({ left }: { left: number }) {
  return (
    <div class="rested">
      <GIcon name="heart" size={15} />
      <span>
        Отдохнувший герой: ещё {left} {left === 1 ? 'дело' : left < 5 ? 'дела' : 'дел'} сегодня {RESTED_XP_BONUS === 1 ? 'с двойным опытом' : 'с опытом сверху'}
      </span>
    </div>
  );
}

/** Число итогов дня: магия досчитывает его с нуля после отбоя. */
function Num({ k, v }: { k: string; v: number }) {
  return (
    <span data-magic={k} data-v={v}>
      {v.toLocaleString('ru-RU')}
    </span>
  );
}

function SecondWind({ ui }: { ui: Ui }) {
  const s = ui.store.state;
  if (!canSecondWind(s, ui.now) || s.hero.mana >= MANA_MAX) return null;
  return (
    <button
      class="wind"
      onClick={() => {
        const before = Math.round(ui.store.state.hero.mana);
        if (!ui.store.act((st, n) => secondWind(st, n))) return;
        ui.toast('Второе дыхание: +30 маны');
        wind(before, MANA_MAX);
      }}
    >
      <GIcon name="heart" size={15} />
      {W.secondWind}: ужин или прогулка, +30 маны
    </button>
  );
}

/**
 * Строка про лавку после «Готово»: на что теперь хватает золота, а если копят на цель, сколько до неё осталось.
 * Пока в лавке нет наград, строки нет.
 */
function ShopHint({ ui, gain }: { ui: Ui; gain: number }) {
  const s = ui.store.state;
  const fresh = unlockedBy(s, gain);
  const goal = goalOf(s);
  const text = fresh ? `Теперь хватает на «${fresh.title}»` : goal && !canBuy(s, goal) ? `До «${goal.title}» осталось ${goldText(shortOf(s, goal))}` : null;
  if (!text) return null;
  return (
    <div class={`shop-hint${fresh ? ' is-ready' : ''}`} data-magic="shop-hint">
      <LIcon name="star" size={15} class="ic-gold" />
      <span class="shop-hint-text">{text}</span>
      <button class="link-btn" onClick={() => ui.go('shop')}>
        В лавку
        <LIcon name="chevron" size={15} />
      </button>
    </div>
  );
}

// Действия карточки. Состояние меняется сразу, а заклинание догоняет его, пока на экране ещё прежняя сцена.

export function callToFire(ui: Ui, t: Task): void {
  ui.setCheer(null);
  const s = ui.store.state;
  if (s.current?.taskId === t.id) return backToWork(ui);
  const mana = Math.round(s.hero.mana);
  const prev = s.current ? s.tasks.find((x) => x.id === s.current!.taskId) : undefined;
  const { switchCost } = ui.store.act((st, n) => start(st, n, t.id));
  summon(t.id, switchCost, mana);
  // Прежняя задача уходит от огня с сохранённым временем: к ней можно вернуться, и таймер продолжит.
  const left = prev && prev.id !== t.id ? ui.store.state.tasks.find((x) => x.id === prev.id) : undefined;
  const kept = left && isStarted(ui.store.state, left) ? `«${left.title}» ждёт у костра, ${formatSpent(left.spentMs)} сохранено` : null;
  const cost = switchCost ? `Смена сферы: −${switchCost} маны` : null;
  if (kept || cost) ui.toast([kept, cost].filter(Boolean).join('. '));
}

export function finish(ui: Ui, t: Task, level?: 1 | 2 | 3 | 4): void {
  const s = ui.store.state;
  const before = { gold: s.hero.gold, level: heroLevel(s.hero.xp).level };
  const result = ui.store.act((st, n) => complete(st, n, t.id, level));
  if (!result) return;
  ui.setCheer({ taskId: t.id, result, until: 0 });
  done(t.id, result, before, heroLevel(ui.store.state.hero.xp).level);
}

/** Привал или «Снова в путь». */
function toggleRest(ui: Ui): void {
  // Кнопка сменилась другой карточкой: фокус переходит на парную кнопку, а не теряется.
  const hadFocus = (document.activeElement as HTMLElement | null)?.hasAttribute('data-rest') ?? false;
  ui.setCheer(null);
  ui.store.act((st, n) => toggleBreak(st, n));
  rest(ui.store.state.breakSince !== null);
  if (hadFocus) requestAnimationFrame(() => document.querySelector<HTMLElement>('.card [data-rest]')?.focus());
}

/** Пауза: таймер стоит, задача остаётся у огня. Фокус переходит на «Продолжить», которая встала на место кнопки. */
export function pauseHere(ui: Ui): void {
  const hadFocus = (document.activeElement as HTMLElement | null)?.hasAttribute('data-pause') ?? false;
  ui.store.act((st, n) => pause(st, n));
  if (hadFocus) requestAnimationFrame(() => document.querySelector<HTMLElement>('.card [data-pause]')?.focus());
}

/** Таймер снова идёт: спутник у огня встаёт за работу. */
export function backToWork(ui: Ui): void {
  const hadFocus = (document.activeElement as HTMLElement | null)?.hasAttribute('data-pause') ?? false;
  ui.store.act((st, n) => resume(st, n));
  rest(false);
  if (hadFocus) requestAnimationFrame(() => document.querySelector<HTMLElement>('.card [data-pause]')?.focus());
}

function TaskRow({ s, t, n, tone, color, onClick }: { s: State; t: Task; n: number; tone: Tone; color: string | undefined; onClick: () => void }) {
  return (
    <button class="row" onClick={onClick}>
      <span {...numLook(tone, color, 'num-sm')} aria-hidden="true">
        {n}
      </span>
      <span class="row-title">{t.title}</span>
      {isStarted(s, t) && !isUndead(t, s.day) ? <SpentMark ms={t.spentMs} /> : <TaskMeta s={s} t={t} />}
    </button>
  );
}
