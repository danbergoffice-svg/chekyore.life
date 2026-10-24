import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { ERAS } from '../src/content'
import { allKeys, createT, hasKey, LANGS } from '../src/i18n'
import { SCENE_PLACES, SCENE_PROPS, SCENE_TIMES, TOPICS } from '../src/engine/types'
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
    for (const l of era.lifestyle) {
      required.push(`lifestyle.${l.id}`)
      for (const o of l.options) required.push(`lifestyle.${l.id}.${o.id}`, `lifestyle.${l.id}.${o.id}.desc`)
    }
    for (const n of era.news) required.push(`news.${n.id}`)
    for (const p of era.professions) required.push(`prof.${p.id}.as`)
    for (const ev of era.events) {
      if (!ev.moment) required.push(`ev.${ev.id}.title`)
      if (ev.variants) for (let i = 1; i <= ev.variants; i++) required.push(`ev.${ev.id}.text.${i}`)
      else required.push(`ev.${ev.id}.text`)
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

    it(`${era.id}: сцены, темы и моменты описаны правильно`, () => {
      const bad: string[] = []
      for (const ev of era.events) {
        if (!ev.scene) bad.push(`${ev.id}: нет scene`)
        if (ev.scene?.place && !(SCENE_PLACES as readonly string[]).includes(ev.scene.place)) bad.push(`${ev.id}: place ${ev.scene.place}`)
        if (ev.scene?.time && !(SCENE_TIMES as readonly string[]).includes(ev.scene.time)) bad.push(`${ev.id}: time ${ev.scene.time}`)
        for (const p of ev.scene?.props ?? []) if (!(SCENE_PROPS as readonly string[]).includes(p)) bad.push(`${ev.id}: prop ${p}`)
        if (ev.topic && !(TOPICS as readonly string[]).includes(ev.topic)) bad.push(`${ev.id}: topic ${ev.topic}`)
        if (ev.moment && ev.choices?.length) bad.push(`${ev.id}: у момента не должно быть выборов`)
        if (ev.choices && (ev.choices.length === 1 || ev.choices.length > 4)) bad.push(`${ev.id}: выборов должно быть 2–4`)
        const moves = JSON.stringify(ev).match(/"move":"(\w+)"/g) ?? []
        for (const m of moves) {
          const place = m.split('"')[3]
          for (const lang of LANGS) if (!hasKey(lang, `place.${place}`)) bad.push(`${ev.id}: нет текста place.${place} (${lang})`)
        }
      }
      expect(bad).toEqual([])
    })

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

    it(`${era.id}: вести из мира описаны правильно`, () => {
      const bad = era.news.filter((n) => !Number.isInteger(n.year) || n.year === 0 || n.year < era.years[0] - 50 || n.year > era.years[1] || !['confirmed', 'reconstructed', 'disputed'].includes(n.confidence))
      expect(bad.map((n) => n.id)).toEqual([])
      const ids = era.news.map((n) => n.id)
      expect(ids.length).toBe(new Set(ids).size)
    })

    it(`${era.id}: не меньше 8 профессий`, () => {
      expect(era.professions.length).toBeGreaterThanOrEqual(8)
    })
  }

  it('id событий и ключи текстов не повторяются между файлами', () => {
    const dir = path.join(__dirname, '../src/content')
    const dup: string[] = []
    for (const era of fs.readdirSync(dir).filter((d) => fs.statSync(path.join(dir, d)).isDirectory())) {
      const files = fs.readdirSync(path.join(dir, era))
      const seen = new Map<string, string>()
      for (const f of files.filter((x) => /^(ru|en).*\.json$/.test(x))) {
        const lang = f.slice(0, 2)
        for (const k of Object.keys(JSON.parse(fs.readFileSync(path.join(dir, era, f), 'utf8')))) {
          const id = `${lang}:${k}`
          if (seen.has(id)) dup.push(`${id} в ${seen.get(id)} и ${f}`)
          seen.set(id, f)
        }
      }
      const ids = new Map<string, string>()
      for (const f of files.filter((x) => /^events.*\.json$/.test(x))) {
        for (const ev of JSON.parse(fs.readFileSync(path.join(dir, era, f), 'utf8')) as { id: string }[]) {
          if (ids.has(ev.id)) dup.push(`событие ${ev.id} в ${ids.get(ev.id)} и ${f}`)
          ids.set(ev.id, f)
        }
      }
    }
    expect(dup).toEqual([])
  })

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
        const params = { n: 3, sex, psex: sex, npc_sex: sex, npc: 'x', place: 'x', region: 'x', cls: 'x', parent: 'x', child: 'x', who: 'x', cause: 'x', year: 'x', money: 1, name: 'x', adult: 1, list: 'x', prof: 'x', grand: 2, alive: 1, side: 'x', mood: 1, skill: 'x', years: 'x', archetype: 'x', diff: 1, cost: 'x' }
        const left = allKeys(lang).filter((k) => /[{}]/.test(t(k, params)))
        expect(left).toEqual([])
      }
    }
  })
})
