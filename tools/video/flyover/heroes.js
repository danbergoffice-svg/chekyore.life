// Герои-спутники ролика (вместо значков сайта): восемь эпох и краёв — Египет, Япония, Русь, Мали слева от кнопки,
// Европа, ацтеки, Багдад, Китай справа. Общие для страницы (landing.html) и рендера (film.js): портрет 32×40 в рамке.
export const HEROES = [
  { region: 'thebes', sex: 'm', age: 24, seed: 'v-hero-egypt', cls: 'noble', happiness: 85 },
  { region: 'kyoto', sex: 'm', age: 27, seed: 'v-hero-kyoto', cls: 'noble', happiness: 80 },
  { region: 'kiev', sex: 'f', age: 22, seed: 'v-hero-kiev', cls: 'landowner', married: true, happiness: 85 },
  { region: 'niani', sex: 'm', age: 28, seed: 'v-hero-mali', cls: 'noble', happiness: 80 },
  { region: 'paris', sex: 'm', age: 30, seed: 'v-hero-paris', cls: 'noble', happiness: 80 },
  { region: 'tenochtitlan', sex: 'm', age: 22, seed: 'v-hero-aztec', cls: 'noble', happiness: 85 },
  { region: 'baghdad', sex: 'm', age: 35, seed: 'v-hero-baghdad', cls: 'trader', happiness: 75 },
  { region: 'kaifeng', sex: 'f', age: 20, seed: 'v-hero-kaifeng', cls: 'noble', happiness: 85 },
]

// Локации вместо тёмной полосы «знаний из будущего»: сменяют друг друга под разделами.
export const LOCATIONS = [
  { region: 'constantinople', time: 'night', props: ['moon'] },
  { region: 'delhi', time: 'sunset', props: ['sun'] },
  { region: 'kaifeng', time: 'dawn', props: ['sun'] },
  { region: 'thebes', time: 'day', props: ['sun'] },
  { region: 'tikal', time: 'sunset', props: ['sun'] },
  { region: 'novgorod', time: 'night', props: ['moon'] },
]
