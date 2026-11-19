// Займы под проценты (просьба 20.11). Взять в долг у ростовщика или банкира можно везде, кроме мусульманских стран и
// мусульман: там риба (рост) запрещена - деньги берут товариществом или под залог (estate.ts pledgeAsset).
// Кредитная история рода (Family.credit, 0–100, начало 50) переходит наследникам: вовремя вернул - ставка ниже и
// дают больше; не вернул - долг висит на герое (обычная долговая яма), а история портится.
// Раз в год - проценты; в срок - возврат всей суммы (если денег нет - просрочка). Вернуть можно и раньше срока.
import { ERA_META } from '../content'
import { faithMatches, note } from './rules'
import { ledger } from './estate'
import type { GameState } from './types'

export const LOAN = { start: 50, term: 5, rate: 0.15, rateSpread: 0.1, limit: 2, limitPerCredit: 0.06, repaid: 15, early: 8, default: 30, minRate: 0.05, maxRate: 0.3 }

const base = (state: GameState) => Math.max(80, ERA_META[state.hero.era]?.classes.find((c) => c.id === state.hero.cls)?.upkeep ?? 150)
export const credit = (state: GameState) => state.family.credit ?? LOAN.start

/** Почему нельзя взять заём (ключ текста) или undefined. */
export function loanLock(state: GameState): string | undefined {
  const hero = state.hero
  if (hero.era === 'ISL' || faithMatches(hero.religion, ['islamic'])) return 'loan.lock.riba'
  if (hero.age < (ERA_META[hero.era]?.stages.adult ?? 16) || hero.cls === 'slave' || hero.tags.includes('enslaved')) return 'loan.lock.young'
  if (state.family.loan) return 'loan.lock.have'
  if (hero.tags.includes('deep_debt')) return 'loan.lock.debt'
  return undefined
}

/** Годовая ставка: хорошая история - дешевле. */
export function loanRate(state: GameState): number {
  const r = LOAN.rate - ((credit(state) - 50) / 50) * LOAN.rateSpread
  return Math.round(Math.max(LOAN.minRate, Math.min(LOAN.maxRate, r)) * 100) / 100
}

/** Сколько дадут: годовые расходы сословия × (2 + история / 16). */
export function loanLimit(state: GameState): number {
  return Math.round(base(state) * (LOAN.limit + credit(state) * LOAN.limitPerCredit))
}

export function takeLoan(state: GameState, amount: number): boolean {
  if (loanLock(state) || !(amount >= 1) || amount > loanLimit(state)) return false
  const rate = loanRate(state)
  state.hero.money += Math.round(amount)
  state.family.loan = { principal: Math.round(amount), rate, takenYear: state.year, dueYear: state.year + LOAN.term }
  note(state, { key: 'diary.loan_taken', params: { money: Math.round(amount), n: Math.round(rate * 100), year: state.year + LOAN.term }, topic: 'money', score: 16 })
  return true
}

/** Вернуть всё сейчас (раньше срока - история чуть лучше). */
export function repayLoan(state: GameState): boolean {
  const loan = state.family.loan
  if (!loan || state.hero.money < loan.principal) return false
  state.hero.money -= loan.principal
  state.family.credit = Math.min(100, credit(state) + (state.year < loan.dueYear ? LOAN.early : LOAN.repaid))
  state.family.loan = undefined
  note(state, { key: 'diary.loan_repaid', params: { money: loan.principal }, topic: 'money', score: 16, mood: 3 })
  return true
}

/** Раз в год: проценты; в срок - возврат или просрочка (долг на герое, история хуже). */
export function loanYear(state: GameState): void {
  const loan = state.family.loan
  if (!loan) return
  const hero = state.hero
  if (loan.takenYear !== state.year) {
    const interest = Math.max(1, Math.round(loan.principal * loan.rate))
    hero.money -= interest
    ledger(state).interest = (ledger(state).interest ?? 0) - interest
    note(state, { key: 'diary.loan_interest', params: { money: interest }, topic: 'money', score: 4 })
  }
  if (state.year < loan.dueYear) return
  if (hero.money >= loan.principal) {
    hero.money -= loan.principal
    state.family.credit = Math.min(100, credit(state) + LOAN.repaid)
    note(state, { key: 'diary.loan_repaid', params: { money: loan.principal }, topic: 'money', score: 16, mood: 3 })
  } else {
    // Просрочка: заимодавец требует своё - долг ложится на героя (дальше - обычные долги и долговая яма).
    hero.money -= loan.principal
    state.family.credit = Math.max(0, credit(state) - LOAN.default)
    note(state, { key: 'diary.loan_default', params: { money: loan.principal }, topic: 'money', icon: 'loss', score: 26, mood: -5, major: true })
  }
  state.family.loan = undefined
}
