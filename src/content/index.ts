import type { EraDef } from '../engine/types'
import e03 from './e03/era.json'
import patternWeights from './pattern_weights.json'

// События эпохи могут лежать в нескольких файлах events*.json — они склеиваются.
const e03Events = Object.values(import.meta.glob('./e03/events*.json', { eager: true, import: 'default' })).flat()
// Вести из мира: news*.json, тоже склеиваются.
const e03News = Object.values(import.meta.glob('./e03/news*.json', { eager: true, import: 'default' })).flat()

// Эпохи, доступные в игре. Новая эпоха добавляется папкой в content/ и строкой здесь.
export const ERAS: Record<string, EraDef> = {
  E03: {
    ...(e03 as unknown as Omit<EraDef, 'events' | 'news' | 'patternWeights'>),
    events: e03Events as unknown as EraDef['events'],
    news: e03News as unknown as EraDef['news'],
    patternWeights: patternWeights as EraDef['patternWeights'],
  },
}

export const DEFAULT_ERA = 'E03'

export function eraById(id: string): EraDef {
  const era = ERAS[id]
  if (!era) throw new Error(`Unknown era ${id}`)
  return era
}
