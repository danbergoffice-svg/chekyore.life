// Аналитика 16.11: A-01 - родство в карточке утраты, A-02 - «купить два надела» не считается отказом.
import { describe, expect, it } from 'vitest'
import { lossRoleOf } from '../src/telemetry'
import { offerAllowed, offerAnswered, LAND_REFUSALS } from '../src/engine/estate'
import type { GameState } from '../src/engine/types'

describe('A-01: родство в карточке утраты', () => {
  it('обычная запись о смерти - роль из ключа', () => {
    expect(lossRoleOf({ key: 'diary.death_father' })).toBe('father')
    expect(lossRoleOf({ key: 'diary.death_spouse', params: { who: { name: 'x' } } })).toBe('spouse')
    expect(lossRoleOf({ key: 'diary.death_child' })).toBe('child')
  })
  it('смерть вдали - роль из параметра', () => {
    expect(lossRoleOf({ key: 'diary.death_far', params: { role: { key: 'rel.sibling' } } })).toBe('sibling')
  })
  it('незнакомая запись - other', () => {
    expect(lossRoleOf({ key: 'diary.death_far' })).toBe('other')
    expect(lossRoleOf({ key: 'diary.something' })).toBe('other')
  })
})

describe('A-02: покупка двух наделов обнуляет счёт отказов', () => {
  const state = () => ({ year: 1200, hero: { seen: {}, landRefused: 0 } }) as unknown as GameState
  it('buy_two после двух отказов - счёт сброшен, предложения продолжаются', () => {
    const s = state()
    offerAnswered(s, 'estate_land', 'save')
    offerAnswered(s, 'estate_land', 'save')
    offerAnswered(s, 'estate_land', 'buy_two')
    expect(s.hero.landRefused).toBe(0)
    expect(offerAllowed(s, 'land')).toBe(true)
  })
  it('три отказа подряд - больше не предлагать', () => {
    const s = state()
    for (let i = 0; i < LAND_REFUSALS; i++) offerAnswered(s, 'estate_land', 'save')
    expect(offerAllowed(s, 'land')).toBe(false)
  })
})
