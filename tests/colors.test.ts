import { describe, expect, it } from 'vitest';
import { NO_COLOR_HEX, PRESET_HEX, colorName, contrast, hexToHsl, hslToHex, inkOn, isDark, parseHex, questHex, toQuestColor } from '../src/game/color';
import { mergeGames } from '../src/game/merge';
import { addQuest, addTask, newState, updateQuest } from '../src/game/state';
import { checkSave } from '../src/game/store';
import type { QuestColor, State } from '../src/game/types';
import { campView } from '../src/game/view';

// Пятница, 23 октября 2026.
const at = (h: number, m = 0, d = 23) => new Date(2026, 9, d, h, m).getTime();

const channels = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

describe('цвет знамени', () => {
  it('код цвета читается с решёткой и без, из шести знаков и из трёх, любыми буквами', () => {
    expect(parseHex('#4F7BE0')).toBe('#4f7be0');
    expect(parseHex(' 4f7be0 ')).toBe('#4f7be0');
    expect(parseHex('#4af')).toBe('#44aaff');
    for (const bad of ['', '#', '#12', '#12345', '#1234567', 'zz', '#ggg000', 'red']) expect(parseHex(bad), bad).toBeNull();
  });

  it('знамя рисуется готовым цветом или своим, а цвет, которого игра не знает, без цвета', () => {
    expect(questHex('blue')).toBe(PRESET_HEX.blue);
    expect(questHex('#1A237E')).toBe('#1a237e');
    expect(questHex('teal' as QuestColor)).toBe(NO_COLOR_HEX);
    expect(questHex(undefined)).toBe(NO_COLOR_HEX);
  });

  it('свой цвет, совпавший с готовым, сохраняется готовым: его узнают и прежние версии', () => {
    expect(toQuestColor(PRESET_HEX.green)).toBe('green');
    expect(toQuestColor('#1a237e')).toBe('#1a237e');
  });

  it('ползунки оттенка, насыщенности и яркости дают код цвета и встают по нему', () => {
    expect(hslToHex({ h: 0, s: 100, l: 50 })).toBe('#ff0000');
    expect(hslToHex({ h: 120, s: 100, l: 50 })).toBe('#00ff00');
    expect(hslToHex({ h: 240, s: 100, l: 50 })).toBe('#0000ff');
    expect(hslToHex({ h: 200, s: 0, l: 100 })).toBe('#ffffff');
    expect(hslToHex({ h: 200, s: 70, l: 0 })).toBe('#000000');
    expect(hexToHsl('#ff0000')).toEqual({ h: 0, s: 100, l: 50 });
    expect(hexToHsl('#808080')).toEqual({ h: 0, s: 0, l: 50 });
    // Ползунки целые, поэтому код после них может чуть разойтись с введённым, но цвет тот же на глаз.
    for (let i = 0; i < 4096; i += 7) {
      const hex = `#${[...i.toString(16).padStart(3, '0')].map((c) => c + c).join('')}`;
      const back = channels(hslToHex(hexToHsl(hex)));
      channels(hex).forEach((c, k) => expect(Math.abs(c - back[k]), hex).toBeLessThanOrEqual(3));
    }
  });

  it('цифра на номере в цвете похода читается на любом цвете', () => {
    for (let i = 0; i < 4096; i++) {
      const hex = `#${[...i.toString(16).padStart(3, '0')].map((c) => c + c).join('')}`;
      expect(contrast(hex, inkOn(hex)), hex).toBeGreaterThanOrEqual(4.5);
    }
    // На светлом знамени цифра тёмная, как на золотых номерах, на тёмном светлая.
    expect(inkOn(PRESET_HEX.yellow)).toBe('#2a1d10');
    expect(inkOn('#1a237e')).toBe('#fbf3e2');
  });

  it('тёмному знамени нужна обводка, готовым нет', () => {
    expect(isDark('#1a237e')).toBe(true);
    for (const hex of Object.values(PRESET_HEX)) expect(isDark(hex), hex).toBe(false);
  });

  it('диктор называет свой цвет словами', () => {
    expect(colorName('#000000')).toBe('чёрный');
    expect(colorName('#ffffff')).toBe('белый');
    expect(colorName('#808080')).toBe('серый');
    expect(colorName(PRESET_HEX.blue)).toBe('синий');
    expect(colorName('#1a237e')).toBe('тёмно-синий');
    expect(colorName(PRESET_HEX.brown)).toBe('коричневый');
    expect(colorName('#ffc0cb')).toBe('розовый');
    expect(colorName('#87ceeb')).toBe('светло-голубой');
  });
});

describe('свой цвет в игре', () => {
  it('поход хранит свой цвет, а сохранение остаётся формата 3', () => {
    const s = newState(at(8));
    const id = addQuest(s, at(8), { name: 'Сертификат', kind: 'work', color: '#2bb3a3' });
    updateQuest(s, s.quests[0].id, { color: '#1a237e' });
    const back = checkSave(JSON.parse(JSON.stringify(s)))!;
    expect(back.v).toBe(3);
    expect(back.quests.find((q) => q.id === id)?.color).toBe('#2bb3a3');
    expect(back.quests[0].color).toBe('#1a237e');
  });

  it('номера над спутниками в цвете похода, у задачи без похода номер прежний', () => {
    const s = newState(at(8));
    const cert = addQuest(s, at(8), { name: 'Сертификат', kind: 'work', color: '#2bb3a3' });
    const a = addTask(s, at(8), { title: 'Модуль', questId: cert, day: s.day });
    const b = addTask(s, at(8), { title: 'Отчёт', questId: s.quests[0].id, day: s.day });
    const c = addTask(s, at(8), { title: 'Без похода', questId: null, day: s.day });
    const v = campView(s, at(9));
    expect(v.colors.get(a)).toBe('#2bb3a3');
    expect(v.colors.get(b)).toBe(PRESET_HEX.blue);
    expect(v.colors.has(c)).toBe(false);
  });

  it('свой цвет похода с другого устройства сливается, как любое поле похода', () => {
    const base = newState(at(8));
    const local = JSON.parse(JSON.stringify(base)) as State;
    const remote = JSON.parse(JSON.stringify(base)) as State;
    const q = base.quests[0].id;
    local.touchedAt = at(9);
    updateQuest(local, q, { name: 'Работа и учёба' });
    remote.touchedAt = at(10);
    updateQuest(remote, q, { color: '#1a237e' });
    const m = mergeGames(base, local, remote, at(10, 5));
    expect(m.quests.find((x) => x.id === q)).toMatchObject({ name: 'Работа и учёба', color: '#1a237e' });
  });
});
