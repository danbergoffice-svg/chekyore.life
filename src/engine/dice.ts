// Кости (ТЗ «Кости в каждой эпохе», 04.11): четыре скрытых показателя героя - мастерство, азарт, слава игрока (своя
// в каждом краю, гаснет за 3–5 лет) и долг. Высокие ставки открывает азарт, а не число партий: «затянуло» - и на кону
// кошелёк, имущество, семья, сам игрок. Партию разыгрывает интерфейс (ui/DiceGame), сюда приходит её итог.
// Последствия - события dice_* (events_dice.json): ограбление, отказ платить, обвинение, кредитор, упрёки семьи.
import type { EraDef, EraMeta, GameState, Hero } from './types'
import { chance, int, next } from './rng'
import { addYears, aliveNpcs, note, npcAge, sendAway } from './rules'
import { ANIMAL_COST, HOME_COST, rentPerMonth, startRent } from './household'
import { landPrice, loseEstate, slavePrice } from './estate'

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
  /** Сколько раз подряд отказался сесть за стол (сыгранная партия обнуляет). */
  refused?: number
  /** Трижды подряд отказался - завязал: кости больше не предлагают (метка dice_quit). */
  quit?: boolean
}

/** После стольких отказов подряд герой завязывает с костями. */
export const DICE_QUIT_AFTER = 3

export type StakeKind = 'coins' | 'purse' | 'animal' | 'house' | 'land' | 'slave' | 'son' | 'daughter' | 'wife' | 'self'

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
  /** Праздник, когда играть можно открыто: штрафа за саму игру нет. */
  festive?: boolean
  /** Проиграл скотину, но откупился её ценой деньгами. */
  ransom?: boolean
}

/** Бросок двух костей. */
export type DicePair = [number, number]
/** Бросок партии: мои кости и (когда бросил) кости соперника. */
export interface DiceRound { me: DicePair; them?: DicePair; theyCheated?: boolean }
export const pairSum = (p: DicePair) => p[0] + p[1]
/** Кто взял бросок: 'me', 'them', 'tie' (суммы равны) или null, пока соперник не бросил. */
export function roundWinner(r: DiceRound | undefined): 'me' | 'them' | 'tie' | null {
  if (!r?.them) return null
  const a = pairSum(r.me)
  const b = pairSum(r.them)
  return a > b ? 'me' : a < b ? 'them' : 'tie'
}
/** Счёт партии: сколько бросков взял каждый (ничьи не в счёт), и решена ли она (до двух побед). */
export function diceScore(rounds: DiceRound[]): { me: number; them: number; done: boolean } {
  const me = rounds.filter((r) => roundWinner(r) === 'me').length
  const them = rounds.filter((r) => roundWinner(r) === 'them').length
  return { me, them, done: me >= 2 || them >= 2 }
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

/** Скотина на кону (не куры и не питомцы) - по рыночной цене (ANIMAL_COST). */
const animalCost = (kind: string) => ANIMAL_COST[kind] ?? 0
/** Дом на кону - по цене такого дома (HOME_COST). */
export const houseCost = (home: number) => HOME_COST[Math.max(0, Math.min(HOME_COST.length - 1, home))]

/** Ставки, которые герою доступны сейчас (по азарту, деньгам и тому, что у него есть). */
export function diceStakes(state: GameState, era: EraDef | EraMeta): Stake[] {
  const hero = state.hero
  const d = diceOf(hero)
  const r = ref(era)
  // Малая ставка - десятая часть казны (по ТЗ до 20%), но не меньше трети расходов ремесленника.
  const out: Stake[] = [{ level: 1, kind: 'coins', amount: Math.max(Math.round(r * 0.3), Math.round(Math.max(0, hero.money) * 0.1)) }]
  if (d.lust >= STAKE_LUST[2] && hero.money > out[0].amount) out.push({ level: 2, kind: 'purse', amount: hero.money })
  if (d.lust >= STAKE_LUST[3]) {
    const animal = [...(hero.animals ?? [])].filter((a) => animalCost(a.kind) >= 30).sort((a, b) => animalCost(b.kind) - animalCost(a.kind))[0]
    if (animal) out.push({ level: 3, kind: 'animal', amount: animalCost(animal.kind), animal: animal.kind })
    // Свой дом (не съёмный) - по его цене, как при покупке.
    if ((hero.home ?? 1) >= 2 && !hero.rent) out.push({ level: 3, kind: 'house', amount: houseCost(hero.home) })
    // Земля: свой надел - по цене надела; у землевладельца и знати без купленных наделов - родовая земля сословия.
    if (hero.land) out.push({ level: 3, kind: 'land', amount: landPrice(state) })
    else if (hero.cls === 'landowner' || hero.cls === 'noble') out.push({ level: 3, kind: 'land', amount: Math.round(r * 10) })
    // Невольник - по его цене на здешнем рынке.
    if (hero.slaves) out.push({ level: 3, kind: 'slave', amount: slavePrice(state) })
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
  d.refused = 0
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
    const was = hero.money
    hero.money += r.stake.amount
    d.net += r.stake.amount
    d.fame[hero.region] = clamp((d.fame[hero.region] ?? 0) + (big ? 15 : 6))
    if (r.stake.level >= 4 && hero.money < 0) hero.money = 0
    // В дневник - сколько на деле прибавилось: выигрыш ставкой семьи или себя в долгах обнуляет долг целиком.
    note(state, { key: r.exposed ? 'diary.dice_exposed' : big ? 'diary.dice_bigwin' : 'diary.dice_win', params: { ...params, money: hero.money - was }, topic: 'money', score: big ? 24 : 8, mood: big ? 6 : 2, major: big })
    if (r.exposed) hero.hidden.reputation = clamp(hero.hidden.reputation + 3)
    // Крупный выигрыш тянет за собой одно из последствий - через год-два.
    if (big) {
      const kin = aliveNpcs(hero, 'sibling').length > 0
      const list = ['dice_robbed', 'dice_robbed', 'dice_unpaid', ...(d.skill >= 40 ? ['dice_accused', 'dice_accused'] : ['dice_accused']), ...(kin ? ['dice_envy'] : [])]
      schedule(state, list[Math.floor(next(state) * list.length)], 1)
    }
  } else {
    loseStake(state, r.stake, params, r.ransom)
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
    const fine = flavor.punish === 'fine' ? Math.round(base * 0.6) : 0
    hero.money -= fine
    if (flavor.punish === 'hand') hero.tags.includes('maimed') || hero.tags.push('maimed')
    hero.hidden.reputation = clamp(hero.hidden.reputation - 15)
    d.fame[hero.region] = 100
    note(state, { key: `diary.dice_caught.${flavor.punish}`, params: fine ? { ...params, money: fine } : params, topic: 'money', icon: 'loss', score: 30, mood: -10, major: true })
  }

  // Где кости запрещены или осуждаются - за игру саму по себе можно поплатиться.
  if (r.festive) {
    // Сатурналии, ночь Дивали: играют все и открыто.
  } else if (flavor.law === 'banned' && chance(state, 0.2)) {
    const fine = Math.round(base * 0.5)
    hero.money -= fine
    hero.hidden.reputation = clamp(hero.hidden.reputation - 5)
    note(state, { key: 'diary.dice_law.banned', params: { ...params, money: fine }, topic: 'money', score: 12, mood: -4 })
  } else if (flavor.law === 'seasonal' && chance(state, 0.15)) {
    const fine = Math.round(base * 0.3)
    hero.money -= fine
    note(state, { key: 'diary.dice_law.seasonal', params: { ...params, money: fine }, topic: 'money', score: 10, mood: -3 })
  } else if (flavor.law === 'frowned') hero.hidden.reputation = clamp(hero.hidden.reputation - 1)
  syncTags(hero)
}

/** Можно ли откупиться от проигранной скотины её ценой деньгами. */
export const canRansom = (hero: Hero, s: Stake) => s.kind === 'animal' && hero.money >= s.amount

function loseStake(state: GameState, s: Stake, params: Record<string, { key: string }>, ransom = false): void {
  const hero = state.hero
  const d = diceOf(hero)
  const npc = s.npcId ? hero.npcs.find((n) => n.id === s.npcId) : undefined
  const who: Record<string, { name: string }> = npc ? { who: { name: npc.name } } : {}
  let key = `diary.dice_lost.${s.kind}`
  let n = 0
  if (s.kind === 'coins' || s.kind === 'purse') hero.money -= s.amount
  if (s.kind === 'animal' && s.animal) {
    if (ransom && canRansom(hero, s)) {
      hero.money -= s.amount
      note(state, { key: 'diary.dice_lost.animal_ransom', params: { ...params, money: s.amount, animal: { key: `animal.${s.animal}` } }, topic: 'money', icon: 'loss', score: 20, mood: -6 })
      return
    }
    const i = (hero.animals ?? []).findIndex((a) => a.kind === s.animal)
    if (i >= 0) hero.animals.splice(i, 1)
  }
  // Дом проигран: своего больше нет, семья снимает жильё поскромнее и платит за него каждый год.
  let rent: Record<string, number | { key: string }> = {}
  if (s.kind === 'house') {
    startRent(state, hero.home ?? 2)
    rent = { home: { key: `home.${hero.home}` }, rent: rentPerMonth(hero.rent!) }
    d.ruined = true
  }
  if (s.kind === 'land' && hero.land) {
    // Проигран один надел: остальная земля и сословие остаются.
    loseEstate(state, 'land', 1)
    d.ruined = true
  } else if (s.kind === 'land') {
    hero.cls = hero.cls === 'noble' ? 'landowner' : 'peasant'
    d.ruined = true
  }
  if (s.kind === 'slave') loseEstate(state, 'slaves', 1)
  // Семья - исторически: сына отдают в услужение, дочь выдают за выигравшего, жена уходит к родне с позором.
  if (npc && s.kind === 'son') sendAway(state, npc, 'service')
  if (npc && s.kind === 'daughter') {
    npc.married = true
    sendAway(state, npc, 'married_far')
  }
  // Жена: 50 на 50 - уходит одна (дети остаются с отцом) или забирает малых детей; взрослые остаются в роду.
  if (npc && s.kind === 'wife') {
    sendAway(state, npc, 'left', true)
    const small = aliveNpcs(hero, 'child').filter((c) => !c.away && npcAge(c, state.year) < WIFE_TAKES_UNDER)
    if (small.length && chance(state, 0.5)) {
      for (const kid of small) sendAway(state, kid, 'left', true)
      key = 'diary.dice_lost.wife_kids'
      who.list = { name: small.map((k) => k.name).join(', ') }
      n = small.length
    } else if (small.length) key = 'diary.dice_lost.wife_stay'
  }
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
  note(state, { key, params: { ...params, ...who, ...rent, n, money: s.amount, animal: { key: `animal.${s.animal ?? 'horse'}` } }, topic: 'money', icon: 'loss', score: 10 + 8 * s.level, mood: -3 * s.level, major: s.level >= 3 })
}

/** Малых детей (до этого возраста) проигранная в кости жена может забрать с собой. */
export const WIFE_TAKES_UNDER = 14

/**
 * Отказ сесть за стол (в событии костей выбрал не играть; «Назад» у стола без единой партии - тоже).
 * Третий отказ подряд - завязал: метка dice_quit, запись в дневник, события костей больше не выпадают.
 */
export function diceRefuse(state: GameState): void {
  const hero = state.hero
  const d = diceOf(hero)
  if (d.quit) return
  d.refused = (d.refused ?? 0) + 1
  if (d.refused < DICE_QUIT_AFTER) return
  d.quit = true
  d.lust = Math.min(d.lust, 10)
  hero.tags = hero.tags.filter((t) => t !== 'gambler')
  note(state, { key: 'diary.dice_quit', params: { game: { key: 'dice.game' } }, topic: 'money', score: 22, mood: 3, major: true })
  syncTags(hero)
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
    ...(d.quit ? ['dice_quit'] : []),
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
  if (hero.flags.includes('v_quit_dice') || d.quit) cool += 8
  if (hero.age >= 60) cool += 2
  if (hero.tags.includes('ill')) cool += 2
  d.lust = clamp(d.lust - cool)
  // Игрок по старым событиям (v_dice_*) без зарока - азарт не ниже 30: стол его зовёт.
  if (hero.tags.includes('gambler') && !hero.flags.includes('v_quit_dice') && !d.quit) d.lust = Math.max(d.lust, 30)
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

