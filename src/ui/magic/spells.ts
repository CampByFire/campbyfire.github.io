// Заклинания действий игрока: Искра под пальцем, листы и страницы, Победная искра с Лягушачьей удачей
// и Упокоением, Призыв к огню, Привал, Второе дыхание, Отпустить, Разжигание и Восхождение.
// Каждое зовётся сразу после действия. Синхронная часть видит прежний экран (Preact перерисует
// его чуть позже), после nextFrame на странице уже новое состояние, а на экран оно ещё не попало.
import type { CompleteResult } from '../../game/state';
import { SCENE } from '../../scene/scene';
import { EASE, L, anim, aside, calm, cast, countUp, fxNode, hold, mark, off, pt, rectIn, release, safe, size, unmark, type Spell } from './engine';
import {
  $,
  $$,
  esc,
  bump,
  cardIn,
  dissolve,
  drawRunes,
  fadeIn,
  fadeOut,
  figCenter,
  figFeet,
  figImg,
  figPoints,
  fireAt,
  flare,
  flipNumber,
  floatText,
  ghostFig,
  ghostMark,
  glint,
  markOf,
  materialize,
  pillar,
  popIn,
  px,
  ringImg,
  runeRing,
  scene,
  sigilSVG,
  spt,
  sweep,
  wave,
  baseFilter,
} from './kit';
import { burst, flight, spiral } from './particles';

// ---------- Искра под пальцем ----------

/** Кнопки, по которым от пальца расходится рябь. Остальным достаётся круглый отсвет. */
const RIPPLE_HOST = '.btn, .row, .act, .banner, .chipbtn, .wind, .check-row, .card-title-btn, .quest-card, .notice-btn, .toast-btn';

/** Искры под пальцем на любом месте экрана, и на пустом тоже. Рябь или отсвет только у того, что нажимается. */
export function tap(e: PointerEvent): void {
  if (off() || !e.isTrusted || !L.app || !L.touch) return;
  if (e.pointerType === 'mouse' && e.button !== 0) return;
  const a = L.app.getBoundingClientRect();
  const x = e.clientX - a.left;
  const y = e.clientY - a.top;
  if (!calm()) burst(x, y, { n: 4, kind: 'star', pal: 'gold', speed: [50, 100], spread: Math.PI, life: [380, 460], size: [1.3, 2.1], drag: 2.4, gravity: -30, fout: 0.6, keep: true });
  const target = e.target instanceof Element ? e.target : null;
  const el = target?.closest('button, summary, label.check-row, a[href]');
  if (!el || (el as HTMLButtonElement).disabled || el.closest('[inert]')) return;
  const host = el.matches('.tab-add') ? el.firstElementChild : el.closest(RIPPLE_HOST);
  if (host) ripple(host, x, y);
  else bloom(x, y);
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

/**
 * Задача сдана: столб света над спутником у огня, монеты к золоту, звёзды опыта к уровню, трещина в логове.
 * Нежить с дороги упокаивается: белый луч с неба, скелет светлеет и тает, дух уходит к огню.
 */
export function done(id: string, r: CompleteResult, before: Before, level: number): void {
  cast(async (s) => {
    // Прежний экран: нежить ещё стоит на дороге, её копия упокоится на этом месте.
    const sc0 = scene();
    const road = figImg(sc0, id);
    const undead = sc0 && road?.dataset.art?.startsWith('road') ? { g: ghostFig(sc0, road), gm: ghostMark(sc0, id), c: figCenter(sc0, road), feet: figFeet(sc0, road) } : null;
    const ring0 = ringImg(sc0);
    const gRing = undead && ring0 && ring0.dataset.task !== id ? ghostFig(sc0, ring0) : null;
    await s.frame();
    const sc = scene();
    const levelUp = level > before.level;
    const rws = $$('[data-magic^="rw-"]');
    if (calm() || !sc) {
      for (const g of [undead?.g ?? null, undead?.gm ?? null, gRing]) fadeOut(g);
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
    if (undead) {
      fadeOut(gRing, 260);
      purify(sc, undead, img);
    } else if (img && p) {
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

/** Упокоение: номер нежити рассыпается, белый луч падает с неба, скелет светлеет и тает огоньками. */
function purify(sc: Element, u: { g: HTMLElement | null; gm: HTMLElement | null; c: [number, number]; feet: [number, number] }, ring: HTMLElement | null): void {
  const num = u.gm && $('.num', u.gm);
  if (num) {
    const [bx, by] = pt(num);
    anim(num, [{ transform: 'scale(1)', filter: 'brightness(1)' }, { transform: 'scale(1.18)', filter: 'brightness(2.4)', offset: 0.35 }, { transform: 'scale(.5)', filter: 'brightness(1)', opacity: 0 }], { dur: 350, fill: 'forwards' });
    burst(bx, by, { n: 6, kind: 'shard', pal: 'necro', speed: [40, 90], angle: Math.PI / 2, spread: 1.4, gravity: 300, life: [400, 520], size: [2.4, 3.4], delay: 120, vr: 9 });
  }
  fadeOut(u.gm, 120, 300);
  // Луч падает из-под верхней полосы, с неба над поляной.
  const bar = $('.topbar');
  const top = bar ? rectIn(bar).y + rectIn(bar).h : 0;
  pillar(u.c[0], u.feet[1] + 6, 46, u.feet[1] + 6 - top, { holy: true, dur: 700 });
  if (u.g) {
    const b = baseFilter(u.g);
    anim(u.g, [{ filter: `${b} brightness(1) saturate(1)` }, { filter: `${b} brightness(2.7) saturate(.3)` }], { dur: 300, delay: 150 });
    anim(u.g, [{ opacity: 1, transform: 'translateY(0)' }, { opacity: 0, transform: 'translateY(-4%)' }], { dur: 520, delay: 420, ease: EASE.in, remove: true });
  }
  burst(u.c[0], u.c[1], { n: 18, kind: 'glow', pal: 'holy', speed: [20, 60], spread: 0.8, gravity: -90, drag: 0.6, life: [800, 1100], size: [1.6, 3], jx: 14, jy: 28, delay: 400, stagger: 12, sway: 18, tw: 2 });
  // Дух уходит к огню: там упокоенный уже радуется в своём настоящем облике.
  if (!ring) return;
  const rc = figCenter(sc, ring);
  flight(u.c, rc, { n: 8, kind: 'spark', pal: 'holy', delay: 620, stagger: 26, life: 520, arc: 0.25, lift: 0.18, size: [1.8, 2.6], trail: 6 });
  materialize(ring, 1000, 380);
  flare(rc[0], rc[1], 120, { c1: 'rgba(255,255,255,.95)', c2: 'rgba(190,225,255,.4)', delay: 1000, dur: 480, peak: 0.8 });
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

// ---------- Второе дыхание ----------

/** Вечером +30 маны: искры от кнопки спиралью уходят в камень маны, он вспыхивает, рядом всплывает «+30». */
export function wind(manaBefore: number, max: number): void {
  cast(async (s) => {
    const btn = $('.wind');
    const bp = btn ? pt(btn, 0.1, 0.5) : null;
    await s.frame();
    const chip = $('[data-magic="mana"]');
    const gem = $('.mana-gem', chip);
    const n = $('[data-magic="mana-n"]', chip);
    cardIn();
    if (calm() || !chip || !gem) return;
    hold(n, manaBefore);
    const [gx, gy] = pt(gem);
    flight(bp ?? [gx, gy + 140], [gx, gy + 26], { n: 10, kind: 'spark', pal: 'warm', stagger: 28, life: 430, arc: 0.3, lift: 0.15, size: [1.8, 2.6], trail: 6 });
    spiral(gx, gy, { n: 14, r0: 30, r1: 2, turns: 1.3, life: 520, delay: 300, stagger: 14, pal: 'arcane', size: [1.8, 2.6], trail: 5, kind: 'spark' });
    const bar = $('.bar > span', chip);
    if (bar) anim(bar, [{ width: `${(manaBefore / max) * 100}%` }, { width: bar.style.width }], { dur: 520, delay: 520 });
    await s.wait(500);
    flare(gx, gy, 64, { c1: 'rgba(234,241,255,.95)', c2: 'rgba(120,160,255,.45)', dur: 420 });
    anim(gem, [{ transform: 'rotate(45deg) scale(1)', filter: 'brightness(1)' }, { transform: 'rotate(45deg) scale(1.5)', filter: 'brightness(2.2)', offset: 0.3 }, { transform: 'rotate(45deg) scale(1)', filter: 'brightness(1)' }], { dur: 400, fill: 'none' });
    await s.wait(20);
    countUp(n, manaBefore, 500);
    // Над камнем столько, сколько маны прибавилось на деле: у полной полоски меньше тридцати.
    const gain = Math.round(Number(n?.dataset.v ?? manaBefore) - manaBefore);
    if (gain > 0) floatText(gx + 30, gy + 24, `+${gain}`, { c: '#d6e4ff', g: 'rgba(91,140,255,.85)', dur: 680, dy: -18 });
    await s.wait(700);
  });
}

// ---------- Отпустить и Вернуть ----------

/** Отпустить: спутник тает дымком, номер над ним гаснет. */
export function letGo(id: string): void {
  cast(async (s) => {
    const sc = scene();
    const img = figImg(sc, id);
    const p = sc && img ? figCenter(sc, img) : null;
    const atFire = !!img?.dataset.art?.startsWith('ring/');
    const g = ghostFig(sc, img);
    const gm = ghostMark(sc, id);
    await s.frame();
    if (atFire) cardIn();
    if (calm() || !sc?.isConnected) {
      fadeOut(g);
      fadeOut(gm);
      return;
    }
    fadeOut(gm, 250);
    anim($('.num', gm), [{ transform: 'scale(1)' }, { transform: 'scale(.7)' }], { dur: 250, fill: 'forwards' });
    if (g) {
      const b = baseFilter(g);
      anim(g, [{ opacity: 1, filter: `${b} grayscale(0) blur(0px)`, transform: 'translateY(0)' }, { opacity: 0, filter: `${b} grayscale(1) blur(2px)`, transform: 'translateY(-3%)' }], { dur: 600, ease: EASE.in, remove: true });
    }
    if (p) burst(p[0], p[1], { n: 9, kind: 'smoke', pal: 'smoke', speed: [10, 30], spread: 0.9, gravity: -30, drag: 0.5, life: [700, 900], size: [8, 13], grow: 2.2, jx: 14, jy: 22, stagger: 40, a: 0.85, fout: 0.6 });
    await s.wait(900);
  });
}

/** Вернуть: дымок стягивается обратно, и спутник проступает на своём месте. */
export function comeBack(id: string): void {
  cast(async (s) => {
    await s.frame();
    const sc = scene();
    const img = figImg(sc, id);
    if (!sc || !img) return;
    if (img.dataset.art?.startsWith('ring/')) cardIn();
    if (calm()) return void fadeIn(img, 150);
    const [x, y] = figCenter(sc, img);
    spiral(x, y, { n: 10, kind: 'smoke', pal: 'smoke', r0: 44, r1: 6, turns: 0.4, life: 520, size: [7, 11], trail: 0, fout: 0.5 });
    const b = baseFilter(img);
    anim(img, [{ opacity: 0, filter: `${b} grayscale(1) blur(2px)` }, { opacity: 1, filter: `${b} grayscale(0) blur(0px)` }], { dur: 500, delay: 200 });
    popIn($('.num', markOf(sc, id)), 520);
    await s.wait(800);
  });
}

// ---------- Разжигание ----------

/**
 * Разжечь костёр: лагерь открывается ещё тлеющим, огонь вспыхивает, искры от него зажигают номера спутников
 * по очереди, от ближних к дальним. Опыт за план летит звёздами от сообщения к уровню.
 */
export function ignite(xp: number, from: number, to: number): void {
  cast(async (s) => {
    // Прежний экран: кнопка в Плане.
    const btn = $('.page-foot .btn-gold');
    if (btn && !calm()) {
      const [bx, by] = pt(btn);
      burst(bx, by - 4, { n: 14, kind: 'star', pal: 'gold', speed: [90, 190], spread: 0.9, gravity: 260, drag: 0.8, life: [500, 800], size: [1.6, 3] });
    }
    await s.frame();
    const sc = scene();
    const levelUp = to > from;
    if (calm() || !sc) {
      if (levelUp) ascend(from, to, true);
      return;
    }
    const lvlN = $('[data-magic="level-n"]');
    if (levelUp) hold(lvlN, from);
    mark(sc, 'is-unlit');
    for (const n of [...$$('.fig-mark .num:not(.num-undead)', sc), ...$$('.camp > .sheet .card .num')]) mark(n, 'is-dim');
    // Пока страница перелистывается, костёр тлеет.
    await s.wait(380);
    unmark(sc, 'is-unlit');
    const [fx, fy] = fireAt(sc);
    flare(fx, fy + 12, 210, { dur: 700, peak: 0.95 });
    burst(fx, fy, { n: 26, kind: 'glow', pal: 'ember', speed: [90, 210], spread: 0.75, gravity: -30, drag: 1, life: [600, 1000], size: [1.6, 3] });
    await s.wait(50);
    wave(fx, fy + 18, 230, 'warm-fill', { dur: 900, from: 0.1, squash: 0.62, a: 0.9 });
    wave(fx, fy + 18, 210, '', { dur: 900, from: 0.1, squash: 0.62, delay: 60 });
    await s.wait(50);
    const nums = $$('.num.is-dim', sc)
      .map((n) => ({ n, p: pt(n) }))
      .sort((a, b) => Math.hypot(a.p[0] - fx, a.p[1] - fy) - Math.hypot(b.p[0] - fx, b.p[1] - fy));
    nums.forEach(({ n, p }, i) =>
      flight([fx, fy - 6], p, {
        n: 3,
        kind: 'spark',
        pal: 'gold',
        delay: i * 95,
        stagger: 30,
        life: 420,
        arc: 0.25,
        lift: 0.2,
        size: [1.8, 2.6],
        trail: 6,
        onFirst: () => {
          unmark(n, 'is-dim');
          bump(n, 1.3, { dur: 360 });
          glint(p[0], p[1] - 2, { s: 0.8 });
        },
      }),
    );
    await s.wait(500 + nums.length * 95);
    for (const n of $$('.num.is-dim')) unmark(n, 'is-dim');
    const t = $('.toast');
    const lv = $('[data-magic="level"]');
    if (!xp || !t || !lv) {
      if (levelUp) ascend(from, to, true);
      return;
    }
    const lp = pt(lv);
    flight(pt(t, 0.5, 0.5), lp, {
      n: 5,
      kind: 'star',
      pal: 'holy',
      stagger: 50,
      life: 520,
      size: [2, 2.8],
      trail: 6,
      arc: 0.25,
      lift: 0.2,
      onLast: () => {
        bump(lv, 1.12);
        glint(lp[0], lp[1] - 3, { col: '#eaf6ff' });
        if (levelUp) ascend(from, to, true);
      },
    });
    await s.wait(800);
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

/** Искра за старт или уголёк: тёплые искры летят от таймера к уровню героя, над ним всплывает опыт. */
export function kindle(xp: number): void {
  cast(async (s) => {
    await s.frame();
    const from = $('.timer');
    const chip = $('[data-magic="level"]');
    if (calm() || !from || !chip) return;
    const [fx, fy] = pt(from, 0.15, 0.5);
    const [lx, ly] = pt(chip);
    flight([fx, fy], [lx, ly + 10], { n: 9, kind: 'spark', pal: 'warm', stagger: 30, life: 460, arc: 0.35, lift: 0.2, size: [1.8, 2.8], trail: 6 });
    await s.wait(460);
    flare(lx, ly, 48, { c1: 'rgba(255,236,190,.95)', c2: 'rgba(255,170,70,.45)', dur: 380 });
    floatText(lx, ly + 22, `+${xp}`, { c: '#ffe2a8', g: 'rgba(255,150,60,.85)', dur: 680, dy: -18 });
    await s.wait(700);
  });
}

// ---------- Лавка ----------

/**
 * Покупка в лавке: монеты из кошеля летят к награде, число в кошеле сбегает вниз, над ним всплывает цена,
 * а награда вспыхивает звёздами. id: награда, goldBefore: золото до покупки.
 */
export function spend(id: string, goldBefore: number, price: number): void {
  cast(async (s) => {
    // Прежний экран: кнопка «Купить» ещё на месте, после покупки она может пропасть.
    const btn = $(`[data-buy="${esc(id)}"]`);
    const to = btn ? pt(btn) : null;
    await s.frame();
    const purse = $('[data-magic="purse"]');
    const n = $('[data-magic="purse-n"]', purse);
    if (calm() || !purse || !n) return;
    hold(n, goldBefore);
    const from = pt(purse, 0.12, 0.5);
    const [nx, ny] = pt(n.parentElement ?? n, 1, 0.5);
    floatText(nx + 30, ny, `−${price.toLocaleString('ru-RU')}`, { c: '#ffe08a', g: 'rgba(241,196,90,.7)', dur: 900, dy: -22 });
    countUp(n, goldBefore, 600);
    bump(purse, 1.03, { dur: 260 });
    if (!to) return;
    flight(from, to, {
      n: Math.max(4, Math.min(12, Math.round(price / 60))),
      kind: 'coin',
      size: [3.8, 5],
      stagger: 34,
      life: 520,
      arc: 0.28,
      lift: 0.16,
      trail: 0,
      spin: 10,
      onLast: () => {
        flare(to[0], to[1], 110, { dur: 520, peak: 0.75 });
        burst(to[0], to[1], { n: 22, kind: 'star', pal: 'gold', speed: [120, 230], spread: Math.PI, gravity: 260, drag: 0.8, life: [650, 900], size: [1.8, 3.2], tw: 2.5 });
        glint(to[0], to[1] - 6, { s: 1.1 });
      },
    });
    await s.wait(1200);
  });
}

