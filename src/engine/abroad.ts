// Переезд в другую страну (ТЗ v3, п. 11): куда можно уехать в эту эпоху, сам переезд, жизнь на чужбине
// (вживание, принятие, тоска), желание вернуться раз в три года, возвращение и натурализация.
// Маршруты — src/content/routes.json: только реальные пути своего времени; в Америку — никогда.
import { ERA_META, isEraLoaded } from '../content'
import ROUTES from '../content/routes.json'
import { chance, int, weighted } from './rng'
import { aliveNpcs, changeParam, clamp, HOME_TAGS, isMinority, note, sendAway } from './rules'
import { isPet } from './pets'
import type { Abroad, EmigrationReason, FocusDef, GameState, RegionDef } from './types'

export interface Route {
  from: string
  to: string
  kind: 'neighbor' | 'far'
  years: [number, number]
  /** Куда обычно приезжали (края страны назначения). */
  regions?: string[]
  note?: string
}

const ALL = ROUTES.routes as Route[]

/** Куда вообще ведут дороги из этой страны (для заблаговременной загрузки). */
export function routeTargets(eraId: string): string[] {
  return [...new Set(ALL.filter((r) => r.from === eraId).map((r) => r.to))]
}

/**
 * Можно ли сейчас перейти в эту страну. В браузере контент грузится после переезда (App), в симуляции —
 * страна должна быть уже загружена (loadAllEras), иначе играть дальше нечем.
 */
let eraAvailable = (id: string) => isEraLoaded(id)
export function setEraAvailability(fn: (id: string) => boolean): void {
  eraAvailable = fn
}

const regionsAt = (era: string, year: number) => (ERA_META[era]?.regions ?? []).filter((r) => year >= r.years[0] && year <= r.years[1])

/** Маршруты из страны героя, открытые в этот год; страна назначения должна прожить ещё хотя бы 20 лет. */
export function routesNow(state: GameState, kind?: 'neighbor' | 'far'): Route[] {
  const y = state.year
  return ALL.filter((r) => {
    if (r.from !== state.hero.era || (kind && r.kind !== kind)) return false
    if (y < r.years[0] || y > r.years[1]) return false
    const meta = ERA_META[r.to]
    if (!meta || y < meta.years[0] || y + 20 > meta.years[1]) return false
    return eraAvailable(r.to) && regionsAt(r.to, y).length > 0
  })
}

/** Есть ли куда уехать: '@neighbor', '@far', '@any' или id страны. */
export function canEmigrate(state: GameState, spec: string): boolean {
  if (state.hero.abroad && !state.hero.abroad.naturalized) return false
  if (spec === '@neighbor') return routesNow(state, 'neighbor').length > 0
  if (spec === '@far') return routesNow(state, 'far').length > 0
  if (spec === '@any') return routesNow(state).length > 0
  return routesNow(state).some((r) => r.to === spec)
}

/** Сословие после переезда — по поводу: беженец опускается на ступень, пленник становится рабом. */
const DOWN: Record<string, string> = { noble: 'landowner', landowner: 'trader', trader: 'craftsman', craftsman: 'peasant', peasant: 'peasant', slave: 'slave' }

/** Цена животного хозяйства при продаже перед дорогой. */
const STOCK_PRICE: Record<string, number> = { chickens: 10, turkey: 15, goat: 30, sheep: 30, pig: 40, llama: 60, donkey: 80, cow: 120, ox: 150, camel: 250, horse: 300 }

/**
 * Переехать: страна и край по маршруту, имущество продаётся с потерей, сословие и дело — по поводу и по новой
 * стране, родня (и те, кто не едет) остаются «на родине» (away 'homeland'). Вернёт false, если ехать некуда.
 */
export function emigrate(state: GameState, spec: string, reason: EmigrationReason, family: 'all' | 'alone' | 'sons' = 'all'): boolean {
  const hero = state.hero
  const kind = spec === '@neighbor' ? 'neighbor' : spec === '@far' ? 'far' : undefined
  const options = routesNow(state, kind).filter((r) => spec.startsWith('@') || r.to === spec)
  const route = weighted(state, options, (r) => (r.kind === 'neighbor' ? 3 : 1))
  if (!route) return false
  const y = state.year
  const all = regionsAt(route.to, y)
  const preferred = all.filter((r) => route.regions?.includes(r.id))
  const region = weighted(state, preferred.length ? preferred : all, (r) => r.weight) as RegionDef
  const meta = ERA_META[route.to]
  const home = { era: hero.era, region: hero.region }
  const far = route.kind === 'far'

  // Имущество: скот продают за полцены, дом — с потерей; дорога стоит денег (далеко — дороже).
  let money = hero.money
  for (const a of hero.animals ?? []) if (!isPet(a.kind)) money += (STOCK_PRICE[a.kind] ?? 30) * 0.5
  hero.animals = (hero.animals ?? []).filter((a) => isPet(a.kind) && (a.kind === 'dog' || a.kind === 'cat' || a.kind === 'parrot' || a.kind === 'songbird' || family === 'all'))
  money = money > 0 ? money * (far ? 0.6 : 0.75) : money
  hero.money = Math.round(money - (far ? 120 : 40))
  hero.home = Math.min(hero.home ?? 1, hero.money > 600 ? 2 : 1)
  hero.tags = hero.tags.filter((t) => !HOME_TAGS.includes(t))

  // Сословие и дело.
  if (reason === 'captive') {
    hero.cls = 'slave'
    if (!hero.tags.includes('enslaved')) hero.tags.push('enslaved')
  } else if (reason === 'refugee' || reason === 'exile') hero.cls = DOWN[hero.cls] ?? hero.cls
  if (hero.profession && !meta.professions.some((p) => p.id === hero.profession)) hero.profession = meta.professions.some((p) => p.id === 'laborer') ? 'laborer' : null
  if (reason === 'captive') hero.profession = meta.professions.some((p) => p.id === 'household_slave') ? 'household_slave' : hero.profession

  // Кто остаётся на родине: родители, братья и сёстры, взрослые дети со своими семьями, друзья —
  // и супруг с детьми, если герой едет один (или только с сыновьями).
  for (const n of hero.npcs.filter((n) => n.alive && !n.away)) {
    const goes =
      (n.role === 'spouse' && family === 'all') ||
      (n.role === 'child' && !n.married && (family === 'all' || (family === 'sons' && n.sex === 'm')))
    if (!goes) sendAway(state, n, 'homeland', true)
  }

  // Края страны: метки старого края уходят, приходят метки нового.
  const oldRegion = ERA_META[home.era]?.regions.find((r) => r.id === home.region)
  hero.tags = hero.tags.filter((t) => !(oldRegion?.tags ?? []).includes(t)).concat(region.tags ?? [])
  hero.era = route.to
  hero.region = region.id
  if (hero.places[hero.places.length - 1] !== region.id) hero.places.push(region.id)
  hero.erasLived = [...new Set([...(hero.erasLived ?? [home.era]), route.to])]
  hero.abroad = {
    homeland: home,
    since: y,
    reason,
    far,
    integration: hero.age < 12 ? 50 : hero.age < 20 ? 30 : 15,
    acceptance: 40 - (isMinority(state) ? 15 : 0) - (far ? 5 : 0),
    homesick: 30,
    refusals: 0,
    nextAsk: y + 3,
  }
  note(state, {
    key: `diary.emigrated_${reason}`,
    params: { place: { key: `region.${region.id}` }, country: { key: `era.${route.to}` }, far: far ? 1 : 0 },
    major: true,
    topic: 'life',
    icon: 'move',
    score: 60,
    mood: reason === 'captive' || reason === 'refugee' ? -10 : 2,
  })
  changeParam(hero, 'stress', 10)
  // Остальные события этого года — уже в другой стране: недоигранные старые снимаем.
  state.queue = state.queue.slice(0, 1)
  // Дорога опасна: далеко — гибнут чаще, близко — редко.
  if (chance(state, far ? 0.05 : 0.012)) {
    hero.alive = false
    hero.deathCause = 'accident'
    hero.deathYear = y
  }
  return true
}

/** Вернуться домой. Если родной страны уже нет в игре (хроника кончилась) — вернуться некуда. */
export function returnHome(state: GameState): boolean {
  const hero = state.hero
  const a = hero.abroad
  if (!a) return false
  const y = state.year
  const meta = ERA_META[a.homeland.era]
  if (!meta || y > meta.years[1] || !eraAvailable(a.homeland.era)) {
    note(state, { key: 'diary.no_homeland', params: { country: { key: `era.${a.homeland.era}` } }, topic: 'life', score: 20, mood: -4 })
    return false
  }
  const all = regionsAt(a.homeland.era, y)
  const region = all.find((r) => r.id === a.homeland.region) ?? (weighted(state, all, (r) => r.weight) as RegionDef)
  hero.money = Math.round(hero.money - (a.far ? 120 : 40))
  hero.home = Math.min(hero.home ?? 1, 2)
  const oldRegion = ERA_META[hero.era]?.regions.find((r) => r.id === hero.region)
  hero.tags = hero.tags.filter((t) => !(oldRegion?.tags ?? []).includes(t)).concat(region.tags ?? [], 'just_returned')
  // Оставшиеся на родине снова рядом.
  for (const n of hero.npcs) if (n.away?.reason === 'homeland') n.away = undefined
  if (!hero.tags.includes('married') && aliveNpcs(hero, 'spouse').length) hero.tags.push('married')
  hero.returned = { year: y, years: y - a.since }
  hero.era = a.homeland.era
  hero.region = region.id
  if (hero.places[hero.places.length - 1] !== region.id) hero.places.push(region.id)
  hero.erasLived = [...new Set([...(hero.erasLived ?? []), hero.era])]
  hero.abroad = undefined
  note(state, { key: 'diary.returned_home', params: { place: { key: `region.${region.id}` }, n: y - a.since }, major: true, topic: 'life', icon: 'move', score: 50, mood: 6 })
  state.queue = state.queue.slice(0, 1)
  return true
}

/**
 * Год на чужбине: вживание растёт (быстрее в молодости, с местным супругом), принятие — по вере и репутации,
 * тоска — от одиночества и мыслей о доме. Первые годы — культурный шок. Возвращает множитель дохода.
 */
export function abroadYear(state: GameState, focus: FocusDef | null): number {
  const hero = state.hero
  const a = hero.abroad
  if (!a) return 1
  const years = state.year - a.since
  if (a.naturalized) {
    a.integration = clamp(a.integration + 1)
    return 0.9 + a.integration / 400 + a.acceptance / 400
  }
  const age = hero.age
  const localSpouse = aliveNpcs(hero, 'spouse').some((s) => (s.since ?? 0) > a.since)
  const family = aliveNpcs(hero, 'spouse').length + aliveNpcs(hero, 'child').length
  // Работа и торговля среди местных — лучшая школа языка и обычаев.
  a.integration = clamp(a.integration + (age < 12 ? 10 : age < 25 ? 6 : age < 45 ? 4 : 2) + (localSpouse ? 4 : 0) + (focus && ['work', 'trade', 'service', 'learn'].includes(focus.id) ? 2 : 0) - (isMinority(state) ? 1 : 0))
  a.acceptance = clamp(a.acceptance + (hero.hidden.reputation > 20 ? 2 : 0) + (isMinority(state) ? -2 : 1) + (a.integration > 50 ? 2 : 0) + int(state, -3, 3))
  a.homesick = clamp(a.homesick + 4 + (hero.hidden.loneliness > 50 ? 4 : 0) - Math.round(a.integration / 15) - (family > 0 ? 3 : 0) - (localSpouse ? 3 : 0))
  if (years <= 4) {
    // Культурный шок: всё чужое — язык, еда, обычаи.
    changeParam(hero, 'stress', 3)
    changeParam(hero, 'happiness', -2)
  }
  if (a.homesick > 60) changeParam(hero, 'happiness', -3)
  if (a.acceptance < 25) changeParam(hero, 'stress', 3)
  // Доход: первые годы ниже, потом — по вживанию и принятию (у вжившихся купцов и мастеров — выше, чем дома).
  if (years < 3) return 0.7
  const skilled = hero.cls === 'trader' || hero.cls === 'craftsman'
  return Math.min(skilled ? 1.5 : 1.3, 0.75 + a.integration / 250 + a.acceptance / 250)
}

/** Пора ли спросить «вернуться домой?» (раз в три года, пока не стал здешним). */
export function homesickDue(state: GameState): boolean {
  const a = state.hero.abroad
  return !!a && (!a.naturalized || !!a.planned) && state.year >= a.nextAsk && state.hero.age >= 12
}

/** «Задумать возвращение»: вопрос «вернуться?» придёт в следующем году — даже тому, кто стал здешним. */
export function planReturn(state: GameState): void {
  const a = state.hero.abroad
  if (!a) return
  a.planned = true
  a.nextAsk = state.year + 1
  a.homesick = Math.max(a.homesick, 45)
}

/** Пора ли стать здешним: несколько отказов вернуться и вживание 60+ — или долгие годы и вживание 75+. */
export function naturalizeDue(state: GameState): boolean {
  const a = state.hero.abroad
  if (!a || a.naturalized) return false
  return (a.refusals >= 2 && a.integration >= 60) || (state.year - a.since >= 12 && a.integration >= 75)
}

/** Решение о возвращении: остаться (счёт отказов), подумать ещё (спросить через год). */
export function abroadChoice(state: GameState, choice: 'stay' | 'later'): void {
  const a = state.hero.abroad
  if (!a) return
  a.planned = false
  if (choice === 'stay') {
    a.refusals += 1
    a.homesick = clamp(a.homesick - 10)
    a.nextAsk = state.year + 3
  } else a.nextAsk = state.year + 1
}

export function naturalize(state: GameState): void {
  const a = state.hero.abroad
  if (!a || a.naturalized) return
  a.naturalized = state.year
  a.acceptance = clamp(a.acceptance + 15)
  a.homesick = clamp(a.homesick - 30)
}

/** Скрытые параметры чужбины для условий и эффектов контента. */
export const ABROAD_PARAMS = ['integration', 'acceptance', 'homesick'] as const
export type AbroadParam = (typeof ABROAD_PARAMS)[number]
export function abroadParam(state: { hero: { abroad?: Abroad } }, id: AbroadParam): number {
  return state.hero.abroad?.[id] ?? 0
}
