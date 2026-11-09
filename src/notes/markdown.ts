// Оформление текста заметок: маленький Markdown без сети и без библиотек. Файлы остаются обычным
// Markdown, который читают GitHub и Obsidian. Цвет пишется так же, как в Obsidian:
//   <span style="color:#e0a050">текст</span>
// GitHub цвет не покажет, но текст останется. Подчёркнутый пишется тегом <u>текст</u>, а свёрнутый
// раздел пометкой в конце заголовка: ### Заголовок <!-- свёрнуто --> (GitHub и Obsidian её не показывают).
// Любой другой HTML в файле показывается как текст.
//
// Здесь текст разбирается в дерево (Block/Inline) и собирается обратно. Из дерева экраны рисуют
// оформленный текст, а редактор (ui/RichEditor) строит своё содержимое и снимает его обратно.

export type Inline =
  | { t: 'text'; v: string }
  | { t: 'br' }
  | { t: 'b' | 'i' | 'u' | 's'; c: Inline[] }
  | { t: 'code'; v: string }
  | { t: 'a'; href: string; c: Inline[] }
  | { t: 'color'; color: string; c: Inline[] };

export type Block =
  | { t: 'p'; c: Inline[] }
  | { t: 'h'; level: number; c: Inline[]; fold?: boolean }
  | { t: 'ul' | 'ol'; items: Inline[][] }
  | { t: 'quote'; c: Inline[] }
  | { t: 'code'; v: string }
  | { t: 'hr' };

/** Цвет, который можно положить в текст: #rgb, #rrggbb (и с прозрачностью) или имя вроде red. */
export const COLOR_RE = /^(#[0-9a-fA-F]{3,4}|#[0-9a-fA-F]{6}|#[0-9a-fA-F]{8}|[a-zA-Z]{3,20})$/;
const SAFE_HREF = /^(https?:\/\/|mailto:)/i;

// ---------- текст → дерево ----------

const FENCE = /^\s*(```|~~~)/;
const HEAD = /^(#{1,6})[ \t]+(.*?)[ \t#]*$/;
/** Пометка свёрнутого раздела в конце заголовка. Перед ней пробел, поэтому «\<!--» из текста её не изображает. */
const FOLD = /(?:^|[ \t]+)<!--[ \t]*свёрнуто[ \t]*-->$/;
const HR = /^\s*([-*_])(?:[ \t]*\1){2,}[ \t]*$/;
const UL = /^\s*[-*+][ \t]+(.*)$/;
const OL = /^\s*\d{1,9}[.)][ \t]+(.*)$/;
const QUOTE = /^\s*>[ \t]?(.*)$/;

const startsBlock = (line: string) => FENCE.test(line) || HEAD.test(line) || HR.test(line) || UL.test(line) || OL.test(line) || QUOTE.test(line);

export function parseMarkdown(text: string): Block[] {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const out: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }
    const fence = line.match(FENCE);
    if (fence) {
      const body: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith(fence[1])) body.push(lines[i++]);
      i++;
      out.push({ t: 'code', v: body.join('\n') });
      continue;
    }
    const h = line.match(HEAD);
    if (h) {
      const head: Block = { t: 'h', level: h[1].length, c: parseInline(h[2].replace(FOLD, '')) };
      out.push(FOLD.test(h[2]) ? { ...head, fold: true } : head);
      i++;
      continue;
    }
    if (HR.test(line)) {
      out.push({ t: 'hr' });
      i++;
      continue;
    }
    const list = UL.test(line) ? UL : OL.test(line) ? OL : null;
    if (list) {
      const items: string[] = [];
      while (i < lines.length) {
        const m = lines[i].match(list);
        if (m) items.push(m[1]);
        else if (items.length && /^\s{2,}\S/.test(lines[i]) && !startsBlock(lines[i])) items[items.length - 1] += `\n${lines[i].trim()}`;
        else break;
        i++;
      }
      out.push({ t: list === UL ? 'ul' : 'ol', items: items.map(parseInline) });
      continue;
    }
    if (QUOTE.test(line)) {
      const body: string[] = [];
      while (i < lines.length && QUOTE.test(lines[i])) body.push(lines[i++].match(QUOTE)![1]);
      out.push({ t: 'quote', c: parseInline(body.join('\n').replace(/^\n+|\n+$/g, '')) });
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !(para.length && startsBlock(lines[i]))) para.push(lines[i++]);
    out.push({ t: 'p', c: parseInline(para.join('\n')) });
  }
  return out;
}

const PUNCT = /[\\`*_~[\]()<>#+\-.!|{}]/;

/** Первый одиночный (не парный) знак ch после from, не экранированный. */
function findSingle(s: string, from: number, ch: string): number {
  let j = from;
  while (j < s.length) {
    if (s[j] === '\\') j += 2;
    else if (s[j] === ch) {
      if (s[j + 1] === ch) {
        while (s[j] === ch) j++;
      } else return j;
    } else j++;
  }
  return -1;
}

/** Первое не экранированное вхождение строки. */
function findPlain(s: string, from: number, what: string): number {
  let j = from;
  while (j <= s.length - what.length) {
    if (s[j] === '\\') j += 2;
    else if (s.startsWith(what, j)) return j;
    else j++;
  }
  return -1;
}

const OPEN_SPAN = /^<span\s+style\s*=\s*"\s*color\s*:\s*([^";]+?)\s*;?\s*"\s*>/i;
const OPEN_FONT = /^<font\s+color\s*=\s*"([^"]+)"\s*>/i;

/** Закрывающий тег с учётом вложенных таких же. */
function closeTag(s: string, from: number, tag: string): number {
  const re = new RegExp(`<${tag}\\b[^>]*>|</${tag}\\s*>`, 'gi');
  re.lastIndex = from;
  let depth = 1;
  for (let m = re.exec(s); m; m = re.exec(s)) {
    depth += m[0][1] === '/' ? -1 : 1;
    if (depth === 0) return m.index;
  }
  return -1;
}

const word = (c: string | undefined) => !!c && /[\p{L}\p{N}]/u.test(c);

export function parseInline(s: string): Inline[] {
  const out: Inline[] = [];
  let buf = '';
  const flush = () => {
    if (buf) out.push({ t: 'text', v: buf });
    buf = '';
  };
  const push = (n: Inline) => {
    flush();
    out.push(n);
  };
  let i = 0;
  while (i < s.length) {
    const ch = s[i];
    const rest = s.slice(i);
    if (ch === '\\' && i + 1 < s.length && PUNCT.test(s[i + 1])) {
      buf += s[i + 1];
      i += 2;
      continue;
    }
    if (ch === '\n') {
      push({ t: 'br' });
      i++;
      continue;
    }
    if (ch === '`') {
      const run = rest.match(/^`+/)![0];
      const end = s.indexOf(run, i + run.length);
      if (end > 0) {
        push({ t: 'code', v: s.slice(i + run.length, end).replace(/^ (.*) $/s, '$1') });
        i = end + run.length;
        continue;
      }
    }
    if (rest.startsWith('**') || rest.startsWith('__') || rest.startsWith('~~')) {
      const d = rest.slice(0, 2);
      const end = findPlain(s, i + 2, d);
      if (end > i + 2 && (d !== '__' || !word(s[i - 1]))) {
        push({ t: d === '~~' ? 's' : 'b', c: parseInline(s.slice(i + 2, end)) });
        i = end + 2;
        continue;
      }
    }
    if ((ch === '*' || ch === '_') && s[i + 1] !== ch && s[i + 1] !== ' ' && !(ch === '_' && word(s[i - 1]))) {
      const end = findSingle(s, i + 1, ch);
      if (end > i + 1 && s[end - 1] !== ' ' && !(ch === '_' && word(s[end + 1]))) {
        push({ t: 'i', c: parseInline(s.slice(i + 1, end)) });
        i = end + 1;
        continue;
      }
    }
    if (ch === '[') {
      const m = rest.match(/^\[([^\]]*)\]\(([^)\s]+)\)/);
      if (m) {
        if (SAFE_HREF.test(m[2])) push({ t: 'a', href: m[2], c: parseInline(m[1]) });
        else push({ t: 'text', v: m[1] });
        i += m[0].length;
        continue;
      }
    }
    if (ch === '<') {
      const u = rest.match(/^<u>/i);
      if (u) {
        const end = closeTag(s, i + u[0].length, 'u');
        if (end > 0) {
          push({ t: 'u', c: parseInline(s.slice(i + u[0].length, end)) });
          i = s.indexOf('>', end) + 1;
          continue;
        }
      }
      const m = rest.match(OPEN_SPAN) ?? rest.match(OPEN_FONT);
      if (m) {
        const tag = m[0][1].toLowerCase() === 's' ? 'span' : 'font';
        const end = closeTag(s, i + m[0].length, tag);
        if (end > 0) {
          const inner = parseInline(s.slice(i + m[0].length, end));
          const color = m[1].trim();
          if (COLOR_RE.test(color)) push({ t: 'color', color: color.toLowerCase(), c: inner });
          else {
            flush();
            out.push(...inner);
          }
          i = s.indexOf('>', end) + 1;
          continue;
        }
      }
    }
    buf += ch;
    i++;
  }
  flush();
  return out;
}

// ---------- дерево → текст ----------

/** Склеивает соседние куски текста и одинаковое оформление: «**а****б**» ломает Markdown. */
export function tidy(list: Inline[]): Inline[] {
  const out: Inline[] = [];
  for (const raw of list) {
    const n: Inline = 'c' in raw ? { ...raw, c: tidy(raw.c) } : raw;
    if ('c' in n && n.c.length === 0) continue;
    if (n.t === 'text' && !n.v) continue;
    const last = out[out.length - 1];
    if (last && last.t === 'text' && n.t === 'text') out[out.length - 1] = { t: 'text', v: last.v + n.v };
    else if (last && (last.t === 'b' || last.t === 'i' || last.t === 'u' || last.t === 's') && last.t === n.t)
      out[out.length - 1] = { t: last.t, c: tidy([...last.c, ...(n as { c: Inline[] }).c]) };
    else if (last && last.t === 'color' && n.t === 'color' && last.color === n.color) out[out.length - 1] = { ...last, c: tidy([...last.c, ...n.c]) };
    else out.push(n);
  }
  return out;
}

const escapeText = (v: string) => v.replace(/[\\`*_~[\]<]/g, '\\$&');

/** Пробелы по краям выносятся за знаки оформления: «** а**» Markdown не считает жирным. */
function wrap(open: string, inner: string, close = open): string {
  const m = inner.match(/^(\s*)([\s\S]*?)(\s*)$/)!;
  return m[2] ? `${m[1]}${open}${m[2]}${close}${m[3]}` : inner;
}

export function inlineMarkdown(list: Inline[], br = '\n'): string {
  return tidy(list)
    .map((n) => {
      switch (n.t) {
        case 'text':
          return escapeText(n.v);
        case 'br':
          return br;
        case 'b':
          return wrap('**', inlineMarkdown(n.c, br));
        case 'i':
          return wrap('*', inlineMarkdown(n.c, br));
        case 'u':
          return wrap('<u>', inlineMarkdown(n.c, br), '</u>');
        case 's':
          return wrap('~~', inlineMarkdown(n.c, br));
        case 'code': {
          const tick = n.v.includes('`') ? '``' : '`';
          return `${tick}${n.v.startsWith('`') || n.v.endsWith('`') ? ` ${n.v} ` : n.v}${tick}`;
        }
        case 'a':
          return `[${inlineMarkdown(n.c, ' ')}](${n.href})`;
        case 'color':
          return wrap(`<span style="color:${n.color}">`, inlineMarkdown(n.c, br), '</span>');
      }
    })
    .join('');
}

/**
 * Строка, которая иначе прочлась бы как заголовок, список или цитата: знак в начале экранируется.
 * Решётка экранируется, только если за ней пробел (это заголовок): метка вроде #работа остаётся как есть.
 */
function guardStart(line: string): string {
  return line.replace(/^(\s*)(#{1,6}(?=[ \t]|$)|[>+-]|\d+(?=[.)]))/, (_, sp: string, mark: string) => (/\d/.test(mark) ? `${sp}${mark}\\` : `${sp}\\${mark}`));
}

const guardLines = (text: string) => text.split('\n').map(guardStart).join('\n');

export function toMarkdown(blocks: Block[]): string {
  const parts = blocks
    .map((b) => {
      switch (b.t) {
        case 'p':
          return guardLines(inlineMarkdown(b.c));
        case 'h': {
          const text = inlineMarkdown(b.c, ' ').trim();
          return text ? `${'#'.repeat(b.level)} ${text}${b.fold ? ' <!-- свёрнуто -->' : ''}` : '';
        }
        case 'ul':
        case 'ol':
          return b.items
            .map((it) => inlineMarkdown(it, '\n   ').trim())
            .filter(Boolean)
            .map((it, i) => `${b.t === 'ul' ? '-' : `${i + 1}.`} ${it}`)
            .join('\n');
        case 'quote':
          return inlineMarkdown(b.c)
            .split('\n')
            .map((l) => (l ? `> ${l}` : '>'))
            .join('\n');
        case 'code':
          return `\`\`\`\n${b.v}\n\`\`\``;
        case 'hr':
          return '---';
      }
    })
    .filter((p) => p.trim());
  return parts.join('\n\n');
}

// ---------- дерево → простой текст ----------

export function inlineText(list: Inline[]): string {
  return list.map((n) => (n.t === 'text' || n.t === 'code' ? n.v : n.t === 'br' ? '\n' : inlineText(n.c))).join('');
}

/** Текст без оформления: для поиска и первой строки статьи. */
export function plainText(markdown: string): string {
  const text = (b: Block): string => {
    if (b.t === 'code') return b.v;
    if (b.t === 'hr') return '';
    if ('items' in b) return b.items.map(inlineText).join('\n');
    return inlineText(b.c);
  };
  return parseMarkdown(markdown)
    .map(text)
    .filter(Boolean)
    .join('\n');
}
