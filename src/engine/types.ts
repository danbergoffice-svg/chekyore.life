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
export const SCENE_PLACES = ['landmark', 'home', 'street', 'market', 'temple', 'field', 'river', 'sea', 'harbor', 'workshop', 'school', 'camp', 'battle', 'arena', 'road', 'tomb', 'palace', 'bath', 'yard'] as const
export type ScenePlace = (typeof SCENE_PLACES)[number]
export const SCENE_TIMES = ['day', 'dawn', 'sunset', 'night', 'overcast'] as const
export type SceneTime = (typeof SCENE_TIMES)[number]
export const SCENE_PROPS = [
  'sun', 'moon', 'fire', 'smoke', 'boat', 'bed', 'cradle', 'table', 'scroll', 'coins', 'amphora', 'tree', 'palm', 'olive',
  'grain', 'goat', 'horse', 'cart', 'lamp', 'altar', 'statue', 'rain', 'banner', 'shield', 'loom', 'anvil',
] as const
export type SceneProp = (typeof SCENE_PROPS)[number]

export interface SceneDef {
  /** Бедствие на картинке: дом горит, разрушен землетрясением или затоплен. */
  disaster?: 'fire' | 'ruin' | 'flood'
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

/** Можно ли называть ребёнка именем родителя, деда или прадеда: запрещено (Китай), можно, принято. */
export type AncestorNames = 'forbid' | 'allow' | 'prefer'

export interface RegionDef {
  id: string
  weight: number
  /** Правило имён предков; если не задано — правило страны, по умолчанию 'allow'. */
  ancestorNames?: AncestorNames
  years: [number, number]
  /** Ключ валюты в текстах: денарии, драхмы. */
  coin: string
  classWeights: Record<string, number>
  names: { m: Name[]; f: Name[] }
  tags?: string[]
  /** Как делится наследство; по умолчанию — как задано для эпохи. */
  inheritance?: 'equal' | 'sons_first'
  /** Вера жителей: id религии → вес. */
  religions: Record<string, number>
  /** С какого года вера жителей меняется (крещение, исламизация…): берётся последняя подходящая запись. */
  religionEras?: { from: number; religions: Record<string, number> }[]
  /** Вера по сословиям, если она отличается от общей (знать-мусульмане среди индусов). */
  classReligions?: Record<string, Record<string, number>>
  /** Стиль пиксельных сцен: архитектура, одежда, пейзаж. */
  scene?: RegionScene
  /** Годы, когда регион был столицей (иначе — тег capital на всё время). */
  capital?: [number, number]
}

/** Как рисовать регион: палитра и набор построек. */
export interface RegionScene {
  /** Архитектурный стиль: roman, greek, egyptian, chinese, japanese, indian, islamic, gothic, byzantine, russian,
   *  mesopotamian, maya, aztec, andean, sahel, ethiopian. */
  style: string
  /** Пейзаж за городом: green, dry, desert, snow, jungle, mountains, steppe. */
  land?: string
  /** Подпись для промпта настоящей иллюстрации, по-английски. */
  prompt?: string
}

/** Религия. Названия и описание — в текстах: religion.<id>, religion.<id>.desc. */
export interface ReligionDef {
  id: string
  /** Семья вер: christian, islamic, dharmic, polytheist… События могут ссылаться на семью вместо id. */
  group: string
  tags?: string[]
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
  /** Ступень карьеры: доступна только через события работы, не при выборе дела. */
  promotion_only?: boolean
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

/** Образ жизни: питание, движение, лечение, бани. Настройка действует каждый год, пока её не поменять. */
export interface LifestyleOption {
  id: string
  /** Расход в год (может быть отрицательным — экономия). */
  cost: number
  effects?: Effect[]
  /** Множитель смертности. */
  mortality?: number
  requirements?: Condition[]
}

/** Порок или привычка героя: действует каждый год, пока есть метка. */
export interface ViceDef {
  tag: string
  effects?: Effect[]
  /** Расход в год. */
  cost?: number
  mortality?: number
}

export interface LifestyleDef {
  id: string
  minAge: number
  default: string
  /** Сословия, которые сами решают этот вопрос (рабам обычно нет). */
  classes?: string[]
  options: LifestyleOption[]
}

export interface MortalityDef {
  /** Вероятность умереть за год: [возраст начала диапазона, вероятность]. */
  qx: [number, number][]
  childbirth: number
  /** Поправка смертности героя, чтобы средняя продолжительность жизни в симуляции совпала с таблицей:
   *  сословие, здоровье, долги и эпидемии в сумме сдвигают её вниз. Подбирается симуляционным прогоном. */
  calibration?: number
  causes: CauseDef[]
}

export interface CauseDef {
  id: string
  ages: [number, number]
  weight: number
  conditions?: Condition[]
}

/** Описание страны и времени (era.json): загружается сразу для всех стран. */
export interface EraMeta {
  id: string
  /** Правило имён предков для всех регионов страны. */
  ancestorNames?: AncestorNames
  /** Годы рождения героев. */
  years: [number, number]
  /** Население в миллионах: вес в лотерее «как в жизни». */
  population: number
  /** Что есть в этой стране и времени: sea, horses, coins, wine, writing, iron… События общего слоя с needs
   *  выпадают только там, где всё нужное есть. */
  features: string[]
  /** События общего слоя, которые здесь не подходят. */
  exclude_events?: string[]
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
  lifestyle: LifestyleDef[]
  vices: ViceDef[]
}

/** Страна со всем контентом: общий слой + местные события и вести. Загружается, когда нужна. */
export interface EraDef extends EraMeta {
  events: EventDef[]
  news: NewsDef[]
  primers: PrimerDef[]
  patternWeights: PatternWeights
}

/** Темы исторической справки для первых лет жизни, по порядку показа. */
export const PRIMER_TOPICS = [
  'world', 'society', 'birth', 'childhood', 'home', 'food', 'clothes', 'faith',
  'work', 'place', 'law', 'health', 'women', 'leisure', 'knowledge', 'war',
] as const
export type PrimerTopic = (typeof PRIMER_TOPICS)[number]

/**
 * Историческая справка «О твоём мире»: пока герой младенец (0–3 года), в ленте появляются карточки о времени и месте.
 * По каждой теме показывается одна карточка — самая точная из подходящих (край, сословие, вера, годы, пол).
 * Тексты: primer.<id>.title, primer.<id>.text.
 */
export interface PrimerDef {
  id: string
  topic: PrimerTopic
  regions?: string[]
  classes?: string[]
  religions?: string[]
  years?: [number, number]
  sex?: Sex
}

/** Весть из мира: исторический факт, который доходит до героя в этот год. */
export interface NewsDef {
  id: string
  year: number
  /** Где весть не показывать (там это событие и так случается с героем). */
  exclude_regions?: string[]
  confidence: 'confirmed' | 'reconstructed' | 'disputed'
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
  | { religion: string[] }
  | { religion_absent: string[] }
  /** Вера героя в его краю — вера меньшинства (меньше четверти жителей). */
  | { minority: boolean }
  | { region: string[] }
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
  | { add_npc: NpcRole; attitude?: number; newborn?: boolean; adopted?: boolean }
  | { npc_attitude: NpcTarget; delta: number }
  | { remove_npc: NpcTarget }
  | { kill_npc: NpcTarget; cause?: string }
  | { move: string }
  | { npc_profession: string }
  | { npc_married: boolean }
  | { npc_tag: string }
  | { npc_untag: string }
  | { set_lifestyle: string; option: string }
  | { kill: string }
  /** Сменить веру: id религии, 'other' — вторая по распространённости вера края, 'majority' — главная. */
  | { set_religion: string }
  /** Переехать в другой регион страны: id региона или '@capital', '@port', '@other'. */
  | { migrate: string }
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
  /** Только для этих стран / кроме этих стран (для событий общего слоя). */
  eras?: string[]
  not_eras?: string[]
  /** Что должно быть в стране (см. EraMeta.features). */
  needs?: string[]
  /** Только для этих вер: id религии или семья (christian, islamic…). */
  religions?: string[]
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
  /** Поворотный момент: случается примерно раз в 7–12 лет и меняет жизнь. */
  turning?: boolean
  /** Событие про конкретного человека: нужна живая роль, её имя доступно в тексте как {npc}. */
  npc?: NpcRole
  npc_age?: [number, number]
  /** Отбор человека события по семейному положению. */
  npc_married?: boolean
  /** Отбор человека события по метке (например, пьёт) и по её отсутствию. */
  npc_tag?: string
  npc_no_tag?: string
  /** Родственники, которые упомянуты в тексте, но это чужие люди (не нужна проверка, что они есть у героя). */
  others?: NpcRole[]
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
  dynamic?: 'profession' | 'name'
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
  /** Дело и семья взрослых детей. */
  profession?: string
  married?: boolean
  /** Метки человека: пороки, болезни, судьба (drinker, gambler, opium, arrested…). */
  tags?: string[]
}

export type TextParam = string | number | { name: string } | { key: string; sex?: Sex }

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
  /** Весть из мира. */
  news?: string
  /** Историческая справка (id карточки). */
  primer?: string
  /** Где жил герой и какой веры был, когда это случилось: тексты зависят от края и веры. */
  reg?: string
  rel?: string
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
  /** Человек, о котором было исходное событие: последствие придёт про него же. */
  npcId?: string
}

export interface Hero {
  id: string
  name: string
  sex: Sex
  birthYear: number
  era: string
  region: string
  cls: string
  /** Сословие при рождении (для наследника — сословие семьи, в которую он вошёл героем). */
  birthCls?: string
  /** Имена дедов и бабок героя (для правил имён предков у его детей). */
  ancestors?: string[]
  religion: string
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
  /** Выбранный образ жизни: категория → вариант. */
  lifestyle: Record<string, string>
  /** Дом семьи: 0 — лачуга, 1 — хижина, 2 — дом, 3 — большой дом, 4 — усадьба. */
  home: number
  /** Животные хозяйства и домашние любимцы. */
  animals: Animal[]
  /** Возраст последнего поворотного момента. */
  lastTurning: number
  deathYear?: number
  deathCause?: string
  seed: number
}

export interface Animal {
  /** chickens, goat, sheep, pig, cow, ox, donkey, horse, camel, llama, turkey, dog, cat… */
  kind: string
  /** С какого года в хозяйстве. */
  since: number
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
  religion?: string
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
  /** Когда в течение года показать событие: доля года 0…1. */
  at: number
  /** Персонаж, о котором событие, и его имя на момент события (если он уйдёт или умрёт, текст не сломается). */
  npcId?: string
  npcName?: string
  npcSex?: Sex
  variant?: number
  /** Номер записи-решения, если это отложенное последствие. */
  from?: number
  /** Выбранный вариант и итог; пока null — игрок ещё не выбрал. */
  outcome: { choiceId: string; result: 'ok' | 'success' | 'failure' } | null
}

/** year — год ещё не начался; running — год идёт (события ждут своего момента); dead — жизнь окончена. */
export type Phase = 'year' | 'running' | 'dead'

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
  /** Когда в течение текущего года появляются записи дневника: номер записи → доля года. */
  reveal: Record<number, number>
  /** Счётчики для аналитики текущей жизни (не влияют на игру). */
  stats?: LifeStats
}

export interface LifeStats {
  heroId: string
  /** Секунд игры в этой жизни (только пока открыт экран жизни). */
  sec: number
  choices: number
  /** Сколько раз защита первой жизни спасла героя. */
  rescued: number
  /** Отправленные отметки возраста. */
  milestones: number[]
}
