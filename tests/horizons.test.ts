import { describe, expect, it } from 'vitest';
import { mergeGames } from '../src/game/merge';
import { inPeriod, isPast, periodEnd, periodKind, periodOf, periodStart, shiftPeriod, within } from '../src/game/period';
import { parsePhrase } from '../src/game/phrase';
import {
  addTask,
  complete,
  findTask,
  nestedTasks,
  newState,
  periodTasks,
  release,
  removeQuest,
  setPeriod,
  settle,
  tailTargets,
  tailsOf,
  unrelease,
  updateTask,
} from '../src/game/state';
import { SAVE_VERSION, checkSave } from '../src/game/store';
import type { State } from '../src/game/types';
import { periodName, periodShort, periodTo, weekRange } from '../src/game/words';

// Понедельник, 2 ноября 2026.
const at = (h: number, m = 0, d = 2, mo = 10) => new Date(2026, mo, d, h, m).getTime();
const TODAY = '2026-11-02';

describe('периоды', () => {
  it('неделя по ISO, с понедельника', () => {
    expect(periodOf('week', TODAY)).toBe('2026-W45');
    expect(periodOf('week', '2026-11-08')).toBe('2026-W45');
    expect(periodOf('week', '2026-11-09')).toBe('2026-W46');
    expect(periodStart('2026-W45')).toBe('2026-11-02');
    expect(periodEnd('2026-W45')).toBe('2026-11-08');
  });

  it('неделя на стыке лет относится к году своего четверга', () => {
    expect(periodOf('week', '2026-12-31')).toBe('2026-W53');
    expect(periodOf('week', '2027-01-03')).toBe('2026-W53');
    expect(periodOf('week', '2027-01-04')).toBe('2027-W01');
    expect(periodOf('week', '2025-12-29')).toBe('2026-W01');
    expect(shiftPeriod('2026-W53', 1)).toBe('2027-W01');
    expect(shiftPeriod('2027-W01', -1)).toBe('2026-W53');
  });

  it('месяц, квартал и год', () => {
    expect(periodOf('month', TODAY)).toBe('2026-11');
    expect(periodOf('quarter', TODAY)).toBe('2026-Q4');
    expect(periodOf('year', TODAY)).toBe('2026');
    expect(periodEnd('2026-02')).toBe('2026-02-28');
    expect(periodEnd('2026-Q4')).toBe('2026-12-31');
    expect(shiftPeriod('2026-12', 1)).toBe('2027-01');
    expect(shiftPeriod('2026-Q4', 1)).toBe('2027-Q1');
    expect(shiftPeriod('2026', -1)).toBe('2025');
    expect(periodKind('2026-W45')).toBe('week');
    expect(periodKind('2026-Q4')).toBe('quarter');
    expect(periodKind('чепуха')).toBeNull();
  });

  it('что внутри чего', () => {
    expect(within('2026-W45', '2026-11')).toBe(true);
    // Неделя 26 окт – 1 ноя: четверг в октябре.
    expect(within('2026-W44', '2026-11')).toBe(false);
    expect(within('2026-W44', '2026-10')).toBe(true);
    expect(within('2026-11', '2026-Q4')).toBe(true);
    expect(within('2026-Q4', '2026')).toBe(true);
    expect(within('2026-W45', '2026')).toBe(true);
    expect(within('2026', '2026-Q4')).toBe(false);
    expect(within('2026-11', '2026-11')).toBe(false);
    expect(inPeriod('2026-11', TODAY)).toBe(true);
    expect(isPast('2026-W44', TODAY)).toBe(true);
    expect(isPast('2026-W45', TODAY)).toBe(false);
  });

  it('названия', () => {
    expect(periodName('2026-W45', TODAY)).toBe('Эта неделя');
    expect(periodName('2026-W46', TODAY)).toBe('Следующая неделя');
    expect(periodName('2026-W44', TODAY)).toBe('Прошлая неделя');
    expect(periodName('2026-W48', TODAY)).toBe('Неделя 23–29 ноября');
    expect(weekRange('2026-W44')).toBe('26 октября – 1 ноября');
    expect(weekRange('2026-W53')).toBe('28 декабря 2026 – 3 января 2027');
    expect(periodName('2026-11', TODAY)).toBe('Ноябрь');
    expect(periodName('2027-01', TODAY)).toBe('Январь 2027');
    expect(periodName('2026-Q4', TODAY)).toBe('IV квартал');
    expect(periodName('2027-Q1', TODAY)).toBe('I квартал 2027');
    expect(periodName('2026', TODAY)).toBe('2026 год');
    expect(periodShort('2026-W45', TODAY)).toBe('эта неделя');
    expect(periodShort('2026-Q4', TODAY)).toBe('IV кв.');
    expect(periodTo('2026-W45', TODAY)).toBe('на эту неделю');
    expect(periodTo('2026-11', TODAY)).toBe('на ноябрь');
    expect(periodTo('2026-Q4', TODAY)).toBe('на IV квартал');
  });
});

describe('задачи с горизонтом', () => {
  it('без похода и дня задача с горизонтом встаёт в отряд, а не письмом', () => {
    const s = newState(at(9));
    const id = addTask(s, at(9), { title: 'Съесть мороженое', questId: null, period: '2026-W45' });
    const t = findTask(s, id)!;
    expect(t.status).toBe('open');
    expect(t.period).toBe('2026-W45');
    const plain = findTask(s, addTask(s, at(9), { title: 'Письмо', questId: null }))!;
    expect(plain.status).toBe('inbox');
    expect('period' in plain).toBe(false);
  });

  it('горизонт ставится и снимается; без него и без похода задача снова письмо', () => {
    const s = newState(at(9));
    const id = addTask(s, at(9), { title: 'Письмо', questId: null });
    setPeriod(s, id, '2026-11');
    expect(findTask(s, id)!.status).toBe('open');
    updateTask(s, id, { period: null });
    expect(findTask(s, id)!.status).toBe('inbox');
    expect('period' in findTask(s, id)!).toBe(false);
  });

  it('задачи периода и вложенных периодов', () => {
    const s = newState(at(9));
    const week = addTask(s, at(9), { title: 'Неделя', questId: null, period: '2026-W45' });
    const month = addTask(s, at(9), { title: 'Месяц', questId: null, period: '2026-11' });
    const year = addTask(s, at(9), { title: 'Год', questId: null, period: '2026' });
    complete(s, at(10), week);
    expect(periodTasks(s, '2026-W45').map((t) => t.id)).toEqual([week]);
    expect(periodTasks(s, '2026-11').map((t) => t.id)).toEqual([month]);
    expect(nestedTasks(s, '2026-11').map((t) => t.id)).toEqual([week]);
    expect(nestedTasks(s, '2026').map((t) => t.id).sort()).toEqual([month, week].sort());
    expect(nestedTasks(s, '2026-W45')).toEqual([]);
    release(s, at(10), year);
    expect(periodTasks(s, '2026')).toEqual([]);
  });

  it('хвосты: незакрытое в прошедшем периоде', () => {
    const s = newState(at(9, 0, 30, 9));
    const a = addTask(s, at(9, 0, 30, 9), { title: 'Хвост', questId: null, period: '2026-W44' });
    const b = addTask(s, at(9, 0, 30, 9), { title: 'Сделано', questId: null, period: '2026-W44' });
    addTask(s, at(9, 0, 30, 9), { title: 'Октябрь', questId: null, period: '2026-10' });
    complete(s, at(10, 0, 30, 9), b);
    expect(tailsOf(s)).toEqual([]);
    settle(s, at(9));
    expect(tailsOf(s).map((t) => t.title)).toEqual(['Октябрь', 'Хвост']);
    expect(tailTargets(s, findTask(s, a)!)).toEqual({ same: '2026-W45', bigger: '2026-11' });
    setPeriod(s, a, '2026-W45');
    expect(tailsOf(s).map((t) => t.title)).toEqual(['Октябрь']);
    const y = addTask(s, at(9), { title: 'Год', questId: null, period: '2025' });
    expect(tailTargets(s, findTask(s, y)!)).toEqual({ same: '2026', bigger: null });
  });

  it('отпущенная задача с горизонтом возвращается в отряд, а не письмом', () => {
    const s = newState(at(9));
    const id = addTask(s, at(9), { title: 'Год', questId: null, period: '2026' });
    release(s, at(10), id);
    unrelease(s, id);
    expect(findTask(s, id)!.status).toBe('open');
  });

  it('убранный поход оставляет задачу с горизонтом в отряде', () => {
    const s = newState(at(9));
    const q = s.quests[0].id;
    const id = addTask(s, at(9), { title: 'Квартал', questId: q, period: '2026-Q4' });
    const other = addTask(s, at(9), { title: 'Без горизонта', questId: q });
    removeQuest(s, q);
    expect(findTask(s, id)!.status).toBe('open');
    expect(findTask(s, other)!.status).toBe('inbox');
  });

  it('сохранение с горизонтом открывается как есть, формат прежний', () => {
    const s = newState(at(9));
    addTask(s, at(9), { title: 'Неделя', questId: null, period: '2026-W45' });
    const back = checkSave(JSON.parse(JSON.stringify(s)))!;
    expect(back.v).toBe(SAVE_VERSION);
    expect(back.tasks.find((t) => t.title === 'Неделя')?.period).toBe('2026-W45');
  });

  it('горизонт сливается с двух устройств', () => {
    const base = newState(at(8));
    const id = addTask(base, at(8), { title: 'Задача', questId: null });
    const copy = () => JSON.parse(JSON.stringify(base)) as State;
    const local = copy();
    const remote = copy();
    local.touchedAt = at(9);
    setPeriod(local, id, '2026-11');
    remote.touchedAt = at(10);
    updateTask(remote, id, { title: 'Новое имя' });
    const m = mergeGames(base, local, remote, at(10, 5));
    expect(findTask(m, id)).toMatchObject({ title: 'Новое имя', period: '2026-11', status: 'open' });

    // Снятый на одной стороне горизонт снимается и в слиянии.
    const base2 = JSON.parse(JSON.stringify(m)) as State;
    const l2 = JSON.parse(JSON.stringify(m)) as State;
    const r2 = JSON.parse(JSON.stringify(m)) as State;
    l2.touchedAt = at(11);
    setPeriod(l2, id, null);
    r2.touchedAt = at(12);
    updateTask(r2, id, { at: '19:00' });
    const m2 = mergeGames(base2, l2, r2, at(12, 5));
    expect('period' in findTask(m2, id)!).toBe(false);
    expect(findTask(m2, id)!.at).toBe('19:00');
    expect(findTask(m2, id)!.status).toBe('inbox');
  });
});

describe('задача одной фразой', () => {
  const s = newState(at(9));
  const p = (text: string) => parsePhrase(text, TODAY, s.quests);

  it('пример Игоря: горизонт и название в кавычках', () => {
    expect(p('Добавь задачу на неделю "Съесть мороженное"')).toMatchObject({ title: 'Съесть мороженное', period: '2026-W45' });
    expect(p('Добавь задачу на неделю «Съесть мороженое»').title).toBe('Съесть мороженое');
  });

  it('слова в кавычках ничего не выставляют', () => {
    const r = p('«Завтра в 19:00 позвонить»');
    expect(r).toMatchObject({ title: 'Завтра в 19:00 позвонить', found: [] });
    expect(r.day).toBeUndefined();
  });

  it('день и время', () => {
    expect(p('завтра в 19:00 позвонить маме')).toMatchObject({ title: 'Позвонить маме', day: '2026-11-03', at: '19:00' });
    expect(p('послезавтра стрижка')).toMatchObject({ title: 'Стрижка', day: '2026-11-04' });
    expect(p('Купить хлеб сегодня').day).toBe(TODAY);
    expect(p('в пятницу встреча в 19.30')).toMatchObject({ title: 'Встреча', day: '2026-11-06', at: '19:30' });
    // В понедельник «в понедельник» значит через неделю.
    expect(p('в понедельник планёрка').day).toBe('2026-11-09');
    expect(p('через 3 дня полить цветы')).toMatchObject({ title: 'Полить цветы', day: '2026-11-05' });
    expect(p('через неделю к врачу').day).toBe('2026-11-09');
    expect(p('в 8 вечера ужин')).toMatchObject({ title: 'Ужин', at: '20:00' });
    expect(p('в 9 утра пробежка').at).toBe('09:00');
    expect(p('20 ноября концерт')).toMatchObject({ title: 'Концерт', day: '2026-11-20' });
  });

  it('сроки', () => {
    expect(p('отчёт до пятницы').due).toBe('2026-11-06');
    expect(p('до 15 ноября оплатить налог')).toMatchObject({ title: 'Оплатить налог', due: '2026-11-15' });
    expect(p('до 15.11 оплатить налог').due).toBe('2026-11-15');
    expect(p('к 1 марта отчёт').due).toBe('2027-03-01');
    expect(p('до конца недели разобрать шкаф').due).toBe('2026-11-08');
    expect(p('до конца месяца').due).toBe('2026-11-30');
    expect(p('до конца года выучить').due).toBe('2026-12-31');
    expect(p('до 31.02 что-то').due).toBeUndefined();
  });

  it('горизонты', () => {
    expect(p('на этой неделе разобрать почту').period).toBe('2026-W45');
    expect(p('на следующей неделе к стоматологу').period).toBe('2026-W46');
    expect(p('на месяц: прочитать книгу').period).toBe('2026-11');
    expect(p('в декабре поменять резину')).toMatchObject({ title: 'Поменять резину', period: '2026-12' });
    expect(p('в марте отпуск').period).toBe('2027-03');
    expect(p('в этом квартале сдать проект').period).toBe('2026-Q4');
    expect(p('в первом квартале сдать на права')).toMatchObject({ title: 'Сдать на права', period: '2027-Q1' });
    expect(p('на год: выучить испанский')).toMatchObject({ title: 'Выучить испанский', period: '2026' });
    expect(p('в следующем году марафон').period).toBe('2027');
    expect(p('в 2028 году дом').period).toBe('2028');
  });

  it('оценка и поход', () => {
    expect(p('отчёт до пятницы на 2 часа #работа')).toMatchObject({ title: 'Отчёт', due: '2026-11-06', estimate: 120, questId: s.quests[0].id });
    expect(p('на полчаса разобрать почту').estimate).toBe(30);
    expect(p('займёт полтора часа').estimate).toBe(90);
    expect(p('на 45 минут зарядка').estimate).toBe(45);
    expect(p('на весь день уборка')).toMatchObject({ title: 'Уборка', estimate: 480 });
    expect(p('ремонт займёт неделю в поход Дом')).toMatchObject({ title: 'Ремонт', estimate: null, questId: s.quests[2].id });
    expect(p('#здоровье зарядка').questId).toBe(s.quests[1].id);
    expect(p('ремонт ванной в проект Дом')).toMatchObject({ title: 'Ремонт ванной', questId: s.quests[2].id });
    expect(p('бег в сферу здоровье')).toMatchObject({ title: 'Бег', questId: s.quests[1].id });
  });

  it('обычные названия не трогаются', () => {
    expect(p('Купить подарок на день рождения')).toMatchObject({ title: 'Купить подарок на день рождения', found: [] });
    expect(p('поход в горы')).toMatchObject({ title: 'Поход в горы', found: [] });
    expect(p('Сдать модуль React')).toMatchObject({ title: 'Сдать модуль React', found: [] });
    expect(p('Ответить на почту').found).toEqual([]);
    expect(p('Отчёт за год').found).toEqual([]);
  });

  it('слова-команды в начале не попадают в название', () => {
    expect(p('Надо купить молоко').title).toBe('Купить молоко');
    expect(p('Добавь купить хлеб на сегодня')).toMatchObject({ title: 'Купить хлеб', day: TODAY });
    expect(p('Напомни мне завтра позвонить').title).toBe('Позвонить');
    expect(p('Задача на день: выспаться')).toMatchObject({ title: 'Выспаться', day: TODAY });
    expect(p('завтра').title).toBe('');
  });

  it('что узнано, перечислено по порядку фразы', () => {
    expect(p('отчёт до пятницы на 2 часа').found).toEqual([
      { kind: 'due', text: 'до пятницы' },
      { kind: 'estimate', text: 'на 2 часа' },
    ]);
  });
});
