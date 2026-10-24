# Как писать события

Всё содержание эпохи лежит в `src/content/<эпоха>/`. События — в файлах `events*.json`,
тексты — в `ru*.json` и `en*.json` той же папки (файлы склеиваются автоматически, ключи
не должны повторяться между файлами). Проверка: `npm test` — тесты ловят пропущенные тексты,
битые ссылки, неверные сцены и т.п.

Тексты, сюжеты и названия пишем сами. Ничего не копируем из чужих игр.

## Виды событий

1. **Момент жизни** (`"moment": true`) — короткая сценка, которая просто происходит и
   появляется в ленте года, игра не останавливается. Выборов нет. 1–2 предложения.
   Это главный источник разнообразия: запахи, люди, мелкие радости и беды, быт эпохи.
   Пример: «Отец взял тебя на рынок. Ты впервые попробовал{g:|а} финики».
2. **Решение** — окно с картинкой, текстом и 2–4 вариантами. У рискованных вариантов
   `risk_roll` и тексты итога `.success` / `.failure`.
3. **Развилка** (`"milestone": true`) — важное решение возраста (профессия, брак). Выпадает
   первым, когда подходят условия, один раз за жизнь.
4. **Последствие** (`"trigger_only": true`) — происходит только через `delayed_effects`
   другого решения. Так строятся цепочки на годы вперёд.
5. **Историческое** (`"type": "global_historical"`, `global_chance`, `years`) — реальное
   событие эпохи. Обязательны `historian_note: true`, `confidence` и текст `.note`.

## Поля события

```json
{
  "id": "e03_xxx",                    // уникальный, латиница
  "type": "personal | family | local | global_historical",
  "moment": true,                      // момент жизни (необязательно)
  "regions": ["rome"],                 // rome | athens | egypt; без поля — везде
  "years": [-500, 200],                // исторические годы, до н.э. — отрицательные
  "age_range": [5, 11],
  "classes": ["slave", "peasant", "craftsman", "trader", "landowner", "noble"],
  "sex": "m | f",
  "npc": "friend",                     // событие о конкретном человеке: в тексте {npc}
  "npc_age": [18, 60],                 // возраст этого человека (необязательно)
  "conditions": [ ... ],               // см. ниже
  "base_weight": 3,                    // частота относительно других (1 редко … 5 часто)
  "weight_modifiers": [{ "if": {"trait": "curious"}, "multiply": 2 }],
  "once": true,                        // не больше раза за жизнь (для моментов почти всегда)
  "sensitive": true,                   // тяжёлая тема (смерть детей, насилие, жестокость)
  "variants": 3,                       // несколько текстов: ev.id.text.1 … .3
  "topic": "family | work | health | money | history | life",
  "icon": "birth | child | wedding | death | move | loss | find | war | disaster | freedom | study | love",
  "pattern": { "home_road": 2 },       // вклад в «Узор жизни» (см. ниже)
  "scene": { "place": "market", "time": "day", "people": 3, "props": ["amphora", "coins"] },
  "effects": [ ... ],                  // применяются всегда (у момента — единственные)
  "choices": [ { "id": "...", "requirements": [...], "effects": [...],
                 "risk_roll": {...}, "delayed_effects": [...], "pattern": {...}, "icon": "move" } ],
  "historian_note": true, "confidence": "confirmed | reconstructed | disputed"
}
```

`icon` ставим только значимым событиям: они попадают на карту жизни и в жизнеописание.

### Условия (`conditions`, `requirements`)

`{"param": "money", "op": ">=", "value": 100}` — параметры: health, intellect, strength,
charisma, diligence, risk_tolerance, happiness, stress, loneliness, reputation (−100…100),
self_esteem, faith, money. `{"skill": "literacy", "op": ">=", "value": 20}` — навыки: literacy,
trade, craft, farming, military, medicine, management, oratory, seafaring.
Ещё: `{"tag": "x"}`, `{"tag_absent": "x"}`, `{"trait": "kind"}`, `{"trait_absent": "x"}`,
`{"flag": "x"}`, `{"flag_absent": "x"}`, `{"sex": "f"}`, `{"profession": ["farmer"]}`,
`{"no_profession": true}`, `{"has_npc": "child", "age_min": 6, "age_max": 11}`,
`{"no_npc": "spouse"}`, `{"classes": [...]}`, `{"age": [17, 46]}`, `{"any": [условия]}`.

Полезные теги героя: married, lives_in_city, rural, wealthy, enslaved, freedman, in_debt,
schooled, philosophy, fugitive. Черты: cautious, ambitious, kind, hot_tempered, curious,
reserved, generous, pious, cunning, brave.

### Эффекты

`{"param": "health", "delta": -10}`, `{"money_pct": -20}`, `{"skill": "craft", "delta": 5}`,
`{"add_tag": "x"}`, `{"remove_tag": "x"}`, `{"set_flag": "x"}` (флаги с префиксом `family_`
переходят к наследнику), `{"clear_flag": "x"}`, `{"add_trait": "brave"}`,
`{"set_class": "craftsman"}`, `{"set_profession": "artisan"}`,
`{"add_npc": "friend", "attitude": 40}` (роли: friend, spouse, child, mentor, rival, patron, sibling),
`{"npc_attitude": "npc", "delta": 10}` — «npc» значит человек, о котором событие,
`{"remove_npc": "npc"}`, `{"kill_npc": "npc"}`, `{"kill": "war"}` (смерть героя — только
в крайних рисках), `{"move": "alexandria"}` (переезд, нужен текст `place.alexandria`),
`{"chance": 0.3, "effects": [...]}`.

Масштаб: деньги — монеты эпохи (годовой доход крестьянина ≈ 150–250, ремесленника ≈ 200–330,
знать — тысячи). Параметры: мелочь ±1–3, заметно ±5–8, сильно ±10–15, тяжело ±20–25.

### Риск и последствия

`"risk_roll": {"param": "charisma", "success_chance_base": 0.5, "on_success": [...], "on_failure": [...]}` —
шанс = база + (параметр − 50)/200. Можно без `param` — тогда шанс фиксированный.

`"delayed_effects": [{"after_years": [5, 12], "chance": 0.6, "trigger_event": "e03_xxx_later"}]` —
не меньше четверти решений должны иметь отложенные последствия через 5+ лет.
Последствие пишем как отдельное событие с `"trigger_only": true`.

### «Узор жизни»

Оси: `craft_power` (− ремесло, + власть), `home_road` (− дом, + дорога), `faith_reason`
(− вера, + разум), `memory_future` (− память и род, + перемены и риск). Типичный вклад
решения — ±2…6. Дилемма должна тянуть оси в разные стороны.

### Сцена

`place`: landmark (вид города: Колизей, Акрополь, Нил с пирамидами), home, street, market,
temple, field, river, sea, harbor, workshop, school, camp, battle, arena, road, tomb, palace, bath.
`time`: day, dawn, sunset, night, overcast. `people`: 0–6. `props` (до 3): sun, moon, fire,
smoke, boat, bed, cradle, table, scroll, coins, amphora, tree, palm, olive, grain, goat, horse,
cart, lamp, altar, statue, rain, banner, shield, loom, anvil.

## Тексты

Ключи: `ev.<id>.title` (кроме моментов), `ev.<id>.text` (или `.text.1…N`), `ev.<id>.<choice>`,
`ev.<id>.<choice>.success` / `.failure` для рисков, по желанию `ev.<id>.<choice>.ok`,
`ev.<id>.note` для исторической справки, `ev.<id>.text.rome` — вариант для региона.

Обращение на «ты». Род по полу героя: `{g:мужская|женская}` — «ты {g:устал|устала}».
Род персонажа события: `{g=npc_sex:он|она}`. Имя персонажа: `{npc}` (в именительном
падеже — строй фразу так, чтобы имя стояло в именительном: «Твой друг {npc} …»,
«{npc}, твоя соседка, …»). Английский — естественный, не подстрочник.

Тон: уважительный, без жестоких подробностей. Смерть, болезнь, рабство — коротко и
человечно. Юмор и тепло приветствуются: жизнь состоит не только из бед.
