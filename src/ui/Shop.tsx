// Лавка: награды, которые игрок заводит сам и покупает за золото. Золото за дела здесь меняется на радости в жизни.
import { useState } from 'preact/hooks';
import { GOLD_PER_LEVEL, PRIZE_IDEAS, PRIZE_PRICE_MAX, PRIZE_PRICE_MIN, PRIZE_PRICE_STEP, PRIZE_TITLE_MAX, PURCHASES_SHOWN, type PrizeTier } from '../game/rules';
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
  updatePrize,
} from '../game/shop';
import { formatClock, formatDate, formatDue, plural } from '../game/time';
import type { Prize, Purchase } from '../game/types';
import { PRIZE_IDEA_NAME, PRIZE_TIER_NAME, W, goldText, priceHint } from '../game/words';
import type { Ui } from './App';
import { GIcon, LIcon } from './Icon';
import { spend } from './magic/spells';
import { Sheet } from './Sheets';

const TIERS: PrizeTier[] = ['small', 'medium', 'big', 'dream'];
const num = (n: number) => n.toLocaleString('ru-RU');
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Купить награду: золото уходит сразу, внизу сообщение с «Вернуть», магия догоняет. */
export function buy(ui: Ui, p: Prize): void {
  const s = ui.store.state;
  const before = s.hero.gold;
  const wasGoal = s.goalId === p.id;
  const bought = ui.store.act((st, now) => buyPrize(st, now, p.id));
  if (!bought) return;
  spend(p.id, before, bought.price);
  ui.toast(`Куплено: ${bought.title}. Это заслуженно!`, {
    label: 'Вернуть',
    run: () => ui.store.act((st) => refund(st, bought.id, wasGoal)),
  });
}

export function Shop({ ui }: { ui: Ui }) {
  const s = ui.store.state;
  const prizes = prizesOf(s);
  const goal = goalOf(s);
  const today = s.log[s.day];
  const spentToday = spentGold(s, s.day);
  const total = purchasesOf(s).length;
  const taken = new Set(prizes.map((p) => p.title.toLowerCase()));
  const ideas = PRIZE_IDEAS.filter((i) => !taken.has(PRIZE_IDEA_NAME[i.id].toLowerCase()));
  // Идеи раскрыты, пока полка пуста, и не сворачиваются сами, пока с них набирают награды.
  const [ideasOpen, setIdeasOpen] = useState(prizes.length === 0);

  const addIdea = (title: string, price: number) => {
    const id = ui.store.act((st, now) => addPrize(st, now, { title, price }));
    if (!id) return;
    ui.toast(`На полке: ${title}`, { label: 'Вернуть', run: () => ui.store.act((st) => removePrize(st, id)) });
  };

  return (
    <div class="page shop">
      <div class="page-top">
        <span class="page-date">
          <GIcon name="coins" size={15} class="ic-gold" />
          {formatDate(s.day)} · {formatClock(ui.now)}
        </span>
        <button class="link-btn" onClick={() => ui.go('camp')}>
          В лагерь
          <LIcon name="chevron" size={16} />
        </button>
      </div>
      <h1 class="page-title">{W.shop}</h1>
      <div class="page-sub">Золото за дела меняется здесь на радости в жизни. Заведи то, чего тебе хочется, назначь цену и покупай: всё куплено честно.</div>

      <div class="purse" data-magic="purse">
        <GIcon name="coins" size={30} class="purse-ic" />
        <div class="purse-body">
          <div class="purse-gold">
            <span aria-hidden="true" data-magic="purse-n" data-v={s.hero.gold}>
              {num(s.hero.gold)}
            </span>
            <span aria-hidden="true"> золота</span>
            <span class="sr-only">В кошеле {goldText(s.hero.gold)}</span>
          </div>
          <div class="purse-sub">
            {today?.gold || spentToday
              ? `Сегодня заработано ${num(today?.gold ?? 0)}${spentToday ? `, потрачено ${num(spentToday)}` : ''}`
              : 'Каждое «Готово» приносит золото'}
          </div>
          {s.hero.gold < 0 && <div class="purse-sub">Золото ушло в минус: покупку сделали на двух устройствах или вернули уже оплаченную задачу. Новые дела его вернут.</div>}
        </div>
      </div>

      {goal && (
        <section class="group goal" aria-labelledby="goal-title">
          <div class="group-head">
            <h2 class="sc" id="goal-title">
              Коплю на
            </h2>
            <button class="link-btn" onClick={() => ui.store.act((st) => setGoal(st, null))}>
              снять цель
            </button>
          </div>
          <div class="goal-card">
            <div class="goal-top">
              <LIcon name="star" size={18} class="ic-gold" />
              <span class="goal-name">{goal.title}</span>
              <Price n={goal.price} />
            </div>
            <span class="bar bar-gold" aria-hidden="true">
              <span style={{ width: `${Math.max(0, Math.min(1, s.hero.gold / goal.price)) * 100}%` }} />
            </span>
            {canBuy(s, goal) ? (
              <button class="btn btn-gold btn-wide" data-buy={goal.id} onClick={() => buy(ui, goal)}>
                Накоплено! Купить
              </button>
            ) : (
              <p class="note goal-left">
                Осталось {goldText(shortOf(s, goal))}: уже {Math.max(0, Math.floor((s.hero.gold / goal.price) * 100))}%.
              </p>
            )}
          </div>
        </section>
      )}

      <section class="group">
        <div class="group-head">
          <h2 class="sc">Награды</h2>
          <button class="link-btn" onClick={() => ui.open({ kind: 'prize' })}>
            <LIcon name="plus" size={15} />
            новая награда
          </button>
        </div>
        {prizes.length === 0 && <p class="note">На полке пусто. Заведи первую награду или возьми готовую идею ниже: цену и название потом можно поменять.</p>}
        <ul class="prizes">
          {prizes.map((p) => (
            <PrizeCard key={p.id} ui={ui} p={p} isGoal={goal?.id === p.id} />
          ))}
        </ul>
      </section>

      {ideas.length > 0 && (
        <details class="group ideas" open={ideasOpen} onToggle={(e) => setIdeasOpen(e.currentTarget.open)}>
          <summary class="group-head">
            <span class="sc">Идеи наград</span>
            <span class="group-meta">
              {ideas.length}
              <LIcon name="down" size={14} />
            </span>
          </summary>
          <p class="note">Нажми, и награда встанет на полку. Бери то, что радует именно тебя.</p>
          {TIERS.map((tier) => {
            const list = ideas.filter((i) => i.tier === tier);
            if (!list.length) return null;
            return (
              <div class="field" key={tier} role="group" aria-label={PRIZE_TIER_NAME[tier]}>
                <div class="field-label" aria-hidden="true">
                  {PRIZE_TIER_NAME[tier]}
                </div>
                <div class="chips">
                  {list.map((i) => (
                    <button key={i.id} class="chipbtn idea" onClick={() => addIdea(PRIZE_IDEA_NAME[i.id], i.price)}>
                      {PRIZE_IDEA_NAME[i.id]}
                      <small>
                        <span aria-hidden="true">{num(i.price)}</span>
                        <span class="sr-only">, {goldText(i.price)}</span>
                      </small>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </details>
      )}

      <section class="group">
        <div class="group-head">
          <h2 class="sc">Куплено</h2>
          {total > 0 && (
            <span class="group-meta">
              {total} {plural(total, 'награда', 'награды', 'наград')} на {goldText(spentGold(s))}
            </span>
          )}
        </div>
        {total === 0 && <p class="note">Пока ничего. Первая покупка появится здесь.</p>}
        {purchasesByDay(s, PURCHASES_SHOWN).map((d) => (
          <div key={d.day} class="bought-day" role="group" aria-label={cap(formatDue(d.day, s.day))}>
            <div class="field-label" aria-hidden="true">
              {cap(formatDue(d.day, s.day))}
            </div>
            {d.items.map((b) => (
              <BoughtRow key={b.id} ui={ui} b={b} fresh={d.day === s.day} />
            ))}
          </div>
        ))}
        {total > PURCHASES_SHOWN && <p class="note">Видны последние {PURCHASES_SHOWN} покупок.</p>}
      </section>
    </div>
  );
}

function Price({ n }: { n: number }) {
  return (
    <span class="price">
      <GIcon name="coins" size={15} />
      <span aria-hidden="true">{num(n)}</span>
      <span class="sr-only">{goldText(n)}</span>
    </span>
  );
}

function PrizeCard({ ui, p, isGoal }: { ui: Ui; p: Prize; isGoal: boolean }) {
  const s = ui.store.state;
  const ok = canBuy(s, p);
  const times = timesBought(s, p.id);
  const short = shortOf(s, p);
  return (
    <li class={`prize${ok ? ' is-ready' : ''}`} data-prize={p.id}>
      <button class="prize-main" onClick={() => ui.open({ kind: 'prize', prizeId: p.id })}>
        <span class="prize-top">
          <span class="prize-name">{p.title}</span>
          <Price n={p.price} />
        </span>
        <span class="prize-sub">
          {isGoal && 'Коплю на это · '}
          {ok ? 'Хватает золота' : `Не хватает ${num(short)}`}
          {times > 0 && ` · куплено ${times} ${plural(times, 'раз', 'раза', 'раз')}`}
          <span class="sr-only">. Открыть награду</span>
        </span>
        {!ok && (
          <span class="bar bar-gold" aria-hidden="true">
            <span style={{ width: `${Math.max(0, Math.min(1, s.hero.gold / p.price)) * 100}%` }} />
          </span>
        )}
      </button>
      {ok && (
        <button class="btn btn-gold btn-sm prize-buy" data-buy={p.id} aria-label={`Купить: ${p.title}, ${goldText(p.price)}`} onClick={() => buy(ui, p)}>
          Купить
        </button>
      )}
    </li>
  );
}

function BoughtRow({ ui, b, fresh }: { ui: Ui; b: Purchase; fresh: boolean }) {
  return (
    <div class="trophy bought">
      <span class="row-title">{b.title}</span>
      <span class="meta">
        <span aria-hidden="true">−{num(b.price)}</span>
        <span class="sr-only">{goldText(b.price)}</span>
      </span>
      {fresh && (
        <button
          class="link-btn"
          aria-label={`Вернуть покупку: ${b.title}`}
          onClick={() => {
            ui.store.act((st) => refund(st, b.id));
            ui.toast(`Покупка возвращена: +${goldText(b.price)}`);
          }}
        >
          <LIcon name="undo" size={14} />
          Вернуть
        </button>
      )}
    </div>
  );
}

/** Лист награды: новая или правка. У готовой награды ещё цель, место на полке и «Убрать». */
export function PrizeSheet({ ui, prizeId }: { ui: Ui; prizeId?: string }) {
  const s = ui.store.state;
  const p = findPrize(s, prizeId);
  const [title, setTitle] = useState(p?.title ?? '');
  const [priceText, setPriceText] = useState(p ? String(p.price) : '');
  const [tried, setTried] = useState(false);
  if (prizeId && !p) return null;
  const raw = Number(priceText.replace(/\s+/g, '').replace(',', '.'));
  const price = priceText.trim() && Number.isFinite(raw) && raw > 0 ? cleanPrice(raw) : null;
  const list = prizesOf(s);
  const at = p ? list.findIndex((x) => x.id === p.id) : -1;
  const isGoal = !!p && s.goalId === p.id;
  const error = !title.trim() ? 'Напиши, что это за награда.' : price === null ? 'Назначь цену числом, например 150.' : null;

  const save = () => {
    if (error || price === null) return setTried(true);
    if (p) ui.store.act((st) => updatePrize(st, p.id, { title, price }));
    else ui.store.act((st, now) => addPrize(st, now, { title, price }));
    ui.close();
  };
  const remove = () => {
    if (!p) return;
    const was = ui.store.act((st) => removePrize(st, p.id));
    ui.close();
    if (was) ui.toast(`Убрано с полки: ${p.title}`, { label: 'Вернуть', run: () => ui.store.act((st) => restorePrize(st, was)) });
  };

  return (
    <Sheet
      title={p ? 'Награда' : 'Новая награда'}
      onClose={ui.close}
      footer={
        <button class="btn btn-gold btn-wide" onClick={save}>
          {p ? 'Сохранить' : 'Поставить на полку'}
        </button>
      }
    >
      <label class="field">
        <span class="field-label">Чем себя порадовать</span>
        <input class="input" value={title} onInput={(e) => setTitle(e.currentTarget.value)} placeholder="Например, серия сериала" maxLength={PRIZE_TITLE_MAX} />
      </label>
      <label class="field">
        <span class="field-label">Цена в золоте</span>
        <input
          class="input"
          inputMode="numeric"
          value={priceText}
          onInput={(e) => setPriceText(e.currentTarget.value)}
          placeholder="150"
          maxLength={7}
          aria-describedby="prize-hint"
        />
      </label>
      <p class="field-hint" id="prize-hint">
        {price !== null
          ? `${cap(goldText(price))}. ${priceHint(price, goldPace(s), GOLD_PER_LEVEL)}`
          : `От ${PRIZE_PRICE_MIN} до ${num(PRIZE_PRICE_MAX)}, шагом ${PRIZE_PRICE_STEP}. Задача до получаса приносит ${GOLD_PER_LEVEL} золота, на несколько дней ${GOLD_PER_LEVEL * 4}.`}
      </p>
      {tried && error && (
        <p class="note note-error" role="alert">
          {error}
        </p>
      )}
      {p && (
        <>
          <p class="note prize-goal-note">{isGoal ? 'Это твоя цель: лавка и лагерь показывают, сколько до неё осталось.' : 'Цель одна: лавка и лагерь будут показывать, сколько до неё осталось.'}</p>
          <div class="actions">
            <button class="act" aria-pressed={isGoal} onClick={() => ui.store.act((st) => setGoal(st, isGoal ? null : p.id))}>
              <LIcon name="star" size={18} class={isGoal ? 'ic-gold' : undefined} />
              {isGoal ? 'Коплю на это. Снять цель' : 'Копить на это'}
            </button>
            <button class="act" disabled={at <= 0} onClick={() => ui.store.act((st) => movePrize(st, p.id, -1))}>
              <LIcon name="up" size={18} />
              Выше на полке
            </button>
            <button class="act" disabled={at < 0 || at >= list.length - 1} onClick={() => ui.store.act((st) => movePrize(st, p.id, 1))}>
              <LIcon name="down" size={18} />
              Ниже на полке
            </button>
            <button class="act act-danger" onClick={remove}>
              <LIcon name="trash" size={18} />
              Убрать с полки
            </button>
          </div>
        </>
      )}
    </Sheet>
  );
}
