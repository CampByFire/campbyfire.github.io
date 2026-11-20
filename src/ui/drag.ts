// Перетаскивание дел на шкале дня, как в календаре телефона. Мышью дело берётся сразу, как только
// его сдвинули; пальцем после долгого нажатия (DRAG_HOLD_MS), а короткое движение пальцем листает шкалу.
// Пока дело в руке, шкала сама едет у верхнего и нижнего края. Время встаёт на шаг DRAG_STEP_MIN.
import { useEffect, useRef, useState } from 'preact/hooks';
import { dropStart, type Slot } from '../game/calendar';
import { DRAG_HOLD_MS } from '../game/rules';

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

interface Gesture {
  slot: Slot;
  len: number;
  pointer: number;
  touch: boolean;
  x0: number;
  y0: number;
  y: number;
  scroll0: number;
  active: boolean;
  timer: number;
  frame: number;
  start: number;
}

export interface TimelineDrag {
  /** Какое дело сейчас в руке и с какой минуты оно встанет. */
  held: { slot: Slot; start: number } | null;
  onPointerDown(e: PointerEvent, slot: Slot): void;
  /** Ловит щелчок, который браузер шлёт после перетаскивания, чтобы он не открыл лист. */
  onClickCapture(e: MouseEvent): void;
  /** Только что закончили перетаскивание: смахивание вбок не листает день. */
  justDropped(): boolean;
}

export function useTimelineDrag(box: { current: HTMLElement | null }, hourPx: number, onDrop: (slot: Slot, start: number) => void): TimelineDrag {
  const [held, setHeld] = useState<{ slot: Slot; start: number } | null>(null);
  const g = useRef<Gesture | null>(null);
  const dropped = useRef(0);
  const drop = useRef(onDrop);
  drop.current = onDrop;
  const stop = useRef<() => void>(() => {});

  useEffect(() => () => stop.current(), []);

  const place = (x: Gesture) => {
    const el = box.current;
    const dy = x.y - x.y0 + (el ? el.scrollTop - x.scroll0 : 0);
    const start = dropStart(x.slot.start + (dy / hourPx) * 60, x.len);
    if (start !== x.start) {
      x.start = start;
      setHeld({ slot: x.slot, start });
    }
  };

  const edgeScroll = () => {
    const x = g.current;
    const el = box.current;
    if (!x?.active || !el) return;
    const r = el.getBoundingClientRect();
    // Едет, только если к краю тянут: дело, взятое у самого края, не уезжает само.
    const v = x.y < r.top + EDGE && x.y < x.y0 - MOUSE_SLOP ? -EDGE_SPEED : x.y > r.bottom - EDGE && x.y > x.y0 + MOUSE_SLOP ? EDGE_SPEED : 0;
    if (v) {
      el.scrollTop += v;
      place(x);
    }
    x.frame = requestAnimationFrame(edgeScroll);
  };

  const activate = (x: Gesture) => {
    x.active = true;
    x.start = x.slot.start;
    setHeld({ slot: x.slot, start: x.slot.start });
    if (x.touch) navigator.vibrate?.(10);
    x.frame = requestAnimationFrame(edgeScroll);
  };

  const onPointerDown = (e: PointerEvent, slot: Slot) => {
    if (g.current || (e.pointerType === 'mouse' && e.button !== 0)) return;
    const touch = e.pointerType !== 'mouse';
    const x: Gesture = {
      slot,
      len: slot.end - slot.start,
      pointer: e.pointerId,
      touch,
      x0: e.clientX,
      y0: e.clientY,
      y: e.clientY,
      scroll0: box.current?.scrollTop ?? 0,
      active: false,
      timer: 0,
      frame: 0,
      start: slot.start,
    };
    g.current = x;
    if (touch) x.timer = window.setTimeout(() => g.current === x && activate(x), DRAG_HOLD_MS);

    const move = (ev: PointerEvent) => {
      if (ev.pointerId !== x.pointer) return;
      x.y = ev.clientY;
      if (!x.active) {
        const dist = Math.hypot(ev.clientX - x.x0, ev.clientY - x.y0);
        if (x.touch) {
          if (dist > TOUCH_SLOP) finish(false);
          return;
        }
        if (dist <= MOUSE_SLOP) return;
        activate(x);
      }
      place(x);
    };
    // Пока дело в руке, палец не листает шкалу и не тянет страницу.
    const holdTouch = (ev: TouchEvent) => {
      if (x.active && ev.cancelable) ev.preventDefault();
    };
    const up = (ev: PointerEvent) => ev.pointerId === x.pointer && finish(ev.type === 'pointerup');
    const finish = (commit: boolean) => {
      clearTimeout(x.timer);
      cancelAnimationFrame(x.frame);
      removeEventListener('pointermove', move);
      removeEventListener('pointerup', up);
      removeEventListener('pointercancel', up);
      removeEventListener('touchmove', holdTouch);
      if (g.current === x) g.current = null;
      stop.current = () => {};
      if (!x.active) return;
      dropped.current = Date.now();
      setHeld(null);
      if (commit && x.start !== x.slot.start) {
        try {
          drop.current(x.slot, x.start);
        } catch (err) {
          console.error(err);
        }
      }
    };
    stop.current = () => finish(false);
    addEventListener('pointermove', move);
    addEventListener('pointerup', up);
    addEventListener('pointercancel', up);
    addEventListener('touchmove', holdTouch, { passive: false });
  };

  const justDropped = () => Date.now() - dropped.current < 400;

  const onClickCapture = (e: MouseEvent) => {
    if (!justDropped()) return;
    e.preventDefault();
    e.stopPropagation();
  };

  return { held, onPointerDown, onClickCapture, justDropped };
}
