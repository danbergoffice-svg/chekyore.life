// Детские головоломки по странам (решение владельца 02.11): у каждой страны своя.
// Каждая игра - файл src/kids/<Имя>Board.tsx с экспортом `<id>Puzzle: KidsPuzzle` (логика - src/kids/<id>.ts).
import type { KidsPuzzle } from './types'

const ORDER = ['ANE', 'E03', 'MAY', 'AMR', 'CHN', 'JPN', 'IND', 'ISL', 'BYZ', 'EUR', 'RUS', 'ETH', 'WAF']
const mods = import.meta.glob<Record<string, unknown>>('./*Board.tsx', { eager: true })

export const KIDS_PUZZLES: KidsPuzzle[] = Object.values(mods)
  .flatMap((m) => Object.entries(m).filter(([k]) => k.endsWith('Puzzle')).map(([, v]) => v as KidsPuzzle))
  .sort((a, b) => ORDER.indexOf(a.era) - ORDER.indexOf(b.era))

export const KIDS_BY_ERA: Record<string, KidsPuzzle> = Object.fromEntries(KIDS_PUZZLES.map((p) => [p.era, p]))
