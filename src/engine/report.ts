// Итоги жизни (ТЗ, раздел 17a): всё, что показывает экран после смерти, считается здесь из
// состояния героя. Тексты собираются в интерфейсе из ключей, поэтому отчёт не зависит от языка.

import { npcAge, qx, regionOf, yearsBetween } from './rules'
import { AXES } from './types'
import type { Axis, DiaryEntry, EraDef, GameState, Hero, Icon, Npc, Sex, TextParam } from './types'

export interface Sentence {
  key: string
  params?: Record<string, TextParam>
}

export interface EraComparison {
  /** Ожидаемая продолжительность жизни при рождении по таблице эпохи. */
  expected: number
  /** Средний возраст смерти тех, кто дожил до 15 лет. */
  expectedAdult: number
  /** На сколько лет герой прожил дольше (+) или меньше (−) ожидаемого при рождении. */
  difference: number
  /** Доля родившихся в один год с героем, кто прожил дольше него. */
  outlivedBy: number
  /** Доля этой причины среди смертей в таком возрасте (по модели), если её можно оценить. */
  causeShare: number | null
  /** Сколько из 100 родившихся доживали до каждого возраста. */
  survival: number[]
  confidence: 'reconstructed'
}

export interface Partner {
  name: string
  sex: Sex
  years: number
  alive: boolean
}

export interface Facts {
  education: Sentence[]
  profession: string | null
  cls: string
  status: number
  /** Положение в обществе: выше, чем у такой доли жителей региона (0–100). */
  percentile: number
  partners: Partner[]
  children: number
  childrenAlive: number
  grandchildren: number
  /** id близких, пришедших проститься. */
  farewell: string[]
  happiestAge: number | null
  happiestReason: number | null
  places: string[]
  hobbies: string[]
  wealth: number
  timeUse: Record<string, number>
}

export interface MapYear {
  age: number
  happiness: number
  icons: Icon[]
}

export interface ChartPoint {
  age: number
  value: number
}

export interface WealthPoint extends ChartPoint {
  /** Записи дневника, объясняющие резкое изменение достатка в этот год. */
  reasons: number[]
}

export interface StatusBand {
  cls: string
  from: number
  to: number
  share: number
}

export interface LifeReport {
  biography: Sentence[]
  comparison: EraComparison
  facts: Facts
  pattern: { scores: Record<Axis, number>; code: string }
  map: MapYear[]
  keyMoments: number[]
  charts: { status: ChartPoint[]; bands: StatusBand[]; wealth: WealthPoint[]; timeUse: Record<string, number> }
}

/** Категории «на что ушли годы» по годовым фокусам. */
export const TIME_USE: Record<string, string> = {
  family: 'family',
  work: 'work',
  help_family: 'work',
  savings: 'work',
  study: 'study',
  learn: 'study',
  service: 'service',
  trade: 'road',
  religion: 'faith',
  rest: 'leisure',
  play: 'leisure',
  health: 'leisure',
}

const HOBBY_FOCUSES = ['rest', 'religion', 'study', 'health', 'family', 'trade', 'service']

// ---------- Сравнение с эпохой ----------

/** Таблица дожития по возрастам: l[x] — доля доживших до x лет. */
export function survivalTable(era: EraDef, maxAge = 100): number[] {
  const l = [1]
  for (let x = 0; x < maxAge; x++) l.push(l[x] * (1 - qx(era, x)))
  return l
}

function lifeExpectancy(l: number[], from = 0): number {
  if (l[from] <= 0) return 0
  let years = 0
  for (let x = from + 1; x < l.length; x++) years += l[x]
  return from + years / l[from] + 0.5
}

export function compareWithEra(hero: Hero, era: EraDef): EraComparison {
  const l = survivalTable(era)
  const expected = Math.round(lifeExpectancy(l))
  const age = Math.min(hero.age, l.length - 2)
  const causes = era.mortality.causes.filter((c) => hero.age >= c.ages[0] && hero.age <= c.ages[1] && (!c.conditions || c.id === hero.deathCause))
  const own = causes.find((c) => c.id === hero.deathCause)
  const total = causes.reduce((s, c) => s + c.weight, 0)
  return {
    expected,
    expectedAdult: Math.round(lifeExpectancy(l, 15)),
    difference: hero.age - expected,
    outlivedBy: Math.round(l[age + 1] * 100),
    causeShare: own && total > 0 ? Math.round((own.weight / total) * 100) : null,
    survival: l.map((v) => Math.round(v * 1000) / 10),
    confidence: 'reconstructed',
  }
}

// ---------- Узор жизни ----------

export function patternOf(hero: Hero, era: EraDef): { scores: Record<Axis, number>; code: string } {
  const scale = era.patternWeights.scale
  const scores = {} as Record<Axis, number>
  for (const axis of AXES) scores[axis] = Math.round(100 * Math.tanh(hero.pattern[axis] / scale))
  const code = AXES.map((a) => (scores[a] > 0 ? '1' : '0')).join('')
  return { scores, code }
}

/** Ключ подписи силы оси: равновесие, «скорее», «ярко». */
export function axisLabel(score: number): 'balanced' | 'slightly' | 'strongly' {
  const a = Math.abs(score)
  return a < 20 ? 'balanced' : a < 50 ? 'slightly' : 'strongly'
}

// ---------- Ключевые моменты ----------

type Period = 0 | 1 | 2 | 3

function periodOf(age: number, era: EraDef): Period {
  return age < era.stages.youth ? 0 : age < era.stages.adult ? 1 : age < era.stages.old ? 2 : 3
}

function tooManyInRow(list: number[], diary: DiaryEntry[]): boolean {
  for (let i = 2; i < list.length; i++) {
    const t = diary[list[i]].topic
    if (t && t === diary[list[i - 1]].topic && t === diary[list[i - 2]].topic) return true
  }
  return false
}

export function keyMoments(hero: Hero, era: EraDef, happiest: number | null): number[] {
  const diary = hero.diary
  const target = Math.min(16, 10 + Math.floor(hero.age / 15))
  const candidates = diary.map((_, i) => i).filter((i) => !diary[i].key.startsWith('diary.stage_'))
  if (candidates.length <= target) return candidates

  const first = 0
  const last = diary.length - 1
  const chosen = new Set<number>([first, last])
  if (happiest !== null) chosen.add(happiest)
  const byScore = candidates.filter((i) => !chosen.has(i)).sort((a, b) => (diary[b].score ?? 0) - (diary[a].score ?? 0))
  const sorted = () => [...chosen].sort((a, b) => a - b)
  const tryAdd = (i: number): boolean => {
    chosen.add(i)
    if (!tooManyInRow(sorted(), diary)) return true
    chosen.delete(i)
    return false
  }

  // Сначала — по лучшему моменту из каждого периода жизни, чтобы покрыть детство, юность, зрелость и старость.
  for (const period of [0, 1, 2, 3] as Period[]) {
    if ([...chosen].some((i) => periodOf(diary[i].age, era) === period)) continue
    const inPeriod = byScore.filter((i) => periodOf(diary[i].age, era) === period)
    if (!inPeriod.some((i) => tryAdd(i)) && inPeriod.length) chosen.add(inPeriod[0])
  }
  for (const i of byScore) {
    if (chosen.size >= target) break
    if (!chosen.has(i)) tryAdd(i)
  }
  return sorted()
}

// ---------- Факты ----------

function education(hero: Hero): Sentence[] {
  const out: Sentence[] = []
  const lit = hero.skills.literacy ?? 0
  out.push({ key: lit >= 30 ? 'facts.edu.literate' : lit >= 10 ? 'facts.edu.some' : 'facts.edu.none' })
  if (hero.tags.includes('schooled')) out.push({ key: 'facts.edu.school' })
  if (hero.tags.includes('philosophy')) out.push({ key: 'facts.edu.philosophy' })
  if (hero.npcs.some((n) => n.role === 'mentor')) out.push({ key: 'facts.edu.mentor' })
  const best = Object.entries(hero.skills).filter(([s, v]) => s !== 'literacy' && v >= 20).sort((a, b) => b[1] - a[1])[0]
  if (best) out.push({ key: 'facts.edu.skill', params: { skill: { key: `skill.${best[0]}` } } })
  return out
}

function percentileOf(hero: Hero, era: EraDef, status: number): number {
  const region = regionOf(era, hero.region)
  const classes = era.classes.filter((c) => (region.classWeights[c.id] ?? 0) > 0).sort((a, b) => a.status - b.status)
  const total = classes.reduce((s, c) => s + region.classWeights[c.id], 0)
  let below = 0
  for (const c of classes) {
    const share = region.classWeights[c.id] / total
    if (c.id === hero.cls) {
      const within = Math.max(0, Math.min(1, (status - c.status + 10) / 20))
      return Math.round((below + share * within) * 100)
    }
    below += share
  }
  return Math.round(below * 100)
}

function statusBands(hero: Hero, era: EraDef): StatusBand[] {
  const region = regionOf(era, hero.region)
  const classes = era.classes.filter((c) => (region.classWeights[c.id] ?? 0) > 0).sort((a, b) => a.status - b.status)
  const total = classes.reduce((s, c) => s + region.classWeights[c.id], 0)
  return classes.map((c, i) => ({
    cls: c.id,
    from: i === 0 ? 0 : Math.round((classes[i - 1].status + c.status) / 2),
    to: i === classes.length - 1 ? 100 : Math.round((c.status + classes[i + 1].status) / 2),
    share: Math.round((region.classWeights[c.id] / total) * 100),
  }))
}

function timeUse(hero: Hero, era: EraDef): Record<string, number> {
  const counts: Record<string, number> = {}
  const years = hero.history.filter((y) => y.age >= era.stages.youth && y.focus)
  for (const y of years) {
    const cat = TIME_USE[y.focus!] ?? 'leisure'
    counts[cat] = (counts[cat] ?? 0) + 1
  }
  const total = years.length || 1
  for (const k of Object.keys(counts)) counts[k] = Math.round((counts[k] / total) * 100)
  return counts
}

function partners(hero: Hero, deathYear: number): Partner[] {
  return hero.npcs
    .filter((n) => n.role === 'spouse')
    .map((n) => ({ name: n.name, sex: n.sex, years: Math.max(0, yearsBetween(n.since ?? deathYear, n.deathYear ?? deathYear)), alive: n.alive }))
}

function happiest(hero: Hero): { age: number | null; reason: number | null } {
  if (hero.history.length === 0) return { age: null, reason: null }
  const best = hero.history.reduce((a, b) => (b.happiness > a.happiness ? b : a))
  const sameYear = hero.diary.map((d, i) => [d, i] as const).filter(([d]) => d.age === best.age && (d.mood ?? 0) > 0)
  const reason = sameYear.sort((a, b) => (b[0].mood ?? 0) - (a[0].mood ?? 0))[0]?.[1] ?? null
  return { age: best.age, reason }
}

function facts(state: GameState, era: EraDef): Facts {
  const hero = state.hero
  const deathYear = hero.deathYear ?? state.year
  const last = hero.history[hero.history.length - 1]
  const status = last?.status ?? 0
  const kids = hero.npcs.filter((n) => n.role === 'child')
  const counts: Record<string, number> = {}
  for (const y of hero.history) if (y.focus) counts[y.focus] = (counts[y.focus] ?? 0) + 1
  const hobbies = HOBBY_FOCUSES.filter((f) => (counts[f] ?? 0) >= 3).sort((a, b) => counts[b] - counts[a]).slice(0, 3)
  const h = happiest(hero)
  return {
    education: education(hero),
    profession: hero.profession,
    cls: hero.cls,
    status,
    percentile: percentileOf(hero, era, status),
    partners: partners(hero, deathYear),
    children: kids.length,
    childrenAlive: kids.filter((k) => k.alive).length,
    grandchildren: hero.npcs.filter((n) => n.role === 'grandchild').length,
    farewell: hero.npcs.filter((n) => n.alive && n.attitude >= 20).slice(0, 6).map((n) => n.id),
    happiestAge: h.age,
    happiestReason: h.reason,
    places: hero.places,
    hobbies,
    wealth: hero.money,
    timeUse: timeUse(hero, era),
  }
}

// ---------- Жизнеописание ----------

function biography(state: GameState, f: Facts, cmp: EraComparison): Sentence[] {
  const hero = state.hero
  const out: Sentence[] = []
  // Сословие при рождении: оно могло измениться (например, раб получил свободу).
  const born = hero.diary.find((d) => d.key === 'diary.born')?.params?.cls
  const birthCls = born && typeof born === 'object' && 'key' in born ? born.key.replace('class.', '') : hero.cls
  out.push({ key: hero.generation > 1 ? 'bio.born_heir' : 'bio.born', params: { region: { key: `region.${hero.region}.in` }, cls: { key: `class.${birthCls}.family` } } })
  out.push(f.education[0])
  if (f.profession) out.push({ key: 'bio.work', params: { prof: { key: `prof.${f.profession}.as` } } })
  const p = f.partners[0]
  if (p) out.push({ key: 'bio.married', params: { who: { name: p.name }, psex: p.sex, n: p.years } })
  if (f.children > 0) out.push({ key: f.grandchildren > 0 ? 'bio.children_grand' : 'bio.children', params: { n: f.children, alive: f.childrenAlive, grand: f.grandchildren } })
  else out.push({ key: 'bio.no_children' })
  const history = hero.diary.filter((d) => d.topic === 'history' && d.key.startsWith('ev.')).slice(0, 3)
  if (history.length) out.push({ key: 'bio.history', params: { list: history.map((d) => d.key).join('|') } })
  out.push({ key: 'bio.death', params: { n: hero.age, cause: { key: `cause.${hero.deathCause ?? 'unknown'}` }, diff: cmp.difference } })
  return out.slice(0, 7)
}

// ---------- Сборка ----------

export function buildReport(state: GameState, era: EraDef): LifeReport {
  const hero = state.hero
  const cmp = compareWithEra(hero, era)
  const f = facts(state, era)
  const iconsByAge = new Map<number, Icon[]>()
  for (const d of hero.diary) if (d.icon) iconsByAge.set(d.age, [...(iconsByAge.get(d.age) ?? []), d.icon])
  const map = hero.history.map((y) => ({ age: y.age, happiness: y.happiness, icons: iconsByAge.get(y.age) ?? [] }))

  const wealth: WealthPoint[] = hero.history.map((y, i) => {
    const prev = i > 0 ? hero.history[i - 1].money : y.money
    const delta = y.money - prev
    const big = Math.abs(delta) >= Math.max(80, Math.abs(prev) * 0.3)
    const reasons = big
      ? hero.diary.map((d, idx) => [d, idx] as const).filter(([d]) => d.age === y.age && (d.topic === 'money' || d.key === 'diary.heir' || d.icon === 'loss' || d.icon === 'find' || d.icon === 'disaster')).map(([, idx]) => idx)
      : []
    return { age: y.age, value: y.money, reasons }
  })

  return {
    biography: biography(state, f, cmp),
    comparison: cmp,
    facts: f,
    pattern: patternOf(hero, era),
    map,
    keyMoments: keyMoments(hero, era, f.happiestReason),
    charts: {
      status: hero.history.map((y) => ({ age: y.age, value: y.status })),
      bands: statusBands(hero, era),
      wealth,
      timeUse: f.timeUse,
    },
  }
}

/** Мини-древо для блока «Связь с родом». */
export function familyLinks(hero: Hero, year: number): { parents: Npc[]; spouses: Npc[]; children: (Npc & { kids: Npc[] })[] } {
  return {
    parents: hero.npcs.filter((n) => n.role === 'father' || n.role === 'mother'),
    spouses: hero.npcs.filter((n) => n.role === 'spouse'),
    children: hero.npcs
      .filter((n) => n.role === 'child')
      .map((c) => ({ ...c, kids: hero.npcs.filter((g) => g.role === 'grandchild' && g.parentId === c.id) }))
      .sort((a, b) => npcAge(b, year) - npcAge(a, year)),
  }
}
