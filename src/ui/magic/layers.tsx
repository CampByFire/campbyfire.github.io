// Слои магии поверх приложения и лист, который уезжает после закрытия.
import { Component, type ComponentChildren } from 'preact';
import { useLayoutEffect, useRef } from 'preact/hooks';
import { mountMagic } from './engine';
import { sheetOpened, tap } from './spells';

/**
 * Притушение для чуда, слой эффектов, холст частиц и слой касаний. Касаний они не ловят
 * и экранному диктору не видны: всё, что сообщает магия, уже сказано числом или сообщением.
 */
export function MagicLayers() {
  const dim = useRef<HTMLDivElement>(null);
  const fx = useRef<HTMLDivElement>(null);
  const touch = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  useLayoutEffect(() => {
    const app = dim.current?.parentElement;
    if (!app || !dim.current || !fx.current || !touch.current || !canvas.current) return;
    return mountMagic(app, { dim: dim.current, fx: fx.current, touch: touch.current, canvas: canvas.current }, tap);
  }, []);
  return (
    <>
      <div class="fx-dim" aria-hidden="true" ref={dim} />
      <div class="fx-layer" aria-hidden="true" ref={fx} />
      <canvas class="fx-canvas" aria-hidden="true" ref={canvas} />
      <div class="fx-touch" aria-hidden="true" ref={touch} />
    </>
  );
}

/**
 * Лист на время закрытия: он ещё уезжает вниз, но уже ничего не ловит, ни пальца, ни фокуса,
 * ни экранного диктора. Содержимое замирает: задачу могли удалить, и лист не должен перерисоваться без неё.
 */
export class SheetLayer extends Component<{ closing: boolean; children: ComponentChildren }> {
  componentDidMount() {
    sheetOpened(this.base as Element);
  }

  shouldComponentUpdate(next: { closing: boolean }) {
    if (next.closing && !this.props.closing) this.freeze();
    return !next.closing;
  }

  private freeze() {
    const layer = this.base as HTMLElement | undefined;
    if (!layer) return;
    layer.classList.add('is-closing');
    for (const el of [layer, layer.firstElementChild]) {
      if (!(el instanceof HTMLElement)) continue;
      el.inert = true;
      el.setAttribute('aria-hidden', 'true');
    }
  }

  render() {
    return <div class="sheet-layer">{this.props.children}</div>;
  }
}
