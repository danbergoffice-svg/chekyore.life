// Живописные сцены из слоёв (src/pixel/painted.ts): у каждого края и места есть всё нужное, и кадр собирается.
import fs from 'node:fs'
import { describe, expect, it } from 'vitest'
import { ageStage, planPainted } from '../src/pixel/painted'
import type { ArtIndex } from '../src/pixel/painted'
import { lookOf } from '../src/pixel/scene'
import { ERA_META } from '../src/content'
import { SCENE_PLACES } from '../src/engine/types'
import { paintedOn } from '../src/goal'

const index = (style: string): ArtIndex => JSON.parse(fs.readFileSync(`public/art/${style}/index.json`, 'utf8'))
const regions = Object.values(ERA_META).flatMap((e) => e.regions.map((r) => r.id))
const family = {
  members: [
    { role: 'hero', sex: 'm', age: 34, seed: 'h', cls: 'craftsman' },
    { role: 'spouse', sex: 'f', age: 30, seed: 's', cls: 'craftsman' },
    { role: 'child', sex: 'f', age: 7, seed: 'c', cls: 'craftsman' },
    { role: 'child', sex: 'm', age: 1, seed: 'b', cls: 'craftsman' },
    { role: 'parent', sex: 'f', age: 66, seed: 'p', cls: 'craftsman' },
  ],
  animals: ['chickens', 'dog', 'goat', 'llama'],
  home: 3,
} as const

describe('Живописные сцены', () => {
  it('у каждого края есть оглавление и ориентир', () => {
    for (const region of regions) {
      const ix = index(lookOf(region).style)
      expect(ix[`landmark.${region}`], region).toBeTruthy()
    }
  })

  it('во всех краях и уличных местах план собирается из существующих слоёв', () => {
    for (const region of regions) {
      const ix = index(lookOf(region).style)
      for (const place of SCENE_PLACES) {
        for (const time of ['day', 'night'] as const) {
          const plan = planPainted({ scene: { place, time, props: ['fire', 'goat', 'rain'] }, region, seed: 'x', cast: family as never, weather: 'snow', mood: 'war' }, ix)
          if (['workshop', 'school', 'bath'].includes(place)) {
            expect(plan).toBeNull()
            continue
          }
          expect(plan, `${region} ${place}`).not.toBeNull()
          for (const l of plan!.layers) expect(ix[l.key], `${region} ${place} ${l.key}`).toBeTruthy()
          expect(plan!.layers[0].key).toBe(`sky.${time}`)
          // Семья на картинке вся: 5 человек.
          expect(plan!.layers.filter((l) => l.key.startsWith('person.')).length).toBe(5)
        }
      }
    }
  })

  it('свой двор: дом нужного уровня, сгоревший - обгоревший', () => {
    const ix = index('gothic')
    const plan = (homeState?: 'burned') => planPainted({ scene: { place: 'yard' }, region: 'paris', seed: 'y', cast: { ...family, homeState } as never }, ix)!
    expect(plan().layers.some((l) => l.key === 'house.home3')).toBe(true)
    expect(plan('burned').layers.some((l) => l.key === 'house.home3_burned')).toBe(true)
  })

  it('возраст → ступень картинки', () => {
    expect([0, 5, 15, 40, 70].map(ageStage)).toEqual(['baby', 'child', 'teen', 'adult', 'elder'])
  })

  it('флаг painted_share: 0 - никого, 1 - всех', () => {
    expect(paintedOn('a', { painted_share: 0 })).toBe(false)
    expect(paintedOn('a', { painted_share: 1 })).toBe(true)
  })
})
