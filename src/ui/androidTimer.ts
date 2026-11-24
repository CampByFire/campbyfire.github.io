import { DAY_STARTS_AT_HOUR, FORGOTTEN_AFTER, HOUR } from '../game/rules';
import { findTask, spentNow } from '../game/state';
import type { Store } from '../game/store';
import { addDays, parseDay } from '../game/time';
import type { State } from '../game/types';

/** Android получает только название и время задачи, которую сейчас показывает Лагерь. */
export function androidTimer(state: State) {
  const current = state.current;
  const task = current && findTask(state, current.taskId);
  if (!current || !task || task.status !== 'open') return { status: 'clear' };
  const elapsed = spentNow(state, task, state.settledAt);
  if (current.runningSince === null) return { status: 'paused', title: task.title, elapsed };
  const tomorrow = parseDay(addDays(state.day, 1)).getTime() + DAY_STARTS_AT_HOUR * HOUR;
  return {
    status: 'running',
    title: task.title,
    startedAt: state.settledAt - elapsed,
    endsAt: Math.min(current.seenAt + FORGOTTEN_AFTER, tomorrow),
  };
}

/** Chrome передаёт порт от подтверждённой Android-оболочки при открытии страницы. */
export function connectAndroidTimer(store: Store) {
  let disconnect: (() => void) | undefined;
  window.addEventListener('message', (event: MessageEvent) => {
    if (event.origin !== 'android-app://campbyfire.github.io/io.github.campbyfire.lager' ||
        event.data !== '' || event.ports.length !== 1 || window.top !== window) return;
    disconnect?.();
    const port = event.ports[0];
    let previous = '';
    const publish = () => {
      const message = JSON.stringify(androidTimer(store.state));
      if (message === previous) return;
      port.postMessage(message);
      previous = message;
    };
    const unsubscribe = store.subscribe(publish);
    disconnect = () => {
      unsubscribe();
      port.close();
    };
    publish();
  });
}
