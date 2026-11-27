import { useLayoutEffect, useRef, useState } from 'preact/hooks';
import { clockOf } from '../game/calendar';
import { formatTime, type ClockFormat } from '../game/time';
import { Chips } from './parts';

interface Props {
  id: string;
  label: string;
  format: ClockFormat;
  value: string;
  onApply(value: string): void;
  onClose(): void;
}

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const MINUTES = Array.from({ length: 12 }, (_, i) => i * 5);
const OUTER = 43;
const INNER = 28;
const digits = (n: number) => String(n).padStart(2, '0');
const minuteMark = (n: number) => (Math.round(n / 5) * 5) % 60;

export function TimeDial({ id, label, format, value, onApply, onClose }: Props) {
  const [initialHour, initialMinute] = value.split(':').map(Number);
  const twelveHour = format === '12h';
  const [hour, setHour] = useState(initialHour);
  const [minute, setMinute] = useState(initialMinute);
  const [pickingHour, setPickingHour] = useState(true);
  const [focusValue, setFocusValue] = useState(twelveHour ? initialHour % 12 : initialHour);
  const face = useRef<HTMLDivElement>(null);
  const time = clockOf(hour * 60 + minute);
  const hourMark = twelveHour ? hour % 12 : hour;
  const chosen = pickingHour ? hourMark : minute;
  const choices = pickingHour ? (twelveHour ? HOURS.slice(0, 12) : HOURS) : MINUTES;
  const angle = pickingHour ? (hour % 12) * 30 : minute * 6;
  const length = pickingHour && !twelveHour && hour >= 12 ? INNER : OUTER;

  useLayoutEffect(() => {
    face.current?.querySelector<HTMLButtonElement>('button[tabindex="0"]')?.focus();
  }, [pickingHour]);

  const pickPart = (hours: boolean) => {
    if (hours === pickingHour) return;
    setFocusValue(hours ? hourMark : minuteMark(minute));
    setPickingHour(hours);
  };

  return (
    <div class="time-dial" id={id} role="group" aria-label={`Циферблат: ${label}`}>
      <div class="time-dial-heading">
        <output aria-live="polite">{formatTime(time, format)}</output>
        <div class="chips" role="group" aria-label="Часть времени">
          <button type="button" class={`chipbtn${pickingHour ? ' is-on' : ''}`} aria-pressed={pickingHour} onClick={() => pickPart(true)}>Часы</button>
          <button type="button" class={`chipbtn${!pickingHour ? ' is-on' : ''}`} aria-pressed={!pickingHour} onClick={() => pickPart(false)}>Минуты</button>
        </div>
      </div>
      {twelveHour && <Chips label="Половина дня" value={hour >= 12 ? 'PM' : 'AM'} options={[{ value: 'AM', label: 'AM' }, { value: 'PM', label: 'PM' }]}
        onChange={(period) => setHour(hour % 12 + (period === 'PM' ? 12 : 0))} />}
      <div class={`time-dial-face${pickingHour && !twelveHour ? ' time-dial-double' : ''}`} ref={face}
        role="group" aria-label={pickingHour ? 'Выбрать час' : 'Выбрать минуты'} onKeyDown={(e) => {
          const delta = e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : 0;
          if (!delta) return;
          e.preventDefault();
          const next = choices[(choices.indexOf(focusValue) + delta + choices.length) % choices.length];
          e.currentTarget.querySelector<HTMLButtonElement>(`[data-value="${next}"]`)?.focus();
        }}>
        <div aria-hidden="true" class="time-dial-hand" style={{ height: `${length}%`, transform: `rotate(${angle}deg)` }} />
        {choices.map((n) => {
          const radius = pickingHour && !twelveHour && n >= 12 ? INNER : OUTER;
          const radians = (pickingHour ? n % 12 : n / 5) * Math.PI / 6;
          const shown = pickingHour && twelveHour ? String(n || 12) : digits(n);
          return (
            <button type="button" key={n} data-value={n} class="time-dial-mark" tabIndex={n === focusValue ? 0 : -1}
              aria-label={`${pickingHour ? 'Час' : 'Минуты'} ${shown}`} aria-pressed={n === chosen}
              style={{ left: `${50 + radius * Math.sin(radians)}%`, top: `${50 - radius * Math.cos(radians)}%` }}
              onFocus={() => setFocusValue(n)} onClick={() => {
                if (pickingHour) {
                  setHour(twelveHour && hour >= 12 ? n + 12 : n);
                  pickPart(false);
                } else {
                  setMinute(n);
                }
              }}>{shown}</button>
          );
        })}
      </div>
      {!pickingHour && (
        <div class="time-dial-adjust" role="group" aria-label="Точная минута">
          <button type="button" class="chipbtn" aria-label="На минуту меньше" onClick={() => setMinute((m) => (m + 59) % 60)}>−1</button>
          <button type="button" class="chipbtn" aria-label="На минуту больше" onClick={() => setMinute((m) => (m + 1) % 60)}>+1</button>
        </div>
      )}
      <div class="btns time-dial-actions">
        <button type="button" class="btn" onClick={onClose}>Отмена</button>
        <button type="button" class="btn btn-gold" onClick={() => onApply(time)}>Применить</button>
      </div>
    </div>
  );
}
