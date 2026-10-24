import type { EraDef } from '../engine/types'
import e03 from './e03/era.json'
import e03Events from './e03/events.json'

// Эпохи, доступные в игре. Новая эпоха добавляется папкой в content/ и строкой здесь.
export const ERAS: Record<string, EraDef> = {
  E03: { ...(e03 as unknown as Omit<EraDef, 'events'>), events: e03Events as unknown as EraDef['events'] },
}

export const DEFAULT_ERA = 'E03'

export function eraById(id: string): EraDef {
  const era = ERAS[id]
  if (!era) throw new Error(`Unknown era ${id}`)
  return era
}
