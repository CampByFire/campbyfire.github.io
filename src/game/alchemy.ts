import { BREW_CAPACITY, BREW_PER_TASK } from './rules';
import { sphereOf } from './state';
import { dayKey, daysBetween } from './time';
import type { DayKey, State } from './types';

export interface Brew {
  portions: number;
  lastDay: DayKey;
}

/** Восстанавливаем котелки по завершённым делам, в том числе после отмены и слияния сохранений. */
export function sphereBrews(s: State): Map<string, Brew> {
  const brews = new Map<string, Brew>();
  const completed = s.tasks.filter(t => t.status === 'done' && (t.doneDay || t.doneAt))
    .map(t => ({ questId: t.questId, day: t.doneDay ?? dayKey(t.doneAt!) }))
    .filter(t => t.day <= s.day)
    .sort((a, b) => a.day.localeCompare(b.day));
  for (const task of completed) {
    const sphere = sphereOf(s, task.questId);
    if (!sphere) continue;
    const previous = brews.get(sphere.id);
    const remaining = previous ? Math.max(0, previous.portions - daysBetween(previous.lastDay, task.day)) : 0;
    brews.set(sphere.id, { portions: Math.min(BREW_CAPACITY, remaining + BREW_PER_TASK), lastDay: task.day });
  }
  for (const brew of brews.values()) {
    brew.portions = Math.max(0, brew.portions - daysBetween(brew.lastDay, s.day));
  }
  return brews;
}
