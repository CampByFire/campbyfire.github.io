import '@fontsource/alegreya/700.css';
import '@fontsource/alegreya-sc/700.css';
import '@fontsource/alegreya-sans/400.css';
import '@fontsource/alegreya-sans/500.css';
import '@fontsource/alegreya-sans/700.css';
import '@fontsource/alegreya-sans/800.css';
import './ui/styles.css';
import './ui/magic/magic.css';
import { render } from 'preact';
import { Store } from './game/store';
import { Sync } from './sync/sync';
import { askPersistentStorage, registerServiceWorker } from './ui/pwa';
import { Root } from './ui/Root';

const store = new Store();
const sync = new Sync(store);
render(<Root store={store} sync={sync} />, document.getElementById('app')!);

if (import.meta.env.PROD) {
  registerServiceWorker();
  askPersistentStorage();
}
