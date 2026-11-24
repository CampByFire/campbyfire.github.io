import type { Quest } from '../game/types';
import { QUEST_ICON_NAME, type QuestIcon } from '../game/words';

export function QuestEmblem({ icon, color }: { icon: QuestIcon; color?: string }) {
  return (
    <span class="quest-emblem" style={{ color }} aria-hidden="true">
      <svg viewBox="0 0 64 64"><use href={`./quest-icons.svg#${icon}`} /></svg>
    </span>
  );
}

export function QuestIconPicker({ value, home, color, onChange }: {
  value: Quest['icon'];
  home?: Quest;
  color: string;
  onChange: (icon: Quest['icon']) => void;
}) {
  const inherit = !!home && value === undefined;
  const icon = inherit ? home.icon : value;
  const name = inherit ? 'Как у сферы' : (icon && QUEST_ICON_NAME[icon]) || 'Без иконки';
  const options: { value: Quest['icon']; label: string; icon?: QuestIcon | null }[] = [
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
            <input type="radio" name="quest-icon" checked={opt.value === (home ? value : value ?? null)}
              onChange={() => onChange(opt.value)} />
            {opt.icon && <QuestEmblem icon={opt.icon} color={color} />}
            {opt.label}
          </label>
        ))}
      </fieldset>
    </details>
  );
}
