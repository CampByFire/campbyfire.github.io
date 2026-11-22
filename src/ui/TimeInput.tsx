import { useId, useState } from 'preact/hooks';
import { clockOf } from '../game/calendar';
import type { ClockFormat } from '../game/time';

interface Props {
  label: string;
  format: ClockFormat;
  value: string;
  disabled?: boolean;
  /** Поле может оставаться пустым, например у события на весь день. */
  optional?: boolean;
  /** Распорядок проверяется после выбора всех частей времени. */
  commitOnBlur?: boolean;
  onChange(value: string): void;
}

const hours = Array.from({ length: 12 }, (_, i) => i + 1);
const minutes = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'));

export function TimeInput({ label, format, value, disabled, optional, commitOnBlur, onChange }: Props) {
  const id = useId();
  const [draft, setDraft] = useState<string | null>(null);
  if (format === '24h') {
    const handle = (e: Event) => onChange((e.currentTarget as HTMLInputElement).value);
    return (
      <label class="field">
        <span class="field-label">{label}</span>
        <input class="input" type="time" value={value} disabled={disabled}
          onInput={commitOnBlur ? undefined : handle} onChange={commitOnBlur ? handle : undefined} />
      </label>
    );
  }
  const time = draft ?? value;
  const [hour, minute] = (time || '00:00').split(':').map(Number);
  const pm = hour >= 12;
  const change = (h: number, m: number, afterNoon: boolean) => {
    const next = h ? clockOf((h % 12 + (afterNoon ? 12 : 0)) * 60 + m) : '';
    if (commitOnBlur) setDraft(next);
    else onChange(next);
  };
  return (
    <div class="field time-12" role="group" aria-labelledby={id} onBlurCapture={(e) => {
      if (!commitOnBlur || draft === null || e.currentTarget.contains(e.relatedTarget as Node | null)) return;
      setDraft(null);
      if (draft !== value) onChange(draft);
    }}>
      <span class="field-label" id={id}>{label}</span>
      <div class="time-parts">
        <select class="input" aria-label={`${label}, часы`} value={time ? hour % 12 || 12 : ''} disabled={disabled}
          onChange={(e) => change(Number(e.currentTarget.value), minute, pm)}>
          {optional && <option value="">—</option>}
          {hours.map((h) => <option key={h} value={h}>{h}</option>)}
        </select>
        <select class="input" aria-label={`${label}, минуты`} value={minutes[minute]} disabled={disabled || !time}
          onChange={(e) => change(hour % 12 || 12, Number(e.currentTarget.value), pm)}>
          {minutes.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
        <select class="input" aria-label={`${label}, половина дня`} value={pm ? 'PM' : 'AM'} disabled={disabled || !time}
          onChange={(e) => change(hour % 12 || 12, minute, e.currentTarget.value === 'PM')}>
          <option value="AM">AM</option>
          <option value="PM">PM</option>
        </select>
      </div>
    </div>
  );
}
