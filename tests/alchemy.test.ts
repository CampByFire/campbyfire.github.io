import { describe, expect, it } from 'vitest';
import { sphereBrews } from '../src/game/alchemy';
import { addQuest, addTask, complete, newState, undoComplete } from '../src/game/state';
import { addDays } from '../src/game/time';

describe('Алхимия', () => {
  const now = new Date(2026, 9, 23, 9).getTime();
  it('дела сферы и проекта пополняют один котелок, отмена убирает вклад', () => {
    const s = newState(now);
    const sphere = s.quests[0];
    const project = addQuest(s, now, { name: 'Курс', kind: 'work', color: 'blue', sphereId: sphere.id });
    const finish = (questId: string | null) => {
      const id = addTask(s, now, { title: 'Дело', level: 1, questId });
      complete(s, now, id);
      return id;
    };
    finish(null);
    finish(sphere.id);
    const id = finish(project);
    expect(sphereBrews(s).get(sphere.id)).toEqual({ portions: 6, lastDay: s.day });
    undoComplete(s, id);
    expect(sphereBrews(s).get(sphere.id)?.portions).toBe(3);
    expect(sphereBrews(s).size).toBe(1);
  });

  it('переполнение не запасается, после перерыва остаётся дата последнего дела', () => {
    const s = newState(now);
    const sphere = s.quests[0];
    const day = s.day;
    for (let i = 0; i < 5; i++) {
      complete(s, now, addTask(s, now, { title: 'Дело', level: 1, questId: sphere.id }));
    }
    expect(sphereBrews(s).get(sphere.id)?.portions).toBe(8);
    s.day = addDays(day, 2);
    expect(sphereBrews(s).get(sphere.id)?.portions).toBe(6);
    s.day = addDays(day, 12);
    expect(sphereBrews(s).get(sphere.id)).toEqual({ portions: 0, lastDay: day });
  });
});
