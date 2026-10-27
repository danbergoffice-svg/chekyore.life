# Иллюстрации ключевых моментов (ТЗ графики, G3)

Файлы: `src/art/<папка страны>/<момент>.png` (или `.webp`). Папки — как у контента: `rus`, `europe`, `byzantium`,
`islam`, `china`, `japan`, `india`, `ethiopia`, `west_africa`, `maya`, `americas`, `ancient_east`, `e03`.

Моменты (20 на страну): `birth`, `childhood`, `wedding`, `child_born`, `old_age`, `study`, `work`, `market`, `rich`,
`poor`, `rite`, `pilgrimage`, `court`, `war`, `plague`, `famine`, `fire`, `funeral`, `dream`, `primer`.

Требования (проверяет `npm run art`):

- 256×144 точек, пиксель-арт в исходном размере (увеличение — только в CSS);
- PNG-8 с палитрой до 32 цветов (палитра стиля страны — `src/pixel/art.ts`, `ART[стиль].palette`) или WebP lossless;
- не больше 30 КБ;
- права разрешают коммерческое использование (сайт, Яндекс Игры, CrazyGames).

Картинка подключается сама: событие получает момент из поля `image_slot` или — у вех, поворотов, исторических
событий и бедствий — по id и месту сцены (`src/pixel/illustrations.ts`, `momentOf`). Пока картинки нет,
показывается процедурная сцена. Промпты для художника или ИИ — `npm run prompts` (с строкой стиля страны).
