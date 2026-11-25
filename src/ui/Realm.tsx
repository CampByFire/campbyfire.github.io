import { sphereBrews, type Brew } from '../game/alchemy';
import { Cauldron } from './Cauldron';
import { questHex } from '../game/color';
import { BREW_CAPACITY, BREW_PER_TASK } from '../game/rules';
import { lairOf, projectsOf, ratingDue, releasedOf, spheresOf, unrelease } from '../game/state';
import { formatDue } from '../game/time';
import type { Quest, State } from '../game/types';
import { QUEST_ICON_NAME, W, brewIcon } from '../game/words';
import type { Ui } from './App';
import { GIcon, LIcon } from './Icon';
import { QuestDot } from './parts';
import { PageHelp } from './PageHelp';

export function Realm({ ui }: { ui: Ui }) {
  const s = ui.store.state;
  const spheres = spheresOf(s);
  const loose = projectsOf(s, null);
  const won = s.quests.filter((q) => !q.sphere && q.wonAt).sort((a, b) => (b.wonAt ?? 0) - (a.wonAt ?? 0));
  const released = releasedOf(s).slice(0, 30);
  const brews = sphereBrews(s);
  return (
    <div class="page">
      <div class="page-heading">
        <h1 class="page-title">{W.realm}</h1>
        <PageHelp title={W.realm}>
          Каждое выполненное дело в сфере или её проекте пополняет котелок на {BREW_PER_TASK} из {BREW_CAPACITY} порций.
          С каждым игровым днём испаряется одна порция. Нажми на котелок, чтобы открыть проекты и заметку «Как улучшить».
          Кнопка «Оценить сферы» сохраняет твою личную оценку.
        </PageHelp>
      </div>
      <section class="group">
        <div class="group-head">
          <h2 class="sc">{W.spheres}</h2>
          <button class="link-btn" onClick={() => ui.open({ kind: 'newQuest', sphere: true })}>
            <LIcon name="plus" size={15} />
            новая сфера
          </button>
        </div>
        {spheres.length > 0 ? <>
          <ul class="brew-grid">
            {spheres.map(q => <li key={q.id}><SphereCard ui={ui} q={q} brew={brews.get(q.id)} /></li>)}
          </ul>
          {ratingDue(s) && <p class="note">Пора оценить сферы.</p>}
          <button class="btn btn-gold btn-wide" onClick={() => ui.open({ kind: 'rate' })}>{W.rate}</button>
        </> : <p class="note">Добавь первую сферу, чтобы появился котелок.</p>}
        {loose.length > 0 && (
          <div class="sphere">
            <div class="quest-name">
              <QuestDot q={undefined} />
              Проекты {W.noSphere.toLowerCase()}
            </div>
            {loose.map((p) => (
              <ProjectCard key={p.id} ui={ui} s={s} q={p} />
            ))}
          </div>
        )}
        <button class="link-btn" onClick={() => ui.open({ kind: 'newQuest', sphereId: spheres[0]?.id ?? null })}>
          <LIcon name="plus" size={15} />
          новый проект
        </button>
      </section>

      <section class="group">
        <div class="group-head">
          <h2 class="sc">{W.trophies}</h2>
        </div>
        {won.length === 0 && <p class="note">Пока пусто. Когда отметишь проект выполненным, его знамя появится здесь.</p>}
        {won.map((q) => (
          <button key={q.id} class="trophy" data-quest={q.id} onClick={() => ui.open({ kind: 'quest', questId: q.id })}>
            <GIcon name="kingdom" size={20} class="ic-gold" />
            <span class="row-title">{q.name}</span>
            <span class="meta">{new Date(q.wonAt!).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
          </button>
        ))}
      </section>

      {released.length > 0 && (
        <details class="group released">
          <summary class="group-head">
            <span class="sc">Отпущенные</span>
            <span class="group-meta">
              {released.length}
              <LIcon name="down" size={14} />
            </span>
          </summary>
          <p class="note">Задачи, которые отпустили без награды. Если отпустили по ошибке, их можно вернуть.</p>
          {released.map((t) => (
            <div key={t.id} class="trophy">
              <span class="row-title row-muted">{t.title}</span>
              <button
                class="link-btn"
                onClick={() => {
                  ui.store.act((st) => unrelease(st, t.id));
                  ui.toast('Задача вернулась');
                }}
              >
                <LIcon name="undo" size={14} />
                Вернуть
              </button>
            </div>
          ))}
        </details>
      )}
    </div>
  );
}

function openIn(s: State, questId: string): number {
  return s.tasks.filter((t) => t.questId === questId && t.status === 'open').length;
}

function SphereCard({ ui, q, brew }: { ui: Ui; q: Quest; brew?: Brew }) {
  const icon = q.icon === undefined ? brewIcon(q.id) : q.icon;
  const portions = brew?.portions ?? 0;
  return (
    <button class="quest-card sphere-card" data-sphere={q.id} onClick={() => ui.open({ kind: 'quest', questId: q.id })}>
      <Cauldron color={questHex(q.color)} portions={portions} icon={icon} />
      <span class="quest-card-name">{q.name}</span>
      <span class="quest-card-sub">{brew ? `Последнее дело — ${formatDue(brew.lastDay, ui.store.state.day)}` : 'Пока нет выполненных дел'}</span>
      <span class="sr-only">Отвар: {portions} из {BREW_CAPACITY}.{icon && ` Медальон: ${QUEST_ICON_NAME[icon]}.`}</span>
    </button>
  );
}

function ProjectCard({ ui, s, q }: { ui: Ui; s: State; q: Quest }) {
  const lair = lairOf(s, q.id);
  const done = lair.max - lair.hp;
  return (
    <button class="quest-card project-card" onClick={() => ui.open({ kind: 'quest', questId: q.id })}>
      <span class="quest-card-top">
        <QuestDot q={q} />
        <span class="quest-card-name">{q.name}</span>
        <span class="meta">проект</span>
      </span>
      <span class="quest-card-sub">
        {openIn(s, q.id)} в отряде
        {lair.max > 0 && ` · сделано ${done} из ${lair.max}`}
      </span>
      {lair.max > 0 && (
        <span class="bar bar-gold" aria-hidden="true">
          <span style={{ width: `${(done / lair.max) * 100}%` }} />
        </span>
      )}
    </button>
  );
}
