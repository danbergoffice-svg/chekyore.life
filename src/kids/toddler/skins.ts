// Обёртки стран для ранних игр: одна механика - 14 историй. card - название занятия на карточке и заголовок игры.
import type { KidsLang } from '../types'
import type { ThingKind } from './art'

type L = Record<KidsLang, string>
const l = (ru: string, en: string, tr: string): L => ({ ru, en, tr })

export interface EraSkin {
  /** Цвет поля под игрой. */
  field: string
  collect: { thing: ThingKind; color?: string; card: L }
  sort: { thing: ThingKind; a: string; b: string; card: L }
  tower: { wall: string; card: L }
  pairs: { things: [ThingKind, string][]; card: L }
  cups: { box: 'basket' | 'pot'; pet: 'cat' | 'chick' | 'pup'; color?: string; card: L }
  rhythm: { colors: [string, string, string]; card: L }
  path: { animal: 'goat' | 'llama' | 'goose' | 'pup'; color?: string; obstacle: 'bush' | 'stone'; card: L }
}

export const SKINS: Record<string, EraSkin> = {
  ANE: {
    field: '#e2c995',
    collect: { thing: 'date', card: l('Финики под пальмой', 'Dates under the palm', 'Hurma ağacının altında hurmalar') },
    sort: { thing: 'bean', a: '#8a4b26', b: '#d9a441', card: l('Бобы и чечевица для мамы', 'Beans and lentils for mother', 'Annene fasulye ve mercimek') },
    tower: { wall: '#b98a55', card: l('Башня из глиняных кирпичиков', 'A tower of mud bricks', 'Kerpiçten kule') },
    pairs: { things: [['fish', '#7fa3c4'], ['flower', '#5b8fc9'], ['star', '#ecd06f']], card: l('Картинки на черепках', 'Pictures on potsherds', 'Çanak çömlekteki resimler') },
    cups: { box: 'basket', pet: 'cat', card: l('Прятки с котёнком', 'Hide-and-seek with the kitten', 'Kedi yavrusuyla saklambaç') },
    rhythm: { colors: ['#d07a52', '#5b8fc9', '#ecd06f'], card: l('Бубен с бабушкой', 'Drumming with grandmother', 'Ninenle def çalmak') },
    path: { animal: 'goat', obstacle: 'bush', card: l('Привести козлёнка домой', 'Bring the kid goat home', 'Oğlağı eve getir') },
  },
  E03: {
    field: '#d8cfae',
    collect: { thing: 'date', color: '#5d6b2e', card: l('Оливки под деревом', 'Olives under the tree', 'Ağacın altında zeytinler') },
    sort: { thing: 'stone', a: '#f1ead8', b: '#4a4440', card: l('Белые и чёрные камешки', 'White and black pebbles', 'Beyaz ve siyah çakıllar') },
    tower: { wall: '#e6dcc4', card: l('Храм из кубиков', 'A temple of blocks', 'Küplerden tapınak') },
    pairs: { things: [['fish', '#7fa3c4'], ['leaf', '#8a9a4a'], ['shell', '#e9c9a8']], card: l('Картинки на табличках', 'Pictures on wax tablets', 'Balmumu tabletlerde resimler') },
    cups: { box: 'pot', pet: 'pup', card: l('Прятки со щенком', 'Hide-and-seek with the puppy', 'Köpek yavrusuyla saklambaç') },
    rhythm: { colors: ['#c4573a', '#e6dcc4', '#5b8fc9'], card: l('Хлопать под флейту', 'Clapping to the flute', 'Flütle el çırpmak') },
    path: { animal: 'goat', color: '#f6f0e2', obstacle: 'stone', card: l('Привести ягнёнка домой', 'Bring the lamb home', 'Kuzuyu eve getir') },
  },
  BYZ: {
    field: '#cfd6cf',
    collect: { thing: 'shell', card: l('Ракушки в гавани', 'Shells by the harbour', 'Limanda deniz kabukları') },
    sort: { thing: 'stone', a: '#3d6fb0', b: '#d9b13a', card: l('Синие и золотые камешки', 'Blue and gold mosaic chips', 'Mavi ve altın mozaik taşları') },
    tower: { wall: '#c98a5e', card: l('Купол из кирпичиков', 'A dome of little bricks', 'Tuğlalardan kubbe') },
    pairs: { things: [['fish', '#7fa3c4'], ['star', '#ecd06f'], ['leaf', '#6e9a3e']], card: l('Картинки на изразцах', 'Pictures on tiles', 'Çinilerdeki resimler') },
    cups: { box: 'basket', pet: 'cat', color: '#8f8a84', card: l('Прятки с котёнком у пристани', 'Hide-and-seek with the harbour kitten', 'İskele kedisiyle saklambaç') },
    rhythm: { colors: ['#d9b13a', '#3d6fb0', '#a8573a'], card: l('Звонить в колокольчики', 'Ringing little bells', 'Çıngırak çalmak') },
    path: { animal: 'goose', obstacle: 'stone', card: l('Привести гуся домой', 'Bring the goose home', 'Kazı eve getir') },
  },
  RUS: {
    field: '#bfcf9e',
    collect: { thing: 'berry', card: l('Ягоды на опушке', 'Berries at the forest edge', 'Orman kıyısında yemişler') },
    sort: { thing: 'berry', a: '#c23a3a', b: '#3d4a8a', card: l('Брусника и черника', 'Lingonberries and blueberries', 'Kırmızı ve mavi yemişler') },
    tower: { wall: '#a8784a', card: l('Терем из чурочек', 'A log tower of little blocks', 'Takozlardan köşk') },
    pairs: { things: [['berry', '#b53a4a'], ['leaf', '#6e9a3e'], ['fish', '#7fa3c4']], card: l('Картинки на бересте', 'Pictures on birch bark', 'Huş kabuğunda resimler') },
    cups: { box: 'basket', pet: 'cat', color: '#7a6a5a', card: l('Прятки с котёнком', 'Hide-and-seek with the kitten', 'Kedi yavrusuyla saklambaç') },
    rhythm: { colors: ['#c23a3a', '#d9b13a', '#5f8a3a'], card: l('Ложки с дедом', 'Playing spoons with grandpa', 'Dedenle kaşık çalmak') },
    path: { animal: 'goose', obstacle: 'bush', card: l('Привести гусёнка домой', 'Bring the gosling home', 'Kaz yavrusunu eve getir') },
  },
  EUR: {
    field: '#c4d09a',
    collect: { thing: 'apple', card: l('Яблоки в саду', 'Apples in the orchard', 'Bahçede elmalar') },
    sort: { thing: 'egg', a: '#f4ecd8', b: '#b98455', card: l('Белые и бурые яйца', 'White and brown eggs', 'Beyaz ve kahverengi yumurtalar') },
    tower: { wall: '#a8a294', card: l('Замок из кубиков', 'A castle of blocks', 'Küplerden kale') },
    pairs: { things: [['star', '#ecd06f'], ['flower', '#c9442e'], ['fish', '#7fa3c4']], card: l('Картинки-гербы', 'Coat-of-arms pictures', 'Arma resimleri') },
    cups: { box: 'basket', pet: 'chick', card: l('Прятки с цыплёнком', 'Hide-and-seek with the chick', 'Civcivle saklambaç') },
    rhythm: { colors: ['#c9442e', '#3d6fb0', '#d9b13a'], card: l('Колокольчики на ярмарке', 'Bells at the fair', 'Panayırda çanlar') },
    path: { animal: 'goose', obstacle: 'bush', card: l('Привести гуся домой', 'Bring the goose home', 'Kazı eve getir') },
  },
  ISL: {
    field: '#e6d3a8',
    collect: { thing: 'date', card: l('Финики во дворе', 'Dates in the courtyard', 'Avluda hurmalar') },
    sort: { thing: 'bean', a: '#8aa84a', b: '#5a2e4a', card: l('Фисташки и изюм', 'Pistachios and raisins', 'Fıstık ve kuru üzüm') },
    tower: { wall: '#d9c39b', card: l('Минарет из кубиков', 'A minaret of blocks', 'Küplerden minare') },
    pairs: { things: [['star', '#3d8a8a'], ['flower', '#3d6fb0'], ['leaf', '#6e9a3e']], card: l('Узоры-близнецы на плитках', 'Twin patterns on tiles', 'Çinilerde ikiz desenler') },
    cups: { box: 'pot', pet: 'cat', card: l('Прятки с котёнком', 'Hide-and-seek with the kitten', 'Kedi yavrusuyla saklambaç') },
    rhythm: { colors: ['#3d8a8a', '#d9b13a', '#a8573a'], card: l('Бубен с тётей', 'The frame drum with auntie', 'Teyzenle def çalmak') },
    path: { animal: 'goat', color: '#f6f0e2', obstacle: 'stone', card: l('Привести ягнёнка домой', 'Bring the lamb home', 'Kuzuyu eve getir') },
  },
  IND: {
    field: '#d8c48a',
    collect: { thing: 'flower', card: l('Цветы для гирлянды', 'Flowers for a garland', 'Çelenk için çiçekler') },
    sort: { thing: 'bean', a: '#f1ead8', b: '#e0883a', card: l('Рис и чечевица', 'Rice and lentils', 'Pirinç ve mercimek') },
    tower: { wall: '#c9784a', card: l('Храм из кубиков', 'A temple of blocks', 'Küplerden tapınak') },
    pairs: { things: [['flower', '#d94a7a'], ['fish', '#7fa3c4'], ['star', '#ecd06f']], card: l('Парные картинки с бабушкой', 'Picture pairs with grandmother', 'Ninenle resim eşleri') },
    cups: { box: 'pot', pet: 'chick', card: l('Прятки с цыплёнком', 'Hide-and-seek with the chick', 'Civcivle saklambaç') },
    rhythm: { colors: ['#d94a7a', '#e0883a', '#3d8a8a'], card: l('Барабанчики с дядей', 'Little drums with uncle', 'Amcanla küçük davullar') },
    path: { animal: 'goat', color: '#7a5a3a', obstacle: 'bush', card: l('Привести козлёнка домой', 'Bring the kid goat home', 'Oğlağı eve getir') },
  },
  CHN: {
    field: '#c8d4a2',
    collect: { thing: 'berry', color: '#5a2a4a', card: l('Шелковица в саду', 'Mulberries in the garden', 'Bahçede dut') },
    sort: { thing: 'bean', a: '#b23a3a', b: '#6e9a3e', card: l('Красные и зелёные бобы', 'Red and green beans', 'Kırmızı ve yeşil fasulyeler') },
    tower: { wall: '#b23a3a', card: l('Пагода из кубиков', 'A pagoda of blocks', 'Küplerden pagoda') },
    pairs: { things: [['fish', '#e0883a'], ['flower', '#e8a0b0'], ['leaf', '#6e9a3e']], card: l('Картинки на веерах', 'Pictures on fans', 'Yelpazelerdeki resimler') },
    cups: { box: 'basket', pet: 'chick', card: l('Прятки с цыплёнком', 'Hide-and-seek with the chick', 'Civcivle saklambaç') },
    rhythm: { colors: ['#b23a3a', '#d9b13a', '#3d8a6a'], card: l('Гонг и колокольчики', 'Gong and chimes', 'Gong ve çanlar') },
    path: { animal: 'goose', color: '#e8c14a', obstacle: 'stone', card: l('Привести утёнка домой', 'Bring the duckling home', 'Ördek yavrusunu eve getir') },
  },
  JPN: {
    field: '#e3d5b0',
    collect: { thing: 'shell', card: l('Ракушки на берегу', 'Shells on the shore', 'Kıyıda deniz kabukları') },
    sort: { thing: 'stone', a: '#f4f0e6', b: '#3a3836', card: l('Камни для игры го', 'Stones for the game of go', 'Go oyunu taşları') },
    tower: { wall: '#9a6a44', card: l('Башня из брусков', 'A tower of wooden blocks', 'Tahta bloklardan kule') },
    pairs: { things: [['shell', '#e9c9a8'], ['flower', '#e8a0b0'], ['fish', '#c9442e']], card: l('Найди пару ракушке', 'Match the shells', 'Deniz kabuğunun eşini bul') },
    cups: { box: 'basket', pet: 'cat', color: '#f0ebe0', card: l('Прятки с котёнком', 'Hide-and-seek with the kitten', 'Kedi yavrusuyla saklambaç') },
    rhythm: { colors: ['#c9442e', '#4a4846', '#d9b13a'], card: l('Барабан на празднике', 'The festival drum', 'Bayram davulu') },
    path: { animal: 'goose', obstacle: 'stone', card: l('Привести утку домой', 'Bring the duck home', 'Ördeği eve getir') },
  },
  ETH: {
    field: '#d6c08a',
    collect: { thing: 'berry', color: '#c4302a', card: l('Кофейные ягоды', 'Coffee cherries', 'Kahve kirazları') },
    sort: { thing: 'bean', a: '#e8d9b0', b: '#7a4a2a', card: l('Светлые и тёмные зёрна', 'Light and dark grains', 'Açık ve koyu taneler') },
    tower: { wall: '#8f8478', card: l('Башня из камней', 'A tower of stones', 'Taşlardan kule') },
    pairs: { things: [['star', '#ecd06f'], ['flower', '#c4302a'], ['leaf', '#6e9a3e']], card: l('Узоры на корзинках', 'Patterns on baskets', 'Sepet desenleri') },
    cups: { box: 'basket', pet: 'chick', card: l('Прятки с цыплёнком', 'Hide-and-seek with the chick', 'Civcivle saklambaç') },
    rhythm: { colors: ['#c4302a', '#d9b13a', '#4f7a34'], card: l('Барабан с отцом', 'The drum with father', 'Babanla davul') },
    path: { animal: 'goat', color: '#7a6250', obstacle: 'bush', card: l('Привести козлёнка домой', 'Bring the kid goat home', 'Oğlağı eve getir') },
  },
  MNG: {
    field: '#b8bf7e',
    collect: { thing: 'stone', color: '#efe8d8', card: l('Ааруул на крыше юрты', 'Curds drying on the yurt', 'Çadırın damında kurut') },
    sort: { thing: 'bean', a: '#efe8d8', b: '#8a5a34', card: l('Белые и бурые косточки-шагай', 'White and brown shagai bones', 'Ak ve kahverengi şagay aşıkları') },
    tower: { wall: '#e6dcc4', card: l('Юрта из войлочных кубиков', 'A yurt of felt blocks', 'Keçe bloklardan çadır') },
    pairs: { things: [['star', '#ecd06f'], ['flower', '#c0503a'], ['leaf', '#3a5a8a']], card: l('Узоры на войлоке', 'Patterns on the felt', 'Keçedeki desenler') },
    cups: { box: 'basket', pet: 'pup', card: l('Прятки со щенком-банхаром', 'Hide-and-seek with the bankhar pup', 'Banhar yavrusuyla saklambaç') },
    rhythm: { colors: ['#3a5a8a', '#c0503a', '#ecd06f'], card: l('Бубен на празднике', 'The festival drum', 'Bayram davulu') },
    path: { animal: 'goat', color: '#efe8d8', obstacle: 'stone', card: l('Привести ягнёнка к юрте', 'Bring the lamb to the yurt', 'Kuzuyu çadıra getir') },
  },
  WAF: {
    field: '#dcc08a',
    collect: { thing: 'date', color: '#7a8a3a', card: l('Плоды ши под деревом', 'Shea fruits under the tree', 'Ağacın altında şi meyveleri') },
    sort: { thing: 'shell', a: '#f3ead8', b: '#c4573a', card: l('Каури и бусины', 'Cowries and beads', 'Deniz kabukları ve boncuklar') },
    tower: { wall: '#a8784a', card: l('Глиняная башня, как мечеть', 'A mud tower like the mosque', 'Cami gibi kerpiç kule') },
    pairs: { things: [['star', '#ecd06f'], ['fish', '#7fa3c4'], ['shell', '#e9c9a8']], card: l('Узоры на ткани', 'Cloth patterns', 'Kumaş desenleri') },
    cups: { box: 'pot', pet: 'chick', card: l('Прятки с цыплёнком', 'Hide-and-seek with the chick', 'Civcivle saklambaç') },
    rhythm: { colors: ['#c4573a', '#d9b13a', '#3d6f5a'], card: l('Барабан с гриотом', 'Drumming with the griot', 'Griotla davul') },
    path: { animal: 'goat', obstacle: 'bush', card: l('Привести козлёнка домой', 'Bring the kid goat home', 'Oğlağı eve getir') },
  },
  MAY: {
    field: '#b8c98e',
    collect: { thing: 'bean', color: '#6e3a24', card: l('Бобы какао', 'Cacao beans', 'Kakao çekirdekleri') },
    sort: { thing: 'bean', a: '#e8c14a', b: '#3d4a8a', card: l('Жёлтые и синие зёрна кукурузы', 'Yellow and blue maize', 'Sarı ve mavi mısır taneleri') },
    tower: { wall: '#d9cdb0', card: l('Пирамида из кубиков', 'A pyramid of blocks', 'Küplerden piramit') },
    pairs: { things: [['star', '#ecd06f'], ['fish', '#7fa3c4'], ['flower', '#3d8a8a']], card: l('Знаки, как у писцов', 'Glyphs like the scribes draw', 'Kâtiplerin işaretleri gibi') },
    cups: { box: 'pot', pet: 'chick', card: l('Прятки с индюшонком', 'Hide-and-seek with the turkey chick', 'Hindi yavrusuyla saklambaç') },
    rhythm: { colors: ['#3d8a8a', '#c4573a', '#e8c14a'], card: l('Барабан и погремушки', 'Drum and rattles', 'Davul ve çıngıraklar') },
    path: { animal: 'pup', obstacle: 'bush', card: l('Привести щенка домой', 'Bring the puppy home', 'Köpek yavrusunu eve getir') },
  },
  AMR: {
    field: '#c9d0a0',
    collect: { thing: 'flower', color: '#e8c14a', card: l('Цветы на грядках', 'Flowers in the garden beds', 'Tarhlarda çiçekler') },
    sort: { thing: 'bean', a: '#b23a3a', b: '#f1ead8', card: l('Красная и белая фасоль', 'Red and white beans', 'Kırmızı ve beyaz fasulye') },
    tower: { wall: '#9c958a', card: l('Каменная стена, как у инков', 'A stone wall like the Incas build', 'İnkalarınki gibi taş duvar') },
    pairs: { things: [['flower', '#e88a3a'], ['star', '#ecd06f'], ['leaf', '#3d8a6a']], card: l('Картинки из перьев', 'Feather pictures', 'Tüy resimleri') },
    cups: { box: 'pot', pet: 'pup', card: l('Прятки со щенком', 'Hide-and-seek with the puppy', 'Köpek yavrusuyla saklambaç') },
    rhythm: { colors: ['#3d8a6a', '#c4302a', '#e8c14a'], card: l('Флейта и барабан', 'Flute and drum', 'Flüt ve davul') },
    path: { animal: 'llama', obstacle: 'stone', card: l('Привести ламу домой', 'Bring the llama home', 'Lamayı eve getir') },
  },
}

export function skinOf(era: string): EraSkin {
  return SKINS[era] ?? SKINS.ANE
}
