import questIcons from './quest-icons.svg?raw';
import type { Quest } from '../game/types';
import { QUEST_ICON_NAME, type QuestIcon } from '../game/words';

/** Общие символы остаются в документе при смене экранов. */
export function QuestIconSprite() {
  return <div class="quest-icon-sprite" aria-hidden="true" dangerouslySetInnerHTML={{ __html: questIcons }} />;
}

export function QuestEmblem({ icon, color }: { icon: QuestIcon; color?: string }) {
  return (
    <span class="quest-emblem" style={{ color }} aria-hidden="true">
      <svg viewBox="0 0 64 64"><use href={`#${icon}`} /></svg>
    </span>
  );
}

export function QuestIconPicker({ value, home, defaultBrewIcon, color, onChange }: {
  value: Quest['icon'];
  home?: Quest;
  defaultBrewIcon?: QuestIcon;
  color: string;
  onChange: (icon: Quest['icon']) => void;
}) {
  const inherit = !!home && value === undefined;
  const defaultBrew = defaultBrewIcon && value === undefined;
  const icon = inherit ? home.icon : defaultBrew ? defaultBrewIcon : value;
  const name = defaultBrew ? 'Медальон котелка' : inherit ? 'Как у сферы' : (icon && QUEST_ICON_NAME[icon]) || 'Без иконки';
  const options: { value: Quest['icon']; label: string; icon?: QuestIcon | null }[] = [
    ...(defaultBrewIcon ? [{ value: undefined, label: 'Медальон котелка', icon: defaultBrewIcon }] : []),
    { value: null, label: 'Без иконки' },
    ...(home ? [{ value: undefined, label: 'Как у сферы', icon: home.icon }] : []),
    ...Object.entries(QUEST_ICON_NAME).map(([key, label]) => ({ value: key as QuestIcon, label, icon: key as QuestIcon })),
  ];
  return (
    <details class="quest-icon-picker">
      <summary>Иконка · {name} {icon && <QuestEmblem icon={icon} color={color} />}</summary>
      <fieldset>
        <legend class="sr-only">Иконка сферы или проекта</legend>
        {options.map((opt) => (
          <label key={String(opt.value)}>
            <input type="radio" name="quest-icon" checked={opt.value === (home || defaultBrewIcon ? value : value ?? null)}
              onChange={() => onChange(opt.value)} />
            {opt.icon && <QuestEmblem icon={opt.icon} color={color} />}
            {opt.label}
          </label>
        ))}
      </fieldset>
    </details>
  );
}
