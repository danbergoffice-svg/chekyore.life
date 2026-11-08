// Предприятия и товарищества (ТЗ семейной системы, этап 4, вторая и третья очередь): артель, торговый дом, караван,
// морская торговля. Герой вносит капитал, может взять компаньонов из родни и друзей (их вклад - капитал, их доля -
// часть прибыли). Каждый год - доход по удаче, навыку и доброму имени, минус расходы; прибыль делится по долям,
// убыток съедает капитал. Ниже трети вклада - разорение: дело закрывают и делят остаток. Компаньон в ссоре может
// уйти со своей долей. Форма товарищества - своя в каждой стране (societas, мудараба, артель…): src/content/business.json.
import { ERA_META } from '../content'
import BIZ from '../content/business.json'
import { chance, int } from './rng'
import { changeParam, note, npcAge } from './rules'
import { initializeTrade } from './trade'
import type { Business, BusinessPartner, GameState, Npc } from './types'

interface BizDef {
  id: string
  capital: number
  return: number
  expenses: number
  skill: string
  needs?: string[]
  classes: string[]
}
const B = BIZ as typeof BIZ & { types: BizDef[]; forms: Record<string, string> }

type BizEvent = 'business_created' | 'business_closed'
let listener: ((kind: BizEvent, state: GameState, params: Record<string, string | number>) => void) | undefined
export function onBusinessEvent(fn: typeof listener): void {
  listener = fn
}

export const businessDef = (type: string) => B.types.find((t) => t.id === type)
export const businessTypes = () => B.types.map((t) => t.id)
/** Как называлось товарищество в этой стране (ключ текста business.form.*). */
export const businessForm = (era: string) => B.forms[era] ?? 'partnership'

/** Доля героя (рода) в деле. */
export const heroStake = (b: Business) => Math.max(0, 1 - b.partners.reduce((s, p) => s + p.share, 0))

const active = (state: GameState) => (state.family.trade?.businesses ?? []).filter((b) => b.active)

/** Почему нельзя основать дело (ключ текста) или undefined. */
export function businessLock(state: GameState, type: string, capital: number): string | undefined {
  const def = businessDef(type)
  const hero = state.hero
  const meta = ERA_META[hero.era]
  if (!def || (def.needs && !def.needs.some((f) => meta?.features.includes(f)))) return 'business.lock.era'
  if (!def.classes.includes(hero.cls)) return 'business.lock.class'
  if (hero.age < (meta?.stages.adult ?? 16)) return 'business.lock.young'
  if (active(state).length >= B.maxActive) return 'business.lock.max'
  if (capital < def.capital) return 'business.lock.small'
  if (hero.money < capital) return 'business.lock.money'
  return undefined
}

export interface BusinessInput {
  type: string
  capital: number
  name?: string
}

export function createBusiness(state: GameState, input: BusinessInput): Business | undefined {
  if (businessLock(state, input.type, input.capital)) return undefined
  const trade = initializeTrade(state)
  const b: Business = {
    id: `b${state.nextId++}`,
    type: input.type,
    name: input.name ?? businessForm(state.hero.era),
    region: state.hero.region,
    capital: input.capital,
    initial: input.capital,
    partners: [],
    inventory: { goods: [], capacity: 0 },
    income: 0,
    expenses: 0,
    reputation: B.reputation.start,
    active: true,
    foundedYear: state.year,
  }
  state.hero.money -= input.capital
  trade.businesses.push(b)
  note(state, { key: 'diary.business_founded', params: { what: { key: `business.type.${b.type}` }, form: { key: `business.form.${businessForm(state.hero.era)}` }, money: b.capital }, topic: 'money', icon: 'find', score: 30, mood: 4, major: true })
  listener?.('business_created', state, { type: b.type, capital: b.capital })
  return b
}

/** Кого можно взять в компаньоны: взрослые живые родные и друзья рядом, ещё не в этом деле. */
export function partnerCandidates(state: GameState, b: Business): Npc[] {
  return state.hero.npcs.filter(
    (n) => n.alive && !n.away && npcAge(n, state.year) >= B.partnerMinAge && ['spouse', 'child', 'sibling', 'friend', 'grandchild'].includes(n.role) && !b.partners.some((p) => p.npcId === n.id),
  )
}

/**
 * Взять компаньона с долей share: его вклад добавляется к капиталу так, чтобы доля была честной
 * (вклад = капитал × share / (доля героя − share)). Доли вместе - не больше 100%, у героя остаётся хоть десятая часть.
 */
export function addPartner(state: GameState, businessId: string, npcId: string, share: number): boolean {
  const b = state.family.trade?.businesses.find((x) => x.id === businessId && x.active)
  const npc = state.hero.npcs.find((n) => n.id === npcId)
  if (!b || !npc || !(share > 0) || share > 0.9) return false
  if (!partnerCandidates(state, b).includes(npc)) return false
  const mine = heroStake(b)
  if (mine - share < 0.1 - 1e-9) return false
  // Вклад компаньона растит капитал; прежние доли пересчитываются пропорционально.
  const add = Math.round((b.capital * share) / (1 - share))
  const k = 1 - share
  for (const p of b.partners) p.share = p.share * k
  b.partners.push({ npcId, name: npc.name, share, role: npc.role })
  b.capital += add
  npc.attitude = Math.min(100, npc.attitude + 5)
  note(state, { key: 'diary.business_partner', params: { who: { name: npc.name }, sex: npc.sex, money: add }, topic: 'money', score: 16 })
  return true
}

/** Год дела: доход по удаче, навыку и имени, расходы, раздел прибыли, ссоры компаньонов, разорение. */
export function businessYear(state: GameState): void {
  const hero = state.hero
  for (const b of active(state)) {
    if (b.foundedYear === state.year) continue
    const def = businessDef(b.type)
    if (!def) continue
    const luck = int(state, B.luck[0], B.luck[1]) / 10
    const skill = 1 + (hero.skills[def.skill] ?? 0) * B.skillBonus
    const name = 1 + (b.reputation - 50) / 200
    b.income = Math.round(b.capital * def.return * luck * skill * name)
    b.expenses = Math.round(b.capital * def.expenses)
    const profit = b.income - b.expenses
    if (profit > 0) {
      // Прибыль - по долям: роду его часть, компаньонам их (они уносят её домой).
      hero.money += Math.round(profit * heroStake(b))
      b.reputation = Math.min(100, b.reputation + B.reputation.good)
    } else {
      b.capital += profit
      b.reputation = Math.max(0, b.reputation + B.reputation.bad)
    }
    // Компаньон, с которым не ладят, уходит со своей долей капитала.
    for (const p of [...b.partners]) {
      const npc = hero.npcs.find((n) => n.id === p.npcId)
      const gone = !npc || !npc.alive || !!npc.away
      if (gone || (npc!.attitude < B.conflict.attitudeBelow && chance(state, B.conflict.chance))) {
        const take = Math.round(b.capital * p.share)
        b.capital -= take
        b.partners = b.partners.filter((x) => x !== p)
        const rest = 1 - p.share
        for (const q of b.partners) q.share = rest > 0 ? q.share / rest : 0
        note(state, { key: gone ? 'diary.business_partner_gone' : 'diary.business_quarrel', params: { who: { name: p.name ?? '' }, money: take }, topic: 'money', icon: 'loss', score: 20, mood: gone ? 0 : -3, major: !gone })
      }
    }
    if (b.capital < (b.initial ?? b.capital) * B.bankrupt) {
      changeParam(hero, 'happiness', -6)
      closeBusiness(state, b.id, true)
    }
  }
}

/** Закрыть дело: остаток капитала делится по долям, роду - его часть. bankrupt - разорилось. */
export function closeBusiness(state: GameState, businessId: string, bankrupt = false): number {
  const b = state.family.trade?.businesses.find((x) => x.id === businessId && x.active)
  if (!b) return 0
  const left = Math.max(0, b.capital)
  const mine = Math.round(left * heroStake(b))
  const shares: Record<string, number> = { hero: mine }
  for (const p of b.partners) shares[p.npcId] = Math.round(left * p.share)
  state.hero.money += mine
  b.active = false
  b.closedYear = state.year
  b.capital = 0
  note(state, { key: bankrupt ? 'diary.business_bankrupt' : 'diary.business_closed', params: { what: { key: `business.type.${b.type}` }, money: mine }, topic: 'money', icon: bankrupt ? 'loss' : 'find', score: bankrupt ? 34 : 20, mood: bankrupt ? -6 : 0, major: bankrupt })
  listener?.('business_closed', state, { type: b.type, bankrupt: bankrupt ? 1 : 0, money: mine, years: state.year - (b.foundedYear ?? state.year) })
  return mine
}

/** Раздел остатка при закрытии - для тестов и итогов: сколько кому (hero и id компаньонов). */
export function closingShares(b: Business): Record<string, number> {
  const out: Record<string, number> = { hero: b.capital * heroStake(b) }
  for (const p of b.partners as BusinessPartner[]) out[p.npcId] = b.capital * p.share
  return out
}
