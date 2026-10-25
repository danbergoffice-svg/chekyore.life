// Подбор mortality.calibration: средний возраст при исторической смертности должен совпасть с lifeExpectancy.
// Запуск: npx vite-node tools/calibrate.ts E03 CHN …
import fs from 'node:fs'
import { ERA_FOLDER, loadEra } from '../src/content'
import { autoplay } from '../src/engine/game'
import { newLife } from '../src/engine/life'
async function main() {
  for (const id of process.argv.slice(2)) {
    const era = await loadEra(id)
    for (let iter = 0; iter < 4; iter++) {
      let sum = 0
      const n = 1500
      for (let i = 0; i < n; i++) sum += autoplay(newLife(era, { mode: 'full', mortality: 'historical', softenHeavy: false }, 90000 + i), era).hero.age
      const mean = sum / n
      const cal = era.mortality.calibration ?? 1
      console.log(id, iter, 'mean', mean.toFixed(2), 'target', era.lifeExpectancy, 'cal', cal)
      if (Math.abs(mean - era.lifeExpectancy) < 0.6) break
      const next = Math.round(cal * Math.pow(mean / era.lifeExpectancy, 1.6) * 100) / 100
      era.mortality.calibration = next
      const p = `src/content/${ERA_FOLDER[id]}/era.json`
      const j = JSON.parse(fs.readFileSync(p, 'utf8'))
      j.mortality.calibration = next
      fs.writeFileSync(p, JSON.stringify(j, null, 2) + '\n')
    }
  }
}
main()
