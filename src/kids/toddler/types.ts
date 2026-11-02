// Ранние игры (2–4 года): короткие, только нажатия, проиграть нельзя - звёзды за точность.
// В отличие от головоломок (src/kids/types.ts) здесь нет ходов и эталона: игра сама говорит, когда закончена.
import type { JSX } from 'preact'
import type { KidsLang, Task } from '../types'
import type { EraSkin } from './skins'

export interface ToddlerProps {
  skin: EraSkin
  lang: KidsLang
  /** Случайность расклада (mulberry32 из ../rng). */
  seed: number
  /** Игра окончена: звёзды 1–3 и ошибки (промахи, лишние ходы). */
  onDone: (r: { stars: number; mistakes: number }) => void
}

export interface ToddlerGame {
  id: string
  /** Что растёт у ребёнка. */
  task: Task
  Game: (p: ToddlerProps) => JSX.Element
  /** Как играть - одно короткое предложение. */
  rule: Record<KidsLang, string>
}
