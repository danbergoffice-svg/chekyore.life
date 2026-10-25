// Сколько всего в игре: события, исторические события, вести, веры. Пишет src/content/stats.json для меню.
// Запуск: npm run stats (тест контента проверяет, что файл не устарел).
import fs from 'node:fs'
import { computeStats } from '../src/content/stats'

computeStats().then((stats) => {
  fs.writeFileSync('src/content/stats.json', JSON.stringify(stats, null, 2) + '\n')
  console.log(stats)
})
