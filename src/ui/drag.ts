// Перетаскивание в Плане и Календаре. Короткое движение пальцем листает экран.
import { useEffect, useRef, useState } from 'preact/hooks';
import { dropStart } from '../game/calendar';
import { CALENDAR_DRAG_HOLD_MS, DRAG_HOLD_MS } from '../game/rules';
import type { DayKey } from '../game/types';

/** Сдвиг мышью, после которого нажатие считается перетаскиванием, а не щелчком. */
const MOUSE_SLOP = 5;
/** Сдвиг пальцем до долгого нажатия: дальше это прокрутка, а не перетаскивание. */
const TOUCH_SLOP = 8;
/** У края шкалы ближе стольких пикселей она едет сама. */
const EDGE = 40;
const EDGE_SPEED = 8;

/** Порядок в Плане: короткое движение листает страницу, удержание берёт строку. */
export function usePlanDrag(box: { current: HTMLElement | null }, onDrop: (from: string, to: string) => void) {
  const [held, setHeld] = useState<string | null>(null);
  const [target, setTarget] = useState<string | null>(null);
  const stop = useRef<() => void>(() => {});
  const dropped = useRef(0);
  const drop = useRef(onDrop);
  drop.current = onDrop;
  useEffect(() => () => stop.current(), []);

  const onPointerDown = (e: PointerEvent, id: string) => {
    if (!e.isPrimary || e.button !== 0) return;
    stop.current();
    const touch = e.pointerType !== 'mouse';
    const scroller = box.current?.closest<HTMLElement>('.page');
    let active = false;
    let timer = 0;
    let frame = 0;
    let x = e.clientX;
    let y = e.clientY;
    let over = id;
    const locate = () => {
      const rows = box.current?.querySelectorAll<HTMLElement>('[data-plan-task]');
      if (!rows?.length || !scroller) return;
      const bounds = scroller.getBoundingClientRect();
      if (x < bounds.left || x > bounds.right || y < bounds.top || y > bounds.bottom) return;
      let nearest = Infinity;
      for (const row of rows) {
        const r = row.getBoundingClientRect();
        const distance = Math.abs(y - (r.top + r.bottom) / 2);
        if (distance < nearest) {
          nearest = distance;
          over = row.dataset.planTask!;
        }
      }
      setTarget(over);
    };
    const edge = () => {
      if (!active || !scroller) return;
      const r = scroller.getBoundingClientRect();
      const v = y < r.top + EDGE && y < e.clientY - MOUSE_SLOP ? -EDGE_SPEED : y > r.bottom - EDGE && y > e.clientY + MOUSE_SLOP ? EDGE_SPEED : 0;
      if (v) { scroller.scrollTop += v; locate(); }
      frame = requestAnimationFrame(edge);
    };
    const activate = () => {
      active = true;
      setHeld(id);
      setTarget(id);
      if (touch) navigator.vibrate?.(10);
      frame = requestAnimationFrame(edge);
    };
    const move = (ev: PointerEvent) => {
      if (ev.pointerId !== e.pointerId) return;
      x = ev.clientX;
      y = ev.clientY;
      if (!active) {
        const dist = Math.hypot(x - e.clientX, y - e.clientY);
        if (touch) {
          if (dist > TOUCH_SLOP) finish(false);
          return;
        }
        if (dist <= MOUSE_SLOP) return;
        activate();
      }
      locate();
    };
    const holdTouch = (ev: TouchEvent) => { if (active && ev.cancelable) ev.preventDefault(); };
    const up = (ev: PointerEvent) => { if (ev.pointerId === e.pointerId) finish(ev.type === 'pointerup'); };
    const key = (ev: KeyboardEvent) => { if (ev.key === 'Escape') { ev.preventDefault(); finish(false); } };
    const finish = (commit: boolean) => {
      clearTimeout(timer);
      cancelAnimationFrame(frame);
      removeEventListener('pointermove', move);
      removeEventListener('pointerup', up);
      removeEventListener('pointercancel', up);
      removeEventListener('touchmove', holdTouch);
      removeEventListener('keydown', key);
      stop.current = () => {};
      if (!active) return;
      dropped.current = Date.now();
      setHeld(null);
      setTarget(null);
      const r = scroller?.getBoundingClientRect();
      if (commit && over !== id && r && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) drop.current(id, over);
    };
    stop.current = () => finish(false);
    if (touch) timer = window.setTimeout(activate, DRAG_HOLD_MS);
    addEventListener('pointermove', move);
    addEventListener('pointerup', up);
    addEventListener('pointercancel', up);
    addEventListener('touchmove', holdTouch, { passive: false });
    addEventListener('keydown', key);
  };
  const onClickCapture = (e: MouseEvent) => {
    if (Date.now() - dropped.current >= 400) return;
    e.preventDefault();
    e.stopPropagation();
  };
  return { held, target, onPointerDown, onClickCapture };
}

export function useCalendarDrag<T>(
  scroller: { current: HTMLElement | null },
  onDrop: (item: T, to: { day: DayKey } | { start: number }) => void,
) {
  const [held, setHeld] = useState<{ item: T; day?: DayKey; start?: number } | null>(null);
  const dropped = useRef(0);
  const drop = useRef(onDrop);
  drop.current = onDrop;
  const stop = useRef<(() => void) | null>(null);
  useEffect(() => () => stop.current?.(), []);

  const onPointerDown = (e: PointerEvent, item: T, slot?: { start: number; end: number; hourPx: number }) => {
    if (stop.current || !e.isPrimary || e.button !== 0) return;
    const touch = e.pointerType !== 'mouse';
    const source = e.currentTarget as HTMLElement;
    const page = source.closest('.page');
    const box = scroller.current;
    const scroll0 = box?.scrollTop ?? 0;
    let active = false;
    let frame = 0;
    let x = e.clientX;
    let y = e.clientY;
    let moved = false;
    const targetAt = () => document.elementFromPoint(x, y);
    const destination = () => {
      const over = targetAt();
      const target = over?.closest<HTMLElement>('[data-calendar-target]');
      if (target && page?.contains(target)) return { day: target.dataset.calendarTarget! };
      if (slot && moved && over && box?.contains(over)) {
        const dy = y - e.clientY + box.scrollTop - scroll0;
        if (Math.abs(dy) > MOUSE_SLOP) return { start: dropStart(slot.start + (dy / slot.hourPx) * 60, slot.end - slot.start) };
      }
      return {};
    };
    let shown: { day?: DayKey; start?: number } = {};
    const locate = () => {
      const next = destination();
      if (next.day === shown.day && next.start === shown.start) return;
      shown = next;
      setHeld({ item, ...next });
    };
    const edgeScroll = () => {
      if (box && moved && box.contains(targetAt())) {
        const r = box.getBoundingClientRect();
        const v = y < r.top + EDGE && y < e.clientY - MOUSE_SLOP ? -EDGE_SPEED : y > r.bottom - EDGE && y > e.clientY + MOUSE_SLOP ? EDGE_SPEED : 0;
        if (v) {
          box.scrollTop += v;
          locate();
        }
      }
      frame = requestAnimationFrame(edgeScroll);
    };
    const move = (ev: PointerEvent) => {
      if (ev.pointerId !== e.pointerId) return;
      x = ev.clientX;
      y = ev.clientY;
      moved ||= Math.hypot(x - e.clientX, y - e.clientY) > (active || !touch ? MOUSE_SLOP : TOUCH_SLOP);
      if (!active) {
        if (moved) finish(false);
        return;
      }
      locate();
    };
    const holdTouch = (ev: TouchEvent) => {
      if (active && ev.cancelable) ev.preventDefault();
    };
    const up = (ev: PointerEvent) => {
      if (ev.pointerId !== e.pointerId) return;
      x = ev.clientX;
      y = ev.clientY;
      finish(ev.type === 'pointerup');
    };
    const key = (ev: KeyboardEvent) => {
      if (ev.key !== 'Escape') return;
      ev.preventDefault();
      finish(false);
    };
    const finish = (commit: boolean) => {
      clearTimeout(timer);
      cancelAnimationFrame(frame);
      removeEventListener('pointermove', move);
      removeEventListener('pointerup', up);
      removeEventListener('pointercancel', up);
      removeEventListener('touchmove', holdTouch);
      removeEventListener('keydown', key);
      removeEventListener('blur', cancel);
      stop.current = null;
      if (!active && (touch || !moved)) return;
      dropped.current = Date.now();
      if (!active) return;
      setHeld(null);
      if (!commit || !moved) return;
      const next = destination();
      try {
        if (next.day !== undefined) drop.current(item, { day: next.day });
        else if (next.start !== undefined && next.start !== slot?.start) drop.current(item, { start: next.start });
      } catch (err) {
        console.error(err);
      }
    };
    const cancel = () => finish(false);
    stop.current = cancel;
    const timer = window.setTimeout(() => {
      active = true;
      setHeld({ item });
      if (touch) navigator.vibrate?.(10);
      frame = requestAnimationFrame(edgeScroll);
    }, CALENDAR_DRAG_HOLD_MS);
    addEventListener('pointermove', move);
    addEventListener('pointerup', up);
    addEventListener('pointercancel', up);
    addEventListener('touchmove', holdTouch, { passive: false });
    addEventListener('keydown', key);
    addEventListener('blur', cancel);
  };

  const justDropped = () => Date.now() - dropped.current < 400;

  const onClickCapture = (e: MouseEvent) => {
    if (!e.detail || !justDropped()) return;
    e.preventDefault();
    e.stopPropagation();
  };

  return { held, onPointerDown, onClickCapture, justDropped, resetClick: () => { dropped.current = 0; } };
}
