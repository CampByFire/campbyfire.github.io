import { describe, expect, it } from 'vitest';
import { dragHeight, snapUp } from '../src/ui/shade';

describe('шторка задач дня', () => {
  it('идёт за пальцем, а за краями туго', () => {
    expect(dragHeight(300, -100, 300, 700)).toBe(400);
    expect(dragHeight(300, -460, 300, 700)).toBe(720);
    expect(dragHeight(300, 30, 300, 700)).toBe(290);
  });

  it('отпущенная встаёт к ближайшему положению', () => {
    expect(snapUp(520, 0, 300, 700)).toBe(true);
    expect(snapUp(480, 0, 300, 700)).toBe(false);
  });

  it('взмах решает сам, даже с полпути', () => {
    expect(snapUp(320, -1, 300, 700)).toBe(true);
    expect(snapUp(680, 1, 300, 700)).toBe(false);
  });
});
