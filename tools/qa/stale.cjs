// Воспроизведение зависания «Готовим мир…»: файлы страны не грузятся (как после обновления сайта на Cloudflare,
// который на отсутствующий файл отдаёт главную страницу). Проверяем: 1) автоперезагрузка спасает;
// 2) если и после неё не грузится — видно сообщение и кнопку «Попробовать ещё раз», которая работает.
const { chromium } = require('playwright');
const dir = process.env.SHOTS || 'shots';
async function run(mode) {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 380, height: 760 }, locale: 'ru-RU', reducedMotion: 'reduce' });
  await ctx.route(/fonts\.(googleapis|gstatic)|mc\.yandex/, (r) => r.abort());
  let broken = mode === 'always' ? 1e9 : 1;
  // Любой файл с контентом стран отдаём как HTML-страницу (поведение Cloudflare для отсутствующих файлов).
  await ctx.route(/assets\/c-.*\.js/, async (r) => {
    if (broken > 0) {
      broken--;
      return r.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><html><body>index</body></html>' });
    }
    return r.continue();
  });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto('http://localhost:4173/'); await p.waitForSelector('.menu');
  await p.click('.menu .stack button:last-child'); await p.click('.screen > .primary');
  let outcome = 'stuck';
  for (let i = 0; i < 40; i++) {
    if (await p.$('.lever:not([disabled])')) { outcome = 'ready'; break }
    if (await p.$('.load-problem')) { outcome = 'error-shown'; break }
    if (await p.$('.menu')) { // автоперезагрузка вернула на главную — начинаем заново
      outcome = 'reloaded'
      await p.click('.menu .stack button:last-child'); await p.click('.screen > .primary');
    }
    await p.waitForTimeout(500);
  }
  if (outcome === 'reloaded') {
    for (let i = 0; i < 30 && !(await p.$('.lever:not([disabled])')); i++) await p.waitForTimeout(500);
    outcome = (await p.$('.lever:not([disabled])')) ? 'reloaded→ready' : 'reloaded→stuck';
  }
  if (outcome === 'error-shown') {
    await p.screenshot({ path: `${dir}/load-error.png` });
    broken = 0; // связь «вернулась»
    await p.click(".load-problem .primary"); await p.waitForTimeout(1500); if (await p.$(".menu")) { await p.click(".menu .stack button:last-child"); await p.click(".screen > .primary") }
    for (let i = 0; i < 30 && !(await p.$('.lever:not([disabled])')); i++) await p.waitForTimeout(500);
    outcome += (await p.$('.lever:not([disabled])')) ? ' → retry ok' : ' → retry stuck';
  }
  console.log(mode, outcome, errs.slice(0, 2));
  await b.close();
}
(async () => { await run('once'); await run('always'); })();
