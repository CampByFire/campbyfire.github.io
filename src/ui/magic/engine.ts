// Движок магии: слои эффектов поверх приложения, заклинания и их прерывание.
// Экран зовёт заклинание, когда состояние игры уже изменено: магия только догоняет его светом.
// Ошибка магии не должна ронять игру, поэтому всё, что приходит снаружи, идёт под try.
import type { Motion } from './mode';
import { clearParticles, fadeParticles, initParticles, resizeParticles, setStill } from './particles';

export const EASE = {
  out: 'cubic-bezier(.22,1,.36,1)',
  in: 'cubic-bezier(.55,0,1,.45)',
  pop: 'cubic-bezier(.34,1.56,.64,1)',
  float: 'cubic-bezier(.45,0,.55,1)',
};

let motion: Motion = 'full';
/** Спокойная магия или без анимаций: без частиц, полётов и сдвигов. */
export const calm = () => motion !== 'full';
export const off = () => motion === 'off';

/** Слои поверх приложения. Пока они не на странице, магия молчит. */
export const L: {
  app: HTMLElement | null;
  dim: HTMLElement | null;
  fx: HTMLElement | null;
  touch: HTMLElement | null;
} = { app: null, dim: null, fx: null, touch: null };

export function warn(e: unknown): void {
  console.warn('Магия:', e);
}

/** Выполнить и проглотить ошибку: игра важнее магии. */
export function safe(fn: () => void): void {
  try {
    fn();
  } catch (e) {
    warn(e);
  }
}

// ---------- режим ----------

/** Сменить силу магии. Идущее заклинание обрывается, экран сразу встаёт как есть. */
export function setMotion(m: Motion): void {
  document.documentElement.dataset.motion = m;
  if (m === motion) return;
  hardClear();
  motion = m;
  setStill(m !== 'full');
}

// ---------- заклинания и их прерывание ----------

const STOP = new Error('магия прервана');
let SPELL = 0;

export interface Spell {
  /** Ещё не началось следующее заклинание. */
  alive(): boolean;
  /** Пауза между фазами; если тем временем началось следующее заклинание, дальше не идём. */
  wait(ms: number): Promise<void>;
  /** Следующий кадр: Preact уже нарисовал новое состояние, а на экран оно ещё не попало. */
  frame(): Promise<void>;
}

function sleep(ms: number, alive: () => boolean): Promise<void> {
  return new Promise((res, rej) => {
    if (!alive()) return rej(STOP);
    window.setTimeout(() => (alive() ? res() : rej(STOP)), ms);
  });
}

/** Следующий кадр: к нему Preact уже нарисовал новое состояние, а на экран оно ещё не попало. */
export function nextFrame(): Promise<void> {
  return new Promise((res) => requestAnimationFrame(() => res()));
}

/**
 * Запустить заклинание. Хвост прежнего мягко гаснет, числа встают на итог.
 * chain: заклинание продолжает текущее (Восхождение после награды), хвост прежнего не гасится.
 */
export function cast(fn: (s: Spell) => void | Promise<void>, o: { chain?: boolean } = {}): void {
  if (off() || !L.app) return;
  const id = ++SPELL;
  if (!o.chain) softClear();
  const s: Spell = {
    alive: () => id === SPELL,
    wait: (ms) => sleep(ms, s.alive),
    frame: () =>
      nextFrame().then(() => {
        if (!s.alive()) throw STOP;
      }),
  };
  try {
    Promise.resolve(fn(s)).catch((e: unknown) => {
      if (e !== STOP) warn(e);
    });
  } catch (e) {
    warn(e);
  }
}

/** Запустить часть заклинания отдельно: её прерывание не обрывает остальное. */
export function aside(p: Promise<void>): void {
  p.catch((e: unknown) => {
    if (e !== STOP) warn(e);
  });
}

// ---------- временные элементы и анимации ----------

/** Элементы эффектов: их удаляет сама магия. */
const LIVE = new Set<Element>();
const ANIMS = new Set<Animation>();
/** Анимации настоящих элементов приложения: при прерывании они обрываются, и элемент сразу встаёт как есть. */
const BOUND = new Set<Animation>();

export function fxNode(cls: string, parent: Element | null = L.fx, style: Record<string, string> | null = null, html = ''): HTMLElement | null {
  if (!parent) return null;
  const el = document.createElement('div');
  el.className = cls;
  if (style) for (const [k, v] of Object.entries(style)) el.style.setProperty(k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`), v);
  if (html) el.innerHTML = html;
  parent.append(el);
  LIVE.add(el);
  return el;
}

/** Элемент эффекта, сделанный не через fxNode (копия фигуры): магия уберёт его сама. */
export function own<T extends Element>(el: T): T {
  LIVE.add(el);
  return el;
}

export function drop(el: Element): void {
  LIVE.delete(el);
  el.remove();
}

export interface AnimOptions {
  dur?: number;
  delay?: number;
  ease?: string;
  fill?: FillMode;
  iter?: number;
  /** Убрать элемент эффекта, когда анимация закончится. */
  remove?: boolean;
  then?: () => void;
}

/**
 * Анимация через Web Animations. У настоящих элементов приложения итог анимации не остаётся
 * на элементе (fill backwards): после неё элемент снова слушается своих стилей.
 * Если кадров больше двух, плавность ставится на каждый отрезок, а не на всю анимацию.
 */
export function anim(el: Element | null | undefined, frames: Keyframe[], o: AnimOptions = {}): Animation | null {
  if (!el || off()) return null;
  try {
    const live = LIVE.has(el);
    const multi = frames.length > 2 && !o.ease;
    const kf = multi ? frames.map((f) => (f.easing ? f : { ...f, easing: EASE.out })) : frames;
    const a = el.animate(kf, {
      duration: Math.max(1, o.dur ?? 300),
      delay: o.delay ?? 0,
      easing: o.ease ?? (multi ? 'linear' : EASE.out),
      fill: o.fill ?? (live ? 'both' : 'backwards'),
      iterations: o.iter ?? 1,
    });
    ANIMS.add(a);
    if (!live) BOUND.add(a);
    const done = () => {
      ANIMS.delete(a);
      BOUND.delete(a);
      if (o.remove) drop(el);
    };
    a.onfinish = () => {
      done();
      if (o.then) safe(o.then);
    };
    a.oncancel = done;
    return a;
  } catch (e) {
    warn(e);
    return null;
  }
}

// ---------- числа: золото, уровень и мана досчитываются ----------

export const fmt = (n: number) => Math.round(n).toLocaleString('ru-RU');

/**
 * Числа на экране рисует Preact, магия только временно показывает в них другое значение.
 * Меняется сам текстовый узел, а настоящее значение лежит в data-v: им число и заканчивается.
 */
const HELD = new Set<HTMLElement>();
const COUNTERS = new Set<HTMLElement>();

function setText(el: HTMLElement, text: string): void {
  const t = el.firstChild;
  if (t && t.nodeType === Node.TEXT_NODE) (t as Text).data = text;
}

const real = (el: HTMLElement) => Number(el.dataset.v ?? NaN);

/** Показать в числе прежнее значение, пока до него не долетит магия. */
export function hold(el: HTMLElement | null, v: number): void {
  if (!el || calm()) return;
  HELD.add(el);
  setText(el, fmt(v));
}

/** Вернуть числу настоящее значение. */
export function release(el: HTMLElement | null): void {
  if (!el) return;
  HELD.delete(el);
  COUNTERS.delete(el);
  const v = real(el);
  if (!Number.isNaN(v)) setText(el, fmt(v));
}

/** Число досчитывается от from до настоящего значения за dur. */
export function countUp(el: HTMLElement | null, from: number, dur: number): void {
  if (!el) return;
  const to = real(el);
  if (calm() || Number.isNaN(to) || from === to) return release(el);
  HELD.add(el);
  COUNTERS.add(el);
  const t0 = performance.now();
  const step = (now: number) => {
    if (!COUNTERS.has(el)) return;
    const t = Math.min(1, Math.max(0, (now - t0) / dur));
    // Настоящее значение могло измениться, пока число бежит: бежим к нему.
    const target = real(el);
    setText(el, fmt(from + (target - from) * (1 - Math.pow(1 - t, 3))));
    if (t < 1) requestAnimationFrame(step);
    else release(el);
  };
  setText(el, fmt(from));
  requestAnimationFrame(step);
}

/** Все числа сразу на итог. */
export function settleNumbers(): void {
  for (const el of [...HELD]) release(el);
}

// ---------- прерывание ----------

/** Хвост прежнего заклинания гаснет за 0,16 с, числа встают на итог, анимации приложения обрываются. */
function softClear(): void {
  fadeParticles(160);
  settleNumbers();
  for (const el of LIVE) {
    if (el instanceof HTMLElement && el.dataset.fading) continue;
    if (el instanceof HTMLElement) el.dataset.fading = '1';
    try {
      const a = el.animate([{ opacity: getComputedStyle(el).opacity }, { opacity: 0 }], { duration: 160, fill: 'forwards' });
      a.onfinish = () => drop(el);
    } catch {
      drop(el);
    }
  }
  for (const a of [...BOUND]) a.cancel();
}

/** Прервать магию, когда действие отменили: хвост гаснет, числа встают на итог. */
export function interrupt(): void {
  SPELL++;
  softClear();
}

/** Всё временное убрать сразу: смена режима магии. */
function hardClear(): void {
  SPELL++;
  clearParticles();
  settleNumbers();
  for (const el of [...LIVE]) drop(el);
  for (const a of [...ANIMS]) a.cancel();
  ANIMS.clear();
  BOUND.clear();
  if (L.touch) L.touch.textContent = '';
  if (L.dim) for (const a of L.dim.getAnimations()) a.cancel();
}

// ---------- координаты: пиксели CSS от левого верхнего угла приложения ----------

/** Точка элемента: ax, ay от 0 до 1 внутри него. */
export function pt(el: Element, ax = 0.5, ay = 0.5): [number, number] {
  const a = L.app?.getBoundingClientRect();
  const r = el.getBoundingClientRect();
  return [r.left - (a?.left ?? 0) + r.width * ax, r.top - (a?.top ?? 0) + r.height * ay];
}

export function rectIn(el: Element): { x: number; y: number; w: number; h: number } {
  const a = L.app?.getBoundingClientRect();
  const r = el.getBoundingClientRect();
  return { x: r.left - (a?.left ?? 0), y: r.top - (a?.top ?? 0), w: r.width, h: r.height };
}

export function size(): { w: number; h: number } {
  return { w: L.app?.clientWidth ?? 0, h: L.app?.clientHeight ?? 0 };
}

// ---------- подключение слоёв ----------

/** Слои на месте: холст по размеру приложения. Возвращает, как всё отключить. */
export function mountMagic(app: HTMLElement, layers: { dim: HTMLElement; fx: HTMLElement; touch: HTMLElement; canvas: HTMLCanvasElement }, onTap: (e: PointerEvent) => void): () => void {
  L.app = app;
  L.dim = layers.dim;
  L.fx = layers.fx;
  L.touch = layers.touch;
  initParticles(layers.canvas);
  const fit = () => resizeParticles(app.clientWidth, app.clientHeight);
  fit();
  const ro = new ResizeObserver(fit);
  ro.observe(app);
  const tap = (e: PointerEvent) => safe(() => onTap(e));
  app.addEventListener('pointerdown', tap, { capture: true, passive: true });
  return () => {
    ro.disconnect();
    app.removeEventListener('pointerdown', tap, { capture: true });
    hardClear();
    L.app = L.dim = L.fx = L.touch = null;
  };
}
