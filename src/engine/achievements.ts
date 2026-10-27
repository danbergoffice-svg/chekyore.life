// Награды: цели, ради которых хочется прожить ещё одну жизнь (ТЗ v3, п. 10; исходное ТЗ ACH1–ACH3).
// Условие проверяется по итогам жизни (LifeSummary) и мемориалу — поэтому награды засчитываются и задним числом.
// Во время жизни часть наград (возраст, правнуки, поколения) выдаётся сразу, по состоянию игры (live).
// Тексты: ach.<id>.title, ach.<id>.desc (условие), ach.<id>.hint (как добиться) — в src/i18n/*.json.
import { ERA_META } from '../content'
import type { GameState, LifeSummary } from './types'

export type AchGroup = 'age' | 'blood' | 'fate' | 'heart' | 'wanderer' | 'challenge' | 'land'

export interface AchDef {
  id: string
  group: AchGroup
  /** Скрыта до получения («???»). */
  secret?: boolean
  /** Только при исторической смертности. */
  hard?: boolean
  /** Награда конкретной страны (для коллекции и целей). */
  era?: string
  /** Условие по итогам жизни и всем прожитым жизням (мемориал + эта). */
  test: (life: LifeSummary, all: LifeSummary[]) => boolean
  /** Прогресс 0…1 для «Почти получилось» (только для понятных числовых целей). */
  progress?: (life: LifeSummary, all: LifeSummary[]) => number
  /** Проверка по ходу жизни: награда выдаётся сразу, а не после смерти. */
  live?: (state: GameState) => boolean
}

export interface Earned {
  id: string
  ts: number
  lifeId: string
}

/** Средневековье игры — все страны, кроме Древнего мира. */
const ANCIENT = ['E03', 'ANE']
const medieval = (era: string) => !ANCIENT.includes(era)

// ---------- Что известно о жизни ----------

function choiceKeys(life: LifeSummary): Set<string> {
  const out = new Set<string>()
  for (const d of life.diary) {
    const c = d.params?.choice
    if (c && typeof c === 'object' && 'key' in c) out.add(c.key)
  }
  return out
}

function eventIds(life: LifeSummary): Set<string> {
  return new Set(life.diary.map((d) => d.eventId).filter((x): x is string => !!x))
}

/** Все занятия за жизнь: выбранные в событии «кем стать», повышения и последнее. */
function professions(life: LifeSummary): Set<string> {
  const out = new Set<string>()
  if (life.profession) out.add(life.profession)
  for (const k of choiceKeys(life)) if (k.startsWith('prof.')) out.add(k.slice(5))
  for (const d of life.diary) {
    const p = d.params?.prof
    if (p && typeof p === 'object' && 'key' in p && p.key.startsWith('prof.')) out.add(p.key.split('.')[1])
  }
  return out
}

const hasKey = (life: LifeSummary, prefix: string) => life.diary.some((d) => d.key.startsWith(prefix))
const birthCls = (life: LifeSummary) => life.report.facts.birthCls
const partners = (life: LifeSummary) => life.report.facts.partners
const grandchildren = (life: LifeSummary) => life.npcs.filter((n) => n.role === 'grandchild').length
/** Жизни этого рода по порядку. */
const familyOf = (life: LifeSummary, all: LifeSummary[]) => all.filter((l) => l.familyId === life.familyId)
const isHistorical = (life: LifeSummary) => life.mortality === 'historical'

/** Профессия страны: награда «Самурай», «Рыцарь»… */
function profAch(id: string, era: string, prof: string): AchDef {
  return { id, group: 'land', era, test: (l) => l.era === era && professions(l).has(prof) }
}

const AGE = (id: string, n: number, extra?: (l: LifeSummary) => boolean, more: Partial<AchDef> = {}): AchDef => ({
  id,
  group: 'age',
  test: (l) => l.age >= n && (!extra || extra(l)),
  progress: (l) => (!extra || extra(l) ? Math.min(1, l.age / n) : 0),
  live: (s) => s.hero.age >= n && (!extra || extra({ era: s.hero.era } as LifeSummary)),
  ...more,
})

export const ACHIEVEMENTS: AchDef[] = [
  // Век — долголетие.
  AGE('age_60', 60),
  AGE('age_70', 70),
  AGE('age_80', 80),
  AGE('long_medieval', 85, (l) => medieval(l.era)),
  AGE('ancient_80', 80, (l) => ANCIENT.includes(l.era)),
  {
    id: 'defy_era',
    group: 'age',
    test: (l) => l.age >= l.report.comparison.expectedAdult + 25,
    progress: (l) => Math.min(1, Math.max(0, l.age / (l.report.comparison.expectedAdult + 25))),
  },
  { ...AGE('century', 100), secret: true, hard: true },
  {
    id: 'plague_survivor',
    group: 'age',
    // Эпидемия, рискованный выбор не удался (заболел), и жизнь продолжилась.
    test: (l) =>
      l.diary.some(
        (d) => !!d.eventId && /plague|black_death|smallpox|cocoliztli|epidemic/.test(d.eventId) && d.params?.result === 'failure' && l.deathYear > d.year,
      ),
  },

  // Кровь — род.
  { id: 'heir', group: 'blood', test: (l) => l.generation >= 2, live: (s) => s.hero.generation >= 2 },
  { id: 'gen_5', group: 'blood', test: (l) => l.generation >= 5, progress: (l) => Math.min(1, l.generation / 5), live: (s) => s.hero.generation >= 5 },
  { id: 'gen_10', group: 'blood', test: (l) => l.generation >= 10, progress: (l) => Math.min(1, l.generation / 10), live: (s) => s.hero.generation >= 10 },
  { id: 'via_grandchild', group: 'blood', test: (l) => hasKey(l, 'diary.heir_grand') || hasKey(l, 'diary.heir_great'), live: (s) => s.hero.diary.some((d) => d.key === 'diary.heir_grand' || d.key === 'diary.heir_great') },
  { id: 'great_grandchild', group: 'blood', test: (l) => hasKey(l, 'diary.great_grandchild_born'), live: (s) => s.hero.diary.some((d) => d.key.startsWith('diary.great_grandchild_born')) },
  {
    id: 'big_family',
    group: 'blood',
    test: (l) => l.children >= 8 || grandchildren(l) >= 15,
    progress: (l) => Math.min(1, Math.max(l.children / 8, grandchildren(l) / 15)),
  },
  {
    id: 'family_century',
    group: 'blood',
    test: (l, all) => l.deathYear - Math.min(...familyOf(l, all).map((x) => x.birthYear)) >= 100,
    progress: (l, all) => Math.min(1, (l.deathYear - Math.min(...familyOf(l, all).map((x) => x.birthYear))) / 100),
  },
  {
    id: 'family_two_centuries',
    group: 'blood',
    test: (l, all) => l.deathYear - Math.min(...familyOf(l, all).map((x) => x.birthYear)) >= 200,
    progress: (l, all) => Math.min(1, (l.deathYear - Math.min(...familyOf(l, all).map((x) => x.birthYear))) / 200),
  },
  { id: 'to_be_continued', group: 'blood', test: (l) => hasKey(l, 'diary.era_end') },

  // Жребий — судьба.
  { id: 'rags_to_riches', group: 'fate', test: (l) => ['slave', 'peasant'].includes(birthCls(l)) && ['landowner', 'noble'].includes(l.cls) },
  { id: 'freedom', group: 'fate', test: (l) => birthCls(l) === 'slave' && l.cls !== 'slave' },
  { id: 'born_in_chains', group: 'fate', test: (l) => birthCls(l) === 'slave' && l.cls !== 'slave' && l.age >= 60 && l.money >= 500 },
  { id: 'fall', group: 'fate', test: (l) => birthCls(l) === 'noble' && l.money < 0 },
  {
    id: 'master',
    group: 'fate',
    // Вершина ремесла — ступень, до которой только дослуживаются (promotion_only): мастерская, чин, игумен…
    test: (l) => [...professions(l)].some((p) => ERA_META[l.era]?.professions.some((x) => x.id === p && x.promotion_only)),
  },
  { id: 'scholar', group: 'fate', test: (l) => (l.skills?.literacy ?? 0) >= 80, progress: (l) => Math.min(1, (l.skills?.literacy ?? 0) / 80) },
  {
    id: 'pilgrim',
    group: 'fate',
    test: (l) => !!l.tags?.includes('hajji') || [...choiceKeys(l)].some((k) => /\.(pilgrimage\w*|hajj|ise|d_ise)\.(go|go_poor|join)$/.test(k) || /^ev\.f_pilgrimage_\w+\.(go|go_poor)$/.test(k)),
  },

  // Сердце — любовь и семья.
  {
    id: 'defiant',
    group: 'heart',
    test: (l) => {
      const c = choiceKeys(l)
      return (c.has('ev.fc_betrothal.refuse') || c.has('ev.mar_betrothal.ask') || c.has('ev.mar_betrothal_m.ask') || c.has('ev.mar_betrothal.hide') || c.has('ev.mar_betrothal_m.hide')) && partners(l).length > 0
    },
  },
  { id: 'golden_wedding', group: 'heart', test: (l) => partners(l).some((p) => p.years >= 50), progress: (l) => Math.min(1, Math.max(0, ...partners(l).map((p) => p.years)) / 50) },
  {
    id: 'unbroken',
    group: 'heart',
    test: (l) => {
      const p = partners(l)
      return l.age >= 60 && p.some((x, i) => x.end === 'death' && i < p.length - 1)
    },
  },
  {
    id: 'pillar',
    group: 'heart',
    test: (l) => {
      const adults = l.npcs.filter((n) => n.role === 'child' && l.deathYear - n.birthYear >= 18 && (n.alive || (n.deathYear ?? 0) - n.birthYear >= 18))
      return adults.length >= 2 && adults.every((n) => n.married)
    },
  },

  // Странник — мир.
  { id: 'traveler', group: 'wanderer', test: (l) => new Set(l.places).size >= 3, progress: (l) => Math.min(1, new Set(l.places).size / 3) },
  {
    id: 'witness',
    group: 'wanderer',
    test: (l) => l.diary.filter((d) => d.topic === 'history' && d.eventId).length >= 5,
    progress: (l) => Math.min(1, l.diary.filter((d) => d.topic === 'history' && d.eventId).length / 5),
  },
  { id: 'worlds_5', group: 'wanderer', test: (_, all) => new Set(all.map((x) => x.era)).size >= 5, progress: (_, all) => Math.min(1, new Set(all.map((x) => x.era)).size / 5) },
  { id: 'worlds_13', group: 'wanderer', test: (_, all) => new Set(all.map((x) => x.era)).size >= 13, progress: (_, all) => Math.min(1, new Set(all.map((x) => x.era)).size / 13) },
  { id: 'both_fates', group: 'wanderer', test: (l, all) => all.some((x) => x.era === l.era && x.sex !== l.sex) },

  // Питомцы.
  { id: 'faithful_friend', group: 'heart', test: (l) => l.diary.some((d) => (d.key === 'diary.pet_died_named' || d.key === 'diary.pet_gone') && (d.params?.animal as { key?: string } | undefined)?.key === 'pet.dog' && Number(d.params?.n) >= 15) },
  { id: 'old_tortoise', group: 'blood', test: (l) => l.diary.some((d) => d.key.startsWith('diary.pet_inherited') && Number(d.params?.n) >= 40) },

  // Вызов — только историческая смертность.
  {
    id: 'iron_health',
    group: 'challenge',
    hard: true,
    test: (l) => l.age >= 70 && !l.diary.some((d) => d.key.startsWith('diary.ill') || d.params?.result === 'failure') && l.history.every((y) => y.health >= 40),
  },
  { id: 'no_mistakes', group: 'challenge', hard: true, test: (l) => l.generation === 1 && !l.protectedLife && l.age >= 60 },

  // Страны: дело, которым славился край.
  profAch('centurion', 'E03', 'centurion'),
  { id: 'free_gladiator', group: 'land', era: 'E03', test: (l) => l.era === 'E03' && professions(l).has('gladiator') && l.age >= 40 },
  profAch('pharaoh_scribe', 'ANE', 'scribe'),
  profAch('embalmer', 'ANE', 'embalmer'),
  profAch('hegumen', 'BYZ', 'hegumen'),
  profAch('charioteer', 'BYZ', 'charioteer'),
  profAch('jinshi', 'CHN', 'exam_scholar'),
  profAch('porcelain', 'CHN', 'porcelain_maker'),
  profAch('debtera', 'ETH', 'debtera'),
  profAch('rock_church', 'ETH', 'church_carver'),
  profAch('knight', 'EUR', 'knight'),
  profAch('cathedral', 'EUR', 'cathedral_mason'),
  profAch('mahout', 'IND', 'mahout'),
  profAch('court_poet', 'IND', 'kavi'),
  { id: 'hajji', group: 'land', era: 'ISL', test: (l) => l.era === 'ISL' && !!l.tags?.includes('hajji') },
  profAch('astronomer', 'ISL', 'astronomer'),
  profAch('samurai', 'JPN', 'samurai'),
  profAch('tea_master', 'JPN', 'tea_master'),
  profAch('ballplayer', 'MAY', 'ballplayer'),
  profAch('jade_carver', 'MAY', 'jade_carver'),
  profAch('druzhinnik', 'RUS', 'druzhinnik'),
  profAch('bell_caster', 'RUS', 'bell_caster'),
  profAch('griot', 'WAF', 'griot'),
  profAch('gold_of_mali', 'WAF', 'gold_miner'),
  profAch('eagle_warrior', 'AMR', 'eagle_warrior'),
  profAch('chasqui', 'AMR', 'chasqui'),
]

export const ACH_BY_ID = new Map(ACHIEVEMENTS.map((a) => [a.id, a]))
export const ACH_GROUPS: AchGroup[] = ['age', 'blood', 'fate', 'heart', 'wanderer', 'challenge', 'land']

/** Засчитывается ли награда в этой жизни (трудные — только при исторической смертности). */
function allowed(a: AchDef, life: { mortality?: string }): boolean {
  return !a.hard || life.mortality === 'historical'
}

/** Новые награды по итогам жизни: life — эта жизнь, memorial — все прожитые (с ней или без). */
export function checkLife(life: LifeSummary, memorial: LifeSummary[], have: Set<string>): string[] {
  const all = memorial.some((l) => l.heroId === life.heroId) ? memorial : [...memorial, life]
  return ACHIEVEMENTS.filter((a) => !have.has(a.id) && allowed(a, life) && a.test(life, all)).map((a) => a.id)
}

/** Новые награды по ходу жизни (возраст, правнуки, поколения). */
export function checkLive(state: GameState, have: Set<string>): string[] {
  return ACHIEVEMENTS.filter((a) => a.live && !have.has(a.id) && allowed(a, state.settings) && a.live(state)).map((a) => a.id)
}

/** Задним числом — по всем жизням мемориала. */
export function checkMemorial(memorial: LifeSummary[], have: Set<string>): Earned[] {
  const got = new Set(have)
  const out: Earned[] = []
  for (const life of memorial) {
    if (!life.report || !life.diary) continue
    for (const id of checkLife(life, memorial, got)) {
      got.add(id)
      out.push({ id, ts: Date.now(), lifeId: life.heroId })
    }
  }
  return out
}

/** «Почти получилось»: 1–2 невыполненные награды с прогрессом больше 60%. */
export function nearMisses(life: LifeSummary, memorial: LifeSummary[], have: Set<string>): { id: string; progress: number }[] {
  const all = memorial.some((l) => l.heroId === life.heroId) ? memorial : [...memorial, life]
  return ACHIEVEMENTS.filter((a) => a.progress && !have.has(a.id) && !a.secret && allowed(a, life))
    .map((a) => ({ id: a.id, progress: a.progress!(life, all) }))
    .filter((x) => x.progress >= 0.6 && x.progress < 1)
    .sort((a, b) => b.progress - a.progress)
    .slice(0, 2)
}

/** Цели на следующую жизнь: три невыполненные награды — сначала по этой стране и роду, потом общие. */
export function nextGoals(life: LifeSummary | undefined, have: Set<string>): string[] {
  const open = ACHIEVEMENTS.filter((a) => !have.has(a.id) && !a.secret && !a.hard)
  const score = (a: AchDef) => (a.era && life && a.era === life.era ? 3 : 0) + (a.group === 'blood' && life ? 2 : 0) + (a.group === 'age' ? 1 : 0)
  return open
    .sort((a, b) => score(b) - score(a))
    .slice(0, 3)
    .map((a) => a.id)
}
