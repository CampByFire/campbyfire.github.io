// Летопись: дневник, свои разделы заметок (лента мыслей или статьи) и «Последние дни» из игры.
// Заметки и дневник хранятся отдельными файлами в lager-data (src/notes), а не в сохранении игры.
import { useEffect, useRef, useState } from 'preact/hooks';
import { doneOn } from '../game/state';
import { addDays, dayKey, formatClock, formatDate, formatDuration } from '../game/time';
import { W } from '../game/words';
import type { DiaryDay } from '../notes/diary';
import type { Note, Section } from '../notes/model';
import type { Notes } from '../notes/notes';
import type { Ui } from './App';
import { GIcon, LIcon } from './Icon';

export function useNotes(notes: Notes): void {
  const [, setN] = useState(0);
  useEffect(() => notes.subscribe(() => setN((n) => n + 1)), [notes]);
}

/** Что герой отвечает на записанную мысль. Золота и опыта за заметки нет. */
export const HERO_NOTED = 'Записал, не потеряется';

const KIND_NAME = { lenta: 'лента', stati: 'статьи' } as const;

// Встроенные разделы. Двоеточия в имени папки раздела не бывает, поэтому свой раздел их не перекроет.
export const DIARY = ':diary';
export const DAYS = ':days';

export function NotesScreen({ ui }: { ui: Ui }) {
  const slug = ui.section;
  if (slug === DAYS) return <DaysView ui={ui} />;
  if (slug === DIARY) return <DiaryView ui={ui} />;
  const section = slug ? ui.notes.section(slug) : null;
  if (section) return <SectionView ui={ui} section={section} />;
  return <SectionList ui={ui} />;
}

function SectionList({ ui }: { ui: Ui }) {
  const sections = ui.notes.sections();
  return (
    <div class="page">
      <h1 class="page-title">{W.chronicle}</h1>
      <p class="page-sub">Дневник, мысли, идеи и статьи. Каждая заметка лежит отдельным файлом в твоём репозитории.</p>
      <button class="btn btn-gold btn-wide" onClick={() => ui.open({ kind: 'thought' })}>
        <LIcon name="bulb" size={19} />
        Записать мысль
      </button>
      <section class="group">
        <div class="group-head">
          <h2 class="sc">Разделы</h2>
        </div>
        <div class="nsec-list">
          <button class="row nsec" onClick={() => ui.openSection(DIARY)}>
            <LIcon name="feather" size={20} class="nsec-ic" />
            <span class="row-title">Дневник</span>
            <span class="nsec-meta">дни · {ui.notes.diary().length}</span>
            <LIcon name="chevron" size={16} class="nsec-go" />
          </button>
          {sections.map((s) => {
            const n = ui.notes.notes(s.slug).length;
            return (
              <button key={s.slug} class="row nsec" onClick={() => ui.openSection(s.slug)}>
                <LIcon name={s.icon} size={20} class="nsec-ic" />
                <span class="row-title">{s.title}</span>
                <span class="nsec-meta">
                  {KIND_NAME[s.vid]} · {n}
                </span>
                <LIcon name="chevron" size={16} class="nsec-go" />
              </button>
            );
          })}
          <button class="row nsec nsec-new" onClick={() => ui.open({ kind: 'section' })}>
            <LIcon name="plus" size={18} class="nsec-ic" />
            <span class="row-title">Новый раздел</span>
          </button>
        </div>
      </section>
      <section class="group">
        <div class="group-head">
          <h2 class="sc">Из игры</h2>
        </div>
        <div class="nsec-list">
          <button class="row nsec" onClick={() => ui.openSection(DAYS)}>
            <GIcon name="scroll" size={20} class="nsec-ic" />
            <span class="row-title">Последние дни</span>
            <span class="nsec-meta">что сделано</span>
            <LIcon name="chevron" size={16} class="nsec-go" />
          </button>
        </div>
      </section>
      <NotesState ui={ui} />
    </div>
  );
}

/** Где сейчас заметки: только в браузере, ждут сети или уже в GitHub. */
function NotesState({ ui }: { ui: Ui }) {
  const { notes } = ui;
  const pending = notes.pending;
  const phase = notes.status.phase;
  if (phase === 'local') {
    return (
      <p class="note nstate">
        Заметки пока только в этом браузере. Подключи GitHub в Настройках, и они будут лежать в репозитории, в папках notes и diary.{' '}
        <button class="link-btn" onClick={() => ui.go('settings')}>
          Открыть Настройки
        </button>
      </p>
    );
  }
  if (phase === 'error') return <p class="note note-error nstate">Заметки не сохраняются в GitHub: {notes.status.error}</p>;
  if (pending > 0) return <p class="note nstate">{phase === 'offline' ? 'Нет связи с GitHub' : 'Сохраняю в GitHub'}: ещё не там {pending}. Здесь ничего не потеряется.</p>;
  return <p class="note nstate">Всё сохранено в GitHub, в папках notes и diary репозитория.</p>;
}

function Back({ ui }: { ui: Ui }) {
  return (
    <button class="nback" onClick={() => ui.openSection(null)}>
      <LIcon name="back" size={18} />
      {W.chronicle}
    </button>
  );
}

function SectionView({ ui, section }: { ui: Ui; section: Section }) {
  const list = ui.notes.notes(section.slug);
  const stati = section.vid === 'stati';
  return (
    <div class="page">
      <div class="page-top">
        <Back ui={ui} />
        <button class="icon-btn" aria-label="Настроить раздел" onClick={() => ui.open({ kind: 'section', slug: section.slug })}>
          <LIcon name="edit" size={19} />
        </button>
      </div>
      <h1 class="page-title ntitle">
        <LIcon name={section.icon} size={26} class="nsec-ic" />
        {section.title}
      </h1>
      {stati ? (
        <button class="btn btn-ghost btn-wide" onClick={() => ui.open({ kind: 'note', slug: section.slug })}>
          <LIcon name="plus" size={18} />
          Новая статья
        </button>
      ) : (
        <FeedInput ui={ui} slug={section.slug} />
      )}
      <div class="nlist">
        {list.length === 0 && <p class="note">{stati ? 'Статей пока нет.' : 'Здесь пока пусто. Первая запись появится сверху.'}</p>}
        {list.map((n) => (stati ? <ArticleCard key={n.path} ui={ui} n={n} /> : <FeedCard key={n.path} ui={ui} n={n} />))}
      </div>
    </div>
  );
}

/** Поле ленты: пишешь и жмёшь «Записать», запись встаёт сверху. */
function FeedInput({ ui, slug }: { ui: Ui; slug: string }) {
  return <WriteBox ui={ui} label="Новая запись" placeholder="Что пришло в голову?" onSave={(text) => ui.notes.addNote(slug, { text })} />;
}

function WriteBox({ ui, label, placeholder, onSave }: { ui: Ui; label: string; placeholder: string; onSave: (text: string) => void }) {
  const [text, setText] = useState('');
  const box = useRef<HTMLTextAreaElement>(null);
  const save = () => {
    if (!text.trim()) return;
    onSave(text);
    setText('');
    ui.toast(HERO_NOTED);
    box.current?.focus();
  };
  return (
    <div class="nfeed-in">
      <textarea
        ref={box}
        class="input ntext"
        rows={2}
        value={text}
        placeholder={placeholder}
        aria-label={label}
        onInput={(e) => setText(e.currentTarget.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) save();
        }}
      />
      <button class="btn btn-gold" disabled={!text.trim()} onClick={save}>
        Записать
      </button>
    </div>
  );
}

/** «сегодня, 8:12», «вчера, 21:40» или «вторник, 2 ноября». */
function when(ui: Ui, at: number): string {
  const day = dayKey(at);
  const today = dayKey(ui.now);
  const name = day === today ? 'сегодня' : day === addDays(today, -1) ? 'вчера' : formatDate(day);
  return `${name}, ${formatClock(at)}`;
}

function FeedCard({ ui, n }: { ui: Ui; n: Note }) {
  return (
    <button class="ncard" onClick={() => ui.open({ kind: 'note', slug: n.slug, path: n.path })}>
      {n.at !== null && <span class="ncard-date">{when(ui, n.at)}</span>}
      <span class="ncard-text">{n.text.trim() || 'Пустая запись'}</span>
    </button>
  );
}

function ArticleCard({ ui, n }: { ui: Ui; n: Note }) {
  const first = n.body.trim().split('\n')[0] ?? '';
  return (
    <button class="ncard" onClick={() => ui.open({ kind: 'note', slug: n.slug, path: n.path })}>
      <span class="ncard-title">{n.title || 'Без названия'}</span>
      {first && <span class="ncard-line">{first}</span>}
    </button>
  );
}

/** «Сегодня», «Вчера» или «Вт, 2 ноя». */
function dayName(ui: Ui, day: string): string {
  const today = dayKey(ui.now);
  return day === today ? 'Сегодня' : day === addDays(today, -1) ? 'Вчера' : formatDate(day);
}

/** Дневник: поле на сегодня, ниже дни, новые сверху. В каждом дне записи по времени. */
function DiaryView({ ui }: { ui: Ui }) {
  const days = ui.notes.diary();
  return (
    <div class="page">
      <div class="page-top">
        <Back ui={ui} />
      </div>
      <h1 class="page-title ntitle">
        <LIcon name="feather" size={26} class="nsec-ic" />
        Дневник
      </h1>
      <WriteBox ui={ui} label="Запись в дневник" placeholder="Как прошёл день?" onSave={(text) => ui.notes.addDiary(text)} />
      <div class="nlist">
        {days.length === 0 && <p class="note">Здесь пока пусто. Каждый день ляжет в репозиторий отдельным файлом, записи в нём по времени.</p>}
        {days.map((d) => (
          <DiaryDayBlock key={d.path} ui={ui} d={d} />
        ))}
      </div>
    </div>
  );
}

function DiaryDayBlock({ ui, d }: { ui: Ui; d: DiaryDay }) {
  const log = ui.store.state.log[d.day];
  return (
    <section class="nday">
      <h2 class="nday-head">
        <span class="nday-date">{dayName(ui, d.day)}</span>
        {log && log.done > 0 && (
          <span class="nday-game">
            в игре: {log.done} сделано · +{log.gold}
          </span>
        )}
      </h2>
      {d.entries.map((e, i) => (
        <button key={`${i}-${e.time}`} class="ncard" onClick={() => ui.open({ kind: 'diary', path: d.path, entry: e })}>
          {e.time && <span class="ncard-date">{e.time.replace(/^0/, '')}</span>}
          <span class="ncard-text">{e.text || 'Пустая запись'}</span>
        </button>
      ))}
    </section>
  );
}

/** Сделанное за последние две недели: раньше это была Летопись целиком. */
function DaysView({ ui }: { ui: Ui }) {
  const s = ui.store.state;
  const days = Array.from({ length: 14 }, (_, i) => addDays(s.day, -i)).filter((d) => s.log[d]);
  return (
    <div class="page">
      <div class="page-top">
        <Back ui={ui} />
      </div>
      <h1 class="page-title">Последние дни</h1>
      <section class="group">
        {days.length === 0 && <p class="note">Пока пусто. Первая запись появится после первой сделанной задачи.</p>}
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
    </div>
  );
}
