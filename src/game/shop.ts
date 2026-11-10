// Лавка: награды, которые игрок заводит сам и покупает за золото. Правила как функции над State,
// как в state.ts: меняют переданное состояние на месте, DOM здесь нет.
import { PACE_DAYS, PACE_MIN_DAYS, PRIZE_PRICE_MAX, PRIZE_PRICE_MIN, PRIZE_PRICE_STEP, PRIZE_TITLE_MAX } from './rules';
import { nextId } from './state';
import type { DayKey, Prize, Purchase, State } from './types';

export function prizesOf(s: State): Prize[] {
  return s.prizes ?? [];
}

export function purchasesOf(s: State): Purchase[] {
  return s.purchases ?? [];
}

export function findPrize(s: State, id: string | null | undefined): Prize | undefined {
  return id ? prizesOf(s).find((p) => p.id === id) : undefined;
}

/** Пустые списки и цель без награды в сохранение не идут: у того, кто лавкой не пользуется, оно прежнее. */
export function tidyShop(s: State): void {
  if (s.prizes && !s.prizes.length) delete s.prizes;
  if (s.purchases && !s.purchases.length) delete s.purchases;
  if (s.goalId !== undefined && !findPrize(s, s.goalId)) delete s.goalId;
}

/** Цена как её примет лавка: целая, кратная шагу, в своих границах. Не число: null. */
export function cleanPrice(price: number): number | null {
  if (!Number.isFinite(price)) return null;
  const stepped = Math.round(price / PRIZE_PRICE_STEP) * PRIZE_PRICE_STEP;
  return Math.max(PRIZE_PRICE_MIN, Math.min(PRIZE_PRICE_MAX, stepped));
}

const cleanTitle = (title: string) => title.trim().replace(/\s+/g, ' ').slice(0, PRIZE_TITLE_MAX);

export interface PrizeInput {
  title: string;
  price: number;
}

/** Новая награда встаёт в конец полки. Без названия или цены ничего не заводится: вернётся null. */
export function addPrize(s: State, now: number, input: PrizeInput): string | null {
  const title = cleanTitle(input.title);
  const price = cleanPrice(input.price);
  if (!title || price === null) return null;
  const prize: Prize = { id: nextId(s, 'z'), title, price, createdAt: now };
  (s.prizes ??= []).push(prize);
  return prize.id;
}

/** Правка награды. Прошлые покупки остаются с прежним названием и ценой. */
export function updatePrize(s: State, id: string, input: PrizeInput): boolean {
  const p = findPrize(s, id);
  const title = cleanTitle(input.title);
  const price = cleanPrice(input.price);
  if (!p || !title || price === null) return false;
  p.title = title;
  p.price = price;
  return true;
}

/** Что убрали с полки и откуда: по этому «Вернуть» ставит награду на место. */
export interface RemovedPrize {
  prize: Prize;
  index: number;
  wasGoal: boolean;
}

/** Убрать награду с полки. Покупки остаются в истории, золото не меняется. */
export function removePrize(s: State, id: string): RemovedPrize | null {
  const list = prizesOf(s);
  const index = list.findIndex((p) => p.id === id);
  if (index < 0) return null;
  const [prize] = list.splice(index, 1);
  const wasGoal = s.goalId === id;
  tidyShop(s);
  return { prize, index, wasGoal };
}

export function restorePrize(s: State, was: RemovedPrize): void {
  if (findPrize(s, was.prize.id)) return;
  const list = (s.prizes ??= []);
  list.splice(Math.min(was.index, list.length), 0, was.prize);
  if (was.wasGoal && s.goalId === undefined) s.goalId = was.prize.id;
}

/** Выше или ниже на полке. */
export function movePrize(s: State, id: string, dir: -1 | 1): void {
  const list = prizesOf(s);
  const i = list.findIndex((p) => p.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= list.length) return;
  [list[i], list[j]] = [list[j], list[i]];
}

/** Копить на эту награду; null снимает цель. Цель одна. */
export function setGoal(s: State, id: string | null): void {
  if (id && findPrize(s, id)) s.goalId = id;
  else delete s.goalId;
}

export function goalOf(s: State): Prize | undefined {
  return findPrize(s, s.goalId);
}

export function canBuy(s: State, p: Prize): boolean {
  return s.hero.gold >= p.price;
}

/** Сколько золота не хватает до награды; 0, если хватает. */
export function shortOf(s: State, p: Prize): number {
  return Math.max(0, p.price - s.hero.gold);
}

/**
 * Купить награду: золото уходит, покупка ложится в историю. Не хватает золота или награды нет: null,
 * ничего не меняется. Купленная цель перестаёт быть целью: на неё уже накопили.
 */
export function buyPrize(s: State, now: number, id: string): Purchase | null {
  const p = findPrize(s, id);
  if (!p || !canBuy(s, p)) return null;
  s.hero.gold -= p.price;
  const bought: Purchase = { id: nextId(s, 'b'), prizeId: p.id, title: p.title, price: p.price, at: now, day: s.day };
  (s.purchases ??= []).push(bought);
  if (s.goalId === p.id) delete s.goalId;
  return bought;
}

/** Вернуть покупку: золото возвращается, запись уходит из истории. wasGoal: награда снова становится целью. */
export function refund(s: State, purchaseId: string, wasGoal = false): boolean {
  const list = purchasesOf(s);
  const i = list.findIndex((b) => b.id === purchaseId);
  if (i < 0) return false;
  const [b] = list.splice(i, 1);
  s.hero.gold += b.price;
  if (wasGoal && s.goalId === undefined && findPrize(s, b.prizeId)) s.goalId = b.prizeId;
  tidyShop(s);
  return true;
}

/** Сколько раз покупали эту награду. */
export function timesBought(s: State, prizeId: string): number {
  return purchasesOf(s).filter((b) => b.prizeId === prizeId).length;
}

/** Золото, потраченное в лавке: за всё время или за один день. */
export function spentGold(s: State, day?: DayKey): number {
  return purchasesOf(s).reduce((sum, b) => (day === undefined || b.day === day ? sum + b.price : sum), 0);
}

/** Покупки по дням, новые сверху: для истории. */
export function purchasesByDay(s: State, limit: number): { day: DayKey; items: Purchase[] }[] {
  const last = purchasesOf(s).slice(-limit).reverse();
  const out: { day: DayKey; items: Purchase[] }[] = [];
  for (const b of last) {
    const head = out[out.length - 1];
    if (head && head.day === b.day) head.items.push(b);
    else out.push({ day: b.day, items: [b] });
  }
  return out;
}

/**
 * Привычный темп: сколько золота в среднем приносит день с делами. Считается по последним дням
 * перед сегодняшним, в которые что-то сделано. Пока таких дней мало, темп неизвестен: null.
 */
export function goldPace(s: State): number | null {
  const days = Object.keys(s.log)
    .filter((d) => d < s.day && s.log[d].done > 0 && s.log[d].gold > 0)
    .sort()
    .slice(-PACE_DAYS);
  if (days.length < PACE_MIN_DAYS) return null;
  return days.reduce((sum, d) => sum + s.log[d].gold, 0) / days.length;
}

/**
 * Награда, на которую стало хватать золота после прибавки gain (например, после «Готово»):
 * до прибавки не хватало, теперь хватает. Если таких несколько, первой идёт цель, потом самая дорогая.
 */
export function unlockedBy(s: State, gain: number): Prize | undefined {
  if (gain <= 0) return undefined;
  const before = s.hero.gold - gain;
  const fresh = prizesOf(s).filter((p) => p.price > before && p.price <= s.hero.gold);
  return fresh.find((p) => p.id === s.goalId) ?? fresh.sort((a, b) => b.price - a.price)[0];
}
