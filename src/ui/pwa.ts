// Работа без сети и обновления: регистрирует service worker (его собирает scripts/build/finish.mjs)
// и сообщает экрану, что вышла новая версия.
import { useEffect, useState } from 'preact/hooks';

let updateReady = false;
const listeners = new Set<() => void>();

export function registerServiceWorker(): void {
  if (!('serviceWorker' in navigator)) return;
  const sw = navigator.serviceWorker;
  // Первая установка тоже меняет контроллер страницы, но это ещё не обновление.
  const hadController = !!sw.controller;
  sw.addEventListener('controllerchange', () => {
    if (!hadController || updateReady) return;
    updateReady = true;
    for (const fn of listeners) fn();
  });
  const register = () => {
    sw.register('./sw.js', { updateViaCache: 'none' })
      .then((reg) => {
        // Приложение с экрана «Домой» может жить в памяти неделями: при каждом возвращении
        // проверяем, не вышла ли новая версия.
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') reg.update().catch(() => undefined);
        });
      })
      .catch(() => undefined);
  };
  // Страница могла уже загрузиться к этому моменту: тогда события load не будет.
  if (document.readyState === 'complete') register();
  else window.addEventListener('load', register, { once: true });
}

/** Просим браузер не стирать игру, когда кончается место. */
export function askPersistentStorage(): void {
  navigator.storage?.persist?.().catch(() => undefined);
}

export function useUpdateReady(): boolean {
  const [ready, setReady] = useState(updateReady);
  useEffect(() => {
    const fn = () => setReady(true);
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  }, []);
  return ready;
}
