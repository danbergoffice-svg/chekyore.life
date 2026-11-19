import { healing, npcHealthYear, selfHealYear } from './illness'
import { chance, int, next, pick, weighted } from './rng'
import {
  addPattern,
  addYears,
  aliveNpcs,
  applyEffects,
  changeParam,
  changeSkill,
  check,
  checkAll,
  faithMatches,
  getParam,
  killNpc,
  note,
  npcAge,
  qx,
  regionOf,
  resolveFaith,
  statusOf,
  ancestorRule,
  isProtected,
  ancestorNamesOf,
  descentOf,
  awayNpcs,
  childName,
  moneyScale,
  tradeEffects,
  tradeMastery,
  bandOf,
} from './rules'
import { householdYear } from './household'
import { emotionsYear } from './emotions'
import { childOutcome, childrenYear, matchYear } from './children'
import { tradeYear } from './trade'
import { businessYear } from './business'
import { pets } from './pets'
import { abroadYear, homesickDue, naturalizeDue } from './abroad'
import { autoDream, dreamDue, dreamRng, pickDream, resolveDream, skipDream, startDream } from './dreams'
import { ERA_META, eraById, isEraLoaded } from '../content'
import { estateOffers, estatePrice, offerAnswered } from './estate'
import { applyPeril, assetPeril, perilParams } from './perils'
import { kinYear } from './kin'
import type { PerilAction } from './perils'
import type { EstateKind } from './estate'
import { chronicleSuccessor, eraEnding, summarize } from './life'
import { ensureGoal, eventHelpsGoal, goalYear } from './goals'
import { ATTRIBUTES, PRIMER_TOPICS } from './types'
import type { PrimerDef } from './types'
import type { ActiveEvent, ChoiceDef, Condition, DiaryEntry, EraDef, EventDef, FocusDef, GameState, LifestyleDef, LifestyleOption, Npc, PendingTrigger, TextParam, Topic, TriggerDepend, TriggerSnapshot } from './types'
import { applyDice, canRansom, diceRefuse, diceStakes, fateGame, pickOpponent } from './dice'
import type { DiceResult } from './dice'
import { applyCrisis, botCrisis, crisisDue, crisisStances, STANCES } from './crisis'
import type { StanceId } from './crisis'

/** Без мини-игры (бот, тесты): партия на любую из доступных ставок, после проигрыша - отыграться (каждый второй раз, до трёх партий). */
function botDice(state: GameState, era: EraDef, festive: boolean): DiceResult[] {
  const out: DiceResult[] = []
  for (let i = 0; i < 3; i++) {
    const stakes = diceStakes(state, era)
    const r: DiceResult = { ...fateGame(state, stakes[Math.floor(next(state) * stakes.length)], pickOpponent(() => next(state))), chase: i > 0, festive }
    // Проиграл скотину - откупается деньгами, если их вдвое больше её цены.
    if (!r.won && canRansom(state.hero, r.stake) && state.hero.money >= r.stake.amount * 2) r.ransom = true
    applyDice(state, era, r)
    out.push({ ...r, applied: true })
    if (r.won || next(state) < 0.5) break
  }
  return out
}

/** Расходы на положение с большой казны: доля в год сверх LUXURY_FROM годовых расходов. */
export const LUXURY = 0.03
export const LUXURY_FROM = 15

/** Праздники, когда кости разрешены: Сатурналии, ночь Дивали. */
export const FESTIVE = ['v_dice_saturnalia', 'ind_d_diwali_dice']

/** Выборы события костей, которые разыгрываются партией. */
const DICE_PLAY = ['play', 'road', 'chase']
/** Выборы события костей, которые не партия, но и не отказ (Сатурналии: сыграть на орехи). */
const DICE_NOT_REFUSAL = ['nuts']

/** Через сколько лет одно и то же событие может повториться. */
const COOLDOWN = 8
/** Сколько лет между любыми двумя столами с костями. */
const DICE_GAP = 2

// ---------- Годовой фокус ----------

export function availableFocuses(state: GameState, era: EraDef): FocusDef[] {
  const age = state.hero.age
  return era.focuses.filter((f) => age >= f.ages[0] && age <= f.ages[1] && checkAll(state, f.conditions))
}

export function stageOf(state: GameState, era: EraDef): 'infancy' | 'childhood' | 'youth' | 'adulthood' | 'old_age' {
  const age = state.hero.age
  if (age < 5) return 'infancy'
  if (age < era.stages.youth) return 'childhood'
  if (age < era.stages.adult) return 'youth'
  if (age < era.stages.old) return 'adulthood'
  return 'old_age'
}

// ---------- Ход года ----------

const FAMILY_ICONS = ['birth', 'child', 'wedding', 'death']
const familyChange = (d: DiaryEntry) => d.topic === 'family' && !!d.icon && FAMILY_ICONS.includes(d.icon)

/**
 * Начать год с выбранным фокусом. Всё, что случится за год, рассчитывается сразу, но показывается
 * постепенно: у событий есть момент `at` (доля года), у записей дневника - `state.reveal`.
 * Когда часы года дойдут до конца и все события будут разобраны, вызывается finishYear.
 */
export function startYear(state: GameState, era: EraDef, focusId: string | null): void {
  era = eraNow(state, era)
  if (state.phase !== 'year') throw new Error(`startYear in phase ${state.phase}`)
  const hero = state.hero
  state.reveal = {}
  // Цели нет, а окно выбора этому герою уже показывали (закрыл, не выбрав) - первая из предложенных.
  // Ещё не спрашивали - окно выбора откроет интерфейс (src/goal.ts goalDue); боту цель даёт autoplay.
  if (state.stats?.heroId === hero.id && state.stats.goalAsked) ensureGoal(state, era)
  const firstEntry = hero.diary.length
  const focus = availableFocuses(state, era).find((f) => f.id === focusId) ?? null
  state.lastFocus = focus?.id ?? null
  if (focus) {
    applyEffects(state, era, focus.id === 'trade' ? tradeEffects(hero, focus.effects) : focus.effects)
    addPattern(hero, era.patternWeights.focus[focus.id])
  }
  if (focus?.id === 'travel') travelYear(state, era)
  if (hero.profession && hero.age >= era.stages.youth) addPattern(hero, era.patternWeights.profession[hero.profession])
  applyLifestyle(state, era)
  // Старые утраты тянут вниз и затухают - раз в год, до новых событий года.
  emotionsYear(state)
  selfHealYear(state)
  // Дети: воспитание и учёба (плата за год, окончание, отказ подростка).
  childrenYear(state, era)
  // Близкие: тёплая родня выручает в долгах, с холодной - ссоры (engine/kin.ts).
  kinYear(state)
  // Торговля и дела рода: запас портится, товарищества приносят прибыль или убыток.
  tradeYear(state)
  businessYear(state)
  // Хроника края кончилась при жизни героя - семья перебирается туда, где история продолжается (в своей стране).
  const moved = chronicleSuccessor(state, 0)
  if (moved && moved.era === hero.era) {
    hero.region = moved.region
    if (hero.places[hero.places.length - 1] !== moved.region) hero.places.push(moved.region)
    note(state, { key: 'diary.chronicle_move', params: { why: { key: `chronicle.why.${moved.from}` }, to: { key: `region.${moved.region}` } }, major: true, topic: 'history', icon: 'move', score: 60 })
  }
  const births = background(state, era, focus)
  householdYear(state, era)
  if (!hero.alive) return die(state, era)
  rollEvents(state, era, births)
  if (!hero.alive) return die(state, era)
  // Рождения, смерти и свадьбы в семье видны на вкладке семьи с начала года - и в ленте они в самом начале года,
  // иначе семья уже изменилась, а весть приходит через полгода.
  for (let i = firstEntry; i < hero.diary.length; i++) {
    if (hero.diary[i].primer) continue
    const r = next(state)
    state.reveal[i] = Math.round((familyChange(hero.diary[i]) ? 0.03 + r * 0.05 : 0.05 + r * 0.85) * 100) / 100
  }
  // Справки - равномерно по году, чтобы было время прочитать.
  let nth = 0
  for (let i = firstEntry; i < hero.diary.length; i++) if (hero.diary[i].primer) state.reveal[i] = 0.06 + 0.23 * nth++
  // Окно имени - в самом начале года, вместе с другими вестями семьи: малыш уже виден на вкладке семьи и в сцене,
  // и раньше весть о рождении приходила позже (отзыв владельца 09.11).
  let early = 0
  for (const q of state.queue) {
    const ev = era.events.find((e) => e.id === q.eventId)
    if (ev?.dynamic === 'name') q.at = Math.min(q.at, 0.005 + 0.005 * early++)
  }
  state.queue.sort((a, b) => a.at - b.at)
  // Запись о рождении появляется вместе с окном выбора имени, а не раньше.
  let born = -1
  for (const q of state.queue) {
    const ev = era.events.find((e) => e.id === q.eventId)
    if (ev?.dynamic !== 'name') continue
    born = Math.max(born, q.at + 0.005)
    const baby = hero.npcs.find((n) => n.id === q.npcId)
    for (let i = firstEntry; i < hero.diary.length; i++) {
      const child = hero.diary[i].params?.child
      if (baby && hero.diary[i].key.startsWith('diary.child_born') && child && typeof child === 'object' && 'name' in child && child.name === baby.name) state.reveal[i] = Math.min(1, q.at + 0.005)
    }
  }
  // Жена умерла в родах - весть сразу после рождения ребёнка, а не раньше него.
  if (born >= 0)
    for (let i = firstEntry; i < hero.diary.length; i++) {
      const c = hero.diary[i].params?.dcause
      if (hero.diary[i].key === 'diary.death_spouse' && c && typeof c === 'object' && 'key' in c && c.key === 'cause.childbirth') state.reveal[i] = Math.min(1, born + 0.01)
    }
  state.phase = 'running'
}

/** Закончить год: проверка смертности, возраст +1. Вызывается, когда все события года разобраны. */
export function finishYear(state: GameState, era: EraDef): void {
  era = eraNow(state, era)
  if (state.phase !== 'running') throw new Error(`finishYear in phase ${state.phase}`)
  if (state.queue.length > 0) throw new Error('Events are still waiting')
  endYear(state, era)
}

// ---------- Образ жизни ----------

export function lifestyleDefs(state: GameState, era: EraDef): LifestyleDef[] {
  return era.lifestyle.filter((d) => state.hero.age >= d.minAge && (!d.classes || d.classes.includes(state.hero.cls)))
}

export function lifestyleOption(state: GameState, def: LifestyleDef): LifestyleOption {
  const chosen = def.options.find((o) => o.id === state.hero.lifestyle[def.id])
  if (chosen && checkAll(state, chosen.requirements)) return chosen
  return def.options.find((o) => o.id === def.default)!
}

function applyLifestyle(state: GameState, era: EraDef): void {
  for (const def of lifestyleDefs(state, era)) {
    const opt = lifestyleOption(state, def)
    state.hero.money -= opt.cost
    applyEffects(state, era, opt.effects)
  }
}

function lifestyleMortality(state: GameState, era: EraDef): number {
  return lifestyleDefs(state, era).reduce((m, def) => m * (lifestyleOption(state, def).mortality ?? 1), 1)
}

/** Лихва: долг растёт на 8% в год. */
const DEBT_INTEREST = 1.08
/** Долговая яма - долг больше стольких годовых расходов сословия. */
const DEEP_DEBT = 2

/** Фоновые процессы года. Возвращает новорождённых детей, чтобы им выбрали имена. */
function background(state: GameState, era: EraDef, focus: FocusDef | null): Npc[] {
  const hero = state.hero
  const age = hero.age
  const births: Npc[] = []
  // Чужбина: вживание, принятие, тоска; доход первых лет ниже, потом - по вживанию.
  const abroadIncome = abroadYear(state, focus)

  // Работа и расходы взрослого.
  if (age >= era.stages.youth) {
    const prof = era.professions.find((p) => p.id === hero.profession)
    const cls = era.classes.find((c) => c.id === hero.cls)
    // Старость: взрослый ребёнок рядом берёт на себя половину расходов дома - как и было в жизни.
    const old = age >= era.stages.old
    const keeper = old ? hero.npcs.find((n) => n.role === 'child' && n.alive && !n.away && npcAge(n, state.year) >= era.stages.adult) : undefined
    let income = 0
    if (prof) {
      income = int(state, prof.income[0], prof.income[1]) * (0.75 + (hero.skills[prof.skill] ?? 0) / 100)
      income *= (focus?.incomeMultiplier ?? 1) * abroadIncome * novice(state)
      // Сил к старости меньше - доход падает постепенно: с наступлением старости на пятую часть, через 10 лет - на 40%.
      if (age >= era.stages.old + 10) income *= 0.6
      else if (old) income *= 0.8
      if (focus?.id === 'work') changeSkill(hero, prof.skill, 3)
      changeParam(hero, 'stress', prof.stress ?? 0)
      changeParam(hero, 'reputation', prof.reputation ?? 0)
    }
    // Расходы зависят от сословия, но живут по средствам: солдат из знатной семьи тратит как солдат.
    // До взрослого возраста половину расходов несёт семья.
    let upkeep = cls?.upkeep ?? 0
    if (prof) upkeep = Math.min(upkeep, Math.max(100, ((prof.income[0] + prof.income[1]) / 2) * 0.85))
    if (age < era.stages.adult) upkeep *= 0.5
    if (keeper) {
      upkeep *= 0.5
      if (!hero.flags.includes('old_support')) {
        hero.flags.push('old_support')
        note(state, { key: 'diary.old_support', params: { who: { name: keeper.name } }, topic: 'family', score: 14, mood: 3 })
      }
    }
    // Земля и капитал приносят доход состоятельным семьям.
    const rent = hero.tags.includes('wealthy') && hero.money > 0 ? hero.money * 0.025 : 0
    // Кто больше зарабатывает, тот и живёт шире: треть обычного дохода занятия сверх обычных расходов уходит на дом,
    // слуг, одежду и подарки (по среднему доходу, а не по удаче года - иначе в плохой год сразу долг), а с большой казны -
    // ещё LUXURY в год сверх LUXURY_FROM годовых расходов (дом богача, челядь, пиры, дары). Достаток остаётся, но растёт
    // медленнее: с 19.11 - 3% сверх 15 лет расходов (было 1% сверх 20 - род становился баснословно богатым за поколение).
    const base = upkeep
    const usual = prof ? ((prof.income[0] + prof.income[1]) / 2) * (0.75 + (hero.skills[prof.skill] ?? 0) / 100) : 0
    upkeep += 0.33 * Math.max(0, usual + rent - base) + LUXURY * Math.max(0, hero.money - LUXURY_FROM * Math.max(base, 100))
    hero.money = Math.round(hero.money + income + rent - upkeep)
    // Долг растёт: заимодавцы берут лихву (8% в год) - так и попадают в долговую яму.
    if (hero.money < 0) hero.money = Math.round(hero.money * DEBT_INTEREST)

    // Деньги и настроение: долг давит, достаток радует.
    const level = Math.max(cls?.upkeep ?? 0, 100)
    const wasInDebt = hero.tags.includes('in_debt')
    if (hero.money < 0) {
      const depth = Math.min(3, -hero.money / level)
      changeParam(hero, 'stress', 6 + depth * 4)
      changeParam(hero, 'happiness', -3 - depth * 2)
      changeParam(hero, 'health', -1 - depth)
      changeParam(hero, 'self_esteem', -2)
      if (!wasInDebt) {
        hero.tags.push('in_debt')
        note(state, { key: 'diary.debt_start', topic: 'money', icon: 'loss', score: 20, mood: -4, major: true })
      }
      // Долговая яма: долг больше двух лет расходов - заимодавцы приходят за домом и свободой (события debt_*).
      const deep = depth >= DEEP_DEBT
      if (deep && !hero.tags.includes('deep_debt')) {
        hero.tags.push('deep_debt')
        note(state, { key: 'diary.debt_deep', topic: 'money', icon: 'loss', score: 30, mood: -6, major: true })
      } else if (!deep) hero.tags = hero.tags.filter((t) => t !== 'deep_debt')
    } else {
      hero.tags = hero.tags.filter((t) => t !== 'deep_debt')
      if (wasInDebt) {
        hero.tags = hero.tags.filter((t) => t !== 'in_debt')
        note(state, { key: 'diary.debt_paid', topic: 'money', score: 18, mood: 5 })
        changeParam(hero, 'happiness', 5)
        changeParam(hero, 'stress', -8)
      }
      if (hero.money > level * 5) {
        changeParam(hero, 'happiness', 2)
        changeParam(hero, 'stress', -2)
      } else if (hero.money < level * 0.3) changeParam(hero, 'stress', 2)
    }
  }

  // Пороки героя: пьянство, игра, маковый отвар - каждый год, пока не избавится.
  for (const vice of era.vices) {
    if (!hero.tags.includes(vice.tag)) continue
    hero.money -= Math.round((vice.cost ?? 0) * moneyScale(hero, era))
    applyEffects(state, era, vice.effects)
  }

  // Старение и самочувствие.
  if (age >= 35) changeParam(hero, 'health', -0.5)
  if (age >= 50) changeParam(hero, 'health', -1)
  if (age >= 65) changeParam(hero, 'health', -1.5)
  if (age < 25 && hero.attrs.health < 70) changeParam(hero, 'health', 1)
  if (hero.hidden.stress > 70) {
    changeParam(hero, 'health', -2)
    changeParam(hero, 'happiness', -3)
  }
  const company = aliveNpcs(hero, 'spouse').length + aliveNpcs(hero, 'friend').length
  if (age >= 16) changeParam(hero, 'loneliness', company > 0 ? -3 : 3)
  if (hero.hidden.loneliness > 60) changeParam(hero, 'happiness', -2)
  changeParam(hero, 'happiness', Math.sign(55 - hero.hidden.happiness) * 2)
  changeParam(hero, 'stress', Math.sign(20 - hero.hidden.stress) * 2)

  // Рождение детей: в один год - весть «ждём ребёнка», в следующий - роды (отзыв владельца 09.11).
  const spouse = aliveNpcs(hero, 'spouse')[0]
  const due = hero.expecting !== undefined && hero.expecting < state.year
  if (due) hero.expecting = undefined
  if (due && hero.tags.includes('married') && spouse) {
    const born = hero.npcs.length
    applyEffects(state, era, [{ add_npc: 'child', attitude: 50 }])
    const baby = hero.npcs[born]
    if (baby) {
      births.push(baby)
      changeParam(hero, 'happiness', 8)
      resemblance(state, baby, spouse)
    }
    // Сон о чистых руках: в семье, где моют руки щёлоком и кипятят ткани, горячка при родах вдвое реже.
    const risk = era.mortality.childbirth * (state.settings.mortality === 'soft' ? 0.5 : 1) * (hero.tags.includes('clean_births') ? 0.5 : 1)
    if (chance(state, risk)) {
      if (hero.sex === 'f') applyEffects(state, era, [{ kill: 'childbirth' }])
      else killNpc(state, spouse, 'childbirth')
    }
  } else if (!due && hero.expecting === undefined && hero.tags.includes('married') && spouse) {
    const motherAge = hero.sex === 'f' ? age : npcAge(spouse, state.year)
    if (motherAge >= 15 && motherAge <= 43) {
      let p = 0.28 + (focus?.id === 'family' ? 0.12 : 0) - (motherAge > 38 ? 0.12 : 0)
      // Первые жизни: у каждой своё число детей - до цели чаще, после почти никогда.
      const target = state.settings.kidsTarget
      if (target !== undefined) {
        const born = hero.npcs.filter((n) => n.role === 'child').length + (hero.expecting !== undefined ? 1 : 0)
        // Сколько ещё нужно за оставшиеся годы - столько и шанс (с запасом на неудачные годы).
        const left = Math.max(1, 45 - motherAge)
        p = born >= target ? p * 0.06 : Math.min(0.85, Math.max(p, ((target - born) / left) * 1.6))
      }
      if (chance(state, p)) {
        hero.expecting = state.year
        note(state, { key: hero.sex === 'f' ? 'diary.expecting_self' : 'diary.expecting', params: { who: { name: spouse.name } }, topic: 'family', icon: 'child', score: 14, mood: 3 })
        changeParam(hero, 'happiness', 3)
      }
    }
  }

  // Жизнь детей: выбирают дело, женятся и выходят замуж, у них рождаются свои дети.
  for (const child of aliveNpcs(hero, 'child')) {
    const a = npcAge(child, state.year)
    const opts = { who: { name: child.name }, sex: child.sex }
    // Учится - дело выберет после учёбы; окончил - по своему направлению (и туда, куда без учёбы не берут).
    const outcome = child.profession ? undefined : childOutcome(state, child, era)
    if (outcome && a >= 13 && a <= 24 && chance(state, 0.6)) {
      child.profession = pick(state, outcome.professions).id
      note(state, { key: 'diary.child_trade_edu', params: { ...opts, prof: { key: `prof.${child.profession}.as`, sex: child.sex } }, topic: 'family', score: 24, mood: 3, major: true })
      changeParam(hero, 'happiness', 3)
    } else if (outcome === undefined && !child.profession && a >= 13 && a <= 18 && chance(state, 0.4)) {
      const trades = era.professions.filter(
        (p) =>
          !p.promotion_only &&
          (!p.sex || p.sex === child.sex) &&
          (!p.classes || p.classes.includes(hero.cls)) &&
          (!p.regions || p.regions.includes(hero.region)) &&
          p.minAge <= a &&
          !p.requirements,
      )
      if (trades.length) {
        child.profession = pick(state, trades).id
        note(state, { key: 'diary.child_trade', params: { ...opts, prof: { key: `prof.${child.profession}.as`, sex: child.sex } }, topic: 'family', score: 18, mood: 2, major: true })
        changeParam(hero, 'happiness', 2)
      }
    }
    // Свадьба - через сватовство: игрок выбирает в панели «Дети», не решил за год - ребёнок решает сам.
    matchYear(state, era, child, a)
    if (child.married && a >= 18 && a <= 42 && chance(state, 0.14)) {
      const before = hero.npcs.length
      applyEffects(state, era, [{ add_npc: 'grandchild', attitude: 50 }])
      const g = hero.npcs[before]
      g.parentId = child.id
      // Внука нельзя назвать и именем его родителя (в Китае) - он станет героем-наследником со своими детьми.
      // ...и именем деда или прадеда: герой, его супруг и его родители - тоже предки внука.
      const elders = hero.npcs.filter((n) => ['spouse', 'father', 'mother'].includes(n.role)).map((n) => n.name)
      if (ancestorRule(era, hero.region) === 'forbid') g.name = childName(state, era, g.sex, [child.name, hero.name, ...elders])
      note(state, { key: `diary.grandchild_born_${g.sex}`, params: { child: { name: g.name }, parent: { name: child.name } }, major: true, topic: 'family', icon: 'child', score: 30, mood: 6 })
      changeParam(hero, 'happiness', 5)
    }
  }

  // Взрослые внуки тоже женятся, и у них рождаются правнуки героя.
  for (const g of hero.npcs.filter((n) => n.role === 'grandchild' && n.alive && !n.away && descentOf(hero.npcs, n) === 2)) {
    const a = npcAge(g, state.year)
    const [m0, m1] = era.marriageAge[g.sex]
    if (!g.married && a >= m0 && a <= m1 + 6 && chance(state, 0.25)) g.married = true
    if (g.married && a >= 18 && a <= 42 && chance(state, 0.12)) {
      const before = hero.npcs.length
      applyEffects(state, era, [{ add_npc: 'grandchild', attitude: 50 }])
      const gg = hero.npcs[before]
      gg.parentId = g.id
      if (ancestorRule(era, hero.region) === 'forbid') gg.name = childName(state, era, gg.sex, [g.name, hero.npcs.find((n) => n.id === g.parentId)?.name ?? '', hero.name, ...hero.npcs.filter((n) => n.role === 'spouse').map((n) => n.name)])
      note(state, { key: `diary.great_grandchild_born_${gg.sex}`, params: { child: { name: gg.name }, parent: { name: g.name } }, major: true, topic: 'family', icon: 'child', score: 30, mood: 6 })
      changeParam(hero, 'happiness', 4)
    }
  }

  // Родные и близкие тоже стареют.
  // Новорождённых в год рождения не трогаем: иначе имя выбирают ребёнку, которого в ленте уже нет.
  for (const npc of hero.npcs) {
    if (!npc.alive || npc.birthYear === state.year) continue
    // Сначала болезнь с названием, через год - смерть или выздоровление; внезапно - младенцы, роды, несчастный случай (engine/illness.ts).
    npcHealthYear(state, npc, npcMortality(state, era, npc))
  }
  return births.filter((b) => b.alive)
}

/**
 * Год путешествий: поездка в другой край своей страны (запись в дневник - засчитывается цели «Путешественник»),
 * иногда - предложение остаться там на работе (событие travel_work, метка travel_offer).
 */
function travelYear(state: GameState, era: EraDef): void {
  const hero = state.hero
  hero.tags = hero.tags.filter((t) => t !== 'travel_offer')
  const open = era.regions.filter((r) => r.id !== hero.region && state.year >= r.years[0] && state.year <= r.years[1])
  if (!open.length) return
  const to = pick(state, open).id
  hero.lastTrip = to
  note(state, { key: 'diary.travel_trip', params: { place: { key: `region.${to}` } }, topic: 'life', icon: 'move', score: 14, mood: 2 })
  if (hero.age >= 18 && hero.cls !== 'slave' && chance(state, 0.3)) hero.tags.push('travel_offer')
}

/** На кого похож новорождённый: на героя, на супруга, на деда или бабку - а изредка на соседа. */
function resemblance(state: GameState, baby: Npc, spouse: Npc): void {
  const hero = state.hero
  const elder = hero.npcs.filter((n) => n.role === 'father' || n.role === 'mother')
  const opts: { kind: string; w: number; who?: Npc }[] = [
    { kind: 'you', w: 40 },
    { kind: 'spouse', w: 40, who: spouse },
    ...(elder.length ? [{ kind: 'elder', w: 16, who: elder[Math.floor(next(state) * elder.length)] }] : []),
    { kind: 'neighbor', w: 4 },
  ]
  const o = weighted(state, opts, (x) => x.w)!
  note(state, { key: `diary.child_looks_${o.kind}`, params: { child: { name: baby.name }, sex: baby.sex, ...(o.who ? { who: { name: o.who.name }, wsex: o.who.sex } : {}) }, topic: 'family', score: o.kind === 'neighbor' ? 16 : 8 })
  if (o.kind === 'neighbor') {
    changeParam(hero, 'stress', 3)
    if (hero.sex === 'm') spouse.attitude = Math.max(-100, spouse.attitude - 5)
  }
}

function npcMortality(state: GameState, era: EraDef, npc: Npc): number {
  const age = npcAge(npc, state.year)
  let q = qx(era, age)
  if (state.settings.mortality === 'soft' && age < 15) q *= 0.5
  return q
}

function healthFactor(h: number): number {
  return h >= 80 ? 0.6 : h >= 60 ? 0.85 : h >= 40 ? 1 : h >= 20 ? 1.6 : 3
}

/** Сколько здоровья в год прибавляют или отнимают образ жизни и пороки. */
function yearlyHealthTrend(state: GameState, era: EraDef): number {
  const sum = (effects: { param?: string; delta?: number }[] | undefined) =>
    (effects ?? []).reduce((s, e) => s + ('param' in e && e.param === 'health' ? (e.delta ?? 0) : 0), 0)
  let trend = 0
  for (const def of lifestyleDefs(state, era)) trend += sum(lifestyleOption(state, def).effects as never)
  for (const vice of era.vices) if (state.hero.tags.includes(vice.tag)) trend += sum(vice.effects as never)
  if (state.hero.tags.includes('in_debt')) trend -= 1.5
  return trend
}

/** Вероятность смерти героя в этом году. */
export function heroMortality(state: GameState, era: EraDef): number {
  const hero = state.hero
  let q = qx(era, hero.age) * (era.mortality.calibration ?? 1) * lifestyleMortality(state, era)
  const cls = era.classes.find((c) => c.id === hero.cls)
  q *= cls?.mortality ?? 1
  const prof = era.professions.find((p) => p.id === hero.profession)
  if (prof && hero.age >= era.stages.youth) q *= prof.mortality ?? 1
  const h = hero.attrs.health
  q *= healthFactor(h)
  if (hero.money > 1000) q *= 0.85
  if (hero.tags.includes('in_debt')) q *= 1.15
  if (hero.tags.includes('epidemic')) q *= 2
  // Больной врач лечит себя сам: болезнь опасна для него меньше.
  if (hero.tags.includes('ill')) q *= 1.6 - 0.5 * healing(hero)
  for (const vice of era.vices) if (hero.tags.includes(vice.tag)) q *= vice.mortality ?? 1
  if (state.settings.mortality === 'soft' && hero.age < 15) q *= 0.25
  q = Math.max(q, oldAgeFloor(era, hero.age))
  if (h <= 0) q = 1
  return Math.min(1, q)
}

/**
 * Глубокая старость: после 80 лет врач, баня и богатство уже почти не помогают - смертность не ниже 70% табличной,
 * а после последней строки таблицы (обычно 90) растёт ещё на 12% в год. Без этого знать доживала до 110–119.
 */
function oldAgeFloor(era: EraDef, age: number): number {
  if (age < 80) return 0
  const table = era.mortality.qx
  const [last] = table[table.length - 1]
  const extra = age > last ? 1.12 ** (age - last) : 1
  return Math.min(1, qx(era, age) * extra * 0.7)
}

/**
 * До скольких лет герой доживёт в среднем, если ничего не менять: таблица эпохи с поправкой
 * на всё, что сейчас влияет на его смертность (здоровье, образ жизни, пороки, долги, профессия).
 */
export function expectedAge(state: GameState, era: EraDef): number {
  const hero = state.hero
  const age = hero.age
  const cal = era.mortality.calibration ?? 1
  const base = qx(era, age) * cal
  // Всё, кроме здоровья, считаем неизменным; здоровье прогнозируем год за годом.
  const other = base > 0 ? heroMortality(state, era) / base / healthFactor(hero.attrs.health) : 1
  const trend = yearlyHealthTrend(state, era)
  let health = hero.attrs.health
  let alive = 1
  let years = 0
  for (let x = age; x < 110; x++) {
    alive *= 1 - Math.min(1, Math.max(qx(era, x) * cal * other * healthFactor(health), oldAgeFloor(era, x)))
    years += alive
    health += trend - (x >= 35 ? 0.5 : 0) - (x >= 50 ? 1 : 0) - (x >= 65 ? 1.5 : 0) + (x < 25 && health < 70 ? 1 : 0)
    health = Math.max(0, Math.min(100, health))
  }
  return Math.round(age + years + 0.5)
}

// ---------- События ----------

/** События, где родной впадает в порок (пьянство, игра, мак): отмечены один раз на событие. */
const VICE_TAG = /"npc_tag":\s*"(?:drinker|gambler|opium|wine|races|dice_\w*)"/
const addsVice = new WeakMap<EventDef, boolean>()
const isViceEvent = (ev: EventDef) => {
  let v = addsVice.get(ev)
  if (v === undefined) addsVice.set(ev, (v = VICE_TAG.test(JSON.stringify(ev))))
  return v
}
/** Пороки у родных - реже, и чем больше их уже в семье, тем реже новые (отзыв игрока 08.11: «каждый родной спивается»). */
const VICE_TAGS = ['drinker', 'gambler', 'opium']

function eventWeight(state: GameState, ev: EventDef): number {
  let w = ev.base_weight
  if (isViceEvent(ev)) {
    const already = state.hero.npcs.filter((n) => n.alive && n.tags?.some((t) => VICE_TAGS.includes(t))).length
    w *= 0.5 * Math.pow(0.35, already)
  }
  for (const m of ev.weight_modifiers ?? []) if (check(state, m.if)) w *= m.multiply
  const goal = state.hero.goal
  if (goal && state.settings.goalWeight && eventHelpsGoal(goal.id, ev)) w *= state.settings.goalWeight
  return w
}

/** Персонажи, о которых может быть событие. */
/**
 * Страна, где герой сейчас: после переезда в другую страну дальше считаются её правила и события
 * (если её контент уже загружен; иначе - пока прежняя).
 */
export function eraNow(state: GameState, era: EraDef): EraDef {
  return state.hero.era === era.id || !isEraLoaded(state.hero.era) ? era : eraById(state.hero.era)
}

/** Счётчики для отчётов симуляции: сколько последствий отменено и по какой причине. */
export const triggerStats = { cancelled: {} as Record<string, number>, postponed: 0 }

/** Обстоятельства, от которых зависит последствие. */
export function snapshot(state: GameState): TriggerSnapshot {
  const h = state.hero
  return {
    region: h.region,
    cls: h.cls,
    profession: h.profession ?? undefined,
    spouseId: aliveNpcs(h, 'spouse')[0]?.id,
    married: h.tags.includes('married'),
    free: !h.tags.includes('enslaved') && h.cls !== 'slave',
  }
}

/** От чего зависит последствие: явно (depends) или по самому событию. */
export function dependsOf(ev: EventDef): TriggerDepend[] {
  if (ev.depends) return ev.depends
  const d: TriggerDepend[] = []
  if (ev.npc) d.push('npc')
  if (ev.npc === 'spouse') d.push('spouse')
  if (ev.regions || ev.type === 'local') d.push('region')
  if (ev.topic === 'work') d.push('profession')
  return d
}

/** Почему последствие уже не к месту (или undefined, если всё в силе). */
function triggerBroken(state: GameState, ev: EventDef, t: PendingTrigger): string | undefined {
  const deps = dependsOf(ev)
  // Того человека нет (умер, уехал, вырос из возраста события): последствие про другого - нельзя.
  if (ev.npc && t.npcId && !npcCandidates(state, ev).some((n) => n.id === t.npcId)) {
    const n = state.hero.npcs.find((x) => x.id === t.npcId)
    // Причина - для отчёта: умер, уехал, исчез, не подходит больше (бросил пить, вырос из возраста события).
    return !n ? 'npc_removed' : !n.alive ? 'npc_dead' : n.away ? 'npc_away' : 'npc_changed'
  }
  if (!t.snap) return undefined
  const now = snapshot(state)
  if (deps.includes('region') && now.region !== t.snap.region) return 'region'
  if (deps.includes('class') && now.cls !== t.snap.cls) return 'class'
  if (deps.includes('profession') && now.profession !== t.snap.profession) return 'profession'
  if (deps.includes('spouse') && now.spouseId !== t.snap.spouseId) return 'spouse'
  if (deps.includes('married') && now.married !== t.snap.married) return 'married'
  if (deps.includes('freedom') && now.free !== t.snap.free) return 'freedom'
  return undefined
}

/**
 * Ключ сюжетной линии последствия (поле storyline события; 'child' - своя линия у каждого ребёнка).
 * Разные истории про одного человека не мешают друг другу: противоречия про людей ловит правило «тот же человек».
 */
function lineOf(ev: EventDef | undefined, npcId: string | undefined): string | undefined {
  if (!ev?.storyline) return undefined
  return ev.storyline === 'child' && npcId ? `child:${npcId}` : ev.storyline
}

function npcCandidates(state: GameState, ev: EventDef): Npc[] {
  if (!ev.npc) return []
  // Весть издалека или возвращение - про того, кто вдали; все остальные события - про тех, кто рядом.
  // Вести и возвращения - не раньше чем через два года разлуки.
  const pool = ev.npc_away
    ? awayNpcs(state.hero, ev.npc).filter((n) => state.year - n.away!.since >= 2 && (ev.npc_away === true || (ev.npc_away as string[]).includes(n.away!.reason)))
    : aliveNpcs(state.hero, ev.npc)
  return pool.filter((n) => {
    if (ev.npc_married !== undefined && !!n.married !== ev.npc_married) return false
    if (ev.npc_tag && !n.tags?.includes(ev.npc_tag)) return false
    if (ev.npc_no_tag && n.tags?.includes(ev.npc_no_tag)) return false
    if (!ev.npc_age) return true
    const a = npcAge(n, state.year)
    return a >= ev.npc_age[0] && a <= ev.npc_age[1]
  })
}

const otherFaithCache = new WeakMap<EventDef, boolean>()
/** Событие предлагает перейти в чужую веру края - без чужой веры оно бессмысленно. */
function convertsToOther(ev: EventDef): boolean {
  let v = otherFaithCache.get(ev)
  if (v === undefined) {
    v = JSON.stringify(ev).includes('"set_religion":"other"')
    otherFaithCache.set(ev, v)
  }
  return v
}

/** Подходит ли событие герою прямо сейчас (без учёта случайности). */
export function eligible(state: GameState, era: EraDef, ev: EventDef, ignoreTiming = false): boolean {
  const hero = state.hero
  if (state.settings.blockedEvents?.includes(ev.id)) return false
  if (ev.sensitive && state.settings.softenHeavy) return false
  if (ev.regions && !ev.regions.includes(hero.region)) return false
  if (ev.classes && !ev.classes.includes(hero.cls)) return false
  if (ev.sex && ev.sex !== hero.sex) return false
  if (ev.religions && !faithMatches(hero.religion, ev.religions)) return false
  if (!ignoreTiming) {
    if (ev.years && (state.year < ev.years[0] || state.year > ev.years[1])) return false
    if (ev.age_range && (hero.age < ev.age_range[0] || hero.age > ev.age_range[1])) return false
  }
  const last = hero.seen[ev.id]
  if (last !== undefined && (ev.once || ev.milestone || ev.global_chance !== undefined)) return false
  if (ev.group && hero.seen[`@${ev.group}`] !== undefined) return false
  // Кости зовут чаще других событий, но не чаще раза в два года на все столы вместе (отзыв владельца 05.11:
  // иначе кости становятся постоянными).
  if (last !== undefined && !ignoreTiming && state.year - last < (ev.dynamic === 'dice' ? 2 : COOLDOWN)) return false
  const lastDice = hero.seen['@dice']
  if (ev.dynamic === 'dice' && lastDice !== undefined && !ignoreTiming && state.year - lastDice < DICE_GAP) return false
  // Трижды подряд отказался от костей - завязал: столов больше не предлагают.
  if (ev.dynamic === 'dice' && hero.dice?.quit) return false
  if (ev.npc && npcCandidates(state, ev).length === 0) return false
  if (ev.pet && !pets(state).some((p) => p.kind === ev.pet)) return false
  if (ev.effects && addsSpouse({ id: '', effects: ev.effects }) && aliveNpcs(hero, 'spouse').length > 0) return false
  if (convertsToOther(ev) && !resolveFaith(state, 'other')) return false
  if (ev.dynamic === 'profession' && professionChoices(state, era).length === 0) return false
  return checkAll(state, ev.conditions)
}

function activate(state: GameState, ev: EventDef, from?: number, npcId?: string): ActiveEvent {
  const npcs = npcCandidates(state, ev)
  const same = npcs.find((n) => n.id === npcId)
  const npc = same ?? (npcs.length ? pick(state, npcs) : undefined)
  return {
    eventId: ev.id,
    at: Math.round((0.1 + next(state) * 0.75) * 100) / 100,
    npcId: npc?.id,
    npcName: npc?.name,
    npcSex: npc?.sex,
    ...(ev.pet ? { petKind: ev.pet, petName: pets(state).find((p) => p.kind === ev.pet)?.name } : {}),
    variant: ev.variants ? int(state, 1, ev.variants) : undefined,
    from,
    outcome: null,
  }
}

/** Параметры текста событий хозяйства: цена в монете края, следующий дом, сколько наделов и рабов. */
function estateParams(state: GameState, eventId: string): Record<string, TextParam> {
  const hero = state.hero
  const kind = ESTATE_EVENTS[eventId] ?? 'land'
  const price = estatePrice(state, kind)
  const coin = ERA_META[hero.era]?.regions.find((r) => r.id === hero.region)?.coin ?? 'coin'
  return { price: price.toLocaleString(), n: price, coin: { key: `coin.${coin}` }, home: { key: `home.${Math.min(4, (hero.home ?? 1) + 1)}` }, land: hero.land ?? 0, slaves: hero.slaves ?? 0 }
}

/** Исторические события: во сколько раз чаще, пока в жизни их ещё не было, и с какого возраста героя. */
export const HISTORY_BOOST = { mult: 3, from: 6 }

/** Подкидыш бездетному: с какого возраста и шанс в год (объект - чтобы прогон мог сравнить «с» и «без»). */
export const FOUNDLING = { from: 28, chance: 0.12 }

/** События-предложения о покупке: какое владение предлагает каждое. */
const ESTATE_EVENTS: Record<string, EstateKind> = { estate_home: 'home', estate_land: 'land', estate_slaves: 'slaves' }

/** Параметры текста события: имя и пол персонажа, о котором оно. */
export function eventParams(state: GameState, active: Pick<ActiveEvent, 'npcId' | 'npcName' | 'npcSex' | 'petKind' | 'petName' | 'perilText'> & { eventId?: string }): Record<string, TextParam> {
  // Питомец: по кличке, а если клички нет - «попугай», «черепаха».
  const pet: Record<string, TextParam> = active.petKind ? { pet: active.petName ? { name: active.petName } : { key: `pet.${active.petKind}` } } : {}
  // Хозяйство: {price} {coin} - цена покупки, {home} - какой дом купить, {land} и {slaves} - сколько уже есть.
  if (active.eventId?.startsWith('estate_')) Object.assign(pet, estateParams(state, active.eventId))
  // Беда хозяйства: {what} - какое, {rebuild} {ruins} {bribe} {court} {sue} - суммы.
  if (active.perilText) Object.assign(pet, active.perilText)
  // Работа в краю, куда ездил: {place} - этот край.
  if (active.eventId === 'travel_work' && state.hero.lastTrip) pet.place = { key: `region.${state.hero.lastTrip}` }
  // Перелом: {age} - возраст героя.
  if (active.eventId === 'crisis_turn') pet.age = state.hero.age
  // На чужбине: {homeland} - родная страна, {homeplace} - родной край.
  const a = state.hero.abroad
  if (a) Object.assign(pet, { homeland: { key: `era.${a.homeland.era}` }, homeplace: { key: `region.${a.homeland.region}` } })
  const npc = state.hero.npcs.find((n) => n.id === active.npcId)
  if (npc) return { npc: { name: npc.name }, npc_sex: npc.sex, ...pet }
  return active.npcName ? { npc: { name: active.npcName }, npc_sex: active.npcSex ?? 'm', ...pet } : pet
}

export function eventTextKey(ev: EventDef, variant?: number): string {
  return variant ? `ev.${ev.id}.text.${variant}` : `ev.${ev.id}.text`
}

function topicOf(ev: EventDef): Topic {
  if (ev.topic) return ev.topic
  if (ev.type === 'family') return 'family'
  if (ev.type === 'global_historical') return 'history'
  if (ev.type === 'local') return 'money'
  return 'life'
}

interface Buckets {
  byId: Map<string, EventDef>
  naming?: EventDef
  globals: EventDef[]
  milestones: EventDef[]
  periodic: EventDef[]
  turning: EventDef[]
  regular: EventDef[]
  firstChoice: EventDef[]
  moments: EventDef[]
}

/** События эпохи, разложенные по видам один раз: так год считается в разы быстрее. */
const bucketCache = new WeakMap<EraDef, Buckets>()
function buckets(era: EraDef): Buckets {
  let b = bucketCache.get(era)
  if (!b) {
    const ev = era.events
    b = {
      byId: new Map(ev.map((e) => [e.id, e])),
      naming: ev.find((e) => e.dynamic === 'name'),
      globals: ev.filter((e) => !e.moment && e.global_chance !== undefined),
      milestones: ev.filter((e) => !e.moment && e.milestone),
      periodic: ev.filter((e) => !e.moment && !e.trigger_only && e.every),
      turning: ev.filter((e) => !e.moment && e.turning && !e.trigger_only),
      regular: ev.filter((e) => !e.moment && !e.trigger_only && !e.milestone && !e.turning && (!e.dynamic || e.dynamic === 'dice') && !e.first_choice && e.global_chance === undefined),
      firstChoice: ev.filter((e) => e.first_choice),
      moments: ev.filter((e) => e.moment && !e.trigger_only && !e.turning),
    }
    bucketCache.set(era, b)
  }
  return b
}

/** Быстрая предварительная проверка без условий: регион, сословие, пол, возраст, годы. */
function quickFit(state: GameState, ev: EventDef): boolean {
  const hero = state.hero
  return (
    (!ev.age_range || (hero.age >= ev.age_range[0] && hero.age <= ev.age_range[1])) &&
    (!ev.years || (state.year >= ev.years[0] && state.year <= ev.years[1])) &&
    (!ev.regions || ev.regions.includes(hero.region)) &&
    (!ev.classes || ev.classes.includes(hero.cls)) &&
    (!ev.sex || ev.sex === hero.sex) &&
    (!ev.religions || faithMatches(hero.religion, ev.religions))
  )
}

function rollEvents(state: GameState, era: EraDef, births: Npc[] = []): void {
  const b = buckets(era)
  const hero = state.hero
  const picked: ActiveEvent[] = []
  // 0. Новорождённым выбирают имя.
  // Имя младенцу - в начале года: малыш уже на вкладке семьи.
  if (b.naming) for (const baby of births) picked.push({ ...activate(state, b.naming), at: 0.06, npcId: baby.id, npcName: baby.name, npcSex: baby.sex })
  const has = (ev: EventDef) => picked.some((p) => p.eventId === ev.id)
  const add = (ev: EventDef | undefined, from?: number, npcId?: string) => {
    if (ev && !has(ev)) picked.push(activate(state, ev, from, npcId))
  }
  const byId = (id: string) => b.byId.get(id)
  const fits = (ev: EventDef) => quickFit(state, ev) && eligible(state, era, ev)
  // Первые жизни: события прошлых жизней и уже бывшие в этой не повторяются - если нового подходящего нет,
  // в этот год такого события просто не будет (кроме истории рождения: она нужна всегда). Дальше (eventsSoft) - повтор можно.
  // Если новых не было два года подряд (долгая прошлая жизнь в той же стране, наследник, жизнь вне хроники) -
  // тоже можно повтор: пустые годы хуже повтора.
  const before = state.settings.eventsSeen ? new Set(state.settings.eventsSeen) : null
  const soft = state.settings.eventsSoft || (state.quietYears ?? 0) >= 2
  const fresh = (list: EventDef[], must = false): EventDef[] => {
    if (!before) return list
    // Кости - сквозная линия (как долги): приглашения и тяга повторяются, иначе азарт не может затянуть.
    const unseen = list.filter((e) => e.dynamic === 'dice' || (!before.has(e.id) && hero.seen[e.id] === undefined))
    if (!unseen.length && list.length) starved = true
    return unseen.length || !(must || soft) ? unseen : list
  }
  let starved = false

  // 1. Отложенные последствия прошлых решений: только если обстоятельства решения не изменились,
  // только про того же человека; не больше одного в год на сюжетную линию и двух всего - остальные ждут год.
  const due = hero.triggers.filter((t) => t.year <= state.year)
  hero.triggers = hero.triggers.filter((t) => t.year > state.year)
  const lines = new Set<string>()
  let fired = 0
  for (const t of due) {
    const ev = byId(t.eventId)
    if (!ev) continue
    const why = triggerBroken(state, ev, t)
    if (why) {
      triggerStats.cancelled[why] = (triggerStats.cancelled[why] ?? 0) + 1
      continue
    }
    if (fired >= 2 || (t.line && lines.has(t.line))) {
      hero.triggers.push({ ...t, year: addYears(state.year, 1) })
      triggerStats.postponed++
      continue
    }
    if (chance(state, t.chance) && eligible(state, era, ev, true)) {
      // Момент (без заголовка и выбора) не открывается окном, а сразу записывается в ленту - как и прочие моменты.
      // Раньше отложенный момент вставал в очередь событий и показывал ключ «ev.….title» (отзыв игрока 03.11).
      if (ev.moment) playMoment(state, era, ev, t.npcId)
      else add(ev, t.from, t.npcId)
      fired++
      if (t.line) lines.add(t.line)
    }
  }

  // 1а. Чужбина: раз в три года - «вернуться домой?»; после трёх отказов и вживания - «Ты здешний».
  if (naturalizeDue(state)) add(byId('ab_naturalized'))
  else if (homesickDue(state)) {
    add(byId('ab_homesick'))
    hero.abroad!.nextAsk = state.year + 3
  }

  // 1б. Долги: в долговой яме заимодавцы требуют решения через год, у обычного должника - иногда приходят к дверям.
  const debtEv = hero.tags.includes('deep_debt') ? byId('debt_pit') : hero.tags.includes('in_debt') ? byId('debt_creditors') : undefined
  if (debtEv && hero.age >= 16 && chance(state, hero.tags.includes('deep_debt') ? 0.5 : 0.25) && fits(debtEv)) add(debtEv)

  // 1в. Хозяйство: денег стало заметно больше, чем стоит покупка, - предложение купить дом побольше, землю или рабов
  // (выбором, а не тихим переездом). Одно предложение в год, по очереди того, чего не хватает.
  if (!debtEv && hero.alive) {
    const offer = estateOffers(state).map((k) => byId(`estate_${k}`)).find((ev) => ev && fits(ev))
    if (offer && chance(state, 0.4)) add(offer)
    // Беда хозяйства рода (пожар, паводок, управляющий, опала, тяжба) - одна в год, о конкретном хозяйстве.
    const peril = assetPeril(state)
    const pev = peril && byId(peril.eventId)
    if (peril && pev && fits(pev) && !has(pev)) picked.push({ ...activate(state, pev), assetId: peril.assetId, perilText: perilParams(state, peril.assetId) })
  }

  // 1г. Бездетный взрослый (решение владельца 10.11, №4): подкидыш у ворот - чтобы род мог продолжиться через приёмного
  // ребёнка (он обычный наследник). Своим шагом, мимо фильтра уникальности первых жизней; раз за жизнь (once).
  if (!debtEv && hero.alive && hero.age >= FOUNDLING.from && !hero.npcs.some((n) => n.role === 'child')) {
    const f = byId('a_foundling')
    if (f && hero.seen[f.id] === undefined && fits(f) && chance(state, FOUNDLING.chance)) add(f)
  }

  // 2. Исторические события в этом регионе и году (вне хроники их нет).
  // Пока в этой жизни истории ещё не было - подходящее событие втрое вероятнее (просьба владельца 10.11: у трети
  // взрослых героев за всю жизнь не случалось ни одного исторического события). Окна событий те же.
  const noHistoryYet = hero.age >= HISTORY_BOOST.from && !b.globals.some((ev) => hero.seen[ev.id] !== undefined)
  for (const ev of state.offChronicle === undefined ? b.globals : []) {
    if (fits(ev) && chance(state, Math.min(1, ev.global_chance! * (noHistoryYet ? HISTORY_BOOST.mult : 1)))) add(ev)
  }

  // 3. Возрастная развилка (не больше одной в год).
  add(b.milestones.find(fits))

  // 3б. Регулярные события (every: N лет): экзамен в Китае раз в три года, пока герой - кандидат (отзыв игрока 05.11).
  for (const ev of b.periodic) {
    const last = hero.seen[ev.id]
    if ((last === undefined || state.year - last >= ev.every!) && fits(ev)) add(ev)
  }

  // 3в. Перелом сорокалетия (A/B, engine/crisis.ts): раз за жизнь в назначенный год 36–44; он же поворотный момент года.
  // В год другой мини-игры (кости, сон) перелом сдвигается на год.
  const crisisEv = b.byId.get('crisis_turn')
  if (crisisEv && crisisDue(state, !!state.dream || picked.some((p) => p.dream || b.byId.get(p.eventId)?.dynamic === 'dice'))) {
    add(crisisEv)
    hero.crisis!.offered = state.year
    hero.lastTurning = hero.age
  }

  // 3а. Поворотный момент: примерно раз в 7–12 лет что-то круто меняет жизнь.
  if (hero.age >= 14 && hero.age - hero.lastTurning >= 7 && chance(state, 0.3)) {
    const turning = weighted(state, fresh(b.turning.filter((ev) => !has(ev) && fits(ev))), (e) => eventWeight(state, e))
    if (turning) {
      add(turning)
      hero.lastTurning = hero.age
    }
  }

  // 3б. Первый выбор - история рождения: в первый год каждой новой жизни игрок решает за родителей в первые секунды
  // (ТЗ P2). Истории прошлых жизней выпадают редко, чтобы начало не повторялось.
  if (hero.generation === 1 && hero.age === 0 && !picked.some((p) => (byId(p.eventId)?.choices?.length ?? 0) > 1)) {
    const seenBefore = state.settings.birthSeen ?? []
    const first = weighted(state, fresh(b.firstChoice.filter(fits), true), (e) => eventWeight(state, e) * (seenBefore.includes(e.id) ? 0.15 : 1))
    if (first) picked.push({ ...activate(state, first), at: 0.3 })
  }

  // 4. Обычные события по весам.
  const dist = hero.age < 5 ? [0.7, 0.3, 0, 0] : state.settings.mode === 'quick' ? [0.45, 0.4, 0.12, 0.03] : [0.2, 0.45, 0.25, 0.1]
  let r = next(state)
  let count = 0
  while (count < dist.length - 1 && r >= dist[count]) r -= dist[count++]
  count = Math.max(0, count - (picked.length > 1 ? 1 : 0))
  if (count > 0) {
    const pool = b.regular.filter(fits)
    for (let i = 0; i < count; i++) add(weighted(state, fresh(pool.filter((p) => !has(p))), (e) => eventWeight(state, e)))
  }

  // 4а. Сон о будущем - со второй жизни, раз за жизнь. Свой поток случайности: остальная жизнь не меняется.
  const historical = picked.some((p) => byId(p.eventId)?.type === 'global_historical')
  const intro = byId('dream_intro')
  if (intro && dreamDue(state, historical)) {
    const dream = pickDream(state)
    if (dream) picked.push({ eventId: intro.id, at: Math.round((0.2 + dreamRng(state, 'at')() * 0.6) * 100) / 100, dream: dream.id, outcome: null })
  }

  // Год без событий из-за того, что всё подходящее уже было (а не просто тихий год), - копим; любое событие - сброс.
  if (before) state.quietYears = picked.some((p) => p.eventId !== b.naming?.id) ? 0 : starved ? (state.quietYears ?? 0) + 1 : state.quietYears
  state.queue = picked.sort((a, b) => a.at - b.at)
  for (const p of picked) {
    hero.seen[p.eventId] = state.year
    const ev = byId(p.eventId)
    if (ev?.group) hero.seen[`@${ev.group}`] = state.year
    if (ev?.dynamic === 'dice') hero.seen['@dice'] = state.year
  }

  // Историческая справка в первые годы: младенцу ещё нечего решать - игрок узнаёт свой мир.
  if (hero.generation === 1 && !state.settings.primersOff && hero.age * PRIMERS_PER_YEAR < PRIMER_TOPICS.length && state.offChronicle === undefined) {
    for (const p of primersForYear(state, era)) note(state, { key: `primer.${p.id}.title`, primer: p.id, topic: 'history', score: 2 })
  }

  // Вести из мира этого года.
  if (hero.age >= 6 && state.offChronicle === undefined) {
    for (const n of era.news) {
      if (n.year !== state.year || n.exclude_regions?.includes(hero.region)) continue
      note(state, { key: `news.${n.id}`, news: n.id, topic: 'history', score: 4 })
    }
  }

  // 5. Моменты жизни: происходят сами и сразу попадают в ленту.
  const moments = b.moments.filter(fits)
  const momentCount = state.settings.mode === 'quick' ? (chance(state, 0.7) ? 1 : 0) : 1 + (chance(state, 0.5) ? 1 : 0)
  for (let i = 0; i < momentCount && hero.alive; i++) {
    const ev = weighted(state, fresh(moments.filter((m) => hero.seen[m.id] !== state.year)), (e) => eventWeight(state, e))
    if (!ev) break
    playMoment(state, era, ev)
  }
}

/** Момент жизни: происходит сам - последствия и строка в ленте, без окна. npcId - про кого (отложенный момент). */
function playMoment(state: GameState, era: EraDef, ev: EventDef, npcId?: string): void {
  const hero = state.hero
  hero.seen[ev.id] = state.year
  if (ev.group) hero.seen[`@${ev.group}`] = state.year
  const active = activate(state, ev, undefined, npcId)
  const mood = hero.hidden.happiness
  applyEffects(state, era, ev.effects, { npcId: active.npcId })
  addPattern(hero, ev.pattern)
  note(state, {
    key: eventTextKey(ev, active.variant),
    params: eventParams(state, active),
    topic: topicOf(ev),
    icon: ev.icon,
    eventId: ev.id,
    mood: Math.round(hero.hidden.happiness - mood),
    major: !!ev.icon,
    score: 6 + Math.abs(hero.hidden.happiness - mood) + (ev.icon ? 15 : 0) + (active.npcId ? 5 : 0),
  })
}

/** Сколько тем справки на возраст: 0 лет - темы 1–4, 1 год - 5–8, 2 - 9–12, 3 - 13–16. */
const PRIMERS_PER_YEAR = 4

/** Подходит ли карточка герою и насколько она точна (больше - точнее); -1 - не подходит. */
function primerFit(state: GameState, p: PrimerDef): number {
  const h = state.hero
  if (p.regions && !p.regions.includes(h.region)) return -1
  if (p.classes && !p.classes.includes(h.cls)) return -1
  if (p.religions && !faithMatches(h.religion, p.religions)) return -1
  if (p.sex && p.sex !== h.sex) return -1
  if (p.years && (state.year < p.years[0] || state.year > p.years[1])) return -1
  // В теме веры точнее всего совпадение веры: обращённому в Теночтитлане - карточка о его новой вере, а не о богах края.
  const faithWeight = p.topic === 'faith' ? 5 : 3
  return (p.regions ? 4 : 0) + (p.classes ? 3 : 0) + (p.religions ? faithWeight : 0) + (p.years ? 2 : 0) + (p.sex ? 1 : 0)
}

/** Карточки справки на этот год: по одной на тему, самая точная из подходящих. */
export function primersForYear(state: GameState, era: EraDef): PrimerDef[] {
  const topics = PRIMER_TOPICS.slice(state.hero.age * PRIMERS_PER_YEAR, (state.hero.age + 1) * PRIMERS_PER_YEAR)
  const out: PrimerDef[] = []
  for (const topic of topics) {
    let best: PrimerDef | undefined
    let score = -1
    for (const p of era.primers ?? []) {
      if (p.topic !== topic) continue
      const f = primerFit(state, p)
      if (f > score) {
        best = p
        score = f
      }
    }
    if (best) out.push(best)
  }
  return out
}

export function currentEvent(state: GameState, era: EraDef): EventDef | null {
  const active = state.queue[0]
  return active ? era.events.find((e) => e.id === active.eventId) ?? null : null
}

/** Новичок в новом деле: в год смены - половина дохода, потом 65%, 80%, с четвёртого года - полный (и растёт с навыком). */
const NOVICE = [0.5, 0.65, 0.8]
export function novice(state: GameState): number {
  const since = state.hero.professionSince
  if (since === undefined) return 1
  return NOVICE[state.year - since] ?? 1
}

/** Не чаще раза в столько лет можно сменить дело самому (вкладка «Герой»). */
export const CHANGE_EVERY = 5

/** Дела, на которые можно перейти сейчас (кроме нынешнего); пусто - менять рано или не на что. */
export function careerOptions(state: GameState, era: EraDef): ChoiceDef[] {
  const hero = state.hero
  if (!hero.profession || hero.age < era.stages.adult || hero.age >= 55 || hero.cls === 'slave') return []
  if (hero.professionSince !== undefined && state.year - hero.professionSince < CHANGE_EVERY) return []
  return professionChoices(state, era).filter((c) => c.id !== hero.profession)
}

/** Сменить дело: навык нового - не меньше 8, доход первые годы ниже (novice). */
export function changeCareer(state: GameState, era: EraDef, id: string): boolean {
  const choice = careerOptions(state, era).find((c) => c.id === id)
  if (!choice) return false
  const from = state.hero.profession
  applyEffects(state, era, choice.effects)
  note(state, { key: 'diary.career_changed', params: { from: { key: `prof.${from}` }, prof: { key: `prof.${id}` } }, topic: 'work', icon: 'move', score: 30, major: true })
  return true
}

export function professionChoices(state: GameState, era: EraDef): ChoiceDef[] {
  const hero = state.hero
  return era.professions
    .filter(
      (p) =>
        !p.promotion_only &&
        (!p.classes || p.classes.includes(hero.cls)) &&
        (!p.sex || p.sex === hero.sex) &&
        (!p.regions || p.regions.includes(hero.region)) &&
        // Дело выбирают в 12 лет: до положенного возраста герой ходит в учениках.
        hero.age >= p.minAge - 6 &&
        checkAll(state, p.requirements),
    )
    .map((p) => ({
      id: p.id,
      effects: [{ set_profession: p.id }, { skill: p.skill, delta: 8 }],
    }))
}

/** Три имени на выбор для новорождённого: детерминированно от id ребёнка, чтобы не менялись при перерисовке. */
export function nameChoices(state: GameState, era: EraDef): ChoiceDef[] {
  const npc = state.hero.npcs.find((n) => n.id === state.queue[0]?.npcId)
  if (!npc) return []
  const names = regionOf(era, state.hero.region).names[npc.sex]
  const rule = ancestorRule(era, state.hero.region)
  const ancestors = new Set(ancestorNamesOf(state.hero))
  const used = new Set([state.hero.name, ...state.hero.npcs.filter((n) => n.alive && n.id !== npc.id).map((n) => n.name)])
  // Где имя предка запрещено (Китай), его не предлагаем; где принято - одно из трёх имён в честь деда или бабки.
  if (rule === 'forbid') for (const a of ancestors) used.add(a)
  let h = 0
  for (const ch of npc.id) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  // «Другие имена»: каждый раз - следующая тройка (без случайности: поток жизни не меняется).
  const shift = state.queue[0]?.nameShift ?? 0
  h = (h + shift * 7) >>> 0
  // Имя, данное при рождении, - первым, если оно не запрещено (в Китае - не имя предка) и не занято.
  const ids = new Set<string>(shift || used.has(npc.name) ? [] : [npc.name])
  if (rule === 'prefer' && !shift) {
    const own = names.filter((n) => ancestors.has(n.id) && n.id !== state.hero.name)
    if (own.length) ids.add(own[h % own.length].id)
  }
  for (let i = 0; ids.size < 3 && i < names.length * 2; i++) {
    const id = names[(h + i * 13) % names.length].id
    if (!used.has(id)) ids.add(id)
  }
  return [...ids].map((id) => ({ id, effects: [] }))
}

/** «Другие имена» в окне имени ребёнка. */
export function rerollNames(state: GameState): void {
  const q = state.queue[0]
  if (q) q.nameShift = (q.nameShift ?? 0) + 1
}

/** Варианты выбора текущего события. Пустой список - информационное событие с кнопкой «Далее». */
export function eventChoices(state: GameState, era: EraDef, ev: EventDef): ChoiceDef[] {
  if (ev.dynamic === 'profession') return professionChoices(state, era)
  if (ev.dynamic === 'name') return nameChoices(state, era)
  if (ev.dynamic === 'crisis') return crisisChoices(state)
  return ev.choices ?? []
}

const weds = new WeakMap<ChoiceDef, boolean>()
/** Выбор заводит нового супруга, а прежнего не отпускает (развод в том же выборе - можно). */
function addsSpouse(choice: ChoiceDef): boolean {
  let v = weds.get(choice)
  if (v === undefined) {
    // Вместе с исходами риска и случайными эффектами.
    const s = JSON.stringify([choice.effects ?? [], choice.risk_roll ?? {}])
    v = s.includes('"add_npc":"spouse"') && !s.includes('"remove_npc":"spouse"') && !s.includes('"remove_npc":"npc"')
    weds.set(choice, v)
  }
  return v
}

/** Перелом: тактики героя - варианты окна; тактика закрыта, если какой-то её ставке меньше 10. */
const crisisCache = new Map<string, ChoiceDef>()
function crisisChoices(state: GameState): ChoiceDef[] {
  return crisisStances(state).map((id) => {
    let c = crisisCache.get(id)
    if (!c) {
      c = { id, requirements: STANCES[id].stakes.map((p) => ({ param: p, op: '>=' as const, value: 10 })) }
      crisisCache.set(id, c)
    }
    return c
  })
}

/** Супруги, которые останутся после самого события: «Вдовство» убивает мужа эффектом события, а он применяется
 *  в момент выбора - до этого муж формально жив, и «Выйти за компаньона» было закрыто «ты замужем» (отзыв 10.11). */
function spousesAfterEvent(state: GameState, ev?: EventDef): number {
  const spouses = aliveNpcs(state.hero, 'spouse')
  if (!ev?.effects?.length) return spouses.length
  const npcId = state.queue[0]?.npcId
  const gone = (t: string) => (t === 'spouse' ? spouses.map((n) => n.id) : t === 'npc' && npcId ? [npcId] : [])
  const leaving = new Set(ev.effects.flatMap((e) => ('kill_npc' in e ? gone(e.kill_npc) : 'remove_npc' in e ? gone(e.remove_npc) : 'npc_away' in e ? gone(e.who ?? 'npc') : [])))
  return spouses.filter((n) => !leaving.has(n.id)).length
}

/** ev - событие, в котором этот выбор (его собственные эффекты применятся вместе с выбором). */
export function choiceAvailable(state: GameState, choice: ChoiceDef, ev?: EventDef): boolean {
  // Второй брак при живом супруге рядом - нет (в игре нет многожёнства).
  if (addsSpouse(choice) && spousesAfterEvent(state, ev) > 0) return false
  return checkAll(state, choice.requirements)
}

/** Почему вариант недоступен - первое невыполненное условие словами (ключ event.lock.*); null - доступен. */
export function lockReason(state: GameState, choice: ChoiceDef, ev?: EventDef): { key: string; params?: Record<string, TextParam> } | null {
  if (addsSpouse(choice) && spousesAfterEvent(state, ev) > 0) return { key: 'event.lock.married' }
  const failed = (choice.requirements ?? []).find((c) => !check(state, c))
  return failed ? conditionReason(state, failed) : null
}

/** Метки, о которых можно сказать словами: есть метка → ключ event.lock.tag.*, нет → event.lock.no_tag.*. */
const LOCK_TAGS = ['enslaved', 'married', 'lives_in_city', 'in_debt']

function conditionReason(state: GameState, c: Condition): { key: string; params?: Record<string, TextParam> } {
  if ('param' in c) {
    const have = Math.round(getParam(state.hero, c.param))
    if (c.param === 'money') return { key: 'event.lock.money' }
    if ((ATTRIBUTES as readonly string[]).includes(c.param)) return { key: 'event.lock.need', params: { what: { key: `attr.${c.param}` }, n: c.value, have } }
    if (c.param === 'reputation') return { key: 'event.lock.reputation' }
    if (c.param === 'homesick') return { key: 'event.lock.homesick' }
  }
  if ('skill' in c) return { key: 'event.lock.need', params: { what: { key: `skill.${c.skill}` }, n: c.value, have: Math.round(state.hero.skills[c.skill] ?? 0) } }
  if ('tag' in c && LOCK_TAGS.includes(c.tag)) return { key: `event.lock.tag.${c.tag}` }
  if ('tag_absent' in c && LOCK_TAGS.includes(c.tag_absent)) return { key: `event.lock.no_tag.${c.tag_absent}` }
  if ('sex' in c) return { key: `event.lock.sex.${c.sex}` }
  if ('classes' in c) return { key: 'event.lock.class' }
  if ('age' in c) return { key: 'event.lock.age', params: { a: c.age[0], b: c.age[1] } }
  if ('region' in c) return { key: 'event.lock.region' }
  if ('religion' in c || 'religion_absent' in c) return { key: 'event.lock.faith' }
  if ('has_npc' in c) return { key: 'event.lock.nobody' }
  if ('no_npc' in c && c.no_npc === 'spouse') return { key: 'event.lock.married' }
  if ('profession' in c || 'no_profession' in c) return { key: 'event.lock.profession' }
  if ('status' in c) return { key: 'event.lock.status' }
  // «Одно из»: первая причина, которую можно назвать словами.
  if ('any' in c && c.any.length) return c.any.map((x) => conditionReason(state, x)).find((r) => r.key !== 'event.lock.other') ?? { key: 'event.lock.other' }
  return { key: 'event.lock.other' }
}

/** Шанс успеха рискованного выбора с учётом параметра и склонности к риску. */
export function riskChance(state: GameState, choice: ChoiceDef): number | null {
  const roll = choice.risk_roll
  if (!roll) return null
  const value = roll.param ? getParam(state.hero, roll.param) : 50
  // Опытный торговец сделку почти не проваливает: сверху до +15% и потолок 97%.
  if (roll.param === 'trade') {
    const m = tradeMastery(state.hero)
    return Math.max(0.05, Math.min(0.95 + 0.02 * m, roll.success_chance_base + (value - 50) / 200 + 0.15 * m))
  }
  // Врач в делах о здоровье (риск смерти, болезни, увечья - своих или близких): до +25% и потолок 97%.
  const heal = healthRisk(roll) ? healing(state.hero) : 0
  return Math.max(0.05, Math.min(0.95 + 0.02 * heal, roll.success_chance_base + (value - 50) / 200 + 0.25 * heal))
}

/** Рискованный выбор о здоровье: провал убивает, ранит или приносит болезнь герою или близкому. */
export function healthRisk(roll: NonNullable<ChoiceDef['risk_roll']>): boolean {
  return (roll.on_failure ?? []).some(
    (e) => 'kill' in e || 'kill_npc' in e || ('add_tag' in e && e.add_tag === 'ill') || ('npc_tag' in e && e.npc_tag === 'sick') || ('param' in e && e.param === 'health' && 'delta' in e && e.delta < 0),
  )
}

/** Сделать выбор в текущем событии. id = null для информационного события. */
export function choose(state: GameState, era: EraDef, choiceId: string | null): void {
  const hero = state.hero
  const active = state.queue[0]
  const ev = currentEvent(state, era)
  if (!active || !ev || active.outcome) throw new Error('No event to choose in')
  const choices = eventChoices(state, era, ev)
  const choice = choices.find((c) => c.id === choiceId)
  if (choices.length > 0 && (!choice || !choiceAvailable(state, choice, ev))) throw new Error(`Bad choice ${choiceId}`)

  // Сон о будущем: «Попробовать вспомнить» открывает мини-игру, «Это просто сон» - второго сна не будет.
  if (ev.id === 'dream_intro' && active.dream) {
    if (choiceId === 'try') startDream(state, active.dream)
    else skipDream(state, active.dream)
  }
  const ctx = { npcId: active.npcId }
  const params = eventParams(state, active)
  const moodBefore = hero.hidden.happiness
  const diaryBefore = hero.diary.length
  let result: 'ok' | 'success' | 'failure' = 'ok'
  applyEffects(state, era, ev.effects, ctx)
  addPattern(hero, ev.pattern)
  const triggers: { eventId: string; year: number; chance: number }[] = []
  if (choice) {
    applyEffects(state, era, choice.effects, ctx)
    addPattern(hero, choice.pattern)
    era = eraNow(state, era)
    // Кости: итоги партий пришли из мини-игры; без неё (бот, тесты) - одна партия «на волю судьбы» на любую из доступных ставок.
    if (ev.dynamic === 'dice' && (ev.dice_play ?? DICE_PLAY).includes(choice.id)) {
      const list = active.dice?.length ? active.dice : botDice(state, era, FESTIVE.includes(ev.id))
      for (const r of list) if (!r.applied) applyDice(state, era, r)
      active.dice = list.map((r) => ({ ...r, applied: true }))
      const net = list.reduce((n, r) => n + (r.won && !r.caught ? r.stake.amount : -r.stake.amount), 0)
      result = net >= 0 ? 'success' : 'failure'
    } else if (ev.id.startsWith('peril_')) {
      const act = choice.effects?.find((e): e is { peril: PerilAction } => 'peril' in e)?.peril
      if (act) result = applyPeril(state, active.assetId, act)
    } else if (ev.dynamic === 'crisis') {
      // Перелом: шары брошены в окне (active.crisis); без окна (бот, тесты) - один шар и «Принять».
      result = applyCrisis(state, active.crisis ?? botCrisis(state, era, choice.id as StanceId))
    } else if (ev.dynamic === 'dice' && !DICE_NOT_REFUSAL.includes(choice.id)) {
      // Не стал играть: третий отказ подряд - завязал (engine/dice.ts, diceRefuse).
      diceRefuse(state)
    }
    if (choice.risk_roll) {
      const success = chance(state, riskChance(state, choice)!)
      result = success ? 'success' : 'failure'
      const out = success ? choice.risk_roll.on_success : choice.risk_roll.on_failure
      // Провал сделки у мастера торговли - небольшой убыток.
      applyEffects(state, era, choice.risk_roll.param === 'trade' && !success ? tradeEffects(hero, out) : out, ctx)
    }
    for (const d of choice.delayed_effects ?? []) {
      triggers.push({ eventId: d.trigger_event, year: addYears(state.year, int(state, d.after_years[0], d.after_years[1])), chance: d.chance })
    }
  }
  active.outcome = { choiceId: choice?.id ?? 'ok', result }
  offerAnswered(state, ev.id, choice?.id ?? null)
  const rescued = hero.diary.findIndex((d, i) => i >= diaryBefore && d.key.startsWith('diary.rescued.'))
  if (rescued >= 0) active.outcome.rescued = rescued
  if (ev.dynamic === 'name' && choice) {
    const npc = hero.npcs.find((n) => n.id === active.npcId)
    if (npc) {
      // Запись о рождении в дневнике тоже получает выбранное имя.
      for (const d of hero.diary) {
        const child = d.params?.child
        if (d.year === state.year && d.key.startsWith('diary.child_born') && child && typeof child === 'object' && 'name' in child && child.name === npc.name) d.params!.child = { name: choice.id }
      }
      npc.name = choice.id
    }
  }

  const decision = choices.length > 1
  const mood = Math.round(hero.hidden.happiness - moodBefore)
  const entry: Omit<DiaryEntry, 'year' | 'age'> = {
    // У момента нет заголовка - в дневник идёт его текст (момент мог открыться окном из очереди старого сохранения).
    key: ev.moment ? eventTextKey(ev, active.variant) : `ev.${ev.id}.title`,
    params: {
      ...params,
      ...(active.variant ? { v: active.variant } : {}),
      choice: choice && ev.dynamic === 'name' ? { name: choice.id } : { key: choice ? (ev.dynamic === 'profession' ? `prof.${choice.id}` : `ev.${ev.id}.${choice.id}`) : 'ui.ok' },
      result,
    },
    major: ev.milestone || ev.type === 'global_historical' || result !== 'ok' || !!ev.icon || !!choice?.icon,
    topic: ev.dynamic === 'profession' ? 'work' : topicOf(ev),
    icon: choice?.icon ?? ev.icon,
    eventId: ev.id,
    decision,
    mood,
    causedBy: active.from,
    score:
      Math.abs(mood) +
      (ev.milestone ? 25 : 0) +
      (ev.type === 'global_historical' ? 20 : 0) +
      (ev.once ? 5 : 0) +
      (active.npcId ? 8 : 0) +
      (decision ? 10 : 0) +
      (choice?.icon || ev.icon ? 15 : 0) +
      (result !== 'ok' ? 5 : 0) +
      (active.from !== undefined ? 10 : 0),
  }
  const index = note(state, entry)
  state.reveal[index] = active.at
  // Последствие запоминает обстоятельства решения; в одной сюжетной линии новая цепочка не начинается, пока ждёт старая.
  const snap = snapshot(state)
  for (const t of triggers) {
    const line = lineOf(buckets(era).byId.get(t.eventId), active.npcId)
    if (line && hero.triggers.some((p) => p.line === line && p.from !== index)) {
      triggerStats.cancelled.storyline = (triggerStats.cancelled.storyline ?? 0) + 1
      continue
    }
    hero.triggers.push({ ...t, from: index, npcId: active.npcId, snap, line })
  }
}

/** Закрыть показанный итог события и перейти к следующему. */
export function dismiss(state: GameState, era: EraDef): void {
  era = eraNow(state, era)
  const active = state.queue[0]
  if (!active?.outcome) throw new Error('Event not resolved yet')
  // Досмотренный сон подводит итог сам, если интерфейс не успел (например, страница закрылась на карточке).
  if (state.dream?.done) resolveDream(state, era)
  state.queue.shift()
  if (!state.hero.alive) return die(state, era)
  // Пропускаем события, которые стали неуместны после предыдущих решений.
  while (state.queue.length > 0) {
    const ev = currentEvent(state, era)
    const npcGone = state.queue[0].npcId && !state.hero.npcs.some((n) => n.id === state.queue[0].npcId && n.alive)
    if (ev && checkAll(state, ev.conditions) && !npcGone) break
    state.queue.shift()
  }
}

function recordYear(state: GameState, era: EraDef): void {
  const hero = state.hero
  hero.history.push({
    age: hero.age,
    year: state.year,
    happiness: Math.round(hero.hidden.happiness),
    stress: Math.round(hero.hidden.stress),
    health: Math.round(hero.attrs.health),
    money: hero.money,
    status: statusOf(hero, era),
    focus: state.lastFocus,
  })
}

function endYear(state: GameState, era: EraDef): void {
  const hero = state.hero
  // Защищённая первая жизнь: фоновой смертности нет, здоровье не падает ниже 10.
  if (isProtected(state)) hero.attrs.health = Math.max(10, hero.attrs.health)
  else if (chance(state, heroMortality(state, era))) {
    hero.alive = false
    hero.deathYear = state.year
    hero.deathCause = pickCause(state, era)
    return die(state, era)
  }
  recordYear(state, era)
  bandYear(state, era)
  goalYear(state, era)
  bodyYear(state, era)
  hero.tags = hero.tags.filter((t) => t !== 'epidemic')
  state.year = addYears(state.year, 1)
  hero.age += 1
  if (hero.age === era.stages.youth) note(state, { key: 'diary.stage_youth', topic: 'life' })
  if (hero.age === era.stages.adult) note(state, { key: 'diary.stage_adult', topic: 'life' })
  if (hero.age === era.stages.old) note(state, { key: 'diary.stage_old', topic: 'life' })
  state.phase = 'year'
}

/**
 * Полоса положения в обществе (низы, середина, верхи, элита) в конце года. Подъём и падение взрослого героя -
 * запись в дневнике и настроение: подняться приятно, упасть - больно (сильнее, чем радость подъёма).
 */
function bandYear(state: GameState, era: EraDef): void {
  const hero = state.hero
  const prev = hero.band
  const band = bandOf(statusOf(hero, era), prev)
  hero.band = band
  if (prev === undefined || band === prev || hero.age < era.stages.youth) return
  const up = band > prev
  changeParam(hero, 'happiness', up ? 6 : -10)
  changeParam(hero, 'self_esteem', up ? 5 : -8)
  if (!up) changeParam(hero, 'stress', 6)
  note(state, { key: up ? 'diary.band_up' : 'diary.band_down', params: { band: { key: `band.${band}` } }, major: true, topic: 'life', icon: up ? 'find' : 'loss', score: up ? 35 : 30, mood: up ? 6 : -10 })
}

/** Сытость по сословию, пока герой сам не выбирает еду (дети, рабы). */
const CLASS_BODY: Record<string, number> = { slave: -1.5, peasant: -0.5, craftsman: 0, trader: 0.5, landowner: 0.5, noble: 1 }
const FOOD_BODY: Record<string, number> = { meager: -2.5, plain: 0, varied: 1, feasts: 2.5 }

/**
 * Телосложение за год: шаг к тому, что дают еда, достаток и здоровье. Скудная еда, долги, болезнь
 * и неурожай худят, пиры полнят. Случайности нет - на ход жизни не влияет, только на портрет.
 */
function bodyYear(state: GameState, era: EraDef): void {
  const hero = state.hero
  const food = lifestyleDefs(state, era).find((d) => d.id === 'food')
  let target = food ? (FOOD_BODY[lifestyleOption(state, food).id] ?? 0) : (CLASS_BODY[hero.cls] ?? 0)
  if (hero.tags.includes('enslaved')) target = Math.min(target, -1.5)
  if (hero.money < 0) target -= 1
  if (hero.tags.includes('drought_years')) target -= 1
  if (hero.tags.includes('ill')) target -= 1.5
  if (hero.attrs.health < 35) target -= 1
  if (hero.age >= 70) target -= 0.5
  target = Math.max(-3, Math.min(3, target))
  const now = hero.body ?? 0
  const step = hero.tags.includes('ill') ? 1.5 : 1
  hero.body = Math.round(Math.max(-3, Math.min(3, now + Math.max(-step, Math.min(step, target - now)))) * 2) / 2
}

function pickCause(state: GameState, era: EraDef): string {
  const age = state.hero.age
  if (state.hero.tags.includes('epidemic') && chance(state, 0.6)) return 'epidemic'
  const causes = era.mortality.causes.filter((c) => age >= c.ages[0] && age <= c.ages[1] && checkAll(state, c.conditions))
  return weighted(state, causes, (c) => c.weight)?.id ?? 'illness'
}

function die(state: GameState, era: EraDef): void {
  era = eraNow(state, era)
  const hero = state.hero
  hero.alive = false
  hero.deathYear ??= state.year
  hero.deathCause ??= pickCause(state, era)
  recordYear(state, era)
  goalYear(state, era)
  note(state, { key: 'diary.died', params: { cause: { key: `cause.${hero.deathCause}` } }, major: true, topic: 'health', icon: 'death', score: 100 })
  // Хроника страны кончается: род ждёт продолжения в следующей эпохе (или «вне хроники» по желанию игрока).
  if (eraEnding(state)) note(state, { key: 'diary.era_end', params: { n: hero.generation, era: { key: `era.${hero.era}` } }, major: true, topic: 'history', icon: 'find', score: 60 })
  state.queue = []
  state.phase = 'dead'
  state.family.lives.push(summarize(state, era))
}

/** Автоматически прожить жизнь до конца (для тестов и симуляционных прогонов).
 *  pick - свой выбор варианта (калибровка целей): номер в options или null - как обычно, случайно. */
/** Один шаг бота: начать год, решить событие или закончить год. Вернёт страну, в которой герой теперь живёт. */
export function autoStep(
  state: GameState,
  era: EraDef,
  pick?: (options: ChoiceDef[], state: GameState) => number | null,
  pickFocus?: (focuses: FocusDef[], state: GameState) => string | null,
): EraDef {
  // Переехал в другую страну - дальше её события (страна уже загружена: переезд открыт только в загруженные).
  if (state.hero.era !== era.id && isEraLoaded(state.hero.era)) era = eraById(state.hero.era)
  if (state.phase === 'year') {
    const focuses = availableFocuses(state, era)
    // Свой выбор фокуса не трогает поток случайности - иначе жизнь с ним и без него разойдётся с первого года.
    const r = focuses.length ? next(state) : 0
    const f = focuses.length ? (pickFocus?.(focuses, state) ?? focuses[Math.floor(r * focuses.length)].id) : null
    ensureGoal(state, eraNow(state, era))
    startYear(state, era, f)
  } else if (state.queue.length > 0) {
    const ev = currentEvent(state, era)!
    const options = eventChoices(state, era, ev).filter((c) => choiceAvailable(state, c, ev))
    // Сон выбирается и решается своим потоком случайности - с ним и без него остальная жизнь одинакова.
    const own = pick && ev.id !== 'dream_intro' && options.length ? pick(options, state) : null
    const r = own !== null ? 0 : ev.id === 'dream_intro' ? dreamRng(state, 'auto_choice')() : next(state)
    choose(state, era, options.length ? options[own ?? Math.floor(r * options.length)].id : null)
    if (state.dream) {
      autoDream(state)
      resolveDream(state, eraNow(state, era))
    }
    dismiss(state, era)
  } else finishYear(state, era)
  return era
}

export function autoplay(
  state: GameState,
  era: EraDef,
  maxYears = 130,
  pick?: (options: ChoiceDef[], state: GameState) => number | null,
  pickFocus?: (focuses: FocusDef[], state: GameState) => string | null,
): GameState {
  for (let i = 0; i < maxYears * 6 && state.phase !== 'dead'; i++) era = autoStep(state, era, pick, pickFocus)
  return state
}

/**
 * Пропустить детство (кнопка в шапке экрана жизни): годы до age проходят сами, события решает судьба, как у бота.
 * Останавливается в начале года (phase 'year'), когда герою age, - дальше игрок решает сам. Вернёт возраст, с которого пропустили.
 */
export function skipChildhood(state: GameState, era: EraDef, age = 13): number {
  const from = state.hero.age
  for (let i = 0; i < 2000 && (state.phase as string) !== 'dead' && (state.hero.age < age || state.phase !== 'year'); i++) era = autoStep(state, era)
  return from
}
