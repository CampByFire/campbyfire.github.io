// Что помнит само устройство, а не игра: подсказки, знакомство, когда делали копию, сила магии.
// В сохранение и в GitHub это не попадает.
import type { Motion } from './magic/mode';

const KEY = 'taskcraft-lager-device';

export interface Local {
  /** Когда это устройство впервые открыло Лагерь. */
  firstSeen: number;
  /** Когда здесь последний раз сохраняли копию в файл. */
  backupAt: number | null;
  /** Знакомство пройдено или пропущено. */
  introDone: boolean;
  /** До какого времени молчит подсказка. */
  quiet: Partial<Record<'ios' | 'backup' | 'token', number>>;
  /** Сила магии, выбранная в Настройках. Пока не выбрана, решает настройка системы «Уменьшить движение». */
  magic?: Motion;
  /** Нежить, которая уже вставала на дороге у этого устройства: второй раз она из земли не поднимается. */
  risen?: string[];
  /** Раздел Летописи, куда последний раз записали мысль: туда же пойдёт следующая. */
  lastSection?: string;
}

export function loadLocal(now: number): Local {
  let saved: Partial<Local> = {};
  try {
    saved = (JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Local> | null) ?? {};
  } catch {
    saved = {};
  }
  const local: Local = { firstSeen: now, backupAt: null, introDone: false, quiet: {}, ...saved };
  if (!saved.firstSeen) saveLocal(local);
  return local;
}

export function saveLocal(local: Local): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(local));
  } catch {
    // Не запомнили: подсказка покажется ещё раз, игре это не мешает.
  }
}

/** «Стереть всё»: устройство забывает подсказки, знакомство и копии. */
export function clearLocal(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Нечего забывать.
  }
}

export function updateLocal(now: number, patch: (l: Local) => void): Local {
  const l = loadLocal(now);
  patch(l);
  saveLocal(l);
  return l;
}
