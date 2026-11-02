// Ранняя детская игра (решение владельца 02.11): раз за жизнь, в 2 года (флаг kids_age) - после 1–2 событий детства.
// На выбор три занятия - Тело / Ум / Люди: ранние игры (toddler/, общие для всех стран) и головоломка своей страны.
// Головоломки разной трудности: лёгкие - с первой жизни, средние - с третьей, трудные (счёт, ход конём) - с пятой.
import type { GameState } from '../engine/types'
import { changeParam, note } from '../engine/rules'
import { KIDS_BY_ERA } from './index'
import { TODDLER_BY_ID, TODDLER_GAMES } from './toddler'
import type { Task } from './types'
import { REWARD, TASKS } from './types'

/** Трудность головоломок для маленьких (замер tools/kids-rank.ts и проверка глазами на уровне 1). */
export const PUZZLE_TIER: Record<string, 1 | 2 | 3> = {
  tables: 1, manuscripts: 1, harbor: 1, ice: 1, canals: 1,
  mosaic: 2, rangoli: 2, gebeta: 2, garden: 2,
  scales: 3, maya: 3, quipu: 3, knights: 3,
}
/** С какой жизни (сколько жизней уже прожито) головоломка этой трудности попадает в выбор. */
export const TIER_FROM: Record<1 | 2 | 3, number> = { 1: 0, 2: 2, 3: 4 }

export interface EarlyCard {
  kind: 'toddler' | 'puzzle'
  id: string
  task: Task
}

/** Уровень головоломки: первые жизни - 1, дальше понемногу растёт. */
export function puzzleLevel(livesBefore: number): number {
  return livesBefore < 6 ? 1 : livesBefore < 12 ? 2 : 3
}

export function puzzleOpen(era: string, livesBefore: number): boolean {
  const p = KIDS_BY_ERA[era]
  return !!p && livesBefore >= TIER_FROM[PUZZLE_TIER[p.id] ?? 3]
}

/**
 * Что предложить. seen - id сыгранных ранних игр в порядке игры (из прошлых жизней).
 * Сначала новые: головоломка страны (если открыта) и ранние игры с разными заданиями; если новых не хватает - давно забытые.
 * Пока есть хоть одна новая игра, повторить сыгранную можно только по своему выбору.
 */
export function earlyOffer(era: string, livesBefore: number, seen: string[] = []): EarlyCard[] {
  const puzzle = puzzleOpen(era, livesBefore) ? KIDS_BY_ERA[era] : undefined
  const cards: EarlyCard[] = []
  const used = new Set<Task>()
  const add = (id: string, task: Task) => {
    cards.push({ kind: 'toddler', id, task })
    used.add(task)
  }
  const freshPuzzle = puzzle && !seen.includes(puzzle.id)
  const room = freshPuzzle ? 2 : 3
  const fresh = TODDLER_GAMES.filter((g) => !seen.includes(g.id))
  // Новые - по одной на задание, потом любые новые, потом давно сыгранные.
  for (const g of fresh) if (cards.length < room && !used.has(g.task)) add(g.id, g.task)
  for (const g of fresh) if (cards.length < room && !cards.some((c) => c.id === g.id)) add(g.id, g.task)
  const last = (id: string) => seen.lastIndexOf(id)
  const old = TODDLER_GAMES.filter((g) => !cards.some((c) => c.id === g.id)).sort((a, b) => last(a.id) - last(b.id))
  const wantPuzzle = !!puzzle && (freshPuzzle || cards.length < 3)
  for (const g of old) if (cards.length < (wantPuzzle ? 2 : 3) && !used.has(g.task)) add(g.id, g.task)
  for (const g of old) if (cards.length < (wantPuzzle ? 2 : 3) && !cards.some((c) => c.id === g.id)) add(g.id, g.task)
  if (puzzle && wantPuzzle) cards.push({ kind: 'puzzle', id: puzzle.id, task: TASKS.find((t) => !used.has(t)) ?? 'mind' })
  return cards.sort((a, b) => TASKS.indexOf(a.task) - TASKS.indexOf(b.task))
}


export interface EarlyResult {
  kind: EarlyCard['kind']
  id: string
  task: Task
  /** 0 - бросил, 1–3 - звёзды. */
  stars: number
  gain: number
  sec: number
  /** Головоломка: ходы, эталон, подсказки; ранняя игра - промахи. */
  moves?: number
  par?: number
  hints?: number
  mistakes?: number
}

/** Прибавка за раннюю игру - к качествам задания; запись в дневник. */
export function applyEarly(state: GameState, r: EarlyResult): void {
  const hero = state.hero
  const g = r.gain
  if (r.task === 'body') {
    changeParam(hero, 'health', g)
    changeParam(hero, 'strength', g)
  } else if (r.task === 'mind') changeParam(hero, 'intellect', g)
  else {
    changeParam(hero, 'charisma', g)
    changeParam(hero, 'reputation', Math.ceil(g / 2))
  }
  note(state, {
    key: `diary.kids.${r.task}`,
    params: { n: g },
    topic: 'life',
    icon: 'child',
    score: 20 + r.stars * 10,
    mood: r.stars > 0 ? 5 : 0,
  })
}

/** Звёзды ранней игры → прибавка (та же шкала, что у головоломок). */
export const earlyGain = (stars: number) => REWARD[Math.max(0, Math.min(3, stars))]

/** Где хранятся сыгранные ранние игры (platform.kvGet/kvSet): id через запятую, по порядку. */
export const SEEN_KEY = 'thousands.kids_seen'

function hash(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return h >>> 0
}

/** Есть ли у игрока ранняя игра: доля kids_share по своему хешу id - не ab_buckets, там идёт другой опыт. */
export function kidsGroup(playerId: string, share: number): boolean {
  if (share >= 1) return true
  if (share <= 0) return false
  return hash(`${playerId}:kids`) / 4294967296 < share
}

/** Зерно расклада ранней игры героя. */
export const earlySeed = (heroId: string) => hash(`${heroId}:early`) % 1_000_000

/** Ранняя игра у этого игрока: выключена флагом kids_age = 0, иначе - доля kids_share; ?kids=1 / ?kids=0 - проверить руками. */
export function kidsOn(playerId: string, flags: { kids_age: number; kids_share: number }): boolean {
  const forced = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('kids') : null
  if (forced === '1' || forced === '0') return forced === '1'
  return flags.kids_age > 0 && kidsGroup(playerId, flags.kids_share)
}
