// Листы Летописи: быстрая мысль, заметка или статья, запись дневника, новый раздел и его настройки,
// папка в разделе и перенос заметки или папки в другую папку.
import { useState } from 'preact/hooks';
import { formatDate } from '../game/time';
import { diaryDay, sameEntry, type DiaryEntry } from '../notes/diary';
import { notesCount } from '../game/words';
import { draftKey, draftOutdated, dropDraft, loadDraft, moveDraft, putDraft } from '../notes/drafts';
import { SECTION_ICONS, insideFolder, parentFolder, splitPath, type SectionIcon, type SectionKind } from '../notes/model';
import type { Ui } from './App';
import { LIcon } from './Icon';
import { loadLocal, updateLocal } from './local';
import { DIARY, HERO_NOTED, placeOf } from './Notes';
import { Chips } from './parts';
import { RichEditor, RichText } from './Rich';
import { Sheet } from './Sheets';

const NEW = '+new';
const ICON_NAME: Record<SectionIcon, string> = { bulb: 'лампа', book: 'книга', feather: 'перо', star: 'звезда', list: 'список', flag: 'флаг' };
const KIND_HINT: Record<SectionKind, string> = {
  lenta: 'одно поле, запись в одно нажатие, новые сверху',
  stati: 'у каждой заметки заголовок и длинный текст',
};

/**
 * Быстрая мысль: поле и выбор раздела (по умолчанию тот, куда писали в прошлый раз). Дневник тоже
 * здесь. Можно завести новый раздел, тогда раздел и первая заметка в нём появятся за один раз.
 */
export function ThoughtSheet({ ui, slug }: { ui: Ui; slug?: string }) {
  const sections = ui.notes.sections();
  const last = slug ?? loadLocal(ui.now).lastSection;
  const known = (t: string | undefined): t is string => !!t && (t === DIARY || sections.some((s) => s.slug === t));
  const [target, setTarget] = useState<string>(() => (known(last) ? last : sections[0]?.slug ?? NEW));
  const [newName, setNewName] = useState(sections.length ? '' : 'Идеи');
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const chosen = sections.find((s) => s.slug === target);
  const stati = chosen?.vid === 'stati';
  const diary = target === DIARY;
  const ready = !!text.trim() && (target !== NEW || !!newName.trim());
  const save = () => {
    if (!ready) return;
    const where = target === NEW ? ui.notes.createSection({ title: newName, icon: 'bulb', vid: 'lenta' }) : target;
    if (where === DIARY) ui.notes.addDiary(text, title);
    else ui.notes.addNote(where, { title, text });
    updateLocal(ui.now, (l) => {
      l.lastSection = where;
    });
    ui.close();
    ui.toast(HERO_NOTED);
  };
  return (
    <Sheet
      title="Записать мысль"
      onClose={ui.close}
      footer={
        <button class="btn btn-gold btn-wide" disabled={!ready} onClick={save}>
          Записать
        </button>
      }
    >
      <Chips
        label="Куда"
        value={target}
        options={[{ value: DIARY, label: 'Дневник' }, ...sections.map((s) => ({ value: s.slug, label: s.title })), { value: NEW, label: '+ Новый раздел' }]}
        onChange={setTarget}
      />
      {target === NEW && (
        <label class="field">
          <span class="field-label">Название раздела</span>
          <input class="input" value={newName} maxLength={40} placeholder="Например, Идеи" onInput={(e) => setNewName(e.currentTarget.value)} />
        </label>
      )}
      {(stati || diary) && (
        <label class="field">
          <span class="field-label">{diary ? 'Название' : 'Заголовок'}</span>
          <input class="input" value={title} maxLength={80} onInput={(e) => setTitle(e.currentTarget.value)} />
        </label>
      )}
      <label class="field">
        <span class="field-label">{stati ? 'Текст' : 'Мысль'}</span>
        <textarea class="input ntext" rows={5} value={text} placeholder="Что пришло в голову?" autoFocus onInput={(e) => setText(e.currentTarget.value)} />
      </label>
    </Sheet>
  );
}

/** Заметка ленты или статья: открыть, поправить, перенести, удалить. Без path это новая статья в папке folder. */
export function NoteSheet({ ui, slug, path, folder = '' }: { ui: Ui; slug: string; path?: string; folder?: string }) {
  const section = ui.notes.section(slug);
  const note = path ? ui.notes.note(path) : null;
  const stati = section?.vid === 'stati';
  const key = draftKey(slug, path, folder);
  // Перенести можно, если есть куда: в разделе есть папки или заметка лежит в папке.
  const canMove = !!note && (!!note.folder || ui.notes.folders(slug).length > 0);
  const move = () => path && ui.open({ kind: 'move', slug, path, what: 'note' });
  const [draft] = useState(() => loadDraft(key));
  const base = { title: note?.title ?? '', text: note ? (stati ? note.body : note.text).replace(/\n$/, '') : '' };
  const [title, setTitle] = useState(draft?.title ?? base.title);
  const [text, setText] = useState(draft?.text ?? base.text);
  // Статья открывается для чтения, править её можно кнопкой. Новая статья и запись ленты сразу правятся, статья с черновиком тоже.
  const [editing, setEditing] = useState(!path || !stati || !!draft);
  const change = (nextTitle: string, nextText: string) => {
    setTitle(nextTitle);
    setText(nextText);
    putDraft(key, { title: nextTitle, text: nextText }, base, ui.now);
  };
  if (path && !note && !draft) {
    // Заметку удалили, пока лист был открыт (например, на другом устройстве).
    return (
      <Sheet title="Заметка" onClose={ui.close}>
        <p class="note">Этой заметки больше нет.</p>
      </Sheet>
    );
  }
  const save = () => {
    if (!text.trim() && !title.trim()) return;
    // Если заметку удалили, а черновик остался, она запишется заново.
    if (path && note) ui.notes.saveNote(path, { title, text });
    else ui.notes.addNote(slug, { title, text }, path ? (splitPath(path)?.folder ?? '') : folder);
    dropDraft(key);
    ui.close();
    if (!path) ui.toast(HERO_NOTED);
  };
  const remove = () => {
    if (!path || !confirm('Удалить эту заметку? В истории репозитория она останется.')) return;
    ui.notes.deleteNote(path);
    dropDraft(key);
    ui.close();
    ui.toast('Заметка удалена');
  };
  if (!editing && note) {
    return (
      <Sheet
        title="Статья"
        onClose={ui.close}
        footer={
          <button class="btn btn-gold btn-wide" onClick={() => setEditing(true)}>
            <LIcon name="edit" size={18} />
            Править
          </button>
        }
      >
        <h3 class="nread-title">{note.title || 'Без названия'}</h3>
        <RichText class="nread" text={note.body} sections />
        <p class="note nfile">{path}</p>
        {canMove && (
          <div class="actions">
            <button class="act" onClick={move}>
              <LIcon name="move" size={16} />
              Перенести в папку…
            </button>
          </div>
        )}
      </Sheet>
    );
  }
  return (
    <Sheet
      title={stati ? (path ? 'Статья' : 'Новая статья') : 'Запись'}
      onClose={ui.close}
      footer={
        <button class="btn btn-gold btn-wide" disabled={!text.trim() && !title.trim()} onClick={save}>
          Сохранить
        </button>
      }
    >
      {draft && (
        <p class="note ndraft-note">
          Черновик не сохранён, он есть только на этом устройстве.
          {path && !note && ' Заметку удалили, «Сохранить» запишет её заново.'}
          {note && draftOutdated(draft, base.text) && ' Заметка изменилась после начала черновика, «Сохранить» заменит новую версию.'}
        </p>
      )}
      {stati && (
        <label class="field">
          <span class="field-label">Заголовок</span>
          <input class="input" value={title} maxLength={80} onInput={(e) => change(e.currentTarget.value, text)} />
        </label>
      )}
      <RichEditor ui={ui} label="Текст" value={text} onChange={(next) => change(title, next)} long={stati} />
      {path && note && (
        <>
          <p class="note nfile">{path}</p>
          <div class="actions">
            {canMove && (
              <button class="act" onClick={move}>
                <LIcon name="move" size={16} />
                Перенести в папку…
              </button>
            )}
            <button class="act act-danger" onClick={remove}>
              <LIcon name="trash" size={16} />
              Удалить заметку
            </button>
          </div>
        </>
      )}
    </Sheet>
  );
}

/** Запись дневника: поправить или удалить. Время записи остаётся прежним. */
export function DiarySheet({ ui, path, entry }: { ui: Ui; path: string; entry: DiaryEntry }) {
  const [title, setTitle] = useState(entry.title ?? '');
  const [text, setText] = useState(entry.text);
  const day = diaryDay(path);
  const still = ui.notes.diary().some((d) => d.path === path && d.entries.some((e) => sameEntry(e, entry)));
  if (!still) {
    // Запись поправили или удалили, пока лист был открыт (например, на другом устройстве).
    return (
      <Sheet title="Запись в дневнике" onClose={ui.close}>
        <p class="note">Этой записи в таком виде больше нет.</p>
      </Sheet>
    );
  }
  const save = () => {
    if (!text.trim()) return;
    ui.notes.saveDiaryEntry(path, entry, text, title);
    ui.close();
  };
  const remove = () => {
    if (!confirm('Удалить эту запись из дневника? В истории репозитория она останется.')) return;
    ui.notes.saveDiaryEntry(path, entry, '');
    ui.close();
    ui.toast('Запись удалена');
  };
  return (
    <Sheet
      title="Запись в дневнике"
      onClose={ui.close}
      footer={
        <button class="btn btn-gold btn-wide" disabled={!text.trim()} onClick={save}>
          Сохранить
        </button>
      }
    >
      <p class="note">
        {day ? formatDate(day) : ''}
        {entry.time ? `, ${entry.time.replace(/^0/, '')}` : ''}
      </p>
      {entry.time && (
        <label class="field">
          <span class="field-label">Название</span>
          <input class="input" value={title} maxLength={80} onInput={(e) => setTitle(e.currentTarget.value)} />
        </label>
      )}
      <RichEditor ui={ui} label="Текст" value={text} onChange={setText} />
      <p class="note nfile">{path}</p>
      <div class="actions">
        <button class="act act-danger" onClick={remove}>
          <LIcon name="trash" size={16} />
          Удалить запись
        </button>
      </div>
    </Sheet>
  );
}

/** Новый раздел или настройки раздела: название, значок и вид. */
export function SectionSheet({ ui, slug }: { ui: Ui; slug?: string }) {
  const section = slug ? ui.notes.section(slug) : null;
  const [name, setName] = useState(section?.title ?? '');
  const [icon, setIcon] = useState<SectionIcon>(section?.icon ?? 'bulb');
  const [vid, setVid] = useState<SectionKind>(section?.vid ?? 'lenta');
  const save = () => {
    if (!name.trim()) return;
    if (section) {
      ui.notes.updateSection(section.slug, { title: name, icon, vid });
      ui.close();
    } else {
      ui.openSection(ui.notes.createSection({ title: name, icon, vid }));
    }
  };
  const remove = () => {
    if (!section) return;
    const n = ui.notes.notes(section.slug).length;
    const what = n ? `Удалятся и все заметки в нём и в его папках (${n}).` : ui.notes.folders(section.slug).length ? 'Заметок в нём нет, удалятся только папки.' : 'Он пустой.';
    if (!confirm(`Удалить раздел «${section.title}»? ${what} В истории репозитория они останутся.`)) return;
    ui.notes.deleteSection(section.slug);
    ui.openSection(null);
    ui.toast('Раздел удалён');
  };
  return (
    <Sheet
      title={section ? 'Раздел' : 'Новый раздел'}
      onClose={ui.close}
      footer={
        <button class="btn btn-gold btn-wide" disabled={!name.trim()} onClick={save}>
          {section ? 'Сохранить' : 'Создать'}
        </button>
      }
    >
      <label class="field">
        <span class="field-label">Название</span>
        <input class="input" value={name} maxLength={40} placeholder="Например, Идеи" onInput={(e) => setName(e.currentTarget.value)} />
      </label>
      <div class="field">
        <div class="field-label">Значок</div>
        <div class="chips" role="radiogroup" aria-label="Значок">
          {SECTION_ICONS.map((i) => (
            <button key={i} class={`chipbtn nicon${icon === i ? ' is-on' : ''}`} role="radio" aria-checked={icon === i} aria-label={ICON_NAME[i]} onClick={() => setIcon(i)}>
              <LIcon name={i} size={20} />
            </button>
          ))}
        </div>
      </div>
      <Chips
        label={`Вид: ${KIND_HINT[vid]}`}
        sr="Вид раздела"
        value={vid}
        options={[
          { value: 'lenta', label: 'Лента' },
          { value: 'stati', label: 'Статьи' },
        ]}
        onChange={setVid}
      />
      {section && (
        <>
          <p class="note nfile">notes/{section.slug}/</p>
          <div class="actions">
            <button class="act act-danger" onClick={remove}>
              <LIcon name="trash" size={16} />
              Удалить раздел…
            </button>
          </div>
        </>
      )}
    </Sheet>
  );
}

/** Новая папка или настройки папки: название, перенос и удаление. */
export function FolderSheet({ ui, slug, parent, path }: { ui: Ui; slug: string; parent: string; path?: string }) {
  const folder = path ? ui.notes.folder(slug, path) : null;
  const [name, setName] = useState(folder?.title ?? '');
  if (path && !folder) {
    return (
      <Sheet title="Папка" onClose={ui.close}>
        <p class="note">Этой папки больше нет.</p>
      </Sheet>
    );
  }
  const save = () => {
    if (!name.trim()) return;
    if (folder) ui.notes.renameFolder(slug, folder.path, name);
    else ui.notes.createFolder(slug, parent, name);
    ui.close();
    if (!folder) ui.toast('Папка создана');
  };
  const n = folder ? ui.notes.count(slug, folder.path) : 0;
  const inner = folder ? ui.notes.folders(slug, folder.path).length : 0;
  const up = folder ? parentFolder(folder.path) : '';
  const upName = up ? (ui.notes.folder(slug, up)?.title ?? up) : (ui.notes.section(slug)?.title ?? slug);
  const remove = (keep: boolean) => {
    if (!folder) return;
    if (!keep && n + inner > 0) {
      const what = n ? `Удалятся и все заметки в ней (${n}).` : 'Заметок в ней нет, удалятся только вложенные папки.';
      if (!confirm(`Удалить папку «${folder.title}» со всем, что в ней? ${what} В истории репозитория они останутся.`)) return;
    }
    ui.notes.deleteFolder(slug, folder.path, keep);
    ui.openSection(placeOf(slug, up));
    ui.toast(keep && n + inner > 0 ? `Папка удалена, всё из неё теперь в «${upName}»` : 'Папка удалена');
  };
  return (
    <Sheet
      title={folder ? 'Папка' : 'Новая папка'}
      onClose={ui.close}
      footer={
        <button class="btn btn-gold btn-wide" disabled={!name.trim()} onClick={save}>
          {folder ? 'Сохранить' : 'Создать'}
        </button>
      }
    >
      <label class="field">
        <span class="field-label">Название</span>
        <input class="input" value={name} maxLength={40} placeholder="Например, Проекты" onInput={(e) => setName(e.currentTarget.value)} />
      </label>
      {folder && (
        <>
          <p class="note">
            {notesCount(n)}
            {inner > 0 ? `, вложенных папок: ${inner}` : ''}
          </p>
          <p class="note nfile">notes/{slug}/{folder.path}/</p>
          <div class="actions">
            <button class="act" onClick={() => ui.open({ kind: 'move', slug, path: folder.path, what: 'folder' })}>
              <LIcon name="move" size={16} />
              Перенести папку…
            </button>
            {n + inner > 0 ? (
              <>
                <button class="act act-danger" onClick={() => remove(true)}>
                  <LIcon name="trash" size={16} />
                  Удалить папку, всё из неё в «{upName}»
                </button>
                <button class="act act-danger" onClick={() => remove(false)}>
                  <LIcon name="trash" size={16} />
                  Удалить папку со всем, что в ней…
                </button>
              </>
            ) : (
              <button class="act act-danger" onClick={() => remove(false)}>
                <LIcon name="trash" size={16} />
                Удалить папку
              </button>
            )}
          </div>
        </>
      )}
    </Sheet>
  );
}

/**
 * Куда перенести заметку или папку: сам раздел и все его папки деревом. Папку нельзя положить в неё саму
 * и в её же вложенные. После переноса внизу сообщение с кнопкой «Вернуть».
 */
export function MoveSheet({ ui, slug, path, what }: { ui: Ui; slug: string; path: string; what: 'note' | 'folder' }) {
  const section = ui.notes.section(slug);
  const isNote = what === 'note';
  const note = isNote ? ui.notes.note(path) : null;
  const folder = isNote ? null : ui.notes.folder(slug, path);
  if (!section || (!note && !folder)) {
    return (
      <Sheet title="Перенести" onClose={ui.close}>
        <p class="note">{isNote ? 'Этой заметки больше нет.' : 'Этой папки больше нет.'}</p>
      </Sheet>
    );
  }
  const now = isNote ? (splitPath(path)?.folder ?? '') : parentFolder(path);
  const places = [{ path: '', title: section.title, depth: 0 }, ...ui.notes.allFolders(slug).map((f) => ({ path: f.path, title: f.title, depth: f.path.split('/').length }))].filter(
    (p) => isNote || !(p.path && insideFolder(p.path, path)),
  );
  const titleOf = (f: string) => (f ? (ui.notes.folder(slug, f)?.title ?? f) : section.title);
  const go = (to: string) => {
    if (to === now) return;
    if (isNote) {
      const moved = ui.notes.moveNote(path, to);
      moveDraft(path, moved);
      ui.close();
      ui.toast(`Заметка теперь в «${titleOf(to)}»`, {
        label: 'Вернуть',
        run: () => moveDraft(moved, ui.notes.moveNote(moved, now)),
      });
      return;
    }
    const moved = ui.notes.moveFolder(slug, path, to);
    if (moved === null) return;
    ui.close();
    // Если открыта сама папка (или что-то внутри неё), остаёмся там же на новом месте.
    const was = placeOf(slug, path);
    const open = ui.section;
    if (open && (open === was || open.startsWith(`${was}/`))) ui.openSection(placeOf(slug, moved) + open.slice(was.length));
    ui.toast(`Папка теперь в «${titleOf(to)}»`, {
      label: 'Вернуть',
      run: () => {
        const back = ui.notes.moveFolder(slug, moved, now);
        if (back !== null && open && (open === was || open.startsWith(`${was}/`))) ui.openSection(placeOf(slug, back) + open.slice(was.length));
      },
    });
  };
  const what1 = note ? (note.title ? `«${note.title}»` : 'заметку') : `папку «${folder?.title ?? ''}»`;
  return (
    <Sheet title="Перенести" onClose={ui.close}>
      <p class="note">Куда перенести {what1}?</p>
      <ul class="nsec-list nmove">
        {places.map((p) => (
          <li key={p.path || ':top'}>
            <button
              class="row nsec"
              style={{ paddingLeft: `${12 + p.depth * 18}px` }}
              aria-current={p.path === now ? 'location' : undefined}
              disabled={p.path === now}
              onClick={() => go(p.path)}
            >
              <LIcon name={p.path ? 'folder' : section.icon} size={20} class="nsec-ic" />
              <span class="row-title">{p.title}</span>
              {p.path === now && <span class="nsec-meta">сейчас здесь</span>}
            </button>
          </li>
        ))}
      </ul>
    </Sheet>
  );
}
