// Детская мини-игра (решение владельца 02.11): раз за жизнь в детстве - головоломка своей страны.
// Задание (Тело / Ум / Люди) выбирает, что растёт у ребёнка; звёзды - насколько.
// Каждая игра - чистая логика (generate / apply / solved / hint, тесты - tests/kids.test.ts) + доска (Preact, только рисует и шлёт ходы).
import type { JSX } from 'preact'
import type { ScenePlace } from '../engine/types'

export type Task = 'body' | 'mind' | 'people'
export const TASKS: Task[] = ['body', 'mind', 'people']
export type KidsLang = 'ru' | 'en' | 'tr'

/** Случайность уровня: число 0..1 (mulberry32 из rng.ts). */
export type Rng = () => number

/** Уровень: начальное состояние, эталонное решение и его длина (par - для звёзд). */
export interface Level<S, M> {
  start: S
  solution: M[]
  par: number
}

export interface PuzzleLogic<S, M> {
  /** Сложность 1..5 (растёт от жизни к жизни). Задание может менять цель (куда вести воду, что взвешивать). */
  generate(difficulty: number, rng: Rng, task: Task): Level<S, M>
  /** Ход; null - нельзя. Состояние не меняется (возвращается новое). */
  apply(s: S, m: M): S | null
  solved(s: S): boolean
  /** Следующий хороший ход из текущего состояния (для кнопки «Подсказка»); null - подсказать нечего. */
  hint(s: S, level: Level<S, M>): M | null
}

export interface BoardProps<S, M> {
  state: S
  level: Level<S, M>
  task: Task
  lang: KidsLang
  /** Ход игрока. */
  onMove: (m: M) => void
  /** Только что подсказанный ход - подсветить. */
  hinted: M | null
  done: boolean
}

export interface PuzzleText {
  title: string
  story: string
  rule: string
  /** Задания: Тело, Ум, Люди. */
  tasks: [string, string, string]
}

export interface KidsPuzzle<S = any, M = any> {
  id: string
  era: string
  region: string
  place: ScenePlace
  logic: PuzzleLogic<S, M>
  Board: (p: BoardProps<S, M>) => JSX.Element
  text: Record<KidsLang, PuzzleText>
}

/** Звёзды: решено не длиннее эталона - 3, до полутора эталонов - 2, иначе 1; подсказка - не больше 2; сдался - 0. */
export function starsFor(solved: boolean, moves: number, par: number, hints: number): number {
  if (!solved) return 0
  const s = moves <= par ? 3 : moves <= Math.ceil(par * 1.5) ? 2 : 1
  return hints > 0 ? Math.min(2, s) : s
}

/** Прибавка к качествам за звёзды. */
export const REWARD = [1, 3, 5, 8]
