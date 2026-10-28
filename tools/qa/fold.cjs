// Первый экран на телефоне: барабан и кнопка «Кем будешь ты? — Крути» видны без прокрутки.
// Высоты — видимая часть страницы с панелями браузера (Safari на iPhone, Chrome на Android).
const { chromium } = require('playwright');
const dir = process.env.SHOTS || 'shots';
const DEVICES = [
  ['iPhone SE', 375, 548], ['iPhone 13 mini', 375, 629], ['iPhone 12–15', 390, 664], ['iPhone 15 Pro Max', 430, 739],
  ['Android мал.', 360, 640], ['Galaxy S', 360, 660], ['Pixel', 412, 732], ['Android бол.', 412, 800],
];
(async () => {
  const b = await chromium.launch();
  let bad = 0;
  for (const lang of ['ru-RU', 'en-US']) {
    for (const [name, w, h] of DEVICES) {
      const ctx = await b.newContext({ viewport: { width: w, height: h }, locale: lang, deviceScaleFactor: 2 });
      const p = await ctx.newPage();
      await p.goto((process.env.BASE || 'http://localhost:5174') + '/'); await p.waitForSelector('.menu .slot-machine'); await p.waitForTimeout(400);
      const r = await p.evaluate(() => {
        const box = (s) => document.querySelector(s).getBoundingClientRect()
        return { drum: box('.slot-machine').bottom, btn: box('.spin-button').bottom, btnH: box('.spin-button').height, scroll: document.documentElement.scrollWidth > innerWidth }
      });
      const ok = r.btn <= h && !r.scroll
      if (!ok) bad++
      console.log(`${lang} ${name.padEnd(17)} ${w}×${h}: барабан до ${Math.round(r.drum)}, кнопка до ${Math.round(r.btn)} (высота ${Math.round(r.btnH)}) → ${ok ? 'видно' : 'НЕ ВИДНО'}`);
      if (lang === 'ru-RU' && (w === 375 || w === 390)) await p.screenshot({ path: `${dir}/fold-${w}x${h}.png` });
      await ctx.close();
    }
  }
  console.log(bad ? `не помещается: ${bad}` : 'везде помещается');
  await b.close();
})();
