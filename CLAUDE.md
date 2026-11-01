# Тысячи жизней — памятка для новой сессии

Браузерная игра «Тысячи жизней / Thousands of Lives»: одна жизнь в случайной стране и эпохе до эпохи
Великих открытий. Сайт https://thousands.life (Cloudflare Pages). Vite 6 + TypeScript + Preact.
Владелец пишет по-русски — отвечать по-русски, просто и по делу.

## Как развернуть проект из архива

```bash
unzip thousands-project.zip -d ~ && cd ~/chekyore.life   # внутри есть .git со всей историей
npm install
npm test            # ~3–4 мин: контент, симуляция тысяч жизней, калибровка смертности
npm run build       # dist/ + dist/_worker.js (приёмник аналитики)
```

Ветка — `world`. GitHub-аккаунт владельца (danbergoffice-svg) заблокирован: `git push` отвечает 403.
Коммитить локально; если появится новый репозиторий — добавить его как origin и запушить `world`.

## Где что лежит

- `src/engine/` — движок (seed-воспроизводимый): `life.ts` (рождение, наследник, лотерея рождения),
  `game.ts` (год, события, смертность, первый выбор), `rules.ts` (условия, эффекты, вера, имена, «выжил чудом»),
  `report.ts` (итоги жизни), `household.ts` (дом и животные).
- `src/content/` — 13 стран-папок (`era.json`, `ui_ru/en.json` сразу; `events*`, `news*`, `primer*`, `ru*/en*`
  лениво) и `common/` (общие события и тексты). Местное событие с тем же id заменяет общее.
  Правила — `docs/CONTENT_GUIDE.md`, `docs/COUNTRY_PACK.md`, `docs/VARIANTS_BRIEF.md`.
- `src/i18n/` — тексты интерфейса RU/EN; цепочка ключей `key.<регион>` → `key.<вера>` → `key.<группа веры>` →
  `key.<страна>` → `key`; `{g:он|она}` — род героя.
- `src/platform/` — **единственное** место для localStorage/IndexedDB, Метрики, «Поделиться», флагов, языка,
  рекламы и лидербордов (`web.ts`, `crazygames.ts`, `yandex.ts` — заглушка до этапа 4, `local.ts` — общее хранилище).
  В остальном коде прямых вызовов нет. `EXTERNAL` (константа сборки) — можно ли ссылки наружу, отзывы, свой приёмник.
- CrazyGames: `npm run build:crazygames` → `crazygames.zip` (без внешних запросов, кроме SDK портала; проверяет
  `tools/pack-crazygames.mjs`). Подробно — `docs/CRAZYGAMES.md`.
- `src/telemetry.ts` — события аналитики игры; список — `docs/ANALYTICS.md`.
- `src/ui/` — экраны Preact; `src/pixel/` — пиксельные сцены и портрет героя (`avatar.ts`: 32×40, возраст, пол,
  телосложение `hero.body` −3…3 от еды/болезней/бедности — считается в `bodyYear` в `game.ts`, причёски, уборы
  и одежда по стилю края и сословию; галерея — `tools/avatars.html?regions=…&ages=…&body=…&zoom=4`).
- `worker/index.ts` — свой приёмник (`/api/events`, `/api/feedback`, `/api/time`, `/api/telegram`, `/admin`,
  `/admin/export`), собирается в `dist/_worker.js` (Pages advanced mode). Расчёты отчётов — `worker/stats.ts`
  (общие для /admin, бота и утренней сводки), бот — `worker/telegram.ts`, отдельный Worker со сводкой по cron —
  `worker/digest/` (`npx wrangler deploy` из папки). Проверка — `npm run test:worker`. Подключение — `docs/BACKEND.md`.
- `public/flags.json` — удалённые настройки (темп года, главы, первая жизнь, A/B); значения по умолчанию —
  `src/platform/types.ts`.
- `tools/` — `check.ts`, `stats.ts` (`npm run stats` после правок контента — иначе падает тест),
  `calibrate.ts` (смертность), `deadly.ts` (CSV смертельных исходов), `og.html` (картинка для соцсетей),
  `gen/first_choice.py` (генератор пула первых выборов), `qa/*.cjs` (проверки в браузере Playwright:
  `npx vite --port 5174` или `npx vite preview --port 4173`, затем `node tools/qa/u.cjs`; снимки в `shots/`).
- Ранние браки по сговору — `common/events_marriage.json` (обручение в детстве, свадьба девочки/мальчика,
  невесту выбирают родители, быт молодой жены); эффект `add_npc` принимает `age_offset`. Доли по странам —
  `npm run marriage -- 300`.
- Звуки барабана лотереи (рычаг, щелчки строк в такт ленте, стук остановки, звон) — `src/sfx.ts` (синтез, без файлов),
  проигрывают `playLever`/`playReels` из `src/audio.ts`; время щелчков — `reelTiming` по кривой `EASE` в `Slots.tsx`.
  Прослушать в WAV — `node tools/qa/sfx.cjs` (нужен `npx vite --port 5174`).
- Темп детства — флаги `year_sec_child` (6 с) и `child_age` (12): до этого возраста год короче (`yearMs` в `Life.tsx`).
- Уход из меню — событие `menu_leave` (`App.tsx`, отчёт «Ушли из меню» в `/admin`); счётчик игроков в подвале меню —
  `GET /api/players` (таблицы `players`/`counters`, пересчёт раз в 10 мин) → `platform.playersCount()` → `menu.players`.
- Оформление «Карта пути» (с 01.11): `src/skin.css` поверх `style.css`, включается `class="skin"` на `<html>` (index.html) –
  фон «синяя ночь», бумажные кнопки и листы, рваные края; барабан – однорукий бандит «Синяя эмаль и латунь» (арка с лампами,
  стекло, линия выигрыша, лоток, рычаг сбоку). Темы светлая/тёмная больше нет. Превью вариантов – `tools/mockups/skin-capture.cjs`,
  проверка всех экранов – `node tools/qa/skin.cjs`. Эмодзи в игре не используются: пиксельные значки `src/ui/icons.ts`
  (`<Icon name>`, в строках интерфейса – метка `{i:имя}` через `<IconText>`).
- Уникальные первые жизни (флаг `unique_lives`, 10): в `GameSettings` – `eventsSeen` (события прошлых жизней из мемориала)
  и `kidsTarget` (`pickKidsTarget` в `life.ts`: число детей, которого ещё не было). В `rollEvents` (`fresh`) событие
  прошлых жизней или уже бывшее в этой не выпадает – если нового подходящего нет, в этот год такого события нет (история
  рождения – всегда). Повторяются только узлы жизни: имя ребёнку, ремесло, свадьба, вход в сон. Замер – `npx vite-node tools/unique.ts 30`.
- Игра «Gazi» (отдельная, про 1919–1923) убрана из сборки (решение владельца 01.11): файлы лежат в `extras/gazi/`; чтобы вернуть на сайт — перенести в `public/gazi/`.
- Турецкий язык (`tr`): тексты `tr*.json` рядом с `en*.json`, интерфейс `src/i18n/tr.json`; чего нет — берётся английский.
  Перевод новых текстов: `npx vite-node tools/tr-plan.ts all` → пачки `tools/tr/batch-NN.txt` → перевод в `tools/tr/out/` →
  `node tools/tr-merge.mjs --check NN` и `node tools/tr-merge.mjs`; проверка — `node tools/tr-lint.mjs`.
- Музыка: `src/audio.ts` (Web Audio, трек меню и по треку на страну, плавные переходы, пауза при скрытой вкладке,
  рекламе и «без звука» платформы — `platform.onAudio`), значок и громкость — `src/ui/Sound.tsx`, настройки
  `prefs.sound`/`prefs.volume`. Треки сочиняет и синтезирует `npm run music` (`tools/gen/music.mjs`, нужен ffmpeg):
  `public/music/<id>.mp3` и MIDI в `tools/gen/music/`. После перегенерации — увеличить `MUSIC_VERSION`.
- `docs/TZ.md` (+ `TZ_dorabotka.docx`) — исходное ТЗ, `docs/TZ_v3.md` — правки владельца после тестов (**сделано**, статус в конце
  файла); `docs/DECISIONS.md` — принятые решения и отступления.
- ТЗ v3, что где: уехавшие — `npc.away` + `sendAway` (`rules.ts`); отложенные последствия — `snapshot`/`dependsOf`/`storyline`
  (`game.ts`, счётчики `triggerStats`); семейное положение — `maritalStatus`; наследники-внуки — `heirs`; конец эпохи —
  `eraEnding`/`state.offChronicle`; награды — `src/engine/achievements.ts` (+ `npm run achievements`), экран `src/ui/Awards.tsx`;
  питомцы — `src/engine/pets.ts` + `src/content/pets.json`; дом сгорел — эффект `{"home": "burn|ruin|rebuild"}`, метки
  `home_damaged`…; переезд в другую страну — `src/engine/abroad.ts` + `src/content/routes.json` (пока Русь, Европа, Византия,
  Исламский мир; после переезда движок сам берёт страну героя — `eraNow`); долголетие — `npm run longevity`.
- Сны о будущем (`docs/TZ_dreams.md`, **сделано**, этапы 1–4): движок — `src/engine/dreams.ts` (свой поток случайности
  `dreamRng`, не трогает остальную жизнь), формулы — `src/engine/formula.ts`, каталог — `src/content/dreams.json`, тексты —
  `common/ru_dreams.json`/`en_dreams.json`, экран — `src/ui/Dream.tsx`, награды группы `dream` и «Школьная программа» —
  `achievements.ts`/`Awards.tsx`, отчёт в `/admin` — `SQL.dreamSteps`. Новый сон: запись в `dreams.json` + тексты RU/EN;
  `validateDreams()` проверяет ответы, допуски и формулы на краях параметров.
- Шрифты (оба лежат в сборке, внешних запросов нет): основной текст — Alegreya (`@fontsource-variable/alegreya`,
  подключается в `main.tsx`, `--font`); крупные надписи — «Летопись» (Thousands Letopis 0.2,
  `src/fonts/ThousandsLetopis-VF.woff2`, `--font-display`: h1–h3, название игры, имя героя, подписи разделов, крупные
  цифры). На холстах (карточка «Поделиться», OG) — так же, перерисовка после `document.fonts.load`. README «Летописи» —
  `src/fonts/README-Letopis.md`.
- Главное меню (`Menu` в `Screens.tsx`, макет A): сцена во всю ширину с «Бета»/звуком/языком поверх, название,
  **барабан лотереи** на первом экране у всех (`SlotMachine` в `Slots.tsx`, «Кем будешь ты? — Крути»; страна грузится
  с рывка рычага — событие `spin`); над барабаном кнопка «🎁 Дары» → панель `GiftsSheet`, ярлыки наград на окнах барабана
  (`tags`); ниже «Продолжить» с портретом и строка ссылок; «Как это устроено» и страны — в «Об игре» (`About`); проверка —
  `node tools/qa/menu.cjs`. Без прокрутки на телефонах — `node tools/qa/fold.cjs`. **A/B второй жизни**
  (флаг `ab_buckets`, `?ab=a|b`, отчёт в `/admin`): b — сразу высокое положение (`highBirth`). Защищены до 20 лет первые `protected_lives` жизней (`protectedAge` в `App.tsx`, и наследник);
  сон о будущем в первой жизни — к `dream_first_by` годам; **лестница снов** — `level` 1–5 в `dreams.json`,
  `dreamLadder()` (уровень = 1 + решённые сны), мягкая проверка в `checkInput` (см. `docs/TZ_dreams.md`). Пробный период «страна за отзыв» — флаг
  `trial_country_pick`: за отзыв один дар «Страна по выбору» (`CountryModal`, `prefs.gifts`); проверка — `node tools/qa/country.cjs`.
  Перекрутка барабана после результата — флаг `respins` (2), проверка — `node tools/qa/respin.cjs`.
  **Испытание** после первой жизни (флаг `challenge_age`, `prefs.fate`, `ChallengeCard`/`FatePicker`): прожить следующую
  дольше 30 лет → у барабана выбор судьбы (знать или страна), проверка — `node tools/qa/challenge.cjs`.
  «На главный экран» после первой жизни — `InstallCard`, `platform.installKind()/install()/installed()`, `node tools/qa/install.cjs`;
  награда — царская семья (`royalBirth`, тег `royal`, слова `classKey()` → `class.royal*`, `prefs.royal`).
  **Дары за вход** — `src/daily.ts` (лестница `GIFTS`, серия `dailyNext`, `prefs.daily`/`prefs.gifts`), `DailyCard`/`GiftsLine`,
  в движке `Birth.boons` и `settings.dreamSure`; проверка — `node tools/qa/daily.cjs`.
- Карточка «Поделиться» (плакат, 01.11: родные места во весь фон, герой крупно — `src/pixel/portraitHd.ts`: вырезанный фон,
  Scale2x, обводка; сверху на затенении имя и годы; внизу дело, три счётчика, факт, афоризм, хэштеги, «А сколько проживёшь ты?»;
  пять предложенных вариантов — `tools/share-variants.html`) — `src/ui/shareCard.ts` (рисует), `src/ui/lifeCard.ts` (данные), яркие факты и подбор афоризма —
  `src/engine/highlights.ts`, афоризмы — `src/content/common/quotes.json`; стенд — `tools/cards.html` + `node tools/qa/cards.cjs`.
- Подсказки на экране жизни — `hintFor`/`closeHint` в `Life.tsx` (закрытые помнятся в `thousands.hints`): скорость (0–1 год),
  длительность года с кнопкой «Открыть настройки» (2–6 лет; «Назад» из настроек возвращает в жизнь), фокус, вкладка «Герой».
- Графика (`docs/TZ_graphics.md`): сцена 320×100 из кэшируемых слоёв + движение (`scene.ts`, `fx.ts`, `figures.ts`),
  сезоны и погода (`season.ts`, `climate` в `era.json`), стиль искусства страны (`art.ts`, флаг `art_strength`),
  звуки места (`setAmbience` в `audio.ts`), иллюстрации G3 (`illustrations.ts`, `src/art/`, `npm run art`),
  вес сборки — `npm run size`, проверка сцен — `node tools/qa/scenes.cjs` (нужен `npx vite --port 5174`).
- Рекламный ролик-пролёт (вертикальный 1080×1920, озвучка EN, финал — постер): `tools/video/flyover/` — страница из
  настоящих сцен игры снимается по слоям, кадры считает WebGL2 (`film.js`, `seek(t)`), рендер `render.cjs` → `out/`.
  Порядок пересборки — `tools/video/flyover/README.md`.
- Проверка контента ловит: текст «уехал/отправил» без `npc_away`, «дом сгорел» без `{"home":"burn"}`, неизвестных питомцев.

## Состояние ТЗ (docs/TZ.md)

- **Этап 1 — готов:** B1–B4, U0–U5, A1, A3 (A2 — настройка целей Метрики владельцем по `docs/ANALYTICS.md`).
- **Этап 2 — готов:** P1–P5, B5 (тексты длительности). Отступление: `year_sec` по умолчанию 10, а не 15 —
  иначе не выполняется приёмка «жизнь до 60 лет за 12–18 мин» (см. DECISIONS.md).
- **Сверх ТЗ:** в настройках «Длительность года» — стандартная или 20/30/45/60 с (`prefs.yearSec`).
- **Дальше — этап 3:** ACH1–3 достижения (30 стартовых), M1 детерминированный RNG по подсистемам,
  M2 «Жизнь дня», M3–M5 испытания, M6 главный экран, S1 код жизни, S2 эстафета, S3 динамический OG,
  S4 второй шанс за репост, AI1–AI4 портреты (fal.ai). Затем **этап 4** — сборка для Яндекс Игр
  (`npm run build:yandex`, `src/platform/yandex.ts`).
- Решения владельца от 27.10.2026 — в конце `docs/DECISIONS.md`: дальше полировка по аналитике; ИИ-портретов не будет;
  Google-форма отзывов убрана из планов (`tools/google-form.gs` не нужен); выкладка — zip `dist/` владельцу.

## Инфраструктура

- Cloudflare Pages: проект сайта на домене thousands.life. Выкладка — архив `dist/` через
  «Create deployment» (или wrangler, если в окружении есть `CLOUDFLARE_API_TOKEN` и `CLOUDFLARE_ACCOUNT_ID`
  и разрешён домен `api.cloudflare.com`).
- D1: база `thousands`, id `4ad2783a-125d-4c26-b8e3-55cf7b6884f1` (EEUR), таблицы `events` и `feedback` созданы.
  Привязка к Pages под именем `DB` и секрет `ADMIN_PASSWORD` делаются в панели Cloudflare (см. BACKEND.md).
- Яндекс Метрика: счётчик 113771699.
- Если сеть окружения не пускает к Cloudflare — собрать `dist`, упаковать в zip и отдать владельцу.

## Привычки работы

- Каждая новая строка интерфейса — сразу в RU и EN; после правок контента `npm run stats`.
- Перед выдачей: `npx tsc --noEmit -p .`, `npm test`, `npm run build`, проверка в браузере на 360–430 px.
- Код в стиле проекта: без точек с запятой, одинарные кавычки, комментарии по-русски.
  **Не запускать prettier** — у проекта нет его конфига, он переформатирует файлы.
- Сохранения: `SAVE_VERSION` в `src/engine/life.ts` + миграции в `src/storage.ts`; мемориал не терять.
