// Аккаунт на клиенте (src/account.ts): объединение сохранений устройства и сервера, урезка до лимита сервера.
import { describe, expect, it } from 'vitest'
import { mergeData, slim } from '../src/account'
import type { LifeSummary } from '../src/engine/types'

const life = (id: string, record: number, diary = 1) => ({ heroId: id, record, deathYear: record, diary: Array.from({ length: diary }, () => ({ key: 'x' })), history: [] }) as unknown as LifeSummary

describe('Аккаунт: сохранения', () => {
  it('жизни объединяются без повторов (полная запись лучше урезанной), награды - раньше полученная', () => {
    const local = { memorial: [life('a', 1, 5), life('c', 3)], achievements: [{ id: 'x', ts: 20, lifeId: 'a' }] }
    const remote = { memorial: [life('a', 1, 0), life('b', 2)], achievements: [{ id: 'x', ts: 10, lifeId: 'a' }, { id: 'y', ts: 5, lifeId: 'b' }] }
    const m = mergeData(local, remote)
    expect(m.memorial.map((l) => l.heroId)).toEqual(['a', 'b', 'c'])
    expect(m.memorial[0].diary).toHaveLength(5)
    expect(m.achievements.find((e) => e.id === 'x')!.ts).toBe(10)
    expect(m.achievements).toHaveLength(2)
    expect(mergeData(local, null)).toBe(local)
  })

  it('слишком большие сохранения урезаются: у старых жизней - без дневника, итог остаётся', () => {
    const big = { memorial: Array.from({ length: 40 }, (_, i) => life(`h${i}`, i, 2000)), achievements: [] }
    const s = slim(big)
    expect(JSON.stringify(s).length).toBeLessThanOrEqual(850_000)
    expect(s.memorial).toHaveLength(40)
    expect(s.memorial[0].diary).toEqual([])
    expect(s.memorial[39].diary.length).toBe(2000)
  })
})
