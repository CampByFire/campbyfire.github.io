// Сила магии на этом устройстве: вся, спокойная или без анимаций.

export type Motion = 'full' | 'calm' | 'off';

export const MOTIONS: Motion[] = ['full', 'calm', 'off'];

/**
 * Что показывать. Пока в Летописи ничего не выбрано, решает система: при «Уменьшить движение»
 * магия спокойная, мягкий наплыв вместо движения. Без анимаций только по выбору человека.
 */
export function resolveMotion(choice: Motion | undefined, reduced: boolean): Motion {
  return choice && MOTIONS.includes(choice) ? choice : reduced ? 'calm' : 'full';
}

const QUERY = '(prefers-reduced-motion: reduce)';

/** Включено ли в системе «Уменьшить движение». */
export function systemReduced(): boolean {
  try {
    return window.matchMedia(QUERY).matches;
  } catch {
    return false;
  }
}

/** Следить за настройкой системы: её можно поменять, пока Лагерь открыт. */
export function onSystemReduced(fn: () => void): () => void {
  try {
    const mq = window.matchMedia(QUERY);
    mq.addEventListener('change', fn);
    return () => mq.removeEventListener('change', fn);
  } catch {
    return () => {};
  }
}
