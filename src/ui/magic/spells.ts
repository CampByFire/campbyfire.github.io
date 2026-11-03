// Заклинания первого этапа: шёпоты, Победная искра, Призыв к огню, Привал и Восхождение.
// Каждое зовётся сразу после действия. Синхронная часть видит прежний экран (Preact перерисует
// его чуть позже), после nextFrame на странице уже новое состояние, а на экран оно ещё не попало.
import type { CompleteResult } from '../../game/state';
import { SCENE, SCENE_H, SCENE_W, pct } from '../../scene/scene';
import {
  EASE,
  L,
  anim,
  aside,
  calm,
  cast,
  countUp,
  drop,
  fxNode,
  hold,
  off,
  own,
  pt,
  rectIn,
  release,
  safe,
  size,
  type Spell,
} from './engine';
import { burst, flight, spiral } from './particles';

const $ = <T extends Element = HTMLElement>(sel: string, root: ParentNode | null | undefined = L.app): T | null => root?.querySelector<T>(sel) ?? null;
const $$ = <T extends Element = HTMLElement>(sel: string, root: ParentNode | null | undefined = L.app): T[] => (root ? [...root.querySelectorAll<T>(sel)] : []);
const esc = (s: string) => (typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(s) : s.replace(/["\\]/g, '\\$&'));

// ---------- сцена ----------

const scene = () => $('.scene');

/** Точка картинки сцены (780 × 840) в пикселях приложения. */
function spt(sc: Element, x: number, y: number): [number, number] {
  const r = rectIn(sc);
  return [r.x + (x / SCENE_W) * r.w, r.y + (y / SCENE_H) * r.h];
}

const fireAt = (sc: Element) => spt(sc, SCENE.fire[0], SCENE.fire[1] - 34);

const figImg = (sc: Element | null, id: string | null | undefined) => (sc && id ? $<HTMLImageElement>(`img.fig[data-task="${esc(id)}"]`, sc) : null);
const ringImg = (sc: Element | null) => (sc ? $<HTMLImageElement>('img.fig[data-art^="ring/"]', sc) : null);
const markOf = (sc: Element | null, id: string | null | undefined) => (sc && id ? $(`.fig-mark[data-task="${esc(id)}"]`, sc) : null);

/** Ноги и макушка фигуры в единицах сцены, по её картинке. */
function figPoints(img: HTMLElement): { feet: [number, number]; head: [number, number] } | null {
  const art = img.dataset.art;
  const sp = art ? SCENE.sprites[art] : undefined;
  const feet = art ? SCENE.spots[art.split('/')[0]] : undefined;
  if (!sp || !feet) return null;
  return { feet, head: sp.head ?? [sp.x + sp.w / 2, sp.y + 6] };
}

/** Середина фигуры между макушкой и ногами. */
function figCenter(sc: Element, img: HTMLElement): [number, number] {
  const p = figPoints(img);
  if (!p) return pt(img, 0.5, 0.45);
  return spt(sc, (p.head[0] + p.feet[0]) / 2, (p.head[1] + p.feet[1]) / 2);
}

/** Копия фигуры поверх сцены: настоящая уйдёт с новым состоянием, а копия растает на её месте. */
function ghostFig(sc: Element | null, img: HTMLElement | null): HTMLElement | null {
  const air = sc && $('.scene-fx', sc);
  if (!img || !air) return null;
  const g = img.cloneNode(false) as HTMLElement;
  delete g.dataset.task;
  delete g.dataset.art;
  g.classList.add('fig-ghost');
  air.append(g);
  return own(g);
}

/** Копия номера над фигурой: гаснет, пока номер встаёт на новое место. */
function ghostMark(sc: Element | null, id: string | null | undefined): HTMLElement | null {
  const m = markOf(sc, id);
  const air = sc && $('.scene-fx', sc);
  if (!m || !air) return null;
  const g = m.cloneNode(true) as HTMLElement;
  delete g.dataset.task;
  g.inert = true;
  g.classList.add('ghost-mark');
  air.append(g);
  return own(g);
}

const baseFilter = (el: Element) => {
  const f = getComputedStyle(el).filter;
  return f && f !== 'none' ? f : '';
};

function dissolve(g: HTMLElement | null, dur = 320): void {
  if (!g) return;
  const b = baseFilter(g);
  anim(
    g,
    [
      { opacity: 1, filter: `${b} brightness(1) blur(0px)`, transform: 'translateY(0)' },
      { opacity: 0, filter: `${b} brightness(2.2) blur(2px)`, transform: 'translateY(-2.5%)' },
    ],
    { dur, ease: EASE.in, remove: true },
  );
}

function materialize(img: HTMLElement | null, delay: number, dur = 340): void {
  if (!img) return;
  const b = baseFilter(img);
  anim(
    img,
    [
      { opacity: 0, filter: `${b} brightness(2.4) saturate(.6)`, transform: 'scale(.94)' },
      { opacity: 1, filter: `${b} brightness(1) saturate(1)`, transform: 'scale(1)' },
    ],
    { dur, delay },
  );
}

const fadeOut = (el: HTMLElement | null, dur = 150) => anim(el, [{ opacity: 1 }, { opacity: 0 }], { dur, remove: true });
const fadeIn = (el: Element | null, dur = 150, delay = 0) => anim(el, [{ opacity: 0 }, { opacity: 1 }], { dur, delay, ease: 'ease' });
const fadeUp = (el: Element | null) => anim(el, [{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], { dur: 260 });

/** Карточка под сценой меняется: новая проступает. */
function cardIn(): void {
  const card = $('.camp > .sheet .card');
  if (calm()) fadeIn(card, 200);
  else fadeUp(card);
}

// ---------- маленькие эффекты на слое поверх экрана ----------

const STAR_PATH = 'M0-11L2.2-2.2L11 0L2.2 2.2L0 11L-2.2 2.2L-11 0L-2.2-2.2Z';
const px = (v: number) => `${v.toFixed(1)}px`;

function glint(x: number, y: number, o: { s?: number; col?: string; dur?: number; delay?: number } = {}): void {
  if (calm()) return;
  const el = fxNode('glint', L.fx, { left: px(x), top: px(y) }, `<svg viewBox="-12 -12 24 24" width="22" height="22"><path d="${STAR_PATH}" fill="${o.col ?? '#fffbe6'}"/></svg>`);
  anim(el, [{ transform: 'scale(0) rotate(0deg)', opacity: 0 }, { transform: `scale(${o.s ?? 1}) rotate(45deg)`, opacity: 1, offset: 0.4 }, { transform: 'scale(0) rotate(90deg)', opacity: 0 }], { dur: o.dur ?? 520, delay: o.delay ?? 0, remove: true });
}

function floatText(x: number, y: number, text: string, o: { c?: string; g?: string; dy?: number; dur?: number; delay?: number } = {}): void {
  if (calm()) return;
  const el = fxNode('float', L.fx, { left: px(x), top: px(y), '--c': o.c ?? '#ffe08a', '--g': o.g ?? 'rgba(255,215,106,.6)' });
  if (!el) return;
  el.textContent = text;
  const dy = o.dy ?? -24;
  anim(
    el,
    [
      { opacity: 0, transform: 'translate(-50%,-50%) translateY(6px) scale(.8)' },
      { opacity: 1, transform: 'translate(-50%,-50%) translateY(0) scale(1.06)', offset: 0.2 },
      { opacity: 1, transform: `translate(-50%,-50%) translateY(${dy * 0.6}px) scale(1)`, offset: 0.7 },
      { opacity: 0, transform: `translate(-50%,-50%) translateY(${dy}px) scale(1)` },
    ],
    { dur: o.dur ?? 760, delay: o.delay ?? 0, remove: true },
  );
}

function flare(x: number, y: number, d: number, o: { c1?: string; c2?: string; peak?: number; dur?: number; delay?: number } = {}): void {
  if (calm()) return;
  const el = fxNode('flare', L.fx, {
    left: px(x - d / 2),
    top: px(y - d / 2),
    width: px(d),
    height: px(d),
    background: `radial-gradient(circle, ${o.c1 ?? 'rgba(255,240,190,.95)'}, ${o.c2 ?? 'rgba(255,170,60,.38)'} 38%, rgba(255,140,40,0) 70%)`,
  });
  anim(el, [{ opacity: 0, transform: 'scale(.4)' }, { opacity: o.peak ?? 1, transform: 'scale(1)', offset: 0.35 }, { opacity: 0, transform: 'scale(1.25)' }], { dur: o.dur ?? 420, delay: o.delay ?? 0, remove: true });
}

function wave(x: number, y: number, r: number, cls = '', o: { dur?: number; from?: number; a?: number } = {}): void {
  if (calm()) return;
  const el = fxNode(`wave ${cls}`, L.fx, { left: px(x - r), top: px(y - r), width: px(r * 2), height: px(r * 2) });
  const f = o.from ?? 0.15;
  anim(el, [{ opacity: o.a ?? 1, transform: `scale(${f})` }, { opacity: 0, transform: 'scale(1)' }], { dur: o.dur ?? 700, remove: true });
}

function pillar(x: number, yBottom: number, w: number, h: number, dur = 900): void {
  if (calm()) return;
  const el = fxNode('pillar', L.fx, { left: px(x - w / 2), top: px(yBottom - h), width: px(w), height: px(h) });
  anim(
    el,
    [
      { transform: 'scaleY(0)', opacity: 0 },
      { transform: 'scaleY(1)', opacity: 1, offset: 0.28 },
      { transform: 'scaleY(1)', opacity: 0.85, offset: 0.62 },
      { transform: 'scale(.55, 1.04)', opacity: 0 },
    ],
    { dur, remove: true },
  );
}

/**
 * Блик пробегает по элементу. Рисуется в слое эффектов в рамке элемента, а не внутри него,
 * чтобы не трогать то, что рисует Preact. Над листом (сам лист выше слоя) блик кладётся в элемент.
 */
function sweep(el: Element | null, o: { soft?: boolean; red?: boolean; dur?: number; delay?: number; inside?: boolean } = {}): void {
  if (!el || calm()) return;
  let host: Element | null = el;
  if (!o.inside) {
    const r = rectIn(el);
    host = fxNode('sweep-clip', L.fx, { left: px(r.x), top: px(r.y), width: px(r.w), height: px(r.h), borderRadius: getComputedStyle(el).borderRadius });
  }
  if (!host) return;
  const s = document.createElement('span');
  s.className = `sweep${o.soft ? ' soft' : ''}${o.red ? ' red' : ''}`;
  host.append(s);
  own(s);
  anim(s, [{ transform: 'translateX(-120%)' }, { transform: 'translateX(320%)' }], {
    dur: o.dur ?? 600,
    delay: o.delay ?? 0,
    ease: EASE.float,
    then: () => {
      drop(s);
      if (host !== el && host) drop(host);
    },
  });
}

function bump(el: Element | null, s = 1.1, o: { base?: string; dur?: number; delay?: number } = {}): void {
  if (!el || calm()) return;
  const b = o.base ?? '';
  anim(el, [{ transform: `${b} scale(1)` }, { transform: `${b} scale(${s})`, offset: 0.35 }, { transform: `${b} scale(1)` }], { dur: o.dur ?? 320, delay: o.delay ?? 0, fill: 'none' });
}

function popIn(el: Element | null, delay = 0, dur = 300): void {
  if (!el) return;
  if (calm()) fadeIn(el, 150);
  else anim(el, [{ opacity: 0, transform: 'scale(.3)' }, { opacity: 1, transform: 'scale(1)' }], { dur, delay, ease: EASE.pop });
}

/** Число в «барабане»: старое уходит вверх, новое приходит снизу. Значение берётся из data-v. */
function flipNumber(el: HTMLElement | null, dur = 300): void {
  if (!el) return;
  if (calm()) return release(el);
  anim(
    el,
    [
      { opacity: 1, transform: 'translateY(0)' },
      { opacity: 0, transform: 'translateY(-55%)', offset: 0.5 },
      { opacity: 0, transform: 'translateY(55%)', offset: 0.501 },
      { opacity: 1, transform: 'translateY(0)' },
    ],
    { dur },
  );
  window.setTimeout(() => release(el), dur / 2);
}

// ---------- руны ----------

const RUNES = [
  'M5 0V14M5 0L0 5M5 0L10 5',
  'M5 0V14M5 6L0 0M5 6L10 0',
  'M2 0V14M2 3L9 0M2 7L9 4',
  'M2 0V14M2 0L8 3L2 7L8 14',
  'M5 0L10 5L5 10L0 5ZM2.5 7.5L0 14M7.5 7.5L10 14',
  'M0 0V14M10 0V14M0 0L10 14M10 0L0 14',
  'M2 0V14M2 0L9 4M2 5L9 9',
  'M1 0V14M9 0V14M1 0L9 7M9 0L1 7',
  'M8 0L2 5L8 9L2 14',
  'M5 0V14',
  'M8 0L2 7L8 14',
  'M2 0V14M2 0L8 3.5L2 7L8 10.5L2 14',
];

const runeGlyphs = (r: number) => RUNES.map((d, i) => `<path class="rr-rune" d="${d}" transform="rotate(${i * 30}) translate(-5 ${-r - 7})"/>`).join('');

function ringSVG(col: string): string {
  return `<svg viewBox="-100 -100 200 200" aria-hidden="true">
    <g fill="none" stroke="${col}" stroke-width="8" opacity=".25"><circle r="92" pathLength="100" class="rr-c"/><circle r="70" pathLength="100" class="rr-c"/></g>
    <g class="spin-cw" fill="none" stroke="${col}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">
      <circle r="92" pathLength="100" class="rr-c"/><circle r="70" pathLength="100" class="rr-c"/>${runeGlyphs(81)}
    </g>
  </svg>`;
}

function sigilSVG(col: string): string {
  let star = '';
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2 - Math.PI / 2;
    const r = i % 2 ? 26 : 62;
    star += `${i ? 'L' : 'M'}${(Math.cos(a) * r).toFixed(1)} ${(Math.sin(a) * r).toFixed(1)}`;
  }
  return `<svg viewBox="-110 -110 220 220" aria-hidden="true">
    <g fill="none" stroke="${col}" stroke-linecap="round" stroke-linejoin="round">
      <g class="spin-cw"><circle r="98" pathLength="100" class="rr-c" stroke-width="2.4"/><circle r="74" pathLength="100" class="rr-c" stroke-width="1.6"/>${runeGlyphs(86)}</g>
      <g class="spin-ccw"><path d="${star}Z" pathLength="100" class="rr-c" stroke-width="1.8"/><circle r="30" pathLength="100" class="rr-c" stroke-width="1.6"/></g>
    </g>
  </svg>`;
}

/** Линии знака рисуются, руны проступают по очереди. */
function drawRunes(el: Element | null, delay = 0, dur = 420): void {
  for (const c of $$('.rr-c', el)) anim(c, [{ strokeDashoffset: 100 }, { strokeDashoffset: 0 }], { dur, delay });
  $$('.rr-rune', el).forEach((r, i) => anim(r, [{ opacity: 0 }, { opacity: 1 }], { dur: 180, delay: delay + dur * 0.3 + i * 22 }));
}

/** Круг рун на земле сцены (в единицах картинки), сплющен под перспективу поляны. */
function runeRing(sc: Element, sx: number, sy: number, o: { size?: number; col?: string; delay?: number; dur?: number } = {}): void {
  const ground = $('.scene-ground', sc);
  if (calm() || !ground) return;
  const col = o.col ?? '#ffd76a';
  const el = fxNode('rune-ring', ground, { left: pct(sx, SCENE_W), top: pct(sy, SCENE_H), width: pct(o.size ?? 240, SCENE_W), filter: `drop-shadow(0 0 3px ${col})` }, ringSVG(col));
  drawRunes(el, o.delay ?? 0, 420);
  const base = 'translate(-50%,-50%) scaleY(.4)';
  anim(
    el,
    [
      { opacity: 0, transform: `${base} scale(.8)` },
      { opacity: 1, transform: `${base} scale(1)`, offset: 0.2 },
      { opacity: 1, transform: `${base} scale(1.02)`, offset: 0.75 },
      { opacity: 0, transform: `${base} scale(1.12)` },
    ],
    { dur: o.dur ?? 850, delay: o.delay ?? 0, remove: true },
  );
}

// ---------- Искра под пальцем ----------

/** Кнопки, по которым от пальца расходится рябь. Остальным достаётся круглый отсвет. */
const RIPPLE_HOST = '.btn, .row, .act, .banner, .chipbtn, .wind, .check-row, .card-title-btn, .quest-card, .notice-btn, .toast-btn';

export function tap(e: PointerEvent): void {
  if (off() || !e.isTrusted || !L.app || !L.touch) return;
  if (e.pointerType === 'mouse' && e.button !== 0) return;
  const target = e.target instanceof Element ? e.target : null;
  const el = target?.closest('button, summary, label.check-row, a[href]');
  if (!el || (el as HTMLButtonElement).disabled || el.closest('[inert]')) return;
  const a = L.app.getBoundingClientRect();
  const x = e.clientX - a.left;
  const y = e.clientY - a.top;
  const host = el.matches('.tab-add') ? el.firstElementChild : el.closest(RIPPLE_HOST);
  if (host) ripple(host, x, y);
  else bloom(x, y);
  if (!calm()) burst(x, y, { n: 4, kind: 'star', pal: 'gold', speed: [50, 100], spread: Math.PI, life: [380, 460], size: [1.3, 2.1], drag: 2.4, gravity: -30, fout: 0.6, keep: true });
}

/** Рябь рисуется в слое касаний по форме кнопки: кнопка может тут же смениться, а отклик доиграет. */
function ripple(host: Element, x: number, y: number): void {
  const r = rectIn(host);
  const clip = document.createElement('div');
  clip.className = 'ripple-clip';
  Object.assign(clip.style, { left: px(r.x), top: px(r.y), width: px(r.w), height: px(r.h), borderRadius: getComputedStyle(host).borderRadius });
  const d = Math.max(r.w, r.h) * 2;
  const el = document.createElement('span');
  el.className = `ripple${host.matches('.btn-gold, .tab-add > span, .chipbtn.is-on') ? ' is-gold' : ''}`;
  Object.assign(el.style, { left: px(x - r.x - d / 2), top: px(y - r.y - d / 2), width: px(d), height: px(d) });
  clip.append(el);
  L.touch?.append(clip);
  const frames = calm() ? [{ opacity: 0.5, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(1)' }] : [{ opacity: 1, transform: 'scale(.08)' }, { opacity: 0, transform: 'scale(1)' }];
  const done = () => clip.remove();
  const a = el.animate(frames, { duration: calm() ? 300 : 460, easing: EASE.out, fill: 'both' });
  a.onfinish = done;
  a.oncancel = done;
}

function bloom(x: number, y: number): void {
  const el = document.createElement('div');
  el.className = 'bloom';
  el.style.left = px(x);
  el.style.top = px(y);
  L.touch?.append(el);
  const done = () => el.remove();
  const a = el.animate([{ opacity: 0.9, transform: 'scale(.3)' }, { opacity: 0, transform: 'scale(1.2)' }], { duration: calm() ? 260 : 420, easing: EASE.out, fill: 'both' });
  a.onfinish = done;
  a.oncancel = done;
}

// ---------- Свиток и Перелистывание ----------

/** Лист открылся: по заголовку проходит мягкий блик. Выезд и закрытие листа делает CSS. */
export function sheetOpened(layer: Element | null): void {
  safe(() => {
    if (calm()) return;
    sweep($('.modal-head h2', layer), { soft: true, dur: 480, delay: 120, inside: true });
  });
}

/** Перелистывание: копия старой страницы гаснет поверх новой. Зовётся до смены страницы. */
export function pageLeave(main: HTMLElement | null): void {
  cast(() => {
    const page = main?.firstElementChild;
    if (calm() || !main || !page || !L.fx) return;
    const r = rectIn(main);
    const ghost = fxNode('page-ghost', L.fx, { left: px(r.x), top: px(r.y), width: px(r.w), height: px(r.h) });
    if (!ghost) return;
    const copy = page.cloneNode(true) as HTMLElement;
    for (const el of [copy, ...copy.querySelectorAll('[id]')]) el.removeAttribute('id');
    ghost.inert = true;
    ghost.append(copy);
    // Прокрутку копия не наследует: ставим её как была, иначе список дёрнется к началу.
    const from = [page, ...page.querySelectorAll('*')];
    const to = [copy, ...copy.querySelectorAll('*')];
    from.forEach((el, i) => {
      if (el.scrollTop && to[i]) to[i].scrollTop = el.scrollTop;
    });
    anim(ghost, [{ opacity: 1 }, { opacity: 0 }], { dur: 170, ease: EASE.in, remove: true });
  });
}

/** Новая страница поднимается, значок вкладки подпрыгивает. Зовётся, когда страница уже на месте. */
export function pageEnter(main: HTMLElement | null): void {
  safe(() => {
    if (off()) return;
    const page = main?.firstElementChild;
    if (calm()) return void fadeIn(page ?? null, 150);
    anim(page, [{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], { dur: 240 });
    const icon = $('.tabbar .tab.is-active svg');
    anim(icon, [{ transform: 'scale(1)' }, { transform: 'scale(1.18) translateY(-1px)', offset: 0.45 }, { transform: 'scale(1)' }], { dur: 320, ease: EASE.pop, fill: 'none' });
  });
}

// ---------- Победная искра ----------

/** Что было на экране до награды. */
export interface Before {
  gold: number;
  level: number;
}

/** Задача сдана: столб света над спутником у огня, монеты к золоту, звёзды опыта к уровню, трещина в логове. */
export function done(id: string, r: CompleteResult, before: Before, level: number): void {
  cast(async (s) => {
    await s.frame();
    const sc = scene();
    const levelUp = level > before.level;
    const rws = $$('[data-magic^="rw-"]');
    if (calm() || !sc) {
      cardIn();
      if (levelUp) ascend(before.level, level, true);
      return;
    }
    cardIn();
    rws.forEach((el, i) => popIn(el, 120 + i * 90));
    hold($('[data-magic="gold-n"]'), before.gold);
    if (levelUp) hold($('[data-magic="level-n"]'), before.level);
    const img = figImg(sc, id);
    const p = img && img.dataset.art?.startsWith('ring/') ? figPoints(img) : null;
    if (img && p) {
      const [fx, fy] = spt(sc, p.feet[0], p.feet[1]);
      const [hx, hy] = spt(sc, p.head[0], p.head[1]);
      const cx = (hx + fx) / 2;
      pillar(cx, fy + 8, 66, fy + 8 - (hy - 84));
      burst(cx, (hy + fy) / 2, { n: 26, kind: 'star', pal: 'gold', speed: [150, 260], spread: 0.55, gravity: 320, drag: 0.7, life: [700, 950], size: [1.8, 3.4], tw: 2.5 });
      anim(img, [{ transform: 'translateY(0)' }, { transform: 'translateY(-6px)', offset: 0.3 }, { transform: 'translateY(0)' }], { dur: 420, fill: 'none' });
      const [ex, ey] = fireAt(sc);
      flare(ex, ey, 120, { dur: 500, peak: 0.7 });
    }
    rewardFlights(sc, before, levelUp ? level : null);
    const lair = $('[data-magic="rw-lair"]');
    if (lair && r.lair) aside(crackLair(s, lair));
    await s.wait(1400);
  });
}

function rewardFlights(sc: Element, before: Before, newLevel: number | null): void {
  const rw = (k: string) => $(`[data-magic="rw-${k}"]`);
  const goldChip = $('[data-magic="gold"]');
  const goldN = $('[data-magic="gold-n"]');
  const lvl = $('[data-magic="level"]');
  if (!goldChip || !lvl) {
    release(goldN);
    if (newLevel) ascend(before.level, newLevel, true);
    return;
  }
  const gp = pt(goldChip, 0.16, 0.5);
  const goldFrom = rw('gold');
  flight(goldFrom ? pt(goldFrom, 0.22, 0.5) : fireAt(sc), gp, {
    n: 7,
    kind: 'coin',
    size: [3.8, 5],
    delay: 380,
    stagger: 36,
    life: 520,
    arc: 0.32,
    lift: 0.18,
    trail: 0,
    spin: 10,
    onFirst: () => countUp(goldN, before.gold, 450),
    onEach: () => bump(goldChip, 1.06, { dur: 220 }),
    onLast: () => {
      sweep(goldChip);
      glint(gp[0] - 2, gp[1] - 7, { s: 0.9 });
    },
  });
  const lp = pt(lvl, 0.5, 0.5);
  const xpFrom = rw('xp');
  flight(xpFrom ? pt(xpFrom, 0.3, 0.5) : fireAt(sc), lp, {
    n: 6,
    kind: 'star',
    pal: 'holy',
    size: [2.2, 3],
    delay: 470,
    stagger: 40,
    life: 500,
    arc: 0.28,
    lift: 0.22,
    trail: 6,
    onLast: () => {
      glint(lp[0], lp[1] - 4, { col: '#eaf6ff' });
      bump(lvl, 1.12);
      if (newLevel) ascend(before.level, newLevel, true);
    },
  });
}

async function crackLair(s: Spell, el: HTMLElement): Promise<void> {
  await s.wait(560);
  if (!el.isConnected) return;
  sweep(el, { red: true, dur: 420 });
  const [x, y] = pt(el, 0.5, 0.6);
  burst(x, y, { n: 6, kind: 'shard', pal: 'necro', speed: [40, 90], angle: Math.PI / 2, spread: 1.2, gravity: 340, drag: 0.5, life: [380, 480], size: [2.4, 3.4], vr: 9 });
  anim(el, [{ filter: 'brightness(1)' }, { filter: 'brightness(1.9)', offset: 0.3 }, { filter: 'brightness(1)' }], { dur: 340, fill: 'none' });
}

// ---------- Призыв к огню и Цена смены похода ----------

/** Спутник рассыпается искрами и собирается у огня, прежний возвращается на своё место. */
export function summon(id: string, cost: number, manaBefore: number): void {
  cast(async (s) => {
    // Прежний экран: копии фигур кладутся сейчас, пока Preact не убрал настоящие.
    const sc = scene();
    const fromImg = figImg(sc, id);
    const ring0 = ringImg(sc);
    const prevId = ring0 && ring0.dataset.task !== id ? ring0.dataset.task ?? null : null;
    const fromPt = sc && fromImg ? figCenter(sc, fromImg) : null;
    const prevPt = sc && ring0 && prevId ? figCenter(sc, ring0) : null;
    const gFrom = ghostFig(sc, fromImg);
    const gPrev = prevId ? ghostFig(sc, ring0) : null;
    const gMarks = [ghostMark(sc, id), ghostMark(sc, prevId)];
    await s.frame();
    if (cost) manaCost(cost, manaBefore);
    cardIn();
    const img = figImg(sc, id);
    const back = prevId ? figImg(sc, prevId) : null;
    if (!sc?.isConnected || calm() || !img) {
      for (const g of [gFrom, gPrev, ...gMarks]) fadeOut(g);
      for (const el of [img, back]) fadeIn(el);
      return;
    }
    if (gFrom && fromPt) {
      dissolve(gFrom);
      burst(fromPt[0], fromPt[1], { n: 14, kind: 'glow', pal: 'gold', speed: [30, 80], spread: 1.3, gravity: -70, drag: 1, life: [450, 650], size: [1.5, 2.6], jx: 12, jy: 16 });
    }
    dissolve(gPrev);
    for (const g of gMarks) fadeOut(g, 220);
    const [ex, ey] = fireAt(sc);
    flight(fromPt ?? [ex, ey], figCenter(sc, img), { n: 10, kind: 'spark', pal: 'gold', delay: 80, stagger: 22, life: 480, arc: 0.22, lift: 0.12, size: [2, 2.8], trail: 6 });
    if (prevPt && back) flight(prevPt, figCenter(sc, back), { n: 7, kind: 'spark', pal: 'gold', delay: 120, stagger: 26, life: 480, arc: 0.22, lift: 0.12, size: [1.6, 2.4], trail: 5 });
    const ring = SCENE.spots.ring;
    if (ring) runeRing(sc, ring[0], ring[1], { size: 270, delay: 250, dur: 850 });
    materialize(img, 380);
    materialize(back, 420);
    flare(ex, ey, 150, { delay: 380, dur: 420, peak: 0.85 });
    burst(ex, ey, { n: 12, kind: 'glow', pal: 'ember', delay: 380, speed: [60, 140], spread: 0.7, gravity: -40, life: [500, 800], size: [1.6, 2.8] });
    popIn($('.num', markOf(sc, id)), 600);
    if (prevId) popIn($('.num', markOf(sc, prevId)), 640);
    const tag = $('.tag-timer', markOf(sc, id));
    if (tag) fadeIn(tag, 240, 700);
    await s.wait(1100);
  });
}

/** Камень маны сжимается и роняет синие осколки, рядом всплывает «−5», число маны убегает вниз. */
function manaCost(cost: number, from: number): void {
  const chip = $('[data-magic="mana"]');
  if (!chip || calm()) return;
  countUp($('[data-magic="mana-n"]', chip), from, 420);
  const gem = $('.mana-gem', chip);
  if (!gem) return;
  const [gx, gy] = pt(gem);
  anim(gem, [{ transform: 'rotate(45deg) scale(1)', filter: 'brightness(1)' }, { transform: 'rotate(45deg) scale(.68)', filter: 'brightness(2)', offset: 0.35 }, { transform: 'rotate(45deg) scale(1)', filter: 'brightness(1)' }], { dur: 360, fill: 'none' });
  burst(gx, gy + 3, { n: 6, kind: 'shard', pal: 'arcane', speed: [40, 100], angle: Math.PI / 2, spread: 1.2, gravity: 360, drag: 0.5, life: [380, 480], size: [2.6, 3.8], vr: 9 });
  floatText(gx + 28, gy + 24, `−${cost}`, { c: '#cfdcff', g: 'rgba(91,140,255,.75)', delay: 60, dur: 520, dy: 16 });
}

// ---------- Привал и «Снова в путь» ----------

/**
 * Привал: спутник садится, костёр разгорается шире (дальше камень маны дышит сам, пока идёт отдых).
 * Снова в путь: по камню маны проходит синяя волна. В обоих поза у огня меняется перекрёстным наплывом.
 */
export function rest(resting: boolean): void {
  cast(async (s) => {
    const sc = scene();
    const ring0 = ringImg(sc);
    const was = ring0?.dataset.task ?? null;
    const g = ghostFig(sc, ring0);
    await s.frame();
    const ring1 = ringImg(sc);
    fadeOut(g, calm() ? 150 : 260);
    if (ring1 && ring1.dataset.task !== was) fadeIn(ring1, calm() ? 150 : 260);
    cardIn();
    if (calm() || !sc?.isConnected) return;
    if (resting) {
      const [ex, ey] = fireAt(sc);
      flare(ex, ey + 10, 150, { dur: 800, peak: 0.6 });
      burst(ex, ey, { n: 12, kind: 'glow', pal: 'ember', speed: [50, 110], spread: 0.6, gravity: -40, life: [800, 1100], size: [1.5, 2.6], stagger: 30 });
      await s.wait(900);
    } else {
      const gem = $('[data-magic="mana"] .mana-gem');
      if (!gem) return;
      const [gx, gy] = pt(gem);
      wave(gx, gy, 30, 'arcane', { dur: 600, from: 0.2 });
      glint(gx, gy, { col: '#eaf1ff', s: 0.8 });
      await s.wait(600);
    }
  });
}

// ---------- Восхождение ----------

/** Новый уровень героя: экран притухает, рисуется белый знак Света, звезда летит к значку уровня. */
export function ascend(from: number, to: number, chain = false): void {
  cast(
    async (s) => {
      if (!chain) await s.frame();
      const lvlN = $('[data-magic="level-n"]');
      const { w, h } = size();
      const wrap = $('.scene-wrap');
      const wr = wrap ? rectIn(wrap) : null;
      const bar = $('.topbar');
      const br = bar ? rectIn(bar) : null;
      // Знак встаёт между верхней панелью и карточкой под сценой (она заходит на сцену на 22px):
      // на маленьком экране он меньше и не закрывает золото и уровень.
      const top = br ? br.y + br.h + 4 : (wr?.y ?? 0);
      const bottom = wr ? wr.y + wr.h - 22 : h * 0.6;
      const k = Math.min(1, Math.max(0.6, (bottom - top) / 280));
      const r = 132 * k;
      const cx = wr ? wr.x + wr.w / 2 : w / 2;
      const cy = Math.max(top + r, Math.min(wr ? wr.y + Math.min(wr.h * 0.45, 240) : h * 0.35, bottom - r));
      if (calm()) {
        release(lvlN);
        const plate = fxNode('lvl-plate', L.fx, { top: px(cy - 40) }, '<b></b><small>Герой вырос</small>');
        const b = plate?.querySelector('b');
        if (b) b.textContent = `Уровень ${to}`;
        anim(plate, [{ opacity: 0 }, { opacity: 1, offset: 0.1 }, { opacity: 1, offset: 0.9 }, { opacity: 0 }], { dur: 1500, ease: 'linear', remove: true });
        await s.wait(1500);
        return;
      }
      hold(lvlN, from);
      if (L.dim) anim(L.dim, [{ opacity: 0 }, { opacity: 1, offset: 0.17 }, { opacity: 1, offset: 0.79 }, { opacity: 0 }], { dur: 2400, ease: 'linear' });
      const rays = fxNode('rays', L.fx, { left: px(cx), top: px(cy), '--k': k.toFixed(3) });
      anim(rays, [{ opacity: 0, transform: 'rotate(0deg) scale(.6)' }, { opacity: 1, transform: 'rotate(10deg) scale(1)', offset: 0.22 }, { opacity: 0.8, transform: 'rotate(26deg) scale(1.04)', offset: 0.78 }, { opacity: 0, transform: 'rotate(32deg) scale(1.1)' }], { dur: 1800, delay: 300, ease: 'linear', remove: true });
      const sig = fxNode('sigil', L.fx, { left: px(cx), top: px(cy), '--k': k.toFixed(3) }, sigilSVG('#dcefff'));
      drawRunes(sig, 0, 640);
      anim(sig, [{ opacity: 0, transform: 'scale(.55) rotate(-20deg)' }, { opacity: 1, transform: 'scale(1) rotate(0deg)', offset: 0.3 }, { opacity: 1, transform: 'scale(1.03) rotate(0deg)', offset: 0.85 }, { opacity: 0, transform: 'scale(1.2) rotate(0deg)' }], { dur: 2000, remove: true });
      spiral(cx, cy, { n: 36, r0: 175 * k, r1: 8, turns: 0.55, life: 820, delay: 200, stagger: 7, pal: 'holy', size: [1.6, 3], trail: 5, kind: 'spark' });
      await s.wait(700);
      const txt = fxNode('lvl-text', L.fx, { top: px(cy - 34 * k), '--k': k.toFixed(3) }, '<b></b><small>Герой вырос</small>');
      const b = txt?.querySelector('b');
      if (b) b.textContent = `Уровень ${to}`;
      anim(txt, [{ opacity: 0, transform: 'translateX(-50%) scale(.7)' }, { opacity: 1, transform: 'translateX(-50%) scale(1.04)', offset: 0.2 }, { opacity: 1, transform: 'translateX(-50%) scale(1)', offset: 0.8 }, { opacity: 0, transform: 'translateX(-50%) scale(1.02)' }], { dur: 1400, remove: true });
      burst(cx, cy, { n: 30, kind: 'star', pal: 'holy', speed: [140 * k, 260 * k], ring: true, life: [600, 900], size: [1.6, 3], drag: 2.4, tw: 2 });
      await s.wait(1000);
      const lv = $('[data-magic="level"]');
      if (lv) {
        const lp = pt(lv);
        flight([cx, cy], lp, {
          n: 1,
          kind: 'star',
          pal: 'holy',
          size: 5,
          life: 480,
          trail: 9,
          arc: 0.15,
          lift: 0.1,
          onLast: () => {
            glint(lp[0], lp[1], { s: 1.3, col: '#eaf6ff' });
            bump(lv, 1.18);
          },
        });
      }
      await s.wait(450);
      flipNumber(lvlN);
      sweep($('[data-magic="gold"]'));
      await s.wait(300);
    },
    { chain },
  );
}
