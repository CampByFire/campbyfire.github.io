import { BREW_CAPACITY, BREW_DAYS_PER_PORTION, BREW_PER_TASK } from './rules';
import { sphereOf } from './state';
import { addDays, dayKey, daysBetween } from './time';
import type { DayKey, State } from './types';

export interface Brew {
  portions: number;
  lastDay: DayKey;
}

/** Восстанавливаем котелки по завершённым делам, в том числе после отмены и слияния сохранений. */
export function sphereBrews(s: State): Map<string, Brew> {
  const brews = new Map<string, Brew & { decayFrom: DayKey }>();
  const completed = s.tasks.filter(t => t.status === 'done' && (t.doneDay || t.doneAt))
    .map(t => ({ questId: t.questId, day: t.doneDay ?? dayKey(t.doneAt!) }))
    .filter(t => t.day <= s.day)
    .sort((a, b) => a.day.localeCompare(b.day));
  for (const task of completed) {
    const sphere = sphereOf(s, task.questId);
    if (!sphere) continue;
    const previous = brews.get(sphere.id);
    const since = previous?.decayFrom ?? task.day;
    const lost = Math.floor(daysBetween(since, task.day) / BREW_DAYS_PER_PORTION);
    const remaining = Math.max(0, (previous?.portions ?? 0) - lost);
    brews.set(sphere.id, {
      portions: Math.min(BREW_CAPACITY, remaining + BREW_PER_TASK),
      lastDay: task.day,
      decayFrom: remaining ? addDays(since, lost * BREW_DAYS_PER_PORTION) : task.day,
    });
  }
  return new Map([...brews].map(([id, { portions, lastDay, decayFrom }]) => [id, {
    portions: Math.max(0, portions - Math.floor(daysBetween(decayFrom, s.day) / BREW_DAYS_PER_PORTION)),
    lastDay,
  }]));
}
