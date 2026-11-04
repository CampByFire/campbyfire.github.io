// Знакомство: несколько карточек при первом запуске. Потом их можно открыть из правил.
import { useEffect, useRef, useState } from 'preact/hooks';
import { W } from '../game/words';
import { GIcon } from './Icon';
import type { GameIcon } from './icons';

const CARDS: { icon: GameIcon; title: string; text: string }[] = [
  {
    icon: 'campfire',
    title: 'Добро пожаловать в лагерь',
    text: 'Это планировщик дня. Каждая задача здесь становится спутником в отряде, а большие цели становятся походами на логова чудовищ.',
  },
  {
    icon: 'sunrise',
    title: 'Утром собери отряд',
    text: `На экране «План» позови к костру задачи на сегодня и нажми «${W.lightFire}».`,
  },
  {
    icon: 'hourglass',
    title: 'Днём работай у огня',
    text: `«${W.callToFire}» запускает таймер задачи. «${W.done}» приносит золото и опыт, а логову похода урон. Мана показывает силы: когда она на исходе, устрой привал.`,
  },
  {
    icon: 'skull',
    title: 'Не откладывай надолго',
    text: 'Просроченная задача встаёт нежитью на лесной дороге. Перед сном подведи итоги дня: кто останется у костра на завтра, а кто вернётся в отряд.',
  },
];

export function Intro({ onDone }: { onDone: () => void }) {
  const [i, setI] = useState(0);
  const card = CARDS[i];
  const last = i === CARDS.length - 1;
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => ref.current?.focus(), []);
  return (
    <div class="overlay intro-overlay">
      <div class="intro" role="dialog" aria-modal="true" aria-label="Знакомство" ref={ref} tabIndex={-1}>
        <div class="intro-icon">
          <GIcon name={card.icon} size={44} />
        </div>
        <h2 class="intro-title">{card.title}</h2>
        <p class="intro-text">{card.text}</p>
        {last && <p class="note">Игра хранится в этом браузере. Копия в файл и сохранение в GitHub живут в Настройках.</p>}
        <div class="intro-dots" aria-hidden="true">
          {CARDS.map((_, n) => (
            <span key={n} class={n === i ? 'is-on' : ''} />
          ))}
        </div>
        {last ? (
          <div class="btns btns-one">
            <button class="btn btn-gold" onClick={onDone}>
              К костру
            </button>
          </div>
        ) : (
          <div class="btns">
            <button class="btn btn-ghost" onClick={onDone}>
              Пропустить
            </button>
            <button class="btn btn-gold" onClick={() => setI(i + 1)}>
              Дальше
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
