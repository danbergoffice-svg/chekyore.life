// Пиксельные иконки для макетов вместо эмодзи: карта из символов → картинка. <img data-icon="crown" data-pal="ink" data-px="3">
const ICONS = {
  chest: [
    '............',
    '..########..',
    '.#aaaaaaaa#.',
    '.#a#aaaa#a#.',
    '############',
    '#bbbbbbbbbb#',
    '#bbbb##bbbb#',
    '#bbbb#c#bbb#',
    '#bbbbbbbbbb#',
    '############',
  ],
  crown: [
    '............',
    '.#...#...#..',
    '.##.###.##..',
    '.#a##a##a#..',
    '.#aaaaaaa#..',
    '.#acacaca#..',
    '.#aaaaaaa#..',
    '.#########..',
  ],
  lock: [
    '...####...',
    '..#....#..',
    '..#....#..',
    '.########.',
    '.#aaaaaa#.',
    '.#aa##aa#.',
    '.#aa##aa#.',
    '.#aaaaaa#.',
    '.########.',
  ],
  heart: ['.##.##.', '#aa#aa#', '#aaaaa#', '.#aaa#.', '..#a#..', '...#...'],
  heartEmpty: ['.##.##.', '#..#..#', '#.....#', '.#...#.', '..#.#..', '...#...'],
  coin: ['.####.', '#aaaa#', '#a##a#', '#a##a#', '#aaaa#', '.####.'],
  speaker: ['...#....', '..##..#.', '###a#..#', '#aaa#.#.', '#aaa#.#.', '###a#..#', '..##..#.', '...#....'],
  grave: ['..####..', '.#aaaa#.', '#aa##aa#', '#a####a#', '#aa##aa#', '#aaaaaa#', '#aaaaaa#', '########'],
  medal: ['#......#', '##....##', '.##..##.', '..#aa#..', '.#aaaa#.', '#aa##aa#', '#aa##aa#', '.#aaaa#.', '..####..'],
  gear: ['...##...', '.#.##.#.', '..####..', '###..###', '###..###', '..####..', '.#.##.#.', '...##...'],
  book: ['########', '#aaa#bb#', '#aaa#bb#', '#aaa#bb#', '#aaa#bb#', '#aaa#bb#', '########'],
  letter: ['##########', '##aaaaaa##', '#a#aaaa#a#', '#aa#aa#aa#', '#aaa##aaa#', '#aaaaaaaa#', '##########'],
  play: ['#....', '##...', '#a#..', '#aa#.', '#a#..', '##...', '#....'],
  pause: ['##.##', '##.##', '##.##', '##.##', '##.##', '##.##'],
  hand: ['......####', '.....#aaa#', '########a#', '#aaaaaaaa#', '#a######a#', '#aaaaaaaa#', '##########'],
  hourglass: ['#######', '.#aaa#.', '..#a#..', '...#...', '..#.#..', '.#aaa#.', '#######'],
  star: ['...#...', '..#a#..', '###a###', '.#aaa#.', '..#a#..', '.#.#.#.'],
  sun: ['..#.#..', '#.###.#', '.#aaa#.', '##aaa##', '.#aaa#.', '#.###.#', '..#.#..'],
}
const PALS = {
  ink: { '#': '#1f1a14', a: '#b23a1e', b: '#b8913a', c: '#f1e4c4' },
  inkplain: { '#': '#2a2218', a: '#2a2218', b: '#2a2218', c: '#e9dcc0' },
  gold: { '#': '#1b1424', a: '#f0c048', b: '#c77d2e', c: '#fff3c4' },
  red: { '#': '#1b1424', a: '#e8484a', b: '#e8484a', c: '#ffd0c0' },
  light: { '#': '#f3e7c9', a: '#f3e7c9', b: '#f3e7c9', c: '#f3e7c9' },
  teal: { '#': '#0f2a2a', a: '#3fc1b0', b: '#2a8c80', c: '#c8fff4' },
  brass: { '#': '#3a2410', a: '#e2b45a', b: '#a8752a', c: '#fff0c8' },
}
function pixelIcon(name, pal = 'ink', px = 3) {
  const map = ICONS[name]
  const colors = PALS[pal]
  const w = Math.max(...map.map((r) => r.length))
  const cv = document.createElement('canvas')
  cv.width = w * px
  cv.height = map.length * px
  const ctx = cv.getContext('2d')
  map.forEach((row, y) => [...row].forEach((ch, x) => {
    if (ch === '.' || !colors[ch]) return
    ctx.fillStyle = colors[ch]
    ctx.fillRect(x * px, y * px, px, px)
  }))
  return cv.toDataURL()
}
for (const img of document.querySelectorAll('img[data-icon]')) img.src = pixelIcon(img.dataset.icon, img.dataset.pal, Number(img.dataset.px || 3))
