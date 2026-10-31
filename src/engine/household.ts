// Хозяйство героя: дом и животные. Меняются вместе с жизнью - разбогател и купил дом побольше или корову,
// задолжал и продал; к дому прибился пёс. Всё это видно на картинке и записывается в дневник.
import { ERA_META } from '../content'
import { chance, int, pick } from './rng'
import { isPet, makePet, petDef, pets, randomPet } from './pets'
import { changeParam, HOME_TAGS, note } from './rules'
import type { EraDef, EraMeta, GameState } from './types'

/** Сколько стоит перебраться в дом этого размера. */
const HOME_COST = [0, 150, 500, 1500, 5000]
/** Дом при рождении по сословию. */
const HOME_BY_CLASS: Record<string, number> = { slave: 0, peasant: 1, craftsman: 2, trader: 2, landowner: 3, noble: 4 }

export const ANIMAL_COST: Record<string, number> = {
  chickens: 10, turkey: 15, goat: 30, sheep: 30, pig: 40, llama: 60, donkey: 80, cow: 120, ox: 150, camel: 250, horse: 300, dog: 0, cat: 0,
}

/** Какой скот держат в краю: по стилю края (он же культура) и признакам страны. */
function livestock(state: GameState): string[] {
  const meta = ERA_META[state.hero.era]
  const region = meta?.regions.find((r) => r.id === state.hero.region)
  const style = region?.scene?.style ?? ''
  if (style === 'maya' || style === 'aztec') return ['turkey']
  if (style === 'andean') return ['llama']
  const out = ['chickens', 'goat']
  if (style !== 'islamic' && style !== 'sahel') out.push('pig')
  out.push('sheep', 'cow', 'ox', 'donkey')
  if (meta?.features.includes('camels')) out.push('camel')
  if (meta?.features.includes('horses')) out.push('horse')
  return out
}


const rural = (state: GameState) => state.hero.tags.includes('rural') || ['peasant', 'landowner'].includes(state.hero.cls)

/** Начальное хозяйство семьи при рождении. */
export function initHousehold(state: GameState): void {
  const hero = state.hero
  hero.home = HOME_BY_CLASS[hero.cls] ?? 1
  hero.animals = []
  const stock = livestock(state)
  if (hero.cls === 'peasant') {
    hero.animals.push({ kind: stock[0], since: state.year })
    if (stock.length > 1 && chance(state, 0.5)) hero.animals.push({ kind: stock[1], since: state.year })
  }
  if (hero.cls === 'landowner') for (const k of stock.slice(-2)) hero.animals.push({ kind: k, since: state.year })
  if (hero.cls === 'noble' && stock.includes('horse')) hero.animals.push({ kind: 'horse', since: state.year })
  // Пёс или кошка, которые жили в семье ещё до рождения героя.
  if (chance(state, 0.18)) {
    const kind = randomPet(state, ['dog', 'cat'])
    if (kind) {
      const pet = makePet(state, kind)
      const [a, b] = petDef(kind)!.life
      pet.born = state.year - int(state, 1, 5)
      pet.dies = pet.born + int(state, a, b)
      hero.animals.push(pet)
    }
  }
}

/** Год хозяйства: покупки, продажи, питомцы. Вызывается после того, как посчитаны доходы и расходы. */
export function householdYear(state: GameState, era: EraDef | EraMeta): void {
  const hero = state.hero
  if (hero.home === undefined || !hero.animals) initHousehold(state)
  const adult = hero.age >= era.stages.adult
  const free = hero.cls !== 'slave'

  // Сгоревший дом: отстраиваются за год; если так и не взялись - через четыре года кое-как латают сами.
  const since = hero.homeSince ?? state.year
  if (hero.tags.includes('home_rebuilding') && state.year - since >= 1) {
    hero.tags = hero.tags.filter((t) => t !== 'home_rebuilding')
    changeParam(hero, 'happiness', 5)
    note(state, { key: 'diary.home_rebuilt', params: { home: { key: `home.${hero.home}` } }, major: true, topic: 'money', icon: 'move', score: 26, mood: 5 })
  } else if (hero.tags.includes('home_damaged') && state.year - since >= 4) {
    hero.tags = hero.tags.filter((t) => !HOME_TAGS.includes(t))
    note(state, { key: 'diary.home_patched', topic: 'money', score: 14 })
  }
  // Дом побольше - когда денег заметно больше, чем он стоит (не пока живут на пепелище).
  if (adult && free && hero.home < 4 && !hero.tags.includes('home_damaged')) {
    const cost = HOME_COST[hero.home + 1]
    if (hero.money > cost * 1.6 && chance(state, 0.25)) {
      hero.money -= cost
      hero.home += 1
      changeParam(hero, 'happiness', 6)
      note(state, { key: 'diary.home_up', params: { home: { key: `home.${hero.home}` } }, major: true, topic: 'money', icon: 'move', score: 30, mood: 6 })
    }
  }
  // В долгах приходится продавать: сначала скот, потом дом.
  if (adult && hero.money < 0) {
    const stock = hero.animals.filter((a) => !isPet(a.kind))
    if (stock.length && chance(state, 0.4)) {
      const sold = stock[stock.length - 1]
      hero.animals = hero.animals.filter((a) => a !== sold)
      hero.money += Math.round((ANIMAL_COST[sold.kind] ?? 30) * 0.7)
      note(state, { key: 'diary.animal_sold', params: { animal: { key: `animal.${sold.kind}` } }, topic: 'money', icon: 'loss', score: 14, mood: -3 })
    } else if (hero.home > 0 && hero.money < -200 && chance(state, 0.3)) {
      hero.home -= 1
      hero.money += Math.round(HOME_COST[hero.home + 1] * 0.6)
      changeParam(hero, 'happiness', -6)
      note(state, { key: 'diary.home_down', params: { home: { key: `home.${hero.home}` } }, major: true, topic: 'money', icon: 'loss', score: 28, mood: -6 })
    }
  }
  // Скот в деревенском хозяйстве.
  if (adult && free && rural(state) && hero.money > 0) {
    const stock = livestock(state).filter((k) => (ANIMAL_COST[k] ?? 0) * 2.5 < hero.money)
    const herd = hero.animals.filter((a) => !isPet(a.kind)).length
    if (stock.length && herd < 4 && chance(state, 0.18)) {
      // Сначала то, чего ещё нет, и подороже: курица → коза → корова → лошадь.
      const owned = new Set(hero.animals.map((a) => a.kind))
      const fresh = stock.filter((k) => !owned.has(k))
      const kind = fresh.length ? fresh[fresh.length - 1] : pick(state, stock)
      hero.money -= ANIMAL_COST[kind] ?? 30
      hero.animals.push({ kind, since: state.year })
      note(state, { key: 'diary.animal_bought', params: { animal: { key: `animal.${kind}` } }, topic: 'money', score: 14, mood: 3 })
      changeParam(hero, 'happiness', 2)
    }
  }
  petsYear(state)
}

/**
 * Питомцы стареют: каждый доживает свой срок (собака 12–15, кошка 12–18, попугай и черепаха - дольше человека),
 * если раньше не случится беда (болезнь, волки, повозка; в нужде - чаще). Появляются они событиями (events_pets).
 */
function petsYear(state: GameState): void {
  const hero = state.hero
  const poor = hero.money < 0 || hero.tags.includes('home_damaged')
  for (const pet of pets(state)) {
    // Старые сохранения: питомцу без срока назначаем его сейчас.
    if (pet.dies === undefined) Object.assign(pet, makePet(state, pet.kind), { since: pet.since, name: pet.name })
    const d = petDef(pet.kind)!
    // Ранняя беда: у собак и кошек чаще, у черепах и попугаев - редко.
    const early = d.life[1] >= 30 ? 0.004 : d.life[1] >= 10 ? 0.012 + (poor ? 0.03 : 0) : 0
    if (state.year < pet.dies! && !chance(state, early)) continue
    hero.animals = hero.animals.filter((a) => a !== pet)
    const years = Math.max(1, state.year - (pet.born ?? pet.since))
    const kid = pet.owner ? hero.npcs.find((n) => n.id === pet.owner && n.alive) : undefined
    note(state, {
      key: pet.name ? 'diary.pet_died_named' : 'diary.pet_gone',
      params: { animal: { key: `pet.${pet.kind}` }, name: { name: pet.name ?? '' }, n: years, kid: { name: kid?.name ?? '' } },
      topic: 'life',
      score: 16,
      mood: -5,
    })
    changeParam(hero, 'happiness', d.life[1] >= 10 ? -5 : -2)
    if (kid) note(state, { key: 'diary.pet_died_kid', params: { kid: { name: kid.name }, sex: kid.sex }, topic: 'family', score: 8 })
  }
}
