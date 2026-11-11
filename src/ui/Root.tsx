// Корень: игра, экран спасения сохранения или экран ошибки.
import { Component } from 'preact';
import type { Store } from '../game/store';
import type { Notes } from '../notes/notes';
import type { GoogleCalendar } from '../sync/gcal';
import type { Sync } from '../sync/sync';
import { App } from './App';
import { Crash, Recovery } from './Rescue';

interface Props {
  store: Store;
  sync: Sync;
  notes: Notes;
  google: GoogleCalendar;
}

/** Ошибка из кода Лагеря, а не из расширения браузера. */
function ours(e: Error, file = ''): boolean {
  return !/extension:\/\//.test(`${e.stack ?? ''} ${file}`);
}

export class Root extends Component<Props, { crash: unknown }> {
  state = { crash: null as unknown };
  private stopSync: (() => void) | null = null;
  private stopNotes: (() => void) | null = null;
  private stopGoogle: (() => void) | null = null;

  componentDidMount() {
    window.addEventListener('error', this.onError);
    window.addEventListener('unhandledrejection', this.onRejection);
    if (!this.props.store.problem) this.startSync();
  }

  componentWillUnmount() {
    window.removeEventListener('error', this.onError);
    window.removeEventListener('unhandledrejection', this.onRejection);
    this.stopSync?.();
    this.stopNotes?.();
    this.stopGoogle?.();
  }

  componentDidCatch(error: unknown) {
    this.setState({ crash: error ?? new Error('Неизвестная ошибка') });
  }

  // Ошибки в обработчиках нажатий мимо componentDidCatch проходят сюда. У ошибок вроде
  // «ResizeObserver loop» нет объекта ошибки: это не поломка, их пропускаем.
  private onError = (e: ErrorEvent) => {
    if (e.error instanceof Error && ours(e.error, e.filename)) this.setState({ crash: e.error });
  };

  private onRejection = (e: PromiseRejectionEvent) => {
    const r: unknown = e.reason;
    if (r instanceof Error && r.name !== 'AbortError' && ours(r)) this.setState({ crash: r });
  };

  private startSync = () => {
    this.stopSync ??= this.props.sync.start();
    this.stopNotes ??= this.props.notes.start();
    this.stopGoogle ??= this.props.google.start();
    this.forceUpdate();
  };

  render({ store, sync, notes, google }: Props, { crash }: { crash: unknown }) {
    if (crash) return <Crash error={crash} />;
    if (store.problem) return <Recovery store={store} sync={sync} onDone={this.startSync} />;
    return <App store={store} sync={sync} notes={notes} google={google} />;
  }
}
