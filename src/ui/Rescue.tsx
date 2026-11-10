// Экраны вместо игры: сохранение не открылось или в игре случилась ошибка.
import { useRef, useState } from 'preact/hooks';
import { browserStorage, isNewerSave, parseSave, type Store } from '../game/store';
import type { Sync } from '../sync/sync';
import { saveFile, today } from './files';
import { ISSUES_URL, errorReport, newIssueUrl } from './report';

/** Сохранение в браузере не открылось. Пока игрок не выберет, что делать, поверх него ничего не пишется. */
export function Recovery({ store, sync, onDone }: { store: Store; sync: Sync; onDone: () => void }) {
  const problem = store.problem!;
  const file = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const download = () => saveFile(`lager-otlozhennoe-${today()}.json`, problem.raw);

  const upload = async (f: File) => {
    const text = await f.text();
    const next = parseSave(text);
    if (!next) {
      setError(isNewerSave(text) ? 'Эта копия из более новой версии Лагеря. Обнови страницу и загрузи её ещё раз.' : 'Это не копия Лагеря.');
      return;
    }
    sync.replaceGame(next);
    onDone();
  };

  const fromGitHub = () => {
    store.startOver();
    sync.pullFresh();
    onDone();
  };

  const startOver = () => {
    if (!confirm('Начать новую игру? Нечитаемое сохранение не удалится: оно останется отложенным в браузере, а если его скачали, то и в файле.')) return;
    store.startOver();
    onDone();
  };

  if (problem.kind === 'newer') {
    return (
      <div class="rescue">
        <h1 class="page-title">Нужна новая версия</h1>
        <p class="page-sub">
          В этом браузере игру уже открывала более новая версия Лагеря, а эта страница устарела. Обнови её: игра на месте, с ней ничего не случилось.
        </p>
        <div class="btns btns-col">
          <button class="btn btn-gold" onClick={() => location.reload()}>
            Обновить страницу
          </button>
          <button class="btn btn-ghost" onClick={download}>
            Скачать сохранение
          </button>
        </div>
        <p class="note">Если после обновления этот экран не пропал, подключись к интернету: новая версия скачается с сайта.</p>
      </div>
    );
  }

  return (
    <div class="rescue">
      <h1 class="page-title">Сохранение не открылось</h1>
      <p class="page-sub">
        Запись игры в этом браузере повреждена. Поверх неё Лагерь ничего не пишет: сначала скачай её, чтобы не потерять, а потом выбери, как продолжить.
      </p>
      <div class="btns btns-col">
        <button class="btn btn-ghost" onClick={download}>
          Скачать сохранение
        </button>
        {sync.connected && (
          <button class="btn btn-gold" onClick={fromGitHub}>
            Взять игру из GitHub
          </button>
        )}
        <button class="btn btn-ghost" onClick={() => file.current?.click()}>
          Загрузить копию из файла
        </button>
        {!sync.connected && (
          <button class="btn btn-ghost" onClick={startOver}>
            Начать новую игру
          </button>
        )}
      </div>
      {error && <p class="note note-error">{error}</p>}
      <p class="note">
        Если игру не получается вернуть,{' '}
        <a href={ISSUES_URL} target="_blank" rel="noopener noreferrer">
          напиши о проблеме на GitHub
        </a>
        . Сам файл туда не выкладывай: записи там видят все, а в файле вся твоя игра.
      </p>
      <input
        ref={file}
        type="file"
        accept="application/json,.json"
        hidden
        onChange={(e) => {
          const f = e.currentTarget.files?.[0];
          if (f) void upload(f);
          e.currentTarget.value = '';
        }}
      />
    </div>
  );
}

/** В игре случилась ошибка. Недоделанное действие не сохранилось, всё остальное на месте. */
export function Crash({ error }: { error: unknown }) {
  const [report] = useState(() => errorReport(error));
  const [copied, setCopied] = useState(false);
  const area = useRef<HTMLTextAreaElement>(null);

  const copy = () => {
    const done = () => setCopied(true);
    if (navigator.clipboard) {
      navigator.clipboard.writeText(report).then(done, () => selectReport());
    } else selectReport();
  };
  const selectReport = () => {
    const el = area.current;
    if (!el) return;
    el.closest('details')?.setAttribute('open', '');
    el.select();
  };
  const downloadSave = () => {
    const raw = browserStorage.load();
    if (raw) saveFile(`lager-${today()}.json`, raw);
  };

  return (
    <div class="rescue">
      <h1 class="page-title">Что-то сломалось</h1>
      <p class="page-sub">
        В Лагере случилась ошибка. Игра сохранена до последнего действия, с ней всё в порядке. Перезапусти приложение. Если ошибка повторяется,
        сообщи о ней на GitHub: отчёт уже будет вставлен, останется написать, что ты делал.
      </p>
      <div class="btns btns-col">
        <button class="btn btn-gold" onClick={() => location.reload()}>
          Перезапустить
        </button>
        <button class="btn btn-ghost" onClick={() => window.open(newIssueUrl(report), '_blank', 'noopener,noreferrer')}>
          Сообщить о проблеме
        </button>
        <button class="btn btn-ghost" onClick={copy}>
          {copied ? 'Отчёт скопирован' : 'Скопировать отчёт'}
        </button>
        <button class="btn btn-ghost" onClick={downloadSave}>
          Скачать копию игры
        </button>
      </div>
      <details class="report">
        <summary>Что в отчёте</summary>
        <textarea ref={area} class="input" readOnly rows={8} value={report} />
      </details>
    </div>
  );
}
