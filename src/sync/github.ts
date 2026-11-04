// Сохранение в приватном репозитории GitHub (по умолчанию lager-data). Токену нужен доступ только
// к этому репозиторию и одно право: «Contents: Read and write».
//
// Раскладка репозитория:
//   game/save.json   сохранение Лагеря, его пишет игра
//   diary/…          место под дневник: игра туда не пишет и его не трогает
// Каждая запись игры это коммит, поэтому любую прошлую версию сохранения видно в истории.

/** Как называется репозиторий, который игра ищет по токену. */
export const REPO_NAME = 'lager-data';
/** Файл сохранения в репозитории. */
export const SAVE_PATH = 'game/save.json';
/** Папка под дневник: игра её не трогает, ни при записи, ни при удалении сохранения. */
export const DIARY_DIR = 'diary';

const API = 'https://api.github.com';

/** Создать приватный репозиторий: название и приватность уже выбраны. */
export const NEW_REPO_URL =
  'https://github.com/new?name=' +
  REPO_NAME +
  '&visibility=private&description=' +
  encodeURIComponent('Лагерь у костра: сохранение игры и дневник');

/**
 * Создать токен: название, срок и право «Contents: Read and write» уже выбраны. Какой репозиторий
 * токен видит, по ссылке выбрать нельзя: это игрок делает сам в «Repository access».
 */
export const TOKEN_URL =
  'https://github.com/settings/personal-access-tokens/new?name=' +
  encodeURIComponent('Лагерь у костра') +
  '&description=' +
  encodeURIComponent(`Сохранение игры в репозитории ${REPO_NAME}`) +
  '&expires_in=366&contents=write';

/** Список токенов: отсюда токен отзывают, если устройство потерялось. */
export const TOKENS_URL = 'https://github.com/settings/personal-access-tokens';

export const repoUrl = (repo: string) => `https://github.com/${repo}`;
/** История сохранений: все коммиты файла game/save.json. */
export const historyUrl = (repo: string, branch: string) => `https://github.com/${repo}/commits/${encodeURIComponent(branch)}/${SAVE_PATH}`;

/** stale: файл успели поменять с тех пор, как мы его прочитали, и GitHub запись не принял. */
export type GitHubErrorKind = 'auth' | 'access' | 'missing' | 'network' | 'stale' | 'other';

export class GitHubError extends Error {
  constructor(
    message: string,
    readonly kind: GitHubErrorKind,
  ) {
    super(message);
  }
}

export type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

/** Файл сохранения. stamp меняется при каждой записи: по нему видно, что сохранение обновили. */
export interface SaveDoc {
  app: 'taskcraft-lager';
  format: 1;
  stamp: string;
  savedAt: number;
  /** Откуда записано: «телефон» или «компьютер». */
  device: string;
  state: unknown;
}

export interface RepoInfo {
  /** owner/name */
  repo: string;
  branch: string;
}

interface RepoBody {
  full_name: string;
  name: string;
  private: boolean;
  default_branch?: string;
}

interface ContentBody {
  sha: string;
  content?: string;
  encoding?: string;
}

/** base64 из текста в UTF-8: btoa сам по себе кириллицу не умеет. */
export function toBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

export function fromBase64(b64: string): string {
  const bin = atob(b64.replace(/\s/g, ''));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

function parseDoc(text: string): SaveDoc {
  try {
    const doc = JSON.parse(text) as SaveDoc;
    if (doc?.app !== 'taskcraft-lager' || typeof doc.stamp !== 'string') throw new Error();
    return doc;
  } catch {
    throw new GitHubError('В GitHub повреждённое сохранение', 'other');
  }
}

export class GitHub {
  constructor(
    private token: string,
    private fetchFn: Fetch = (url, init) => fetch(url, init),
  ) {}

  private async call<T>(path: string, init: RequestInit = {}, on404: GitHubErrorKind = 'missing'): Promise<T> {
    return (await (await this.request(path, init, on404)).json()) as T;
  }

  private async request(path: string, init: RequestInit = {}, on404: GitHubErrorKind = 'missing', accept = 'application/vnd.github+json'): Promise<Response> {
    let res: Response;
    try {
      res = await this.fetchFn(`${API}${path}`, {
        ...init,
        cache: 'no-store',
        headers: {
          Authorization: `Bearer ${this.token}`,
          Accept: accept,
          'X-GitHub-Api-Version': '2022-11-28',
          ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        },
      });
    } catch {
      throw new GitHubError('Нет связи с GitHub', 'network');
    }
    if (res.ok) return res;
    if (res.status === 401) throw new GitHubError('GitHub не принял токен: он неверный или истёк', 'auth');
    if (res.status === 403 && res.headers.get('x-ratelimit-remaining') === '0') {
      throw new GitHubError('GitHub просит подождать: слишком много запросов', 'other');
    }
    // 409: файл поменялся после нашего чтения. 422 при записи: файл появился, а мы писали его как новый.
    if (res.status === 409 || (res.status === 422 && init.method === 'PUT')) {
      throw new GitHubError('Сохранение в GitHub успели обновить с другого устройства', 'stale');
    }
    if (res.status === 403 || (res.status === 404 && on404 === 'access')) {
      throw new GitHubError(`У токена нет доступа к репозиторию. Нужно право «Contents: Read and write» на ${REPO_NAME}`, 'access');
    }
    if (res.status === 404) throw new GitHubError('Не нашёл репозиторий с сохранением: возможно, его удалили или токен его больше не видит', on404);
    throw new GitHubError(`GitHub ответил ошибкой ${res.status}`, 'other');
  }

  /**
   * Имя владельца токена и день, когда токен перестанет работать, если GitHub его сообщил.
   * GitHub пишет срок в заголовке ответа, но браузер может его и не показать: тогда null.
   */
  async user(): Promise<{ login: string; expires: string | null }> {
    const res = await this.request('/user');
    const me = (await res.json()) as { login: string };
    const day = res.headers.get('github-authentication-token-expiration')?.match(/^\d{4}-\d{2}-\d{2}/);
    return { login: me.login, expires: day ? day[0] : null };
  }

  /** Репозиторий по имени owner/name. Публичный не годится: там будет и дневник. */
  async repo(repo: string): Promise<RepoInfo> {
    return this.checked(await this.call<RepoBody>(`/repos/${repo}`));
  }

  /**
   * Репозиторий для сохранения: lager-data владельца токена, иначе тот, что так называется среди
   * видимых токену, иначе единственный приватный, который токен видит.
   */
  async findRepo(login: string): Promise<RepoInfo> {
    try {
      return await this.repo(`${login}/${REPO_NAME}`);
    } catch (e) {
      if (!(e instanceof GitHubError && e.kind === 'missing')) throw e;
    }
    const list = await this.call<RepoBody[]>('/user/repos?per_page=100&sort=updated', {}, 'access');
    const named = list.find((r) => r.name === REPO_NAME);
    if (named) return this.checked(named);
    const own = list.filter((r) => r.private);
    if (own.length === 1) return this.checked(own[0]);
    throw new GitHubError(
      `Токен не видит репозиторий ${REPO_NAME}. Создай его, если его ещё нет, а при создании токена в «Repository access» выбери «Only select repositories» и ${REPO_NAME}`,
      'missing',
    );
  }

  private checked(r: RepoBody): RepoInfo {
    if (!r.private) {
      throw new GitHubError(`Репозиторий ${r.full_name} публичный, а сохранение и дневник должны быть видны только тебе. Сделай его приватным в настройках репозитория`, 'access');
    }
    return { repo: r.full_name, branch: r.default_branch || 'main' };
  }

  /** Сохранение из репозитория и sha его версии; doc и sha null, если файла ещё нет. */
  async read(repo: string): Promise<{ doc: SaveDoc | null; sha: string | null }> {
    let body: ContentBody;
    try {
      body = await this.call<ContentBody>(`/repos/${repo}/contents/${SAVE_PATH}`);
    } catch (e) {
      // В пустом репозитории и в репозитории без сохранения GitHub отвечает 404. Если пропал сам
      // репозиторий, это скажет запись.
      if (e instanceof GitHubError && e.kind === 'missing') return { doc: null, sha: null };
      throw e;
    }
    let text: string;
    if (body.encoding === 'base64' && body.content) {
      text = fromBase64(body.content);
    } else {
      // Файл больше 1 МБ GitHub отдаёт без содержимого: тогда берём его целиком отдельно.
      const res = await this.request(`/repos/${repo}/contents/${SAVE_PATH}`, {}, 'missing', 'application/vnd.github.raw+json');
      text = await res.text();
    }
    return { doc: parseDoc(text), sha: body.sha };
  }

  /**
   * Пишет сохранение и возвращает sha новой версии. sha это версия, которую мы прочитали (null,
   * если файла не было): если с тех пор файл поменялся, GitHub запись не примет (ошибка stale).
   */
  async write(repo: string, doc: SaveDoc, sha: string | null, message: string): Promise<string> {
    const res = await this.call<{ content: { sha: string } }>(`/repos/${repo}/contents/${SAVE_PATH}`, {
      method: 'PUT',
      body: JSON.stringify({ message, content: toBase64(JSON.stringify(doc)), ...(sha ? { sha } : {}) }),
    });
    return res.content.sha;
  }

  /** Удаляет только файл сохранения; репозиторий и дневник остаются. Уже удалённый файл не ошибка. */
  async remove(repo: string, message: string): Promise<void> {
    for (let attempt = 0; attempt < 3; attempt++) {
      const sha = await this.sha(repo);
      if (!sha) return;
      try {
        await this.request(`/repos/${repo}/contents/${SAVE_PATH}`, { method: 'DELETE', body: JSON.stringify({ message, sha }) });
        return;
      } catch (e) {
        if (e instanceof GitHubError && e.kind === 'missing') return;
        if (!(e instanceof GitHubError && e.kind === 'stale')) throw e;
      }
    }
    throw new GitHubError('Сохранение в GitHub всё время меняется с другого устройства, удалить не получилось', 'other');
  }

  /** sha файла сохранения (null, если его нет), даже если его содержимое не читается. */
  private async sha(repo: string): Promise<string | null> {
    try {
      return (await this.call<ContentBody>(`/repos/${repo}/contents/${SAVE_PATH}`)).sha;
    } catch (e) {
      if (e instanceof GitHubError && e.kind === 'missing') return null;
      throw e;
    }
  }
}
