# Промо-ролик 1920×1080, 20 секунд

Ролик рисуется кодом из настоящей графики игры (сцены `src/pixel/scene.ts`, портреты `src/pixel/avatar.ts`):

- `tools/video/promo.ts` + `promo.html` — анимация, кадр рисует `renderFrame(t)`;
  посмотреть в браузере: `npx vite --port 5174` → `http://localhost:5174/tools/video/promo.html?lang=en&t=3.2`.
- `tools/video/soundtrack.mjs` — звук: бит 120 BPM, арпеджио и бас в ре мажоре, звуки рычага, барабанов,
  переходов, щелчков; громкость −14 LUFS.
- `tools/video/render.cjs` — покадровая съёмка в Playwright (60 кадров/с, параллельно по числу ядер).

Форматы: горизонтальный 1920×1080 и вертикальный 1080×1920 (`?o=v`, при съёмке `O=v node tools/video/render.cjs …`) —
у каждой сцены своя раскладка. Финал английской версии — ключевой арт (`tools/video/keyart-horizontal.webp`,
`keyart-vertical.webp`): вспышка света, медленный наезд, блик по логотипу; русская версия заканчивается текстовой
заставкой.

Сцены: 0–2 «One life» · 2–5,5 лотерея рождения (рычаг, три барабана) · 5,5–9,5 жизнь год за годом
(портрет взрослеет, лента событий) · 9,5–12,5 выбор в событии и итог · 12,5–15,5 13 миров ·
15,5–18 род продолжается · 18–20 финальная заставка. Переходы — ровно на долях бита.

## Пересобрать

```bash
npx vite --port 5174 &                       # сервер разработки
node tools/video/soundtrack.mjs promo.wav    # звук
node tools/video/render.cjs frames-en en 60  # кадры (≈ 1 мин на 4 ядрах); ru — русская версия
ffmpeg -framerate 60 -i frames-en/f%05d.jpg -i promo.wav -c:v libx264 -preset slow -crf 16 \
  -pix_fmt yuv420p -c:a aac -b:a 192k -shortest -movflags +faststart promo-en.mp4
```
