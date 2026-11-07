// Шторка задач дня в Лагере: куда она встаёт, когда палец её отпустил. Без DOM, проверяется vitest.

/** Быстрый взмах, в пикселях за миллисекунду: шторка уходит туда, куда махнули, даже с полпути. */
export const FLICK = 0.35;

/**
 * Высота шторки под пальцем: от свёрнутой (low) до развёрнутой (high). За краями она идёт туго,
 * на треть движения пальца, чтобы было видно, что дальше некуда.
 */
export function dragHeight(start: number, dy: number, low: number, high: number): number {
  const h = start - dy;
  if (h > high) return high + (h - high) / 3;
  if (h < low) return low - (low - h) / 3;
  return h;
}

/**
 * Развернуть ли шторку, когда её отпустили на высоте h. Скорость v со знаком пальца: меньше нуля, когда
 * тянули вверх. Взмах решает сам, иначе шторка встаёт к ближайшему положению.
 */
export function snapUp(h: number, v: number, low: number, high: number): boolean {
  if (v < -FLICK) return true;
  if (v > FLICK) return false;
  return h > (low + high) / 2;
}
