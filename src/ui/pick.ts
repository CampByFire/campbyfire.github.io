// Нажатие на саму фигуру в сцене. Картинки фигур шире самих фигур (тени, пустые поля) и налезают
// друг на друга, поэтому прямоугольник картинки не годится: смотрим, непрозрачен ли пиксель под пальцем.
import { assetUrl, type Sprite } from '../scene/scene';

interface Mask {
  w: number;
  h: number;
  alpha: Uint8Array;
}

/** Маски по файлу картинки: null, пока картинка грузится или не прочиталась. */
const masks = new Map<string, Mask | null>();

/** Пиксель с такой непрозрачностью уже фигура, а не полупрозрачная тень. */
const SOLID = 96;

/** Заранее прочитать прозрачность картинки, чтобы первое же нажатие попало. */
export function preloadMask(file: string): void {
  if (masks.has(file) || typeof document === 'undefined') return;
  masks.set(file, null);
  const img = new Image();
  img.decoding = 'async';
  img.onload = () => {
    try {
      const w = img.naturalWidth;
      const h = img.naturalHeight;
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const ctx = c.getContext('2d', { willReadFrequently: true });
      if (!ctx || !w || !h) return;
      ctx.drawImage(img, 0, 0);
      const data = ctx.getImageData(0, 0, w, h).data;
      const alpha = new Uint8Array(w * h);
      for (let i = 0; i < alpha.length; i++) alpha[i] = data[i * 4 + 3];
      masks.set(file, { w, h, alpha });
    } catch {
      // Без маски фигура ловит нажатие серединой своего прямоугольника, см. solidAt.
    }
  };
  img.src = assetUrl(file);
}

/**
 * Плотна ли картинка в точке сцены (x, y), в единицах сцены. Пока маски нет, считаем фигурой
 * среднюю часть прямоугольника: так нажатие работает и до того, как маска прочиталась.
 */
export function solidAt(s: Sprite, x: number, y: number): boolean {
  const u = (x - s.x) / s.w;
  const v = (y - s.y) / s.h;
  if (u < 0 || u >= 1 || v < 0 || v >= 1) return false;
  const m = masks.get(s.file);
  if (!m) return u > 0.3 && u < 0.7 && v > 0.1 && v < 0.9;
  const px = Math.floor(u * m.w);
  const py = Math.floor(v * m.h);
  return m.alpha[py * m.w + px] >= SOLID;
}

export interface Pickable<T> {
  sprite: Sprite;
  /** Кого открывает нажатие; у слоя костра пусто: он закрывает тех, кто за ним, но сам не открывается. */
  target?: T;
}

/**
 * Кто под пальцем. Слои идут от дальних к ближним, проверяем с ближних. Сначала точно под пальцем,
 * потом в круге радиуса slop: палец толще пикселя, а фигуры на телефоне маленькие.
 */
export function pick<T>(layers: Pickable<T>[], x: number, y: number, slop: number): T | undefined {
  const top = (px: number, py: number): Pickable<T> | undefined => {
    for (let i = layers.length - 1; i >= 0; i--) if (solidAt(layers[i].sprite, px, py)) return layers[i];
    return undefined;
  };
  const exact = top(x, y);
  if (exact) return exact.target;
  if (slop <= 0) return undefined;
  for (const r of [slop / 2, slop]) {
    for (let k = 0; k < 8; k++) {
      const a = (k * Math.PI) / 4;
      const hit = top(x + Math.cos(a) * r, y + Math.sin(a) * r);
      if (hit?.target !== undefined) return hit.target;
    }
  }
  return undefined;
}
