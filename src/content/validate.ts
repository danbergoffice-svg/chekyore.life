// Проверка контента страны: тексты на обоих языках, ссылки, сцены, вера, регионы.
// Используется в тестах (tests/content.test.ts) и в инструменте npm run check -- <ID> для авторов контента.
import { allKeys, createT, hasKey, LANGS } from '../i18n'
import { isPet } from '../engine/pets'
import { checkInput, DREAM_DEFS, expectedAnswer } from '../engine/dreams'
import { evaluate } from '../engine/formula'
import { PRIMER_TOPICS, SCENE_PLACES, SCENE_PROPS, SCENE_TIMES, TOPICS } from '../engine/types'
import type { Condition, Effect, EraDef, EventDef } from '../engine/types'
import { ERA_META, RELIGION_BY_ID, RELIGIONS } from '.'

export const STYLES = ['roman', 'greek', 'egyptian', 'chinese', 'japanese', 'indian', 'islamic', 'gothic', 'byzantine', 'russian', 'mesopotamian', 'maya', 'aztec', 'andean', 'sahel', 'ethiopian']
export const FEATURES = ['sea', 'horses', 'coins', 'wine', 'writing', 'iron', 'baths', 'olive', 'camels', 'slavery', 'paper', 'printing', 'gunpowder', 'tea', 'rice', 'llamas', 'elephants', 'monsoon', 'snow', 'river']
const religionWords = new Set(RELIGIONS.flatMap((r) => [r.id, r.group, ...(r.tags ?? [])]))

/** Слова про родных в русском тексте: событие должно быть о таком человеке (npc), проверять has_npc или пометить others. */
const ROLE: Record<string, RegExp> = {
  father: /(^|[^а-яё])(отец|отца|отцу|отцом|отце|папа|папы|папе)([^а-яё]|$)/,
  mother: /(^|[^а-яё])(мать|матери|матерью|мама|мамы|маме|маму|мамой)([^а-яё]|$)/,
  spouse: /(^|[^а-яё])(твой муж|твоя жена|мужа|жену|жены|супруг[а-яё]*)([^а-яё]|$)/,
  sibling: /(^|[^а-яё])(брат|брата|брату|сестра|сестры|сестру|сестре)([^а-яё]|$)/,
  child: /(^|[^а-яё])(твой сын|твоя дочь|твоего сына|твою дочь|твоему сыну|сына|дочери|дочь)([^а-яё]|$)/,
  grandchild: /(^|[^а-яё])(внук[а-яё]*|внучк[а-яё]*)([^а-яё]|$)/,
}

let keysByEvent: Map<string, string[]> | null = null
function eventKeys(id: string): string[] {
  if (!keysByEvent) {
    keysByEvent = new Map()
    for (const k of allKeys('ru')) {
      if (!k.startsWith('ev.') || k.endsWith('.note')) continue
      const ev = k.split('.')[1]
      keysByEvent.set(ev, [...(keysByEvent.get(ev) ?? []), k])
    }
  }
  return keysByEvent.get(id) ?? []
}

/** Сбросить кэш ключей (после загрузки новых текстов). */
export function resetValidateCache(): void {
  keysByEvent = null
}

function requiredKeys(era: EraDef): string[] {
  const required: string[] = [`era.${era.id}`, `era.${era.id}.years`, `era.${era.id}.short`]
  for (const r of era.regions) {
    required.push(`region.${r.id}`, `region.${r.id}.intro`, `region.${r.id}.in`, `coin.${r.coin}`)
    for (const w of [r.religions, ...(r.religionEras ?? []).map((x) => x.religions), ...Object.values(r.classReligions ?? {})]) {
      for (const id of Object.keys(w)) required.push(`religion.${id}`, `religion.${id}.desc`)
    }
  }
  for (const c of era.classes) required.push(`class.${c.id}`, `class.${c.id}.short`, `class.${c.id}.family`)
  for (const p of era.professions) required.push(`prof.${p.id}`, `prof.${p.id}.desc`, `prof.${p.id}.as`)
  for (const f of era.focuses) required.push(`focus.${f.id}`, `focus.${f.id}.desc`)
  for (const tr of era.traits) required.push(`trait.${tr}`)
  for (const s of era.skills) required.push(`skill.${s}`)
  for (const c of era.mortality.causes) required.push(`cause.${c.id}`)
  required.push('cause.childbirth', 'cause.epidemic')
  for (const l of era.lifestyle) {
    required.push(`lifestyle.${l.id}`)
    for (const o of l.options) required.push(`lifestyle.${l.id}.${o.id}`, `lifestyle.${l.id}.${o.id}.desc`)
  }
  for (const n of era.news) required.push(`news.${n.id}`)
  for (const p of era.primers ?? []) required.push(`primer.${p.id}.title`, `primer.${p.id}.text`)
  for (const ev of era.events) {
    if (!ev.moment) required.push(`ev.${ev.id}.title`)
    if (ev.variants) for (let i = 1; i <= ev.variants; i++) required.push(`ev.${ev.id}.text.${i}`)
    else required.push(`ev.${ev.id}.text`)
    if (ev.historian_note) required.push(`ev.${ev.id}.note`)
    for (const c of ev.choices ?? []) {
      required.push(`ev.${ev.id}.${c.id}`)
      if (c.risk_roll) required.push(`ev.${ev.id}.${c.id}.success`, `ev.${ev.id}.${c.id}.failure`)
    }
    for (const m of JSON.stringify(ev).match(/"move":"(\w+)"/g) ?? []) required.push(`place.${m.split('"')[3]}`)
  }
  return required
}

function checkScenes(ev: EventDef, bad: string[]) {
  if (!ev.scene) bad.push(`${ev.id}: нет scene`)
  if (ev.scene?.place && !(SCENE_PLACES as readonly string[]).includes(ev.scene.place)) bad.push(`${ev.id}: place ${ev.scene.place}`)
  if (ev.scene?.time && !(SCENE_TIMES as readonly string[]).includes(ev.scene.time)) bad.push(`${ev.id}: time ${ev.scene.time}`)
  for (const p of ev.scene?.props ?? []) if (!(SCENE_PROPS as readonly string[]).includes(p)) bad.push(`${ev.id}: prop ${p}`)
  if (ev.scene?.disaster && !['fire', 'ruin', 'flood'].includes(ev.scene.disaster)) bad.push(`${ev.id}: disaster ${ev.scene.disaster}`)
  if (ev.topic && !(TOPICS as readonly string[]).includes(ev.topic)) bad.push(`${ev.id}: topic ${ev.topic}`)
  if (ev.moment && ev.choices?.length) bad.push(`${ev.id}: у момента не должно быть выборов`)
  if (ev.choices && (ev.choices.length === 1 || ev.choices.length > 4)) bad.push(`${ev.id}: выборов должно быть 2–4`)
  if (ev.choices && ev.choices.length > 0 && ev.choices.every((c) => (c.requirements ?? []).length > 0)) bad.push(`${ev.id}: нет выбора без условий`)
}

function checkRefs(era: EraDef, ev: EventDef, bad: string[]) {
  const profIds = new Set(era.professions.map((p) => p.id))
  const eventIds = new Set(era.events.map((e) => e.id))
  const classIds = new Set(era.classes.map((c) => c.id))
  const walkCond = (c: Condition) => {
    if ('profession' in c) for (const p of c.profession) if (!profIds.has(p) && !ERA_PROFESSION_OK.has(p)) bad.push(`${ev.id}: profession ${p}`)
    if ('classes' in c) for (const x of c.classes) if (!classIds.has(x)) bad.push(`${ev.id}: class ${x}`)
    if ('religion' in c || 'religion_absent' in c) for (const r of 'religion' in c ? c.religion : c.religion_absent) if (!religionWords.has(r)) bad.push(`${ev.id}: religion ${r}`)
    if ('region' in c) for (const r of c.region) if (!era.regions.some((x) => x.id === r)) bad.push(`${ev.id}: region ${r}`)
    if ('any' in c) c.any.forEach(walkCond)
  }
  const walkEff = (e: Effect) => {
    if ('set_profession' in e && e.set_profession && !profIds.has(e.set_profession)) bad.push(`${ev.id}: set_profession ${e.set_profession}`)
    if ('set_class' in e && !classIds.has(e.set_class)) bad.push(`${ev.id}: set_class ${e.set_class}`)
    if ('set_religion' in e && !['other', 'majority'].includes(e.set_religion) && !RELIGION_BY_ID.has(e.set_religion)) bad.push(`${ev.id}: set_religion ${e.set_religion}`)
    if ('migrate' in e && !e.migrate.startsWith('@') && !era.regions.some((x) => x.id === e.migrate)) bad.push(`${ev.id}: migrate ${e.migrate}`)
    if ('chance' in e) e.effects.forEach(walkEff)
  }
  ev.conditions?.forEach(walkCond)
  ev.effects?.forEach(walkEff)
  for (const m of ev.weight_modifiers ?? []) walkCond(m.if)
  for (const c of ev.choices ?? []) {
    c.requirements?.forEach(walkCond)
    c.effects?.forEach(walkEff)
    c.risk_roll?.on_success?.forEach(walkEff)
    c.risk_roll?.on_failure.forEach(walkEff)
    for (const d of c.delayed_effects ?? []) if (!eventIds.has(d.trigger_event)) bad.push(`${ev.id}: trigger ${d.trigger_event}`)
  }
  for (const f of ev.needs ?? []) if (!FEATURES.includes(f)) bad.push(`${ev.id}: needs ${f}`)
  for (const r of ev.religions ?? []) if (!religionWords.has(r)) bad.push(`${ev.id}: religions ${r}`)
  for (const r of ev.regions ?? []) if (!era.regions.some((x) => x.id === r)) bad.push(`${ev.id}: регион ${r}`)
  for (const c of ev.classes ?? []) if (!classIds.has(c)) bad.push(`${ev.id}: classes ${c}`)
  if (ev.years && (ev.years[0] > ev.years[1] || ev.years[1] < era.years[0] - 1 || ev.years[0] > era.years[1] + 120)) bad.push(`${ev.id}: years ${ev.years}`)
}

/** Профессии других стран в условиях общего слоя: условие просто не выполнится. */
const ERA_PROFESSION_OK = new Set(Object.values(ERA_META).flatMap((m) => m.professions.map((p) => p.id)))

function checkRoles(ev: EventDef, bad: string[]) {
  const t = createT('ru')
  const text = eventKeys(ev.id)
    .map((k) => t(k, {}, { sex: 'm' }) + ' ' + t(k, {}, { sex: 'f' }))
    .join(' ')
    .toLowerCase()
  const conds = JSON.stringify(ev.conditions ?? [])
  for (const [role, re] of Object.entries(ROLE)) {
    if (!re.test(text)) continue
    if (ev.npc === role || conds.includes(`"has_npc":"${role}"`) || ev.others?.includes(role as never)) continue
    bad.push(`${ev.id}: упомянут ${role}, но событие его не проверяет (npc/has_npc/others)`)
  }
}

/** Родные, которые по тексту уезжают: у такого исхода должен быть эффект npc_away (или смерть, развод). */
const KIN_ROLES = ['father', 'mother', 'spouse', 'child', 'grandchild', 'sibling']
const LEAVES = /(отправ[а-яё]* (его|её|сына|дочь|искать)|уехал|уехала|уплыл|уплыла|уходит в монастырь|ушёл в монастырь|ушла в обитель|постриг|продал[аи]? (его|её))/
const AWAY_REASONS = ['abroad', 'monastery', 'service', 'sold', 'exile', 'married_far', 'left', 'divorced', 'homeland']

function checkAway(ev: EventDef, bad: string[]) {
  const s = JSON.stringify(ev)
  for (const m of s.matchAll(/"npc_away":"([a-z_]+)"/g)) if (!AWAY_REASONS.includes(m[1])) bad.push(`${ev.id}: npc_away ${m[1]}`)
  // Событие про того, кто и так вдали (весть, возвращение): «снова уехал» — не новый отъезд.
  if (!ev.npc || !KIN_ROLES.includes(ev.npc) || ev.npc_away) return
  const t = createT('ru')
  for (const c of ev.choices ?? []) {
    const text = eventKeys(ev.id)
      .filter((k) => k.startsWith(`ev.${ev.id}.${c.id}`))
      .map((k) => t(k, {}, { sex: 'm' }))
      .join(' ')
      .toLowerCase()
    if (!LEAVES.test(text)) continue
    if (/"(npc_away|kill_npc|remove_npc)"/.test(JSON.stringify(c))) continue
    bad.push(`${ev.id}.${c.id}: по тексту ${ev.npc} уезжает или уходит, но нет эффекта npc_away`)
  }
}

/** «Дом сгорел» в тексте — у события должен быть эффект {"home":"burn"}: иначе на картинке дом целый. */
const HOUSE_BURNED = /(дом|сруб|изба|жилище|имущество)[^.,]{0,16}сгорел|сгорел[аои]? дотла/

function checkHomeBurn(ev: EventDef, bad: string[]) {
  const t = createT('ru')
  const text = eventKeys(ev.id)
    .map((k) => t(k, {}, { sex: 'm' }))
    .join(' ')
    .toLowerCase()
  if (HOUSE_BURNED.test(text) && !JSON.stringify(ev).includes('"home":"burn"')) bad.push(`${ev.id}: в тексте дом сгорел, но нет эффекта {"home":"burn"}`)
}

/** Питомцы в событиях — только виды из src/content/pets.json. */
function checkPets(ev: EventDef, bad: string[]) {
  const s = JSON.stringify(ev)
  for (const m of s.matchAll(/"(?:add_pet|has_pet|pet_possible|remove_pet|pet)":"([a-z_@]+)"/g)) if (!m[1].startsWith('@') && !isPet(m[1])) bad.push(`${ev.id}: питомец ${m[1]}`)
}

function checkCountry(era: EraDef, bad: string[]) {
  if (!(era.population > 0)) bad.push('population')
  for (const f of era.features ?? []) if (!FEATURES.includes(f)) bad.push(`feature ${f}`)
  const classIds = era.classes.map((c) => c.id).sort().join(',')
  if (classIds !== 'craftsman,landowner,noble,peasant,slave,trader') bad.push(`сословия должны быть ровно slave, peasant, craftsman, trader, landowner, noble: ${classIds}`)
  if (era.professions.length < 8) bad.push('меньше 8 профессий')
  for (const r of era.regions) {
    if (!r.scene || !STYLES.includes(r.scene.style)) bad.push(`${r.id}: scene.style`)
    if (r.names.m.length < 25 || r.names.f.length < 25) bad.push(`${r.id}: мало имён (нужно ≥25 на пол)`)
    if (r.years[0] < era.years[0] - 1 || r.years[1] > era.years[1] + 1) bad.push(`${r.id}: годы региона вне страны`)
    if (!r.religions || Object.keys(r.religions).length === 0) bad.push(`${r.id}: нет religions`)
    for (const w of [r.religions ?? {}, ...(r.religionEras ?? []).map((x) => x.religions), ...Object.values(r.classReligions ?? {})]) {
      for (const id of Object.keys(w)) if (!RELIGION_BY_ID.has(id)) bad.push(`${r.id}: вера ${id}`)
    }
    for (const c of Object.keys(r.classWeights)) if (!era.classes.some((x) => x.id === c)) bad.push(`${r.id}: сословие ${c}`)
  }
  for (const p of era.professions) if (!era.skills.includes(p.skill)) bad.push(`prof ${p.id}: skill ${p.skill}`)
  const news = era.news.filter((n) => !Number.isInteger(n.year) || n.year === 0 || n.year < era.years[0] - 50 || n.year > era.years[1] + 120 || !['confirmed', 'reconstructed', 'disputed'].includes(n.confidence))
  for (const n of news) bad.push(`news ${n.id}: год или confidence`)
  const ids = era.news.map((n) => n.id)
  if (ids.length !== new Set(ids).size) bad.push('повторяются id вестей')
}

/** Справка «О твоём мире»: по каждой из 16 тем есть общая карточка (без условий), ссылки верны. */
function checkPrimers(era: EraDef, bad: string[]) {
  const primers = era.primers ?? []
  if (!primers.length) return void bad.push('нет справки «О твоём мире» (primer.json)')
  for (const topic of PRIMER_TOPICS) if (!primers.some((p) => p.topic === topic && !p.regions && !p.classes && !p.religions && !p.sex && !p.years)) bad.push(`справка: нет общей карточки на тему ${topic}`)
  const ids = new Set<string>()
  for (const p of primers) {
    if (ids.has(p.id)) bad.push(`справка ${p.id}: повтор id`)
    ids.add(p.id)
    if (!(PRIMER_TOPICS as readonly string[]).includes(p.topic)) bad.push(`справка ${p.id}: тема ${p.topic}`)
    for (const r of p.regions ?? []) if (!era.regions.some((x) => x.id === r)) bad.push(`справка ${p.id}: регион ${r}`)
    for (const c of p.classes ?? []) if (!era.classes.some((x) => x.id === c)) bad.push(`справка ${p.id}: сословие ${c}`)
    for (const r of p.religions ?? []) if (!religionWords.has(r)) bad.push(`справка ${p.id}: вера ${r}`)
  }
}

/** Все проблемы страны; пустой список — всё в порядке. */
export function validateEra(era: EraDef): string[] {
  const bad: string[] = []
  for (const lang of LANGS) for (const k of requiredKeys(era)) if (!hasKey(lang, k)) bad.push(`нет текста ${k} (${lang})`)
  checkCountry(era, bad)
  checkPrimers(era, bad)
  for (const ev of era.events) {
    checkScenes(ev, bad)
    checkRefs(era, ev, bad)
    checkRoles(ev, bad)
    checkAway(ev, bad)
    checkHomeBurn(ev, bad)
    checkPets(ev, bad)
  }
  return bad
}

/** Параметры для проверки, что после подстановки не остаётся {скобок}. */
export const SAMPLE_PARAMS = {
  n: 3, npc: 'x', pet: 'x', kid: 'x', total: 9, dream: 'x', result: 'x', homeland: 'x', homeplace: 'x', country: 'x', i: 1, h: 1, a: 1, place: 'x', region: 'x', cls: 'x', parent: 'x', child: 'x', who: 'x', cause: 'x', year: 'x', money: 1, name: 'x', adult: 1, list: 'x', prof: 'x',
  grand: 2, alive: 1, side: 'x', mood: 1, skill: 'x', years: 'x', archetype: 'x', diff: 1, cost: 'x', d: '+1', faith: 'x', other_faith: 'x', capital: 'x', from: 'x', era: 'x', top: 'x', home: 'x', animal: 'x', born: 'x', died: 'x', focus: 'x', via: 'x', role: 'x',
}

/** Ключи, в которых после подстановки остались фигурные скобки. */
export function leftoverBraces(keys?: string[]): string[] {
  const out: string[] = []
  for (const lang of LANGS) {
    for (const sex of ['m', 'f'] as const) {
      const t = createT(lang, { sex })
      // Числа снов о будущем ({wall}, {liters}…) — тоже параметры.
      const dreamParams = Object.fromEntries(DREAM_DEFS.flatMap((d) => [...Object.keys(d.params ?? {}), ...Object.keys(d.derived ?? {})]).map((k) => [k, 1]))
      const params = { ...SAMPLE_PARAMS, ...dreamParams, sex, psex: sex, vsex: sex, npc_sex: sex }
      for (const k of keys ?? allKeys(lang)) if (hasKey(lang, k) && /[{}]/.test(t(k, params))) out.push(`${lang}:${k}`)
    }
  }
  return [...new Set(out)]
}

/**
 * Сны о будущем: верный ответ среди вариантов и проходит проверку, ответ за допуском — нет, доли дают 100,
 * формулы считаются на краях параметров, страны существуют, все тексты есть на обоих языках.
 */
export function validateDreams(): string[] {
  const bad: string[] = []
  for (const d of DREAM_DEFS) {
    for (const e of d.eras ?? []) if (!ERA_META[e]) bad.push(`${d.id}: страна ${e}`)
    // Все сочетания краёв параметров.
    const keys = Object.keys(d.params ?? {})
    const corners: Record<string, number>[] = [{}]
    for (const k of keys) {
      const [lo, hi] = d.params![k]
      corners.splice(0, corners.length, ...corners.flatMap((c) => [{ ...c, [k]: lo }, { ...c, [k]: hi }]))
    }
    const steps = d.steps
    if (steps.length !== 3) bad.push(`${d.id}: шагов должно быть 3`)
    if (d.debate && steps[2].kind !== 'debate') bad.push(`${d.id}: громкий сон — шаг 3 должен быть спором`)
    for (const c of corners.slice(0, 64)) {
      const params: Record<string, number> = { ...c }
      for (const [k, f] of Object.entries(d.derived ?? {})) params[k] = evaluate(f, params)
      steps.forEach((s, si) =>
        s.items.forEach((input, ii) => {
          const where = `${d.id}.q${si + 1}.${ii + 1}`
          for (const era of [...(d.eras ?? []), 'XXX']) {
            const want = expectedAnswer(input, params, era)
            if (typeof want === 'number' && !Number.isFinite(want)) bad.push(`${where}: формула не считается при ${JSON.stringify(params)}`)
            if (!checkInput(input, want, params, era)) bad.push(`${where}: верный ответ не проходит (${era})`)
            if (input.kind === 'number' && checkInput(input, (want as number) * 1.5 + 3, params, era)) bad.push(`${where}: ответ вне допуска проходит`)
          }
        }),
      )
    }
    steps.forEach((s, si) =>
      s.items.forEach((input, ii) => {
        const where = `${d.id}.q${si + 1}.${ii + 1}`
        if (input.kind === 'pick' || input.kind === 'order') {
          for (const a of [...input.answer, ...Object.values((input.kind === 'pick' && input.answer_by_era) || {}).flat()]) if (!input.options.includes(a)) bad.push(`${where}: ответ ${a} не среди вариантов`)
          if (input.kind === 'pick' && input.options.length < 4) bad.push(`${where}: мало вариантов`)
          if (input.kind === 'order' && input.options.length <= input.answer.length) bad.push(`${where}: в порядке нет лишнего шага`)
        }
        if (input.kind === 'ratio' && Object.values(input.answer).reduce((a, b) => a + b, 0) !== 100) bad.push(`${where}: доли не дают 100`)
        for (const lang of LANGS) {
          if (!hasKey(lang, `dream.${d.id}.q${si + 1}.${ii + 1}`)) bad.push(`${lang}: нет условия ${where}`)
          if (input.kind === 'pick' || input.kind === 'order') for (const o of input.options) if (!hasKey(lang, `dream.${d.id}.opt.${o}`)) bad.push(`${lang}: нет варианта ${d.id}.opt.${o}`)
          if (input.kind === 'ratio') for (const o of Object.keys(input.answer)) if (!hasKey(lang, `dream.${d.id}.opt.${o}`)) bad.push(`${lang}: нет варианта ${d.id}.opt.${o}`)
        }
      }),
    )
    for (const lang of LANGS) {
      for (const k of ['title', 'intro', 'breakthrough', 'partial', 'failure', 'truth', 'hint1', 'hint2', 'hint3']) if (!hasKey(lang, `dream.${d.id}.${k}`)) bad.push(`${lang}: нет dream.${d.id}.${k}`)
      if (d.death_chance?.some((p) => p > 0) && !hasKey(lang, `dream.${d.id}.death`)) bad.push(`${lang}: нет dream.${d.id}.death`)
      if (d.known_in?.length && !hasKey(lang, `dream.${d.id}.known`)) bad.push(`${lang}: нет dream.${d.id}.known`)
      if (d.debate && !hasKey(lang, `dream.${d.id}.sage`)) bad.push(`${lang}: нет dream.${d.id}.sage`)
      if (d.profession && !hasKey(lang, `prof.${d.profession}`)) bad.push(`${lang}: нет prof.${d.profession}`)
    }
  }
  return bad
}
