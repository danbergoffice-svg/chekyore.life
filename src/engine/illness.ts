// Болезни близких (отзыв 09.11: «все умирают от болезни, непонятно какой, и заранее не видно»).
// Близкий обычно сначала тяжело заболевает конкретной болезнью (запись в дневнике, «болен: чахотка» во вкладке
// «Близкие»), а через год умирает или поправляется. Смертность в среднем та же: болезнь начинается чаще, чем раньше
// наступала смерть, ровно во столько раз, во сколько не каждая болезнь смертельна. Внезапно - младенцы, несчастный
// случай, роды. Причины - ключи cause.* (src/content/common), те же, что у записи о смерти и у силы горя (emotions.json).
// Врач (healing) выхаживает своих чаще и лечит себя сам.
import { changeParam, clamp, killNpc, note, npcAge } from './rules'
import { chance, weighted } from './rng'
import type { GameState, Hero, Npc } from './types'

/** Доля болезней, кончающихся смертью, без врача в доме. */
export const ILL_DEATH = 0.6
/** Врач на максимуме навыка снижает её вдвое. */
export const HEAL_CUT = 0.5

/**
 * Умение лечить, 0–1: навык «медицина» (врачи, лекари, знахари). Врач чаще выхаживает больных близких и себя,
 * а в рискованных выборах о здоровье у него выше шанс (game.riskChance).
 */
export function healing(hero: Hero): number {
  return clamp((hero.skills?.medicine ?? 0) / 60, 0, 1)
}

type Ill = { id: string; ages: [number, number]; weight: number }
/** Болезни без привязки к эпохе: названия простые, такие, какими их называли сами люди. */
const ILLS: Ill[] = [
  { id: 'infant_illness', ages: [0, 9], weight: 5 },
  { id: 'pox', ages: [0, 40], weight: 2 },
  { id: 'flux', ages: [0, 70], weight: 3 },
  { id: 'fever', ages: [3, 70], weight: 4 },
  { id: 'consumption', ages: [12, 65], weight: 3 },
  { id: 'chest', ages: [30, 120], weight: 3 },
  { id: 'wound', ages: [14, 60], weight: 1.5 },
  { id: 'heart', ages: [45, 120], weight: 3 },
  { id: 'stroke', ages: [50, 120], weight: 2.5 },
  { id: 'old_age', ages: [68, 120], weight: 5 },
]

/** Чем заболел близкий: в мор - моровым поветрием, иначе - по возрасту. */
export function pickIll(state: GameState, age: number): string {
  if (state.hero.tags.includes('epidemic') && chance(state, 0.6)) return 'epidemic'
  return weighted(state, ILLS.filter((i) => age >= i.ages[0] && age <= i.ages[1]), (i) => i.weight)?.id ?? 'fever'
}

/** Внезапная смерть: младенец - детская болезнь, женщина детородного возраста (жена, дочь, сестра) - роды, иначе несчастный случай. */
function suddenCause(npc: Npc, age: number): string {
  if (age < 2) return 'infant_illness'
  return npc.sex === 'f' && age >= 16 && age <= 42 && (npc.role === 'spouse' || npc.role === 'child' || npc.role === 'sibling') ? 'childbirth' : 'accident'
}

/** Доля внезапных смертей: младенцы - все (болеют недолго), взрослые в силе - пятая часть, остальные - десятая. */
function suddenShare(age: number): number {
  return age < 2 ? 1 : age >= 15 && age <= 55 ? 0.2 : 0.1
}

/** Год жизни близкого: болезнь, выздоровление или смерть. q - вероятность умереть в этот год по таблице эпохи. */
export function npcHealthYear(state: GameState, npc: Npc, q: number): void {
  const hero = state.hero
  const age = npcAge(npc, state.year)
  const heal = healing(hero)
  const home = !npc.away
  const params = { who: { name: npc.name }, sex: npc.sex, role: { key: `rel.${npc.role}`, sex: npc.sex } }
  if (npc.ill) {
    // Болен с прошлого года: смерть или выздоровление. Врач выхаживает только тех, кто рядом.
    if (chance(state, ILL_DEATH * (home ? 1 - HEAL_CUT * heal : 1))) return killNpc(state, npc, npc.ill.cause)
    npc.ill = undefined
    if (home) {
      const healer = heal >= 0.3
      note(state, { key: healer ? 'diary.npc_healed' : 'diary.npc_recovered', params, topic: 'family', icon: 'find', score: 16, mood: 6 })
      changeParam(hero, 'happiness', 5)
      if (healer) changeParam(hero, 'reputation', 3)
    }
    return
  }
  const sudden = suddenShare(age)
  if (chance(state, q * sudden)) return killNpc(state, npc, suddenCause(npc, age))
  // Не каждая болезнь смертельна: начинается она чаще, чтобы смертей в среднем было столько же, сколько раньше.
  if (!chance(state, Math.min(0.95, (q * (1 - sudden)) / ILL_DEATH))) return
  const cause = pickIll(state, age)
  npc.ill = { cause, since: state.year }
  // Про тех, кто далеко, узнают только из вести о смерти; про тех, кто рядом, герой знает и тревожится.
  if (!home) return
  const close = ['father', 'mother', 'spouse', 'child'].includes(npc.role)
  note(state, { key: 'diary.npc_ill', params: { ...params, ill: { key: `cause.${cause}`, sex: npc.sex } }, topic: 'family', icon: 'death', score: close ? 26 : 12, mood: close ? -6 : -3, major: close })
  changeParam(hero, 'stress', close ? 2 : 1)
}

/** Больной герой-врач лечит себя сам: каждый год есть шанс поправиться без события. */
export function selfHealYear(state: GameState): void {
  const hero = state.hero
  const heal = healing(hero)
  if (!hero.tags.includes('ill') || heal < 0.3 || !chance(state, 0.45 * heal)) return
  hero.tags = hero.tags.filter((t) => t !== 'ill')
  note(state, { key: 'diary.self_healed', topic: 'health', icon: 'find', score: 22, mood: 6 })
}
