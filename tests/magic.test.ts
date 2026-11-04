import { describe, expect, it } from 'vitest';
import { resolveMotion, type Motion } from '../src/ui/magic/mode';

describe('сила магии', () => {
  it('пока в Настройках ничего не выбрано, решает система: при «Уменьшить движение» магия спокойная', () => {
    expect(resolveMotion(undefined, false)).toBe('full');
    expect(resolveMotion(undefined, true)).toBe('calm');
  });

  it('выбор в Настройках важнее системы', () => {
    expect(resolveMotion('full', true)).toBe('full');
    expect(resolveMotion('calm', false)).toBe('calm');
    expect(resolveMotion('off', false)).toBe('off');
  });

  it('непонятное значение в настройках устройства не ломает игру', () => {
    expect(resolveMotion('fast' as Motion, false)).toBe('full');
    expect(resolveMotion('fast' as Motion, true)).toBe('calm');
  });
});
