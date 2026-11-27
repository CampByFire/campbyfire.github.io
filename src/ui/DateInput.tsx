import { useId, useRef, useState } from 'preact/hooks';
import { formatDate, type DateFormat } from '../game/time';
import type { DayKey } from '../game/types';
import { LIcon } from './Icon';

interface Props {
  label: string;
  format: DateFormat;
  value: DayKey | null;
  onChange(value: DayKey | null): void;
  optional?: boolean;
  min?: DayKey;
}

/** Пустая строка оставляет дату незаданной, null означает ошибку ввода. */
function readDate(text: string, format: DateFormat): DayKey | null {
  if (!text.trim()) return '';
  const parts = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(text.trim());
  if (!parts) return null;
  const [, first, second, year] = parts;
  const [month, day] = format === 'mdy' ? [first, second] : [second, first];
  const key = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  const date = new Date(`${key}T00:00:00Z`);
  return Number(year) > 0 && Number.isFinite(date.getTime()) && date.toISOString().startsWith(`${key}T`) ? key : null;
}

export function DateInput({ label, format, value, onChange, optional, min }: Props) {
  const id = useId();
  const picker = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState<string | null>(null);
  const [showNative, setShowNative] = useState(false);
  const placeholder = format === 'mdy' ? 'ММ.ДД.ГГГГ' : 'ДД.ММ.ГГГГ';
  const error = value === null ? `Введи дату в формате ${placeholder}.`
    : !value && !optional ? 'Укажи дату.'
    : value && min && value < min ? `Выбери дату с ${formatDate(min, format)}.` : '';

  return (
    <div class="field">
      <label class="field-label" for={id}>{label}</label>
      <div class="date-field">
        <input id={id} class="input" type="text" placeholder={placeholder} required={!optional}
          value={draft ?? (value ? formatDate(value, format) : '')}
          aria-invalid={error ? true : undefined} aria-describedby={`${id}-hint`}
          onInput={(e) => {
            const text = e.currentTarget.value;
            setDraft(text);
            onChange(readDate(text, format));
          }}
          onBlur={() => { if (value !== null) setDraft(null); }} />
        <button class="icon-btn" type="button" aria-label={`Выбрать дату: ${label}`}
          onClick={() => {
            const input = picker.current;
            if (input?.showPicker) {
              input.showPicker();
            } else {
              setShowNative(!showNative);
            }
          }}>
          <LIcon name="calendar" size={20} />
        </button>
        <input ref={picker} class={showNative ? 'input date-picker-visible' : 'date-picker'} type="date"
          tabIndex={showNative ? undefined : -1} aria-hidden={showNative ? undefined : 'true'}
          aria-label={`Дата в календаре: ${label}`} min={min} value={value ?? ''}
          onInput={(e) => {
            setDraft(null);
            onChange(e.currentTarget.value);
          }} />
      </div>
      <p class={`field-hint${error ? ' note-error' : ''}`} id={`${id}-hint`} aria-live="polite">{error || `Формат: ${placeholder}`}</p>
    </div>
  );
}
