// Ранние игры (2–4 года) - общие для всех стран, у каждой страны своя обёртка (skins.ts).
import type { ToddlerGame } from './types'
import { collectGame } from './Collect'
import { towerGame } from './Tower'
import { sortGame } from './Sort'
import { pairsGame } from './Pairs'
import { cupsGame } from './Cups'
import { rhythmGame } from './Rhythm'
import { pathGame } from './Path'

/** Порядок важен: первым предлагаются самые понятные с одного взгляда. */
export const TODDLER_GAMES: ToddlerGame[] = [collectGame, sortGame, cupsGame, towerGame, pairsGame, rhythmGame, pathGame]
export const TODDLER_BY_ID: Record<string, ToddlerGame> = Object.fromEntries(TODDLER_GAMES.map((g) => [g.id, g]))
