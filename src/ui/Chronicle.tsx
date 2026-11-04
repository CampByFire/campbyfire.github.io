// Летопись: герой, последние дни, настройки, копия сохранения, справка и «Стереть всё».
import { useRef, useState } from 'preact/hooks';
import { heroLevel } from '../game/rules';
import { doneOn } from '../game/state';
import { isNewerSave, parseSave } from '../game/store';
import { addDays, formatDate, formatDuration, formatMinutes, scheduleError } from '../game/time';
import type { Settings } from '../game/types';
import { W, WEEKDAY_CHIPS } from '../game/words';
import { GitHubError } from '../sync/github';
import { BUILD, VERSION } from '../version';
import type { Ui } from './App';
import { downloadGame } from './files';
import { GIcon, LIcon } from './Icon';
import { clearLocal } from './local';
import type { Motion } from './magic/mode';
import { ChipText, Chips } from './parts';
import { Sheet } from './Sheets';
import { SyncPanel, useSync } from './SyncPanel';

export function Chronicle({ ui }: { ui: Ui }) {
  const { store } = ui;
  const s = store.state;
  const lvl = heroLevel(s.hero.xp);
  const days = Array.from({ length: 14 }, (_, i) => addDays(s.day, -i)).filter((d) => s.log[d]);
  const file = useRef<HTMLInputElement>(null);

  const setSetting = (patch: Partial<Settings>) => store.act((st) => Object.assign(st.settings, patch));
  const [timeError, setTimeError] = useState<string | null>(null);
  // Время, при котором смены путаются, не сохраняется: поле возвращается к прежнему.
  const setTime = (patch: Partial<Settings>) => {
    const error = scheduleError({ ...s.settings, ...patch });
    setTimeError(error);
    if (!error) setSetting(patch);
  };

  const download = () => downloadGame(store);

  const upload = async (f: File) => {
    const text = await f.text();
    const next = parseSave(text);
    if (!next) {
      ui.toast(isNewerSave(text) ? 'Копия из более новой версии Лагеря: обнови страницу' : 'Это не копия Лагеря');
      return;
    }
    if (!confirm('Заменить текущую игру копией из файла?')) return;
    ui.sync.replaceGame(next);
    ui.toast('Копия загружена');
  };

  return (
    <div class="page">
      <h1 class="page-title">{W.chronicle}</h1>

      <div class="hero-card">
        <div class="hero-level">
          <span class="hero-level-n">{lvl.level}</span>
          <span class="hero-level-l">уровень</span>
        </div>
        <div class="hero-body">
          <div class="hero-xp">
            <span aria-hidden="true">
              {lvl.into} / {lvl.need}
            </span>
            <span class="sr-only">
              {lvl.into} из {lvl.need}
            </span>{' '}
            опыта до следующего
          </div>
          <span class="bar bar-gold" aria-hidden="true">
            <span style={{ width: `${(lvl.into / lvl.need) * 100}%` }} />
          </span>
          <div class="hero-gold">
            <GIcon name="coins" size={15} />
            {s.hero.gold.toLocaleString('ru-RU')} золота в сундуке
          </div>
        </div>
      </div>

      <section class="group">
        <div class="group-head">
          <h2 class="sc">Последние дни</h2>
        </div>
        {days.length === 0 && <p class="note">Летопись пуста. Первая запись появится после первой сделанной задачи.</p>}
        {days.map((d) => {
          const l = s.log[d];
          const done = doneOn(s, d);
          return (
            <details key={d} class="day">
              <summary>
                <span class="day-date">{formatDate(d)}</span>
                <span class="meta">
                  {l.done} сделано · +{l.gold} · {formatDuration(Math.round(l.workedMs / 60_000))}
                </span>
              </summary>
              {done.map((t) => (
                <div key={t.id} class="day-task">
                  <GIcon name="check" size={12} class="ic-green" />
                  {t.title}
                </div>
              ))}
            </details>
          );
        })}
      </section>

      <section class="group">
        <div class="group-head">
          <h2 class="sc">Распорядок</h2>
        </div>
        <div class="field-row">
          <TimeField label="Работа с" value={s.settings.workStart} onChange={(v) => setTime({ workStart: v })} />
          <TimeField label="до" value={s.settings.workEnd} onChange={(v) => setTime({ workEnd: v })} />
          <TimeField label="Отбой" value={s.settings.bedtime} onChange={(v) => setTime({ bedtime: v })} />
        </div>
        {timeError && <p class="note note-error">{timeError}</p>}
        <div class="field">
          <div class="field-label">Рабочие дни</div>
          <div class="chips" role="group" aria-label="Рабочие дни">
            {WEEKDAY_CHIPS.map(({ value: d, label, sr }) => {
              const on = s.settings.workDays.includes(d);
              return (
                <button
                  key={d}
                  class={`chipbtn${on ? ' is-on' : ''}`}
                  aria-pressed={on}
                  onClick={() => setSetting({ workDays: on ? s.settings.workDays.filter((x) => x !== d) : [...s.settings.workDays, d] })}
                >
                  <ChipText label={label} sr={sr} />
                </button>
              );
            })}
          </div>
        </div>
      </section>

      <section class="group">
        <div class="group-head">
          <h2 class="sc">Магия</h2>
        </div>
        <Chips label="Сколько анимаций" value={ui.motion} options={MOTION_CHIPS} onChange={ui.setMotion} />
        <p class="note">{MOTION_NOTE[ui.motion]} Выбор помнит только это устройство.</p>
      </section>

      <section class="group">
        <div class="group-head">
          <h2 class="sc">Сохранение в GitHub</h2>
        </div>
        <SyncPanel ui={ui} />
      </section>

      <section class="group">
        <div class="group-head">
          <h2 class="sc">Копия в файл</h2>
        </div>
        <p class="note">Игра хранится в этом браузере. Копия в файле пригодится, чтобы перенести игру без GitHub или просто не потерять.</p>
        <div class="btns">
          <button class="btn btn-ghost" onClick={download}>
            Сохранить копию
          </button>
          <button class="btn btn-ghost" onClick={() => file.current?.click()}>
            Загрузить копию
          </button>
        </div>
        <input ref={file} type="file" accept="application/json,.json" hidden onChange={(e) => {
          const f = e.currentTarget.files?.[0];
          if (f) void upload(f);
          e.currentTarget.value = '';
        }} />
      </section>

      <section class="group">
        <div class="group-head">
          <h2 class="sc">Справка</h2>
        </div>
        <div class="btns">
          <button class="btn btn-ghost" onClick={() => ui.open({ kind: 'rules' })}>
            Правила
          </button>
          <button class="btn btn-ghost" onClick={() => ui.open({ kind: 'about' })}>
            О приложении
          </button>
        </div>
        <p class="note version">
          Версия {VERSION} от {BUILD}
        </p>
      </section>

      <section class="group">
        <div class="group-head">
          <h2 class="sc">Стереть всё</h2>
        </div>
        <p class="note">Убрать игру из этого браузера и, если хочешь, её сохранение из GitHub.</p>
        <div class="actions">
          <button class="act act-danger" onClick={() => ui.open({ kind: 'wipe' })}>
            <LIcon name="trash" size={16} />
            Стереть игру…
          </button>
        </div>
      </section>
    </div>
  );
}

const MOTION_CHIPS: { value: Motion; label: string }[] = [
  { value: 'full', label: 'Вся' },
  { value: 'calm', label: 'Спокойная' },
  { value: 'off', label: 'Без анимаций' },
];

const MOTION_NOTE: Record<Motion, string> = {
  full: 'Искры под пальцем, полёты наград, столб света над сданной задачей и чудо нового уровня.',
  calm: 'Без частиц, полётов и сдвигов: всё меняется мягким наплывом. Так Лагерь начинает сам, если в системе включено «Уменьшить движение».',
  off: 'Никакого движения: экран сразу показывает итог.',
};

/** Стереть игру из браузера, а по желанию и сохранение в GitHub. Потом страница открывается с чистого листа. */
export function WipeSheet({ ui }: { ui: Ui }) {
  const { store, sync } = ui;
  useSync(sync);
  const [remote, setRemote] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const s = store.state;
  const played = s.tasks.length > 0 || s.routines.length > 0 || s.hero.xp > 0;

  const wipe = async () => {
    setBusy(true);
    setError(null);
    if (remote && sync.connected) {
      try {
        await sync.removeSave();
      } catch (e) {
        const why = e instanceof GitHubError ? e.message : 'GitHub не ответил';
        setError(`Сохранение в GitHub не удалилось, и игра не стёрта. ${why}${/[.?!]$/.test(why) ? '' : '.'}`);
        setBusy(false);
        return;
      }
    }
    sync.disconnect();
    store.wipe();
    clearLocal();
    location.reload();
  };

  return (
    <Sheet
      title="Стереть всё"
      onClose={ui.close}
      footer={
        <div class="btns btns-col">
          <button class="btn btn-danger" disabled={busy} onClick={() => void wipe()}>
            {busy ? 'Стираю…' : remote ? 'Стереть игру и сохранение' : 'Стереть игру'}
          </button>
          <button class="btn btn-ghost" onClick={ui.close}>
            Оставить как есть
          </button>
        </div>
      }
    >
      <p class="note">
        Из этого браузера пропадут задачи, походы, золото, опыт и летопись дней. Отменить это нельзя: вернуть игру можно только из копии в файле или из GitHub.
      </p>
      {played && (
        <div class="btns btns-one">
          <button class="btn btn-ghost btn-sm" onClick={() => downloadGame(store)}>
            Сначала сохранить копию в файл
          </button>
        </div>
      )}
      {sync.connected && (
        <>
          <label class="check-row">
            <input type="checkbox" checked={remote} onChange={() => setRemote(!remote)} />
            <span>Удалить и сохранение в GitHub</span>
          </label>
          <p class="note">
            {remote
              ? 'Файл game/save.json удалится из репозитория, а сам репозиторий и дневник останутся. Прошлые версии игры остаются в истории репозитория. На других устройствах игра останется, но сохраняться в GitHub перестанет.'
              : 'Сохранение останется на GitHub: если подключить GitHub снова, игра вернётся. Токен на этом устройстве забудется.'}
          </p>
        </>
      )}
      {error && <p class="note note-error">{error}</p>}
    </Sheet>
  );
}

function TimeField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  const str = formatMinutes(value).padStart(5, '0');
  return (
    <label class="field">
      <span class="field-label">{label}</span>
      <input
        class="input"
        type="time"
        value={str}
        onChange={(e) => {
          const [h, m] = e.currentTarget.value.split(':').map(Number);
          if (!Number.isNaN(h) && !Number.isNaN(m)) onChange(h * 60 + m);
        }}
      />
    </label>
  );
}
