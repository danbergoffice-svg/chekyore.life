import { describe, expect, it } from 'vitest'
import { loadAllEras } from '../src/content'
import { autoplay } from '../src/engine/game'
import { continueWithHeir, heirs, newLife } from '../src/engine/life'
import type { EraDef, GameState } from '../src/engine/types'

const ERAS = await loadAllEras()
const soft = { mode: 'full' as const, mortality: 'soft' as const, softenHeavy: false }
const byFolder = (id: string) => Object.values(ERAS).find((e) => e.ancestorNames === id)!

/** Имена предков детей героя: сам герой, его родители (деды ребёнка) и деды героя (прадеды ребёнка). */
function forbidden(s: GameState): Set<string> {
  return new Set([s.hero.name, ...s.hero.npcs.filter((n) => n.role === 'father' || n.role === 'mother').map((n) => n.name), ...(s.hero.ancestors ?? [])])
}

function dynasty(era: EraDef, seed: number): GameState[] {
  const out: GameState[] = []
  let s = autoplay(newLife(era, soft, seed), era)
  out.push(s)
  for (let g = 0; g < 3; g++) {
    const kids = heirs(s)
    if (!kids.length) break
    s = autoplay(continueWithHeir(s, era, kids[0].id), era)
    out.push(s)
  }
  return out
}

describe('Имена предков (B2)', () => {
  it('в Китае ребёнка не называют именем родителя, деда или прадеда', () => {
    const era = byFolder('forbid')
    let kids = 0
    for (let i = 0; i < 60; i++) {
      for (const s of dynasty(era, 300 + i)) {
        const bad = forbidden(s)
        for (const c of s.hero.npcs.filter((n) => n.role === 'child')) {
          kids++
          expect(bad.has(c.name), `${c.name} в семье ${[...bad].join(', ')}`).toBe(false)
        }
      }
    }
    expect(kids).toBeGreaterThan(50)
  })

  it('где принято, детей нередко называют в честь предков', () => {
    const era = byFolder('prefer')
    let kids = 0
    let honoured = 0
    for (let i = 0; i < 60; i++) {
      for (const s of dynasty(era, 700 + i)) {
        const names = forbidden(s)
        for (const c of s.hero.npcs.filter((n) => n.role === 'child')) {
          kids++
          if (names.has(c.name)) honoured++
        }
      }
    }
    expect(honoured / kids).toBeGreaterThan(0.15)
  })
})
