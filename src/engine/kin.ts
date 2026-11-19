// Близкие (вкладка «Близкие», 20.11): что герой делает для родных и как тепло или холод отношений сказывается на жизни.
// Отношение - Npc.attitude (−100…100, «тепло — холодно»). С каждым человеком - одно действие в год:
//  • супруг(а): знак внимания (даром), свидание, дорогой подарок или холодность;
//  • родители, братья и сёстры, взрослые дети: навестить, помочь деньгами или отдалиться.
// Детям - учитель (гувернантка), учение своему делу дома, спорт или воинское учение, присмотр за учёбой
// (src/engine/children.ts: учёба и сватовство - там же). Раз в год (kinYear): тёплая родня выручает в долгах,
// холодная - ссорится; от тепла детей зависит и спор о наследстве (inheritance.ts).
// Каждая трата - запись в дневник ровно на ту сумму, на которую изменились деньги.
import { chance } from './rng'
import { changeParam, note, npcAge } from './rules'
import { ERA_META } from '../content'
import type { GameState, Npc } from './types'

export type KinAction = 'attention' | 'date' | 'gift' | 'cold' | 'visit' | 'help' | 'distance'

/** Цена (доля годовых расходов сословия) и сдвиг отношения. */
export const KIN: Record<KinAction, { cost: number; attitude: number; happiness?: number; stress?: number }> = {
  attention: { cost: 0, attitude: 5, happiness: 1 },
  date: { cost: 0.08, attitude: 9, happiness: 3 },
  gift: { cost: 0.3, attitude: 15, happiness: 2 },
  cold: { cost: 0, attitude: -12, stress: -2 },
  visit: { cost: 0, attitude: 6, happiness: 1 },
  help: { cost: 0.25, attitude: 12 },
  distance: { cost: 0, attitude: -10, stress: -1 },
}

/** Что можно сделать для этого человека: по тому, кто он герою. */
export function kinActions(state: GameState, n: Npc): KinAction[] {
  if (!n.alive) return []
  if (n.role === 'spouse') return n.away ? [] : ['attention', 'date', 'gift', 'cold']
  const adultChild = (n.role === 'child' || n.role === 'grandchild') && npcAge(n, state.year) >= 16
  if (n.role === 'father' || n.role === 'mother' || n.role === 'sibling' || adultChild) return ['visit', 'help', 'distance']
  return []
}

/** Годовые расходы сословия героя (база цен). */
export function kinBase(state: GameState): number {
  const era = ERA_META[state.hero.era]
  return Math.max(80, era?.classes.find((c) => c.id === state.hero.cls)?.upkeep ?? 150)
}

export const kinCost = (state: GameState, a: KinAction) => (KIN[a].cost ? Math.max(2, Math.round(kinBase(state) * KIN[a].cost)) : 0)

/** Уже что-то делал для этого человека в этом году. */
export const caredThisYear = (state: GameState, n: Npc) => n.careYear === state.year

/** Почему нельзя (ключ текста) или undefined. */
export function kinLock(state: GameState, n: Npc, a: KinAction): string | undefined {
  if (!kinActions(state, n).includes(a)) return 'kin.lock.role'
  if (caredThisYear(state, n)) return 'kin.lock.year'
  if (state.hero.money < kinCost(state, a)) return 'kin.lock.money'
  return undefined
}

/** Сделать: деньги, отношение, настроение, запись в дневник. */
export function doKin(state: GameState, npcId: string, a: KinAction): boolean {
  const n = state.hero.npcs.find((x) => x.id === npcId)
  if (!n || kinLock(state, n, a)) return false
  const hero = state.hero
  const k = KIN[a]
  const cost = kinCost(state, a)
  hero.money -= cost
  n.attitude = Math.max(-100, Math.min(100, n.attitude + k.attitude))
  n.careYear = state.year
  if (k.happiness) changeParam(hero, 'happiness', k.happiness)
  if (k.stress) changeParam(hero, 'stress', k.stress)
  note(state, { key: `diary.kin.${a}`, params: { who: { name: n.name }, sex: n.sex, ...(cost ? { money: cost } : {}) }, topic: 'family', score: cost ? 10 : 6, mood: k.attitude > 0 ? 1 : -1 })
  return true
}

/** Тёплые и холодные отношения (для подписи и событий). */
export const warm = (n: Npc) => n.attitude >= 60
export const cold = (n: Npc) => n.attitude <= -30

/** Родня, с которой отношения что-то значат: супруг, родители, братья и сёстры, взрослые дети. */
const kinOf = (state: GameState) =>
  state.hero.npcs.filter((n) => n.alive && !n.away && (n.role === 'spouse' || n.role === 'father' || n.role === 'mother' || n.role === 'sibling' || (n.role === 'child' && npcAge(n, state.year) >= 18)))

/** Помощь тёплой родни в долгах: доля годовых расходов. Ссора с холодной роднёй - шанс в год. */
export const KIN_YEAR = { helpChance: 0.3, help: 0.5, quarrelChance: 0.15 }

/** Раз в год: тёплая родня выручает героя в долгах; с холодной случаются ссоры. */
export function kinYear(state: GameState): void {
  const hero = state.hero
  if (hero.age < 16) return
  const kin = kinOf(state)
  if (hero.money < 0) {
    const helper = kin.filter((n) => warm(n) && n.role !== 'spouse').sort((a, b) => b.attitude - a.attitude)[0]
    if (helper && chance(state, KIN_YEAR.helpChance)) {
      const money = Math.round(kinBase(state) * KIN_YEAR.help)
      hero.money += money
      helper.attitude = Math.max(-100, helper.attitude - 5)
      note(state, { key: 'diary.kin.helped', params: { who: { name: helper.name }, sex: helper.sex, money }, topic: 'family', score: 18, mood: 3 })
      return
    }
  }
  const sour = kin.filter(cold)
  if (sour.length && chance(state, KIN_YEAR.quarrelChance)) {
    const n = sour[0]
    changeParam(hero, 'stress', 6)
    changeParam(hero, 'happiness', -3)
    note(state, { key: n.role === 'spouse' ? 'diary.kin.quarrel_spouse' : 'diary.kin.quarrel', params: { who: { name: n.name }, sex: n.sex }, topic: 'family', score: 16, mood: -3 })
  }
}

/** Множитель шанса спора о наследстве от тепла ребёнка к умершему родителю (inheritance.ts). */
export const disputeK = (attitude: number) => (attitude >= 60 ? 0.3 : attitude <= -30 ? 1.6 : 1)
