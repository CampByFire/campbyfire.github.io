// Заклинания жизни лагеря: то, что случается не от нажатия на кнопку дня. Нежить встаёт на дороге,
// вестник приносит письмо, новый спутник приходит к огню, сумерки, отбой и падение логова.
// Приход нежити, письма и спутника лагерь показывает, когда его видно без листа поверх (campShown).
import { questHex } from '../../game/color';
import { lightOf, shiftAt, type Light } from '../../game/time';
import type { QuestColor, State } from '../../game/types';
import type { CampView } from '../../game/view';
import { loadLocal, updateLocal } from '../local';
import { EASE, L, anim, calm, cast, countUp, drop, fxNode, hold, own, pt, rectIn, release, safe, size } from './engine';
import {
  $,
  $$,
  arcFrames,
  baseFilter,
  cardIn,
  dissolve,
  esc,
  fadeIn,
  fadeOut,
  fadeUp,
  figCenter,
  figFeet,
  figImg,
  figPoints,
  flipNumber,
  gIcon,
  ghostFig,
  ghostMark,
  glint,
  lIcon,
  markOf,
  materialize,
  popIn,
  px,
  runeRing,
  scene,
  spt,
  sweep,
} from './kit';
import { along, burst, flight, rain } from './particles';

// ---------- что лагерь покажет, когда его будет видно ----------

/** Письмо и новые спутники ждут, пока лагерь покажется без листа, но не дольше этого. */
const ARRIVAL_MS = 15_000;
let letterFrom: { count: number; at: number } | null = null;
const joining = new Map<string, number>();
/** Нежить, которая уже вставала на этом устройстве: второй раз она не встаёт. */
let risen: string[] | null = null;
const RISEN_KEEP = 60;

/** Вестник принёс письмо: сколько писем было до него. */
export function expectLetter(countBefore: number): void {
  letterFrom = { count: countBefore, at: performance.now() };
}

/** Письмо разобрано «На сегодня»: спутник придёт к огню, когда лагерь будет видно. */
export function expectJoin(id: string): void {
  joining.set(id, performance.now());
}

/**
 * Лагерь нарисован (зовётся после каждой отрисовки, до того как кадр попал на экран).
 * Если поверх нет листа, здесь встаёт новая нежить, прилетает письмо и приходят новые спутники.
 */
export function campShown(v: CampView, covered: boolean): void {
  safe(() => {
    if (covered || !L.app) return;
    const now = performance.now();
    const road = v.road.map((r) => r.task.id);
    if (road.length) {
      risen ??= loadLocal(Date.now()).risen ?? [];
      const seen = risen;
      const fresh = road.filter((id) => !seen.includes(id));
      if (fresh.length) {
        risen = [...seen, ...fresh].slice(-RISEN_KEEP);
        const keep = risen;
        updateLocal(Date.now(), (l) => {
          l.risen = keep;
        });
        rise(fresh);
      }
    }
    const come = [...joining].filter(([, at]) => now - at < ARRIVAL_MS).map(([id]) => id);
    joining.clear();
    if (come.length) join(come);
    const letter = letterFrom && now - letterFrom.at < ARRIVAL_MS ? letterFrom.count : null;
    letterFrom = null;
    if (letter !== null && v.inbox > letter) letterArrives(letter);
  });
}

// ---------- Нежить встаёт ----------

/** Срок прошёл: на дороге клубится красный туман, скелет поднимается из земли. */
function rise(ids: string[]): void {
  cast(
    async (s) => {
      const sc = scene();
      if (!sc) return;
      ids.forEach((id, i) => {
        const img = figImg(sc, id);
        if (!img) return;
        if (calm()) return void fadeIn(img, 150);
        const d = 150 + i * 240;
        const [fx, fy] = figFeet(sc, img);
        const mist = fxNode('mist', L.fx, { left: px(fx - 60), top: px(fy - 66), width: '120px', height: '92px' });
        anim(mist, [{ opacity: 0, transform: 'scale(.3)' }, { opacity: 0.95, transform: 'scale(1)', offset: 0.35 }, { opacity: 0.7, transform: 'scale(1.25)', offset: 0.7 }, { opacity: 0, transform: 'scale(1.45)' }], { dur: 800, delay: d - 150, remove: true });
        anim(img, [{ clipPath: 'inset(100% 0 0 0)', transform: 'translateY(6%)' }, { clipPath: 'inset(0% 0 0 0)', transform: 'translateY(0)' }], { dur: 700, delay: d });
        burst(fx, fy - 6, { n: 14, kind: 'glow', pal: 'necro', speed: [30, 90], spread: 1.2, gravity: -50, drag: 1, life: [450, 650], size: [1.5, 2.6], delay: d + 50, stagger: 14, jx: 18 });
        popIn($('.num', markOf(sc, id)), d + 600);
      });
      await s.wait(1100 + ids.length * 240);
    },
    { side: true },
  );
}

// ---------- Вестник ----------

/** Письмо прилетает по дуге с синим искристым хвостом, значок писем подпрыгивает. */
function letterArrives(countBefore: number): void {
  cast(
    async (s) => {
      const sc = scene();
      const badge = sc && $('.scene-letters', sc);
      const n = badge && $('[data-magic="letters-n"]', badge);
      if (!sc || !badge) return;
      // Лист ещё уезжает: письмо прилетает, когда под ним уже видно сцену.
      const wait = 160;
      const fly = 560;
      if (calm()) {
        if (!countBefore) fadeIn(badge, 150);
        return;
      }
      hold(n, countBefore);
      if (!countBefore) anim(badge, [{ opacity: 0 }, { opacity: 1 }], { dur: 160, delay: wait + fly - 60 });
      const to = pt(badge, 0.3, 0.45);
      const from: [number, number] = [-24, Math.max(40, to[1] - 50)];
      const lift = 70;
      const env = fxNode('letter-fly', L.fx, null, lIcon('envelope', 28, 2));
      anim(env, arcFrames(from[0], from[1], to[0], to[1], lift, 16, (t) => `rotate(${(-18 + 18 * t).toFixed(1)}deg) scale(${(1.2 - 0.4 * t).toFixed(2)})`), { dur: fly, delay: wait, ease: 'linear', remove: true });
      along({ x0: from[0], y0: from[1], cx: (from[0] + to[0]) / 2, cy: Math.min(from[1], to[1]) - lift, x1: to[0], y1: to[1] }, { n: 9, cols: ['#eaf1ff', '#8fb0ff'], life: fly, delay: wait + 30, stagger: 18 });
      await s.wait(wait + fly - 30);
      flipNumber(n, 280);
      anim(badge, [{ transform: 'translate(-50%,-100%)' }, { transform: 'translate(-50%,-100%) translateY(-7px) scale(1.1)', offset: 0.4 }, { transform: 'translate(-50%,-100%)' }], { dur: 300, fill: 'none' });
      glint(to[0] + 12, to[1] - 10, { s: 0.9, col: '#eaf1ff' });
      burst(to[0], to[1], { n: 6, kind: 'star', pal: 'arcane', speed: [40, 90], spread: Math.PI, life: [350, 450], size: [1.4, 2.2], drag: 2.6 });
      await s.wait(300);
      release(n);
    },
    { side: true },
  );
}

// ---------- Новый спутник ----------

/** Письмо разобрано на сегодня: на свободном месте вспыхивает зелёный круг рун, и спутник выходит из света. */
function join(ids: string[]): void {
  cast(
    async (s) => {
      const sc = scene();
      if (!sc) return;
      let shown = 0;
      for (const id of ids) {
        const img = figImg(sc, id);
        const p = img && figPoints(img);
        if (!img || !p) continue;
        if (calm()) {
          fadeIn(img, 150);
          continue;
        }
        const d = 160 + shown++ * 260;
        runeRing(sc, p.feet[0], p.feet[1], { size: 210, delay: d + 150, dur: 750, col: '#cfe6a0' });
        materialize(img, d + 300, 350);
        const [cx, cy] = figCenter(sc, img);
        burst(cx, cy, { n: 10, kind: 'star', pal: 'nature', speed: [40, 90], spread: 1.2, gravity: -40, drag: 1.5, life: [420, 600], size: [1.4, 2.4], delay: d + 300, jx: 10, jy: 14 });
        popIn($('.num', markOf(sc, id)), d + 550);
      }
      if (!shown) return;
      const badge = $('.scene-letters', sc);
      await s.wait(700);
      if (badge?.isConnected) {
        const [bx, by] = pt(badge);
        glint(bx + 10, by - 10, { s: 0.8 });
      }
      await s.wait(300 + shown * 260);
    },
    { side: true },
  );
}

// ---------- Сумерки ----------

/** Свет на сцене сейчас: после отбоя всегда ночь. */
export function lightNow(s: State, now: number): Light {
  if (s.closedDay === s.day) return 'night';
  return lightOf(shiftAt(now, s.settings), now, s.settings);
}

/**
 * Свет сменился, пока лагерь на экране. Зовётся до перерисовки: копии неба и фигур остаются
 * в прежнем свете, а новое небо наплывает поверх. К ночи спутники ложатся по очереди, загораются светлячки.
 */
export function dusk(to: Light): void {
  cast(
    async (s) => {
      const sc = scene();
      const wrap = sc?.closest('.scene-wrap');
      if (!sc || !wrap) return;
      // Прежнее небо ложится под настоящее: Preact своих картинок не двигает, а чужой узел в начале не трогает.
      const skies = [$('.scene-bg', sc), $('.scene-blur', wrap)].flatMap((el) => {
        if (!el?.parentElement) return [];
        const old = own(el.cloneNode(false) as HTMLElement);
        el.parentElement.prepend(old);
        return [{ el, old }];
      });
      const figs = $$<HTMLImageElement>('img.fig', sc).map((img) => ({ id: img.dataset.task ?? null, g: ghostFig(sc, img, { keepLight: true, inPlace: true }) }));
      await s.frame();
      const slow = calm() ? 700 : 1600;
      for (const { el, old } of skies) {
        if (!el.isConnected) {
          drop(old);
          continue;
        }
        anim(el, [{ opacity: 0 }, { opacity: 1 }], { dur: slow, ease: EASE.float, then: () => drop(old) });
        window.setTimeout(() => drop(old), slow + 400);
      }
      // Фигуры меняют позу по очереди: копия в прежнем свете гаснет, настоящая проступает.
      let i = 0;
      for (const { id, g } of figs) {
        if (!g) continue;
        const now = id ? figImg(sc, id) : $('img.fig:not([data-task])', sc);
        const delay = calm() || !id ? 0 : 200 + i++ * 150;
        const dur = calm() ? 500 : id ? 600 : slow;
        fadeOut(g, dur, delay);
        if (now) anim(now, [{ opacity: 0 }, { opacity: 1 }], { dur, delay, ease: EASE.float });
      }
      if (to === 'night') {
        const banner = $('.camp > .sheet > .banner');
        if (calm()) fadeIn(banner, 300);
        else fadeUp(banner, 900);
        for (const zz of $$('.zz', sc)) fadeIn(zz, 300, calm() ? 0 : 700);
      }
      await s.wait(slow + 300);
    },
    { side: true },
  );
}

// ---------- Отбой ----------

/** Отбой: спутники уходят в палатки дорожками пыли, оставленные на завтра ложатся, оседает сонная пыль, итоги дня досчитываются. */
export function bedtime(keep: string[]): void {
  cast(async (s) => {
    const sc = scene();
    if (!sc) return;
    const before = $$<HTMLImageElement>('img.fig[data-task]', sc).map((img) => ({ id: img.dataset.task!, art: img.dataset.art ?? '', p: figCenter(sc, img), g: ghostFig(sc, img, { keepLight: true, inPlace: true }), gm: ghostMark(sc, img.dataset.task) }));
    await s.frame();
    cardIn();
    const nums = $$('[data-magic^="night-"]');
    if (calm() || !sc.isConnected) {
      for (const b of before) {
        fadeOut(b.g, 300);
        fadeOut(b.gm, 300);
      }
      return;
    }
    for (const el of nums) hold(el, 0);
    const box = rectIn(sc.closest('.scene-wrap') ?? sc);
    const tents: [number, number][] = [spt(sc, 110, 330), spt(sc, 700, 320)];
    let leaving = 0;
    for (const b of before) {
      fadeOut(b.gm, 300);
      const now = figImg(sc, b.id);
      if (now && now.dataset.art === b.art) {
        // Спутник остаётся на своём месте: копия просто растворяется в настоящем.
        fadeOut(b.g, 200);
        continue;
      }
      if (now && keep.includes(b.id)) {
        // Остаётся у огня на завтра, но место другое: перелетает пылью и проступает уже лёжа.
        dissolve(b.g, { dur: 420, bright: 1.6 });
        flight(b.p, figCenter(sc, now), { n: 8, kind: 'glow', pal: 'dust', life: 520, stagger: 30, size: [1.6, 2.4], arc: 0.3, lift: 0.15, trail: 5 });
        materialize(now, 420, 480);
        continue;
      }
      if (!b.g) continue;
      // Уходит в ближнюю палатку.
      const tent = b.p[0] < box.x + box.w / 2 ? tents[0] : tents[1];
      const dx = (tent[0] - b.p[0]) * 0.22;
      const dy = (tent[1] - b.p[1]) * 0.22;
      const f = baseFilter(b.g);
      const d = 100 + leaving++ * 120;
      anim(b.g, [{ opacity: 1, transform: 'translate(0,0)', filter: `${f} blur(0px)` }, { opacity: 0, transform: `translate(${px(dx)}, ${px(dy)}) scale(.92)`, filter: `${f} blur(1.5px)` }], { dur: 800, delay: d, ease: EASE.in, remove: true });
      flight(b.p, tent, { n: 6, kind: 'glow', pal: 'dust', delay: d, stagger: 45, life: 760, size: [1.4, 2.2], arc: 0.2, lift: 0.1, trail: 4, fout: 0.5 });
    }
    rain(box.x + 10, box.x + box.w - 10, { n: 30, kind: 'glow', pal: 'dust', y: box.y + 46, speed: [14, 30], gravity: 8, drag: 0.1, sway: 14, over: 600, delay: 400, life: [900, 1200], size: [1.3, 2.3], tw: 1.5, fout: 0.5 });
    await s.wait(500);
    for (const el of nums) countUp(el, 0, 700);
    await s.wait(1300);
  });
}

// ---------- Падение логова ----------

function pennantSVG(color: string): string {
  const id = `pg${Math.random().toString(36).slice(2, 7)}`;
  return `<svg viewBox="0 0 180 250" aria-hidden="true">
    <defs><linearGradient id="${id}" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="${color}"/><stop offset="1" stop-color="#1d1430"/></linearGradient></defs>
    <path d="M18 14H162V204L90 240L18 204Z" fill="url(#${id})" stroke="#ffd76a" stroke-width="4" stroke-linejoin="round"/>
    <path d="M30 26H150V196L90 226L30 196Z" fill="none" stroke="rgba(255,236,170,.55)" stroke-width="2"/>
    <g transform="translate(50 62)" color="#ffe9a8">${gIcon('kingdom', 80)}</g>
    <rect x="4" y="4" width="172" height="13" rx="6.5" fill="#b98a2e" stroke="#ffd76a" stroke-width="2"/>
  </svg>`;
}

/** Логово пало: знамя разворачивается, идёт золотой дождь, знамя улетает в зал трофеев. */
export function lairFall(questId: string, name: string, color: QuestColor): void {
  cast(async (s) => {
    await s.frame();
    const row = $(`.trophy[data-quest="${esc(questId)}"]`);
    if (calm()) {
      fadeIn(row, 300);
      return;
    }
    if (row) {
      row.scrollIntoView({ block: 'nearest' });
      // Строка ждёт знамя.
      anim(row, [{ opacity: 0 }, { opacity: 0 }], { dur: 2050 });
    }
    const { w } = size();
    if (L.dim) anim(L.dim, [{ opacity: 0 }, { opacity: 0.8, offset: 0.12 }, { opacity: 0.8, offset: 0.78 }, { opacity: 0 }], { dur: 2500, ease: 'linear' });
    const bar = $('.page-title') ?? $('.topbar');
    const top = bar ? Math.max(24, rectIn(bar).y) : 64;
    const pen = fxNode('pennant', L.fx, { top: px(top) }, pennantSVG(questHex(color)));
    anim(pen, [{ transform: 'scaleY(0) rotate(0deg)', opacity: 0 }, { transform: 'scaleY(1.04) rotate(-2deg)', opacity: 1, offset: 0.6 }, { transform: 'scaleY(.98) rotate(1.5deg)', opacity: 1, offset: 0.8 }, { transform: 'scaleY(1) rotate(0deg)', opacity: 1 }], { dur: 650, delay: 100 });
    await s.wait(300);
    rain(10, w - 10, { n: 60, kinds: ['coin', 'coin', 'star'], pal: 'gold', y: -12, speed: [90, 170], gravity: 170, over: 900, life: [900, 1200], size: [3.2, 5], sway: 20 });
    await s.wait(200);
    const txt = fxNode('lvl-text is-gold', L.fx, { top: px(top + 268) }, '<b>Логово пало!</b><small></small>');
    const small = txt?.querySelector('small');
    if (small) small.textContent = name;
    anim(txt, [{ opacity: 0, transform: 'translateX(-50%) scale(.75)' }, { opacity: 1, transform: 'translateX(-50%) scale(1.03)', offset: 0.3 }, { opacity: 1, transform: 'translateX(-50%) scale(1)' }], { dur: 500 });
    await s.wait(1000);
    anim(txt, [{ opacity: 1 }, { opacity: 0 }], { dur: 300, remove: true });
    await s.wait(100);
    const to = row?.isConnected ? pt(row, 0.08, 0.5) : [40, size().h * 0.7];
    if (pen) {
      const r = rectIn(pen);
      const dx = to[0] - (r.x + r.w / 2);
      const dy = to[1] - (r.y + r.h / 2);
      anim(pen, [{ transform: 'translate(0,0) scale(1)', opacity: 1 }, { transform: `translate(${px(dx)}, ${px(dy)}) scale(.12)`, opacity: 0.2 }], { dur: 600, ease: EASE.in, remove: true });
    }
    await s.wait(560);
    if (row?.isConnected) {
      anim(row, [{ opacity: 0, clipPath: 'inset(0 100% 0 0)' }, { opacity: 1, clipPath: 'inset(0 0% 0 0)' }], { dur: 420 });
      sweep(row, { delay: 200, dur: 700 });
      glint(to[0], to[1] - 4, { s: 1.2, delay: 160 });
      burst(to[0], to[1], { n: 12, kind: 'star', pal: 'gold', speed: [60, 130], ring: true, life: [400, 600], size: [1.6, 2.6], drag: 2.4 });
    }
    await s.wait(500);
  });
}
