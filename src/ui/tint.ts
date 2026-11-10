// Плащ героя в цвет похода. Плащ снят отдельным белым слоем (Sprite.cape): слой умножается на цвет
// и кладётся поверх картинки фигуры. Готовая картинка одна, поэтому магия, тени и нажатия работают как раньше.
import { assetUrl, type Sprite } from '../scene/scene';

/** Готовые картинки по файлу и цвету. null: перекрасить не вышло, остаётся обычная картинка. */
const ready = new Map<string, string | null>();
const pending = new Map<string, Promise<string | null>>();

const keyOf = (s: Sprite, color: string) => `${s.file}|${color}`;

function load(file: string): Promise<HTMLImageElement> {
  return new Promise((ok, fail) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => ok(img);
    img.onerror = () => fail(new Error(file));
    img.src = assetUrl(file);
  });
}

/** Перекрашенная картинка, если она уже готова. */
export function tintedNow(s: Sprite, color: string): string | null {
  return ready.get(keyOf(s, color)) ?? null;
}

/** Адрес картинки фигуры с плащом цвета color («#rrggbb»). null, если у фигуры нет плаща или холст недоступен. */
export function tinted(s: Sprite, color: string): Promise<string | null> {
  const key = keyOf(s, color);
  if (ready.has(key)) return Promise.resolve(ready.get(key) ?? null);
  let p = pending.get(key);
  if (!p) {
    p = paint(s, color)
      .catch(() => null)
      .then((url) => {
        ready.set(key, url);
        pending.delete(key);
        return url;
      });
    pending.set(key, p);
  }
  return p;
}

async function paint(s: Sprite, color: string): Promise<string | null> {
  const cape = s.cape;
  if (!cape || typeof document === 'undefined') return null;
  const [base, layer] = await Promise.all([load(s.file), load(cape.file)]);
  const c = document.createElement('canvas');
  c.width = base.naturalWidth;
  c.height = base.naturalHeight;
  const g = c.getContext('2d');
  const t = document.createElement('canvas');
  t.width = layer.naturalWidth;
  t.height = layer.naturalHeight;
  const tg = t.getContext('2d');
  if (!g || !tg || !c.width || !t.width) return null;
  // Цвет, умноженный на свет и тени слоя, и только там, где сам плащ.
  tg.fillStyle = color;
  tg.fillRect(0, 0, t.width, t.height);
  tg.globalCompositeOperation = 'multiply';
  tg.drawImage(layer, 0, 0);
  tg.globalCompositeOperation = 'destination-in';
  tg.drawImage(layer, 0, 0);
  g.drawImage(base, 0, 0);
  g.drawImage(t, cape.x - s.x, cape.y - s.y);
  const blob = await new Promise<Blob | null>((ok) => c.toBlob(ok, 'image/png'));
  return blob ? URL.createObjectURL(blob) : null;
}
