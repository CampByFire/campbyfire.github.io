import { useId, useRef, useState } from 'preact/hooks';
import { cleanTime, clockOf } from '../game/calendar';
import { formatTime, type ClockFormat } from '../game/time';
import { LIcon } from './Icon';
import { TimeDial } from './TimeDial';

interface Props {
  label: string;
  format: ClockFormat;
  value: string | null;
  disabled?: boolean;
  onChange(value: string | null): void;
}

/** Пустая строка снимает время, null означает, что ввод ещё не закончен или в нём ошибка. */
function readTime(raw: string, format: ClockFormat): string | null {
  const text = raw.trim();
  if (!text) return '';
  if (format === '24h') return cleanTime(text.replace(/^(\d{1,2})(\d{2})$/, '$1:$2'));
  const parts = /^(0?[1-9]|1[0-2]):([0-5]\d)\s*(AM|PM)$/i.exec(text);
  if (!parts) return null;
  const [, hour, minute, period] = parts;
  return clockOf((Number(hour) % 12 + (period.toUpperCase() === 'PM' ? 12 : 0)) * 60 + Number(minute));
}

export function TimeEntry({ label, format, value, disabled, onChange }: Props) {
  const id = useId();
  const toggle = useRef<HTMLButtonElement>(null);
  const [draft, setDraft] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const showDial = open && !disabled;
  const invalid = value === null && !disabled;
  const example = format === '24h' ? '17:30' : '5:30 PM';
  const close = () => {
    setOpen(false);
    toggle.current?.focus();
  };

  return (
    <div class={`field time-entry${showDial ? ' time-entry-open' : ''}`} onKeyDown={(e) => {
      if (e.key !== 'Escape' || !showDial) return;
      e.stopPropagation();
      close();
    }}>
      <label class="field-label" for={id}>{label}</label>
      <div class="time-entry-controls">
        <input id={id} class="input" type="text" placeholder={example} disabled={disabled}
          inputMode={format === '24h' ? 'numeric' : 'text'} autoComplete="off" maxLength={16}
          value={disabled ? '' : draft ?? (value ? formatTime(value, format) : '')}
          aria-invalid={invalid || undefined} aria-describedby={invalid ? `${id}-error` : undefined}
          onInput={(e) => {
            const text = e.currentTarget.value;
            setDraft(text);
            setOpen(false);
            onChange(readTime(text, format));
          }}
          onBlur={() => { if (value !== null) setDraft(null); }} />
        <button type="button" class="icon-btn" aria-label={`Открыть циферблат: ${label}`} ref={toggle}
          disabled={disabled} aria-expanded={showDial} aria-controls={showDial ? `${id}-dial` : undefined}
          onClick={() => setOpen(!showDial)}>
          <LIcon name="clock" size={20} />
        </button>
      </div>
      {invalid && <p class="field-hint note-error" id={`${id}-error`}>Введи время, например {example}.</p>}
      {showDial && (
        <TimeDial id={`${id}-dial`} label={label} format={format} value={value || '00:00'} onClose={close} onApply={(time) => {
          setDraft(null);
          onChange(time);
          close();
        }} />
      )}
    </div>
  );
}
