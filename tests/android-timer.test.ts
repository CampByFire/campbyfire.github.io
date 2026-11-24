import { expect, it } from 'vitest';
import { FORGOTTEN_AFTER, MINUTE } from '../src/game/rules';
import { addTask, complete, newState, pause, resume, settle, start } from '../src/game/state';
import { androidTimer } from '../src/ui/androidTimer';

function working(hour = 9, minute = 0) {
  const now = new Date(2026, 9, 23, hour, minute).getTime();
  const state = newState(now);
  const id = addTask(state, now, { title: 'Разобрать почту', questId: null, level: 1, day: state.day });
  start(state, now, id);
  return { state, now, id };
}

it('для шторки достаточно одного начала отсчёта на все тики', () => {
  const { state, now } = working();
  const timer = androidTimer(state);
  expect(timer).toEqual({ status: 'running', title: 'Разобрать почту', startedAt: now, endsAt: now + FORGOTTEN_AFTER });
  settle(state, now + MINUTE);
  expect(androidTimer(state)).toEqual(timer);
});

it('шторка учитывает паузу, продолжение и завершение', () => {
  const { state, now, id } = working();
  pause(state, now + MINUTE);
  expect(androidTimer(state)).toEqual({ status: 'paused', title: 'Разобрать почту', elapsed: MINUTE });
  resume(state, now + 3 * MINUTE);
  expect(androidTimer(state).startedAt).toBe(now + 2 * MINUTE);
  complete(state, now + 4 * MINUTE, id);
  expect(androidTimer(state)).toEqual({ status: 'clear' });
});

it('фоновый секундомер ограничен началом игрового дня и сроком забытой задачи', () => {
  const { state, now } = working(3, 55);
  expect(androidTimer(state).endsAt).toBe(now + 5 * MINUTE);
  const daytime = working();
  settle(daytime.state, daytime.now + FORGOTTEN_AFTER + MINUTE);
  expect(androidTimer(daytime.state)).toEqual({ status: 'paused', title: 'Разобрать почту', elapsed: FORGOTTEN_AFTER });
});
