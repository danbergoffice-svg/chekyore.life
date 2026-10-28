// Ассеты для макетов: настоящие пиксельные сцены и портрет с дев-сервера (npx vite --port 5175).
const { chromium } = require('playwright')
const fs = require('fs')
const path = require('path')
;(async () => {
  const b = await chromium.launch()
  const p = await b.newPage()
  p.on('pageerror', (e) => console.log('ERR', e.message))
  await p.goto('http://localhost:5175/tools/scenes.html')
  const out = await p.evaluate(async () => {
    const { drawScene, W, H } = await import('/src/pixel/scene.ts')
    const { drawAvatar, AW, AH } = await import('/src/pixel/avatar.ts')
    const scene = (input, t = 2.5) => {
      const cv = document.createElement('canvas'); cv.width = W; cv.height = H
      drawScene(cv.getContext('2d'), input, t); return cv.toDataURL()
    }
    const avatar = (o) => {
      const cv = document.createElement('canvas'); cv.width = AW; cv.height = AH
      drawAvatar(cv.getContext('2d'), o); return cv.toDataURL()
    }
    return {
      'scene-kyoto': scene({ region: 'kyoto', seed: 'menu:kyoto', scene: { place: 'landmark', time: 'dawn', people: 3, props: ['sun'] } }),
      'scene-kyoto-sunset': scene({ region: 'kyoto', seed: 'menu:kyoto2', scene: { place: 'landmark', time: 'sunset', people: 2, props: ['sun'] } }),
      'scene-echigo-snow': scene({ region: 'echigo', seed: 'card:echigo', scene: { place: 'yard', time: 'day', people: 2, props: [] }, season: 0.05, weather: 'snow', cast: { members: [{ role: 'hero', sex: 'f', age: 58, seed: 'matsu' }], animals: ['dog'], home: 2 } }),
      'scene-echigo-street': scene({ region: 'echigo', seed: 'card:echigo-street', scene: { place: 'street', time: 'sunset', people: 4, props: ['sun'] }, art: 'full' }),
      'scene-echigo-dawn': scene({ region: 'echigo', seed: 'card:echigo-dawn', scene: { place: 'landmark', time: 'dawn', people: 2, props: ['sun'] }, art: 'full' }),
      'avatar-matsu': avatar({ region: 'echigo', sex: 'f', age: 58, seed: 'matsu', cls: 'craftsman', body: 0, married: true, happiness: 70 }),
      'avatar-matsu-young': avatar({ region: 'echigo', sex: 'f', age: 20, seed: 'matsu', cls: 'peasant', body: 0, married: true, happiness: 60 }),
    }
  })
  for (const [k, v] of Object.entries(out)) fs.writeFileSync(path.join(__dirname, 'assets', `${k}.png`), Buffer.from(v.split(',')[1], 'base64'))
  console.log(Object.keys(out).join(' '))
  await b.close()
})()
