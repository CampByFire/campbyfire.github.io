// Одна строка над меню: то, что игроку важно знать прямо сейчас. Важнее всего сбой записи,
// потом новая версия, потом подсказки, которые берегут игру от потери.
import { useState } from 'preact/hooks';
import { plural } from '../game/time';
import type { Ui } from './App';
import { isIos, isStandalone } from './device';
import { downloadGame } from './files';
import { LIcon } from './Icon';
import { loadLocal, updateLocal, type Local } from './local';
import { useUpdateReady } from './pwa';
import { TOKEN_WARN_DAYS, tokenDaysLeft } from './SyncPanel';

const DAY_MS = 24 * 60 * 60_000;
/** Напоминать о копии, если её не делали неделю и игре больше трёх дней. */
const BACKUP_EVERY = 7 * DAY_MS;
const BACKUP_AFTER = 3 * DAY_MS;

interface Notice {
  text: string;
  tone?: 'warn';
  action?: { label: string; run: () => void };
  close?: () => void;
}

export function Notices({ ui, covered }: { ui: Ui; covered: boolean }) {
  const { store, sync, now } = ui;
  const update = useUpdateReady();
  const [, redraw] = useState(0);
  const local = loadLocal(now);
  const hush = (key: keyof Local['quiet'], days: number) => {
    updateLocal(now, (l) => {
      l.quiet[key] = now + days * DAY_MS;
    });
    redraw((n) => n + 1);
  };
  const backup = () => {
    downloadGame(store);
    redraw((n) => n + 1);
  };

  const n = pick();
  if (!n) return null;
  return (
    <div class={`notice${n.tone === 'warn' ? ' notice-warn' : ''}`} role="status" inert={covered}>
      <span class="notice-text">{n.text}</span>
      {n.action && (
        <button class="btn btn-sm notice-btn" onClick={n.action.run}>
          {n.action.label}
        </button>
      )}
      {n.close && (
        <button class="icon-btn" aria-label="Скрыть" onClick={n.close}>
          <LIcon name="close" size={18} />
        </button>
      )}
    </div>
  );

  function pick(): Notice | null {
    if (!store.saveOk) {
      return {
        tone: 'warn',
        text: 'Браузер не даёт сохранить игру: кончилось место или включён приватный режим. Сохрани копию в файл.',
        action: { label: 'Копия', run: backup },
      };
    }
    if (update) return { text: 'Вышла новая версия Лагеря.', action: { label: 'Обновить', run: () => location.reload() } };
    const quiet = (key: keyof Local['quiet']) => (local.quiet[key] ?? 0) > now;
    const left = sync.connected ? tokenDaysLeft(sync, now) : null;
    if (left !== null && left <= TOKEN_WARN_DAYS && !quiet('token')) {
      return {
        tone: left <= 3 ? 'warn' : undefined,
        text:
          left > 0
            ? `Токен GitHub закончится через ${left} ${plural(left, 'день', 'дня', 'дней')}. Замени его, чтобы игра и дальше сохранялась в GitHub.`
            : 'Срок токена GitHub закончился: игра больше не сохраняется в GitHub. Замени токен.',
        action: { label: 'Заменить', run: () => ui.open({ kind: 'sync' }) },
        close: () => hush('token', left > 3 ? 3 : 1),
      };
    }
    if (isIos() && !isStandalone() && !quiet('ios')) {
      return {
        text: 'Добавь Лагерь на экран «Домой»: «Поделиться», затем «На экран „Домой“». Safari стирает данные сайтов, которые не открывали неделю.',
        close: () => hush('ios', 14),
      };
    }
    const played = store.state.tasks.length > 0 && now - local.firstSeen > BACKUP_AFTER;
    const stale = local.backupAt === null || now - local.backupAt > BACKUP_EVERY;
    if (!sync.connected && played && stale && !quiet('backup')) {
      return {
        text: 'Игра хранится только в этом браузере. Сохрани копию в файл или подключи GitHub в Настройках.',
        action: { label: 'Копия', run: backup },
        close: () => hush('backup', 3),
      };
    }
    return null;
  }
}
