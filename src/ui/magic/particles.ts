// Холст частиц: один на всё приложение. Кадры идут, только пока живут частицы, потом холст засыпает.
// Координаты в пикселях CSS от левого верхнего угла приложения.

export type Palette = keyof typeof PAL;
type Kind = 'glow' | 'star' | 'spark' | 'coin' | 'shard' | 'smoke';
type Range = number | [number, number];
type Ease = 'in' | 'out' | 'lin' | 'inout';

const PAL = {
  gold: ['#fff4c8', '#ffd76a', '#ffc04d', '#ff9a4a'],
  arcane: ['#eaf1ff', '#bcd3ff', '#8fb0ff', '#5b8cff'],
  holy: ['#ffffff', '#fff3d0', '#d8efff', '#a9dcff'],
  necro: ['#ffd0c8', '#ffa194', '#ff6a55', '#d64b3c'],
  ember: ['#fff6d6', '#ffc45e', '#ff9a4a'],
  nature: ['#f3ffdf', '#cfe6a0', '#9fd07a', '#6aa84f'],
  warm: ['#ffe8de', '#ffc2b8', '#ff9f8a'],
  smoke: ['#c9ced8', '#aab1bf', '#8b93a3'],
  dust: ['#e9eeff', '#c7d4ff', '#aebfff'],
};

/** Больше частиц одновременно не живёт: самые старые уступают место. */
const MAX = 320;
const SOLID: Partial<Record<Kind, true>> = { coin: true, shard: true, smoke: true };
const TAU = Math.PI * 2;

interface Particle {
  kind: Kind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  ax: number;
  ay: number;
  drag: number;
  /** Возраст в мс; меньше нуля, пока частица ждёт своей очереди. */
  age: number;
  life: number;
  r0: number;
  r1: number;
  a: number;
  fin: number;
  fout: number;
  col: string;
  rot: number;
  vr: number;
  /** Мерцание: сколько раз в секунду. */
  tw: number;
  trail: number;
  hist?: number[];
  /** Покачивание вбок, пиксели в секунду, и сколько раз в секунду. */
  sway: number;
  swf: number;
  spin: number;
  ph: number;
  /** Искры касания догорают сами: новое заклинание их не гасит. */
  keep: boolean;
  path?: { x0: number; y0: number; cx: number; cy: number; x1: number; y1: number };
  orbit?: { cx: number; cy: number; r0: number; r1: number; a0: number; turns: number; squash: number };
  ease: Ease;
  fade?: { t0: number; len: number };
  onArrive?: (() => void) | null;
}

let cv: HTMLCanvasElement | null = null;
let g: CanvasRenderingContext2D | null = null;
let res = 1;
let parts: Particle[] = [];
let raf = 0;
/** Кадр идёт: частицы из откликов полётов не заводят второй цикл кадров. */
let inTick = false;
let last = 0;
/** Спокойная магия и без анимаций: частиц нет, отклики полётов срабатывают сразу. */
let still = false;
const cache = new Map<string, HTMLCanvasElement>();

const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const jit = (v: number) => (Math.random() - 0.5) * 2 * v;
const range = (v: Range | undefined, d: number) => (Array.isArray(v) ? rnd(v[0], v[1]) : v ?? d);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const pick = (p: Palette) => PAL[p][(Math.random() * PAL[p].length) | 0];

function rgba(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

function ease(name: Ease, t: number): number {
  if (name === 'in') return t * t * t;
  if (name === 'out') return 1 - Math.pow(1 - t, 3);
  if (name === 'lin') return t;
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/** Готовые картинки свечения, звезды и дыма: рисуются один раз на цвет. */
function sprite(kind: 'glow' | 'star' | 'smoke', col: string): HTMLCanvasElement {
  const key = kind + col;
  const hit = cache.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d');
  if (x && kind === 'glow') {
    const gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.16, rgba(col, 0.95));
    gr.addColorStop(0.42, rgba(col, 0.32));
    gr.addColorStop(1, rgba(col, 0));
    x.fillStyle = gr;
    x.fillRect(0, 0, 64, 64);
  } else if (x && kind === 'smoke') {
    const gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, rgba(col, 0.5));
    gr.addColorStop(0.5, rgba(col, 0.24));
    gr.addColorStop(1, rgba(col, 0));
    x.fillStyle = gr;
    x.fillRect(0, 0, 64, 64);
  } else if (x) {
    x.translate(32, 32);
    for (const horiz of [true, false]) {
      const gr = horiz ? x.createLinearGradient(-31, 0, 31, 0) : x.createLinearGradient(0, -31, 0, 31);
      gr.addColorStop(0, rgba(col, 0));
      gr.addColorStop(0.5, 'rgba(255,255,255,1)');
      gr.addColorStop(1, rgba(col, 0));
      x.fillStyle = gr;
      if (horiz) x.fillRect(-31, -1.4, 62, 2.8);
      else x.fillRect(-1.4, -31, 2.8, 62);
    }
    const gr = x.createRadialGradient(0, 0, 0, 0, 0, 13);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.35, rgba(col, 0.8));
    gr.addColorStop(1, rgba(col, 0));
    x.fillStyle = gr;
    x.beginPath();
    x.arc(0, 0, 13, 0, TAU);
    x.fill();
  }
  cache.set(key, c);
  return c;
}

export function initParticles(canvas: HTMLCanvasElement): void {
  cv = canvas;
  g = canvas.getContext('2d');
}

/** Холст по размеру приложения, плотность пикселей не выше 2. */
export function resizeParticles(w: number, h: number): void {
  if (!cv) return;
  res = Math.min(2, window.devicePixelRatio || 1);
  cv.width = Math.max(1, Math.round(w * res));
  cv.height = Math.max(1, Math.round(h * res));
}

export function setStill(v: boolean): void {
  still = v;
  if (v) clearParticles();
}

export function particleCount(): number {
  return parts.length;
}

function add(p: Partial<Particle>): void {
  if (!cv || !g) return;
  const q: Particle = {
    kind: 'glow',
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    ax: 0,
    ay: 0,
    drag: 0,
    age: 0,
    life: 600,
    r0: 3,
    r1: 2,
    a: 1,
    fin: 0.12,
    fout: 0.4,
    col: '#ffd76a',
    rot: 0,
    vr: 0,
    tw: 0,
    trail: 0,
    sway: 0,
    swf: 1,
    spin: 0,
    ph: Math.random() * TAU,
    keep: false,
    ease: 'inout',
    ...p,
  };
  if (q.trail) q.hist = [];
  if (parts.length >= MAX) parts.splice(0, parts.length - MAX + 1);
  parts.push(q);
  if (!raf && !inTick) {
    last = performance.now();
    raf = requestAnimationFrame(tick);
  }
}

function alpha(p: Particle): number {
  const t = p.age / p.life;
  let a = p.a;
  if (t < p.fin) a *= t / p.fin;
  else if (t > 1 - p.fout) a *= Math.max(0, (1 - t) / p.fout);
  if (p.tw) a *= 0.55 + 0.45 * Math.sin(p.ph + (p.age / 1000) * p.tw * TAU);
  if (p.fade) a *= Math.max(0, 1 - (p.age - p.fade.t0) / p.fade.len);
  return a;
}

function move(p: Particle, dt: number): void {
  const s = dt / 1000;
  if (p.path) {
    const t = ease(p.ease, Math.min(1, p.age / p.life));
    const u = 1 - t;
    const P = p.path;
    p.x = u * u * P.x0 + 2 * u * t * P.cx + t * t * P.x1;
    p.y = u * u * P.y0 + 2 * u * t * P.cy + t * t * P.y1;
  } else if (p.orbit) {
    const O = p.orbit;
    const t = Math.min(1, p.age / p.life);
    const r = lerp(O.r0, O.r1, ease('in', t));
    const a = O.a0 + O.turns * TAU * ease('out', t);
    p.x = O.cx + Math.cos(a) * r;
    p.y = O.cy + Math.sin(a) * r * O.squash;
  } else {
    p.vx += p.ax * s;
    p.vy += p.ay * s;
    if (p.drag) {
      const k = Math.exp(-p.drag * s);
      p.vx *= k;
      p.vy *= k;
    }
    p.x += p.vx * s;
    p.y += p.vy * s;
    if (p.sway) p.x += Math.cos(p.ph + (p.age / 1000) * p.swf * TAU) * p.sway * s;
  }
  p.rot += p.vr * s;
  if (p.hist) {
    p.hist.push(p.x, p.y);
    if (p.hist.length > p.trail * 2) p.hist.splice(0, 2);
  }
}

function drawSolid(c: CanvasRenderingContext2D, p: Particle, a: number, r: number): void {
  c.globalAlpha = a;
  if (p.kind === 'smoke') {
    // Дым не светится: мягкое серое облачко, которое растёт и тает.
    c.drawImage(sprite('smoke', p.col), p.x - r, p.y - r, r * 2, r * 2);
    return;
  }
  c.save();
  c.translate(p.x, p.y);
  c.rotate(p.rot);
  if (p.kind === 'coin') {
    // Монета крутится: сжимается по ширине, как на ребре.
    c.scale(Math.max(0.14, Math.abs(Math.cos(p.ph + (p.age / 1000) * p.spin))), 1);
    c.beginPath();
    c.arc(0, 0, r, 0, TAU);
    c.fillStyle = '#eab846';
    c.fill();
    c.lineWidth = Math.max(1, r * 0.24);
    c.strokeStyle = '#9c7419';
    c.stroke();
    c.beginPath();
    c.arc(-r * 0.18, -r * 0.22, r * 0.42, 0, TAU);
    c.fillStyle = 'rgba(255,244,200,.9)';
    c.fill();
  } else {
    c.beginPath();
    c.moveTo(0, -r);
    c.lineTo(r * 0.55, 0);
    c.lineTo(0, r);
    c.lineTo(-r * 0.55, 0);
    c.closePath();
    c.fillStyle = p.col;
    c.fill();
    c.lineWidth = 0.8;
    c.strokeStyle = 'rgba(255,255,255,.7)';
    c.stroke();
  }
  c.restore();
}

function drawGlow(c: CanvasRenderingContext2D, p: Particle, a: number, r: number): void {
  if (p.kind === 'smoke') return;
  if (p.kind === 'coin' || p.kind === 'shard') {
    const k = p.kind === 'coin' ? 2.2 : 1.8;
    c.globalAlpha = a * (p.kind === 'coin' ? 0.4 : 0.5);
    c.drawImage(sprite('glow', p.kind === 'coin' ? '#ffd76a' : p.col), p.x - r * k, p.y - r * k, r * k * 2, r * k * 2);
    return;
  }
  if (p.hist && p.hist.length > 2) {
    const n = p.hist.length / 2;
    for (let i = 0; i < n - 1; i++) {
      const k = (i + 1) / n;
      const rr = r * (0.35 + 0.55 * k);
      c.globalAlpha = a * k * 0.55;
      c.drawImage(sprite('glow', p.col), p.hist[i * 2] - rr * 2, p.hist[i * 2 + 1] - rr * 2, rr * 4, rr * 4);
    }
  }
  c.globalAlpha = a;
  c.drawImage(sprite('glow', p.col), p.x - r * 2, p.y - r * 2, r * 4, r * 4);
  if (p.kind === 'star') {
    const s = r * 5.2;
    c.save();
    c.translate(p.x, p.y);
    c.rotate(p.rot);
    c.drawImage(sprite('star', p.col), -s / 2, -s / 2, s, s);
    c.restore();
  }
}

function tick(now: number): void {
  raf = 0;
  const c = g;
  if (!cv || !c) return;
  inTick = true;
  try {
    const dt = Math.min(48, Math.max(0, now - last));
    last = now;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, cv.width, cv.height);
    c.setTransform(res, 0, 0, res, 0, 0);
    const keep: Particle[] = [];
    const arrived: (() => void)[] = [];
    for (const p of parts) {
      p.age += dt;
      if (p.age < 0) {
        keep.push(p);
        continue;
      }
      if (p.fade && p.age - p.fade.t0 >= p.fade.len) continue;
      if (p.age >= p.life) {
        if (p.onArrive) arrived.push(p.onArrive);
        continue;
      }
      move(p, dt);
      keep.push(p);
    }
    parts = keep;
    for (const pass of [0, 1]) {
      c.globalCompositeOperation = pass ? 'lighter' : 'source-over';
      for (const p of parts) {
        if (p.age < 0) continue;
        const a = alpha(p);
        if (a <= 0.004) continue;
        const r = lerp(p.r0, p.r1, Math.min(1, p.age / p.life));
        if (pass === 0) {
          if (SOLID[p.kind]) drawSolid(c, p, a, r);
        } else drawGlow(c, p, a, r);
      }
    }
    c.globalCompositeOperation = 'source-over';
    c.globalAlpha = 1;
    for (const f of arrived) f();
  } catch (e) {
    // Магия не должна ронять игру: холст просто гаснет.
    console.warn('Магия: холст', e);
    parts = [];
  } finally {
    inTick = false;
  }
  if (parts.length) raf = requestAnimationFrame(tick);
  else {
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, cv.width, cv.height);
  }
}

export interface BurstOptions {
  n?: number;
  kind?: Kind;
  pal?: Palette;
  /** Направление и разброс в радианах; ring раскладывает частицы ровным кругом. */
  angle?: number;
  spread?: number;
  ring?: boolean;
  speed?: Range;
  even?: boolean;
  size?: Range;
  grow?: number;
  life?: Range;
  gravity?: number;
  drag?: number;
  jx?: number;
  jy?: number;
  delay?: number;
  stagger?: number;
  vr?: number;
  tw?: number;
  trail?: number;
  spin?: number;
  /** Покачивание вбок, пиксели в секунду. */
  sway?: number;
  a?: number;
  fin?: number;
  fout?: number;
  keep?: boolean;
}

/** Вспышка частиц из точки. speed в пикселях в секунду. */
export function burst(x: number, y: number, o: BurstOptions = {}): void {
  if (still || !cv) return;
  const n = o.n ?? 12;
  for (let i = 0; i < n; i++) {
    const ang = o.ring ? (i / n) * TAU + jit(0.08) : (o.angle ?? -Math.PI / 2) + jit(o.spread ?? Math.PI);
    const sp = range(o.speed, 90) * (o.even ? 1 : rnd(0.6, 1.1));
    const r0 = range(o.size, 3);
    add({
      kind: o.kind ?? 'star',
      x: x + jit(o.jx ?? 0),
      y: y + jit(o.jy ?? 0),
      vx: Math.cos(ang) * sp,
      vy: Math.sin(ang) * sp,
      ay: o.gravity ?? 0,
      drag: o.drag ?? 1.4,
      age: -((o.delay ?? 0) + i * (o.stagger ?? 0)),
      life: range(o.life, 700) * rnd(0.85, 1.15),
      r0,
      r1: r0 * (o.grow ?? 0.4),
      col: pick(o.pal ?? 'gold'),
      rot: rnd(0, TAU),
      vr: jit(o.vr ?? 3),
      tw: o.tw ?? 0,
      trail: o.trail ?? 0,
      sway: o.sway ?? 0,
      swf: rnd(0.5, 1.2),
      spin: o.spin ?? 8,
      a: o.a ?? 1,
      fin: o.fin ?? 0.08,
      fout: o.fout ?? 0.5,
      keep: !!o.keep,
    });
  }
}

export interface FlightOptions {
  n?: number;
  kind?: Kind;
  pal?: Palette;
  size?: Range;
  grow?: number;
  delay?: number;
  stagger?: number;
  life?: number;
  /** Насколько дуга выгибается вбок и поднимается, в долях длины пути. */
  arc?: number;
  lift?: number;
  side?: number;
  spread?: number;
  land?: number;
  trail?: number;
  spin?: number;
  fout?: number;
  ease?: Ease;
  onFirst?: () => void;
  onEach?: (i: number, got: number) => void;
  onLast?: () => void;
}

/**
 * Полёт частиц от точки к точке по дуге. onFirst, onEach и onLast срабатывают, когда частицы долетают.
 * Без частиц (спокойная магия) все отклики срабатывают сразу.
 */
export function flight(from: [number, number], to: [number, number], o: FlightOptions = {}): void {
  const n = o.n ?? 8;
  let got = 0;
  const arrive = (i: number) => {
    got++;
    if (got === 1) o.onFirst?.();
    o.onEach?.(i, got);
    if (got === n) o.onLast?.();
  };
  if (still || !cv) {
    for (let i = 0; i < n; i++) arrive(i);
    return;
  }
  for (let i = 0; i < n; i++) {
    const x0 = from[0] + jit(o.spread ?? 6);
    const y0 = from[1] + jit(o.spread ?? 6);
    const x1 = to[0] + jit(o.land ?? 2);
    const y1 = to[1] + jit(o.land ?? 2);
    const dx = x1 - x0;
    const dy = y1 - y0;
    const len = Math.hypot(dx, dy) || 1;
    const side = o.side ?? (i % 2 ? 1 : -1);
    const bend = (o.arc ?? 0.25) * len * rnd(0.5, 1.2) * side;
    const size = range(o.size, 3);
    add({
      kind: o.kind ?? 'spark',
      path: { x0, y0, cx: (x0 + x1) / 2 + (-dy / len) * bend, cy: (y0 + y1) / 2 + (dx / len) * bend - (o.lift ?? 0.2) * len, x1, y1 },
      ease: o.ease ?? 'inout',
      x: x0,
      y: y0,
      age: -((o.delay ?? 0) + i * (o.stagger ?? 40)),
      life: (o.life ?? 560) * rnd(0.9, 1.1),
      r0: size,
      r1: size * (o.grow ?? 0.8),
      col: pick(o.pal ?? 'gold'),
      rot: rnd(0, TAU),
      trail: o.trail ?? 5,
      spin: o.spin ?? 9,
      fin: 0.1,
      fout: o.fout ?? 0.06,
      onArrive: () => arrive(i),
    });
  }
}

export interface SpiralOptions {
  n?: number;
  kind?: Kind;
  pal?: Palette;
  r0?: number;
  r1?: number;
  turns?: number;
  squash?: number;
  size?: Range;
  life?: number;
  delay?: number;
  stagger?: number;
  trail?: number;
  fout?: number;
}

/** Частицы по спирали к точке (r1 меньше r0) или от неё. */
export function spiral(cx: number, cy: number, o: SpiralOptions = {}): void {
  if (still || !cv) return;
  const n = o.n ?? 16;
  for (let i = 0; i < n; i++) {
    const size = range(o.size, 3);
    add({
      kind: o.kind ?? 'star',
      orbit: { cx, cy, r0: (o.r0 ?? 70) * rnd(0.85, 1.15), r1: o.r1 ?? 0, a0: (i / n) * TAU + jit(0.25), turns: o.turns ?? 1, squash: o.squash ?? 1 },
      age: -((o.delay ?? 0) + i * (o.stagger ?? 0)),
      life: (o.life ?? 700) * rnd(0.9, 1.1),
      r0: size,
      r1: size * 0.6,
      col: pick(o.pal ?? 'arcane'),
      rot: rnd(0, TAU),
      vr: jit(3),
      trail: o.trail ?? 4,
      fin: 0.15,
      fout: o.fout ?? 0.2,
    });
  }
}

export interface RainOptions {
  n?: number;
  kind?: Kind;
  /** Виды по очереди: монеты вперемешку со звёздами. */
  kinds?: Kind[];
  pal?: Palette;
  /** Откуда падает: высота и разброс по ней. */
  y?: number;
  jy?: number;
  vx?: number;
  speed?: Range;
  gravity?: number;
  drag?: number;
  sway?: number;
  /** За сколько мс выпадает всё. */
  over?: number;
  delay?: number;
  life?: Range;
  size?: Range;
  grow?: number;
  tw?: number;
  fout?: number;
}

/** Дождь сверху между x0 и x1: монеты, искры, сонная пыль. */
export function rain(x0: number, x1: number, o: RainOptions = {}): void {
  if (still || !cv) return;
  const n = o.n ?? 40;
  for (let i = 0; i < n; i++) {
    const r0 = range(o.size, 3);
    add({
      kind: o.kinds ? o.kinds[i % o.kinds.length] : o.kind ?? 'glow',
      x: rnd(x0, x1),
      y: (o.y ?? -10) + jit(o.jy ?? 16),
      vx: jit(o.vx ?? 10),
      vy: range(o.speed, 90),
      ay: o.gravity ?? 50,
      drag: o.drag ?? 0.3,
      sway: o.sway ?? 0,
      swf: rnd(0.3, 0.9),
      age: -rnd(0, o.over ?? 1000) - (o.delay ?? 0),
      life: range(o.life, 1200),
      r0,
      r1: r0 * (o.grow ?? 0.7),
      col: pick(o.pal ?? 'gold'),
      rot: rnd(0, TAU),
      vr: jit(2),
      spin: rnd(4, 9),
      tw: o.tw ?? 0,
      fin: 0.08,
      fout: o.fout ?? 0.3,
    });
  }
}

/** Путь по дуге: из x0, y0 в x1, y1 через точку cx, cy, как у полёта. */
export interface Path {
  x0: number;
  y0: number;
  cx: number;
  cy: number;
  x1: number;
  y1: number;
}

/** Искры бегут по тому же пути, что и летящая картинка: хвост письма. */
export function along(path: Path, o: { n?: number; cols?: string[]; life?: number; delay?: number; stagger?: number; size?: number; trail?: number } = {}): void {
  if (still || !cv) return;
  const n = o.n ?? 8;
  const cols = o.cols ?? PAL.arcane;
  for (let i = 0; i < n; i++) {
    const r0 = o.size ?? 2.2;
    add({
      kind: 'spark',
      path,
      ease: 'lin',
      x: path.x0,
      y: path.y0,
      age: -((o.delay ?? 0) + i * (o.stagger ?? 18)),
      life: o.life ?? 550,
      r0,
      r1: r0 / 2,
      col: cols[i % cols.length],
      trail: o.trail ?? 4,
      fin: 0.05,
      fout: 0.55,
    });
  }
}

/** Хвост прежнего заклинания гаснет за ms, отклики полётов больше не срабатывают. Искры касания догорают сами. */
export function fadeParticles(ms: number): void {
  if (!parts.length) return;
  const keep: Particle[] = [];
  for (const p of parts) {
    if (p.keep) {
      keep.push(p);
      continue;
    }
    p.onArrive = null;
    if (p.age < 0 || ms <= 0) continue;
    if (p.life - p.age > ms && !p.fade) p.fade = { t0: p.age, len: ms };
    keep.push(p);
  }
  parts = keep;
}

export function clearParticles(): void {
  parts = [];
  if (raf) cancelAnimationFrame(raf);
  raf = 0;
  if (cv && g) {
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, cv.width, cv.height);
  }
}
