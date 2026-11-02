// Цель жизни (src/engine/goals.ts, docs/TZ_goal.md): выбор целей, шаги, метки вариантов, калибровка.
import { describe, expect, it } from 'vitest'
import { ERA_IDS, ERA_META, loadAllEras } from '../src/content'
import tiers from '../src/content/goal_tiers.json'
import { autoplay } from '../src/engine/game'
import { GOALS, GOAL_STEPS, goalFits, goalImpact, goalMark, goalResult, offerGoals, setGoal } from '../src/engine/goals'
import { newLife, rollBirth } from '../src/engine/life'
import { makeRng } from '../src/kids/rng'
import type { ChoiceDef } from '../src/engine/types'
import { allKeys } from '../src/i18n'

const ERAS = await loadAllEras()

describe('Цель жизни', () => {
  it('у каждого сословия всех 13 стран - три разные цели, своя цель сословия среди них', () => {
    for (const id of ERA_IDS)
      for (const cls of ERAS[id].classes) {
        const s = newLife(ERAS[id], { mode: 'quick', mortality: 'soft', softenHeavy: false }, 11, undefined, undefined)
        s.hero.birthCls = s.hero.cls = cls.id
        for (let seed = 1; seed <= 20; seed++) {
          const offer = offerGoals(s.hero, makeRng(seed))
          expect(offer.length, `${id}.${cls.id}`).toBe(3)
          expect(new Set(offer.map((g) => g.id)).size).toBe(3)
          for (const g of offer) expect(goalFits(GOALS.find((x) => x.id === g.id)!, cls.id)).toBe(true)
          if (cls.id === 'slave') expect(offer.map((g) => g.id)).toContain('freedom')
          if (cls.id === 'noble') expect(offer.map((g) => g.id)).toContain('keep')
        }
      }
  })

  it('у всех целей есть тексты на трёх языках и калибровка', () => {
    for (const lang of ['ru', 'en', 'tr'] as const) {
      const keys = new Set(allKeys(lang))
      for (const g of GOALS) for (const k of ['title', 'wish', 'step.1', 'step.2', 'step.3', 'step.4']) expect(keys.has(`goal.${g.id}.${k}`), `${lang} goal.${g.id}.${k}`).toBe(true)
      for (const k of ['goal.tier.1', 'goal.tier.2', 'goal.tier.3', 'diary.goal_step', 'diary.goal_done']) expect(keys.has(k), `${lang} ${k}`).toBe(true)
    }
    const t = tiers as Record<string, Record<string, number>>
    for (const g of GOALS) {
      expect(t[g.id]?.all, g.id).toBeGreaterThan(0)
      expect(t[g.id].all).toBeLessThan(0.9)
    }
  })

  it('метки: смерть - против цели, свадьба - к семье, выкуп - к свободе', () => {
    const death: ChoiceDef = { id: 'x', effects: [{ kill: 'accident' }] }
    for (const g of GOALS) expect(goalMark(g.id, death)).toBe('down')
    expect(goalMark('family', { id: 'w', effects: [{ add_npc: 'spouse' }] })).toBe('up')
    expect(goalMark('freedom', { id: 'f', risk_roll: { success_chance_base: 0.5, on_success: [{ add_tag: 'freedman' }, { class_up: 1 }], on_failure: [{ param: 'health', delta: -5 }] } })).toBe('up')
    expect(goalMark('wealth', { id: 'n', effects: [{ param: 'happiness', delta: 5 }] })).toBe(null)
    // В настоящем контенте метки есть: заметная доля событий двигает к каждой цели, кроме самых редких.
    const choices = ERA_IDS.flatMap((id) => ERAS[id].events.flatMap((e) => e.choices ?? []))
    for (const g of GOALS) {
      const up = choices.filter((c) => goalImpact(g.id, c) >= 0.5).length
      expect(up, g.id).toBeGreaterThan(20)
    }
  })

  it('шаги идут по порядку, возрасты не убывают, каждый шаг - запись в дневнике', () => {
    for (let i = 0; i < 40; i++) {
      const birth = rollBirth(900 + i, 'population', ERA_IDS.map((id) => ERA_META[id]))
      const era = ERAS[birth.era]
      const fit = GOALS.filter((g) => goalFits(g, birth.cls))
      const goal = fit[i % fit.length].id
      const s = newLife(era, { mode: 'quick', mortality: 'soft', softenHeavy: false, protectedUntil: 20, goalWeight: 1.5 }, 900 + i, undefined, birth)
      setGoal(s, era, goal)
      const atStart = s.hero.goal!.steps.length
      autoplay(s, era)
      const g = s.hero.goal!
      expect(g.steps.length).toBeLessThanOrEqual(GOAL_STEPS)
      for (let n = 1; n < g.steps.length; n++) expect(g.steps[n]).toBeGreaterThanOrEqual(g.steps[n - 1])
      const notes = s.hero.diary.filter((d) => d.key === 'diary.goal_step' || d.key === 'diary.goal_done').length
      expect(notes, `${era.id} ${goal}`).toBe(g.steps.length - atStart)
      expect(goalResult(g)).not.toBeNull()
      expect(s.family.lives.at(-1)!.goal?.id).toBe(goal)
    }
  })

  it('без цели жизнь не меняется: тот же seed - та же жизнь', () => {
    const era = ERAS.EUR
    const a = autoplay(newLife(era, { mode: 'quick', mortality: 'soft', softenHeavy: false }, 4242), era)
    const b = autoplay(newLife(era, { mode: 'quick', mortality: 'soft', softenHeavy: false, goalWeight: 1.5 }, 4242), era)
    expect(b.hero.age).toBe(a.hero.age)
    expect(b.hero.diary.map((d) => d.key)).toEqual(a.hero.diary.map((d) => d.key))
  })
})
