import { chance, int, next, weighted } from './rng'
import { addYears, aliveNpcs, applyEffects, changeParam, changeSkill, check, checkAll, getParam, killNpc, npcAge } from './rules'
import { summarize } from './life'
import type { ChoiceDef, EraDef, EventDef, FocusDef, GameState, Npc } from './types'

/** Через сколько лет одно и то же событие может повториться. */
const COOLDOWN = 8

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

/** Прожить год с выбранным фокусом. После этого либо есть события в очереди, либо год уже закончился. */
export function liveYear(state: GameState, era: EraDef, focusId: string | null): void {
  if (state.phase !== 'year') throw new Error(`liveYear in phase ${state.phase}`)
  const focus = availableFocuses(state, era).find((f) => f.id === focusId) ?? null
  state.lastFocus = focus?.id ?? null
  if (focus) applyEffects(state, era, focus.effects)
  background(state, era, focus)
  if (!state.hero.alive) return die(state, era)
  rollEvents(state, era)
  if (state.queue.length > 0) state.phase = 'event'
  else endYear(state, era)
}

function background(state: GameState, era: EraDef, focus: FocusDef | null): void {
  const hero = state.hero
  const age = hero.age

  // Работа и расходы взрослого.
  if (age >= era.stages.youth) {
    const prof = era.professions.find((p) => p.id === hero.profession)
    const cls = era.classes.find((c) => c.id === hero.cls)
    let income = 0
    if (prof) {
      income = int(state, prof.income[0], prof.income[1]) * (0.75 + (hero.skills[prof.skill] ?? 0) / 100)
      income *= focus?.incomeMultiplier ?? 1
      if (age >= era.stages.old) income *= 0.5
      if (focus?.id === 'work') changeSkill(hero, prof.skill, 3)
      changeParam(hero, 'stress', prof.stress ?? 0)
      changeParam(hero, 'reputation', prof.reputation ?? 0)
    }
    // Расходы зависят от сословия, но живут по средствам: солдат из знатной семьи тратит как солдат.
    // До взрослого возраста половину расходов несёт семья.
    let upkeep = cls?.upkeep ?? 0
    if (prof) upkeep = Math.min(upkeep, Math.max(100, ((prof.income[0] + prof.income[1]) / 2) * 0.85))
    if (age < era.stages.adult) upkeep *= 0.5
    // Земля и капитал приносят доход состоятельным семьям.
    const rent = hero.tags.includes('wealthy') && hero.money > 0 ? hero.money * 0.025 : 0
    hero.money = Math.round(hero.money + income + rent - upkeep)
    if (hero.money < 0) {
      changeParam(hero, 'stress', 5)
      changeParam(hero, 'health', -1)
      if (!hero.tags.includes('in_debt')) hero.tags.push('in_debt')
    } else hero.tags = hero.tags.filter((t) => t !== 'in_debt')
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

  // Рождение детей.
  const spouse = aliveNpcs(hero, 'spouse')[0]
  if (hero.tags.includes('married') && spouse) {
    const motherAge = hero.sex === 'f' ? age : npcAge(spouse, state.year)
    if (motherAge >= 15 && motherAge <= 44) {
      const p = 0.28 + (focus?.id === 'family' ? 0.12 : 0) - (motherAge > 38 ? 0.12 : 0)
      if (chance(state, p)) {
        applyEffects(state, era, [{ add_npc: 'child', attitude: 50 }])
        const risk = era.mortality.childbirth * (state.settings.mortality === 'soft' ? 0.5 : 1)
        if (chance(state, risk)) {
          if (hero.sex === 'f') applyEffects(state, era, [{ kill: 'childbirth' }])
          else killNpc(state, spouse)
        }
      }
    }
  }

  // Родные и близкие тоже стареют.
  for (const npc of hero.npcs) {
    if (!npc.alive) continue
    const q = npcMortality(state, era, npc)
    if (chance(state, q)) killNpc(state, npc)
  }
}

function qx(era: EraDef, age: number): number {
  let q = era.mortality.qx[0][1]
  for (const [from, value] of era.mortality.qx) if (age >= from) q = value
  return q
}

function npcMortality(state: GameState, era: EraDef, npc: Npc): number {
  const age = npcAge(npc, state.year)
  let q = qx(era, age)
  if (state.settings.mortality === 'soft' && age < 15) q *= 0.5
  return q
}

/** Вероятность смерти героя в этом году. */
export function heroMortality(state: GameState, era: EraDef): number {
  const hero = state.hero
  let q = qx(era, hero.age)
  const cls = era.classes.find((c) => c.id === hero.cls)
  q *= cls?.mortality ?? 1
  const prof = era.professions.find((p) => p.id === hero.profession)
  if (prof && hero.age >= era.stages.youth) q *= prof.mortality ?? 1
  const h = hero.attrs.health
  q *= h >= 80 ? 0.6 : h >= 60 ? 0.85 : h >= 40 ? 1 : h >= 20 ? 1.6 : 3
  if (hero.money > 1000) q *= 0.85
  if (hero.tags.includes('in_debt')) q *= 1.15
  if (hero.tags.includes('epidemic')) q *= 2
  if (state.settings.mortality === 'soft' && hero.age < 15) q *= 0.25
  if (h <= 0) q = 1
  return Math.min(1, q)
}

// ---------- События ----------

function eventWeight(state: GameState, ev: EventDef): number {
  let w = ev.base_weight
  for (const m of ev.weight_modifiers ?? []) if (check(state, m.if)) w *= m.multiply
  return w
}

/** Подходит ли событие герою прямо сейчас (без учёта случайности). */
export function eligible(state: GameState, era: EraDef, ev: EventDef, ignoreTiming = false): boolean {
  const hero = state.hero
  if (ev.sensitive && state.settings.softenHeavy) return false
  if (ev.regions && !ev.regions.includes(hero.region)) return false
  if (ev.classes && !ev.classes.includes(hero.cls)) return false
  if (ev.sex && ev.sex !== hero.sex) return false
  if (!ignoreTiming) {
    if (ev.years && (state.year < ev.years[0] || state.year > ev.years[1])) return false
    if (ev.age_range && (hero.age < ev.age_range[0] || hero.age > ev.age_range[1])) return false
  }
  const last = hero.seen[ev.id]
  if (last !== undefined && (ev.once || ev.milestone || ev.global_chance !== undefined)) return false
  if (last !== undefined && !ignoreTiming && state.year - last < COOLDOWN) return false
  if (ev.dynamic === 'profession' && professionChoices(state, era).length === 0) return false
  return checkAll(state, ev.conditions)
}

function rollEvents(state: GameState, era: EraDef): void {
  const hero = state.hero
  const picked: EventDef[] = []
  const add = (ev: EventDef | undefined) => {
    if (ev && !picked.includes(ev)) picked.push(ev)
  }
  const byId = (id: string) => era.events.find((e) => e.id === id)

  // 1. Отложенные последствия прошлых решений.
  const due = hero.triggers.filter((t) => t.year <= state.year)
  hero.triggers = hero.triggers.filter((t) => t.year > state.year)
  for (const t of due) {
    const ev = byId(t.eventId)
    if (ev && chance(state, t.chance) && eligible(state, era, ev, true)) add(ev)
  }

  // 2. Исторические события в этом регионе и году.
  for (const ev of era.events) {
    if (ev.global_chance !== undefined && eligible(state, era, ev) && chance(state, ev.global_chance)) add(ev)
  }

  // 3. Возрастная развилка (не больше одной в год).
  const milestone = era.events.find((ev) => ev.milestone && eligible(state, era, ev))
  add(milestone)

  // 4. Обычные события по весам.
  const dist = hero.age < 5 ? [0.6, 0.4, 0, 0] : state.settings.mode === 'quick' ? [0.35, 0.45, 0.15, 0.05] : [0.15, 0.4, 0.3, 0.15]
  let r = next(state)
  let count = 0
  while (count < dist.length - 1 && r >= dist[count]) r -= dist[count++]
  count = Math.max(0, count - (picked.length > 1 ? 1 : 0))
  const pool = era.events.filter((ev) => !ev.trigger_only && !ev.milestone && ev.global_chance === undefined && eligible(state, era, ev))
  for (let i = 0; i < count; i++) {
    const ev = weighted(state, pool.filter((p) => !picked.includes(p)), (e) => eventWeight(state, e))
    add(ev)
  }

  state.queue = picked.map((ev) => ({ eventId: ev.id, outcome: null }))
  for (const ev of picked) hero.seen[ev.id] = state.year
}

export function currentEvent(state: GameState, era: EraDef): EventDef | null {
  const active = state.queue[0]
  return active ? era.events.find((e) => e.id === active.eventId) ?? null : null
}

export function professionChoices(state: GameState, era: EraDef): ChoiceDef[] {
  const hero = state.hero
  return era.professions
    .filter(
      (p) =>
        (!p.classes || p.classes.includes(hero.cls)) &&
        (!p.sex || p.sex === hero.sex) &&
        (!p.regions || p.regions.includes(hero.region)) &&
        hero.age >= p.minAge &&
        checkAll(state, p.requirements),
    )
    .map((p) => ({
      id: p.id,
      effects: [{ set_profession: p.id }, { skill: p.skill, delta: 8 }],
    }))
}

/** Варианты выбора текущего события. Пустой список — информационное событие с кнопкой «Далее». */
export function eventChoices(state: GameState, era: EraDef, ev: EventDef): ChoiceDef[] {
  if (ev.dynamic === 'profession') return professionChoices(state, era)
  return ev.choices ?? []
}

export function choiceAvailable(state: GameState, choice: ChoiceDef): boolean {
  return checkAll(state, choice.requirements)
}

/** Шанс успеха рискованного выбора с учётом параметра и склонности к риску. */
export function riskChance(state: GameState, choice: ChoiceDef): number | null {
  const roll = choice.risk_roll
  if (!roll) return null
  const value = roll.param ? getParam(state.hero, roll.param) : 50
  return Math.max(0.05, Math.min(0.95, roll.success_chance_base + (value - 50) / 200))
}

/** Сделать выбор в текущем событии. id = null для информационного события. */
export function choose(state: GameState, era: EraDef, choiceId: string | null): void {
  const active = state.queue[0]
  const ev = currentEvent(state, era)
  if (!active || !ev || active.outcome) throw new Error('No event to choose in')
  const choices = eventChoices(state, era, ev)
  const choice = choices.find((c) => c.id === choiceId)
  if (choices.length > 0 && (!choice || !choiceAvailable(state, choice))) throw new Error(`Bad choice ${choiceId}`)

  let result: 'ok' | 'success' | 'failure' = 'ok'
  applyEffects(state, era, ev.effects)
  if (choice) {
    applyEffects(state, era, choice.effects)
    if (choice.risk_roll) {
      const success = chance(state, riskChance(state, choice)!)
      result = success ? 'success' : 'failure'
      applyEffects(state, era, success ? choice.risk_roll.on_success : choice.risk_roll.on_failure)
    }
    for (const d of choice.delayed_effects ?? []) {
      state.hero.triggers.push({ eventId: d.trigger_event, year: addYears(state.year, int(state, d.after_years[0], d.after_years[1])), chance: d.chance })
    }
  }
  active.outcome = { choiceId: choice?.id ?? 'ok', result }
  state.hero.diary.push({
    year: state.year,
    age: state.hero.age,
    key: `ev.${ev.id}.title`,
    params: { choice: { key: choice ? (ev.dynamic === 'profession' ? `prof.${choice.id}` : `ev.${ev.id}.${choice.id}`) : 'ui.ok' }, result },
    major: ev.milestone || ev.type === 'global_historical' || result !== 'ok',
  })
}

/** Закрыть показанный итог события и перейти к следующему. */
export function dismiss(state: GameState, era: EraDef): void {
  const active = state.queue[0]
  if (!active?.outcome) throw new Error('Event not resolved yet')
  state.queue.shift()
  if (!state.hero.alive) return die(state, era)
  // Пропускаем события, которые стали неуместны после предыдущих решений.
  while (state.queue.length > 0) {
    const ev = currentEvent(state, era)
    if (ev && checkAll(state, ev.conditions)) break
    state.queue.shift()
  }
  if (state.queue.length === 0) endYear(state, era)
}

function endYear(state: GameState, era: EraDef): void {
  const hero = state.hero
  if (chance(state, heroMortality(state, era))) {
    hero.alive = false
    hero.deathYear = state.year
    hero.deathCause = pickCause(state, era)
    return die(state, era)
  }
  hero.tags = hero.tags.filter((t) => t !== 'epidemic')
  state.year = addYears(state.year, 1)
  hero.age += 1
  if (hero.age === era.stages.youth) hero.diary.push({ year: state.year, age: hero.age, key: 'diary.stage_youth' })
  if (hero.age === era.stages.adult) hero.diary.push({ year: state.year, age: hero.age, key: 'diary.stage_adult' })
  if (hero.age === era.stages.old) hero.diary.push({ year: state.year, age: hero.age, key: 'diary.stage_old' })
  state.phase = 'year'
}

function pickCause(state: GameState, era: EraDef): string {
  const age = state.hero.age
  if (state.hero.tags.includes('epidemic') && chance(state, 0.6)) return 'epidemic'
  const causes = era.mortality.causes.filter((c) => age >= c.ages[0] && age <= c.ages[1] && checkAll(state, c.conditions))
  return weighted(state, causes, (c) => c.weight)?.id ?? 'illness'
}

function die(state: GameState, era: EraDef): void {
  const hero = state.hero
  hero.alive = false
  hero.deathYear ??= state.year
  hero.deathCause ??= pickCause(state, era)
  hero.diary.push({ year: state.year, age: hero.age, key: `diary.died`, params: { cause: { key: `cause.${hero.deathCause}` } }, major: true })
  state.queue = []
  state.phase = 'dead'
  state.family.lives.push(summarize(state))
}

/** Автоматически прожить жизнь до конца (для тестов и симуляционных прогонов). */
export function autoplay(state: GameState, era: EraDef, maxYears = 130): GameState {
  for (let i = 0; i < maxYears * 4 && state.phase !== 'dead'; i++) {
    if (state.phase === 'year') {
      const focuses = availableFocuses(state, era)
      const f = focuses.length ? focuses[Math.floor(next(state) * focuses.length)].id : null
      liveYear(state, era, f)
    } else if (state.phase === 'event') {
      const ev = currentEvent(state, era)!
      const options = eventChoices(state, era, ev).filter((c) => choiceAvailable(state, c))
      choose(state, era, options.length ? options[Math.floor(next(state) * options.length)].id : null)
      dismiss(state, era)
    }
  }
  return state
}

