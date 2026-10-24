import { describe, expect, it } from 'vitest'
import { ERAS } from '../src/content'
import { allKeys, createT, hasKey, LANGS } from '../src/i18n'
import type { Condition, Effect } from '../src/engine/types'

describe('Контент', () => {
  for (const era of Object.values(ERAS)) {
    const profIds = new Set(era.professions.map((p) => p.id))
    const eventIds = new Set(era.events.map((e) => e.id))

    const required: string[] = [`era.${era.id}`, `era.${era.id}.years`]
    for (const r of era.regions) required.push(`region.${r.id}`, `region.${r.id}.intro`, `coin.${r.coin}`)
    for (const c of era.classes) required.push(`class.${c.id}`)
    for (const p of era.professions) required.push(`prof.${p.id}`, `prof.${p.id}.desc`)
    for (const f of era.focuses) required.push(`focus.${f.id}`, `focus.${f.id}.desc`)
    for (const tr of era.traits) required.push(`trait.${tr}`)
    for (const s of era.skills) required.push(`skill.${s}`)
    for (const c of era.mortality.causes) required.push(`cause.${c.id}`)
    required.push('cause.childbirth', 'cause.epidemic')
    for (const ev of era.events) {
      required.push(`ev.${ev.id}.title`, `ev.${ev.id}.text`)
      if (ev.historian_note) required.push(`ev.${ev.id}.note`)
      for (const c of ev.choices ?? []) {
        required.push(`ev.${ev.id}.${c.id}`)
        if (c.risk_roll) required.push(`ev.${ev.id}.${c.id}.success`, `ev.${ev.id}.${c.id}.failure`)
      }
    }

    for (const lang of LANGS) {
      it(`${era.id}: все тексты есть (${lang})`, () => {
        expect(required.filter((k) => !hasKey(lang, k))).toEqual([])
      })
    }

    it(`${era.id}: у каждого события есть выбор без условий`, () => {
      const bad = era.events.filter((e) => e.choices && e.choices.length > 0 && e.choices.every((c) => (c.requirements ?? []).length > 0))
      expect(bad.map((e) => e.id)).toEqual([])
    })

    it(`${era.id}: ссылки на события и профессии существуют`, () => {
      const broken: string[] = []
      const walkCond = (c: Condition) => {
        if ('profession' in c) for (const p of c.profession) if (!profIds.has(p)) broken.push(`profession ${p}`)
        if ('any' in c) c.any.forEach(walkCond)
      }
      const walkEff = (e: Effect) => {
        if ('set_profession' in e && e.set_profession && !profIds.has(e.set_profession)) broken.push(`set_profession ${e.set_profession}`)
        if ('chance' in e) e.effects.forEach(walkEff)
      }
      for (const ev of era.events) {
        ev.conditions?.forEach(walkCond)
        ev.effects?.forEach(walkEff)
        for (const c of ev.choices ?? []) {
          c.requirements?.forEach(walkCond)
          c.effects?.forEach(walkEff)
          c.risk_roll?.on_success?.forEach(walkEff)
          c.risk_roll?.on_failure.forEach(walkEff)
          for (const d of c.delayed_effects ?? []) if (!eventIds.has(d.trigger_event)) broken.push(`trigger ${d.trigger_event}`)
        }
      }
      expect(broken).toEqual([])
    })

    it(`${era.id}: не меньше 8 профессий`, () => {
      expect(era.professions.length).toBeGreaterThanOrEqual(8)
    })
  }

  it('языки содержат одинаковые ключи', () => {
    const ru = new Set(allKeys('ru'))
    const en = new Set(allKeys('en'))
    expect([...ru].filter((k) => !en.has(k))).toEqual([])
    expect([...en].filter((k) => !ru.has(k))).toEqual([])
  })

  it('после подстановки не остаётся фигурных скобок', () => {
    for (const lang of LANGS) {
      for (const sex of ['m', 'f'] as const) {
        const t = createT(lang, { sex })
        const params = { n: 3, sex, psex: sex, region: 'x', cls: 'x', parent: 'x', child: 'x', who: 'x', cause: 'x', year: 'x', money: 1 }
        const left = allKeys(lang).filter((k) => /[{}]/.test(t(k, params)))
        expect(left).toEqual([])
      }
    }
  })
})
