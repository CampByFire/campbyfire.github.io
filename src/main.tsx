import '@fontsource/philosopher/400.css';
import '@fontsource/philosopher/700.css';
import '@fontsource/alegreya-sans/400.css';
import '@fontsource/alegreya-sans/500.css';
import '@fontsource/alegreya-sans/700.css';
import '@fontsource/alegreya-sans/800.css';
import './ui/styles.css';
import './ui/magic/magic.css';
import './ui/notes.css';
import { render } from 'preact';
import { Store } from './game/store';
import { Notes } from './notes/notes';
import { Sync } from './sync/sync';
import { askPersistentStorage, registerServiceWorker } from './ui/pwa';
import { blockTouchMenu } from './ui/noselect';
import { Root } from './ui/Root';

blockTouchMenu();

const store = new Store();
const sync = new Sync(store);
const notes = new Notes(sync);
render(<Root store={store} sync={sync} notes={notes} />, document.getElementById('app')!);

if (import.meta.env.PROD) {
  registerServiceWorker();
  askPersistentStorage();
}
