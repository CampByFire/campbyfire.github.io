// Данные игры. Всё, что сохраняется, лежит в State и сериализуется в JSON как есть.

/** Уровень задачи: I до получаса, II пара часов, III целый день, IV несколько дней. */
export type Level = 1 | 2 | 3 | 4;

/** Когда сфера (и её проекты) в полной силе: в рабочие часы, вечером и в выходные, или в любое время. */
export type QuestKind = 'work' | 'personal' | 'any';

/** Готовые цвета знамени похода. */
export type QuestPreset = 'red' | 'blue' | 'green' | 'yellow' | 'purple' | 'brown';

/**
 * Знамя похода: готовый цвет или свой, кодом «#rrggbb». Прежние версии игры (0.4.0 и раньше)
 * свой цвет не знают и рисуют такое знамя без цвета, как у задачи без похода.
 */
export type QuestColor = QuestPreset | `#${string}`;

/** inbox: письмо у вестника, ещё не разобрано; open: спутник в отряде. */
export type TaskStatus = 'inbox' | 'open' | 'done' | 'released';

/** Игровой день в виде YYYY-MM-DD. День начинается в 4:00, а не в полночь. */
export type DayKey = string;

/**
 * Сфера жизни или проект. Сфера (sphere: true) это часть колеса баланса: «Работа», «Здоровье».
 * Она не кончается, её оценивают от 1 до 10. Проект это большая цель из многих задач: он лежит
 * в сфере (sphereId) или сам по себе и завершается, когда игрок так решит. Задача и повторяющаяся
 * задача ссылаются через questId и на сферу, и на проект.
 */
export interface Quest {
  id: string;
  name: string;
  /** У проекта в сфере работает тип сферы, а свой остаётся на случай, если проект вынут из сферы. */
  kind: QuestKind;
  color: QuestColor;
  createdAt: number;
  /** Это сфера, а не проект. */
  sphere?: true;
  /** Проект: в какой он сфере. Нет поля или null: проект сам по себе. */
  sphereId?: string | null;
  /** Проект завершён и ушёл в зал трофеев. */
  wonAt?: number;
}

/** Оценка сфер за один день: id сферы и балл от 1 до 10. Оценка того же дня ещё раз заменяет прежнюю. */
export interface Rating {
  /** День оценки, он же id: две оценки одного дня сливаются в одну. */
  id: DayKey;
  at: number;
  scores: Record<string, number>;
}

/** Как часто напоминать оценить сферы. */
export type RateEvery = 'week' | 'month' | 'quarter' | 'never';

export interface Reward {
  gold: number;
  xp: number;
  /** Задача была нежитью: при отмене «Готово» счёт упокоенных за день уменьшается. */
  undead?: boolean;
  /** Урон логову похода, равен уровню задачи. */
  damage: number;
}

export interface Task {
  id: string;
  title: string;
  questId: string | null;
  level: Level;
  /** Оценка в минутах. Пустая значит «по уровню». */
  estimateMin: number | null;
  status: TaskStatus;
  /** День, на который спутник позван к костру. */
  day: DayKey | null;
  /** Порядок в плане дня. */
  order: number;
  /** Срок. После него задача встаёт нежитью на лесной дороге. */
  due: DayKey | null;
  /** Время на часах, если задача привязана ко времени, например «20:30». */
  at: string | null;
  spentMs: number;
  createdAt: number;
  doneAt?: number;
  doneDay?: DayKey;
  reward?: Reward;
  /** Когда отпустили и откуда: по этому задачу можно вернуть. */
  releasedAt?: number;
  releasedFrom?: 'open' | 'inbox';
  /** Задача пришла сама от повторяющейся задачи с этим id. */
  routineId?: string;
  /**
   * Горизонт: неделя «2026-W45», месяц «2026-11», квартал «2026-Q4» или год «2026» (см. period.ts).
   * Нет поля, значит горизонта нет. Задача с горизонтом в отряде, а не письмом, даже без похода и дня.
   * 0.4.1 и раньше поле не знают, но не теряют: у них такая задача просто стоит в отряде.
   */
  period?: string;
}

/** Как часто приходит повторяющаяся задача. Рабочие дни берутся из распорядка, weekday: 0 воскресенье. */
export type Repeat = { every: 'day' } | { every: 'workday' } | { every: 'week'; weekday: number };

/**
 * Повторяющаяся задача: в свои дни она сама встаёт в план дня обычной задачей (Task с routineId).
 * Пока прошлая не сделана, новая не приходит: в отряде ждёт одна.
 */
export interface Routine {
  id: string;
  title: string;
  questId: string | null;
  level: Level;
  estimateMin: number | null;
  at: string | null;
  repeat: Repeat;
  createdAt: number;
}

export interface Settings {
  /** Минуты от полуночи. */
  workStart: number;
  workEnd: number;
  /** Дни недели с работой, 0 воскресенье. */
  workDays: number[];
  bedtime: number;
  /** Как часто напоминать оценить сферы. */
  rateEvery: RateEvery;
}

export interface DayLog {
  gold: number;
  xp: number;
  done: number;
  workedMs: number;
  restMs: number;
  undeadSlain: number;
}

export interface Current {
  taskId: string;
  /** Когда пошёл таймер; null, если задача у огня, но таймер стоит. */
  runningSince: number | null;
  /** Последний раз, когда игрок был в приложении при идущем таймере. */
  seenAt: number;
  /** Таймер встал сам после 90 минут без игрока. */
  idleSince: number | null;
}

export interface Hero {
  xp: number;
  gold: number;
  mana: number;
}

export interface State {
  v: 3;
  /** Своя у каждой игры: по ней сохранение в GitHub узнаёт, та же это игра или другая. */
  gameId: string;
  createdAt: number;
  /** Последнее действие игрока; null, пока в игре ничего не делали. */
  touchedAt: number | null;
  day: DayKey;
  hero: Hero;
  /** Сферы и проекты вместе, порядок как на экране. */
  quests: Quest[];
  /** Оценки сфер, старые сверху. */
  ratings: Rating[];
  tasks: Task[];
  routines: Routine[];
  current: Current | null;
  breakSince: number | null;
  /** Поход последней задачи у огня, для цены переключения. */
  lastQuestId: string | null;
  /** День, когда разожгли костёр, то есть утвердили план. */
  litDay: DayKey | null;
  /** День, когда прозвучал отбой. */
  closedDay: DayKey | null;
  secondWindDay: DayKey | null;
  settledAt: number;
  log: Record<DayKey, DayLog>;
  settings: Settings;
  seq: number;
}
