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

const twoDigits = (n: number) => String(n).padStart(2, '0');
const hours12 = Array.from({ length: 12 }, (_, i) => String(i + 1));
const hours24 = Array.from({ length: 24 }, (_, i) => twoDigits(i));
const minutes = Array.from({ length: 60 }, (_, i) => twoDigits(i));

export function TimeInput({ label, format, value, disabled, optional, commitOnBlur, onChange }: Props) {
  const id = useId();
  const [draft, setDraft] = useState<string | null>(null);
  const twelveHour = format === '12h';
  const time = draft ?? value;
  const [hour, minute] = (time || '00:00').split(':').map(Number);
  const hourChoice = time ? (twelveHour ? String(hour % 12 || 12) : twoDigits(hour)) : '';
  const pm = hour >= 12;
  const change = (h: string, m: number, afterNoon: boolean) => {
    const hours = twelveHour ? Number(h) % 12 + (afterNoon ? 12 : 0) : Number(h);
    const next = h === '' ? '' : clockOf(hours * 60 + m);
    if (commitOnBlur) setDraft(next);
    else onChange(next);
  };
  return (
    <div class={`field ${twelveHour ? 'time-12' : 'time-24'}`} role="group" aria-labelledby={id} onBlurCapture={(e) => {
      if (!commitOnBlur || draft === null || e.currentTarget.contains(e.relatedTarget as Node | null)) return;
      setDraft(null);
      if (draft !== value) onChange(draft);
    }}>
      <span class="field-label" id={id}>{label}</span>
      <div class="time-parts">
        <select class="input" aria-label={`${label}, часы`} value={hourChoice} disabled={disabled}
          onChange={(e) => change(e.currentTarget.value, minute, pm)}>
          {optional && <option value="">—</option>}
          {(twelveHour ? hours12 : hours24).map((h) => <option key={h} value={h}>{h}</option>)}
        </select>
        <select class="input" aria-label={`${label}, минуты`} value={minutes[minute]} disabled={disabled || !time}
          onChange={(e) => change(hourChoice, Number(e.currentTarget.value), pm)}>
          {minutes.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
        {twelveHour && (
          <select class="input" aria-label={`${label}, половина дня`} value={pm ? 'PM' : 'AM'} disabled={disabled || !time}
            onChange={(e) => change(hourChoice, minute, e.currentTarget.value === 'PM')}>
            <option value="AM">AM</option>
            <option value="PM">PM</option>
          </select>
        )}
      </div>
    </div>
  );
}
