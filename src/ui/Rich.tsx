// Оформленный текст Летописи: показ и редактор с панелью (жирный, курсив, зачёркнутый, заголовок,
// списки, цитата, цвет). Редактор правит текст как в обычном текстовом редакторе, а наружу отдаёт
// Markdown (src/notes/markdown.ts), поэтому в репозитории остаются обычные .md файлы.
import type { JSX } from 'preact';
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { COLOR_RE, parseMarkdown, toMarkdown, type Block, type Inline } from '../notes/markdown';
import type { Ui } from './App';
import { LIcon } from './Icon';
import { loadLocal, updateLocal } from './local';

// ---------- показ ----------

function inlineNodes(list: Inline[], links: boolean): JSX.Element[] {
  return list.map((n, i) => {
    switch (n.t) {
      case 'text':
        return <>{n.v}</>;
      case 'br':
        return <br key={i} />;
      case 'b':
        return <strong key={i}>{inlineNodes(n.c, links)}</strong>;
      case 'i':
        return <em key={i}>{inlineNodes(n.c, links)}</em>;
      case 's':
        return <s key={i}>{inlineNodes(n.c, links)}</s>;
      case 'code':
        return <code key={i}>{n.v}</code>;
      case 'a':
        return links ? (
          <a key={i} href={n.href} target="_blank" rel="noopener noreferrer">
            {inlineNodes(n.c, links)}
          </a>
        ) : (
          <span key={i} class="md-link">
            {inlineNodes(n.c, links)}
          </span>
        );
      case 'color':
        return (
          <span key={i} style={{ color: n.color }}>
            {inlineNodes(n.c, links)}
          </span>
        );
    }
  });
}

function blockNodes(blocks: Block[], links: boolean): JSX.Element[] {
  return blocks.map((b, i) => {
    switch (b.t) {
      case 'p':
        return <p key={i}>{inlineNodes(b.c, links)}</p>;
      case 'h': {
        const H = `h${Math.min(6, b.level)}` as 'h3';
        return <H key={i}>{inlineNodes(b.c, links)}</H>;
      }
      case 'ul':
        return (
          <ul key={i}>
            {b.items.map((it, j) => (
              <li key={j}>{inlineNodes(it, links)}</li>
            ))}
          </ul>
        );
      case 'ol':
        return (
          <ol key={i}>
            {b.items.map((it, j) => (
              <li key={j}>{inlineNodes(it, links)}</li>
            ))}
          </ol>
        );
      case 'quote':
        return <blockquote key={i}>{inlineNodes(b.c, links)}</blockquote>;
      case 'code':
        return <pre key={i}>{b.v}</pre>;
      case 'hr':
        return <hr key={i} />;
    }
  });
}

/** Markdown заметки как оформленный текст. links=false для карточек: ссылка внутри кнопки не нужна. */
export function RichText({ text, class: cls = '', links = true }: { text: string; class?: string; links?: boolean }) {
  return <div class={`md ${cls}`}>{blockNodes(parseMarkdown(text), links)}</div>;
}

// ---------- редактор: дерево ↔ содержимое contenteditable ----------

function inlineDom(list: Inline[]): Node[] {
  return list.map((n) => {
    const el = (tag: string, kids: Inline[]) => {
      const e = document.createElement(tag);
      e.append(...inlineDom(kids));
      return e;
    };
    switch (n.t) {
      case 'text':
        return document.createTextNode(n.v);
      case 'br':
        return document.createElement('br');
      case 'b':
        return el('b', n.c);
      case 'i':
        return el('i', n.c);
      case 's':
        return el('strike', n.c);
      case 'code': {
        const e = document.createElement('code');
        e.textContent = n.v;
        return e;
      }
      case 'a': {
        const e = el('a', n.c) as HTMLAnchorElement;
        e.href = n.href;
        return e;
      }
      case 'color': {
        const e = el('font', n.c);
        e.setAttribute('color', n.color);
        return e;
      }
    }
  });
}

function blockDom(b: Block): Node {
  const el = (tag: string, kids: Inline[]) => {
    const e = document.createElement(tag);
    e.append(...inlineDom(kids));
    if (!e.firstChild) e.append(document.createElement('br'));
    return e;
  };
  switch (b.t) {
    case 'p':
      return el('p', b.c);
    case 'h':
      return el(`h${Math.min(6, b.level)}`, b.c);
    case 'ul':
    case 'ol': {
      const list = document.createElement(b.t);
      list.append(...b.items.map((it) => el('li', it)));
      return list;
    }
    case 'quote':
      return el('blockquote', b.c);
    case 'code': {
      const e = document.createElement('pre');
      e.textContent = b.v;
      return e;
    }
    case 'hr':
      return document.createElement('hr');
  }
}

function fill(root: HTMLElement, markdown: string): void {
  const blocks = parseMarkdown(markdown);
  root.replaceChildren(...(blocks.length ? blocks.map(blockDom) : [blockDom({ t: 'p', c: [] })]));
}

const BLOCKS = new Set(['P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'UL', 'OL', 'LI', 'BLOCKQUOTE', 'PRE', 'HR']);

/** Цвет из браузера (#FF0000, rgb(255, 0, 0) или имя) в вид для файла. */
export function normColor(raw: string): string | null {
  const c = raw.trim().toLowerCase();
  const rgb = c.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (rgb) return `#${[rgb[1], rgb[2], rgb[3]].map((x) => Number(x).toString(16).padStart(2, '0')).join('')}`;
  return COLOR_RE.test(c) ? c : null;
}

/** Уровень заголовка по тегу: h3 ↔ «### …». Кнопка «Заголовок» делает h3: «#» у статьи занят её названием. */
const headLevel = (tag: string) => Number(tag[1]);

function trimBr(list: Inline[]): Inline[] {
  const out = [...list];
  while (out.length && out[out.length - 1].t === 'br') out.pop();
  while (out.length && out[0].t === 'br') out.shift();
  return out;
}

const blank = (list: Inline[]) => list.every((n) => n.t === 'br' || (n.t === 'text' && !n.v.trim()));

function readInline(node: Node, base: string | null): Inline[] {
  if (node.nodeType === Node.TEXT_NODE) return [{ t: 'text', v: (node.textContent ?? '').replace(/ /g, ' ').replace(/\n/g, ' ') }];
  if (!(node instanceof HTMLElement)) return [];
  const kids = () => {
    const out: Inline[] = [];
    for (const k of node.childNodes) {
      if (k instanceof HTMLElement && BLOCKS.has(k.tagName) && out.length && out[out.length - 1].t !== 'br') out.push({ t: 'br' });
      out.push(...readInline(k, base));
    }
    return out;
  };
  const colored = (raw: string | null) => {
    const c = raw ? normColor(raw) : null;
    return c && c !== base ? [{ t: 'color' as const, color: c, c: kids() }] : kids();
  };
  switch (node.tagName) {
    case 'BR':
      return [{ t: 'br' }];
    case 'B':
    case 'STRONG':
      return [{ t: 'b', c: kids() }];
    case 'I':
    case 'EM':
      return [{ t: 'i', c: kids() }];
    case 'S':
    case 'STRIKE':
    case 'DEL':
      return [{ t: 's', c: kids() }];
    case 'CODE':
      return [{ t: 'code', v: node.textContent ?? '' }];
    case 'A': {
      const href = node.getAttribute('href') ?? '';
      return /^(https?:\/\/|mailto:)/i.test(href) ? [{ t: 'a', href, c: kids() }] : kids();
    }
    case 'FONT':
      return colored(node.getAttribute('color'));
    case 'SPAN':
      return colored(node.style.color || null);
    default:
      return kids();
  }
}

function readBlocks(root: Node, base: string | null): Block[] {
  const out: Block[] = [];
  let line: Inline[] = [];
  const flush = () => {
    if (!blank(line)) out.push({ t: 'p', c: trimBr(line) });
    line = [];
  };
  for (const node of root.childNodes) {
    if (!(node instanceof HTMLElement) || !BLOCKS.has(node.tagName)) {
      line.push(...readInline(node, base));
      continue;
    }
    flush();
    const tag = node.tagName;
    if (tag === 'P' || tag === 'DIV' || tag === 'LI') {
      if ([...node.children].some((k) => BLOCKS.has(k.tagName))) out.push(...readBlocks(node, base));
      else {
        const c = trimBr(readInline(node, base));
        if (!blank(c)) out.push({ t: 'p', c });
      }
    } else if (/^H\d$/.test(tag)) {
      const c = trimBr(readInline(node, base));
      if (!blank(c)) out.push({ t: 'h', level: headLevel(tag), c });
    } else if (tag === 'UL' || tag === 'OL') {
      const items = [...node.children].map((li) => trimBr(readInline(li, base))).filter((it) => !blank(it));
      if (items.length) out.push({ t: tag === 'UL' ? 'ul' : 'ol', items });
    } else if (tag === 'BLOCKQUOTE') {
      const c = trimBr(readInline(node, base));
      if (!blank(c)) out.push({ t: 'quote', c });
    } else if (tag === 'PRE') {
      out.push({ t: 'code', v: node.textContent ?? '' });
    } else if (tag === 'HR') out.push({ t: 'hr' });
  }
  flush();
  return out;
}

/** Markdown из содержимого редактора. Цвет, равный обычному цвету текста, не пишется. */
export function editorMarkdown(root: HTMLElement): string {
  return toMarkdown(readBlocks(root, normColor(getComputedStyle(root).color)));
}

// ---------- редактор ----------

/** Готовые цвета: читаются на тёмном фоне Лагеря. */
export const NOTE_COLORS: { color: string; name: string }[] = [
  { color: '#f0c35a', name: 'золотой' },
  { color: '#ef6b5e', name: 'красный' },
  { color: '#f39a4c', name: 'оранжевый' },
  { color: '#7cc46f', name: 'зелёный' },
  { color: '#4fc6c9', name: 'бирюзовый' },
  { color: '#6aa7f2', name: 'синий' },
  { color: '#b58cf2', name: 'фиолетовый' },
  { color: '#ec7fb6', name: 'розовый' },
];
/** Метка для «убрать цвет»: такой цвет никто не выберет, после команды его теги снимаются. */
const NO_COLOR = '#010203';

type Mark = 'bold' | 'italic' | 'strikeThrough' | 'insertUnorderedList' | 'insertOrderedList';
type Shape = 'h3' | 'blockquote';

const keep = (e: Event) => e.preventDefault();

function exec(cmd: string, arg?: string): void {
  document.execCommand('styleWithCSS', false, 'false');
  document.execCommand(cmd, false, arg);
}

let editors = 0;

export function RichEditor({
  ui,
  value,
  onChange,
  label,
  long = false,
  placeholder = '',
}: {
  ui: Ui;
  value: string;
  onChange: (markdown: string) => void;
  label: string;
  long?: boolean;
  placeholder?: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const range = useRef<Range | null>(null);
  const [id] = useState(() => `rich-${++editors}`);
  const [state, setState] = useState<Record<string, boolean>>({});
  const [empty, setEmpty] = useState(!value.trim());
  const [palette, setPalette] = useState(false);
  const [recent, setRecent] = useState<string[]>(() => loadLocal(ui.now).noteColors ?? []);

  useLayoutEffect(() => {
    const el = box.current!;
    fill(el, value);
    document.execCommand('defaultParagraphSeparator', false, 'p');
    // Только при открытии: дальше содержимым владеет сам редактор.
  }, []);

  useEffect(() => {
    const onSel = () => {
      const el = box.current;
      const sel = document.getSelection();
      if (!el || !sel || !sel.rangeCount || !el.contains(sel.anchorNode)) return;
      range.current = sel.getRangeAt(0).cloneRange();
      const block = String(document.queryCommandValue('formatBlock')).toLowerCase();
      setState({
        bold: document.queryCommandState('bold'),
        italic: document.queryCommandState('italic'),
        strikeThrough: document.queryCommandState('strikeThrough'),
        insertUnorderedList: document.queryCommandState('insertUnorderedList'),
        insertOrderedList: document.queryCommandState('insertOrderedList'),
        h3: block === 'h3',
        blockquote: block === 'blockquote',
      });
    };
    document.addEventListener('selectionchange', onSel);
    return () => document.removeEventListener('selectionchange', onSel);
  }, []);

  const emit = () => {
    const el = box.current!;
    const md = editorMarkdown(el);
    setEmpty(!md.trim());
    onChange(md);
  };

  /** Вернуть выделение, которое было до нажатия на панель (палитра и выбор цвета его сбивают). */
  const restore = () => {
    const el = box.current!;
    el.focus();
    const sel = document.getSelection();
    if (sel && range.current && el.contains(range.current.startContainer)) {
      sel.removeAllRanges();
      sel.addRange(range.current);
    }
  };

  const mark = (cmd: Mark) => {
    restore();
    exec(cmd);
    emit();
  };

  const shape = (tag: Shape) => {
    restore();
    exec('formatBlock', state[tag] ? 'p' : tag);
    emit();
  };

  const paint = (color: string | null) => {
    restore();
    exec('foreColor', color ?? NO_COLOR);
    if (!color) {
      for (const f of box.current!.querySelectorAll('font')) {
        if (normColor(f.getAttribute('color') ?? '') === NO_COLOR) f.replaceWith(...f.childNodes);
      }
    }
    setPalette(false);
    emit();
  };

  const custom = (color: string) => {
    const c = normColor(color);
    if (!c) return;
    if (!NOTE_COLORS.some((p) => p.color === c)) {
      const next = [c, ...recent.filter((x) => x !== c)].slice(0, 4);
      setRecent(next);
      updateLocal(ui.now, (l) => {
        l.noteColors = next;
      });
    }
    paint(c);
  };

  const btn = (key: string, name: string, icon: JSX.Element, onClick: () => void) => (
    <button type="button" class={`rich-btn${state[key] ? ' is-on' : ''}`} aria-label={name} aria-pressed={!!state[key]} onPointerDown={keep} onClick={onClick}>
      {icon}
    </button>
  );

  return (
    <div class="field rich">
      <span class="field-label" id={id}>
        {label}
      </span>
      <div class="rich-bar" role="toolbar" aria-label="Оформление">
        {btn('bold', 'Жирный', <b>Ж</b>, () => mark('bold'))}
        {btn('italic', 'Курсив', <i>К</i>, () => mark('italic'))}
        {btn('strikeThrough', 'Зачёркнутый', <s>З</s>, () => mark('strikeThrough'))}
        {btn('h3', 'Подзаголовок', <span class="rich-h">З</span>, () => shape('h3'))}
        {btn('insertUnorderedList', 'Список', <LIcon name="list" size={18} />, () => mark('insertUnorderedList'))}
        {btn('insertOrderedList', 'Нумерованный список', <span class="rich-ol">1.</span>, () => mark('insertOrderedList'))}
        {btn('blockquote', 'Цитата', <span class="rich-q">«</span>, () => shape('blockquote'))}
        <button type="button" class={`rich-btn rich-color${palette ? ' is-on' : ''}`} aria-label="Цвет" aria-expanded={palette} onPointerDown={keep} onClick={() => setPalette(!palette)}>
          <span class="rich-a">А</span>
        </button>
      </div>
      {palette && (
        <div class="rich-palette" role="group" aria-label="Цвет">
          {[...NOTE_COLORS, ...recent.map((color) => ({ color, name: `свой ${color}` }))].map((p) => (
            <button key={p.color} type="button" class="rich-swatch" aria-label={p.name} style={{ background: p.color }} onPointerDown={keep} onClick={() => paint(p.color)} />
          ))}
          <label class="rich-swatch rich-custom" title="Свой цвет">
            <LIcon name="plus" size={16} />
            <input type="color" aria-label="Свой цвет" value={recent[0] ?? '#f0c35a'} onChange={(e) => custom(e.currentTarget.value)} />
          </label>
          <button type="button" class="rich-plain" onPointerDown={keep} onClick={() => paint(null)}>
            Без цвета
          </button>
        </div>
      )}
      <div
        ref={box}
        class={`input rich-box${long ? ' rich-long' : ''}${empty ? ' is-empty' : ''}`}
        contentEditable
        role="textbox"
        aria-multiline="true"
        aria-labelledby={id}
        data-placeholder={placeholder}
        onInput={emit}
        onPaste={(e) => {
          // Вставка только текстом: чужое оформление и стили со страниц в заметку не попадают.
          e.preventDefault();
          document.execCommand('insertText', false, e.clipboardData?.getData('text/plain') ?? '');
        }}
      />
    </div>
  );
}
