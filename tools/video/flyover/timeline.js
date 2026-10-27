// Общая временная шкала ролика: скорость камеры вдоль страницы и моменты фраз озвучки (по паузам в звуке).
// Страница строится так, чтобы заголовок каждого раздела проходил середину кадра, когда звучит его фраза.

export const FPS = 60
export const DURATION = 68.8
export const PAGE_W = 640
/** Скорость полёта, CSS-пикселей страницы в секунду. */
export const CRUISE = 340

// Фазы (сдвиг шаблона на 51,4 с: полёт до 59,6, подъём, вид сверху, нырок, финальная карточка).
export const T = {
  flightEnd: 59.6,
  riseStart: 59.15,
  riseEnd: 60.65,
  tiltFrom: 59.55,
  tiltTo: 60.35,
  overheadEnd: 60.87,
  diveEnd: 61.37,
  badge: 61.42,
  line1: 61.52,
  tail: 62.85,
}

/** Доля крейсерской скорости в момент t (полёт). */
export function speedShare(t) {
  const ss = (a, b, x) => { const u = Math.min(1, Math.max(0, (x - a) / (b - a))); return u * u * (3 - 2 * u) }
  if (t <= 0.6) return 0.5 * ss(0, 0.6, t)
  if (t <= 1.25) return 0.5
  if (t <= 1.6) return 0.5 + 0.5 * ss(1.25, 1.6, t)
  const easeStart = T.flightEnd - 1.3
  if (t <= easeStart) return 1
  if (t <= T.flightEnd + 0.1) return 1 - 0.88 * ss(easeStart, T.flightEnd + 0.1, t)
  return 0.12
}

/** Пройденный путь вдоль страницы (CSS-пиксели) к моменту t — интеграл скорости. */
const STEP = 1 / 600
const table = []
{
  let y = 0
  for (let i = 0; i <= (T.riseEnd + 1) / STEP; i++) {
    table.push(y)
    y += speedShare(i * STEP) * CRUISE * STEP
  }
}
export function travel(t) {
  const i = Math.max(0, Math.min(table.length - 2, Math.floor(t / STEP)))
  const f = t / STEP - i
  return table[i] + (table[i + 1] - table[i]) * f
}

/** Фразы озвучки: начало звучания (с) и текст заголовка раздела на странице. */
export const BEATS = [
  { id: 'hero', t: 0 },
  { id: 'children', t: 1.98 },
  { id: 'plague', t: 4.83 },
  { id: 'born', t: 7.88 },
  { id: 'cities', t: 9.84 },
  { id: 'rank', t: 14.45 },
  { id: 'edge', t: 17.57 },
  { id: 'knowledge', t: 20.0 },
  { id: 'gunpowder', t: 22.31 },
  { id: 'smallpox', t: 24.33 },
  { id: 'earth', t: 25.8 },
  { id: 'dream', t: 27.45 },
  { id: 'sorcerer', t: 33.32 },
  { id: 'work', t: 38.37 },
  { id: 'marry', t: 41.28 },
  { id: 'flee', t: 43.4 },
  { id: 'die', t: 45.14 },
  { id: 'bloodline', t: 48.6 },
  { id: 'every', t: 52.4 },
  { id: 'world', t: 56.28 },
  { id: 'footer', t: 59.4 },
]
