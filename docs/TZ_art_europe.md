# ТЗ для нейросети: картинки Европы (пробная страна)

Nov 3, 2026 · пилот рисованной графики. Сначала Европа (1000–1500, края: Париж, Лондон, Флоренция, Кёльн,
Толедо). Если стиль и наложение анимации понравятся - по этому же ТЗ делаются остальные 12 стран.

## Что нужно

| Группа | Что | Пропорции | Сколько |
|---|---|---|---|
| A. Фоны мест | Пустые места без людей: поверх игра рисует семью героя, дым, дождь, снег, время суток | 16:5 | 10 обязательных + 8 по желанию |
| B. Ключевые моменты | Готовые сцены с людьми для важных событий жизни | 16:9 | 18 |
| C. Особые | Сон о будущем, справка историка | 16:9 | 2 |

Обязательно 30 картинок, со всеми дополнительными - 38.

## Стиль

**Ранняя нидерландская живопись маслом, около 1430–1470 годов** (Ян ван Эйк, Робер Кампен, Ганс Мемлинг).
Тонкие прозрачные лессировки, тщательная деталь, «драгоценные» насыщенные цвета: ультрамарин, киноварь,
густая зелень, охра, свинцовые белила. Мягкий дневной свет слева, как из окна. Спокойная композиция, точка
зрения немного сверху. Тёплый старый лак и лёгкий кракелюр.

Одежда и вещи - Северная и Западная Европа XIV–XV веков. Игра охватывает 1000–1500 годы, но все картинки
держим в одном времени, чтобы набор был цельным.

**Общий блок стиля** - добавляется в конец каждого промпта:

```
Early Netherlandish oil painting on oak panel, c. 1430-1470, in the manner of Jan van Eyck, Robert Campin and
Hans Memling. Thin translucent oil glazes, meticulous detail, jewel-like saturated colours (ultramarine,
vermilion, deep green, yellow ochre, lead white, umber), soft daylight from the left, calm balanced composition,
slightly elevated viewpoint, warm aged varnish with fine craquelure. Late medieval Northern and Western Europe,
14th-15th century clothing and objects.
```

**Негативный промпт** (если генератор его принимает; если нет - дописать в конец «Avoid: …»):

```
text, letters, inscriptions, captions, watermark, signature, picture frame, border, modern objects, glass
windows in peasant houses, potatoes, tomatoes, maize, tobacco, pumpkins, turkeys, printed newspapers, clocks on
walls, muskets, cannons, plate armour of the 16th century, tricorn hats, baroque, rococo, Victorian, fantasy,
horned helmets, halos, angels, anime, cartoon, 3D render, photo, photorealistic skin, lens blur, bokeh,
cinematic lighting, extra fingers, deformed hands, duplicated faces
```

## Технические требования

**Мастер-файлы.** Генерировать в самом большом доступном разрешении, хранить PNG без сжатия
(папка `art-masters/europe/`, в сборку игры не входит).

**Фоны мест (A), 16:5.**
- Если генератор умеет 16:5 (Midjourney: `--ar 16:5`), генерировать сразу так.
- Если нет - генерировать 16:9 и вырезать середину по высоте: важное держать в полосе от 22% до 78% высоты
  кадра.
- **Без людей и животных.** Людей рисует игра, они ходят по кадру.
- **Пол или земля внизу - свободная ровная полоса.** Нижняя треть кадра (от 70% высоты до низа) без мебели,
  телег, камней, кустов. На уровне 73% высоты стоят ноги человечков игры, они ходят слева направо.
- **Горизонт и задний план** - в верхних двух третях. Небо не пересвечено и не тёмное: игра сама перекрашивает
  кадр в рассвет, закат, ночь и зиму.
- Сцена дневная, без снега и без дождя: погоду и сезоны добавляет игра.

**Ключевые моменты (B, C), 16:9.**
- Люди в кадре нужны. Лица спокойные, без гримас; руки - с пятью пальцами.
- Главное действие - в центре; по краям 5% кадра ничего важного: там будет рамка игры.
- Огонь, дым, дождь можно не рисовать - игра накладывает их анимацией (у «пожара» огонь нарисовать надо).

**Файлы для игры.** Каждую принятую картинку уменьшить и сохранить в WebP, качество 80:

| Группа | Размер | Вес | Путь |
|---|---|---|---|
| A | 1280×400 | до 120 КБ | `src/art/europe/place/<id>.webp` |
| B, C | 1024×576 | до 120 КБ | `src/art/europe/<id>.webp` |

Вся Европа выйдет примерно в 3–4 МБ и загружается только у игроков, родившихся в Европе.

**Единство набора.**
1. Сначала сделать `place/street` и `wedding`, выбрать лучшие и утвердить их как эталон.
2. Все остальные картинки генерировать с эталоном как образцом стиля (Midjourney `--sref`, Flux/SDXL - IP-Adapter
   или style reference, ChatGPT/DALL·E - приложить эталон и написать «same style as the attached image»).
3. Один и тот же генератор и одна модель на весь набор.

**Права.** Генератор должен разрешать коммерческое использование (сайт, Яндекс Игры, CrazyGames).

## A. Фоны мест (16:5, без людей)

Ко всем промптам группы A в начало добавляется:

```
Empty scene, no people, no animals. Wide panoramic composition. The bottom third is an open, flat, uncluttered
floor or ground strip running across the whole width.
```

### Обязательные (10)

| id | Место в игре | Промпт |
|---|---|---|
| `home` | Дом героя, простой, но крепкий | Interior of a modest late medieval townhouse: timber beams, whitewashed walls, an open hearth with an iron pot on the left, a wooden bench and a long table against the back wall, a small window with wooden shutters, bunches of herbs hanging, a straw-covered stone floor. |
| `street` | Улица города | A narrow street of a late medieval Flemish or French town: tall timber-framed houses with jettied upper floors and painted shutters, shop signs hanging on iron brackets, a gutter in the middle of the cobbled street, a Gothic church spire in the distance. |
| `field` | Поле, деревня | Open farmland: long narrow strips of ripening wheat and green fallow, a hedge, a few thatched cottages and a small stone parish church with a bell tower in the middle distance, gentle hills and a blue distant landscape. |
| `temple` | Церковь, собор | Interior of a Gothic church nave: pointed arches, slender columns, tall stained-glass windows with coloured light falling on the floor, a carved wooden rood screen and an altar far in the back, a smooth stone floor. |
| `palace` | Дворец, двор правителя | A great hall of a castle or royal palace: high timber roof, tapestries with hunting scenes on the walls, a raised dais with a canopied throne at the back, a huge fireplace, banners with heraldry, a polished tiled floor. |
| `road` | Дорога, путешествие | A dirt road winding through a rolling landscape: a wooden wayside cross, a milestone, distant walled town with towers on a hill, a castle on a crag, blue mountains far away, poplars along the road. |
| `market` | Рынок, ярмарка | A market square: wooden stalls with striped awnings, baskets of bread, cabbages, onions, apples, cheese wheels, bolts of cloth, a stone well, a guild hall with a stepped gable, town hall belfry in the background. |
| `landmark` | Столица края (Париж) | Medieval Paris seen from the Seine: Île de la Cité with the Gothic cathedral of Notre-Dame and its two square towers, houses built on a stone bridge, boats moored at the riverbank, the royal palace towers. |
| `workshop` | Мастерская | Interior of a craftsman's workshop: a smithy forge with glowing coals and bellows on the left, an anvil, tools on the wall, a carpenter's workbench and a loom at the back, wood shavings on the floor, an open door to the street. |
| `river` | Река | A wide river with a stone bridge of several arches, a wooden watermill with a turning wheel, willow trees, a small boat at a landing stage, a town wall and church towers on the far bank. |

### По желанию (8)

Дом героя меняется с достатком; столица - с краем рождения.

| id | Что | Промпт |
|---|---|---|
| `home_0` | Лачуга | Interior of a poor one-room peasant hut: wattle-and-daub walls, a central open fire on the earth floor, smoke hole in the thatched roof, a straw sleeping place, a wooden chest, a clay pot. |
| `home_3` | Большой дом | Interior of a rich merchant's house: oak panelling, a carved cupboard with pewter plates, a glazed window with leaded panes, a canopied bed with red curtains, a brass chandelier, a tiled floor. |
| `home_4` | Усадьба | A noble manor's solar: tapestries, a large stone fireplace with a coat of arms, a chess board on a table, books on a lectern, a view through tall windows to an enclosed garden. |
| `home_1` | Хижина | Interior of a simple village cottage: timber frame, a hearth with a chimney hood, a table and stools, a cradle, a spinning wheel, tools hanging by the door. |
| `landmark_london` | Лондон | Medieval London from the Thames: Old London Bridge crowded with houses, Old St Paul's Cathedral with its tall spire, the White Tower of the Tower of London, sailing cogs on the river. |
| `landmark_florence` | Флоренция | Florence from the hills: the red brick dome of the cathedral, Giotto's bell tower, the tower of the Palazzo Vecchio, the Arno with the Ponte Vecchio, cypresses and olive groves. |
| `landmark_cologne` | Кёльн | Cologne from the Rhine: the unfinished Gothic cathedral with a wooden crane on its south tower, the Romanesque church of Great St Martin, town walls and river ships. |
| `landmark_toledo` | Толедо | Toledo on its rocky hill above the gorge of the Tagus: the Gothic cathedral spire, the Alcázar fortress, the Alcántara bridge, ochre houses, dry hills. |

## B. Ключевые моменты (16:9, с людьми)

| id | Когда игра показывает | Промпт |
|---|---|---|
| `birth` | Рождение героя | A birth chamber: a mother resting in a curtained bed, a midwife bathing the newborn in a wooden tub by the fire, a neighbour warming swaddling cloths, a father waiting at the door. |
| `childhood` | Детство | Children playing in a town square: a boy rolling a hoop, girls with a rag doll, a game of knucklebones, a spinning top, an old woman watching from a doorway. |
| `wedding` | Свадьба | A wedding at a church porch: the bride in a blue gown with a garland, the groom in a red houppelande, a priest joining their hands, relatives and musicians with a bagpipe and a shawm. |
| `child_born` | Рождение ребёнка | A young couple at home with their newborn in a wooden cradle, the husband leaning over the cradle, an older child peeking, a grandmother spinning wool by the hearth. |
| `old_age` | Старость | An old man and an old woman sitting by the hearth in winter clothes, grandchildren at their feet listening to a story, a cat by the fire. |
| `study` | Учёба, ученичество | A schoolroom: a master with a rod seated at a lectern, boys with wax tablets and a horn book on benches, a large book open on a desk. |
| `work` | Первое дело | Craftsmen at work in a guild workshop: a master shoemaker cutting leather, an apprentice stitching, a journeyman hammering, finished shoes on a shelf. |
| `market` | Рынок, сделка | A merchant and a buyer haggling at a cloth stall, a money changer weighing coins on scales at a table, sacks of grain and a barrel of herring nearby. |
| `rich` | Новый дом, богатство | A prosperous burgher couple in fur-trimmed clothes in their new house, a servant bringing a silver jug, a carved chest of coins, a glazed window, a little dog. |
| `poor` | Долг, бедность | A poor family by a cold hearth, a creditor with a ledger and a bailiff carrying away a cooking pot and a blanket, the mother holding a child. |
| `rite` | Обряд, праздник веры | A village procession on a feast day: a priest under a canopy carrying a reliquary, banners, candles, townspeople kneeling as it passes, church bells. |
| `pilgrimage` | Паломничество, дорога | Pilgrims on the road with staffs, broad hats and scallop shell badges, a pack donkey, a wayside chapel, a distant walled city on a hill. |
| `court` | Суд или двор правителя | A lord or judge seated under a canopy in a hall, a clerk writing on a long scroll, a plaintiff kneeling, guards with halberds, a crowd behind a barrier. |
| `war` | Война, набег | Knights and foot soldiers fighting before the walls of a besieged town, banners, siege ladders, a burning barn in the distance, villagers fleeing with bundles. |
| `plague` | Мор | A plague-stricken street: a sick man lying in a doorway, a monk giving the last rites, a cart for the dead, a woman covering her face, a red cross painted on a door. |
| `famine` | Голод | A failed harvest: thin peasants in a field of withered, flattened wheat under a grey sky, an empty granary, a mother sharing a small loaf with children. |
| `fire` | Пожар или стихия | A fire in a town at night: timber houses burning, townspeople passing leather buckets of water in a chain, a priest ringing the alarm bell, sparks and smoke. |
| `funeral` | Похороны | A funeral procession to a churchyard: a coffin covered with a black pall carried by men, mourners in black hoods, a priest with a cross and candles. |

## C. Особые (16:9)

| id | Где | Промпт |
|---|---|---|
| `dream` | Сон о будущем | A sleeper in a curtained bed at night lit by one candle; above him, as in a vision in the painted sky, a glowing sphere of the Earth, a lens, a gear and a book float among clouds. Mysterious, calm, dreamlike, still in the same painting technique. |
| `primer` | Справка историка | A chronicler's desk in a monastery scriptorium: an open illuminated chronicle with a painted miniature, quill pens, an inkhorn, a candle, a hourglass, rolled charters with wax seals, light from a window on the left. |

## Как собрать промпт

Группа A: `[начало группы A] + [промпт места] + [общий блок стиля]`
Группа B и C: `[промпт момента] + [общий блок стиля]`
Пропорции и, если есть, ссылка на эталон - параметрами генератора.

Пример (Midjourney, улица):

```
Empty scene, no people, no animals. Wide panoramic composition. The bottom third is an open, flat, uncluttered
floor or ground strip running across the whole width. A narrow street of a late medieval Flemish or French
town: tall timber-framed houses with jettied upper floors and painted shutters, shop signs hanging on iron
brackets, a gutter in the middle of the cobbled street, a Gothic church spire in the distance. Early
Netherlandish oil painting on oak panel, c. 1430-1470, in the manner of Jan van Eyck, Robert Campin and Hans
Memling. [...] --ar 16:5 --no text, letters, people, watermark, frame
```

## Приёмка каждой картинки

- [ ] Похоже на нидерландскую живопись маслом XV века, а не на фэнтези, аниме или фото.
- [ ] Нет текста, букв, подписи, водяного знака, рамки.
- [ ] Нет анахронизмов: картофель, помидоры, кукуруза, табак, огнестрельное оружие, одежда XVI века и позже.
- [ ] Руки и лица без уродств; нет повторяющихся одинаковых лиц.
- [ ] Группа A: нет людей и животных; нижняя треть свободна и ровная; небо дневное, без погоды.
- [ ] Цвета и свет - как у эталона, свет слева.
- [ ] Файл для игры: нужный размер, WebP, до 120 КБ, имя - id из таблицы.

## Порядок работы

1. Эталоны: `place/street` и `wedding` (по 4–8 вариантов, выбрать лучшие).
2. Обязательные фоны A (ещё 9) и моменты B - по эталону.
3. Особые C, затем дополнительные фоны.
4. Сложить файлы в `src/art/europe/` - дальше подключение в игре (см. ниже).

## Что нужно доделать в коде

- Сейчас игра ждёт пиксельные иллюстрации 256×144 и рисует их с чёткими пикселями. Для живописи нужна
  плавная отрисовка и размеры 1024×576.
- Фонов мест (группа A) в игре пока нет: сцена событий и экрана жизни рисуется кодом. Нужно подставлять
  рисованный фон по месту события (`scene.place`), а поверх - человечков, животных, погоду и перекраску по
  времени суток и сезону.
- Человечки сейчас пиксельные; на живописном фоне они могут выглядеть чужеродно. Это проверим на первых
  фонах и решим: оставить, сделать их силуэтами в палитре картины или рисовать спрайты (G4 в TZ_graphics.md).
