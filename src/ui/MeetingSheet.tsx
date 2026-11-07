// Лист встречи: новая встреча в календаре или правка. Фраза «завтра в 10 стоматолог» сама ставит день и время.
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { addMeeting, cleanTime, findMeeting, meetingOccursOn, parseMeeting, removeMeeting, restoreMeeting, skipMeetingDay, unskipMeetingDay, updateMeeting } from '../game/calendar';
import { formatDue } from '../game/time';
import type { DayKey, MeetingRepeat, QuestColor } from '../game/types';
import { MEETING_REPEATS, MEETING_REPEAT_NAME, dayTitle } from '../game/words';
import type { Ui } from './App';
import { LIcon } from './Icon';
import { QuestColorPicker } from './QuestColorPicker';
import { Chips } from './parts';
import { Sheet } from './Sheets';

/** day у новой встречи это её день, а у открытой встречи тот день серии, из которого её открыли. */
export function MeetingSheet({ ui, meetingId, day: preset, at: atPreset }: { ui: Ui; meetingId?: string; day?: DayKey; at?: string }) {
  const s = ui.store.state;
  const editing = meetingId ? findMeeting(s, meetingId) : undefined;
  const [title, setTitle] = useState(editing?.title ?? '');
  const [day, setDay] = useState<DayKey>(editing?.day ?? preset ?? s.day);
  const [at, setAt] = useState(editing?.at ?? atPreset ?? '');
  const [until, setUntil] = useState(editing?.until ?? '');
  const [place, setPlace] = useState(editing?.place ?? '');
  const [repeat, setRepeat] = useState<MeetingRepeat | null>(editing?.repeat ?? null);
  const [repeatUntil, setRepeatUntil] = useState(editing?.repeatUntil ?? '');
  // undefined: обычный цвет встречи, null: в поле кода сейчас не цвет, под ним уже сказано, что не так.
  const [color, setColor] = useState<QuestColor | null | undefined>(editing?.color);
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

  const series = !!editing?.repeat;
  const canSkip = !!editing && series && !!preset && meetingOccursOn(editing, preset);

  const save = (e?: Event) => {
    e?.preventDefault();
    if (!name) {
      input.current?.focus();
      return;
    }
    if (!vDay || color === null) return;
    const fields = { title: name, day: vDay, at: vAt || null, until: until || null, place, color, repeat, repeatUntil: repeatUntil || null };
    if (editing) ui.store.act((st) => updateMeeting(st, editing.id, fields));
    else ui.store.act((st, now) => addMeeting(st, now, fields));
    const when = `${formatDue(vDay, s.day)}${cleanTime(vAt) ? ` в ${cleanTime(vAt)!.replace(/^0/, '')}` : ''}${repeat ? `, ${MEETING_REPEAT_NAME[repeat].toLowerCase()}` : ''}`;
    ui.toast(editing ? 'Встреча сохранена' : `Встреча в календаре: ${when}`);
    ui.close();
  };

  const remove = () => {
    if (!editing) return;
    const gone = ui.store.act((st) => removeMeeting(st, editing.id));
    ui.close();
    if (gone) ui.toast(series ? 'Серия встреч удалена' : 'Встреча удалена', { label: 'Вернуть', run: () => ui.store.act((st) => restoreMeeting(st, gone)) });
  };

  const skip = () => {
    if (!editing || !preset) return;
    ui.store.act((st) => skipMeetingDay(st, editing.id, preset));
    ui.close();
    ui.toast(`Пропущено: ${formatDue(preset, s.day)}`, { label: 'Вернуть', run: () => ui.store.act((st) => unskipMeetingDay(st, editing.id, preset)) });
  };

  return (
    <Sheet
      title={editing ? 'Встреча' : 'Новая встреча'}
      onClose={ui.close}
      footer={
        <button class="btn btn-gold btn-wide" onClick={save}>
          {editing ? (series ? 'Сохранить всю серию' : 'Сохранить') : 'Добавить в календарь'}
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
        <span class="field-label">{repeat ? 'Первый день' : 'День'}</span>
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
      <Chips
        label="Повтор"
        value={repeat}
        options={[{ value: null as MeetingRepeat | null, label: 'Нет' }, ...MEETING_REPEATS.map((r) => ({ value: r as MeetingRepeat | null, label: MEETING_REPEAT_NAME[r] }))]}
        onChange={setRepeat}
      />
      {repeat && (
        <label class="field">
          <span class="field-label">Повторять до (можно не указывать)</span>
          <input class="input" type="date" min={vDay} value={repeatUntil} onInput={(e) => setRepeatUntil(e.currentTarget.value)} />
        </label>
      )}
      <QuestColorPicker initial={editing?.color} onChange={setColor} onNone={() => setColor(undefined)} label="Цвет" noneLabel="Обычный" />
      {series && <p class="note">Правка меняет все дни этой встречи. Чтобы убрать только один день, пропусти его.</p>}
      {editing && (
        <div class="actions">
          {canSkip && (
            <button class="act" onClick={skip}>
              <LIcon name="close" size={16} />
              Пропустить только этот день: {formatDue(preset!, s.day)}
            </button>
          )}
          <button class="act act-danger" onClick={remove}>
            <LIcon name="close" size={16} />
            {series ? 'Удалить всю серию' : 'Удалить встречу'}
          </button>
        </div>
      )}
    </Sheet>
  );
}
