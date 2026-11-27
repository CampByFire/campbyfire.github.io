import { questHex } from '../game/color';
import { SCORE_MAX } from '../game/rules';
import type { Quest, Rating } from '../game/types';
import { W } from '../game/words';
import { QuestDot } from './parts';

const SIZE = 292;
const CENTER = SIZE / 2;
const RADIUS = 104;
const LABEL_RADIUS = RADIUS + 20;
const TICKS = Array.from({ length: SCORE_MAX - 1 }, (_, i) => i + 1);

interface WheelProps {
  spheres: Quest[];
  last: Rating | undefined;
  previous: Rating | undefined;
  onPick: (id: string) => void;
}

const radiusOf = (score: number) => RADIUS * score / SCORE_MAX;
const point = (angle: number, radius: number) => [CENTER + radius * Math.sin(angle), CENTER - radius * Math.cos(angle)] as const;
const scoreText = (score: number) => Number.isInteger(score) ? String(score) : score.toFixed(1).replace('.', ',');

/** Сектора показывают последнюю оценку, а пунктир показывает предыдущую. */
export function SphereWheel({ spheres, last, previous, onPick }: WheelProps) {
  const count = spheres.length;
  const step = 2 * Math.PI / count;
  const arc = (i: number, radius: number) => {
    const start = point(i * step, radius).join(' ');
    const end = point((i + 1) * step, radius).join(' ');
    if (count === 1) {
      const opposite = point(Math.PI, radius).join(' ');
      return `${start} A ${radius} ${radius} 0 1 1 ${opposite} A ${radius} ${radius} 0 1 1 ${start}`;
    }
    return `${start} A ${radius} ${radius} 0 0 1 ${end}`;
  };
  const sector = (i: number, radius: number) => count === 1
    ? `M ${arc(i, radius)} Z`
    : `M ${CENTER} ${CENTER} L ${arc(i, radius)} Z`;

  return (
    <div class="wheel" aria-hidden="true">
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} width={SIZE} height={SIZE}>
        <circle cx={CENTER} cy={CENTER} r={RADIUS} class="wheel-ring" />
        {spheres.map((q, i) => {
          const score = last?.scores[q.id] ?? 0;
          const [x, y] = point(i * step, RADIUS);
          return (
            <g key={q.id}>
              <g class="wheel-ticks-empty">
                {TICKS.filter((tick) => tick > score).map((tick) => <path key={tick} d={`M ${arc(i, radiusOf(tick))}`} />)}
              </g>
              {count > 1 && <line x1={CENTER} y1={CENTER} x2={x} y2={y} class="wheel-ring" />}
              {score > 0 && <path d={sector(i, radiusOf(score))} fill={questHex(q.color)} class="wheel-sector" />}
              <g class="wheel-ticks">
                {TICKS.filter((tick) => tick < score).map((tick) => <path key={tick} d={`M ${arc(i, radiusOf(tick))}`} />)}
              </g>
            </g>
          );
        })}
        {spheres.map((q, i) => {
          const before = previous?.scores[q.id];
          return before ? <path key={`prev-${q.id}`} d={sector(i, radiusOf(before))} class="wheel-prev" /> : null;
        })}
        {spheres.map((q, i) => {
          const score = last?.scores[q.id];
          if (score === undefined) return null;
          const [x, y] = point((i + 0.5) * step, LABEL_RADIUS);
          return <text key={`value-${q.id}`} x={x} y={y} class="wheel-value">{scoreText(score)}</text>;
        })}
        {spheres.map((q, i) => (
          <path key={`hit-${q.id}`} d={sector(i, RADIUS)} class="wheel-hit" onClick={() => onPick(q.id)} />
        ))}
      </svg>
    </div>
  );
}

/** Те же оценки и переход к заметкам для клавиатуры и экранного диктора. */
export function SphereScores({ spheres, last, previous, onPick }: WheelProps) {
  return (
    <ul class="wheel-scores" aria-label="Оценки сфер">
      {spheres.map((q) => {
        const score = last?.scores[q.id];
        const before = previous?.scores[q.id];
        return (
          <li key={q.id}>
            <button class="row wheel-score-row" data-wheel-score={q.id} onClick={() => onPick(q.id)}>
              <QuestDot q={q} />
              <span class="row-title">{q.name}</span>
              <span class="wheel-score">{score === undefined ? 'нет оценки' : `${scoreText(score)} из ${SCORE_MAX}`}{before !== undefined && <span class="meta">, раньше {scoreText(before)}</span>}</span>
              <span class="sr-only">. {W.improve}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
