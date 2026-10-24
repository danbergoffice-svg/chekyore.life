// Типы движка. Движок не содержит исторических данных: всё приходит из content/*.json.

export type Sex = 'm' | 'f'
export type Lang = 'ru' | 'en'

export const ATTRIBUTES = ['health', 'intellect', 'strength', 'charisma', 'diligence', 'risk_tolerance'] as const
export const HIDDEN = ['happiness', 'stress', 'loneliness', 'reputation', 'self_esteem', 'faith'] as const
export type AttrId = (typeof ATTRIBUTES)[number]
export type HiddenId = (typeof HIDDEN)[number]
/** Всё, что можно читать и менять числом: атрибуты, скрытые параметры и достаток. */
export type ParamId = AttrId | HiddenId | 'money'

export type NpcRole = 'father' | 'mother' | 'sibling' | 'friend' | 'spouse' | 'child' | 'mentor' | 'rival' | 'patron'

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
  | { npc_attitude: NpcRole; delta: number }
  | { remove_npc: NpcRole }
  | { kill_npc: NpcRole; cause?: string }
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
}

export type TextParam = string | number | { name: string } | { key: string }

export interface DiaryEntry {
  year: number
  age: number
  key: string
  params?: Record<string, TextParam>
  /** Важная запись: попадает в жизнеописание. */
  major?: boolean
}

export interface PendingTrigger {
  eventId: string
  year: number
  chance: number
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
}

export interface Family {
  id: string
  /** Предки текущего героя, по порядку поколений. */
  lives: LifeSummary[]
  flags: string[]
}

export interface ActiveEvent {
  eventId: string
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
