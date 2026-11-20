# Аналитика (ТЗ A1–A2)

Игра шлёт события только через `platform.track(name, params)` (`src/platform/`), игровые счётчики —
`src/telemetry.ts`. Каждое событие уходит в Яндекс Метрику (цель `reachGoal`) и в свой приёмник
(`docs/BACKEND.md`). `choice_made`, `dream_step` и `menu_leave` — только в свой приёмник, чтобы не засорять Метрику.
Метки рекламы: `app_open` несёт `utm_source`, `utm_medium`, `utm_campaign` из адреса; первый источник игрока запоминается и идёт во все события как `utm` (общий параметр).

Общие параметры каждого события: `platform, lang, build, ab, life_index, mode, session_id, player_id`.
Параметры посетителя (userParams): `lives_total, first_seen, best_age`.

| Событие | Параметры | Когда |
|---|---|---|
| app_open | referrer, life_code, load_ms, vw, vh, boot_id, vis, tz | игра загрузилась; boot_id — тот же, что у маяка `boot` этой загрузки (пусто на порталах); vis — `visible` или `hidden` (вкладку открыли в фоне); tz — часовой пояс устройства (ТЗ удержания, R4 и R6) |
| life_start | era, region, cls, sex, lottery, protected, generation, respins | герой родился (lottery=heir — наследник, country — страну выбрал игрок; protected — жизнь защищена до 20 лет; respins — сколько раз перекрутил барабан) |
| respin | n, era, cls, ad | перекрутил барабан после результата (n — какая по счёту перекрутка; era, cls — что выпало до неё; ad=1 — за рекламу, только CrazyGames) |
| first_choice | sec_from_start | первый выбор в жизни |
| age_milestone | age, sec_in_life | 5, 10, 15, 20, 30, 40, 50, 60, 70 лет |
| choice_made | event_id, option, age, success, historical (1 - историческое событие) | любой выбор (только свой приёмник) |
| speed_change | speed | смена скорости |
| tab_open | tab | вкладки жизни, «Читать» справку, графики и запись в итогах; `settings_from_hint` — открыл настройки из подсказки о длительности года |
| session_end | screen, age, sec_in_session + счётчики: tabs, speeds, …, events_shown {тип: n}, event_queue {длина очереди: n}, year_windows {окон в году: лет}, losses {родство: n} | вкладку скрыли/закрыли (sendBeacon); при закрытии без ухода в фон - pagehide |
| menu_leave | sec, drum, button, spun, gifts, scroll, vw, vh, lives, hero, played | вкладку скрыли/закрыли на главном экране (только свой приёмник): sec — секунд в меню с прошлого показа; drum — какая часть барабана была видна (максимум, %); button — кнопка «Крути» была видна целиком; spun — дёргал рычаг; gifts — открывал «Дары»; scroll — насколько прокрутил страницу (px); vw, vh — размер окна; lives — прожитых жизней; hero — есть незаконченная жизнь; played — уже играл в этот заход. Отчёт «Ушли из меню» в `/admin` |
| life_end | age, cause, region, era, sec_in_life, choices, rescued, generation, heirs (сколько наследников на итоге) | смерть героя |
| event_shown | event_id, type (historical, dice, crisis, profession, name, estate, debt, dream, personal, family, local), age, queue_len | окно события открылось - **счётчиком** в session_end (events_shown, event_queue), строк в D1 нет (аудит 10.11) |
| year_windows | n (0–9) | конец года: сколько окон было в этом году - счётчиком в session_end.year_windows |
| loss_shown | npc_role, is_death | карточка утраты (только смерть близкого; болезнь окна не открывает) - счётчиком в session_end.losses |
| notices_toggle | on | игрок скрыл или вернул строку вестей |
| js_error | kind (render, window, promise, cross - «Script error.» чужого скрипта, chunk - пропал кусок сборки, перезагрузка), msg, stack, where (файл:строка:столбец), screen | ошибка; не больше 5 за сессию |
| summary_action | action: heir/reborn/share/memorial/menu | кнопки итогов |
| share_open / share_done | what (life/dream) / what, format, method | «Поделиться» жизнью или сном |
| feedback_sent | rating | отзыв отправлен |
| heir_chosen | generation | продолжение рода |
| dream_offer | dream, era, age | герою приснился сон о будущем (docs/TZ_dreams.md); в первой жизни — наверняка к 25 годам |
| country_pick | era | пробный период: игрок после отзыва выбрал страну следующей жизни (награда — один дар «Страна по выбору») |
| spin | auto | первый рывок рычага лотереи (без перекруток): видно, где теряются новички — до барабана или после результата; auto: 1 — барабан запустился сам (рукав XS) |
| challenge_done | age | испытание пройдено: жизнь после первой прожита дольше `challenge_age` лет (флаг, 30) |
| kids_offer | games, age | ранняя детская игра (src/kids/early.ts): какие три занятия предложены (id через запятую) |
| kids_start | game, kind (toddler/puzzle), task, fresh | выбрал занятие; fresh=1 — раньше не играл |
| kids_end | game, kind, task, stars, sec, mistakes, moves, hints, quit | итог: stars 0–3, quit=1 — «Убежать играть» / «Бросить» |
| goal_offer | goals, mode, cls, inherit?, free? | цель жизни (docs/TZ_goal.md): какие карточки показаны; mode birth - при рождении (у наследника - в начале его жизни), change - смена в юности |
| goal_pick | goal, tier, sec, inherited? | выбрана цель (goal none - «без цели», с 4-й жизни); tier 1–3 - спокойная/смелая/почти невозможная |
| goal_change | goal, from, tier, sec | цель сменили на экране-главе в goal_change_age лет |
| goal_step | goal, step, age | выполнен шаг цели (1–4) |
| goal_end | goal, steps, done, age, tier, inherited?, changed? | итог цели при смерти героя |
| fate_used | kind (high/country), era | награда за испытание потрачена: родился в знатной семье или в выбранной стране |
| install_prompt / install_result / install_done | kind (prompt/ios) / accepted / — | «На главный экран»: нажал кнопку в карточке / ответ системного окна (Android) / игра установлена |
| install_reward | via (prompt/home) | награда за установку получена: согласился в системном окне (Android) или впервые открыл игру с главного экрана |
| royal_used | era, region | награда потрачена: жизнь началась в царской семье (у `life_start` этой жизни — `royal: 1`) |
| gifts_open | auto (1 — открылась сама раз в день), n — сколько даров ждёт | панель «Дары» на главном экране |
| daily_claim | day (1–7), gift, broken | забрал дар за вход: день серии и дар (country, respins, health, noble, dream, chest, royal); `broken: 1` — серия перед этим прервалась. Потраченные дары — в `life_start.gifts` (через запятую). Отчёт — `/admin`, «Дары за вход» |
| dream_start / dream_skip | dream | «Попробовать вспомнить» / «Это просто сон» |
| dream_step | dream, step, kind, correct (0/1), value (до 80 знаков), sec | ответ на шаге сна (только свой приёмник; отчёт «Сны о будущем» в `/admin`) |
| dream_end | dream, score, outcome (breakthrough/partial/failure/death), hint_used, known | сон кончился |
| dream_training / dream_training_end | dream / dream, score, hint_used | тренировка сна из «Школьной программы»; её `dream_step` идут с `training: 1` и в отчёт `/admin` не попадают |
| daily_offer | — | карточка «Жизнь дня» в меню видна (только свой приёмник; docs/TZ_daily.md) |
| daily_start | era | начата жизнь дня (у `life_start` этой жизни `lottery: daily`) |
| daily_end | age, place, of | итог жизни дня записан в таблицу: возраст, место, сколько сыграло |
| nick_set | hidden | игрок задал ник для таблиц (hidden: 1 - «не показывать моё имя») |
| daily_win | of, age | вчерашняя жизнь дня закрылась, игрок первый (сыграло ≥ 3) - царская семья на следующую жизнь |
| achievement_unlocked | id, rare (1 — секретная, трудная или у <5% игроков) | получена награда (ТЗ v3, п. 10) |
| tour_end | step, skipped, mode? | обучение закончено: шесть карточек подряд (mode нет) или все шаги по ходу жизни (mode: drip) |
| tour_step | key (speed, skip, hero, tabs, goal, menu), age, skipped | рукав XT «по ходу жизни» (аудит 18.11): показан и закрыт один шаг обучения; не больше одного шага за игровой год |
| rebirth_click | age | рукав П4 (аудит 18.11): нажата «Другая судьба» в первый год первой жизни — сразу к барабану, один раз |
| boot | boot_id, lang, tz, vw, vh, conn | маяк начала загрузки страницы (ТЗ удержания R4): уходит из встроенного скрипта `index.html` сразу, до загрузки игры, через sendBeacon; только на своём сайте (thousands.life, *.thousands-life.pages.dev). player_id — если игрок уже бывал; conn — `navigator.connection.effectiveType` (4g, 3g…; в Safari пусто). `boot` без `app_open` с тем же boot_id — игра не загрузилась (отчёт «Загрузки страницы без запуска игры» в `/admin`) |
| app_visible | sec_hidden | вкладку открыли в фоне (app_open с `vis: hidden`) и впервые показали: сколько секунд прошло с начала загрузки (R6). Игрок, чью вкладку так и не показали, не считается в отчётах `/admin` (переключатель «Только видевшие вкладку») и в сводке |
| load_slow | where (spin), era, sec (12) | страна грузится дольше 12 с после рывка рычага — показана подсказка «долго грузится»; один раз за ожидание (R5) |
| load_error | where (era), era, reloaded (0/1) | ошибка загрузки страны; reloaded: 1 — страница сразу перезагружается сама (файлы прошлой версии сайта), 0 — показана кнопка «Обновить» (R5) |
| load_ready | where (spin), era, ms, wait_ms | кнопка «Узнать свою семью» стала активной: ms — от рывка рычага до загрузки страны (0 — была загружена заранее, R7), wait_ms — сколько игрок ждал после остановки барабана (R5) |

Общие параметры A/B аудита 18.11 (в каждом событии, `platform.setContext`): `tour` — `wall` (шесть карточек до первого выбора)
или `drip` (по шагу по ходу жизни, флаг `tour_drip_share`, `?tour=wall|drip`); `goal_at` — возраст, с которого спрашивают
цель жизни: 0 — сразу после рождения, 6 — мать загадывает желание в 6 лет (флаги `goal_late_share`, `goal_late_age`, `?goalat=0|6`).
`home` — `quiet` (пока нет прожитой жизни, внизу главной только «Об игре»; флаг `home_quiet_share`, `?home=quiet|full`) или `full`;
`rebirth` — 1, если игроку показывается «Другая судьба» (флаг `rebirth_share`, `?rebirth=0|1`). Для `home` мерка — «начали жизнь»
(доля `life_start` среди новых игроков) и уход с главной (`menu_leave`); для `rebirth` — уход на 0–1 году и доля `new_life_confirm` с младенцем.
Общие параметры A/B ТЗ удержания (20.11, `platform.setContext`; флаги по умолчанию 0, деление — свой хеш id, как `share()`
в `src/goal.ts`, с XT, XG, П2, П4 не связано): `autospin` — 1, если новичку (нет прожитых жизней и незаконченной жизни)
барабан запускается сам через 1,2 с после показа меню, без звука (эксперимент XS, флаг `auto_spin_share`, `?autospin=0|1`;
нажал что-то в меню раньше — автозапуска нет; рывок — `spin` с `auto: 1`); `reveal` — `lite` (в первой жизни экран знакомства
с семьёй: сцена, имя, одна строка «край · год · положение» и «Начать жизнь»; вера, семья и характер — на вкладке «Герой»;
эксперимент XR, флаг `reveal_lite_share`, `?reveal=lite|full`) или `full`. Мерки XS — доля `life_start` среди новичков,
`menu_leave` без `life_start`, `first_choice`, D1; XR — время от `life_start` до `first_choice`, `first_choice`,
«три решения за три минуты». Решение — как у XT/XG: при ≥ 200 новичках на вариант.

**Страна и служебные устройства (ТЗ удержания, 20.11).** У каждой строки `events` в D1 — колонки `country` (код страны по данным
Cloudflare, `cf-ipcountry`) и `asn` (номер сети провайдера); IP не хранится. У строк до 20.11 они пустые. Обе колонки — в выгрузке CSV.
Служебное устройство: открыть игру с `?internal=1` (снять — `?internal=0`) — все события идут с `internal: 1`; ещё — id через запятую
в секрете `INTERNAL_IDS` (docs/BACKEND.md). Такие игроки не считаются в `/admin` (переключатель «Без служебных», по умолчанию включён),
в боте и в утренней сводке. Метки хранит таблица `player_marks` (internal, visible).

Главная мерка для tour и goal_at — «три решения за три минуты» (3 `choice_made` за 180 с после `life_start` первой жизни), затем
уход на 0–1 году, доживание до 5 и 20 лет и D1.

Позже (этапы 2–4): ad_request/ad_shown/ad_rewarded, challenge_end, portrait_request/portrait_done.

## Настройка Метрики (A2), счётчик 113771699

1. **Цели** (Настройка → Цели → Добавить цель → «JavaScript-событие»), идентификаторы ровно как в таблице:
   `app_open`, `life_start`, `first_choice`, `age_milestone`, `life_end`, `summary_action`, `share_open`,
   `share_done`, `feedback_sent`, `speed_change`, `tab_open`, `session_end`, `dream_offer`, `dream_start`, `dream_end`.
2. **Составная цель «Воронка жизни»** (тип «Составная», шаги — JavaScript-события):
   `app_open` → `life_start` → `first_choice` → `age_milestone` → `life_end`.
   Возврат на вторую жизнь — отчёт ниже (параметр life_index=2 у life_start).
3. **Отчёты**: Отчёты → Содержание → Параметры визитов — разбивка по `life_start → era`,
   `life_end → cause`, `age_milestone → age`, `ab`. Отчёт «Параметры посетителей» — `lives_total`, `best_age`.
   Точные воронки по уникальным игрокам и вторую жизнь удобнее смотреть в `/admin` (свой приёмник),
   в Telegram-боте (`/stats`, `/week`, `/funnel`, `/exits`) и в утренней сводке — см. `docs/BACKEND.md`.

## Как параметры читаются в отчётах (/admin, бот, сводка)

- `life_index` и `mode` у `life_start`/`life_end` — общие параметры (setContext), а не свои; вторая жизнь —
  `life_start` с `life_index ≥ 2` (наследник тоже считается).
- Возраст смерти — `life_end.age`, выборов за жизнь — `life_end.choices`, длительность — `life_end.sec_in_life`.
- `session_end` уходит при **каждом** скрытии вкладки, поэтому за визит их может быть несколько;
  `sec_in_session` — секунды с загрузки страницы (а не с прошлого скрытия), `age` — возраст текущего героя
  (0, если героя ещё нет, например на `menu` при первом заходе).

## A/B-тест второй жизни (с 28.10.2026)

- Вариант игрока — по его id и долям флага `ab_buckets` в `public/flags.json` (сейчас `{ "a": 0.5, "b": 0.5 }`),
  пишется в каждое событие (`ab`). Посмотреть вариант вручную — `?ab=a` или `?ab=b` в адресе.
- **a** — вторая жизнь по лотерее защищена до 20 лет, положение как выпало; **b** — тоже защищена, но положение сразу
  высокое: знать или землевладельцы края (`highBirth` в `life.ts`), где бы ни родился. У такой жизни в `life_start` — `high: 1`.
  Наследник положение получает от семьи — его тест не касается.
- Отчёт — `/admin`, «A/B второй жизни за 14 дней»: начавшие вторую жизнь по лотерее, дожили в ней до 20 и 40 лет,
  начали третью жизнь, вернулись в другой день, средний возраст смерти во второй жизни.
- Разница видна не сразу: до второй жизни доходит примерно каждый десятый новичок, нужно 2–3 недели или больше
  трафика. Закончить тест — оставить победителя: `{ "a": 1 }` или `{ "b": 1 }`.
- Первый экран в A/B не участвует: барабан на первом экране у всех. На порталах (CrazyGames) вариант всегда «a».
- Вторые жизни в царской семье (награда за главный экран, `royal: 1`) и с дарами за вход (`gifts`) в отчёт не входят —
  иначе смешали бы варианты.

**Ранняя детская игра (A/B).** Во всех событиях есть параметр контекста `kids`: 1 — у игрока есть ранняя игра, 0 — нет.
Деление — своё (`kidsGroup` в `src/kids/early.ts`, хеш id игрока, доля — флаг `kids_share`), не через `ab_buckets`,
чтобы не смешиваться с идущим там опытом «высокое положение во второй жизни». Сравнивать группы по `age_milestone`
5 и 20 и по возврату на следующий день. Принудительно: `?kids=1` / `?kids=0`.

**Цель жизни (A/B).** Параметр контекста `goal`: 0 — без цели, 1 — цель без меток ▲▼, 2 — цель с метками. Деление — своё
(`goalGroup` в `src/goal.ts`): доля `goal_share` с целью, внутри неё доля `goal_marks_share` с метками (по разным хешам id).
У `choice_made` при цели — `mark: up|down|none` (метка выбранного варианта, считается и тем, кто меток не видит).
Сравнивать «цель против без цели» (1 и 2 вместе против 0) по `first_choice`, `age_milestone` 20, `life_end` и второй
жизни; «метки против без меток» (2 против 1) — так же и по `goal_end.done`. Принудительно: `?goal=0|1|2`.
