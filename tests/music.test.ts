// A/B XM (12.11.2026): новая музыка у половины игроков; у каждой страны свой файл, у Египта отдельный.
import fs from 'node:fs'
import { describe, expect, it } from 'vitest'
import { musicNew, musicTrack } from '../src/goal'
import { ERA_IDS, ERA_META } from '../src/content'

describe('Музыка', () => {
  it('старая группа слышит прежние треки', () => {
    expect(musicTrack(null, undefined, false)).toBe('menu')
    expect(musicTrack('EUR', 'paris', false)).toBe('eur')
    expect(musicTrack('E03', 'egypt', false)).toBe('e03')
  })

  it('новая группа: свой трек меню, стран и Египта; у ацтеков и инков - прежний', () => {
    expect(musicTrack(null, undefined, true)).toBe('v2/menu')
    expect(musicTrack('E03', 'rome', true)).toBe('v2/e03')
    expect(musicTrack('E03', 'egypt', true)).toBe('v2/egy')
    expect(musicTrack('ANE', 'thebes', true)).toBe('v2/egy')
    expect(musicTrack('ANE', 'babylon', true)).toBe('v2/ane')
    expect(musicTrack('AMR', 'cusco', true)).toBe('amr')
  })

  it('у каждого трека, который может прозвучать, есть файл', () => {
    for (const fresh of [false, true]) {
      const ids = new Set([musicTrack(null, undefined, fresh)])
      for (const era of ERA_IDS) for (const r of ERA_META[era].regions) ids.add(musicTrack(era, r.id, fresh))
      for (const id of ids) expect(fs.existsSync(`public/music/${id}.mp3`), id).toBe(true)
    }
  })

  it('доля music_share делит игроков примерно пополам, 0 - никого', () => {
    const ids = Array.from({ length: 2000 }, (_, i) => `player-${i}`)
    const on = ids.filter((id) => musicNew(id, { music_share: 0.5 })).length
    expect(on).toBeGreaterThan(900)
    expect(on).toBeLessThan(1100)
    expect(ids.some((id) => musicNew(id, { music_share: 0 }))).toBe(false)
  })
})
