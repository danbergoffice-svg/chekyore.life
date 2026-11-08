// Хроника рода (ТЗ семейной системы, этап 5): по записям мемориала одного рода - поколения, главные события,
// история имущества и достижения рода. Только чтение итогов жизней: ничего не меняет и случайности не тратит.
// Старые записи мемориала (без имущества и учёбы детей) тоже читаются - просто там меньше строк.
import DYN from '../content/dynasty.json'
import { LAND_COST, SLAVE_COST } from './estate'
import { HOME_COST } from './household'
import type { Asset, DiaryEntry, LifeSummary } from './types'

export interface GenerationCard {
  generation: number
  heroId: string
  name: string
  sex: LifeSummary['sex']
  birthYear: number
  deathYear: number
  age: number
  era: string
  region: string
  cls: string
  profession: string | null
  archetype: string
  cause: string
  children: number
  /** Деньги и имущество рода на момент смерти (доля героя). */
  wealth: number
  /** Сколько близких потерял (смерти родных в дневнике). */
  losses: number
}

export interface ChronicleEntry {
  year: number
  generation: number
  heroId: string
  /** Чья жизнь (имя героя) - для подписи. */
  name: string
  sex: LifeSummary['sex']
  entry: DiaryEntry
}

export interface DynastyAchievement {
  id: string
  done: boolean
  /** Сколько уже есть и сколько нужно. */
  have: number
  need: number
}

export interface Chronicle {
  familyId: string
  founder: string
  generations: GenerationCard[]
  events: ChronicleEntry[]
  property: ChronicleEntry[]
  achievements: DynastyAchievement[]
  /** Годы от рождения основателя до смерти последнего. */
  span: number
  countries: string[]
  descendants: number
  peakWealth: number
}

const CLASS_RANK = ['slave', 'peasant', 'craftsman', 'trader', 'landowner', 'noble']
const rank = (cls: string) => CLASS_RANK.indexOf(cls)

const matches = (key: string, list: string[]) => list.some((k) => key === k || key.startsWith(`${k}.`) || key.startsWith(`${k}_`))

/** Доля героя в активе по снимку на момент смерти (старые снимки - целиком). */
function owned(a: Asset, heroId: string): number {
  const v = a.ownerShares?.[heroId]
  return v === undefined ? (Object.keys(a.ownerShares ?? {}).length ? 0 : 1) : v
}

export function lifeWealth(l: LifeSummary): number {
  const assets = (l.estateSnapshot?.assets ?? []).reduce((s, a) => s + a.value * owned(a, l.heroId) - (a.pledged ?? 0), 0)
  const deals = (l.tradeSnapshot?.businesses ?? []).filter((b) => b.active).reduce((s, b) => s + Math.max(0, b.capital) * Math.max(0, 1 - b.partners.reduce((x, p) => x + p.share, 0)), 0)
  // Дом, наделы и рабы - по базовым ценам (без поправки на край: для сравнения поколений этого хватает).
  const house = l.rent ? 0 : HOME_COST[Math.max(0, Math.min(4, l.home ?? 0))]
  const held = (l.land ?? 0) * LAND_COST + (l.slaves ?? 0) * SLAVE_COST
  return Math.round(Math.max(0, l.money) + assets + deals + house + held)
}

/** Жизни одного рода по порядку поколений (и по году смерти внутри поколения). */
export function familyLives(memorial: LifeSummary[], familyId: string): LifeSummary[] {
  return memorial.filter((l) => l.familyId === familyId).sort((a, b) => a.generation - b.generation || a.deathYear - b.deathYear)
}

export function familyChronicle(memorial: LifeSummary[], familyId: string): Chronicle {
  const lives = familyLives(memorial, familyId)
  const generations: GenerationCard[] = lives.map((l) => ({
    generation: l.generation,
    heroId: l.heroId,
    name: l.name,
    sex: l.sex,
    birthYear: l.birthYear,
    deathYear: l.deathYear,
    age: l.age,
    era: l.erasLived?.[0] ?? l.era,
    region: l.places?.[0] ?? l.region,
    cls: l.cls,
    profession: l.profession,
    archetype: l.report?.pattern?.code ?? '',
    cause: l.cause,
    children: l.children,
    wealth: lifeWealth(l),
    losses: (l.diary ?? []).filter((d) => d.key.startsWith('diary.death_') && d.key !== 'diary.death_far').length,
  }))
  const pick = (keys: string[], limit: number) =>
    lives.flatMap((l) => {
      const list = (l.diary ?? []).filter((d) => matches(d.key, keys))
      // В главном - не больше двух утрат на жизнь, остальное место - учёбе, делам, переездам.
      let deaths = 0
      const ranked = [...list].sort((a, b) => (b.score ?? 0) - (a.score ?? 0)).filter((d) => !d.key.startsWith('diary.death_') || ++deaths <= 2)
      const top = limit ? ranked.slice(0, limit).sort((a, b) => a.year - b.year) : list
      return top.map((entry) => ({ year: entry.year, generation: l.generation, heroId: l.heroId, name: l.name, sex: l.sex, entry }))
    })
  const events = pick(DYN.eventKeys, DYN.eventsPerLife)
  const property = pick(DYN.propertyKeys, 0)
  const countries = [...new Set(lives.flatMap((l) => l.erasLived ?? [l.era]))]
  const span = lives.length ? Math.max(...lives.map((l) => l.deathYear)) - Math.min(...lives.map((l) => l.birthYear)) : 0
  const descendants = lives.reduce((s, l) => s + (l.children ?? 0), 0)
  const ach = DYN.achievements.map((a) => {
    const have = measure(a.kind, lives, generations, span, countries.length)
    return { id: a.id, need: a.n, have, done: have >= a.n }
  })
  return {
    familyId,
    founder: lives[0]?.name ?? '',
    generations,
    events,
    property,
    achievements: ach,
    span,
    countries,
    descendants,
    peakWealth: Math.max(0, ...generations.map((g) => g.wealth)),
  }
}

/** Мера по всем жизням рода (для достижений и цели рода): см. measure. */
export function familyMeasure(kind: string, lives: LifeSummary[]): number {
  if (!lives.length) return 0
  const c = familyChronicle(lives, lives[0].familyId)
  if (kind === 'wealth') return c.peakWealth
  if (kind === 'descendants') return c.descendants
  if (kind === 'rank') return Math.max(...lives.map((l) => rank(l.cls)))
  return measure(kind, familyLives(lives, lives[0].familyId), c.generations, c.span, c.countries.length)
}

function measure(kind: string, lives: LifeSummary[], gens: GenerationCard[], span: number, countries: number): number {
  const all = lives.flatMap((l) => l.diary ?? [])
  switch (kind) {
    case 'generations':
      return new Set(lives.map((l) => l.generation)).size
    case 'span':
      return span
    case 'countries':
      return countries
    case 'elders':
      return gens.filter((g) => g.age >= DYN.elderAge).length
    case 'educated':
      return all.filter((d) => d.key.startsWith('diary.edu_done')).length
    case 'asset_generations': {
      // Сколько поколений подряд одно и то же владение оставалось в роду.
      const seen: Record<string, number> = {}
      for (const l of lives) for (const a of l.estateSnapshot?.assets ?? []) if (owned(a, l.heroId) > 0) seen[a.id] = (seen[a.id] ?? 0) + 1
      return Math.max(0, ...Object.values(seen))
    }
    case 'business_years': {
      let best = 0
      const last = lives[lives.length - 1]
      for (const l of lives)
        for (const b of l.tradeSnapshot?.businesses ?? []) best = Math.max(best, (b.closedYear ?? (l === last ? l.deathYear : l.deathYear)) - (b.foundedYear ?? l.deathYear))
      return best
    }
    case 'wills_no_dispute': {
      const wills = lives.filter((l) => (l.diary ?? []).some((d) => d.key === 'diary.will_made')).length
      const disputes = all.filter((d) => d.key === 'diary.inherit_dispute').length
      return Math.max(0, wills - disputes)
    }
    case 'rise': {
      const first = lives[0]
      if (!first) return 0
      const start = rank(first.report?.facts?.birthCls ?? first.cls)
      return lives.some((l) => rank(l.cls) > start && start >= 0) ? 1 : 0
    }
    default:
      return 0
  }
}

/** Чем род гордится сильнее всего - по этому порядку выбирается главная строка карточки. */
const PRIORITY = ['gens10', 'two_centuries', 'gens5', 'heirloom', 'century', 'merchants', 'learned', 'wanderers', 'rise', 'elders', 'peace', 'gens3']

/** Главная строка рода для карточки: самое весомое взятое достижение. */
export function headlineAchievement(c: Chronicle): DynastyAchievement | undefined {
  return PRIORITY.map((id) => c.achievements.find((a) => a.id === id && a.done)).find(Boolean)
}
