import { describe, expect, it } from 'vitest';
import { parseInline, parseMarkdown, plainText, toMarkdown } from '../src/notes/markdown';

const round = (md: string) => toMarkdown(parseMarkdown(md));

describe('оформление заметок: Markdown', () => {
  it('жирный, курсив, зачёркнутый и цвет читаются деревом', () => {
    expect(parseInline('**жирно** и *курсив*, ~~нет~~, <span style="color:#e0a050">цвет</span>')).toEqual([
      { t: 'b', c: [{ t: 'text', v: 'жирно' }] },
      { t: 'text', v: ' и ' },
      { t: 'i', c: [{ t: 'text', v: 'курсив' }] },
      { t: 'text', v: ', ' },
      { t: 's', c: [{ t: 'text', v: 'нет' }] },
      { t: 'text', v: ', ' },
      { t: 'color', color: '#e0a050', c: [{ t: 'text', v: 'цвет' }] },
    ]);
  });

  it('цвет из Obsidian и вложенное оформление', () => {
    expect(parseInline('<font color="#FF0000">**а**</font>')).toEqual([{ t: 'color', color: '#ff0000', c: [{ t: 'b', c: [{ t: 'text', v: 'а' }] }] }]);
    expect(parseInline('<span style="color: red;">а</span>')).toEqual([{ t: 'color', color: 'red', c: [{ t: 'text', v: 'а' }] }]);
  });

  it('чужой HTML и опасные ссылки остаются текстом', () => {
    expect(parseInline('<img src=x onerror=alert(1)>')).toEqual([{ t: 'text', v: '<img src=x onerror=alert(1)>' }]);
    expect(parseInline('<span style="color:red;background:url(x)">а</span>')).toEqual([{ t: 'text', v: '<span style="color:red;background:url(x)">а</span>' }]);
    expect(parseInline('[тык](javascript:void)')).toEqual([{ t: 'text', v: 'тык' }]);
    expect(parseInline('[сайт](https://example.com)')).toEqual([{ t: 'a', href: 'https://example.com', c: [{ t: 'text', v: 'сайт' }] }]);
  });

  it('блоки: заголовок, списки, цитата, код, черта; строки абзаца через перенос', () => {
    const md = '### План\n\n- раз\n- два\n\n1. первое\n2. второе\n\n> мысль\n> дальше\n\n```\nкод *как есть*\n```\n\n---\n\nстрока\nвторая';
    expect(parseMarkdown(md).map((b) => b.t)).toEqual(['h', 'ul', 'ol', 'quote', 'code', 'hr', 'p']);
    expect(round(md)).toBe(md);
  });

  it('обычный текст со звёздочками и решёткой не превращается в оформление при записи', () => {
    const blocks = [{ t: 'p' as const, c: [{ t: 'text' as const, v: '2*3=6, #тег' }, { t: 'br' as const }, { t: 'text' as const, v: '- не список' }] }];
    const md = toMarkdown(blocks);
    expect(md).toBe('2\\*3=6, #тег\n\\- не список');
    expect(parseMarkdown(md)).toEqual(blocks);
  });

  it('соседнее одинаковое оформление склеивается, пробелы выносятся за знаки', () => {
    expect(
      toMarkdown([
        {
          t: 'p',
          c: [
            { t: 'b', c: [{ t: 'text', v: 'раз ' }] },
            { t: 'b', c: [{ t: 'text', v: 'два' }] },
            { t: 'text', v: ' и ' },
            { t: 'color', color: '#ef6b5e', c: [{ t: 'text', v: ' красное ' }] },
          ],
        },
      ]),
    ).toBe('**раз два** и  <span style="color:#ef6b5e">красное</span> ');
  });

  it('простой текст для поиска без знаков оформления', () => {
    expect(plainText('### План\n\n**Жирно** и <span style="color:#fff">цвет</span>\n\n- пункт')).toBe('План\nЖирно и цвет\nпункт');
  });

  it('старые заметки простым текстом читаются как раньше', () => {
    expect(round('Утро начинается с плана.\n\nПотом поход.')).toBe('Утро начинается с плана.\n\nПотом поход.');
    expect(round('Книга заметок у костра')).toBe('Книга заметок у костра');
  });
});
