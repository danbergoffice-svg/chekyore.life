// Первый экран на телефоне: видны ли барабан и кнопка без прокрутки (видимая высота с панелями браузера).
// Оба варианта A/B: a — барабан в меню, b — кнопка «Новая жизнь» (вариант задаём подменой ab_buckets).
const { chromium } = require('playwright');
const dir = process.env.SHOTS || 'shots';
(async () => {
  const b = await chromium.launch();
  for (const variant of ['a', 'b']) {
    for (const [w, h, loc] of [[390, 664, 'ru-RU'], [360, 640, 'ru-RU'], [412, 760, 'en-US']]) {
      const ctx = await b.newContext({ viewport: { width: w, height: h }, locale: loc, deviceScaleFactor: 2 });
      await ctx.route(/\/flags\.json/, async (r) => { const f = await (await r.fetch()).json(); r.fulfill({ json: { ...f, ab_buckets: { [variant]: 1 } } }) });
      const p = await ctx.newPage();
      await p.goto('http://localhost:5174/'); await p.waitForSelector('.menu .title-block'); await p.waitForTimeout(400);
      const sel = variant === 'a' ? '.spin-button' : '.menu .stack .primary';
      const r = await p.evaluate((s) => ({ btn: document.querySelector(s)?.getBoundingClientRect().bottom ?? -1, drum: document.querySelector('.slot-machine')?.getBoundingClientRect().top ?? -1, title: document.querySelector('.game-title').getBoundingClientRect().height }), sel);
      console.log(`${variant} ${w}×${h}: кнопка до ${Math.round(r.btn)} → ${r.btn > 0 && r.btn <= h ? 'видна' : 'НЕ видна'}${variant === 'a' ? `, барабан с ${Math.round(r.drum)}` : ''}, название ${Math.round(r.title)} px`);
      await p.screenshot({ path: `${dir}/fold-${variant}-${w}.png` });
      await ctx.close();
    }
  }
  await b.close();
})();
