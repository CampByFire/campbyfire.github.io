// Листы Летописи: быстрая мысль, заметка или статья, новый раздел и его настройки.
import { useState } from 'preact/hooks';
import { SECTION_ICONS, type SectionIcon, type SectionKind } from '../notes/model';
import type { Ui } from './App';
import { LIcon } from './Icon';
import { loadLocal, updateLocal } from './local';
import { HERO_NOTED } from './Notes';
import { Chips } from './parts';
import { Sheet } from './Sheets';

const NEW = '+new';
const ICON_NAME: Record<SectionIcon, string> = { bulb: 'лампа', book: 'книга', feather: 'перо', star: 'звезда', list: 'список', flag: 'флаг' };
const KIND_HINT: Record<SectionKind, string> = {
  lenta: 'одно поле, запись в одно нажатие, новые сверху',
  stati: 'у каждой заметки заголовок и длинный текст',
};

/**
 * Быстрая мысль: поле и выбор раздела (по умолчанию тот, куда писали в прошлый раз). Здесь же можно
 * завести новый раздел, тогда раздел и первая заметка в нём появятся за один раз.
 */
export function ThoughtSheet({ ui, slug }: { ui: Ui; slug?: string }) {
  const sections = ui.notes.sections();
  const last = slug ?? loadLocal(ui.now).lastSection;
  const [target, setTarget] = useState<string>(() => (last && sections.some((s) => s.slug === last) ? last : sections[0]?.slug ?? NEW));
  const [newName, setNewName] = useState(sections.length ? '' : 'Идеи');
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const chosen = sections.find((s) => s.slug === target);
  const stati = chosen?.vid === 'stati';
  const ready = !!text.trim() && (target !== NEW || !!newName.trim());
  const save = () => {
    if (!ready) return;
    const where = target === NEW ? ui.notes.createSection({ title: newName, icon: 'bulb', vid: 'lenta' }) : target;
    ui.notes.addNote(where, { title, text });
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
        options={[...sections.map((s) => ({ value: s.slug, label: s.title })), { value: NEW, label: '+ Новый раздел' }]}
        onChange={setTarget}
      />
      {target === NEW && (
        <label class="field">
          <span class="field-label">Название раздела</span>
          <input class="input" value={newName} maxLength={40} placeholder="Например, Идеи" onInput={(e) => setNewName(e.currentTarget.value)} />
        </label>
      )}
      {stati && (
        <label class="field">
          <span class="field-label">Заголовок</span>
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

/** Заметка ленты или статья: открыть, поправить, удалить. Без path это новая статья. */
export function NoteSheet({ ui, slug, path }: { ui: Ui; slug: string; path?: string }) {
  const section = ui.notes.section(slug);
  const note = path ? ui.notes.note(path) : null;
  const stati = section?.vid === 'stati';
  const [title, setTitle] = useState(note?.title ?? '');
  const [text, setText] = useState(() => (note ? (stati ? note.body : note.text).replace(/\n$/, '') : ''));
  if (path && !note) {
    // Заметку удалили, пока лист был открыт (например, на другом устройстве).
    return (
      <Sheet title="Заметка" onClose={ui.close}>
        <p class="note">Этой заметки больше нет.</p>
      </Sheet>
    );
  }
  const save = () => {
    if (!text.trim() && !title.trim()) return;
    if (path) ui.notes.saveNote(path, { title, text });
    else ui.notes.addNote(slug, { title, text });
    ui.close();
    if (!path) ui.toast(HERO_NOTED);
  };
  const remove = () => {
    if (!path || !confirm('Удалить эту заметку? В истории репозитория она останется.')) return;
    ui.notes.deleteNote(path);
    ui.close();
    ui.toast('Заметка удалена');
  };
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
      {stati && (
        <label class="field">
          <span class="field-label">Заголовок</span>
          <input class="input" value={title} maxLength={80} onInput={(e) => setTitle(e.currentTarget.value)} />
        </label>
      )}
      <label class="field">
        <span class="field-label">Текст</span>
        <textarea class={`input ntext${stati ? ' ntext-long' : ''}`} rows={stati ? 12 : 6} value={text} onInput={(e) => setText(e.currentTarget.value)} />
      </label>
      {path && (
        <>
          <p class="note nfile">{path}</p>
          <div class="actions">
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
    const what = n ? `Удалятся и все заметки в нём (${n}).` : 'Он пустой.';
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
