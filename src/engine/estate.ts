// Владения героя сверх дома: земля (наделы) и рабы. Покупаются выбором в событиях (estate_*), приносят доход каждый
// год и несут риски: неурожай, захват земли, побег и бунт рабов, просьба об освобождении. Учитываются в ставках костей,
// в наследстве, в итоге жизни и в мемориале.
//
// Рабов можно купить только там и тогда, где это было обычным и законным делом (решение владельца 06.11):
// Рим, Афины, эллинистический Египет, Новое царство и Месопотамия, халифаты и Османская держава, Византия, Мали и Сонгай,
// Киевская Русь (холопы - до ~1300 года), майя, ацтеки и инки, Делийский султанат. В Западной Европе после ~1100 года,
// в Китае, Японии и христианской Эфиопии такого выбора нет: там зависимые люди - крепостные и слуги при земле.
import { ERA_META } from '../content'
import { HOME_COST } from './household'
import { chance, int } from './rng'
import { changeParam, faithMatches, HOME_TAGS, note } from './rules'
import type { GameState, Hero } from './types'

/** Больше стольких наделов и рабов у героя не бывает (иначе это уже не семья, а поместье знати). */
export const LAND_MAX = 5
export const SLAVES_MAX = 6
/** Цена надела земли и раба без поправки на край. */
export const LAND_COST = 400
export const SLAVE_COST = 250
/** Средний доход за год: надел - десятая часть цены, раб - восьмая (за вычетом еды и одежды). */
export const LAND_INCOME = 40
export const SLAVE_INCOME = 30
/** Покупка - только если после неё останется запас: деньги не меньше цены × RESERVE. */
const RESERVE = 1.3

/** Где и когда можно купить раба: страна → края (пусто - все края) и последний год. */
const SLAVERY: Record<string, { regions?: string[]; until?: number }> = {
  E03: {},
  ANE: {},
  ISL: {},
  BYZ: {},
  WAF: {},
  AMR: {},
  MAY: {},
  RUS: { until: 1300 },
  IND: { regions: ['delhi'] },
}

export type EstateKind = 'home' | 'land' | 'slaves'

/** Рабство обычно и законно здесь и сейчас. */
export function slaveryAllowed(state: GameState): boolean {
  const rule = SLAVERY[state.hero.era]
  if (!rule) return false
  if (rule.regions && !rule.regions.includes(state.hero.region)) return false
  return rule.until === undefined || state.year <= rule.until
}

/** Поправка цен на край: в столице земля и люди дороже, в деревне - дешевле. */
function regionK(state: GameState): number {
  const tags = ERA_META[state.hero.era]?.regions.find((r) => r.id === state.hero.region)?.tags ?? []
  return tags.includes('capital') ? 1.4 : tags.includes('port') ? 1.15 : tags.includes('rural') ? 0.8 : 1
}

export const landPrice = (state: GameState) => Math.round(LAND_COST * regionK(state))
export const slavePrice = (state: GameState) => Math.round(SLAVE_COST * regionK(state))

/** Цена следующей покупки этого вида (дом - следующий по размеру). */
export function estatePrice(state: GameState, kind: EstateKind): number {
  if (kind === 'home') return HOME_COST[Math.min(4, (state.hero.home ?? 1) + 1)]
  return kind === 'land' ? landPrice(state) : slavePrice(state)
}

const free = (hero: Hero) => hero.cls !== 'slave' && !hero.tags.includes('enslaved')

/** Может ли герой сейчас купить это: свободен, взрослый, хватает денег с запасом, есть куда расти, закон края позволяет. */
export function canBuy(state: GameState, kind: EstateKind): boolean {
  const hero = state.hero
  const adult = hero.age >= (ERA_META[hero.era]?.stages.adult ?? 16)
  if (!adult || !free(hero) || hero.money < estatePrice(state, kind) * RESERVE) return false
  if (kind === 'home') return !hero.rent && (hero.home ?? 1) < 4 && !hero.tags.some((t) => HOME_TAGS.includes(t))
  if (kind === 'land') return (hero.land ?? 0) < LAND_MAX
  // Купить раба на чужбине - по законам приютившей страны; знать и купцы держат больше, бедняк - одного-двух.
  return slaveryAllowed(state) && (hero.slaves ?? 0) < SLAVES_MAX
}

/** Покупка: деньги уходят, владение растёт, запись в дневник. n - сколько наделов или рабов. */
export function buyEstate(state: GameState, kind: EstateKind, n = 1): void {
  const hero = state.hero
  if (!canBuy(state, kind)) return
  if (kind === 'home') {
    const price = estatePrice(state, 'home')
    hero.money -= price
    hero.home = (hero.home ?? 1) + 1
    changeParam(hero, 'happiness', 6)
    note(state, { key: 'diary.home_up', params: { home: { key: `home.${hero.home}` } }, major: true, topic: 'money', icon: 'move', score: 30, mood: 6 })
    return
  }
  const max = kind === 'land' ? LAND_MAX : SLAVES_MAX
  const have = (kind === 'land' ? hero.land : hero.slaves) ?? 0
  const price = estatePrice(state, kind)
  // Сколько реально по карману (с запасом) и есть ли куда.
  const count = Math.max(1, Math.min(n, max - have, Math.floor(hero.money / (price * RESERVE))))
  hero.money -= price * count
  if (kind === 'land') hero.land = have + count
  else hero.slaves = have + count
  changeParam(hero, 'happiness', 3)
  note(state, { key: `diary.estate_bought_${kind}`, params: { n: count, total: have + count }, major: true, topic: 'money', icon: 'find', score: 26, mood: 3 })
  // Своя земля делает крестьянина землевладельцем.
  if (kind === 'land' && hero.land! >= 3 && hero.cls === 'peasant' && ERA_META[hero.era]?.classes.some((c) => c.id === 'landowner')) {
    hero.cls = 'landowner'
    note(state, { key: 'diary.estate_landowner', major: true, topic: 'money', icon: 'find', score: 34, mood: 6 })
  }
}

/**
 * Потеря наделов или рабов (неурожай пришлось продать, землю отняли, раб бежал, отпущен на волю).
 * refund - какая доля цены возвращается деньгами (продажа - больше половины, отняли или бежал - ничего).
 */
export function loseEstate(state: GameState, kind: 'land' | 'slaves', n: number, refund = 0): number {
  const hero = state.hero
  const have = (kind === 'land' ? hero.land : hero.slaves) ?? 0
  const count = Math.min(have, n)
  if (count <= 0) return 0
  if (kind === 'land') hero.land = have - count
  else hero.slaves = have - count
  if (refund > 0) hero.money += Math.round(estatePrice(state, kind) * refund * count)
  return count
}

/** Сколько стоит всё, чем владеет герой, кроме денег: дом, земля, рабы. */
export function estateWorth(hero: Hero, state?: GameState): number {
  const k = state ? regionK(state) : 1
  return (hero.rent ? 0 : HOME_COST[Math.max(0, Math.min(4, hero.home ?? 0))]) + Math.round((hero.land ?? 0) * LAND_COST * k + (hero.slaves ?? 0) * SLAVE_COST * k)
}

/** Какое предложение о покупке подходит сейчас: дом, земля или рабы (по порядку того, чего не хватает). */
export function estateOffers(state: GameState): EstateKind[] {
  const out: EstateKind[] = []
  if (canBuy(state, 'home')) out.push('home')
  if (canBuy(state, 'land')) out.push('land')
  if (canBuy(state, 'slaves')) out.push('slaves')
  return out
}

/** Год владений: доход с земли по урожаю, работа рабов; в долгах - продают; где рабства нет - отпускают. */
export function estateYear(state: GameState): void {
  const hero = state.hero
  const land = hero.land ?? 0
  const slaves = hero.slaves ?? 0
  if (!land && !slaves) return
  // Рабы в краю, где рабство не в обычае (переехал, хроника сменилась): их отпускают.
  if (slaves && !slaveryAllowed(state)) {
    hero.slaves = 0
    note(state, { key: 'diary.estate_slaves_released', params: { n: slaves }, topic: 'money', score: 18 })
  }
  // Урожай: от плохого до богатого; рабы на земле поднимают доход с неё.
  if (land) {
    const harvest = 0.4 + int(state, 0, 10) / 10
    const hands = Math.min(1.25, 1 + (hero.slaves ?? 0) * 0.05)
    hero.money += Math.round(land * LAND_INCOME * harvest * hands)
  }
  if (hero.slaves) hero.money += hero.slaves * SLAVE_INCOME
  // Долги: сначала продают рабов, потом землю (дом и скот - в householdYear).
  if (hero.money < -100 && chance(state, 0.4)) {
    if (hero.slaves) {
      loseEstate(state, 'slaves', 1, 0.7)
      note(state, { key: 'diary.estate_sold_slaves', topic: 'money', icon: 'loss', score: 16, mood: -2 })
    } else if (hero.land) {
      loseEstate(state, 'land', 1, 0.7)
      changeParam(hero, 'happiness', -4)
      note(state, { key: 'diary.estate_sold_land', topic: 'money', icon: 'loss', score: 22, mood: -4, major: true })
    }
  }
}

/** Вера смотрит на рабство по-своему: ислам и христианство поощряют освобождение - совесть отзывается сильнее. */
export function manumissionPraised(state: GameState): boolean {
  return faithMatches(state.hero.religion, ['islamic', 'christian', 'jewish'])
}
