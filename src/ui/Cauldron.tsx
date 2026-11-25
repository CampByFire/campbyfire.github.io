import { useId } from 'preact/hooks';
import { BREW_CAPACITY } from '../game/rules';
import type { QuestIcon } from '../game/words';

/** Грани сосуда и отвар рисуются отдельно: уровень виден даже без цвета. */
export function Cauldron({ color, portions, icon }: { color: string; portions: number; icon?: QuestIcon | null }) {
  const clip = useId();
  const level = 94 - 63 * portions / BREW_CAPACITY;
  const glass = 'M40 26 L108 26 125 51 128 70 119 88 104 99 45 99 30 88 21 68 24 51Z';
  return (
    <svg class="cauldron" viewBox="0 -14 164 126" aria-hidden="true">
      <defs><clipPath id={clip}><path d={glass} /></clipPath></defs>
      <ellipse class="brew-glow" cx="75" cy="105" rx="25" ry="5" fill="#f08c31" opacity=".28" />
      <path fill="#a34d29" d="M55 107l6-5 7 2 6-4 8 2 7 1 6 4z" />
      <path fill="#676056" d="M40 93h12l-5 12H35z M99 93h12l6 12h-13z" />
      <path d={glass} fill="#564f47" stroke="#82786a" stroke-width="2" />
      <g clip-path={`url(#${clip})`}>
        <path d="M43 28h61l15 26-6 33-12 10H46L32 82l-5-28z" fill="#39332e" />
        {portions > 0 && <g fill={color}>
          <rect x="18" y={level} width="114" height="90" />
          <ellipse cx="75" cy={level} rx="55" ry="5" />
          <ellipse cx="75" cy={level} rx="55" ry="5" fill="white" opacity=".22" />
          <g transform={`translate(0 ${level})`} style={{ '--brew-depth': `${Math.min(19, (99 - level) * .55)}px` }}>
            <g class="brew-boil">
              <circle class="brew-bubble" cx="57" cy="0" r="2.8" fill="#fff6de" opacity=".45" />
              <ellipse class="brew-ripple" cx="57" cy="0" rx="8" ry="2.4" fill="none" stroke="#fff6de" opacity=".22" />
            </g>
            <g class="brew-boil">
              <circle class="brew-bubble" cx="86" cy="1" r="2.2" fill="#fff6de" opacity=".4" />
              <ellipse class="brew-ripple" cx="86" cy="1" rx="6" ry="1.8" fill="none" stroke="#fff6de" opacity=".18" />
            </g>
          </g>
        </g>}
        <path d="M40 27l6 3-13 27 2 28-12-17 1-17z" fill="#fff" opacity=".20" />
        <path d="M106 29l18 23 3 18-9 18-15 11 11-28z" fill="#120f0c" opacity=".24" />
      </g>
      <g class="brew-fire">
        <path fill="#f78b35" d="M61 104q-5-6 2-12 0 5 4 6-2-5 3-9l5-6q-1 7 5 12 2-2 2-5 9 7 6 14z" />
        <path fill="#ffd169" d="M69 104q-3-4 2-8 0 3 2 3 2-3 2-7 7 6 5 12z" />
      </g>
      <path fill="#51493f" d="M30 18l13-8h61l15 8-3 12-13 5H44l-12-6z" />
      <path fill="#81796e" d="M30 18l13-8h61l15 8-14 8H43z" />
      <path fill="#28231f" d="M37 18l10-5h54l11 5-10 4H47z" />
      {portions > 0 && <path class="brew-steam" d="M75 17c8-6-11-7-8-14 2-4 11-4 10-12"
        fill="none" stroke="#f0d5b3" stroke-width="3" stroke-linecap="round" opacity=".27" />}
      {icon && <g>
        <path d="M114 19q7-5 7 2l-1 3 8 9-2 3" fill="none" stroke="#c59a54" stroke-width="2.6" />
        <circle cx="130" cy="48" r="16" fill="#30271d" stroke="#d3ab68" stroke-width="2" />
        <svg x="119" y="37" width="22" height="22" viewBox="0 0 64 64">
          <use href={`#${icon}`} />
        </svg>
      </g>}
    </svg>
  );
}
