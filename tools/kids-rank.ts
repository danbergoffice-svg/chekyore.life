// Сложность детских головоломок: на каждом уровне - средняя длина эталона (par), размер состояния, время генерации.
// Запуск: npx vite-node tools/kids-rank.ts [зёрен=30]
import { KIDS_PUZZLES } from '../src/kids'
import { makeRng } from '../src/kids/rng'

const seeds = Number(process.argv[2] ?? 30)
const rows: string[] = []
for (const p of KIDS_PUZZLES) {
  const cells: string[] = []
  for (const lvl of [1, 2, 3]) {
    let par = 0
    let ms = 0
    for (let s = 1; s <= seeds; s++) {
      const t = performance.now()
      const L = p.logic.generate(lvl, makeRng(s * 7919 + lvl), (['body', 'mind', 'people'] as const)[s % 3])
      ms += performance.now() - t
      par += L.par
    }
    cells.push(`${(par / seeds).toFixed(1)}`)
  }
  const L1 = p.logic.generate(1, makeRng(1), 'mind')
  rows.push(`${p.id}\t${p.era}\t${cells.join('\t')}\t${JSON.stringify(L1.start).length}\t${p.text.ru.rule}`)
}
console.log('id\tera\tpar1\tpar2\tpar3\tstate1\tправило')
console.log(rows.join('\n'))
