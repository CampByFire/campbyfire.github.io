// Летопись: дневник, свои разделы заметок (лента мыслей или статьи) и «Последние дни» из игры.
// Заметки и дневник хранятся отдельными файлами в lager-data (src/notes), а не в сохранении игры.
import { useEffect, useRef, useState } from 'preact/hooks';
import { doneOn } from '../game/state';
import { addDays, dayKey, formatClock, formatDate, formatDuration } from '../game/time';
import { W, notesCount } from '../game/words';
import type { DiaryDay } from '../notes/diary';
import { sectionDrafts } from '../notes/drafts';
import { plainText } from '../notes/markdown';
import { parentFolder, type Note, type Section } from '../notes/model';
import { search, type Hit } from '../notes/search';
import type { Notes } from '../notes/notes';
import type { Ui } from './App';
import { GIcon, LIcon } from './Icon';
import { RichText } from './Rich';

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

/** Место в Летописи для ui.section: раздел или папка в нём, «раздел/папка/вложенная». */
export const placeOf = (slug: string, folder = '') => (folder ? `${slug}/${folder}` : slug);

export function splitPlace(place: string): { slug: string; folder: string } {
  const i = place.indexOf('/');
  return i < 0 ? { slug: place, folder: '' } : { slug: place.slice(0, i), folder: place.slice(i + 1) };
}

/** Куда ведёт «Назад»: из папки в ту, где она лежит, из раздела к списку разделов (null). */
export function upPlace(place: string): string | null {
  const i = place.lastIndexOf('/');
  return i < 0 ? null : place.slice(0, i);
}

export function NotesScreen({ ui }: { ui: Ui }) {
  const place = ui.section;
  if (place === DAYS) return <DaysView ui={ui} />;
  if (place === DIARY) return <DiaryView ui={ui} />;
  const { slug, folder } = splitPlace(place ?? '');
  const section = slug ? ui.notes.section(slug) : null;
  if (section) {
    // Папку удалили (например, на другом устройстве): показываем ближайшую из тех, что остались.
    let f = folder;
    while (f && !ui.notes.folder(slug, f)) f = parentFolder(f);
    return <SectionView key={placeOf(slug, f)} ui={ui} section={section} folder={f} />;
  }
  return <SectionList ui={ui} />;
}

function SectionList({ ui }: { ui: Ui }) {
  const sections = ui.notes.sections();
  const [query, setQuery] = useState('');
  const searching = query.trim().length >= 2;
  return (
    <div class="page">
      <h1 class="page-title">{W.chronicle}</h1>
      <p class="page-sub">Дневник, мысли, идеи и статьи. Каждая заметка лежит отдельным файлом в твоём репозитории.</p>
      <button class="btn btn-gold btn-wide" onClick={() => ui.open({ kind: 'thought' })}>
        <LIcon name="bulb" size={19} />
        Записать мысль
      </button>
      <input
        class="input nsearch"
        type="search"
        value={query}
        placeholder="Найти в Летописи"
        aria-label="Поиск по Летописи"
        onInput={(e) => setQuery(e.currentTarget.value)}
      />
      {searching ? <SearchResults ui={ui} query={query} /> : <Shelves ui={ui} sections={sections} />}
      <NotesState ui={ui} />
    </div>
  );
}

function SearchResults({ ui, query }: { ui: Ui; query: string }) {
  const hits = search(ui.notes, query);
  const open = (h: Hit) => (h.kind === 'note' ? ui.open({ kind: 'note', slug: h.slug, path: h.path }) : ui.open({ kind: 'diary', path: h.path, entry: h.entry }));
  return (
    <section class="group nlist" aria-label="Найдено">
      {hits.length === 0 && <p class="note">Ничего не нашлось.</p>}
      {hits.map((h) => (
        <button key={h.kind === 'note' ? h.path : `${h.path}|${h.entry.time}|${h.entry.title ?? ''}|${h.entry.text}`} class="ncard nhit" onClick={() => open(h)}>
          <span class="ncard-date">{h.kind === 'note' ? h.where : `Дневник · ${dayName(ui, h.day)}${h.entry.time ? `, ${h.entry.time.replace(/^0/, '')}` : ''}`}</span>
          {(h.kind === 'note' ? h.title : h.entry.title) && <span class="ncard-title">{h.kind === 'note' ? h.title : h.entry.title}</span>}
          <span class="ncard-line nhit-text">
            {h.snippet.before}
            <mark>{h.snippet.match}</mark>
            {h.snippet.after}
          </span>
        </button>
      ))}
    </section>
  );
}

function Shelves({ ui, sections }: { ui: Ui; sections: Section[] }) {
  return (
    <>
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
    </>
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

function Back({ ui, to = null, label = W.chronicle }: { ui: Ui; to?: string | null; label?: string }) {
  return (
    <button class="nback" onClick={() => ui.openSection(to)}>
      <LIcon name="back" size={18} />
      <span class="nback-text">{label}</span>
    </button>
  );
}

/** Раздел или папка в нём: папки, поле записи или «Новая статья», черновики и заметки. */
function SectionView({ ui, section, folder }: { ui: Ui; section: Section; folder: string }) {
  const { slug } = section;
  const here = folder ? ui.notes.folder(slug, folder) : null;
  const list = ui.notes.notesIn(slug, folder);
  const subs = ui.notes.folders(slug, folder);
  const stati = section.vid === 'stati';
  // Путь до этой папки: раздел, потом папки по очереди.
  const crumbs = [{ place: slug, title: section.title }];
  if (folder) {
    const parts = folder.split('/');
    parts.forEach((_, i) => {
      const path = parts.slice(0, i + 1).join('/');
      crumbs.push({ place: placeOf(slug, path), title: ui.notes.folder(slug, path)?.title ?? parts[i] });
    });
  }
  const up = crumbs.length > 1 ? crumbs[crumbs.length - 2] : null;
  return (
    <div class="page">
      <div class="page-top">
        <Back ui={ui} to={up?.place ?? null} label={up?.title ?? W.chronicle} />
        <div class="page-tools">
          <button class="icon-btn" aria-label="Новая папка" title="Новая папка" onClick={() => ui.open({ kind: 'folder', slug, parent: folder })}>
            <LIcon name="folderPlus" size={20} />
          </button>
          <button
            class="icon-btn"
            aria-label={here ? 'Настроить папку' : 'Настроить раздел'}
            title={here ? 'Настроить папку' : 'Настроить раздел'}
            onClick={() => ui.open(here ? { kind: 'folder', slug, path: folder } : { kind: 'section', slug })}
          >
            <LIcon name="edit" size={19} />
          </button>
        </div>
      </div>
      {crumbs.length > 2 && (
        <nav class="ncrumbs" aria-label="Где эта папка">
          <ol>
            {crumbs.slice(0, -1).map((c) => (
              <li key={c.place}>
                <button class="ncrumb" onClick={() => ui.openSection(c.place)}>
                  {c.title}
                </button>
              </li>
            ))}
          </ol>
        </nav>
      )}
      <h1 class="page-title ntitle">
        <LIcon name={here ? 'folder' : section.icon} size={26} class="nsec-ic" />
        {here ? here.title : section.title}
      </h1>
      {stati ? (
        <button class="btn btn-ghost btn-wide" onClick={() => ui.open({ kind: 'note', slug, folder })}>
          <LIcon name="plus" size={18} />
          Новая статья
        </button>
      ) : (
        <FeedInput ui={ui} slug={slug} folder={folder} />
      )}
      {subs.length > 0 && (
        <section class="group nfolders">
          <div class="group-head">
            <h2 class="sc">Папки</h2>
          </div>
          <div class="nsec-list">
            {subs.map((f) => (
              <button key={f.path} class="row nsec" onClick={() => ui.openSection(placeOf(slug, f.path))}>
                <LIcon name="folder" size={20} class="nsec-ic" />
                <span class="row-title">{f.title}</span>
                <span class="nsec-meta">{notesCount(ui.notes.count(slug, f.path))}</span>
                <LIcon name="chevron" size={16} class="nsec-go" />
              </button>
            ))}
          </div>
        </section>
      )}
      <div class="nlist">
        {sectionDrafts(slug, localStorage, folder).map((d) => (
          <button key={d.key} class="ncard ndraft" onClick={() => ui.open({ kind: 'note', slug, path: d.path, folder })}>
            <span class="ncard-date">Несохранённый черновик, {when(ui, d.at)}</span>
            {stati && <span class="ncard-title">{d.title || 'Без названия'}</span>}
            <span class="ncard-line">{plainText(d.text).split('\n')[0]}</span>
          </button>
        ))}
        {list.length === 0 && subs.length === 0 && (
          <p class="note">{here ? 'В папке пока пусто.' : stati ? 'Статей пока нет.' : 'Здесь пока пусто. Первая запись появится сверху.'}</p>
        )}
        {list.map((n) => (stati ? <ArticleCard key={n.path} ui={ui} n={n} /> : <FeedCard key={n.path} ui={ui} n={n} />))}
      </div>
    </div>
  );
}

/** Поле ленты: пишешь и жмёшь «Записать», запись встаёт сверху. */
function FeedInput({ ui, slug, folder }: { ui: Ui; slug: string; folder: string }) {
  return <WriteBox ui={ui} label="Новая запись" placeholder="Что пришло в голову?" onSave={(text) => ui.notes.addNote(slug, { text }, folder)} />;
}

function WriteBox({ ui, label, placeholder, named, onSave }: { ui: Ui; label: string; placeholder: string; named?: boolean; onSave: (text: string, title: string) => void }) {
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const box = useRef<HTMLTextAreaElement>(null);
  const save = () => {
    if (!text.trim()) return;
    onSave(text, title);
    setTitle('');
    setText('');
    ui.toast(HERO_NOTED);
    box.current?.focus();
  };
  return (
    <div class="nfeed-in">
      {named && <input class="input" value={title} maxLength={80} placeholder="Название" aria-label="Название записи" onInput={(e) => setTitle(e.currentTarget.value)} />}
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
      {n.text.trim() ? <RichText class="ncard-text" text={n.text} links={false} /> : <span class="ncard-text">Пустая запись</span>}
    </button>
  );
}

function ArticleCard({ ui, n }: { ui: Ui; n: Note }) {
  const first = plainText(n.body).split('\n')[0] ?? '';
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
      <WriteBox ui={ui} label="Запись в дневник" placeholder="Как прошёл день?" named onSave={(text, title) => ui.notes.addDiary(text, title)} />
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
          {e.title && <span class="ncard-title">{e.title}</span>}
          {e.text ?<RichText class="ncard-text" text={e.text} links={false} /> : <span class="ncard-text">Пустая запись</span>}
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
