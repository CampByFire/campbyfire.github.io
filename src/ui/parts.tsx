// Мелкие общие куски интерфейса.
import { inkOn, isDark, questHex } from '../game/color';
import { estimateOf } from '../game/rules';
import { daysOverdue, findQuest, findRoutine, isUndead } from '../game/state';
import { formatDue, formatDuration, plural } from '../game/time';
import type { Level, Quest, State, Task } from '../game/types';
import type { Tone } from '../game/view';
import { LEVEL_ROMAN, WEEKDAY_CHIPS, periodShort } from '../game/words';
import { GIcon, LIcon } from './Icon';

/**
 * Подпись справа в строке задачи: нежить, время, срок, оценка или горизонт. У повторяющейся перед ней значок.
 * period: показывать ли горизонт (на вкладке самого периода он лишний).
 */
export function TaskMeta({ s, t, estimate = false, period = true }: { s: State; t: Task; estimate?: boolean; period?: boolean }) {
  const repeat = t.status !== 'done' && findRoutine(s, t.routineId) && (
    <>
      <LIcon name="repeat" size={13} class="ic-gold" />
      <span class="sr-only">повторяется,</span>
    </>
  );
  if (isUndead(t, s.day)) {
    const d = daysOverdue(t, s.day);
    return (
      <span class="meta meta-undead">
        <GIcon name="skull" size={12} />
        <span class="sr-only">просрочена на</span> {d} {plural(d, 'день', 'дня', 'дней')}
      </span>
    );
  }
  // Задача позвана на будущий день: видно, когда она придёт к костру.
  if (t.status === 'open' && t.day && t.day > s.day) return <span class="meta">{repeat}{formatDue(t.day, s.day)}{t.at && `, ${t.at}`}</span>;
  if (t.at) return <span class="meta">{repeat}в {t.at}</span>;
  if (t.due === s.day) return <span class="meta meta-gold">сегодня</span>;
  if (estimate) {
    const e = estimateOf(t);
    return <span class="meta">{repeat}{e ? formatDuration(e) : 'дни'}</span>;
  }
  if (t.due) return <span class="meta">{formatDue(t.due, s.day)}</span>;
  if (period && t.period) return <span class="meta">{periodShort(t.period, s.day)}</span>;
  return (
    <span class="meta">
      {repeat}
      <LevelMark level={t.level} short />
    </span>
  );
}

/** Уровень римской цифрой. Экранный диктор читает «уровень 2», а не латинские буквы. */
export function LevelMark({ level, short = false }: { level: Level; short?: boolean }) {
  return (
    <>
      <span aria-hidden="true">
        {LEVEL_ROMAN[level]} {short ? 'ур.' : 'уровень'}
      </span>
      <span class="sr-only">уровень {level}</span>
    </>
  );
}

/**
 * Номер спутника в цвете его похода (color из CampView.colors), цифра тёмная или светлая, смотря что на нём читается.
 * У нежити номер остаётся красным: это знак беды, а не похода. more: ещё классы через пробел.
 */
export function numLook(tone: Tone, color: string | undefined, more = ''): { class: string; style?: preact.JSX.CSSProperties } {
  const paint = color !== undefined && tone !== 'undead';
  return {
    class: `num num-${tone}${paint ? ' num-quest' : ''}${more ? ` ${more}` : ''}`,
    style: paint ? { background: color, color: inkOn(color) } : undefined,
  };
}

export function QuestDot({ q }: { q: Quest | undefined }) {
  return <ColorDot hex={questHex(q?.color)} />;
}

export function ColorDot({ hex }: { hex: string }) {
  return <span class={`qdot${isDark(hex) ? ' qdot-dark' : ''}`} style={{ background: hex }} aria-hidden="true" />;
}

export function questName(s: State, t: Task): string {
  return findQuest(s, t.questId)?.name ?? (t.status === 'inbox' ? 'Письмо без сферы' : 'Без сферы');
}

/** Выбор одного из вариантов. Как у радиокнопок: Tab попадает на выбранный, стрелки выбирают соседний. */
export function Chips<T extends string | number | null>(p: {
  label: string;
  /** Что вместо подписи группы прочтёт экранный диктор. */
  sr?: string;
  value: T;
  /** mark: короткая пометка на фишке только для глаз, диктор её не читает. */
  options: { value: T; label: string; hint?: string; sr?: string; mark?: string }[];
  onChange: (v: T) => void;
}) {
  const at = p.options.findIndex((o) => o.value === p.value);
  const onKey = (e: KeyboardEvent) => {
    const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const n = p.options.length;
    const i = ((at < 0 ? 0 : at + step) + n) % n;
    p.onChange(p.options[i].value);
    const group = (e.currentTarget as HTMLElement).parentElement;
    requestAnimationFrame(() => (group?.children[i] as HTMLElement | undefined)?.focus());
  };
  return (
    <div class="field">
      <div class="field-label" aria-hidden={p.sr ? 'true' : undefined}>{p.label}</div>
      <div class="chips" role="radiogroup" aria-label={p.sr ?? p.label}>
        {p.options.map((o, i) => (
          <button
            key={String(o.value)}
            role="radio"
            aria-checked={o.value === p.value}
            tabIndex={i === (at < 0 ? 0 : at) ? 0 : -1}
            class={`chipbtn${o.value === p.value ? ' is-on' : ''}`}
            onClick={() => p.onChange(o.value)}
            onKeyDown={onKey}
            type="button"
          >
            <ChipText label={o.label} sr={o.sr} />
            {o.hint && <small>{o.hint}</small>}
            {o.mark && <small aria-hidden="true">{o.mark}</small>}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Выбор любых дней недели: каждый день включается и выключается своей кнопкой. */
export function WeekdayPicker({ label, days, onChange }: { label: string; days: number[]; onChange: (days: number[]) => void }) {
  return (
    <div class="field">
      <div class="field-label">{label}</div>
      <div class="chips" role="group" aria-label={label}>
        {WEEKDAY_CHIPS.map(({ value: d, label: name, sr }) => {
          const on = days.includes(d);
          return (
            <button key={d} type="button" class={`chipbtn${on ? ' is-on' : ''}`} aria-pressed={on} onClick={() => onChange(on ? days.filter((x) => x !== d) : [...days, d])}>
              <ChipText label={name} sr={sr} />
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Надпись на кнопке-фишке. sr: что вместо неё прочтёт экранный диктор, если надпись сокращена. */
export function ChipText({ label, sr }: { label: string; sr?: string }) {
  if (!sr) return <>{label}</>;
  return (
    <>
      <span aria-hidden="true">{label}</span>
      <span class="sr-only">{sr}</span>
    </>
  );
}
