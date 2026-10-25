import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { ERA_META, loadAllEras } from '../src/content'
import { computeStats } from '../src/content/stats'
import { leftoverBraces, validateEra } from '../src/content/validate'
import { allKeys, loadAllTexts } from '../src/i18n'

const ERAS = await loadAllEras()
await loadAllTexts()

describe('Контент', () => {
  for (const era of Object.values(ERAS)) {
    it(`${era.id}: страна, события и тексты в порядке`, () => {
      expect(validateEra(era)).toEqual([])
    })
  }

  it('id событий и ключи текстов не повторяются между файлами одной папки', () => {
    const dir = path.join(__dirname, '../src/content')
    const dup: string[] = []
    for (const folder of fs.readdirSync(dir).filter((d) => fs.statSync(path.join(dir, d)).isDirectory())) {
      const files = fs.readdirSync(path.join(dir, folder))
      const seen = new Map<string, string>()
      for (const f of files.filter((x) => /^(ru|en|ui_ru|ui_en).*\.json$/.test(x))) {
        const lang = f.replace('ui_', '').slice(0, 2)
        for (const k of Object.keys(JSON.parse(fs.readFileSync(path.join(dir, folder, f), 'utf8')))) {
          const id = `${lang}:${k}`
          if (seen.has(id)) dup.push(`${folder}: ${id} в ${seen.get(id)} и ${f}`)
          seen.set(id, f)
        }
      }
      const ids = new Map<string, string>()
      for (const f of files.filter((x) => /^events.*\.json$/.test(x))) {
        for (const ev of JSON.parse(fs.readFileSync(path.join(dir, folder, f), 'utf8')) as { id: string }[]) {
          if (ids.has(ev.id)) dup.push(`${folder}: событие ${ev.id} в ${ids.get(ev.id)} и ${f}`)
          ids.set(ev.id, f)
        }
      }
    }
    expect(dup).toEqual([])
  })

  it('регионы и имена не путаются между странами', () => {
    const regions = new Map<string, string>()
    const names = new Map<string, string>()
    const bad: string[] = []
    for (const meta of Object.values(ERA_META)) {
      for (const r of meta.regions) {
        if (regions.has(r.id)) bad.push(`регион ${r.id} в ${regions.get(r.id)} и ${meta.id}`)
        regions.set(r.id, meta.id)
        for (const n of [...r.names.m, ...r.names.f]) {
          const text = `${n.ru}|${n.en}`
          if (names.has(n.id) && names.get(n.id) !== text) bad.push(`имя ${n.id}: ${names.get(n.id)} и ${text}`)
          names.set(n.id, text)
        }
      }
    }
    expect(bad).toEqual([])
  })

  it('языки содержат одинаковые ключи', () => {
    const ru = new Set(allKeys('ru'))
    const en = new Set(allKeys('en'))
    expect([...ru].filter((k) => !en.has(k))).toEqual([])
    expect([...en].filter((k) => !ru.has(k))).toEqual([])
  })

  it('после подстановки не остаётся фигурных скобок', () => {
    expect(leftoverBraces()).toEqual([])
  })

  it('числа в меню не устарели (npm run stats)', async () => {
    const actual = await computeStats()
    const saved = JSON.parse(fs.readFileSync(path.join(__dirname, '../src/content/stats.json'), 'utf8'))
    expect(saved).toEqual(actual)
  })
})

describe('Тексты стран', () => {
  it('страны не задают общие ключи без суффикса страны (иначе перетирают друг друга)', () => {
    const dir = path.join(__dirname, '../src/content')
    const owners = new Map<string, string[]>()
    for (const folder of fs.readdirSync(dir).filter((d) => fs.statSync(path.join(dir, d)).isDirectory())) {
      for (const f of fs.readdirSync(path.join(dir, folder)).filter((x) => /^(ui_)?ru.*\.json$/.test(x))) {
        for (const k of Object.keys(JSON.parse(fs.readFileSync(path.join(dir, folder, f), 'utf8')))) owners.set(k, [...(owners.get(k) ?? []), folder])
      }
    }
    expect([...owners].filter(([, v]) => new Set(v).size > 1).map(([k, v]) => `${k}: ${v.join(', ')}`)).toEqual([])
  })
})
