// Оформленный текст Летописи: показ и редактор с панелью (жирный, курсив, подчёркнутый, зачёркнутый,
// заголовок со сворачиванием раздела, списки, цитата, цвет, снятие стилей). Редактор правит текст как в обычном текстовом редакторе, а наружу отдаёт
// Markdown (src/notes/markdown.ts), поэтому в репозитории остаются обычные .md файлы.
import type { JSX } from 'preact';
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { parseHex } from '../game/color';
import { plural } from '../game/time';
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
      case 'u':
        return <u key={i}>{inlineNodes(n.c, links)}</u>;
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

/** Заголовок и текст под ним до следующего заголовка: раздел, который сворачивается при чтении. */
function sectionNodes(blocks: Block[], links: boolean): JSX.Element[] {
  const out: JSX.Element[] = [];
  let i = 0;
  while (i < blocks.length) {
    const b = blocks[i];
    let end = i + 1;
    while (end < blocks.length && blocks[end].t !== 'h') end++;
    if (b.t !== 'h' || end === i + 1) {
      out.push(...blockNodes([b], links));
      i++;
      continue;
    }
    out.push(
      <details key={i} class="md-sec" open={!b.fold}>
        <summary>{blockNodes([b], links)}</summary>
        {blockNodes(blocks.slice(i + 1, end), links)}
      </details>,
    );
    i = end;
  }
  return out;
}

/**
 * Markdown заметки как оформленный текст. links=false для карточек: ссылка внутри кнопки не нужна.
 * sections для чтения статьи: разделы сворачиваются. Это только на время чтения, файл не меняется.
 */
export function RichText({ text, class: cls = '', links = true, sections = false }: { text: string; class?: string; links?: boolean; sections?: boolean }) {
  const blocks = parseMarkdown(text);
  return <div class={`md ${cls}`}>{sections ? sectionNodes(blocks, links) : blockNodes(blocks, links)}</div>;
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
      case 'u':
        return el('u', n.c);
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
    case 'h': {
      const e = el(`h${Math.min(6, b.level)}`, b.c);
      if (b.fold) e.classList.add('fold');
      return e;
    }
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

/** Голова раздела: любой заголовок. Раздел идёт от неё до следующего заголовка. */
const isHead = (n: Node | null | undefined): n is HTMLElement => n instanceof HTMLElement && /^H\d$/.test(n.tagName);

/** Строка верхнего уровня редактора, в которой лежит узел. */
function topNode(root: HTMLElement, node: Node | null): Node | null {
  if (!node || node === root || !root.contains(node)) return null;
  let n = node;
  while (n.parentNode !== root) n = n.parentNode!;
  return n;
}

/** Ближайший заголовок на этой строке или выше. */
function headBefore(node: Node | null): HTMLElement | null {
  let n = node;
  while (n && !isHead(n)) n = n.previousSibling;
  return n as HTMLElement | null;
}

/** Заголовок раздела, в котором стоит курсор. */
const caretHead = (root: HTMLElement) => headBefore(topNode(root, document.getSelection()?.focusNode ?? null));

/**
 * Прячет строки свёрнутых разделов. Текст лежит плоско, поэтому служебный класс ставится на сами
 * строки; в файл он не попадает. open раскрывает раздел, где стоит курсор: новая строка после
 * свёрнутого заголовка не должна родиться невидимой.
 */
function applyFolds(root: HTMLElement, open = false): void {
  if (!root.querySelector('h1,h2,h3,h4,h5,h6,.acc-hid')) return;
  // Браузер иногда кладёт заголовок внутрь строки: поднимаем его на верхний уровень.
  for (let w; (w = [...root.children].find((c) => /^(DIV|P)$/.test(c.tagName) && c.querySelector('h1,h2,h3,h4,h5,h6'))); ) {
    const sel = document.getSelection();
    const f = sel?.focusNode;
    const at = sel?.focusOffset ?? 0;
    w.replaceWith(...w.childNodes);
    if (f && f !== w && root.contains(f)) sel!.collapse(f, at);
  }
  if (open && !isHead(topNode(root, document.getSelection()?.focusNode ?? null))) caretHead(root)?.classList.remove('fold');
  let head: HTMLElement | null = null;
  let run: HTMLElement | null = null;
  for (const n of [...root.childNodes]) {
    if (isHead(n)) {
      head = n;
      run = null;
      n.classList.remove('acc-hid');
    } else if (!head?.classList.contains('fold')) {
      run = null;
      if (n instanceof HTMLElement) n.classList.remove('acc-hid');
    } else if (n instanceof HTMLElement && BLOCKS.has(n.tagName)) {
      run = null;
      n.classList.add('acc-hid');
    } else {
      // Строка без своего блока (обычный текст, <br>): собираем в div, иначе её не скрыть.
      if (!run) {
        run = document.createElement('div');
        run.className = 'acc-hid';
        n.before(run);
      }
      run.append(n);
    }
  }
}

/**
 * Браузер при удалении и замене выделенного молча съедает и скрытые строки. Отдаёт спрятанные
 * строки, которые правка задела: тогда вместо неё раздел раскрывается.
 */
function hiddenTouched(root: HTMLElement, type: string): Element[] {
  const sel = document.getSelection();
  if (!sel?.rangeCount || !root.querySelector('.acc-hid')) return [];
  const r = sel.getRangeAt(0);
  if (!r.collapsed) return [...root.querySelectorAll('.acc-hid')].filter((n) => r.intersectsNode(n));
  if (!type.startsWith('delete')) return [];
  const n = topNode(root, r.startContainer);
  if (!n) return [];
  const back = type.includes('Backward');
  const next = back ? n.previousSibling : n.nextSibling;
  // Удаление на краю строки склеивает её с соседней.
  const rest = document.createRange();
  rest.selectNodeContents(n);
  if (back) rest.setEnd(r.startContainer, r.startOffset);
  else rest.setStart(r.endContainer, r.endOffset);
  return !rest.toString() && next instanceof Element && next.classList.contains('acc-hid') ? [next] : [];
}

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
    case 'U':
      return [{ t: 'u', c: kids() }];
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
      if (!blank(c)) out.push(node.classList.contains('fold') ? { t: 'h', level: headLevel(tag), c, fold: true } : { t: 'h', level: headLevel(tag), c });
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

type Mark = 'bold' | 'italic' | 'underline' | 'strikeThrough' | 'insertUnorderedList' | 'insertOrderedList';
type Shape = 'h3' | 'blockquote';

/** Кнопки панели не забирают фокус: иначе выделение пропадёт. */
const keep = { onPointerDown: (e: Event) => e.preventDefault(), onMouseDown: (e: Event) => e.preventDefault() };

function exec(cmd: string, arg?: string): void {
  document.execCommand('styleWithCSS', false, 'false');
  document.execCommand(cmd, false, arg);
}

/** Ширина зоны стрелки слева у заголовка: по самому тексту заголовка нажатие ставит курсор. */
const ARROW_W = 44;

function arrowHead(root: HTMLElement, e: MouseEvent): HTMLElement | null {
  const h = e.target instanceof Element ? e.target.closest('h1,h2,h3,h4,h5,h6') : null;
  return h instanceof HTMLElement && h.parentNode === root && e.clientX - h.getBoundingClientRect().left <= ARROW_W ? h : null;
}

/** Панель прячется не сразу: иначе экран съезжает в момент нажатия, и кнопка рядом его не получает. */
const HOLD_MS = 450;

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
  const wrap = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const range = useRef<Range | null>(null);
  const holdTimer = useRef(0);
  const [id] = useState(() => `rich-${++editors}`);
  const [state, setState] = useState<Record<string, boolean>>({});
  const [empty, setEmpty] = useState(!value.trim());
  const [count, setCount] = useState(0);
  const [hold, setHold] = useState(false);
  // Статья сразу во всю длину: так текст листается вместе с листом, а панель стоит у верха.
  const [full, setFull] = useState(long);
  const [palette, setPalette] = useState(false);
  const [recent, setRecent] = useState<string[]>(() => loadLocal(ui.now).noteColors ?? []);
  const [code, setCode] = useState(recent[0] ?? '#f0c35a');
  const [badCode, setBadCode] = useState(false);

  useLayoutEffect(() => {
    const el = box.current!;
    fill(el, value);
    applyFolds(el);
    setCount(el.textContent?.length ?? 0);
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
      const head = caretHead(el);
      setState({
        bold: document.queryCommandState('bold'),
        italic: document.queryCommandState('italic'),
        underline: document.queryCommandState('underline'),
        strikeThrough: document.queryCommandState('strikeThrough'),
        insertUnorderedList: document.queryCommandState('insertUnorderedList'),
        insertOrderedList: document.queryCommandState('insertOrderedList'),
        h3: /^h\d$/.test(block),
        blockquote: block === 'blockquote',
        section: !!head,
        fold: !!head?.classList.contains('fold'),
      });
    };
    document.addEventListener('selectionchange', onSel);
    return () => document.removeEventListener('selectionchange', onSel);
  }, []);

  // Клавиатура телефона закрывает низ экрана: лист встаёт над ней целиком, с панелью и кнопкой «Сохранить».
  useEffect(() => {
    const vv = window.visualViewport;
    const overlay = wrap.current?.closest<HTMLElement>('.overlay');
    if (!vv || !overlay) return;
    const fit = () => {
      const covered = vv.scale > 1.01 ? 0 : Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
      overlay.style.bottom = covered ? `${covered}px` : '';
    };
    fit();
    vv.addEventListener('resize', fit);
    vv.addEventListener('scroll', fit);
    return () => {
      vv.removeEventListener('resize', fit);
      vv.removeEventListener('scroll', fit);
      overlay.style.bottom = '';
    };
  }, []);

  useEffect(() => () => clearTimeout(holdTimer.current), []);

  const emit = () => {
    const el = box.current!;
    const md = editorMarkdown(el);
    setEmpty(!md.trim());
    setCount(el.textContent?.length ?? 0);
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
    applyFolds(box.current!, true);
    emit();
  };

  const clearStyles = () => {
    restore();
    exec('removeFormat');
    const block = String(document.queryCommandValue('formatBlock')).toLowerCase();
    if (/^h\d$/.test(block) || block === 'blockquote') exec('formatBlock', 'p');
    applyFolds(box.current!, true);
    emit();
  };

  const toggleFold = (head: HTMLElement) => {
    const el = box.current!;
    const closing = !head.classList.contains('fold');
    head.classList.toggle('fold', closing);
    applyFolds(el);
    // Курсор не должен остаться в спрятанном тексте.
    const sel = document.getSelection();
    const top = topNode(el, sel?.focusNode ?? null);
    if (closing && sel && top instanceof HTMLElement && top.classList.contains('acc-hid')) {
      sel.selectAllChildren(head);
      sel.collapseToEnd();
    }
    setState((s) => ({ ...s, fold: closing }));
    emit();
  };

  /** Если правка задевает спрятанный текст, раскрывает раздел и говорит об этом. true: правку надо отменить. */
  const reveal = (type: string): boolean => {
    const el = box.current!;
    const hit = hiddenTouched(el, type);
    if (!hit.length) return false;
    for (const n of hit) headBefore(n)?.classList.remove('fold');
    applyFolds(el);
    emit();
    ui.toast('Раздел раскрыт, чтобы не удалить скрытый текст. Нажми ещё раз, если нужно');
    return true;
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
    setCode(c);
    paint(c);
  };

  const applyCode = () => {
    const c = parseHex(code);
    setBadCode(!c);
    if (c) custom(c);
  };

  const btn = (key: string, name: string, icon: JSX.Element, onClick: () => void) => (
    <button type="button" class={`rich-btn${state[key] ? ' is-on' : ''}`} title={name} aria-label={name} aria-pressed={!!state[key]} {...keep} onClick={onClick}>
      {icon}
    </button>
  );

  return (
    <div
      ref={wrap}
      class={`field rich${hold ? ' is-hold' : ''}`}
      onFocusOut={() => {
        setHold(true);
        clearTimeout(holdTimer.current);
        holdTimer.current = window.setTimeout(() => setHold(false), HOLD_MS);
      }}
    >
      <span class="field-label" id={id}>
        {label}
      </span>
      <div class="rich-tools">
        <div class="rich-bar" role="toolbar" aria-label="Оформление">
          {btn('bold', 'Жирный', <b>Ж</b>, () => mark('bold'))}
          {btn('italic', 'Курсив', <i>К</i>, () => mark('italic'))}
          {btn('underline', 'Подчёркнутый', <u>Ч</u>, () => mark('underline'))}
          {btn('strikeThrough', 'Зачёркнутый', <s>З</s>, () => mark('strikeThrough'))}
          <span class="rich-sep" />
          {btn('h3', 'Подзаголовок', <span class="rich-h">Заг</span>, () => shape('h3'))}
          <button
            type="button"
            class={`rich-btn${state.fold ? ' is-on' : ''}`}
            title="Свернуть текст под заголовком"
            aria-label="Свернуть раздел"
            aria-pressed={!!state.fold}
            disabled={!state.section}
            {...keep}
            onClick={() => {
              restore();
              const head = caretHead(box.current!);
              if (head) toggleFold(head);
            }}
          >
            <span class={`rich-fold${state.fold ? ' is-shut' : ''}`} />
          </button>
          <span class="rich-sep" />
          {btn('insertUnorderedList', 'Список', <LIcon name="list" size={18} />, () => mark('insertUnorderedList'))}
          {btn('insertOrderedList', 'Нумерованный список', <span class="rich-ol">1.</span>, () => mark('insertOrderedList'))}
          {btn('blockquote', 'Цитата', <span class="rich-q">«</span>, () => shape('blockquote'))}
          <span class="rich-sep" />
          <button type="button" class={`rich-btn rich-color${palette ? ' is-on' : ''}`} title="Цвет" aria-label="Цвет" aria-expanded={palette} {...keep} onClick={() => setPalette(!palette)}>
            <span class="rich-a">А</span>
          </button>
          <button type="button" class="rich-btn rich-clear" title="Убрать стили" aria-label="Убрать стили" {...keep} onClick={clearStyles}>
            ✕ стиль
          </button>
        </div>
        {palette && (
          <div class="rich-palette" role="group" aria-label="Цвет">
            {[...NOTE_COLORS, ...recent.map((color) => ({ color, name: `свой ${color}` }))].map((p) => (
              <button key={p.color} type="button" class="rich-swatch" aria-label={p.name} style={{ background: p.color }} {...keep} onClick={() => paint(p.color)} />
            ))}
            <label class="rich-swatch rich-custom" title="Свой цвет">
              <LIcon name="plus" size={16} />
              <input type="color" aria-label="Свой цвет" value={recent[0] ?? '#f0c35a'} onChange={(e) => custom(e.currentTarget.value)} />
            </label>
            <button type="button" class="rich-plain" {...keep} onClick={() => paint(null)}>
              Без цвета
            </button>
            <div class="rich-code">
              <input
                class="input"
                type="text"
                aria-label="Код цвета"
                aria-invalid={badCode}
                aria-describedby={badCode ? `${id}-bad` : undefined}
                placeholder="#ff8800"
                maxLength={7}
                autoComplete="off"
                spellcheck={false}
                value={code}
                onInput={(e) => {
                  setCode(e.currentTarget.value);
                  setBadCode(false);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    applyCode();
                  }
                }}
              />
              <button type="button" class="rich-plain" {...keep} onClick={applyCode}>
                Применить
              </button>
            </div>
            {badCode && (
              <p class="rich-bad" id={`${id}-bad`} role="alert">
                Код цвета пишется так: #ff8800 или #f80
              </p>
            )}
          </div>
        )}
      </div>
      <div
        ref={box}
        class={`input md rich-box${long ? ' rich-long' : ''}${full ? ' is-full' : ''}${empty ? ' is-empty' : ''}`}
        contentEditable
        role="textbox"
        aria-multiline="true"
        aria-labelledby={id}
        data-placeholder={placeholder}
        onInput={() => {
          applyFolds(box.current!, true);
          emit();
        }}
        onBeforeInput={(e) => {
          if (reveal(e.inputType)) e.preventDefault();
        }}
        onPointerDown={(e) => {
          if (arrowHead(box.current!, e)) e.preventDefault();
        }}
        onMouseDown={(e) => {
          if (arrowHead(box.current!, e)) e.preventDefault();
        }}
        onClick={(e) => {
          const head = arrowHead(box.current!, e);
          if (head) toggleFold(head);
        }}
        onPaste={(e) => {
          // Вставка только текстом: чужое оформление и стили со страниц в заметку не попадают.
          e.preventDefault();
          if (!reveal('insertFromPaste')) document.execCommand('insertText', false, e.clipboardData?.getData('text/plain') ?? '');
        }}
      />
      <div class="rich-foot">
        <span class="rich-count">
          {count} {plural(count, 'знак', 'знака', 'знаков')}
        </span>
        <button type="button" class="rich-plain" onClick={() => setFull(!full)}>
          {full ? 'Свернуть поле' : 'Развернуть поле'}
        </button>
      </div>
    </div>
  );
}
