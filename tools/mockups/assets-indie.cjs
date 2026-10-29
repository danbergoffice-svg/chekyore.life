// Ассеты для макетов «как инди-игра» (29.10): сцены трёх стран и портреты с дев-сервера (npx vite --port 5175).
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
      'ind-rus-land': scene({ region: 'novgorod', seed: 'menu:nov', scene: { place: 'landmark', time: 'dawn', people: 3, props: ['sun'] }, season: 0.05, weather: 'snow', art: 'full' }),
      'ind-rus-home': scene({ region: 'novgorod', seed: 'ev:nov', scene: { place: 'home', time: 'night', people: 3, props: ['moon'] }, season: 0.05, art: 'full' }),
      'ind-egy-land': scene({ region: 'thebes', seed: 'menu:thebes', scene: { place: 'landmark', time: 'sunset', people: 3, props: ['sun'] }, art: 'full' }),
      'ind-egy-home': scene({ region: 'thebes', seed: 'ev:thebes', scene: { place: 'home', time: 'day', people: 3, props: ['sun'] }, art: 'full' }),
      'ind-byz-land': scene({ region: 'constantinople', seed: 'menu:byz', scene: { place: 'landmark', time: 'sunset', people: 3, props: ['moon'] }, art: 'full' }),
      'ind-byz-home': scene({ region: 'constantinople', seed: 'ev:byz', scene: { place: 'home', time: 'night', people: 3, props: ['moon'] }, art: 'full' }),
      'ind-av-rus': avatar({ region: 'novgorod', sex: 'f', age: 0, seed: 'nov', cls: 'peasant', body: 0, happiness: 60 }),
      'ind-av-egy': avatar({ region: 'thebes', sex: 'm', age: 0, seed: 'teb', cls: 'craftsman', body: 0, happiness: 60 }),
      'ind-av-byz': avatar({ region: 'constantinople', sex: 'f', age: 0, seed: 'byz', cls: 'trader', body: 0, happiness: 60 }),
    }
  })
  for (const [k, v] of Object.entries(out)) fs.writeFileSync(path.join(__dirname, 'assets', `${k}.png`), Buffer.from(v.split(',')[1], 'base64'))
  console.log(Object.keys(out).join(' '))
  await b.close()
})()
