// Google Календарь в Настройках → «Напоминания»: ключ, вход, состояние календаря «Лагерь», «Войти снова» и отключение.
import { useEffect, useState } from 'preact/hooks';
import { formatClock, plural } from '../game/time';
import { CALENDAR_NAME, GOOGLE_PERMISSIONS_URL, GoogleError, type GoogleCalendar, type GooglePhase } from '../sync/gcal';
import type { Ui } from './App';
import { appUrl } from './local';

/** Перерисовать компонент, когда меняется состояние Google Календаря. */
export function useGoogle(google: GoogleCalendar): void {
  const [, setN] = useState(0);
  useEffect(() => google.subscribe(() => setN((n) => n + 1)), [google]);
}

/** Уйти на вход в Google; оттуда Google вернёт на эту же страницу. */
export function loginGoogle(google: GoogleCalendar): void {
  location.assign(google.loginUrl(appUrl()));
}

const DOT: Record<GooglePhase, string> = { off: 'offline', ok: 'ok', syncing: 'syncing', offline: 'offline', expired: 'offline', error: 'error' };

export function GooglePanel({ ui }: { ui: Ui }) {
  const { google } = ui;
  useGoogle(google);
  const [key, setKey] = useState(google.clientId);
  const [leaving, setLeaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const st = google.status;

  if (!google.connected) {
    const ready = !!google.clientId;
    return (
      <div class="sync">
        <h3 class="sub-head">Google Календарь</h3>
        <p class="note">
          Можно и без файла: Лагерь сам поставит то же самое в отдельный календарь «{CALENDAR_NAME}» в твоём Google и будет обновлять его, пока Лагерь открыт. Звонит
          сам Google, даже когда Лагерь закрыт. Остальной твой календарь Лагерь не видит.
        </p>
        {!google.builtIn && (
          <>
            <p class="note">Сначала нужен свой ключ Google (Client ID). Как его получить, написано в Справке: «Google Календарь».</p>
            <label class="field">
              <span class="field-label">Ключ Google (Client ID)</span>
              <input
                class="input"
                type="text"
                inputMode="url"
                autoComplete="off"
                spellcheck={false}
                placeholder="…apps.googleusercontent.com"
                value={key}
                onInput={(e) => setKey(e.currentTarget.value)}
                onChange={(e) => google.setClientId(e.currentTarget.value)}
              />
            </label>
          </>
        )}
        <div class="btns btns-one">
          <button
            class="btn btn-ghost"
            disabled={!ready && !key.trim()}
            onClick={() => {
              if (!google.builtIn) google.setClientId(key);
              loginGoogle(google);
            }}
          >
            Подключить Google Календарь
          </button>
        </div>
      </div>
    );
  }

  let line: string;
  switch (st.phase) {
    case 'syncing':
      line = 'Обновляю календарь…';
      break;
    case 'offline':
      line = 'Нет связи с Google';
      break;
    case 'expired':
      line = 'Нужно войти снова';
      break;
    case 'error':
      line = 'Не обновляется';
      break;
    default:
      line = st.syncedAt ? `Обновлён в ${formatClock(st.syncedAt)}` : 'Подключён';
  }

  const leave = async (removeCalendar: boolean) => {
    setBusy(true);
    try {
      const removed = await google.disconnect(removeCalendar);
      ui.toast(removed ? `Google отключён, календарь «${CALENDAR_NAME}» удалён` : 'Google Календарь отключён на этом устройстве');
    } catch (e) {
      ui.toast(e instanceof GoogleError ? `Календарь не удалился: ${e.message}` : 'Календарь не удалился');
    } finally {
      setBusy(false);
      setLeaving(false);
    }
  };

  return (
    <div class="sync">
      <h3 class="sub-head">Google Календарь</h3>
      <div class="sync-state" role="status">
        <span class={`sync-dot sync-${DOT[st.phase]}`} aria-hidden="true" />
        <span class="sync-who">Календарь «{CALENDAR_NAME}»</span>
        <span class="meta">{line}</span>
      </div>
      {st.phase === 'ok' && st.events !== null && (
        <p class="note">
          В календаре {st.events} {plural(st.events, 'событие', 'события', 'событий')} Лагеря. Новое и изменённое попадёт туда через пару секунд, пока Лагерь открыт.
        </p>
      )}
      {st.phase === 'expired' && (
        <p class="note">
          Вход в Google действует около часа. Напоминания, что уже в календаре, сработают и так, а новые и изменённые попадут туда, когда ты войдёшь снова.
        </p>
      )}
      {st.phase === 'offline' && <p class="note">Календарь обновится, когда появится связь.</p>}
      {st.phase === 'error' && st.error && <p class="note note-error">{st.error}</p>}
      {leaving ? (
        <>
          <p class="note">Удалить заодно и календарь «{CALENDAR_NAME}» в Google со всеми напоминаниями Лагеря?</p>
          <div class="btns btns-col">
            <button class="btn btn-danger" disabled={busy || st.phase === 'expired'} onClick={() => void leave(true)}>
              Отключить и удалить календарь
            </button>
            <button class="btn btn-ghost" disabled={busy} onClick={() => void leave(false)}>
              Только отключить
            </button>
            <button class="link-btn" disabled={busy} onClick={() => setLeaving(false)}>
              Отмена
            </button>
          </div>
          {st.phase === 'expired' && <p class="note">Чтобы удалить календарь, сначала войди снова. Или удали его сам в настройках Google Календаря.</p>}
        </>
      ) : (
        <div class="btns">
          {st.phase === 'expired' ? (
            <button class="btn btn-gold" onClick={() => loginGoogle(google)}>
              Войти снова
            </button>
          ) : (
            <button class="btn btn-ghost" disabled={st.phase === 'syncing'} onClick={() => void google.syncNow()}>
              Обновить сейчас
            </button>
          )}
          <button class="btn btn-ghost" onClick={() => setLeaving(true)}>
            Отключить
          </button>
        </div>
      )}
      <p class="note">
        Вход хранится только в этом браузере и в сохранение не попадает. Доступ Лагеря к Google можно снять в{' '}
        <a href={GOOGLE_PERMISSIONS_URL} target="_blank" rel="noopener noreferrer">
          настройках аккаунта Google
        </a>
        .
      </p>
    </div>
  );
}
