const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, locale: 'ru-RU', reducedMotion: 'reduce' });
  await ctx.route(/fonts\.(googleapis|gstatic)|mc\.yandex/, r => r.abort());
  const got = [];
  await ctx.route('**/api/**', async (r) => {
    const req = r.request();
    if (req.method() === 'POST') { try { got.push(...JSON.parse(req.postData()).events) } catch {} }
    return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
  });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/ERR_FAILED/.test(m.text())) errs.push(m.text()) });
  await p.goto('http://localhost:4173/?ab=a'); await p.waitForSelector('.menu');
  await p.waitForSelector('.lever:not([disabled])', { timeout: 15000 });
  await p.click('.lever'); await p.waitForSelector('.spin-result'); await p.click('.spin-result .primary');
  await p.click('.reveal .primary');
  const t0 = Date.now();
  while (Date.now() - t0 < 150000) {
    if (await p.$('.summary')) break;
    if (await p.$('.modal')) {
      if (await p.$('.outcome')) { await p.click('.outcome .primary', { timeout: 1000 }).catch(() => {}); continue; }
      const opts = await p.$$('.choices .choice:not([disabled]), .choices .primary');
      if (opts.length) await opts[0].click({ timeout: 1000 }).catch(() => {});
      continue;
    }
    if (!(await p.$('.life')) && await p.$('.screen .primary')) await p.click('.screen .primary').catch(() => {});
    await p.click('.speed .chip:last-child', { timeout: 300 }).catch(() => {});
    await p.waitForTimeout(15);
  }
  if (await p.$('.sticky-actions')) await p.click('.sticky-actions .secondary');
  await p.waitForTimeout(300);
  await p.evaluate(() => { Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true }); document.dispatchEvent(new Event('visibilitychange')) });
  await p.waitForTimeout(1500);
  const count = {}; for (const e of got) count[e.name] = (count[e.name] || 0) + 1;
  console.log(count);
  console.log(JSON.stringify(got.find(e => e.name === 'life_end')));
  console.log(JSON.stringify(got.find(e => e.name === 'first_choice')));
  console.log({ errors: errs.slice(0, 5) });
  await b.close();
})();
