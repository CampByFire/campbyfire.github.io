// Сохранение в GitHub: подключение по токену, состояние, срок и замена токена, выбор, когда в GitHub
// другая игра, и значок в верхней полосе лагеря, когда сохранение не работает.
import { useEffect, useState } from 'preact/hooks';
import { HOUR, heroLevel } from '../game/rules';
import { addDays, dayKey, daysBetween, formatClock, formatDate, formatDayLong, plural } from '../game/time';
import type { State } from '../game/types';
import { GitHubError, NEW_REPO_URL, REPO_NAME, TOKEN_URL, TOKENS_URL, historyUrl, repoUrl } from '../sync/github';
import type { Sync } from '../sync/sync';
import type { Ui } from './App';
import { Sheet } from './Sheets';

/** Перерисовать компонент, когда меняется состояние сохранения. */
export function useSync(sync: Sync): void {
  const [, setN] = useState(0);
  useEffect(() => sync.subscribe(() => setN((n) => n + 1)), [sync]);
}

/** За сколько дней до конца срока токена игра начинает напоминать. */
export const TOKEN_WARN_DAYS = 14;
/** Сколько действия могут ждать записи без сети, прежде чем лагерь об этом скажет. */
const STALE_AFTER = HOUR;

/** Сколько дней токену осталось; null, если срок неизвестен. */
export function tokenDaysLeft(sync: Sync, now: number): number | null {
  const exp = sync.tokenExpiry;
  return exp ? daysBetween(dayKey(now), exp.day) : null;
}

/**
 * Что не так с сохранением в GitHub. error: GitHub отказал или там другая игра, сохранение
 * стоит. stale: сети нет уже давно, а действия ждут записи (так выглядит и сеть, где GitHub закрыт).
 */
export function syncTrouble(sync: Sync, now: number): 'error' | 'stale' | null {
  const { phase } = sync.status;
  if (phase === 'error' || phase === 'conflict') return 'error';
  const since = sync.pendingSince;
  if (phase === 'offline' && since !== null && now - since > STALE_AFTER) return 'stale';
  return null;
}

/** Лист с сохранением в GitHub: открывается значком в лагере и напоминанием о токене. */
export function SyncSheet({ ui }: { ui: Ui }) {
  return (
    <Sheet title="Сохранение в GitHub" onClose={ui.close}>
      <SyncPanel ui={ui} />
    </Sheet>
  );
}

function when(ts: number, now: number): string {
  return dayKey(ts) === dayKey(now) ? `сегодня в ${formatClock(ts)}` : `${formatDate(dayKey(ts))}, в ${formatClock(ts)}`;
}

const FROM_DEVICE: Record<string, string> = { телефон: 'с телефона', компьютер: 'с компьютера' };

export function SyncPanel({ ui }: { ui: Ui }) {
  const { sync } = ui;
  useSync(sync);
  const st = sync.status;

  if (!sync.connected) {
    return (
      <div class="sync">
        <p class="note">
          Игра сохраняется в твой приватный репозиторий {REPO_NAME} на GitHub, и телефон с компьютером видят одну и ту же игру. Каждое сохранение остаётся в
          истории репозитория, а рядом, в папке diary, потом можно будет вести дневник.
        </p>
        <ol class="steps">
          <RepoSteps />
          <li>На втором устройстве вставь тот же токен: сохранение найдётся само.</li>
        </ol>
        <TokenForm label="Токен GitHub" button="Подключить" busyText="Подключаю…" submit={(t) => sync.connect(t)} onDone={() => {
          // Если в GitHub другая игра, сейчас откроется выбор, и сообщение его только заслонит.
          if (sync.status.phase !== 'conflict') ui.toast('GitHub подключён');
        }} />
        <p class="note">Токен лежит в этом браузере без пароля: подключай GitHub только на своих устройствах.</p>
      </div>
    );
  }

  const now = ui.now;
  const repo = sync.repo;
  let line: string;
  switch (st.phase) {
    case 'syncing':
      line = 'Сохраняю…';
      break;
    case 'offline':
      line = 'Нет связи с GitHub';
      break;
    case 'error':
      line = 'Не сохраняется';
      break;
    case 'conflict':
      line = 'В GitHub другая игра, нужно выбрать';
      break;
    default:
      line = st.syncedAt ? `Сохранено ${when(st.syncedAt, now).replace('сегодня ', '')}` : 'Подключено';
  }

  return (
    <div class="sync">
      <div class="sync-state">
        <span class={`sync-dot sync-${st.phase}`} aria-hidden="true" />
        <span class="sync-who">GitHub · {st.login}</span>
        <span class="meta">{line}</span>
      </div>
      {repo && (
        <p class="note">
          Сохранение лежит в{' '}
          <a href={repoUrl(repo.repo)} target="_blank" rel="noopener noreferrer">
            {repo.repo}
          </a>
          , файл game/save.json. Прошлые версии видны в{' '}
          <a href={historyUrl(repo.repo, repo.branch)} target="_blank" rel="noopener noreferrer">
            истории сохранений
          </a>
          .
        </p>
      )}
      {st.phase === 'error' && st.error && st.errorKind !== 'auth' && <p class="note note-error">{st.error}</p>}
      {st.phase === 'offline' && (
        <p class="note">
          Игра сохраняется здесь и уйдёт в GitHub, когда появится связь.
          {syncTrouble(sync, now) === 'stale' && ' Если сеть есть, а связи всё нет, возможно, эта сеть закрывает GitHub (так бывает в рабочих сетях).'}
        </p>
      )}
      <div class="btns">
        {st.phase === 'conflict' ? (
          <button class="btn btn-gold" onClick={() => ui.open({ kind: 'syncConflict' })}>
            Выбрать игру
          </button>
        ) : (
          <button class="btn btn-ghost" disabled={st.phase === 'syncing'} onClick={() => void sync.syncNow()}>
            Сохранить сейчас
          </button>
        )}
        <button
          class="btn btn-ghost"
          onClick={() => {
            if (confirm('Отключить GitHub на этом устройстве? Сохранение на GitHub останется.')) sync.disconnect();
          }}
        >
          Отключить
        </button>
      </div>
      <TokenBlock ui={ui} />
      <p class="note">
        Токен хранится только в этом браузере и в копию сохранения не попадает. Если устройство потерялось,{' '}
        <a href={TOKENS_URL} target="_blank" rel="noopener noreferrer">
          отзови токен на GitHub
        </a>
        : сохранение останется, а токен перестанет работать.
      </p>
    </div>
  );
}

/** Шаги до токена: приватный репозиторий и токен только на него. */
function RepoSteps() {
  return (
    <>
      <li>
        <a href={NEW_REPO_URL} target="_blank" rel="noopener noreferrer">
          Создай приватный репозиторий {REPO_NAME}
        </a>
        , если его ещё нет. Название и «Private» уже выбраны, внизу нажми «Create repository».
      </li>
      <li>
        <a href={TOKEN_URL} target="_blank" rel="noopener noreferrer">
          Создай токен на GitHub
        </a>
        . Название, срок на год и право «Contents: Read and write» уже выбраны. В «Repository access» выбери «Only select repositories» и {REPO_NAME}, внизу
        нажми «Generate token».
      </li>
      <li>Скопируй токен (он начинается с github_pat_) и вставь сюда.</li>
    </>
  );
}

/** Поле для токена с кнопкой: ошибку GitHub показывает под полем. */
function TokenForm(props: { label: string; button: string; busyText: string; submit: (token: string) => Promise<void>; onDone: () => void }) {
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const send = async (e: Event) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await props.submit(token);
      setToken('');
      props.onDone();
    } catch (err) {
      setError(err instanceof GitHubError ? err.message : 'Не получилось подключиться');
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <form class="sync-form" onSubmit={send}>
        <input
          class="input"
          type="password"
          autocomplete="off"
          spellcheck={false}
          placeholder="github_pat_…"
          aria-label={props.label}
          value={token}
          onInput={(e) => setToken(e.currentTarget.value)}
        />
        <button class="btn btn-gold" type="submit" disabled={busy || !token.trim()}>
          {busy ? props.busyText : props.button}
        </button>
      </form>
      {error && <p class="note note-error">{error}</p>}
    </>
  );
}

/** Срок токена: когда он кончится, как указать точный срок и как заменить токен новым. */
function TokenBlock({ ui }: { ui: Ui }) {
  const { sync } = ui;
  const exp = sync.tokenExpiry;
  const left = tokenDaysLeft(sync, ui.now);
  const soon = left !== null && left <= TOKEN_WARN_DAYS;
  const authFailed = sync.status.errorKind === 'auth';
  const [editing, setEditing] = useState(false);
  const [day, setDay] = useState(exp?.day ?? addDays(dayKey(ui.now), 366));
  const [replacing, setReplacing] = useState(false);
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const replace = async (e: Event) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await sync.replaceToken(token);
      setToken('');
      setReplacing(false);
      ui.toast('Токен заменён');
    } catch (err) {
      setError(err instanceof GitHubError ? err.message : 'Не получилось заменить токен');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div class="token">
      {!authFailed && (
        <div class="token-line">
          <span>{exp ? `Токен действует ${exp.guessed ? 'примерно ' : ''}до ${formatDayLong(exp.day)}` : 'Срок токена неизвестен'}</span>
          {!editing && (
            <button class="link-btn" onClick={() => setEditing(true)}>
              {exp ? 'изменить срок' : 'указать срок'}
            </button>
          )}
        </div>
      )}
      {editing && (
        <>
          <form
            class="sync-form"
            onSubmit={(e) => {
              e.preventDefault();
              if (!day) return;
              sync.setTokenExpiry(day);
              setEditing(false);
            }}
          >
            <input class="input" type="date" aria-label="Срок токена" value={day} onInput={(e) => setDay(e.currentTarget.value)} />
            <button class="btn btn-ghost" type="submit" disabled={!day}>
              Сохранить
            </button>
          </form>
          <p class="note">
            Точный срок виден на{' '}
            <a href={TOKENS_URL} target="_blank" rel="noopener noreferrer">
              странице токенов GitHub
            </a>
            , в строке «Expires on». За {TOKEN_WARN_DAYS} дней до конца игра напомнит заменить токен.
          </p>
        </>
      )}
      {(soon || authFailed) && (
        <p class={`note${authFailed || left! <= 3 ? ' note-error' : ''}`}>
          {authFailed
            ? 'GitHub больше не принимает этот токен: истёк срок или его отозвали. Создай новый и вставь его ниже.'
            : left! > 0
              ? `Токен закончится через ${left} ${plural(left!, 'день', 'дня', 'дней')}. Создай новый и вставь его ниже, тогда игра продолжит сохраняться.`
              : 'Срок токена закончился. Создай новый и вставь его ниже.'}
        </p>
      )}
      {replacing || soon || authFailed ? (
        <>
          <p class="note">
            <a href={TOKEN_URL} target="_blank" rel="noopener noreferrer">
              Создай новый токен
            </a>{' '}
            на том же аккаунте GitHub ({sync.status.login}): название, срок и право уже выбраны. В «Repository access» выбери «Only select repositories» и{' '}
            {sync.repo?.repo.split('/')[1] ?? REPO_NAME}, внизу нажми «Generate token». Старый можно потом удалить на{' '}
            <a href={TOKENS_URL} target="_blank" rel="noopener noreferrer">
              странице токенов
            </a>
            .
          </p>
          <form class="sync-form" onSubmit={replace}>
            <input
              class="input"
              type="password"
              autocomplete="off"
              spellcheck={false}
              placeholder="github_pat_…"
              aria-label="Новый токен GitHub"
              value={token}
              onInput={(e) => setToken(e.currentTarget.value)}
            />
            <button class="btn btn-gold" type="submit" disabled={busy || !token.trim()}>
              {busy ? 'Проверяю…' : 'Заменить'}
            </button>
          </form>
          {error && <p class="note note-error">{error}</p>}
        </>
      ) : (
        <button class="link-btn" onClick={() => setReplacing(true)}>
          Заменить токен
        </button>
      )}
    </div>
  );
}

function summary(s: State): string {
  const open = s.tasks.filter((t) => t.status === 'open' || t.status === 'inbox').length;
  const lvl = heroLevel(s.hero.xp).level;
  return `${lvl} уровень, ${s.hero.gold.toLocaleString('ru-RU')} золота, ${open} ${plural(open, 'задача', 'задачи', 'задач')} в отряде`;
}

export function SyncConflictSheet({ ui }: { ui: Ui }) {
  const { sync } = ui;
  useSync(sync);
  const c = sync.status.conflict;
  useEffect(() => {
    if (!c) ui.close();
  }, [c]);
  if (!c) return null;
  const pick = async (choice: 'remote' | 'local' | 'cancel') => {
    ui.close();
    await sync.resolve(choice);
    if (choice === 'remote') ui.toast('Игра из GitHub загружена');
    if (choice === 'local') ui.toast('Эта игра записана в GitHub');
  };
  return (
    <Sheet
      title="В GitHub другая игра"
      onClose={ui.close}
      footer={
        <div class="btns btns-col">
          <button class="btn btn-gold" onClick={() => void pick('remote')}>
            Взять игру из GitHub
          </button>
          <button class="btn btn-ghost" onClick={() => void pick('local')}>
            Записать в GitHub игру отсюда
          </button>
          <button class="link-btn" onClick={() => void pick('cancel')}>
            Не подключать GitHub
          </button>
        </div>
      }
    >
      <p class="note">
        В GitHub лежит другая игра, её сохранили {FROM_DEVICE[c.device] ?? c.device} {when(c.savedAt, ui.now)}. Оставить можно одну: вторая заменится.
      </p>
      <div class="compare">
        <div class="compare-row">
          <span class="sc">В GitHub</span>
          <span>{summary(c.remote)}</span>
        </div>
        <div class="compare-row">
          <span class="sc">Здесь</span>
          <span>{summary(ui.store.state)}</span>
        </div>
      </div>
      <p class="note">Если сомневаешься, сначала сохрани копию этой игры в файл.</p>
    </Sheet>
  );
}
