// Цвет знамени похода: один из шести готовых или свой, кодом «#rrggbb». DOM здесь нет, всё проверяется тестами.
import type { QuestColor, QuestPreset } from './types';

/** Готовые знамёна в том порядке, в каком их предлагает лист похода. */
export const PRESETS: QuestPreset[] = ['red', 'blue', 'green', 'yellow', 'purple', 'brown'];

export const PRESET_HEX: Record<QuestPreset, string> = {
  red: '#d64b3c',
  blue: '#4f7be0',
  green: '#6aa84f',
  yellow: '#e6b739',
  purple: '#9467d6',
  brown: '#a3734a',
};

/** Знамя задачи без похода, а также цвет, которого игра не знает (например, из более новой версии). */
export const NO_COLOR_HEX = '#6b5a48';

export function isPreset(c: unknown): c is QuestPreset {
  return typeof c === 'string' && (PRESETS as string[]).includes(c);
}

/** Свой цвет в сохранении: решётка и шесть знаков 0–9, a–f. */
export function isHex(c: unknown): c is `#${string}` {
  return typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c);
}

/**
 * Код цвета, как его ввёл игрок, в виде «#rrggbb»: с решёткой или без, из шести знаков или из трёх
 * («#4af» значит «#44aaff»), большими буквами или маленькими. null, если это не код цвета.
 */
export function parseHex(input: string): string | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(input.trim());
  if (!m) return null;
  const d = m[1].length === 3 ? [...m[1]].map((c) => c + c).join('') : m[1];
  return `#${d.toLowerCase()}`;
}

/** Каким цветом рисовать знамя. */
export function questHex(c: QuestColor | undefined): string {
  if (isPreset(c)) return PRESET_HEX[c];
  if (isHex(c)) return c.toLowerCase();
  return NO_COLOR_HEX;
}

/** Свой цвет, совпавший с готовым, сохраняется готовым: так его узнают и прежние версии игры. */
export function toQuestColor(hex: string): QuestColor {
  return PRESETS.find((p) => PRESET_HEX[p] === hex) ?? (hex as QuestColor);
}

/** Оттенок 0–359 градусов, насыщенность и яркость 0–100, целыми, как на ползунках. */
export interface Hsl {
  h: number;
  s: number;
  l: number;
}

function channels(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** У серого, чёрного и белого оттенка нет: тогда h равно 0, и ползунок оттенка лучше оставить, где был. */
export function hexToHsl(hex: string): Hsl {
  const [r, g, b] = channels(hex).map((c) => c / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (d > 0) {
    s = d / (1 - Math.abs(2 * l - 1));
    if (max === r) h = ((g - b) / d + 6) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
  }
  return { h: Math.round(h * 60) % 360, s: Math.round(s * 100), l: Math.round(l * 100) };
}

export function hslToHex({ h, s, l }: Hsl): string {
  const a = (s / 100) * Math.min(l / 100, 1 - l / 100);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const c = l / 100 - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(c * 255)
      .toString(16)
      .padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

/** Сколько света отдаёт цвет, от 0 (чёрный) до 1 (белый), по WCAG. */
export function luminance(hex: string): number {
  const [r, g, b] = channels(hex).map((c) => {
    const v = c / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Такое тёмное знамя теряется на тёмных карточках и листах: ему нужна светлая обводка. */
export function isDark(hex: string): boolean {
  return luminance(hex) < 0.05;
}

/** Контраст двух цветов по WCAG, от 1 до 21. */
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Цвета цифр по очереди: тёмный, как на золотом номере, светлый, белый, чёрный. */
const INKS = ['#2a1d10', '#fbf3e2', '#ffffff', '#000000'];

/** Цвет цифры на номере в цвете похода: первый из INKS с контрастом 4,5:1. Белый или чёрный дают его на любом цвете. */
export function inkOn(hex: string): string {
  return INKS.find((c) => contrast(hex, c) >= 4.5) ?? '#000000';
}

const HUES: [number, string][] = [
  [12, 'красный'],
  [40, 'оранжевый'],
  [66, 'жёлтый'],
  [90, 'салатовый'],
  [155, 'зелёный'],
  [185, 'бирюзовый'],
  [210, 'голубой'],
  [250, 'синий'],
  [280, 'фиолетовый'],
  [320, 'пурпурный'],
  [345, 'розовый'],
  [360, 'красный'],
];

/** Чистый цвет оттенка словом: «синий». */
export function hueName(h: number): string {
  return (HUES.find(([upTo]) => h < upTo) ?? HUES[0])[1];
}

/** Цвет словами для экранного диктора: «тёмно-синий», «коричневый», «светло-серый». Код цвета на слух ничего не говорит. */
export function colorName(hex: string): string {
  const { h, s, l } = hexToHsl(hex);
  if (l <= 8) return 'чёрный';
  if (l >= 94) return 'белый';
  const dark = l < 35;
  const light = l > 72;
  if (s < 12) return dark ? 'тёмно-серый' : light ? 'светло-серый' : 'серый';
  const hue = hueName(h);
  // У тёмного оранжевого, тёмного жёлтого, светлого красного и тёмного розового свои слова, «тёмно-» и «светло-» им уже не нужны.
  const own =
    hue === 'оранжевый' && (dark || (s < 60 && l < 55))
      ? 'коричневый'
      : (hue === 'жёлтый' || hue === 'салатовый') && dark
        ? 'оливковый'
        : hue === 'красный' && light
          ? 'розовый'
          : hue === 'розовый' && l < 45
            ? 'малиновый'
            : null;
  if (s < 30) return `серо-${own ?? hue}`;
  if (own) return own;
  return dark ? `тёмно-${hue}` : light ? `светло-${hue}` : hue;
}
