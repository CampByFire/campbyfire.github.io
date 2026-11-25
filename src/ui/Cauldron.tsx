import { useId } from 'preact/hooks';
import { BREW_CAPACITY } from '../game/rules';
import type { QuestIcon } from '../game/words';

/** Грани сосуда и отвар рисуются отдельно: уровень виден даже без цвета. */
export function Cauldron({ color, portions, icon }: { color: string; portions: number; icon?: QuestIcon | null }) {
  const clip = useId();
  const level = 94 - 63 * portions / BREW_CAPACITY;
  const glass = 'M40 26 L108 26 125 51 128 70 119 88 104 99 45 99 30 88 21 68 24 51Z';
  return (
    <svg class="cauldron" viewBox="0 0 164 108" aria-hidden="true">
      <defs><clipPath id={clip}><path d={glass} /></clipPath></defs>
      <path fill="#676056" d="M40 93h12l-5 12H35z M99 93h12l6 12h-13z" />
      <path d={glass} fill="#564f47" stroke="#82786a" stroke-width="2" />
      <g clip-path={`url(#${clip})`}>
        <path d="M43 28h61l15 26-6 33-12 10H46L32 82l-5-28z" fill="#39332e" />
        {portions > 0 && <g fill={color}>
          <rect x="18" y={level} width="114" height="90" />
          <ellipse cx="75" cy={level} rx="55" ry="5" />
          <ellipse cx="75" cy={level} rx="55" ry="5" fill="white" opacity=".22" />
          <circle class="brew-bubble" cx="57" cy={level - 6} r="2.5" />
          <circle class="brew-bubble" cx="83" cy={level - 10} r="1.8" />
        </g>}
        <path d="M40 27l6 3-13 27 2 28-12-17 1-17z" fill="#fff" opacity=".20" />
        <path d="M106 29l18 23 3 18-9 18-15 11 11-28z" fill="#120f0c" opacity=".24" />
      </g>
      <path fill="#51493f" d="M30 18l13-8h61l15 8-3 12-13 5H44l-12-6z" />
      <path fill="#81796e" d="M30 18l13-8h61l15 8-14 8H43z" />
      <path fill="#28231f" d="M37 18l10-5h54l11 5-10 4H47z" />
      {icon && <g>
        <path d="M114 19q7-5 7 2l-1 3 8 9-2 3" fill="none" stroke="#c59a54" stroke-width="2.6" />
        <circle cx="130" cy="48" r="16" fill="#30271d" stroke="#d3ab68" stroke-width="2" />
        <svg x="119" y="37" width="22" height="22" viewBox="0 0 64 64">
          <use href={`./quest-icons.svg#${icon}`} />
        </svg>
      </g>}
    </svg>
  );
}
