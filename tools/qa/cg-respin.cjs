// Сборка CrazyGames: после трёх бесплатных вращений барабана — «Spin again — watch an ad» (реклама за награду).
// Нужен `npx vite preview --outDir dist-crazygames --port 4174`; SDK — локальный (?useLocalSdk=true).
const { chromium } = require('playwright');
const dir = process.env.SHOTS || 'shots';
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, locale: 'en-US', deviceScaleFactor: 2 });
  // SDK портала из этой сети не грузится — подставляем имитацию: реклама «идёт» 1,5 с и досматривается до конца.
  if (process.env.REAL_SDK !== '1') await ctx.route(/crazygames-sdk-v3\.js/, r => r.fulfill({ contentType: 'application/javascript', body: `
    window.CrazyGames = { SDK: {
      environment: 'local',
      init: async () => {},
      game: { loadingStart() { console.log('[stub] loadingStart') }, loadingStop() { console.log('[stub] loadingStop') }, gameplayStart() { console.log('[stub] gameplayStart') }, gameplayStop() { console.log('[stub] gameplayStop') }, happytime() {}, inviteLink: () => 'https://example.invalid', settings: {} },
      ad: { requestAd(type, cb) { console.log('[stub] requestAd ' + type); cb.adStarted(); setTimeout(() => { console.log('[stub] adFinished'); cb.adFinished() }, 1500) } },
      data: { getItem: () => null, setItem() {}, removeItem() {} },
    } }` }));
  const p = await ctx.newPage();
  const logs = []; p.on('console', m => { const t = m.text(); if (/CrazyGames|stub/.test(t)) logs.push(t) });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:4174/?useLocalSdk=true'); await p.waitForSelector('.menu .slot-machine', { timeout: 30000 });
  await p.click('.spin-button');
  for (let i = 0; i < 3; i++) {
    await p.waitForSelector('.spin-result .primary:not([disabled])', { timeout: 20000 });
    const again = await p.$('.spin-result .secondary:not(.ad-respin)');
    if (!again) break;
    await again.click(); await p.waitForTimeout(300);
  }
  await p.waitForSelector('.ad-respin', { timeout: 20000 });
  console.log('после 3 вращений:', await p.$eval('.ad-respin', e => e.innerText), '| рычаг выключен:', await p.$eval('.lever', e => e.disabled));
  await (await p.$('.menu .spin')).screenshot({ path: `${dir}/cg-ad-button.png` });
  const before = await p.$eval('.spin-result p', e => e.innerText);
  await p.click('.ad-respin');
  await p.waitForTimeout(1500);
  await p.screenshot({ path: `${dir}/cg-ad-playing.png` });
  // Локальный SDK показывает заглушку рекламы; ждём, пока барабан снова выдаст результат.
  let after = before;
  for (let i = 0; i < 60; i++) {
    const r = await p.$('.spin-result .primary:not([disabled])');
    if (r) { after = await p.$eval('.spin-result p', e => e.innerText); if (after !== before) break }
    await p.waitForTimeout(500);
  }
  console.log('после рекламы новый результат:', after !== before, '|', after);
  console.log('кнопка снова «за рекламу»:', !!(await p.$('.ad-respin')), '| тост:', await p.$eval('.toast', e => e.innerText).catch(() => '—'));
  console.log('SDK:', logs.slice(-8));
  console.log({ errors: errs.slice(0, 5) });
  await b.close();
})();
