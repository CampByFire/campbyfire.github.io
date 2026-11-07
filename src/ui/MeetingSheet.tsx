// Лист встречи: новая встреча в календаре или правка. Фраза «завтра в 10 стоматолог» сама ставит день и время.
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { addMeeting, cleanTime, findMeeting, parseMeeting, removeMeeting, restoreMeeting, updateMeeting } from '../game/calendar';
import { formatDue } from '../game/time';
import type { DayKey } from '../game/types';
import { dayTitle } from '../game/words';
import type { Ui } from './App';
import { LIcon } from './Icon';
import { Sheet } from './Sheets';

export function MeetingSheet({ ui, meetingId, day: preset }: { ui: Ui; meetingId?: string; day?: DayKey }) {
  const s = ui.store.state;
  const editing = meetingId ? findMeeting(s, meetingId) : undefined;
  const [title, setTitle] = useState(editing?.title ?? '');
  const [day, setDay] = useState<DayKey>(editing?.day ?? preset ?? s.day);
  const [at, setAt] = useState(editing?.at ?? '');
  const [until, setUntil] = useState(editing?.until ?? '');
  const [place, setPlace] = useState(editing?.place ?? '');
  // Что выбрали руками, сильнее слов во фразе.
  const [touched, setTouched] = useState<{ day?: true; at?: true }>({});
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!editing) input.current?.focus();
  }, []);

  // Фразу разбирает только новая встреча: «завтра в 10 стоматолог», «в пятницу созвон в 15:30».
  const parsed = useMemo(() => (editing ? null : parseMeeting(title, s.day)), [title]);
  const pDay = parsed?.day;
  const vDay = !touched.day && pDay ? pDay : day;
  const vAt = !touched.at && parsed?.at ? parsed.at : at;
  const name = parsed && (pDay || parsed.at) ? parsed.title : title.trim();
  const heard = parsed && ((pDay && !touched.day) || (parsed.at && !touched.at));

  if (meetingId && !editing) return null;

  const save = (e?: Event) => {
    e?.preventDefault();
    if (!name) {
      input.current?.focus();
      return;
    }
    if (!vDay) return;
    const fields = { title: name, day: vDay, at: vAt || null, until: until || null, place };
    if (editing) ui.store.act((st) => updateMeeting(st, editing.id, fields));
    else ui.store.act((st, now) => addMeeting(st, now, fields));
    const when = `${formatDue(vDay, s.day)}${cleanTime(vAt) ? ` в ${cleanTime(vAt)!.replace(/^0/, '')}` : ''}`;
    ui.toast(editing ? 'Встреча сохранена' : `Встреча в календаре: ${when}`);
    ui.close();
  };

  const remove = () => {
    if (!editing) return;
    const gone = ui.store.act((st) => removeMeeting(st, editing.id));
    ui.close();
    if (gone) ui.toast('Встреча удалена', { label: 'Вернуть', run: () => ui.store.act((st) => restoreMeeting(st, gone)) });
  };

  return (
    <Sheet
      title={editing ? 'Встреча' : 'Новая встреча'}
      onClose={ui.close}
      footer={
        <button class="btn btn-gold btn-wide" onClick={save}>
          {editing ? 'Сохранить' : 'Добавить в календарь'}
        </button>
      }
    >
      <form onSubmit={save}>
        <label class="field">
          <span class="field-label">Что за встреча</span>
          <input
            ref={input}
            class="input"
            value={title}
            onInput={(e) => setTitle(e.currentTarget.value)}
            placeholder={editing ? 'Например, стоматолог' : 'Например, завтра в 10 стоматолог'}
            maxLength={200}
            enterKeyHint="done"
            aria-describedby={heard ? 'meet-hint' : undefined}
          />
        </label>
        {heard && (
          <p class="field-hint" id="meet-hint" aria-live="polite">
            Понял: {dayTitle(vDay, s.day).toLowerCase()}
            {cleanTime(vAt) && `, в ${cleanTime(vAt)!.replace(/^0/, '')}`}
          </p>
        )}
      </form>
      <label class="field">
        <span class="field-label">День</span>
        <input
          class="input"
          type="date"
          required
          value={vDay}
          onInput={(e) => {
            const v = e.currentTarget.value;
            if (!v) return;
            setTouched((x) => ({ ...x, day: true }));
            setDay(v);
          }}
        />
      </label>
      <div class="field-row">
        <label class="field">
          <span class="field-label">Начало</span>
          <input
            class="input"
            type="time"
            value={vAt}
            onInput={(e) => {
              setTouched((x) => ({ ...x, at: true }));
              setAt(e.currentTarget.value);
            }}
          />
        </label>
        <label class="field">
          <span class="field-label">Конец</span>
          <input class="input" type="time" value={until} disabled={!vAt} onInput={(e) => setUntil(e.currentTarget.value)} />
        </label>
      </div>
      <p class="note">Без времени встреча стоит на весь день, например день рождения или поездка.</p>
      <label class="field">
        <span class="field-label">Где</span>
        <input class="input" value={place} onInput={(e) => setPlace(e.currentTarget.value)} placeholder="Адрес, кабинет или ссылка на созвон" maxLength={200} />
      </label>
      {editing && (
        <div class="actions">
          <button class="act act-danger" onClick={remove}>
            <LIcon name="close" size={16} />
            Удалить встречу
          </button>
        </div>
      )}
    </Sheet>
  );
}
