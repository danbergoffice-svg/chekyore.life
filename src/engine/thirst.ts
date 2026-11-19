// Тяга к вину (жалоба 20.11: «алкоголь куда-то ушёл, частые праздники ни к чему не ведут»). Каждый выбор «выпить»,
// «отметить», «пир», «в кабак», «залить горе» копит тягу; без них она понемногу гаснет. На HABIT - пьянство (метка
// drinker: пороки страны - здоровье, деньги, усердие, имя; события v_wine_* - ссоры, обмороки, ультиматум супруга),
// и родные к пьющему холодеют. Бросил (событие убрало метку) - тяга сбрасывается, но легко вернётся.
import { changeParam, note } from './rules'
import type { GameState } from './types'

/** Выборы, которые копят тягу (id варианта в событиях). */
export const DRINK_CHOICES = new Set(['drink', 'feast', 'celebrate', 'tavern', 'drown', 'one', 'mixed', 'toast', 'party'])
export const THIRST = { perChoice: 12, stressed: 1.5, decay: 4, habit: 50, afterQuit: 10, kinCool: 2 }

/** Выбор сделан: если он про выпивку - тяга растёт (в тревоге - сильнее). */
export function drinkChoice(state: GameState, choiceId: string | null): void {
  if (!choiceId || !DRINK_CHOICES.has(choiceId)) return
  const hero = state.hero
  hero.thirst = Math.min(100, (hero.thirst ?? 0) + THIRST.perChoice * (hero.hidden.stress > 50 ? THIRST.stressed : 1))
}

/** Раз в год: тяга гаснет; на пороге - пьянство; пьющему родные холодеют. */
export function thirstYear(state: GameState): void {
  const hero = state.hero
  const drinker = hero.tags.includes('drinker')
  if (hero.wasDrinker && !drinker) {
    hero.thirst = THIRST.afterQuit
    hero.wasDrinker = false
  }
  hero.thirst = Math.max(0, (hero.thirst ?? 0) - THIRST.decay)
  if (!drinker && hero.age >= 14 && (hero.thirst ?? 0) >= THIRST.habit) {
    hero.tags.push('drinker')
    changeParam(hero, 'stress', -3)
    note(state, { key: 'diary.drink_habit', topic: 'health', icon: 'loss', score: 30, mood: -2, major: true })
  }
  if (hero.tags.includes('drinker')) {
    hero.wasDrinker = true
    for (const n of hero.npcs) if (n.alive && !n.away && (n.role === 'spouse' || n.role === 'child')) n.attitude = Math.max(-100, n.attitude - THIRST.kinCool)
  }
}
