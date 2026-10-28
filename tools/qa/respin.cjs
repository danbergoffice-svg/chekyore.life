// Перекрутка барабана после результата: два раза можно (флаг respins = 2), третий — «Судьба решена», рычаг замирает.
const { chromium } = require('playwright');
const dir = process.env.SHOTS || 'shots';
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, locale: 'ru-RU', deviceScaleFactor: 2 });
  await ctx.route(/fonts\.(googleapis|gstatic)|mc\.yandex/, r => r.abort());
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/ERR_FAILED/.test(m.text())) errs.push(m.text()) });
  const events = []; p.on('request', r => { if (/\/api\/events/.test(r.url())) events.push(r.postData() || '') });
  await p.goto('http://localhost:5174/?ab=a'); await p.waitForSelector('.menu .slot-machine');
  const results = [];
  await p.click('.spin-button');
  for (let i = 0; i < 3; i++) {
    await p.waitForSelector('.spin-result .primary:not([disabled])', { timeout: 15000 });
    results.push(await p.$eval('.spin-result p', e => e.innerText));
    const again = await p.$('.spin-result .secondary');
    const lever = await p.$eval('.lever', e => e.disabled);
    console.log(i, '| кнопка:', again ? await again.innerText() : '—', '| рычаг выключен:', lever, '| итог:', results[i]);
    if (i === 0) await (await p.$('.menu .spin')).screenshot({ path: `${dir}/respin-1.png` });
    if (!again) break;
    // Вторую перекрутку — рычагом, первую — кнопкой.
    if (i === 1) await p.click('.lever'); else await again.click();
    await p.waitForTimeout(300);
  }
  console.log('«Судьба решена»:', await p.$eval('.spin-result', e => e.innerText.includes('Судьба решена')).catch(() => false));
  await (await p.$('.menu .spin')).screenshot({ path: `${dir}/respin-end.png` });
  await p.click('.spin-result .primary'); await p.waitForSelector('.reveal');
  console.log('после перекруток — экран семьи:', !!(await p.$('.reveal')), 'разных итогов:', new Set(results).size);
  console.log({ errors: errs.slice(0, 5) });
  await b.close();
})();
