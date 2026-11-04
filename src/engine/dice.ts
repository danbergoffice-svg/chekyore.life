// Кости (ТЗ «Кости в каждой эпохе», 04.11): четыре скрытых показателя героя - мастерство, азарт, слава игрока (своя
// в каждом краю, гаснет за 3–5 лет) и долг. Высокие ставки открывает азарт, а не число партий: «затянуло» - и на кону
// кошелёк, имущество, семья, сам игрок. Партию разыгрывает интерфейс (ui/DiceGame), сюда приходит её итог.
// Последствия - события dice_* (events_dice.json): ограбление, отказ платить, обвинение, кредитор, упрёки семьи.
import type { EraDef, EraMeta, GameState, Hero } from './types'
import { chance, int, next } from './rng'
import { addYears, aliveNpcs, note, npcAge, sendAway } from './rules'

export interface DiceStats {
  skill: number
  lust: number
  /** Слава игрока по краям: значение и год, когда менялась. */
  fame: Record<string, number>
  /** Сколько раз жульничал в каждом краю: тем чаще ловят. */
  cheats: Record<string, number>
  games: number
  /** Чистый выигрыш за жизнь (деньгами). */
  net: number
  maxStake: number
  /** Позор в семье: копится от крупных проигрышей. */
  shame: number
  /** Сколько партий отдал «на волю судьбы» (аналитика). */
  fate: number
  /** Проиграл дом, землю, близкого или себя - легенда рода. */
  ruined?: boolean
  /** Последний год партии: азарт без игры понемногу остывает. */
  lastYear?: number
}

export type StakeKind = 'coins' | 'purse' | 'animal' | 'house' | 'land' | 'son' | 'daughter' | 'wife' | 'self'

export interface Stake {
  level: 1 | 2 | 3 | 4 | 5
  kind: StakeKind
  /** Сколько стоит ставка деньгами: столько же ставит соперник. */
  amount: number
  npcId?: string
  animal?: string
}

export type Opponent = 'cautious' | 'risky' | 'cheat'

export interface DiceResult {
  stake: Stake
  won: boolean
  /** Подменил кость / подтолкнул. */
  cheated: boolean
  /** Поймали на жульничестве. */
  caught: boolean
  /** Уличил соперника в жульничестве. */
  exposed: boolean
  /** Партию сыграли без мини-игры («Положиться на судьбу»). */
  fate: boolean
  /** Партия «отыграться» после проигрыша - азарт растёт вдвое. */
  chase: boolean
  opponent: Opponent
  /** Уже записана (мини-игра записывает партию сразу, choose её не повторяет). */
  applied?: boolean
}

/** Порог азарта для уровня ставки (ТЗ, лестница ставок). */
export const STAKE_LUST = { 1: 0, 2: 30, 3: 50, 4: 70, 5: 85 } as const
/** Приёмы мастерства: характер соперника, переброс, жульничество, чтение чужого жульничества. */
export const SKILL = { read: 20, reroll: 40, cheat: 60, spot: 80 } as const

/** Закон и наказание за шулерство по краям: кости разрешены, на праздник, осуждаются или запрещены. */
export type DiceLaw = 'legal' | 'seasonal' | 'frowned' | 'banned'
export type DicePunish = 'fine' | 'hand' | 'beating' | 'flog'
interface Flavor { law: DiceLaw; punish: DicePunish; creditors?: number }
const FLAVOR: Record<string, Flavor> = {
  AMR: { law: 'legal', punish: 'beating' },
  ANE: { law: 'legal', punish: 'fine' },
  E03: { law: 'seasonal', punish: 'fine' },
  BYZ: { law: 'frowned', punish: 'fine' },
  CHN: { law: 'legal', punish: 'beating', creditors: 1.5 },
  ETH: { law: 'frowned', punish: 'flog' },
  EUR: { law: 'frowned', punish: 'hand' },
  IND: { law: 'frowned', punish: 'fine' },
  ISL: { law: 'banned', punish: 'flog' },
  JPN: { law: 'banned', punish: 'beating' },
  MAY: { law: 'legal', punish: 'beating' },
  RUS: { law: 'frowned', punish: 'beating' },
  WAF: { law: 'frowned', punish: 'flog' },
  MNG: { law: 'legal', punish: 'beating' },
}
/** Края со своим законом: Египет и Греция в античности, индуистский юг Индии. Название игры - в текстах (dice.game.<край>). */
const REGION_FLAVOR: Record<string, Partial<Flavor>> = {
  egypt: { law: 'legal' },
  athens: { law: 'legal' },
  vijayanagara: { law: 'legal' },
}

export function diceFlavor(era: string, region: string): Flavor {
  return { ...(FLAVOR[era] ?? FLAVOR.EUR), ...REGION_FLAVOR[region] }
}

export function diceOf(hero: Hero): DiceStats {
  hero.dice ??= { skill: 0, lust: 0, fame: {}, cheats: {}, games: 0, net: 0, maxStake: 0, shame: 0, fate: 0 }
  return hero.dice
}

const clamp = (x: number) => Math.max(0, Math.min(100, x))
const ref = (era: EraDef | EraMeta) => Math.max(100, era.classes.find((c) => c.id === 'craftsman')?.upkeep ?? 200)

/** Самая ценная скотина героя (на кону - конь, верблюд, вол…). */
const ANIMAL_VALUE: Record<string, number> = { horse: 3, camel: 3, ox: 2, cow: 2, buffalo: 2, llama: 1.5, donkey: 1.2, mule: 1.5, goat: 0.6, sheep: 0.6, pig: 0.8 }

/** Ставки, которые герою доступны сейчас (по азарту, деньгам и тому, что у него есть). */
export function diceStakes(state: GameState, era: EraDef | EraMeta): Stake[] {
  const hero = state.hero
  const d = diceOf(hero)
  const r = ref(era)
  // Малая ставка - десятая часть казны (по ТЗ до 20%), но не меньше трети расходов ремесленника.
  const out: Stake[] = [{ level: 1, kind: 'coins', amount: Math.max(Math.round(r * 0.3), Math.round(Math.max(0, hero.money) * 0.1)) }]
  if (d.lust >= STAKE_LUST[2] && hero.money > out[0].amount) out.push({ level: 2, kind: 'purse', amount: hero.money })
  if (d.lust >= STAKE_LUST[3]) {
    const animal = [...(hero.animals ?? [])].filter((a) => ANIMAL_VALUE[a.kind]).sort((a, b) => ANIMAL_VALUE[b.kind] - ANIMAL_VALUE[a.kind])[0]
    if (animal) out.push({ level: 3, kind: 'animal', amount: Math.round(r * ANIMAL_VALUE[animal.kind]), animal: animal.kind })
    if ((hero.home ?? 1) >= 2) out.push({ level: 3, kind: 'house', amount: Math.round(r * 3 * (hero.home ?? 1)) })
    if (hero.cls === 'landowner' || hero.cls === 'noble') out.push({ level: 3, kind: 'land', amount: Math.round(r * 10) })
  }
  if (d.lust >= STAKE_LUST[4] && hero.money <= 0) {
    const kids = aliveNpcs(hero, 'child').filter((n) => !n.away)
    const son = kids.find((n) => n.sex === 'm' && npcAge(n, state.year) >= 8 && npcAge(n, state.year) <= 20)
    const daughter = kids.find((n) => n.sex === 'f' && !n.married && npcAge(n, state.year) >= 13 && npcAge(n, state.year) <= 22)
    const wife = hero.sex === 'm' ? aliveNpcs(hero, 'spouse').find((n) => !n.away) : undefined
    if (son) out.push({ level: 4, kind: 'son', amount: Math.round(r * 3), npcId: son.id })
    if (daughter) out.push({ level: 4, kind: 'daughter', amount: Math.round(r * 3), npcId: daughter.id })
    if (wife) out.push({ level: 4, kind: 'wife', amount: Math.round(r * 3), npcId: wife.id })
  }
  if (d.lust >= STAKE_LUST[5] && (hero.money < 0 || hero.tags.includes('in_debt')) && hero.cls !== 'slave' && !hero.tags.includes('enslaved')) {
    out.push({ level: 5, kind: 'self', amount: Math.round(r * 5 + Math.max(0, -hero.money)) })
  }
  return out
}

/** Соперник за столом: жулик чаще там, где играют на деньги открыто. */
export function pickOpponent(rnd: () => number): Opponent {
  const x = rnd()
  return x < 0.45 ? 'cautious' : x < 0.8 ? 'risky' : 'cheat'
}

/** Шанс, что подмену кости заметят: чем больше жульничал здесь и внимательнее соперник - тем выше. */
export function catchChance(hero: Hero, opponent: Opponent): number {
  const d = diceOf(hero)
  const p = 0.22 + 0.1 * (d.cheats[hero.region] ?? 0) + (opponent === 'cautious' ? 0.1 : 0) - (d.skill - SKILL.cheat) / 200
  return Math.max(0.05, Math.min(0.75, p))
}

/** Партия «на волю судьбы»: без мини-игры, просто чей бросок больше (соперник-жулик кидает дважды и берёт лучшее). */
export function fateGame(state: GameState, stake: Stake, opponent: Opponent): DiceResult {
  const roll = () => int(state, 1, 6) + int(state, 1, 6)
  let mine = roll()
  let theirs = opponent === 'cheat' ? Math.max(roll(), roll()) : roll()
  while (mine === theirs) {
    mine = roll()
    theirs = roll()
  }
  return { stake, won: mine > theirs, cheated: false, caught: false, exposed: false, fate: true, chase: false, opponent }
}

const PUNISH_HEALTH: Record<DicePunish, number> = { fine: 0, hand: 25, beating: 14, flog: 10 }

/** Записать итог партии: деньги и ставка, рост мастерства и азарта, слава, последствия. */
export function applyDice(state: GameState, era: EraDef | EraMeta, r: DiceResult): void {
  const hero = state.hero
  const d = diceOf(hero)
  const base = ref(era)
  const flavor = diceFlavor(hero.era, hero.region)
  const before = Math.max(base, hero.money)
  d.games++
  d.lastYear = state.year
  if (r.fate) d.fate++
  d.maxStake = Math.max(d.maxStake, r.stake.level)
  const won = r.won && !r.caught
  const big = won && r.stake.amount > before * 0.5
  // Учатся на проигрышах; затягивают крупные выигрыши и попытки отыграться.
  d.skill = clamp(d.skill + (won ? 3 : 5))
  d.lust = clamp(d.lust + (5 + (big ? 8 : 0)) * (r.chase ? 2 : 1))
  if (d.lust >= 30 && !hero.tags.includes('gambler')) hero.tags.push('gambler')
  const params = { game: { key: 'dice.game' } }

  if (won) {
    hero.money += r.stake.amount
    d.net += r.stake.amount
    d.fame[hero.region] = clamp((d.fame[hero.region] ?? 0) + (big ? 15 : 6))
    if (r.stake.level >= 4 && hero.money < 0) hero.money = 0
    note(state, { key: r.exposed ? 'diary.dice_exposed' : big ? 'diary.dice_bigwin' : 'diary.dice_win', params: { ...params, money: r.stake.amount }, topic: 'money', score: big ? 24 : 8, mood: big ? 6 : 2, major: big })
    if (r.exposed) hero.hidden.reputation = clamp(hero.hidden.reputation + 3)
    // Крупный выигрыш тянет за собой одно из последствий - через год-два.
    if (big) {
      const kin = aliveNpcs(hero, 'sibling').length > 0
      const list = ['dice_robbed', 'dice_robbed', 'dice_unpaid', ...(d.skill >= 40 ? ['dice_accused', 'dice_accused'] : ['dice_accused']), ...(kin ? ['dice_envy'] : [])]
      schedule(state, list[Math.floor(next(state) * list.length)], 1)
    }
  } else {
    loseStake(state, r.stake, params)
    d.net -= r.stake.amount
    if (r.stake.level >= 2) d.shame += r.stake.level - 1
    for (const n of aliveNpcs(hero, 'spouse')) n.attitude = Math.max(-100, n.attitude - 4 * r.stake.level)
    for (const n of aliveNpcs(hero, 'child')) n.attitude = Math.max(-100, n.attitude - 2 * r.stake.level)
    if (hero.money < 0) schedule(state, 'dice_creditor', int(state, 1, 2), (flavor.creditors ?? 1) * 0.6)
    if (d.shame >= 3 && aliveNpcs(hero, 'spouse').some((n) => !n.away)) schedule(state, d.shame >= 7 ? 'dice_spouse_leaves' : 'dice_reproach', 1)
  }

  if (r.cheated) d.cheats[hero.region] = (d.cheats[hero.region] ?? 0) + 1
  if (r.caught) {
    // Наказание - по обычаю края: штраф и позор, побои, плети, а в Европе могут отрубить руку.
    const hurt = PUNISH_HEALTH[flavor.punish]
    if (hurt) hero.attrs.health = Math.max(1, hero.attrs.health - hurt)
    if (flavor.punish === 'fine') hero.money -= Math.round(base * 0.6)
    if (flavor.punish === 'hand') hero.tags.includes('maimed') || hero.tags.push('maimed')
    hero.hidden.reputation = clamp(hero.hidden.reputation - 15)
    d.fame[hero.region] = 100
    note(state, { key: `diary.dice_caught.${flavor.punish}`, params, topic: 'money', icon: 'loss', score: 30, mood: -10, major: true })
  }

  // Где кости запрещены или осуждаются - за игру саму по себе можно поплатиться.
  if (flavor.law === 'banned' && chance(state, 0.2)) {
    hero.money -= Math.round(base * 0.5)
    hero.hidden.reputation = clamp(hero.hidden.reputation - 5)
    note(state, { key: 'diary.dice_law.banned', params, topic: 'money', score: 12, mood: -4 })
  } else if (flavor.law === 'seasonal' && chance(state, 0.15)) {
    hero.money -= Math.round(base * 0.3)
    note(state, { key: 'diary.dice_law.seasonal', params, topic: 'money', score: 10, mood: -3 })
  } else if (flavor.law === 'frowned') hero.hidden.reputation = clamp(hero.hidden.reputation - 1)
  syncTags(hero)
}

function loseStake(state: GameState, s: Stake, params: Record<string, { key: string }>): void {
  const hero = state.hero
  const d = diceOf(hero)
  const npc = s.npcId ? hero.npcs.find((n) => n.id === s.npcId) : undefined
  const who: Record<string, { name: string }> = npc ? { who: { name: npc.name } } : {}
  if (s.kind === 'coins' || s.kind === 'purse') hero.money -= s.amount
  if (s.kind === 'animal' && s.animal) {
    const i = (hero.animals ?? []).findIndex((a) => a.kind === s.animal)
    if (i >= 0) hero.animals.splice(i, 1)
  }
  if (s.kind === 'house') {
    hero.home = Math.max(1, (hero.home ?? 1) - 1)
    d.ruined = true
  }
  if (s.kind === 'land') {
    hero.cls = hero.cls === 'noble' ? 'landowner' : 'peasant'
    d.ruined = true
  }
  // Семья - исторически: сына отдают в услужение, дочь выдают за выигравшего, жена уходит к родне с позором.
  if (npc && s.kind === 'son') sendAway(state, npc, 'service')
  if (npc && s.kind === 'daughter') {
    npc.married = true
    sendAway(state, npc, 'married_far')
  }
  if (npc && s.kind === 'wife') sendAway(state, npc, 'left')
  if (s.kind === 'son' || s.kind === 'daughter' || s.kind === 'wife') {
    d.ruined = true
    hero.hidden.reputation = clamp(hero.hidden.reputation - 10)
  }
  // Сам себя: кабала - как германцы у Тацита, проигрывавшие в кости свободу.
  if (s.kind === 'self') {
    hero.cls = 'slave'
    if (!hero.tags.includes('enslaved')) hero.tags.push('enslaved')
    hero.money = 0
    hero.tags = hero.tags.filter((t) => t !== 'in_debt' && t !== 'deep_debt')
    d.ruined = true
  }
  note(state, { key: `diary.dice_lost.${s.kind}`, params: { ...params, ...who, money: s.amount, animal: { key: `animal.${s.animal ?? 'horse'}` } }, topic: 'money', icon: 'loss', score: 10 + 8 * s.level, mood: -3 * s.level, major: s.level >= 3 })
}

function schedule(state: GameState, eventId: string, years: number, p = 0.8): void {
  const hero = state.hero
  if (hero.triggers.some((t) => t.eventId === eventId)) return
  hero.triggers.push({ eventId, year: addYears(state.year, years), chance: Math.min(1, p) })
}

/** Метки для условий событий: уже играл, азарт 20+/50+/80+, слава игрока в здешнем краю 30/60/90, позор. */
function syncTags(hero: Hero): void {
  const d = hero.dice
  if (!d) return
  const fame = d.fame[hero.region] ?? 0
  const want = new Set([
    ...(d.games > 0 ? ['dice_player'] : []),
    ...(d.lust >= 20 ? ['dice_lust20'] : []),
    ...(d.lust >= 50 ? ['dice_lust50'] : []),
    ...(d.lust >= 80 ? ['dice_lust80'] : []),
    ...(fame >= 30 ? ['dice_fame30'] : []),
    ...(fame >= 60 ? ['dice_fame60'] : []),
    ...(fame >= 90 ? ['dice_fame90'] : []),
    ...(d.shame >= 3 ? ['dice_shame'] : []),
  ])
  hero.tags = hero.tags.filter((t) => !t.startsWith('dice_') || want.has(t) || t === 'dice_legend' || t === 'lucky_dice')
  for (const t of want) if (!hero.tags.includes(t)) hero.tags.push(t)
}

/** Раз в год: слава гаснет (за 3–5 лет), азарт без игры остывает, зарок и старость остужают быстрее. */
export function diceYear(state: GameState): void {
  const hero = state.hero
  const d = hero.dice ?? (hero.tags.includes('gambler') ? diceOf(hero) : undefined)
  if (!d) return
  for (const k of Object.keys(d.fame)) d.fame[k] = Math.round(d.fame[k] * 0.75)
  let cool = d.lastYear === state.year ? 0 : 1
  if (hero.flags.includes('v_quit_dice')) cool += 8
  if (hero.age >= 60) cool += 2
  if (hero.tags.includes('ill')) cool += 2
  d.lust = clamp(d.lust - cool)
  // Игрок по старым событиям (v_dice_*) без зарока - азарт не ниже 30: стол его зовёт.
  if (hero.tags.includes('gambler') && !hero.flags.includes('v_quit_dice')) d.lust = Math.max(d.lust, 30)
  if (hero.flags.includes('v_quit_dice') && d.lust < 30) hero.tags = hero.tags.filter((t) => t !== 'gambler')
  syncTags(hero)
}

/** Эффект события: азарт меняется (клятва, ультиматум, «отыграться»); quit - зарок. */
export function diceEffect(hero: Hero, lust: number): void {
  const d = diceOf(hero)
  d.lust = clamp(d.lust + lust)
  if (lust < 0) d.shame = Math.max(0, d.shame - 2)
  syncTags(hero)
}

/** Наследнику: легенда рода («дед проиграл деревню») или мастерство и «счастливые кости» великого игрока. */
export function diceInherit(state: GameState, parent: Hero): void {
  const d = parent.dice
  if (!d) return
  const hero = state.hero
  if (d.ruined) {
    diceOf(hero).lust = 15
    hero.tags.push('dice_legend')
    hero.hidden.reputation = clamp(hero.hidden.reputation - 5)
    hero.diary.push({ year: state.year, age: hero.age, key: 'diary.dice_legend', params: { parent: { name: parent.name }, psex: parent.sex }, topic: 'family', score: 20, reg: hero.region, rel: hero.religion })
  } else if (d.skill >= 70 && d.net > 0) {
    diceOf(hero).skill = 10
    hero.tags.push('lucky_dice')
    hero.diary.push({ year: state.year, age: hero.age, key: 'diary.dice_relic', params: { parent: { name: parent.name } }, topic: 'family', score: 20, reg: hero.region, rel: hero.religion })
  }
}

