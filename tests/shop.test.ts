// Лавка: награды за золото, покупка и «Вернуть», цель, привычный темп, сохранение.
import { describe, expect, it } from 'vitest';
import { GOLD_PER_LEVEL, PRIZE_IDEAS, PRIZE_PRICE_MAX, PRIZE_PRICE_MIN } from '../src/game/rules';
import {
  addPrize,
  buyPrize,
  canBuy,
  cleanPrice,
  findPrize,
  goalOf,
  goldPace,
  movePrize,
  prizesOf,
  purchasesByDay,
  purchasesOf,
  refund,
  removePrize,
  restorePrize,
  setGoal,
  shortOf,
  spentGold,
  timesBought,
  unlockedBy,
  updatePrize,
} from '../src/game/shop';
import { addTask, complete, newState, settle, undoComplete } from '../src/game/state';
import { SAVE_VERSION, checkSave } from '../src/game/store';
import type { State } from '../src/game/types';
import { PRIZE_IDEA_NAME, goldText, priceHint } from '../src/game/words';

// Пятница, 23 октября 2026.
const at = (h: number, m = 0, d = 23) => new Date(2026, 9, d, h, m).getTime();

function fresh(gold = 0) {
  const s = newState(at(8));
  s.hero.gold = gold;
  return s;
}

/** Игра, как она ляжет в файл и вернётся из него. */
const reload = (s: State) => checkSave(JSON.parse(JSON.stringify(s)))!;

describe('полка лавки', () => {
  it('новая награда встаёт в конец полки с чистым названием и ценой', () => {
    const s = fresh();
    const a = addPrize(s, at(9), { title: '  Серия   сериала ', price: 150 })!;
    const b = addPrize(s, at(9), { title: 'Кафе', price: 300 })!;
    expect(prizesOf(s).map((p) => p.title)).toEqual(['Серия сериала', 'Кафе']);
    expect(findPrize(s, a)).toMatchObject({ price: 150, createdAt: at(9) });
    expect(a).not.toBe(b);
  });

  it('без названия или с ценой не числом награда не заводится', () => {
    const s = fresh();
    expect(addPrize(s, at(9), { title: '   ', price: 100 })).toBeNull();
    expect(addPrize(s, at(9), { title: 'Какао', price: Number.NaN })).toBeNull();
    expect(s.prizes).toBeUndefined();
  });

  it('цена встаёт на шаг в 5 и держится в границах', () => {
    expect(cleanPrice(152)).toBe(150);
    expect(cleanPrice(153)).toBe(155);
    expect(cleanPrice(1)).toBe(PRIZE_PRICE_MIN);
    expect(cleanPrice(-40)).toBe(PRIZE_PRICE_MIN);
    expect(cleanPrice(10_000_000)).toBe(PRIZE_PRICE_MAX);
    expect(cleanPrice(Number.POSITIVE_INFINITY)).toBeNull();
  });

  it('правка меняет название и цену, а пустое название не принимает', () => {
    const s = fresh();
    const id = addPrize(s, at(9), { title: 'Какао', price: 60 })!;
    expect(updatePrize(s, id, { title: 'Какао с пирожным', price: 120 })).toBe(true);
    expect(findPrize(s, id)).toMatchObject({ title: 'Какао с пирожным', price: 120 });
    expect(updatePrize(s, id, { title: '', price: 120 })).toBe(false);
    expect(findPrize(s, id)!.title).toBe('Какао с пирожным');
  });

  it('награду можно подвинуть на полке, с края она не уходит', () => {
    const s = fresh();
    const a = addPrize(s, at(9), { title: 'А', price: 50 })!;
    const b = addPrize(s, at(9), { title: 'Б', price: 50 })!;
    const c = addPrize(s, at(9), { title: 'В', price: 50 })!;
    movePrize(s, c, -1);
    expect(prizesOf(s).map((p) => p.id)).toEqual([a, c, b]);
    movePrize(s, a, -1);
    movePrize(s, b, 1);
    expect(prizesOf(s).map((p) => p.id)).toEqual([a, c, b]);
  });

  it('убранная награда возвращается на своё место вместе с целью', () => {
    const s = fresh();
    const a = addPrize(s, at(9), { title: 'А', price: 50 })!;
    const b = addPrize(s, at(9), { title: 'Б', price: 50 })!;
    const c = addPrize(s, at(9), { title: 'В', price: 50 })!;
    setGoal(s, b);
    const was = removePrize(s, b)!;
    expect(prizesOf(s).map((p) => p.id)).toEqual([a, c]);
    expect(s.goalId).toBeUndefined();
    restorePrize(s, was);
    expect(prizesOf(s).map((p) => p.id)).toEqual([a, b, c]);
    expect(goalOf(s)?.id).toBe(b);
    // Второй раз «Вернуть» ничего не удваивает.
    restorePrize(s, was);
    expect(prizesOf(s)).toHaveLength(3);
  });

  it('у каждой идеи есть название, а цена идеи проходит как есть', () => {
    for (const idea of PRIZE_IDEAS) {
      expect(PRIZE_IDEA_NAME[idea.id]).toBeTruthy();
      expect(cleanPrice(idea.price)).toBe(idea.price);
    }
  });
});

describe('покупка', () => {
  it('золото уходит, покупка ложится в историю с названием и ценой на тот момент', () => {
    const s = fresh(200);
    const id = addPrize(s, at(9), { title: 'Серия сериала', price: 150 })!;
    const b = buyPrize(s, at(20), id)!;
    expect(s.hero.gold).toBe(50);
    expect(b).toMatchObject({ prizeId: id, title: 'Серия сериала', price: 150, at: at(20), day: '2026-10-23' });
    updatePrize(s, id, { title: 'Две серии', price: 300 });
    expect(purchasesOf(s)[0]).toMatchObject({ title: 'Серия сериала', price: 150 });
    expect(timesBought(s, id)).toBe(1);
  });

  it('без золота покупки нет и ничего не меняется', () => {
    const s = fresh(100);
    const id = addPrize(s, at(9), { title: 'Серия сериала', price: 150 })!;
    const p = findPrize(s, id)!;
    expect(canBuy(s, p)).toBe(false);
    expect(shortOf(s, p)).toBe(50);
    expect(buyPrize(s, at(20), id)).toBeNull();
    expect(buyPrize(s, at(20), 'нет такой')).toBeNull();
    expect(s.hero.gold).toBe(100);
    expect(s.purchases).toBeUndefined();
  });

  it('одну награду можно купить много раз, пока хватает золота', () => {
    const s = fresh(130);
    const id = addPrize(s, at(9), { title: 'Чай', price: 60 })!;
    expect(buyPrize(s, at(10), id)).not.toBeNull();
    expect(buyPrize(s, at(11), id)).not.toBeNull();
    expect(buyPrize(s, at(12), id)).toBeNull();
    expect(s.hero.gold).toBe(10);
    expect(timesBought(s, id)).toBe(2);
  });

  it('«Вернуть» отдаёт золото и убирает запись', () => {
    const s = fresh(200);
    const id = addPrize(s, at(9), { title: 'Серия сериала', price: 150 })!;
    const b = buyPrize(s, at(20), id)!;
    expect(refund(s, b.id)).toBe(true);
    expect(s.hero.gold).toBe(200);
    expect(s.purchases).toBeUndefined();
    expect(refund(s, b.id)).toBe(false);
    expect(s.hero.gold).toBe(200);
  });

  it('покупку возвращают по цене покупки, даже если награду переоценили или убрали', () => {
    const s = fresh(200);
    const id = addPrize(s, at(9), { title: 'Серия сериала', price: 150 })!;
    const b = buyPrize(s, at(20), id)!;
    removePrize(s, id);
    expect(purchasesOf(s)).toHaveLength(1);
    refund(s, b.id);
    expect(s.hero.gold).toBe(200);
  });

  it('золото за «Готово» можно сразу потратить, а отменённое «Готово» уводит золото в минус, не ломая игру', () => {
    const s = fresh();
    const work = s.quests[0].id;
    const t = addTask(s, at(8), { title: 'Отчёт', questId: work, level: 2 });
    complete(s, at(9), t);
    expect(s.hero.gold).toBe(GOLD_PER_LEVEL * 2);
    const id = addPrize(s, at(9), { title: 'Чай', price: 50 })!;
    buyPrize(s, at(9, 5), id);
    expect(s.hero.gold).toBe(0);
    undoComplete(s, t);
    expect(s.hero.gold).toBe(-50);
    expect(canBuy(s, findPrize(s, id)!)).toBe(false);
    expect(goldText(s.hero.gold)).toBe('−50 золота');
  });

  it('покупка после полуночи идёт в тот же игровой день', () => {
    const s = fresh(500);
    const id = addPrize(s, at(9), { title: 'Чай', price: 60 })!;
    settle(s, at(1, 30, 24));
    expect(buyPrize(s, at(1, 30, 24), id)!.day).toBe('2026-10-23');
    settle(s, at(9, 0, 24));
    expect(buyPrize(s, at(9, 0, 24), id)!.day).toBe('2026-10-24');
    expect(spentGold(s, '2026-10-23')).toBe(60);
    expect(spentGold(s)).toBe(120);
    expect(purchasesByDay(s, 30).map((d) => [d.day, d.items.length])).toEqual([
      ['2026-10-24', 1],
      ['2026-10-23', 1],
    ]);
  });

  it('история показывает только последние покупки, новые сверху', () => {
    const s = fresh(1000);
    const id = addPrize(s, at(9), { title: 'Чай', price: 50 })!;
    for (let i = 0; i < 5; i++) buyPrize(s, at(10, i), id);
    const days = purchasesByDay(s, 3);
    expect(days).toHaveLength(1);
    expect(days[0].items.map((b) => b.at)).toEqual([at(10, 4), at(10, 3), at(10, 2)]);
  });
});

describe('цель', () => {
  it('цель одна, её можно снять', () => {
    const s = fresh(100);
    const a = addPrize(s, at(9), { title: 'Кафе', price: 300 })!;
    const b = addPrize(s, at(9), { title: 'Кино', price: 800 })!;
    setGoal(s, a);
    setGoal(s, b);
    expect(goalOf(s)?.id).toBe(b);
    setGoal(s, null);
    expect(goalOf(s)).toBeUndefined();
    setGoal(s, 'нет такой');
    expect(s.goalId).toBeUndefined();
  });

  it('купленная цель перестаёт быть целью, а «Вернуть» делает её целью снова', () => {
    const s = fresh(300);
    const a = addPrize(s, at(9), { title: 'Кафе', price: 300 })!;
    setGoal(s, a);
    const b = buyPrize(s, at(20), a)!;
    expect(s.goalId).toBeUndefined();
    refund(s, b.id, true);
    expect(goalOf(s)?.id).toBe(a);
    expect(s.hero.gold).toBe(300);
  });

  it('после «Готово» лагерь знает, на что стало хватать: сначала цель, потом самое дорогое', () => {
    const s = fresh(140);
    addPrize(s, at(9), { title: 'Чай', price: 60 });
    const series = addPrize(s, at(9), { title: 'Серия сериала', price: 150 })!;
    const game = addPrize(s, at(9), { title: 'Час игры', price: 180 })!;
    addPrize(s, at(9), { title: 'Кино', price: 800 });
    // Было 140, за дело пришло 50: теперь хватает на серию и на игру, на чай хватало и раньше.
    s.hero.gold = 190;
    expect(unlockedBy(s, 50)?.id).toBe(game);
    setGoal(s, series);
    expect(unlockedBy(s, 50)?.id).toBe(series);
    expect(unlockedBy(s, 0)).toBeUndefined();
    s.hero.gold = 100;
    expect(unlockedBy(s, 25)).toBeUndefined();
  });
});

describe('привычный темп', () => {
  it('считается по последним дням с делами, без сегодняшнего', () => {
    const s = fresh();
    expect(goldPace(s)).toBeNull();
    s.log['2026-10-20'] = { gold: 100, xp: 0, done: 2, workedMs: 0, restMs: 0, undeadSlain: 0 };
    s.log['2026-10-21'] = { gold: 200, xp: 0, done: 4, workedMs: 0, restMs: 0, undeadSlain: 0 };
    expect(goldPace(s)).toBeNull();
    s.log['2026-10-22'] = { gold: 300, xp: 0, done: 5, workedMs: 0, restMs: 0, undeadSlain: 0 };
    // День без дел и сегодняшний в счёт не идут.
    s.log['2026-10-19'] = { gold: 0, xp: 5, done: 0, workedMs: 0, restMs: 0, undeadSlain: 0 };
    s.log['2026-10-23'] = { gold: 1000, xp: 0, done: 9, workedMs: 0, restMs: 0, undeadSlain: 0 };
    expect(goldPace(s)).toBe(200);
  });

  it('подсказка к цене говорит днями дел, а без темпа короткими задачами', () => {
    expect(priceHint(150, null, 25)).toBe('Как 6 задач до получаса.');
    expect(priceHint(25, null, 25)).toBe('Как 1 задача до получаса.');
    expect(priceHint(50, 200, 25)).toBe('В твоём темпе это меньше половины дня дел.');
    expect(priceHint(100, 200, 25)).toBe('В твоём темпе это примерно полдня дел.');
    expect(priceHint(200, 200, 25)).toBe('В твоём темпе это примерно 1 день дел.');
    expect(priceHint(1000, 200, 25)).toBe('В твоём темпе это примерно 5 дней дел.');
  });
});

describe('лавка в сохранении', () => {
  it('формат сохранения не менялся, а игра без лавки записана как раньше', () => {
    expect(SAVE_VERSION).toBe(4);
    const s = fresh(100);
    const id = addPrize(s, at(9), { title: 'Чай', price: 60 })!;
    setGoal(s, id);
    const b = buyPrize(s, at(10), id)!;
    refund(s, b.id);
    removePrize(s, id);
    expect('prizes' in s).toBe(false);
    expect('purchases' in s).toBe(false);
    expect('goalId' in s).toBe(false);
  });

  it('награды, покупки и цель переживают запись и чтение', () => {
    const s = fresh(500);
    const a = addPrize(s, at(9), { title: 'Чай', price: 60 })!;
    const b = addPrize(s, at(9), { title: 'Кафе', price: 300 })!;
    setGoal(s, b);
    buyPrize(s, at(10), a);
    const back = reload(s);
    expect(prizesOf(back).map((p) => p.title)).toEqual(['Чай', 'Кафе']);
    expect(purchasesOf(back)).toHaveLength(1);
    expect(goalOf(back)?.id).toBe(b);
    expect(back.hero.gold).toBe(440);
  });

  it('старое сохранение без лавки открывается как есть, с прежним золотом', () => {
    const s = fresh(1240);
    const back = reload(s);
    expect(back.hero.gold).toBe(1240);
    expect(prizesOf(back)).toEqual([]);
    expect(purchasesOf(back)).toEqual([]);
  });

  it('испорченные поля лавки не роняют игру', () => {
    const s = fresh(100) as State & Record<string, unknown>;
    s.prizes = 'ой' as never;
    s.purchases = {} as never;
    s.goalId = 'нет такой';
    const back = reload(s);
    expect(back.prizes).toBeUndefined();
    expect(back.purchases).toBeUndefined();
    expect(back.goalId).toBeUndefined();
    expect(back.hero.gold).toBe(100);
  });
});
