import type { LifeReport } from './report'
// Типы движка. Движок не содержит исторических данных: всё приходит из content/*.json.

export type Sex = 'm' | 'f'
export type Lang = 'ru' | 'en'

export const ATTRIBUTES = ['health', 'intellect', 'strength', 'charisma', 'diligence', 'risk_tolerance'] as const
export const HIDDEN = ['happiness', 'stress', 'loneliness', 'reputation', 'self_esteem', 'faith'] as const
export type AttrId = (typeof ATTRIBUTES)[number]
export type HiddenId = (typeof HIDDEN)[number]
/** Всё, что можно читать и менять числом: атрибуты, скрытые параметры и достаток. */
export type ParamId = AttrId | HiddenId | 'money'

export type NpcRole = 'father' | 'mother' | 'sibling' | 'friend' | 'spouse' | 'child' | 'grandchild' | 'mentor' | 'rival' | 'patron'
/** Роль в эффектах: 'npc' — персонаж, к которому привязано текущее событие. */
export type NpcTarget = NpcRole | 'npc'

/** Оси «Узора жизни»: отрицательное значение — левая сторона, положительное — правая. */
export const AXES = ['craft_power', 'home_road', 'faith_reason', 'memory_future'] as const
export type Axis = (typeof AXES)[number]
export type PatternDelta = Partial<Record<Axis, number>>

/** Темы записей для фильтров полной записи жизни. */
export const TOPICS = ['family', 'work', 'health', 'money', 'history', 'life'] as const
export type Topic = (typeof TOPICS)[number]

/** Описание пиксельной сцены. Из него же собирается промпт для настоящей иллюстрации. */
export const SCENE_PLACES = ['landmark', 'home', 'street', 'market', 'temple', 'field', 'river', 'sea', 'harbor', 'workshop', 'school', 'camp', 'battle', 'arena', 'road', 'tomb', 'palace', 'bath'] as const
export type ScenePlace = (typeof SCENE_PLACES)[number]
export const SCENE_TIMES = ['day', 'dawn', 'sunset', 'night', 'overcast'] as const
export type SceneTime = (typeof SCENE_TIMES)[number]
export const SCENE_PROPS = [
  'sun', 'moon', 'fire', 'smoke', 'boat', 'bed', 'cradle', 'table', 'scroll', 'coins', 'amphora', 'tree', 'palm', 'olive',
  'grain', 'goat', 'horse', 'cart', 'lamp', 'altar', 'statue', 'rain', 'banner', 'shield', 'loom', 'anvil',
] as const
export type SceneProp = (typeof SCENE_PROPS)[number]

export interface SceneDef {
  place?: ScenePlace
  time?: SceneTime
  /** Сколько человечков в кадре, 0–6. */
  people?: number
  props?: SceneProp[]
}

/** Значки карты жизни. */
export type Icon = 'birth' | 'child' | 'wedding' | 'death' | 'move' | 'loss' | 'find' | 'war' | 'disaster' | 'freedom' | 'study' | 'love'

// ---------- Контент ----------

export interface Name {
  id: string
  ru: string
  en: string
}

export interface RegionDef {
  id: string
  weight: number
  years: [number, number]
  /** Ключ валюты в текстах: денарии, драхмы. */
  coin: string
  classWeights: Record<string, number>
  names: { m: Name[]; f: Name[] }
  tags?: string[]
  /** Как делится наследство; по умолчанию — как задано для эпохи. */
  inheritance?: 'equal' | 'sons_first'
}

export interface ClassDef {
  id: string
  /** Место в обществе эпохи, 0–100: основа для графика положения. */
  status: number
  /** Стартовый достаток семьи [от, до]. */
  money: [number, number]
  /** Расходы на жизнь в год. */
  upkeep: number
  /** Множитель смертности. */
  mortality: number
  tags?: string[]
}

export interface ProfessionDef {
  id: string
  classes?: string[]
  sex?: Sex
  regions?: string[]
  minAge: number
  requirements?: Condition[]
  income: [number, number]
  skill: string
  mortality?: number
  stress?: number
  reputation?: number
  tags?: string[]
}

export interface FocusDef {
  id: string
  ages: [number, number]
  conditions?: Condition[]
  effects: Effect[]
  /** Доход профессии за год работы умножается на это число. */
  incomeMultiplier?: number
}

export interface MortalityDef {
  /** Вероятность умереть за год: [возраст начала диапазона, вероятность]. */
  qx: [number, number][]
  childbirth: number
  causes: CauseDef[]
}

export interface CauseDef {
  id: string
  ages: [number, number]
  weight: number
  conditions?: Condition[]
}

export interface EraDef {
  id: string
  years: [number, number]
  regions: RegionDef[]
  classes: ClassDef[]
  professions: ProfessionDef[]
  focuses: FocusDef[]
  traits: string[]
  skills: string[]
  mortality: MortalityDef
  stages: { youth: number; adult: number; old: number }
  marriageAge: { m: [number, number]; f: [number, number] }
  /** Средняя продолжительность жизни для сравнения на итоговой карточке. */
  lifeExpectancy: number
  inheritance: 'equal' | 'sons_first'
  events: EventDef[]
  patternWeights: PatternWeights
}

export interface PatternWeights {
  /** Делитель для перевода накопленного счёта в шкалу −100…100. */
  scale: number
  focus: Record<string, PatternDelta>
  profession: Record<string, PatternDelta>
  actions: Record<'move' | 'child' | 'marriage' | 'study_tag', PatternDelta>
}

// ---------- События ----------

export type Op = '>=' | '<=' | '>' | '<' | '=='

export type Condition =
  | { param: ParamId; op: Op; value: number }
  | { skill: string; op: Op; value: number }
  | { tag: string }
  | { tag_absent: string }
  | { trait: string }
  | { trait_absent: string }
  | { flag: string }
  | { flag_absent: string }
  | { sex: Sex }
  | { profession: string[] }
  | { no_profession: true }
  | { has_npc: NpcRole; age_min?: number; age_max?: number }
  | { no_npc: NpcRole }
  | { classes: string[] }
  | { age: [number, number] }
  | { any: Condition[] }

export type Effect =
  | { param: ParamId; delta: number }
  | { money_pct: number }
  | { skill: string; delta: number }
  | { add_tag: string }
  | { remove_tag: string }
  | { set_flag: string }
  | { clear_flag: string }
  | { add_trait: string }
  | { set_class: string }
  | { set_profession: string | null }
  | { add_npc: NpcRole; attitude?: number; newborn?: boolean }
  | { npc_attitude: NpcTarget; delta: number }
  | { remove_npc: NpcTarget }
  | { kill_npc: NpcTarget; cause?: string }
  | { move: string }
  | { kill: string }
  | { chance: number; effects: Effect[] }

export interface WeightModifier {
  if: Condition
  multiply: number
}

export interface DelayedEffect {
  after_years: [number, number]
  chance: number
  trigger_event: string
}

export interface RiskRoll {
  /** Параметр или навык, от которого зависит шанс; без него шанс фиксированный. */
  param?: ParamId | string
  success_chance_base: number
  on_success?: Effect[]
  on_failure: Effect[]
}

export interface ChoiceDef {
  id: string
  /** Вклад решения в «Узор жизни». */
  pattern?: PatternDelta
  icon?: Icon
  requirements?: Condition[]
  effects?: Effect[]
  delayed_effects?: DelayedEffect[]
  risk_roll?: RiskRoll
}

export type EventType = 'personal' | 'family' | 'local' | 'global_historical'

export interface EventDef {
  id: string
  type: EventType
  regions?: string[]
  years?: [number, number]
  age_range?: [number, number]
  classes?: string[]
  sex?: Sex
  conditions?: Condition[]
  base_weight: number
  weight_modifiers?: WeightModifier[]
  /** Событие срабатывает только как отложенное последствие. */
  trigger_only?: boolean
  /** Не больше одного раза за жизнь. */
  once?: boolean
  /** Тяжёлая тема: не показывается в режиме «убрать тяжёлые сцены». */
  sensitive?: boolean
  /** Глобальное историческое событие: вероятность в каждый год окна, один раз за жизнь. */
  global_chance?: number
  /** Развилка: выпадает в первую очередь, когда условия выполнены. */
  milestone?: boolean
  /** Момент жизни: показывается в ленте без остановки, без выбора. */
  moment?: boolean
  /** Событие про конкретного человека: нужна живая роль, её имя доступно в тексте как {npc}. */
  npc?: NpcRole
  npc_age?: [number, number]
  /** Сколько вариантов текста: ev.id.text.1 … ev.id.text.N. */
  variants?: number
  topic?: Topic
  icon?: Icon
  pattern?: PatternDelta
  /** Пиксельная сцена события; без неё рисуется место по умолчанию для региона. */
  scene?: SceneDef
  image_slot?: string
  /** Эффекты самого события, применяются при любом выборе. */
  effects?: Effect[]
  /** Варианты выбора собираются движком: 'profession' — доступные профессии. */
  dynamic?: 'profession'
  /** Если выборов нет, показывается одна кнопка «Далее». */
  choices?: ChoiceDef[]
  historian_note?: boolean
  confidence?: 'confirmed' | 'reconstructed' | 'disputed'
  sources?: string[]
}

// ---------- Состояние игры ----------

export interface Npc {
  id: string
  role: NpcRole
  name: string
  sex: Sex
  birthYear: number
  traits: string[]
  attitude: number
  alive: boolean
  deathYear?: number
  /** С какого года рядом (для супругов — год свадьбы). */
  since?: number
  /** Для внуков: id ребёнка героя. */
  parentId?: string
}

export type TextParam = string | number | { name: string } | { key: string }

export interface DiaryEntry {
  year: number
  age: number
  key: string
  params?: Record<string, TextParam>
  /** Важная запись: попадает в жизнеописание. */
  major?: boolean
  topic?: Topic
  icon?: Icon
  /** Вес для выбора ключевых моментов. */
  score?: number
  /** Изменение счастья, которое принесла запись. */
  mood?: number
  /** Игрок принимал решение. */
  decision?: boolean
  /** Номер записи-решения, последствием которого стала эта запись. */
  causedBy?: number
  eventId?: string
}

export interface YearRecord {
  age: number
  year: number
  happiness: number
  stress: number
  health: number
  money: number
  status: number
  focus: string | null
}

export interface PendingTrigger {
  eventId: string
  year: number
  chance: number
  /** Номер записи дневника с решением, которое запустило последствие. */
  from?: number
}

export interface Hero {
  id: string
  name: string
  sex: Sex
  birthYear: number
  era: string
  region: string
  cls: string
  age: number
  alive: boolean
  generation: number
  attrs: Record<AttrId, number>
  hidden: Record<HiddenId, number>
  money: number
  traits: string[]
  skills: Record<string, number>
  tags: string[]
  flags: string[]
  profession: string | null
  npcs: Npc[]
  triggers: PendingTrigger[]
  /** Когда событие было в последний раз: id → год. */
  seen: Record<string, number>
  diary: DiaryEntry[]
  /** Срез состояния в конце каждого прожитого года. */
  history: YearRecord[]
  /** Накопленный счёт по осям «Узора жизни». */
  pattern: Record<Axis, number>
  /** Где жил герой: ключи мест в текстах. */
  places: string[]
  deathYear?: number
  deathCause?: string
  seed: number
}

export interface LifeSummary {
  heroId: string
  familyId: string
  generation: number
  name: string
  sex: Sex
  era: string
  region: string
  cls: string
  profession: string | null
  birthYear: number
  deathYear: number
  age: number
  cause: string
  children: number
  biography: DiaryEntry[]
  money: number
  /** Номер записи в мемориале. */
  record?: number
  /** Полный дневник, близкие и итоги — чтобы экран итогов открывался из мемориала. */
  diary: DiaryEntry[]
  npcs: Npc[]
  history: YearRecord[]
  places: string[]
  traits: string[]
  report: LifeReport
  /** Отмеченные звёздочкой записи и строка игрока для карточки. */
  starred?: number[]
  playerLine?: string
}

export interface Family {
  id: string
  /** Предки текущего героя, по порядку поколений. */
  lives: LifeSummary[]
  flags: string[]
}

export interface ActiveEvent {
  eventId: string
  /** Персонаж, о котором событие. */
  npcId?: string
  variant?: number
  /** Номер записи-решения, если это отложенное последствие. */
  from?: number
  /** Выбранный вариант и итог; пока null — игрок ещё не выбрал. */
  outcome: { choiceId: string; result: 'ok' | 'success' | 'failure' } | null
}

export type Phase = 'year' | 'event' | 'dead'

export interface GameSettings {
  mode: 'quick' | 'full'
  mortality: 'soft' | 'historical'
  softenHeavy: boolean
}

export interface GameState {
  version: number
  year: number
  hero: Hero
  family: Family
  rng: number
  phase: Phase
  queue: ActiveEvent[]
  settings: GameSettings
  lastFocus: string | null
  nextId: number
}
