// Общие приёмы заклинаний: где на сцене фигура, копии фигур для переходов, маленькие эффекты и руны.
import { SCENE, SCENE_H, SCENE_W, pct } from '../../scene/scene';
import { GAME_ICONS, LINE_ICONS, type GameIcon, type LineIcon } from '../icons';
import { EASE, L, anim, calm, drop, fxNode, own, pt, rectIn, release } from './engine';

export const $ = <T extends Element = HTMLElement>(sel: string, root: ParentNode | null | undefined = L.app): T | null => root?.querySelector<T>(sel) ?? null;
export const $$ = <T extends Element = HTMLElement>(sel: string, root: ParentNode | null | undefined = L.app): T[] => (root ? [...root.querySelectorAll<T>(sel)] : []);
export const esc = (s: string) => (typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(s) : s.replace(/["\\]/g, '\\$&'));
export const px = (v: number) => `${v.toFixed(1)}px`;

// ---------- сцена ----------

export const scene = () => $('.scene');

/** Точка картинки сцены (780 × 840) в пикселях приложения. */
export function spt(sc: Element, x: number, y: number): [number, number] {
  const r = rectIn(sc);
  return [r.x + (x / SCENE_W) * r.w, r.y + (y / SCENE_H) * r.h];
}

export const fireAt = (sc: Element) => spt(sc, SCENE.fire[0], SCENE.fire[1] - 34);

export const figImg = (sc: Element | null, id: string | null | undefined) => (sc && id ? $<HTMLImageElement>(`img.fig[data-task="${esc(id)}"]`, sc) : null);
export const ringImg = (sc: Element | null) => (sc ? $<HTMLImageElement>('img.fig[data-art^="ring/"]', sc) : null);
export const markOf = (sc: Element | null, id: string | null | undefined) => (sc && id ? $(`.fig-mark[data-task="${esc(id)}"]`, sc) : null);

/** Ноги и макушка фигуры в единицах сцены, по её картинке. */
export function figPoints(img: HTMLElement): { feet: [number, number]; head: [number, number] } | null {
  const art = img.dataset.art;
  const sp = art ? SCENE.sprites[art] : undefined;
  const feet = art ? SCENE.spots[art.split('/')[0]] : undefined;
  if (!sp || !feet) return null;
  return { feet, head: sp.head ?? [sp.x + sp.w / 2, sp.y + 6] };
}

/** Середина фигуры между макушкой и ногами. */
export function figCenter(sc: Element, img: HTMLElement): [number, number] {
  const p = figPoints(img);
  if (!p) return pt(img, 0.5, 0.45);
  return spt(sc, (p.head[0] + p.feet[0]) / 2, (p.head[1] + p.feet[1]) / 2);
}

/** Ноги фигуры в пикселях приложения. */
export function figFeet(sc: Element, img: HTMLElement): [number, number] {
  const p = figPoints(img);
  return p ? spt(sc, p.feet[0], p.feet[1]) : pt(img, 0.5, 0.92);
}

/**
 * Копия фигуры поверх сцены: настоящая уйдёт с новым состоянием, а копия растает на её месте.
 * keepLight: копия сохраняет нынешний свет, даже если вечер на сцене сменится ночью.
 * inPlace: копия встаёт сразу над своей фигурой, и костёр по-прежнему закрывает тех, кто сидит за ним.
 * Preact стоящие на месте картинки не переставляет, поэтому чужой узел между ними остаётся, где положен.
 */
export function ghostFig(sc: Element | null, img: HTMLElement | null, o: { keepLight?: boolean; inPlace?: boolean } = {}): HTMLElement | null {
  const air = sc && $('.scene-fx', sc);
  if (!img || !air) return null;
  const g = img.cloneNode(false) as HTMLElement;
  if (o.keepLight) g.style.filter = getComputedStyle(img).filter;
  delete g.dataset.task;
  delete g.dataset.art;
  g.classList.add('fig-ghost');
  if (o.inPlace) img.after(g);
  else air.append(g);
  return own(g);
}

/** Копия номера над фигурой: гаснет, пока номер встаёт на новое место. */
export function ghostMark(sc: Element | null, id: string | null | undefined): HTMLElement | null {
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

export const baseFilter = (el: Element) => {
  const f = getComputedStyle(el).filter;
  return f && f !== 'none' ? f : '';
};

/** Копия фигуры светлеет и тает вверх. */
export function dissolve(g: HTMLElement | null, o: { dur?: number; bright?: number; dy?: string; delay?: number } = {}): void {
  if (!g) return;
  const b = baseFilter(g);
  anim(
    g,
    [
      { opacity: 1, filter: `${b} brightness(1) blur(0px)`, transform: 'translateY(0)' },
      { opacity: 0, filter: `${b} brightness(${o.bright ?? 2.2}) blur(2px)`, transform: `translateY(${o.dy ?? '-2.5%'})` },
    ],
    { dur: o.dur ?? 320, delay: o.delay ?? 0, ease: EASE.in, remove: true },
  );
}

/** Фигура проступает из света. */
export function materialize(img: HTMLElement | null, delay: number, dur = 340): void {
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

export const fadeOut = (el: HTMLElement | null, dur = 150, delay = 0) => anim(el, [{ opacity: 1 }, { opacity: 0 }], { dur, delay, remove: true });
export const fadeIn = (el: Element | null, dur = 150, delay = 0) => anim(el, [{ opacity: 0 }, { opacity: 1 }], { dur, delay, ease: 'ease' });
export const fadeUp = (el: Element | null, delay = 0) => anim(el, [{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], { dur: 260, delay });

/** Карточка под сценой меняется: новая проступает. */
export function cardIn(): void {
  const card = $('.camp > .sheet .card');
  if (calm()) fadeIn(card, 200);
  else fadeUp(card);
}

// ---------- значки ----------

/** Значок игры строкой: для картинок, которые летят в слое эффектов. */
export const gIcon = (name: GameIcon, size: number) => `<svg aria-hidden="true" viewBox="0 0 512 512" width="${size}" height="${size}"><path fill="currentColor" d="${GAME_ICONS[name]}"/></svg>`;

export const lIcon = (name: LineIcon, size: number, stroke = 2) =>
  `<svg aria-hidden="true" viewBox="0 0 24 24" width="${size}" height="${size}"><path d="${LINE_ICONS[name]}" fill="none" stroke="currentColor" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

/** Кадры полёта картинки по дуге, как у частиц на холсте: extra(t) добавляет поворот и размер. */
export function arcFrames(x0: number, y0: number, x1: number, y1: number, lift: number, n = 12, extra: (t: number) => string = () => ''): Keyframe[] {
  const cx = (x0 + x1) / 2;
  const cy = Math.min(y0, y1) - lift;
  const out: Keyframe[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const u = 1 - t;
    const x = u * u * x0 + 2 * u * t * cx + t * t * x1;
    const y = u * u * y0 + 2 * u * t * cy + t * t * y1;
    out.push({ transform: `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) ${extra(t)}`, offset: t });
  }
  return out;
}

// ---------- маленькие эффекты на слое поверх экрана ----------

const STAR_PATH = 'M0-11L2.2-2.2L11 0L2.2 2.2L0 11L-2.2 2.2L-11 0L-2.2-2.2Z';

export function glint(x: number, y: number, o: { s?: number; col?: string; dur?: number; delay?: number } = {}): void {
  if (calm()) return;
  const el = fxNode('glint', L.fx, { left: px(x), top: px(y) }, `<svg viewBox="-12 -12 24 24" width="22" height="22"><path d="${STAR_PATH}" fill="${o.col ?? '#fffbe6'}"/></svg>`);
  anim(el, [{ transform: 'scale(0) rotate(0deg)', opacity: 0 }, { transform: `scale(${o.s ?? 1}) rotate(45deg)`, opacity: 1, offset: 0.4 }, { transform: 'scale(0) rotate(90deg)', opacity: 0 }], { dur: o.dur ?? 520, delay: o.delay ?? 0, remove: true });
}

export function floatText(x: number, y: number, text: string, o: { c?: string; g?: string; dy?: number; dur?: number; delay?: number } = {}): void {
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

export function flare(x: number, y: number, d: number, o: { c1?: string; c2?: string; peak?: number; dur?: number; delay?: number } = {}): void {
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

/** Кольцо расходится из точки; squash сплющивает его под перспективу поляны. */
export function wave(x: number, y: number, r: number, cls = '', o: { dur?: number; from?: number; a?: number; squash?: number; delay?: number } = {}): void {
  if (calm()) return;
  const el = fxNode(`wave ${cls}`, L.fx, { left: px(x - r), top: px(y - r), width: px(r * 2), height: px(r * 2) });
  const f = o.from ?? 0.15;
  const sq = o.squash ?? 1;
  anim(el, [{ opacity: o.a ?? 1, transform: `scale(${f}, ${f * sq})` }, { opacity: 0, transform: `scale(1, ${sq})` }], { dur: o.dur ?? 700, delay: o.delay ?? 0, remove: true });
}

/** Столб света. Золотой растёт от земли, белый (holy) падает с неба. */
export function pillar(x: number, yBottom: number, w: number, h: number, o: { dur?: number; delay?: number; holy?: boolean } = {}): void {
  if (calm()) return;
  const el = fxNode(`pillar${o.holy ? ' holy' : ''}`, L.fx, { left: px(x - w / 2), top: px(yBottom - h), width: px(w), height: px(h) });
  anim(
    el,
    [
      { transform: 'scaleY(0)', opacity: 0 },
      { transform: 'scaleY(1)', opacity: 1, offset: 0.28 },
      { transform: 'scaleY(1)', opacity: 0.85, offset: 0.62 },
      { transform: 'scale(.55, 1.04)', opacity: 0 },
    ],
    { dur: o.dur ?? 900, delay: o.delay ?? 0, remove: true },
  );
}

/**
 * Блик пробегает по элементу. Рисуется в слое эффектов в рамке элемента, а не внутри него,
 * чтобы не трогать то, что рисует Preact. Над листом (сам лист выше слоя) блик кладётся в элемент.
 */
export function sweep(el: Element | null, o: { soft?: boolean; red?: boolean; dur?: number; delay?: number; inside?: boolean } = {}): void {
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

export function bump(el: Element | null, s = 1.1, o: { base?: string; dur?: number; delay?: number } = {}): void {
  if (!el || calm()) return;
  const b = o.base ?? '';
  anim(el, [{ transform: `${b} scale(1)` }, { transform: `${b} scale(${s})`, offset: 0.35 }, { transform: `${b} scale(1)` }], { dur: o.dur ?? 320, delay: o.delay ?? 0, fill: 'none' });
}

export function popIn(el: Element | null, delay = 0, dur = 300): void {
  if (!el) return;
  if (calm()) fadeIn(el, 150);
  else anim(el, [{ opacity: 0, transform: 'scale(.3)' }, { opacity: 1, transform: 'scale(1)' }], { dur, delay, ease: EASE.pop });
}

/** Число в «барабане»: старое уходит вверх, новое приходит снизу. Значение берётся из data-v. */
export function flipNumber(el: HTMLElement | null, dur = 300): void {
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

export function ringSVG(col: string): string {
  return `<svg viewBox="-100 -100 200 200" aria-hidden="true">
    <g fill="none" stroke="${col}" stroke-width="8" opacity=".25"><circle r="92" pathLength="100" class="rr-c"/><circle r="70" pathLength="100" class="rr-c"/></g>
    <g class="spin-cw" fill="none" stroke="${col}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">
      <circle r="92" pathLength="100" class="rr-c"/><circle r="70" pathLength="100" class="rr-c"/>${runeGlyphs(81)}
    </g>
  </svg>`;
}

export function sigilSVG(col: string): string {
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
export function drawRunes(el: Element | null, delay = 0, dur = 420): void {
  for (const c of $$('.rr-c', el)) anim(c, [{ strokeDashoffset: 100 }, { strokeDashoffset: 0 }], { dur, delay });
  $$('.rr-rune', el).forEach((r, i) => anim(r, [{ opacity: 0 }, { opacity: 1 }], { dur: 180, delay: delay + dur * 0.3 + i * 22 }));
}

/** Круг рун на земле сцены (в единицах картинки), сплющен под перспективу поляны. */
export function runeRing(sc: Element, sx: number, sy: number, o: { size?: number; col?: string; delay?: number; dur?: number } = {}): void {
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
