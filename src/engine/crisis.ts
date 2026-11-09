// Перелом сорокалетия (docs/TZ_crisis.md): раз за жизнь, в 36–44 года, герой выбирает, как встретить перелом
// (тактика - она и ставка), бросает шар Плинко и получает исход. После удачи азартный может бросить второй шар,
// после удара - опереться на близкого или на хозяйство. Максимум два шара; удар можно смягчить, но не отменить.
// Всё случайное - генератором состояния (next), заранее: интерфейс только показывает, куда скатится шар.
// A/B: только у игроков с settings.crisis (флаг crisis_share, src/goal.ts crisisOn).
import { diceOf } from './dice'
import { chance, next } from './rng'
import { changeParam, clamp, getParam, note, scaledMoney, sendAway } from './rules'
import type { EraDef, GameState, Npc, NpcRole, ParamId } from './types'

export type StanceId = 'start_over' | 'seek_freedom' | 'hold_on' | 'seek_meaning'
export type SlotId = 'windfall' | 'burnout' | 'new_passion' | 'worn_body' | 'quiet_acceptance' | 'cold_house' | 'new_calling' | 'lost_meaning' | 'second_wind'
export type SlotCat = 'clean' | 'mixed' | 'neg'
type Sev = 'strong' | 'medium' | 'weak' | 'trace'

/** Порядок лунок на доске: удачи и беды вперемешку, «Покой» в середине. */
export const BOARD: SlotId[] = ['windfall', 'burnout', 'new_passion', 'worn_body', 'quiet_acceptance', 'cold_house', 'new_calling', 'lost_meaning', 'second_wind']
export const SLOT_CAT: Record<SlotId, SlotCat> = {
  windfall: 'clean', second_wind: 'clean',
  new_passion: 'mixed', quiet_acceptance: 'mixed', new_calling: 'mixed',
  worn_body: 'neg', burnout: 'neg', cold_house: 'neg', lost_meaning: 'neg',
}
const BASE_WEIGHT: Record<SlotId, number> = {
  second_wind: 10, windfall: 8, new_passion: 10, quiet_acceptance: 12, new_calling: 10, worn_body: 9, burnout: 10, cold_house: 10, lost_meaning: 9,
}

export const SEV: Record<Sev, number> = { strong: 20, medium: 12, weak: 6, trace: 3 }
const MILDER: Record<Sev, Sev> = { strong: 'medium', medium: 'weak', weak: 'trace', trace: 'trace' }
const GAIN = { big: 8, normal: 6, small: 4 }
/** Ниже этого здоровья перелом не опускает. */
export const HEALTH_FLOOR = 15
export const CRISIS_AGES: [number, number] = [36, 44]
export const CRISIS_LAST = 45

interface StanceDef {
  stakes: [ParamId, ParamId]
  weights: Partial<Record<SlotId, number>>
  /** Свои беды тактики: метка на доске, и реже при опыте (обе ставки ≥ 60). */
  own: SlotId[]
}
export const STANCES: Record<StanceId, StanceDef> = {
  start_over: { stakes: ['charisma', 'risk_tolerance'], weights: { new_passion: 2, windfall: 1.3, second_wind: 1.2, cold_house: 1.5, quiet_acceptance: 0.3, worn_body: 0.7 }, own: ['cold_house'] },
  // Рабу «начать заново» нельзя - вместо этого «искать волю»: чаще выкуп (windfall), реже страсть.
  seek_freedom: { stakes: ['charisma', 'risk_tolerance'], weights: { windfall: 2, second_wind: 1.2, cold_house: 1.2, new_passion: 0.3, quiet_acceptance: 0.5 }, own: ['cold_house'] },
  hold_on: { stakes: ['diligence', 'health'], weights: { quiet_acceptance: 2, burnout: 1.3, worn_body: 1.2, new_passion: 0.4, new_calling: 0.6, cold_house: 0.7 }, own: ['burnout', 'worn_body'] },
  seek_meaning: { stakes: ['intellect', 'faith'], weights: { new_calling: 1.5, second_wind: 1.3, quiet_acceptance: 1.3, lost_meaning: 1.5, burnout: 0.8, cold_house: 0.8, windfall: 0.5 }, own: ['lost_meaning'] },
}
/** Сословие сдвигает веса своей тактики (ТЗ v2.1, stances.class_rules). */
const CLASS_WEIGHTS: Record<string, Partial<Record<StanceId, Partial<Record<SlotId, number>>>>> = {
  peasant: { start_over: { new_passion: 0.8, new_calling: 1.2 } },
  trader: { start_over: { windfall: 1.3 } },
  landowner: { hold_on: { quiet_acceptance: 1.2, worn_body: 0.8 } },
  noble: { start_over: { new_passion: 1.3, cold_house: 1.2 }, hold_on: { worn_body: 0.7 } },
}
const CLERGY = ['priest', 'monk', 'hegumen', 'shrine_priest', 'marabout', 'faqir', 'muezzin', 'debtera']
const isClergy = (state: GameState) => !!state.hero.profession && CLERGY.includes(state.hero.profession)
const enslaved = (state: GameState) => state.hero.cls === 'slave' || state.hero.tags.includes('enslaved')

/** Тактики героя по порядку: раб - «искать волю» вместо «начать заново», духовным «начать заново» закрыто. */
export function crisisStances(state: GameState): StanceId[] {
  const first: StanceId[] = enslaved(state) ? ['seek_freedom'] : isClergy(state) ? [] : ['start_over']
  return [...first, 'hold_on', 'seek_meaning']
}
/** Тактика доступна, если обе её ставки не меньше 10 (герою есть что ставить). */
export function stanceOpen(state: GameState, id: StanceId): boolean {
  return STANCES[id].stakes.every((p) => getParam(state.hero, p) >= 10)
}

// ---------- Когда ----------

/** Есть ли перелом в этот год (и назначить его возраст, если пора). Вызывать раз в год из rollEvents. */
export function crisisDue(state: GameState, busy: boolean): boolean {
  if (!state.settings.crisis) return false
  const hero = state.hero
  if (!hero.alive || hero.age < 35) return false
  if (!hero.crisis) {
    if (hero.age > CRISIS_AGES[1]) {
      hero.crisis = { age: -1, skipped: true }
      return false
    }
    const from = Math.max(CRISIS_AGES[0], hero.age + (hero.age >= CRISIS_AGES[0] ? 0 : 1))
    hero.crisis = { age: from + Math.floor(next(state) * (CRISIS_AGES[1] - from + 1)) }
  }
  const c = hero.crisis
  if (c.done || c.skipped || c.offered !== undefined || hero.age !== c.age) return false
  // В год другой мини-игры, войны или плена - сдвинуть на год (не позже 45).
  if (busy || hero.tags.includes('at_war') || hero.flags.includes('captive')) {
    if (c.age < CRISIS_LAST) c.age += 1
    else c.skipped = true
    return false
  }
  return true
}

// ---------- Первый шар ----------

export interface CrisisChange {
  param?: ParamId
  /** Изменение в очках (деньги - в монетах). */
  delta: number
  sev?: Sev
  staked?: boolean
  npcId?: string
  tag?: string
}
export interface CrisisSecond {
  kind: 'gamble' | 'family' | 'home'
  outcome: string
  npcId?: string
  changes: CrisisChange[]
  /** Итоговые изменения первого шара после второго (смягчённые, удвоенные, урезанные). */
  first: CrisisChange[]
}
export interface CrisisRecord {
  stance: StanceId
  slot: SlotId
  /** Путь шара: 8 шагов 0/1 (влево/вправо) к лунке. */
  path: number[]
  first: CrisisChange[]
  second?: CrisisSecond
}

function weightsFor(state: GameState, stance: StanceId): Record<SlotId, number> {
  const def = STANCES[stance]
  const cls = CLASS_WEIGHTS[state.hero.cls]?.[stance] ?? {}
  const expert = def.stakes.every((p) => getParam(state.hero, p) >= 60)
  const out = {} as Record<SlotId, number>
  for (const id of BOARD) out[id] = BASE_WEIGHT[id] * (def.weights[id] ?? 1) * (cls[id] ?? 1) * (expert && def.own.includes(id) ? 0.75 : 1)
  return out
}
/** Доли исходов по категориям (для тестов и подсказки). */
export function crisisOdds(state: GameState, stance: StanceId): Record<SlotCat, number> {
  const w = weightsFor(state, stance)
  const total = BOARD.reduce((s, id) => s + w[id], 0)
  const out: Record<SlotCat, number> = { clean: 0, mixed: 0, neg: 0 }
  for (const id of BOARD) out[SLOT_CAT[id]] += w[id] / total
  return out
}

function pickSlot(state: GameState, stance: StanceId): SlotId {
  const w = weightsFor(state, stance)
  let r = next(state) * BOARD.reduce((s, id) => s + w[id], 0)
  for (const id of BOARD) {
    r -= w[id]
    if (r <= 0) return id
  }
  return BOARD[BOARD.length - 1]
}
/** Путь шара к лунке k: k шагов вправо из 8, порядок случайный. */
function pathTo(state: GameState, k: number): number[] {
  const steps: number[] = Array.from({ length: 8 }, (_, i) => (i < k ? 1 : 0))
  for (let i = steps.length - 1; i > 0; i--) {
    const j = Math.floor(next(state) * (i + 1))
    ;[steps[i], steps[j]] = [steps[j], steps[i]]
  }
  return steps
}

/** Близкие, чьё отношение задевает перелом: супруг рядом, дети. */
const near = (state: GameState, roles: NpcRole[]) => state.hero.npcs.filter((n) => n.alive && !n.away && roles.includes(n.role))
const POLY = ['islamic', 'mongol', 'chinese', 'indian', 'sahel']

function slotChanges(state: GameState, era: EraDef, stance: StanceId, slot: SlotId): CrisisChange[] {
  const hero = state.hero
  const stakes = STANCES[stance].stakes
  const staked = (p: ParamId) => stakes.includes(p)
  const hit = (p: ParamId, sev: Sev): CrisisChange => {
    const s = staked(p) ? sev : MILDER[sev]
    return { param: p, delta: -SEV[s], sev: s, staked: staked(p) }
  }
  const gain = (p: ParamId, g: keyof typeof GAIN): CrisisChange => ({ param: p, delta: staked(p) ? GAIN[g] : Math.max(1, Math.floor(GAIN[g] / 2)), staked: staked(p) })
  const plain = (p: ParamId, delta: number): CrisisChange => ({ param: p, delta })
  const coins = (n: number): CrisisChange => ({ param: 'money', delta: Math.round(n) })
  const money = Math.max(hero.money, 0)
  switch (slot) {
    case 'second_wind':
      return [gain(stakes[0], 'big'), gain(stakes[1], 'small'), plain('happiness', 5)]
    case 'windfall': {
      const out = [coins(scaledMoney(hero, era, 40) + money * 0.4), plain('happiness', 5)]
      // Раб, который «ищет волю»: шанс на выкуп.
      if (stance === 'seek_freedom' && enslaved(state) && chance(state, 0.15)) out.push({ delta: 0, tag: 'crisis_freed' })
      return out
    }
    case 'new_passion': {
      const out = [gain('charisma', 'normal'), plain('happiness', 8), gain('risk_tolerance', 'small')]
      const spouse = near(state, ['spouse'])[0]
      if (spouse) out.push({ delta: -20, npcId: spouse.id })
      else out.push(plain('reputation', -5), { delta: 0, tag: 'late_romance' })
      return out
    }
    case 'quiet_acceptance':
      return [plain('stress', -15), plain('happiness', 4), plain('faith', 3), plain('risk_tolerance', -5)]
    case 'new_calling':
      return [gain('diligence', 'normal'), gain('intellect', 'small'), coins(-money * 0.15)]
    case 'worn_body':
      return [hit('health', 'strong'), hit('strength', 'weak')]
    case 'burnout':
      return [hit('diligence', 'medium'), hit('health', 'weak'), plain('stress', 15)]
    case 'cold_house': {
      const out = [hit('charisma', 'medium'), plain('loneliness', 15)]
      const spouse = near(state, ['spouse'])[0]
      const kids = near(state, ['child'])
      if (spouse || kids.length) {
        if (spouse) out.push({ delta: -25, npcId: spouse.id })
        for (const k of kids) out.push({ delta: -10, npcId: k.id })
      } else out.push(plain('loneliness', 10), plain('happiness', -10))
      return out
    }
    case 'lost_meaning':
      return [hit('diligence', 'medium'), hit('intellect', 'weak'), hit('faith', 'medium'), plain('happiness', -10)]
  }
}

/** Первый шар: исход и путь. Сохраняется в окне события (active.crisis). */
export function crisisDrop(state: GameState, era: EraDef, stance: StanceId): CrisisRecord {
  const slot = pickSlot(state, stance)
  const rec: CrisisRecord = { stance, slot, path: pathTo(state, BOARD.indexOf(slot)), first: slotChanges(state, era, stance, slot) }
  const active = state.queue[0]
  if (active) active.crisis = rec
  return rec
}

/** Где в многожёнстве «поздняя страсть» - вторая жена или наложница (для текста). */
export const passionPoly = (style: string | undefined) => !!style && POLY.includes(style)

// ---------- Второй шар ----------

const positive = (c: CrisisChange) => (c.param ? c.delta > 0 && c.param !== 'stress' && c.param !== 'loneliness' : !!c.tag && c.tag !== 'late_romance')
const isHit = (c: CrisisChange) => !!c.sev && c.delta < 0

export interface CrisisOptions {
  gamble: boolean
  family: Npc[]
  home: boolean
}
export function crisisOptions(state: GameState, rec: CrisisRecord): CrisisOptions {
  const hero = state.hero
  const cat = SLOT_CAT[rec.slot]
  const d = diceOf(hero)
  const gambler = (d.lust >= 30 || hero.tags.includes('gambler') || hero.attrs.risk_tolerance >= 70) && !hero.flags.includes('v_quit_dice')
  const pressure = rec.first.some((c) => c.npcId && c.delta < 0)
  const family = cat === 'neg' || (cat === 'mixed' && pressure)
    ? hero.npcs.filter((n) => n.alive && !n.away && n.attitude >= 20 && (['spouse', 'father', 'mother', 'sibling'].includes(n.role) || (n.role === 'child' && state.year - n.birthYear >= 16)))
    : []
  return {
    gamble: cat !== 'neg' && gambler && rec.first.some(positive),
    family,
    home: cat === 'neg' && !hero.rent && hero.home >= 1,
  }
}

function roll<T extends string>(state: GameState, table: [T, number][]): T {
  let r = next(state) * table.reduce((s, [, w]) => s + w, 0)
  for (const [id, w] of table) {
    r -= w
    if (r <= 0) return id
  }
  return table[table.length - 1][0]
}
/** Смягчить удары первого шара: strong - каждый удар на ступень мягче (давление вдвое); partial - вернуть треть урона
 *  поставленных характеристик (минимум 3, но след 3 очка остаётся всегда). */
function soften(first: CrisisChange[], how: 'strong' | 'partial'): CrisisChange[] {
  return first.map((c) => {
    if (how === 'strong') {
      if (isHit(c)) {
        const sev = MILDER[c.sev!]
        return { ...c, sev, delta: -SEV[sev] }
      }
      if (c.npcId && c.delta < 0) return { ...c, delta: Math.round(c.delta / 2) }
      return c
    }
    if (isHit(c) && c.staked) {
      const back = Math.min(Math.max(3, Math.floor(-c.delta / 3)), -c.delta - SEV.trace)
      return { ...c, delta: c.delta + Math.max(0, back) }
    }
    return c
  })
}

export type CrisisAction = 'gamble' | 'family' | 'home'
export const FAMILY_TABLE: [number, [string, number][]][] = [
  [60, [['strong', 45], ['partial', 35], ['conflict', 15], ['rupture', 5]]],
  [30, [['strong', 25], ['partial', 40], ['conflict', 25], ['rupture', 10]]],
  [20, [['strong', 10], ['partial', 35], ['conflict', 35], ['rupture', 20]]],
]
const FAMILY_COST: Record<string, number> = { strong: -5, partial: -10, conflict: -20, rupture: -35 }

/** Второй шар: азарт, опора на близкого (npcId) или на хозяйство. Записывается в rec.second. */
export function crisisSecond(state: GameState, rec: CrisisRecord, action: CrisisAction, npcId?: string): CrisisSecond {
  const hero = state.hero
  let second: CrisisSecond
  if (action === 'gamble') {
    const outcome = roll(state, [['double', 45], ['half', 35], ['bust', 20]])
    const ups = rec.first.filter(positive)
    const first =
      outcome === 'double'
        ? rec.first.map((c) => (positive(c) && c.param ? { ...c, delta: c.delta * 2 } : c))
        : outcome === 'half'
          ? rec.first.map((c) => (positive(c) && c.param ? { ...c, delta: Math.max(1, Math.floor(c.delta / 2)) } : c))
          : rec.first.filter((c) => !ups.includes(c))
    const changes: CrisisChange[] = []
    if (outcome === 'bust') {
      // Выигрыш первого шара не достаётся, а из того, что было, уходит пятая часть.
      changes.push({ param: 'money', delta: -Math.round(Math.max(0, hero.money) * 0.2) }, { delta: 0, tag: 'reckless_forties' })
    }
    second = { kind: 'gamble', outcome, changes, first }
  } else if (action === 'family') {
    const npc = hero.npcs.find((n) => n.id === npcId)
    const att = npc?.attitude ?? 0
    const table = (FAMILY_TABLE.find(([min]) => att >= min) ?? FAMILY_TABLE[FAMILY_TABLE.length - 1])[1]
    const outcome = roll(state, table)
    const first = outcome === 'strong' || outcome === 'partial' ? soften(rec.first, outcome) : rec.first
    const changes: CrisisChange[] = [{ delta: FAMILY_COST[outcome], npcId }]
    if (outcome === 'strong') changes.push({ param: 'loneliness', delta: -10 })
    if (outcome === 'conflict') changes.push({ delta: 0, tag: 'family_quarrel' })
    if (outcome === 'rupture') changes.push({ delta: 0, tag: 'family_rupture' })
    second = { kind: 'family', outcome, npcId, changes, first }
  } else {
    const outcome = roll(state, [['strong', 40], ['partial', 45], ['fail', 15]])
    const first = outcome === 'fail' ? rec.first : soften(rec.first, outcome as 'strong' | 'partial')
    const changes: CrisisChange[] = hero.money > 0 ? [{ param: 'money', delta: -Math.round(hero.money * 0.3) }] : [{ delta: -1, tag: 'home_mortgaged' }]
    if (outcome === 'fail') changes.push({ delta: 0, tag: 'home_drained' })
    second = { kind: 'home', outcome, changes, first }
  }
  rec.second = second
  return second
}

/** Все изменения перелома по порядку (для показа до применения и для применения). */
export function crisisFinal(rec: CrisisRecord): CrisisChange[] {
  return rec.second ? [...rec.second.first, ...rec.second.changes] : rec.first
}

// ---------- Применение ----------

/** Применить перелом (из choose при закрытии окна): изменения, метки для наград, дневник, «Узор жизни». */
export function applyCrisis(state: GameState, rec: CrisisRecord): 'success' | 'failure' {
  const hero = state.hero
  for (const c of crisisFinal(rec)) {
    if (c.tag) {
      if (c.tag === 'home_mortgaged') hero.home = Math.max(0, hero.home - 1)
      if (c.tag === 'crisis_freed') {
        hero.tags = hero.tags.filter((t) => t !== 'enslaved')
        if (hero.cls === 'slave') hero.cls = 'peasant'
      }
      if (!hero.tags.includes(c.tag)) hero.tags.push(c.tag)
      continue
    }
    if (c.npcId) {
      const n = hero.npcs.find((x) => x.id === c.npcId)
      if (n) n.attitude = clamp(n.attitude + c.delta, -100, 100)
      continue
    }
    if (!c.param) continue
    let d = c.delta
    if (c.param === 'health' && d < 0) d = Math.max(d, Math.min(0, HEALTH_FLOOR - hero.attrs.health))
    changeParam(hero, c.param, d)
  }
  // Разрыв: взрослый ребёнок уходит из семьи, остальные - отчуждение.
  const s = rec.second
  if (s?.kind === 'family' && s.outcome === 'rupture') {
    const n = hero.npcs.find((x) => x.id === s.npcId)
    if (n?.role === 'child') sendAway(state, n, 'left')
    else if (n && !(n.tags ?? []).includes('estranged')) n.tags = [...(n.tags ?? []), 'estranged']
  }
  if (s?.kind === 'gamble') diceOf(hero).lust = clamp(diceOf(hero).lust + 5 + (s.outcome === 'bust' ? 10 : 0))
  // Метки для наград и итога жизни.
  const tags = ['crisis_done', `crisis_${rec.slot}`, `crisis_stance_${rec.stance}`]
  if (s) tags.push(`crisis_${s.kind}_${s.outcome}`)
  for (const t of tags) if (!hero.tags.includes(t)) hero.tags.push(t)
  // «Узор жизни»: тактика сдвигает ось дома и дороги или веры и разума.
  if (rec.stance === 'start_over' || rec.stance === 'seek_freedom') hero.pattern.home_road += 3
  if (rec.stance === 'hold_on') hero.pattern.home_road -= 3
  if (rec.stance === 'seek_meaning') hero.pattern.faith_reason -= 3
  const bad = SLOT_CAT[rec.slot] === 'neg'
  note(state, {
    key: s ? `diary.crisis.${s.kind}` : 'diary.crisis',
    params: { slot: { key: `crisis.slot.${rec.slot}` }, ...(s ? { outcome: { key: `crisis.${s.kind}.${s.outcome}` } } : {}) },
    topic: 'life',
    icon: bad ? 'loss' : 'find',
    score: 28,
    mood: bad ? -6 : 6,
    major: true,
  })
  hero.crisis = { ...(hero.crisis ?? { age: hero.age }), done: true, stance: rec.stance, slot: rec.slot, second: s?.kind, result: s?.outcome }
  return bad && !(s && (s.outcome === 'strong' || s.outcome === 'partial')) ? 'failure' : 'success'
}

/** Бот и тесты: тактика, первый шар, принять. */
export function botCrisis(state: GameState, era: EraDef, stance: StanceId): CrisisRecord {
  return crisisDrop(state, era, stance)
}
