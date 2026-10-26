// Смертельные исходы событий — для сценаристов текстов «выжил чудом» (ТЗ P1).
// npm run deadly → docs/deadly_outcomes.csv: страна, событие, выбор, причина, шанс, текст исхода (ru).
import fs from 'node:fs'
import path from 'node:path'
import { RESCUE_GROUP } from '../src/engine/rules'

const dir = path.join(__dirname, '../src/content')
const rows: string[][] = [['country', 'event', 'choice', 'branch', 'cause', 'chance', 'text_ru', 'rescue_key']]

for (const folder of fs.readdirSync(dir).filter((d) => fs.statSync(path.join(dir, d)).isDirectory())) {
  const ru: Record<string, string> = {}
  for (const f of fs.readdirSync(path.join(dir, folder)).filter((x) => /^ru.*\.json$/.test(x))) Object.assign(ru, JSON.parse(fs.readFileSync(path.join(dir, folder, f), 'utf8')))
  for (const f of fs.readdirSync(path.join(dir, folder)).filter((x) => /^events.*\.json$/.test(x))) {
    for (const ev of JSON.parse(fs.readFileSync(path.join(dir, folder, f), 'utf8'))) {
      const walk = (x: unknown, choice: string, branch: string, p: number) => {
        if (Array.isArray(x)) return x.forEach((y) => walk(y, choice, branch, p))
        if (!x || typeof x !== 'object') return
        const o = x as Record<string, unknown>
        if (typeof o.kill === 'string') {
          const key = choice ? `ev.${ev.id}.${choice}${branch ? '.' + branch : ''}` : `ev.${ev.id}.text`
          rows.push([folder, ev.id, choice, branch, o.kill, String(Math.round(p * 100) / 100), ru[key] ?? '', `diary.rescued.${RESCUE_GROUP[o.kill] ?? 'other'}`])
        }
        for (const [k, v] of Object.entries(o)) {
          if (k === 'choices') (v as { id: string }[]).forEach((c) => walk(c, c.id, '', 1))
          else if (k === 'on_success') walk(v, choice, 'success', p)
          else if (k === 'on_failure') walk(v, choice, 'failure', p)
          else if (k === 'effects' && typeof o.chance === 'number') walk(v, choice, branch, p * o.chance)
          else walk(v, choice, branch, p)
        }
      }
      walk(ev, '', '', 1)
    }
  }
}
const csv = rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(',')).join('\n')
fs.writeFileSync(path.join(__dirname, '../docs/deadly_outcomes.csv'), '﻿' + csv + '\n')
console.log(`${rows.length - 1} смертельных исходов → docs/deadly_outcomes.csv`)
