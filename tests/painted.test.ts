// Живописные сцены из слоёв (src/pixel/painted.ts): у каждого края и места есть всё нужное, и кадр собирается.
import fs from 'node:fs'
import { describe, expect, it } from 'vitest'
import { ageStage, BACKDROPS, planPainted, portraitKey } from '../src/pixel/painted'
import type { ArtIndex } from '../src/pixel/painted'
import { lookOf } from '../src/pixel/scene'
import { ERA_META } from '../src/content'
import { SCENE_PLACES } from '../src/engine/types'
import { paintedOn } from '../src/goal'

import VERSIONS from '../src/pixel/art-versions.json'
const index = (style: string): ArtIndex => JSON.parse(fs.readFileSync(`public/art/${style}/${(VERSIONS as Record<string, string>)[style]}`, 'utf8')).items
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
  it('файлы паков из оглавлений лежат на месте', () => {
    for (const [style, file] of Object.entries(VERSIONS as Record<string, string>)) {
      const pack = JSON.parse(fs.readFileSync(`public/art/${style}/${file}`, 'utf8'))
      for (const f of Object.values(pack.files as Record<string, string>)) expect(fs.existsSync(`public/art/${style}/${f}`), `${style}/${f}`).toBe(true)
    }
  })

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
          expect(plan, `${region} ${place}`).not.toBeNull()
          // Мастерская, школа, баня и дом - изнутри.
          if (['workshop', 'school', 'bath', 'home'].includes(place)) expect(plan!.layers[0].key, `${region} ${place}`).toMatch(/^interior\./)
          else expect(plan!.layers[0].key).toBe(`sky.${time}`)
          for (const l of plan!.layers) expect(ix[l.key], `${region} ${place} ${l.key}`).toBeTruthy()
          // Первый слой - фон во весь кадр (небо или комната): иначе кадр без фона (баг 17.11 - комната рисовалась мимо холста).
          expect(BACKDROPS.has(ix[plan!.layers[0].key][0]), `${region} ${place}`).toBe(true)
          // Семья на картинке вся: 5 человек.
          expect(plan!.layers.filter((l) => l.key.startsWith('person.')).length).toBe(5)
        }
      }
    }
  })

  it('дом изнутри по достатку: бедный, средний, богатый', () => {
    const ix = index('japanese')
    const first = (home: number) => planPainted({ scene: { place: 'home' }, region: 'kyoto', seed: 'h', cast: { ...family, home } as never }, ix)!.layers[0].key
    expect([0, 1, 2, 3, 4].map(first)).toEqual(['interior.home_poor', 'interior.home_poor', 'interior.home_mid', 'interior.home_rich', 'interior.home_rich'])
  })

  it('портрет героя есть у всех стилей, сословий, полов и возрастов, и у младенца', () => {
    for (const region of regions) {
      const ix = index(lookOf(region).style)
      for (const cls of ['slave', 'peasant', 'craftsman', 'trader', 'landowner', 'noble', 'royal'])
        for (const sex of ['m', 'f'] as const)
          for (const age of [6, 15, 35, 70]) expect(portraitKey(ix, { region, sex, age, cls }), `${region} ${cls} ${sex} ${age}`).toBeTruthy()
      expect(portraitKey(ix, { region, sex: 'm', age: 1 })).toBe('portrait.baby_m')
      expect(portraitKey(ix, { region, sex: 'f', age: 0 })).toBe('portrait.baby_f')
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
