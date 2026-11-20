// «Жизнь дня» (docs/TZ_daily.md): одно рождение на дату у всех, разные даты - разные жизни, кому показывать,
// проверка ника, итог для таблицы. Сервер - npm run test:worker (раздел 9д).
import { describe, expect, it } from 'vitest'
import { ERA_IDS, ERA_META, loadAllEras } from '../src/content'
import { dailyBirth, dailyOn, dailyResult, dailySeed, msToNextDay, nickOk, prevUtcDate, utcDate } from '../src/dailyLife'
import { newLife } from '../src/engine/life'

const eras = () => ERA_IDS.map((id) => ERA_META[id])
const flags = { daily_share: 1, daily_min_lives: 1 }

describe('Жизнь дня', () => {
  it('одна дата - одно и то же рождение и номер жизни; рождение - в окне страны', () => {
    const a = dailyBirth('2026-11-21', eras())
    const b = dailyBirth('2026-11-21', eras())
    expect(a).toEqual(b)
    expect(dailySeed('2026-11-21')).toBe(dailySeed('2026-11-21'))
    const era = ERA_META[a.era]
    expect(era).toBeTruthy()
    expect(era.regions.some((r) => r.id === a.region)).toBe(true)
  })

  it('разные даты - разные жизни: за 60 дней не меньше 6 стран и 30 разных рождений', () => {
    const births = Array.from({ length: 60 }, (_, i) => dailyBirth(utcDate(Date.UTC(2026, 10, 1) + i * 86400000), eras()))
    expect(new Set(births.map((b) => b.era)).size).toBeGreaterThanOrEqual(6)
    expect(new Set(births.map((b) => `${b.era}:${b.region}:${b.year}:${b.cls}:${b.sex}`)).size).toBeGreaterThanOrEqual(30)
    expect(new Set(births.map((_, i) => dailySeed(utcDate(Date.UTC(2026, 10, 1) + i * 86400000)))).size).toBe(60)
  })

  it('сутки - по UTC: дата, вчера и время до полуночи', () => {
    expect(utcDate(Date.UTC(2026, 10, 21, 23, 59))).toBe('2026-11-21')
    expect(utcDate(Date.UTC(2026, 10, 22, 0, 1))).toBe('2026-11-22')
    expect(prevUtcDate('2026-12-01')).toBe('2026-11-30')
    expect(msToNextDay(Date.UTC(2026, 10, 21, 21, 0))).toBe(3 * 3600000)
  })

  it('кому показывать: только свой сайт, после первой законченной жизни, в доле daily_share', () => {
    expect(dailyOn('p1', flags, 1, 'web')).toBe(true)
    expect(dailyOn('p1', flags, 0, 'web')).toBe(false)
    expect(dailyOn('p1', flags, 3, 'crazygames')).toBe(false)
    expect(dailyOn('p1', { daily_share: 0 }, 3, 'web')).toBe(false)
    const half = Array.from({ length: 400 }, (_, i) => dailyOn('player-' + i, { daily_share: 0.5 }, 2, 'web')).filter(Boolean).length
    expect(half).toBeGreaterThan(150)
    expect(half).toBeLessThan(250)
  })

  it('ник: 3–16 букв любых алфавитов, цифры, «_» и «-»; без ссылок и пробелов', () => {
    for (const ok of ['Yusuf_Cairo', 'Мария-7', 'Ayşe', 'José', 'abc']) expect(nickOk(ok)).toBe(true)
    for (const bad of ['ab', 'a'.repeat(17), 'two words', 'www.site', 'x.com', 'hi!', '']) expect(nickOk(bad)).toBe(false)
  })

  it('итог для таблицы: возраст, живые дети и внуки, богатство, дело, рождение', async () => {
    await loadAllEras()
    const birth = dailyBirth('2026-11-21', eras())
    const s = newLife(ERA_META[birth.era], { mode: 'quick', mortality: 'soft', softenHeavy: false, daily: '2026-11-21' }, dailySeed('2026-11-21'), undefined, birth)
    s.hero.age = 47
    s.hero.money = 1234.6
    const kid = { ...s.hero.npcs[0], id: 'k1', role: 'child' as const, alive: true }
    const dead = { ...kid, id: 'k2', alive: false }
    const grand = { ...kid, id: 'k3', role: 'grandchild' as const }
    s.hero.npcs.push(kid, dead, grand)
    const r = dailyResult(s, '2026-11-21', birth)
    expect(r).toMatchObject({ date: '2026-11-21', age: 47, wealth: 1235, birth: { era: birth.era, region: birth.region, year: birth.year } })
    expect(r.kids).toBe(s.hero.npcs.filter((n) => n.alive && (n.role === 'child' || n.role === 'grandchild')).length)
    expect(r.kids).toBeGreaterThanOrEqual(2)
  })
})
