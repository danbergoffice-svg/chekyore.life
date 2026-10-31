// Времена года и погода на сцене двора: год идёт полоской 0→100% - зима → весна → лето → осень.
// Климат края - scene.climate региона в era.json. Погода выбирается по климату и сезону из seed и года:
// при повторе жизни та же. Состояние мира (мор, война, голод, праздник) - по меткам героя и событиям года.
import { ERA_META } from '../content'
import type { DiaryEntry, RegionScene } from '../engine/types'
import { noise } from './fx'
import type { Weather } from './fx'

export type Climate = NonNullable<RegionScene['climate']>
export type SeasonName = 'winter' | 'spring' | 'summer' | 'autumn'

const REGION = new Map(Object.values(ERA_META).flatMap((e) => e.regions.map((r) => [r.id, r] as const)))

export function climateOf(region: string): Climate {
  return REGION.get(region)?.scene?.climate ?? 'mediterranean'
}

/** Сезон по доле года: 0–0,25 зима, 0,25–0,5 весна, 0,5–0,75 лето, 0,75–1 осень. */
export function seasonName(season: number): SeasonName {
  return (['winter', 'spring', 'summer', 'autumn'] as const)[Math.min(3, Math.floor((((season % 1) + 1) % 1) * 4))]
}

/** Как выглядит край в этот сезон. */
export interface SeasonLook {
  /** Земля: цвет, к которому подмешивается, и сила (0 - без изменений). */
  ground?: { color: string; k: number }
  /** Снег на крышах, кронах и вершинах. */
  snow?: boolean
  /** Цвет листвы лиственных деревьев; bare - голые ветви. */
  leaf?: string
  bare?: boolean
  /** Поле за двором: снег, всходы, спелое, снопы, голая земля. */
  crop: 'snow' | 'sprouts' | 'ripe' | 'sheaves' | 'bare' | 'green'
}

const TABLE: Record<Climate, Record<SeasonName, SeasonLook>> = {
  temperate: {
    winter: { ground: { color: '#eef2f5', k: 0.85 }, snow: true, bare: true, crop: 'snow' },
    spring: { ground: { color: '#7a9a4a', k: 0.25 }, leaf: '#8ab85a', crop: 'sprouts' },
    summer: { ground: { color: '#6f8a3a', k: 0.12 }, leaf: '#4f7a3a', crop: 'ripe' },
    autumn: { ground: { color: '#8a6a3a', k: 0.2 }, leaf: '#c8782a', crop: 'sheaves' },
  },
  mediterranean: {
    winter: { ground: { color: '#7a8a5a', k: 0.2 }, leaf: '#5a7a4a', crop: 'green' },
    spring: { ground: { color: '#8aa05a', k: 0.2 }, leaf: '#7aa84a', crop: 'sprouts' },
    summer: { ground: { color: '#c8b070', k: 0.25 }, leaf: '#6a7a3a', crop: 'ripe' },
    autumn: { ground: { color: '#a8885a', k: 0.15 }, leaf: '#a8883a', crop: 'sheaves' },
  },
  arid: {
    winter: { ground: { color: '#a8a070', k: 0.12 }, crop: 'green' },
    spring: { ground: { color: '#c8b07a', k: 0.1 }, crop: 'ripe' },
    summer: { ground: { color: '#e0c890', k: 0.25 }, crop: 'sheaves' },
    autumn: { ground: { color: '#c8b080', k: 0.12 }, crop: 'bare' },
  },
  tropical: {
    winter: { ground: { color: '#a88a5a', k: 0.25 }, leaf: '#6a7a3a', crop: 'bare' },
    spring: { ground: { color: '#5a8a3a', k: 0.25 }, leaf: '#3a8a3a', crop: 'sprouts' },
    summer: { ground: { color: '#4a7a30', k: 0.3 }, leaf: '#2a7a30', crop: 'green' },
    autumn: { ground: { color: '#7a8a4a', k: 0.15 }, leaf: '#5a7a30', crop: 'ripe' },
  },
  monsoon: {
    winter: { ground: { color: '#a8986a', k: 0.15 }, leaf: '#6a7a3a', crop: 'ripe' },
    spring: { ground: { color: '#c8a86a', k: 0.3 }, leaf: '#7a7a3a', crop: 'bare' },
    summer: { ground: { color: '#4a7a3a', k: 0.3 }, leaf: '#2a7a30', crop: 'sprouts' },
    autumn: { ground: { color: '#6a8a3a', k: 0.2 }, leaf: '#4a7a30', crop: 'green' },
  },
  highland: {
    winter: { ground: { color: '#b8b0a0', k: 0.3 }, leaf: '#7a7a4a', crop: 'bare' },
    spring: { ground: { color: '#a89a6a', k: 0.15 }, leaf: '#6a8a4a', crop: 'sprouts' },
    summer: { ground: { color: '#5a8a3a', k: 0.25 }, leaf: '#3a7a3a', crop: 'green' },
    autumn: { ground: { color: '#8a8a4a', k: 0.15 }, leaf: '#a8883a', crop: 'ripe' },
  },
}

export function seasonLook(climate: Climate, season: number): SeasonLook {
  return TABLE[climate][seasonName(season)]
}

/** Погода: вероятности по климату и сезону (остальное - ясно). */
const WEATHER: Record<Climate, Record<SeasonName, [Weather, number][]>> = {
  temperate: {
    winter: [['snow', 0.45], ['fog', 0.1], ['wind', 0.1]],
    spring: [['rain', 0.3], ['fog', 0.1]],
    summer: [['rain', 0.18], ['storm', 0.06], ['heat', 0.1]],
    autumn: [['rain', 0.35], ['fog', 0.15], ['wind', 0.15]],
  },
  mediterranean: {
    winter: [['rain', 0.35], ['wind', 0.1]],
    spring: [['rain', 0.15], ['wind', 0.08]],
    summer: [['heat', 0.4]],
    autumn: [['rain', 0.2], ['wind', 0.12]],
  },
  arid: {
    winter: [['wind', 0.15], ['rain', 0.05]],
    spring: [['wind', 0.25]],
    summer: [['heat', 0.6], ['wind', 0.1]],
    autumn: [['wind', 0.12], ['heat', 0.2]],
  },
  tropical: {
    winter: [['heat', 0.25]],
    spring: [['rain', 0.35], ['storm', 0.12]],
    summer: [['rain', 0.45], ['storm', 0.2]],
    autumn: [['rain', 0.2], ['fog', 0.1]],
  },
  monsoon: {
    winter: [['fog', 0.2]],
    spring: [['heat', 0.5], ['wind', 0.1]],
    summer: [['rain', 0.5], ['storm', 0.25]],
    autumn: [['rain', 0.2], ['fog', 0.1]],
  },
  highland: {
    winter: [['wind', 0.2], ['fog', 0.1]],
    spring: [['wind', 0.15]],
    summer: [['rain', 0.4], ['storm', 0.1]],
    autumn: [['rain', 0.2], ['fog', 0.2]],
  },
}

function hashStr(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return h >>> 0
}

/** Погода сезона: одинаковая для героя, года и сезона. */
export function weatherFor(region: string, season: number, year: number, seed: string): Weather | null {
  const name = seasonName(season)
  const roll = noise(hashStr(seed), year, ['winter', 'spring', 'summer', 'autumn'].indexOf(name))
  let acc = 0
  for (const [w, p] of WEATHER[climateOf(region)][name]) {
    acc += p
    if (roll < acc) return w
  }
  return null
}

export type Mood = 'epidemic' | 'war' | 'famine' | 'feast'

/** Состояние мира для сцены двора: мор (метка героя), война, голод, праздник - по событиям этого года. */
export function moodFor(tags: string[], diary: DiaryEntry[], year: number): Mood | undefined {
  if (tags.includes('epidemic')) return 'epidemic'
  const now = diary.filter((d) => d.year === year)
  if (now.some((d) => d.icon === 'war')) return 'war'
  if (now.some((d) => /hunger|famine|drought|harvest_fail|bad_harvest/.test(d.eventId ?? ''))) return 'famine'
  if (now.some((d) => d.icon === 'wedding' || /feast|festival|holiday|wedding|celebrat/.test(d.eventId ?? ''))) return 'feast'
  return undefined
}
