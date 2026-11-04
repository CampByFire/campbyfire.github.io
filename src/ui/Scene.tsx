// Сцена лагеря: готовая картинка поляны, фигурки отряда и метки поверх.
import { useEffect, useState } from 'preact/hooks';
import { plural } from '../game/time';
import type { CampView, Tone } from '../game/view';
import type { Task } from '../game/types';
import { CLASS_NAME, UNDEAD_NAME } from '../game/words';
import { SCENE, SCENE_H, SCENE_W, assetUrl, pct, spriteKey, type Sprite } from '../scene/scene';
import { LIcon } from './Icon';
import { numLook } from './parts';
import { pick, preloadMask, type Pickable } from './pick';

interface Figure {
  key: string;
  spot: string;
  /** Какая картинка: место, класс и поза. По ней магия находит макушку и ноги фигуры. */
  art: string;
  sprite: Sprite | undefined;
  fallback: string;
  label: string;
  task: Task;
  n: number;
  tone: Tone;
  /** Цвет знамени похода: в него красится номер. */
  color?: string;
  extra?: preact.ComponentChildren;
  pulse?: boolean;
  zz?: boolean;
}

/** Номер над фигурой: 28 px, а нажать можно в круге 44 px, если соседний номер не слишком близко. */
const BADGE = 28;
const BADGE_HIT = 8;
/** Насколько мимо фигуры можно попасть пальцем, в пикселях экрана. */
const FIG_SLOP = 8;

export function Scene(p: {
  view: CampView;
  timer: string | null;
  onTask: (id: string) => void;
  onLetters: () => void;
  /** Сколько пикселей экрана в единице сцены; пока размер неизвестен, не задан. */
  unit?: number;
}) {
  const { view: v } = p;
  const figures: Figure[] = [];

  if (v.ring) {
    const spot = 'ring';
    const art = spriteKey(spot, v.ring.cls, v.ring.pose);
    figures.push({
      key: `ring-${v.ring.task.id}`,
      spot,
      art,
      sprite: SCENE.sprites[art],
      fallback: v.ring.cls,
      label: `${CLASS_NAME[v.ring.cls]} у огня: ${v.ring.task.title}`,
      task: v.ring.task,
      n: v.numbers.get(v.ring.task.id) ?? 0,
      tone: 'current',
      color: v.colors.get(v.ring.task.id),
      pulse: v.ring.pose === 'work',
      extra: p.timer && v.ring.pose !== 'cheer' ? <span class="tag tag-timer" aria-hidden="true">{p.timer}</span> : null,
    });
  }
  for (const f of v.seats) {
    const spot = `seat${f.seat}`;
    const art = spriteKey(spot, f.cls, f.pose);
    figures.push({
      key: `seat-${f.task.id}`,
      spot,
      art,
      sprite: SCENE.sprites[art],
      fallback: f.cls,
      label: `${CLASS_NAME[f.cls]} у костра: ${f.task.title}`,
      task: f.task,
      n: v.numbers.get(f.task.id) ?? 0,
      tone: f.tone,
      color: v.colors.get(f.task.id),
      zz: f.pose === 'lie',
    });
  }
  for (const r of v.road) {
    const spot = `road${r.spot}`;
    const art = spriteKey(spot, `skeleton-${r.rank}`, 'stand');
    figures.push({
      key: `road-${r.task.id}`,
      spot,
      art,
      sprite: SCENE.sprites[art],
      fallback: 'skeleton',
      // Сколько дней просрочено, видно в списке и в карточке: на дороге метки сроков налезали бы друг на друга.
      label: `${UNDEAD_NAME[r.rank]} на дороге, ${r.days} ${plural(r.days, 'день', 'дня', 'дней')}: ${r.task.title}`,
      task: r.task,
      n: v.numbers.get(r.task.id) ?? 0,
      tone: 'undead',
    });
  }

  const bg = SCENE.backgrounds[v.light] ?? SCENE.backgrounds.day;
  const fire = SCENE.fire;
  const msg = SCENE.messenger;
  // Дальние рисуем раньше, ближние поверх, по точке, где фигура стоит: картинки шире фигур из-за теней.
  // Костёр отдельным слоем закрывает тех, кто сидит за ним.
  const sorted = [...figures].sort((a, b) => feetOf(a) - feetOf(b));
  const fireLayer = SCENE.layers?.[`fire/${v.light}`];
  const layers: { key: string; sprite: Sprite; feet: number; f?: Figure }[] = sorted
    .filter((f) => f.sprite)
    .map((f) => ({ key: f.key, sprite: f.sprite!, feet: feetOf(f), f }));
  // Слой костра снят при своём свете, вечерний и ночной фильтры ему не нужны.
  if (fireLayer) layers.push({ key: 'fire', sprite: { ...fireLayer, lit: true }, feet: fire[1] });
  layers.sort((a, b) => a.feet - b.feet);

  // Сама фигура тоже открывает задачу, как номер над ней. Фигура без номера не открывается, как и раньше.
  const pickable: Pickable<string>[] = layers.map((l) => ({ sprite: l.sprite, target: l.f && l.f.n > 0 ? l.f.task.id : undefined }));
  const files = pickable.map((l) => l.sprite.file).join('|');
  useEffect(() => {
    for (const l of pickable) preloadMask(l.sprite.file);
  }, [files]);
  const [hover, setHover] = useState(false);
  const figureAt = (e: MouseEvent): string | undefined => {
    // Номер, письма и другие кнопки сцены нажимаются сами.
    if ((e.target as Element).closest?.('button')) return undefined;
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    if (!r.width || !r.height) return undefined;
    const x = ((e.clientX - r.left) / r.width) * SCENE_W;
    const y = ((e.clientY - r.top) / r.height) * SCENE_H;
    return pick(pickable, x, y, p.unit ? FIG_SLOP / p.unit : 0);
  };

  return (
    <div
      class={`scene light-${v.light}${v.onBreak ? ' is-break' : ''}${v.asleep ? ' is-asleep' : ''}${hover ? ' is-over-fig' : ''}`}
      onClick={(e) => {
        const id = figureAt(e);
        if (id) p.onTask(id);
      }}
      onPointerMove={(e) => {
        if (e.pointerType !== 'mouse') return;
        const over = figureAt(e) !== undefined;
        if (over !== hover) setHover(over);
      }}
      onPointerLeave={() => hover && setHover(false)}
    >
      {bg ? (
        <img class="scene-bg" src={assetUrl(bg)} alt="" draggable={false} />
      ) : (
        <div class="scene-bg scene-bg-fallback" />
      )}
      {/* Земля для магии: круг рун ложится под фигуры. */}
      <div class="scene-ground" aria-hidden="true" />
      <div
        class="scene-fire"
        aria-hidden="true"
        style={{ left: pct(fire[0], SCENE_W), top: pct(fire[1], SCENE_H) }}
      />
      {sorted
        .filter((f) => !f.sprite)
        .map((f) => (
          <FigureFallback key={f.key} f={f} />
        ))}
      {layers.map((l) => (
        <SpriteImg key={l.key} s={l.sprite} undead={l.f?.tone === 'undead'} f={l.f} />
      ))}
      {/* Воздух для магии: копии фигур тают поверх новых мест. Потом угли над костром и светлячки ночью. */}
      <div class="scene-fx" aria-hidden="true" />
      <Embers />
      {v.light === 'night' && <Fireflies />}
      {sorted.map((f) => (
        <FigureBadge key={`b-${f.key}`} f={f} hit={hitOf(f, sorted, p.unit)} onTask={p.onTask} />
      ))}
      {v.inbox > 0 && (
        <button
          class="scene-letters"
          style={{ left: pct(msg[0], SCENE_W), top: pct(msg[1], SCENE_H) }}
          onClick={p.onLetters}
          aria-label={`Письма у вестника: ${v.inbox}`}
          data-magic="letters"
        >
          <LIcon name="envelope" size={16} stroke={2.2} />
          <span data-magic="letters-n" data-v={v.inbox}>
            {v.inbox}
          </span>
        </button>
      )}
    </div>
  );
}

function feetOf(f: Figure): number {
  return SCENE.spots[f.spot]?.[1] ?? (f.sprite ? f.sprite.y + f.sprite.h : 0);
}

function SpriteImg({ s, undead, f }: { s: Sprite; undead: boolean; f?: Figure }) {
  return (
    <img
      class={`fig${undead ? ' fig-undead' : ''}${s.lit ? ' fig-lit' : ''}`}
      src={assetUrl(s.file)}
      alt=""
      draggable={false}
      data-task={f?.task.id}
      data-art={f?.art}
      style={{ left: pct(s.x, SCENE_W), top: pct(s.y, SCENE_H), width: pct(s.w, SCENE_W) }}
    />
  );
}

/** Угли над костром: днём их меньше. Только CSS, без JavaScript. */
function Embers() {
  const [fx, fy] = SCENE.fire;
  return (
    <div class="embers" aria-hidden="true">
      {Array.from({ length: 8 }, (_, i) => {
        const d = 2.4 + ((i * 0.37) % 1.2);
        return (
          <i
            key={i}
            class={i >= 5 ? 'arc' : undefined}
            style={{
              left: pct(fx + (i % 2 ? 1 : -1) * (6 + ((i * 37) % 30)), SCENE_W),
              top: pct(fy - 39 + ((i * 13) % 22), SCENE_H),
              '--s': `${3 + (i % 3)}px`,
              '--d': `${d.toFixed(2)}s`,
              '--dl': `${(-((i * 0.71) % d)).toFixed(2)}s`,
              '--dx': `${((i * 23) % 30) - 15}px`,
              '--dy': `${-(58 + ((i * 17) % 40))}px`,
            }}
          />
        );
      })}
    </div>
  );
}

/** Светлячки ночью: где на поляне, какой путь, сколько секунд путь и мерцание. */
const FIREFLIES: [number, number, string, number, number][] = [
  [118, 300, 'p2', 13, 3.1],
  [640, 250, '', 11, 2.6],
  [86, 560, 'p3 cold', 15, 3.4],
  [712, 520, 'p2', 12, 2.8],
  [236, 690, '', 14, 3.6],
  [560, 716, 'p3', 10, 2.4],
  [300, 236, 'cold', 16, 3.2],
  [176, 410, 'p3', 12.5, 2.9],
  [742, 690, 'p2 cold', 13.5, 3.3],
];

function Fireflies() {
  return (
    <div class="fireflies" aria-hidden="true">
      {FIREFLIES.map(([x, y, c, d, g], i) => (
        <i key={i} class={c || undefined} style={{ left: pct(x, SCENE_W), top: pct(y, SCENE_H), '--d': `${d}s`, '--dl': `${(-i * 1.7).toFixed(1)}s` }}>
          <b style={{ '--g': `${g}s` }} />
        </i>
      ))}
    </div>
  );
}

/** Пока картинки фигур не сняты, на их местах цветные заглушки. */
function FigureFallback({ f }: { f: Figure }) {
  const [x, y] = SCENE.spots[f.spot] ?? [0, 0];
  return <span class={`fig-fallback fig-${f.fallback}`} style={{ left: pct(x, SCENE_W), top: pct(y, SCENE_H) }} />;
}

/** Где над фигурой стоит её номер, в единицах сцены. */
function badgeAt(f: Figure): [number, number] {
  if (f.sprite?.head) return [f.sprite.head[0], f.sprite.head[1] - 4];
  if (f.sprite) return [f.sprite.x + f.sprite.w / 2, f.sprite.y + 6];
  const [x, y] = SCENE.spots[f.spot] ?? [0, 0];
  return [x, y - 40];
}

/**
 * На сколько пикселей невидимая зона нажатия выходит за номер. Соседние номера на маленьком экране
 * стоят тесно, и зона одного не должна накрывать другой: каждому достаётся половина просвета между ними.
 */
function hitOf(f: Figure, all: Figure[], unit: number | undefined): number {
  if (!unit || f.n === 0) return BADGE_HIT;
  const [x, y] = badgeAt(f);
  let gap = Infinity;
  for (const o of all) {
    if (o === f || o.n === 0) continue;
    const [ox, oy] = badgeAt(o);
    gap = Math.min(gap, Math.hypot(x - ox, y - oy) * unit - BADGE);
  }
  return Math.max(0, Math.min(BADGE_HIT, gap / 2));
}

function FigureBadge({ f, hit, onTask }: { f: Figure; hit: number; onTask: (id: string) => void }) {
  const [x, y] = badgeAt(f);
  const look = numLook(f.tone, f.color, f.pulse ? 'is-pulse' : '');
  return (
    <div
      class={`fig-mark${f.n > 0 ? '' : ' fig-mark-free'}${x > SCENE_W * 0.62 ? ' fig-mark-left' : ''}`}
      style={{ left: pct(x, SCENE_W), top: pct(y, SCENE_H) }}
      data-task={f.task.id}
    >
      {f.n > 0 && (
        <button
          class={look.class}
          style={{ ...look.style, ...(hit < BADGE_HIT ? { '--hit': `${hit}px` } : {}) }}
          aria-label={`${f.n}. ${f.label}`}
          onClick={() => onTask(f.task.id)}
        >
          {f.n}
        </button>
      )}
      {f.extra}
      {f.zz && (
        <span class="zz" aria-hidden="true">
          z<small>z</small>
        </span>
      )}
    </div>
  );
}
