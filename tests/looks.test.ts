// Облики героев: у задачи свой облик, и для каждого облика сняты все картинки с плащом.
import { describe, expect, it } from 'vitest';
import camp from '../src/scene/camp.json';
import { LOOKS, lookOf } from '../src/game/view';
import { heroKey } from '../src/scene/scene';

describe('облики героев', () => {
  it('облик задачи постоянный и бывает любым из пяти', () => {
    const seen = new Set<number>();
    for (let i = 1; i <= 30; i++) {
      const look = lookOf(`t${i}`);
      expect(look).toBe(lookOf(`t${i}`));
      expect(look).toBeGreaterThanOrEqual(0);
      expect(look).toBeLessThan(LOOKS);
      seen.add(look);
    }
    expect(seen.size).toBe(LOOKS);
  });

  it('каждый облик снят на каждом месте, и у него есть слой плаща', () => {
    const sprites = camp.sprites as Record<string, { file: string; cape?: { file: string } }>;
    const places: [string, string][] = [['ring', 'work'], ['ring', 'sit'], ['ring', 'cheer']];
    for (let i = 0; i < 6; i++) places.push([`seat${i}`, 'sit'], [`seat${i}`, 'lie']);
    const files = new Set<string>();
    for (const cls of ['rogue', 'barbarian', 'mage', 'knight']) {
      for (let look = 0; look < LOOKS; look++) {
        for (const [spot, pose] of places) {
          const s = sprites[heroKey(spot, cls, look, pose)];
          expect(s?.cape?.file, `${spot} ${cls} ${look} ${pose}`).toBeTruthy();
          files.add(s.file);
        }
      }
    }
    // Картинки обликов разные: запасной первый облик нигде не понадобился.
    expect(files.size).toBe(4 * LOOKS * places.length);
  });

  it('неснятый облик заменяется первым', () => {
    expect(heroKey('ring', 'mage', 7, 'work')).toBe('ring/mage/work');
  });
});
