// Сборка CrazyGames: имя и аватар игрока (User module), гость, вход посреди игры; блокировщик рекламы - кнопки
// «за рекламу» нет, вместо неё пояснение; только английский (нет переключателя языка). Имитация SDK, как в cg-respin.cjs.
// Нужен `npx vite preview --outDir dist-crazygames --port 4174`.
const { chromium } = require('playwright')
const dir = process.env.SHOTS || 'shots'
const AVATAR = 'data:image/svg+xml;utf8,' + encodeURIComponent("<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24'><rect width='24' height='24' fill='%23c25a3c'/></svg>")
const stub = (user, adblock) => `
  window.__auth = []
  window.CrazyGames = { SDK: {
    environment: 'local',
    init: async () => {},
    game: { loadingStart() {}, loadingStop() {}, gameplayStart() { console.log('[stub] gameplayStart') }, gameplayStop() { console.log('[stub] gameplayStop') }, happytime() {}, inviteLink: () => '', settings: {} },
    ad: { requestAd(type, cb) { cb.adError('no fill') }, hasAdblock: async () => ${adblock} },
    user: { isUserAccountAvailable: true, getUser: async () => (${JSON.stringify(user)}), addAuthListener(cb) { window.__auth.push(cb) } },
    data: { getItem: () => null, setItem() {}, removeItem() {} },
  } }`
async function run(label, user, adblock, shot) {
  const b = await chromium.launch()
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, locale: 'ru-RU', deviceScaleFactor: 2 })
  await ctx.route(/crazygames-sdk-v3\.js/, (r) => r.fulfill({ contentType: 'application/javascript', body: stub(user, adblock) }))
  const p = await ctx.newPage()
  const errs = []
  p.on('pageerror', (e) => errs.push(e.message))
  await p.goto('http://localhost:4174/?useLocalSdk=true')
  await p.waitForSelector('.menu .slot-machine', { timeout: 30000 })
  await p.waitForTimeout(500)
  const chip = await p.$eval('.player-chip', (e) => e.innerText).catch(() => 'НЕТ')
  const langs = await p.$$eval('.lang-switch button', (bs) => bs.length)
  const title = await p.$eval('.game-title', (e) => e.innerText)
  await p.screenshot({ path: `${dir}/cg-${shot}.png` })
  // Три бесплатных вращения - потом кнопка «за рекламу» или пояснение.
  await p.click('.spin-button')
  for (let i = 0; i < 3; i++) {
    await p.waitForSelector('.spin-result .primary:not([disabled])', { timeout: 20000 })
    const again = await p.$('.spin-result .secondary:not(.ad-respin)')
    if (!again) break
    await again.click()
    await p.waitForTimeout(300)
  }
  await p.waitForSelector('.spin-result .primary:not([disabled])', { timeout: 20000 })
  const adBtn = await p.$eval('.ad-respin', (e) => e.innerText + (e.querySelector('svg.icon') ? ' [значок видео]' : '')).catch(() => 'нет')
  const note = await p.$eval('.spin-result p.muted', (e) => e.innerText).catch(() => '')
  await (await p.$('.menu .spin')).screenshot({ path: `${dir}/cg-${shot}-spin.png` })
  // Вход посреди игры: Auth Listener.
  console.log('auth listeners:', await p.evaluate(() => (window.__auth || 'нет').length)); await p.evaluate(() => (window.__auth || []).forEach((cb) => cb({ username: 'NewLogin' })))
  await p.waitForTimeout(300)
  const chip2 = await p.$eval('.player-chip', (e) => e.innerText).catch(() => 'НЕТ')
  console.log(`${label}: чип «${chip}» → после входа «${chip2}» | языков в переключателе: ${langs} | заголовок: ${title} | кнопка за рекламу: ${adBtn} | пояснение: ${note || '-'} | ошибки: ${errs.length ? errs.join('; ') : 'нет'}`)
  await b.close()
}
;(async () => {
  await run('Вошедший', { username: 'Danny_Berg', profilePictureUrl: AVATAR }, false, 'user')
  await run('Гость + блокировщик', null, true, 'guest-adblock')
})()
