// Королевство: колесо баланса, сферы с их проектами, зал трофеев и отпущенные задачи.
import { questHex } from '../game/color';
import { SCORE_MAX } from '../game/rules';
import { lairOf, lastRating, projectsOf, ratingDue, releasedOf, spheresOf, unrelease } from '../game/state';
import { formatDue } from '../game/time';
import type { Quest, Rating, State } from '../game/types';
import { SPHERE_KIND_NAME, W } from '../game/words';
import type { Ui } from './App';
import { GIcon, LIcon } from './Icon';
import { QuestDot } from './parts';

export function Realm({ ui }: { ui: Ui }) {
  const s = ui.store.state;
  const spheres = spheresOf(s);
  const loose = projectsOf(s, null);
  const won = s.quests.filter((q) => !q.sphere && q.wonAt).sort((a, b) => (b.wonAt ?? 0) - (a.wonAt ?? 0));
  const released = releasedOf(s).slice(0, 30);
  const last = lastRating(s);
  const prev = last ? lastRating(s, last.id) : undefined;
  const due = ratingDue(s);
  return (
    <div class="page">
      <h1 class="page-title">{W.realm}</h1>
      <div class="page-sub">Королевство делится на сферы жизни, как колесо баланса. Время от времени оценивай каждую от 1 до 10, а большие цели собирай в проекты внутри сфер.</div>

      <section class="group">
        <div class="group-head">
          <h2 class="sc">{W.wheel}</h2>
        </div>
        {due && (
          <p class="note wheel-due">
            {last ? `Пора оценить сферы: прошлая оценка ${formatDue(last.id, s.day).toLowerCase()}.` : 'Оцени сферы, чтобы увидеть своё колесо баланса.'}
          </p>
        )}
        {spheres.length > 0 && <Wheel spheres={spheres} last={last} prev={prev} />}
        {spheres.length > 0 && (
          <ul class="wheel-legend">
            {spheres.map((q) => {
              const v = last?.scores[q.id];
              const was = prev?.scores[q.id];
              const delta = v !== undefined && was !== undefined ? v - was : 0;
              return (
                <li key={q.id}>
                  <QuestDot q={q} />
                  <span class="row-title">{q.name}</span>
                  <span class="wheel-score">
                    {v === undefined ? <span class="row-muted">нет оценки</span> : `${v} из ${SCORE_MAX}`}
                    {delta !== 0 && <span class={delta > 0 ? 'wheel-up' : 'wheel-down'}>{delta > 0 ? ` +${delta}` : ` −${-delta}`}</span>}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
        {last && <p class="note">Оценка {formatDue(last.id, s.day).toLowerCase()}{prev ? `, бледный контур: прошлая, ${formatDue(prev.id, s.day).toLowerCase()}` : ''}.</p>}
        {spheres.length > 0 ? (
          <button class={`btn ${due || !last ? 'btn-gold' : 'btn-ghost'} btn-wide`} onClick={() => ui.open({ kind: 'rate' })}>
            {W.rate}
          </button>
        ) : (
          <p class="note">Сфер нет. Добавь первую ниже: например, «Работа» или «Здоровье».</p>
        )}
      </section>

      <section class="group">
        <div class="group-head">
          <h2 class="sc">{W.spheres}</h2>
          <button class="link-btn" onClick={() => ui.open({ kind: 'newQuest', sphere: true })}>
            <LIcon name="plus" size={15} />
            новая сфера
          </button>
        </div>
        {spheres.map((q) => (
          <div key={q.id} class="sphere">
            <SphereCard ui={ui} s={s} q={q} score={last?.scores[q.id]} />
            {projectsOf(s, q.id).map((p) => (
              <ProjectCard key={p.id} ui={ui} s={s} q={p} />
            ))}
          </div>
        ))}
        {loose.length > 0 && (
          <div class="sphere">
            <div class="quest-name">
              <QuestDot q={undefined} />
              Проекты {W.noSphere.toLowerCase()}
            </div>
            {loose.map((p) => (
              <ProjectCard key={p.id} ui={ui} s={s} q={p} />
            ))}
          </div>
        )}
        <button class="link-btn" onClick={() => ui.open({ kind: 'newQuest', sphereId: spheres[0]?.id ?? null })}>
          <LIcon name="plus" size={15} />
          новый проект
        </button>
      </section>

      <section class="group">
        <div class="group-head">
          <h2 class="sc">{W.trophies}</h2>
        </div>
        {won.length === 0 && <p class="note">Пока пусто. Когда отметишь проект выполненным, его знамя появится здесь.</p>}
        {won.map((q) => (
          <button key={q.id} class="trophy" data-quest={q.id} onClick={() => ui.open({ kind: 'quest', questId: q.id })}>
            <GIcon name="kingdom" size={20} class="ic-gold" />
            <span class="row-title">{q.name}</span>
            <span class="meta">{new Date(q.wonAt!).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
          </button>
        ))}
      </section>

      {released.length > 0 && (
        <details class="group released">
          <summary class="group-head">
            <span class="sc">Отпущенные</span>
            <span class="group-meta">
              {released.length}
              <LIcon name="down" size={14} />
            </span>
          </summary>
          <p class="note">Задачи, которые отпустили без награды. Если отпустили по ошибке, их можно вернуть.</p>
          {released.map((t) => (
            <div key={t.id} class="trophy">
              <span class="row-title row-muted">{t.title}</span>
              <button
                class="link-btn"
                onClick={() => {
                  ui.store.act((st) => unrelease(st, t.id));
                  ui.toast('Задача вернулась');
                }}
              >
                <LIcon name="undo" size={14} />
                Вернуть
              </button>
            </div>
          ))}
        </details>
      )}
    </div>
  );
}

function openIn(s: State, questId: string): number {
  return s.tasks.filter((t) => t.questId === questId && t.status === 'open').length;
}

function SphereCard({ ui, s, q, score }: { ui: Ui; s: State; q: Quest; score: number | undefined }) {
  const open = openIn(s, q.id);
  return (
    <button class="quest-card sphere-card" onClick={() => ui.open({ kind: 'quest', questId: q.id })}>
      <span class="quest-card-top">
        <QuestDot q={q} />
        <span class="quest-card-name">{q.name}</span>
        {score !== undefined && (
          <span class="sphere-score">
            <span aria-hidden="true">{score}</span>
            <span class="sr-only">, оценка {score} из {SCORE_MAX}</span>
          </span>
        )}
      </span>
      <span class="quest-card-sub">
        {SPHERE_KIND_NAME[q.kind]} · {open} в отряде
      </span>
    </button>
  );
}

function ProjectCard({ ui, s, q }: { ui: Ui; s: State; q: Quest }) {
  const lair = lairOf(s, q.id);
  const done = lair.max - lair.hp;
  return (
    <button class="quest-card project-card" onClick={() => ui.open({ kind: 'quest', questId: q.id })}>
      <span class="quest-card-top">
        <QuestDot q={q} />
        <span class="quest-card-name">{q.name}</span>
        <span class="meta">проект</span>
      </span>
      <span class="quest-card-sub">
        {openIn(s, q.id)} в отряде
        {lair.max > 0 && ` · сделано ${done} из ${lair.max}`}
      </span>
      {lair.max > 0 && (
        <span class="bar bar-gold" aria-hidden="true">
          <span style={{ width: `${(done / lair.max) * 100}%` }} />
        </span>
      )}
    </button>
  );
}

const SIZE = 260;
const R = 104;
/** На сколько подпись с оценкой отстоит от края сектора. */
const VALUE_GAP = 11;

/** Оценка на колесе: целая без дробной части, дробная с одним знаком. */
const scoreText = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1).replace('.', ','));

/**
 * Колесо баланса: у каждой сферы свой сектор, чем выше оценка, тем дальше он от центра.
 * Внутри сектора по дуге на каждую единицу оценки, край сектора замыкает счёт: у шестёрки ровно 6 полос.
 * Прошлая оценка видна бледным контуром. Диктору колесо не нужно: те же баллы стоят списком под ним.
 */
function Wheel({ spheres, last, prev }: { spheres: Quest[]; last: Rating | undefined; prev: Rating | undefined }) {
  const c = SIZE / 2;
  const n = spheres.length;
  const step = (2 * Math.PI) / n;
  const point = (a: number, r: number) => `${(c + r * Math.sin(a)).toFixed(2)} ${(c - r * Math.cos(a)).toFixed(2)}`;
  const arc = (i: number, r: number) => {
    if (n === 1) return `M ${point(0, r)} A ${r} ${r} 0 1 1 ${point(Math.PI, r)} A ${r} ${r} 0 1 1 ${point(0, r)}`;
    return `M ${point(i * step, r)} A ${r} ${r} 0 0 1 ${point((i + 1) * step, r)}`;
  };
  const sector = (i: number, r: number) => (n === 1 ? `${arc(i, r)} Z` : `M ${c} ${c} L ${arc(i, r).slice(2)} Z`);
  const radius = (v: number | undefined) => (v === undefined ? 0 : (R * v) / SCORE_MAX);
  /** Целые единицы ниже оценки: на них лежат дуги-деления. */
  const units = (v: number) => Array.from({ length: Math.ceil(v) - 1 }, (_, k) => k + 1);
  return (
    <div class="wheel" aria-hidden="true">
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} width={SIZE} height={SIZE}>
        <circle cx={c} cy={c} r={R} class="wheel-ring" />
        {spheres.map((_, i) => (
          <line key={i} x1={c} y1={c} x2={point(i * step, R).split(' ')[0]} y2={point(i * step, R).split(' ')[1]} class="wheel-ring" />
        ))}
        {spheres.map((q, i) => {
          const r = radius(last?.scores[q.id]);
          return r > 0 ? <path key={q.id} d={sector(i, r)} fill={questHex(q.color)} class="wheel-sector" /> : null;
        })}
        {spheres.map((q, i) => {
          const v = last?.scores[q.id];
          if (v === undefined) return null;
          return (
            <g key={`t-${q.id}`} class="wheel-ticks">
              {units(v).map((k) => (
                <path key={k} d={arc(i, radius(k))} />
              ))}
            </g>
          );
        })}
        {prev &&
          spheres.map((q, i) => {
            const r = radius(prev.scores[q.id]);
            return r > 0 ? <path key={`p-${q.id}`} d={sector(i, r)} class="wheel-prev" /> : null;
          })}
        {spheres.map((q, i) => {
          const v = last?.scores[q.id];
          if (v === undefined) return null;
          const [x, y] = point((i + 0.5) * step, radius(v) + VALUE_GAP).split(' ');
          return (
            <text key={`v-${q.id}`} x={x} y={y} class="wheel-value">
              {scoreText(v)}
            </text>
          );
        })}
      </svg>
    </div>
  );
}
