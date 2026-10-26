// Звук промо-ролика: node tools/video/soundtrack.mjs <выход.wav>
// 20 секунд, стерео 48 кГц: бит 120 ударов в минуту (переходы сцен — ровно на долях), бас и арпеджио
// в ре мажоре (I–vi–IV–V), подкладка, и звуки событий на экране — по тем же моментам, что в promo.ts.
import fs from 'node:fs'

const SR = 48000
const DUR = 20
const N = SR * DUR
const L = new Float32Array(N)
const R = new Float32Array(N)
const BEAT = 0.5

function rng(seed) {
  let h = seed >>> 0
  return () => {
    h = (h + 0x6d2b79f5) | 0
    let x = Math.imul(h ^ (h >>> 15), h | 1)
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61)
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296
  }
}
const noise = rng(42)
const hz = (m) => 440 * 2 ** ((m - 69) / 12)

/** Положить звук: gen(t) → значение, длина в секундах, громкость, панорама −1…1. */
function put(at, len, gain, pan, gen) {
  const s = Math.floor(at * SR)
  const n = Math.floor(len * SR)
  const gl = gain * Math.cos(((pan + 1) * Math.PI) / 4)
  const gr = gain * Math.sin(((pan + 1) * Math.PI) / 4)
  for (let i = 0; i < n && s + i < N; i++) {
    if (s + i < 0) continue
    const v = gen(i / SR, i)
    L[s + i] += v * gl
    R[s + i] += v * gr
  }
}

// ---------- Инструменты ----------

const kick = (at, g = 1) => put(at, 0.45, 0.9 * g, 0, (t) => Math.sin(2 * Math.PI * (45 * t + 90 * 0.035 * (1 - Math.exp(-t / 0.035)))) * Math.exp(-t / 0.18) + (t < 0.004 ? (noise() - 0.5) * 0.6 : 0))
function hat(at, g = 1, open = false) {
  let prev = 0
  put(at, open ? 0.25 : 0.06, 0.18 * g, 0.25, (t) => {
    const n = noise() * 2 - 1
    const hp = n - prev
    prev = n
    return hp * Math.exp(-t / (open ? 0.08 : 0.018))
  })
}
function clap(at, g = 1) {
  let lp = 0
  put(at, 0.3, 0.35 * g, -0.1, (t) => {
    lp = lp * 0.6 + (noise() * 2 - 1) * 0.4
    const env = Math.exp(-t / 0.09) * (t < 0.03 ? 0.6 + 0.4 * Math.sin(t * 600) : 1)
    return lp * env
  })
}
function bass(at, m, len) {
  put(at, len + 0.05, 0.32, 0, (t) => {
    const f = hz(m)
    const v = Math.sin(2 * Math.PI * f * t) + 0.35 * Math.sin(4 * Math.PI * f * t) + 0.15 * Math.sign(Math.sin(2 * Math.PI * f * t))
    return v * Math.min(1, t / 0.005) * Math.exp(-t / 0.35) * (t > len ? Math.max(0, 1 - (t - len) / 0.05) : 1)
  })
}
/** Щипок (Карплус — Стронг) — арпеджио и мелодия. */
function pluck(at, m, g, pan, decay = 0.996) {
  const f = hz(m)
  const n = Math.round(SR / f)
  const buf = new Float32Array(n)
  const r = rng(Math.round(at * 1000 + m))
  let p = 0
  for (let i = 0; i < n; i++) {
    p = p * 0.45 + (r() * 2 - 1) * 0.55
    buf[i] = p
  }
  let idx = 0
  put(at, 1.6, g, pan, () => {
    const a = buf[idx]
    const v = decay * 0.5 * (a + buf[(idx + 1) % n])
    buf[idx] = v
    idx = (idx + 1) % n
    return a
  })
}
function pad(at, notes, len, g) {
  for (const [k, m] of notes.entries())
    put(at, len + 0.8, g, k % 2 ? 0.4 : -0.4, (t) => {
      const f = hz(m)
      const env = Math.min(1, t / 0.5) * (t > len ? Math.max(0, 1 - (t - len) / 0.8) : 1)
      return (Math.sin(2 * Math.PI * f * t) + 0.3 * Math.sin(2 * Math.PI * f * 2.003 * t) + 0.15 * Math.sin(2 * Math.PI * f * 3 * t)) * env
    })
}
function bell(at, m, g, pan = 0) {
  const f = hz(m)
  put(at, 2.5, g, pan, (t) => [[1, 1, 1.2], [2.76, 0.4, 0.5], [5.4, 0.2, 0.25], [2, 0.3, 0.8]].reduce((s, [mul, a, d]) => s + a * Math.sin(2 * Math.PI * f * mul * t) * Math.exp(-t / d), 0) * Math.min(1, t / 0.002))
}
/** Свист перехода: шум через полосовой фильтр, частота растёт, затем падает. */
function whoosh(center, len = 0.6, g = 0.35, up = true) {
  let y1 = 0
  let y2 = 0
  put(center - len / 2, len, g, 0, (t) => {
    const k = t / len
    const fc = up ? 300 + 5000 * Math.sin(Math.PI * k) ** 2 : 4000 - 3500 * k
    const w = (2 * Math.PI * fc) / SR
    const q = 1.6
    const alpha = Math.sin(w) / (2 * q)
    const x = noise() * 2 - 1
    const y = (alpha * x + 2 * Math.cos(w) * y1 - (1 - alpha) * y2) / (1 + alpha)
    y2 = y1
    y1 = y
    return y * Math.sin(Math.PI * k) * 3
  })
}
const tick = (at, g = 0.25) => put(at, 0.03, g, 0.3, (t) => (noise() * 2 - 1) * Math.exp(-t / 0.006) + Math.sin(2 * Math.PI * 2400 * t) * Math.exp(-t / 0.01) * 0.5)
const thunk = (at) => {
  kick(at, 0.5)
  put(at, 0.12, 0.35, 0, (t) => Math.sin(2 * Math.PI * 180 * t) * Math.exp(-t / 0.04) + (noise() - 0.5) * Math.exp(-t / 0.01))
}
const pop = (at, m = 84, g = 0.22, pan = 0) => put(at, 0.18, g, pan, (t) => Math.sin(2 * Math.PI * hz(m) * t * (1 + 0.5 * Math.exp(-t / 0.02))) * Math.exp(-t / 0.06))
function riser(at, len, g) {
  put(at, len, g, 0, (t) => {
    const k = t / len
    return (noise() * 2 - 1) * k * k * 0.5 + Math.sin(2 * Math.PI * (200 + 1200 * k * k) * t) * k * 0.2
  })
}
function crash(at, g) {
  let prev = 0
  put(at, 2.2, g, 0, (t) => {
    const n = noise() * 2 - 1
    const hp = n - prev * 0.6
    prev = n
    return hp * Math.exp(-t / 0.7)
  })
}

// ---------- Музыка ----------
// Ре мажор: D (62) – Bm (59) – G (55) – A (57); такт = 2 с.
const CHORDS = [
  [50, [62, 66, 69, 74]],
  [47, [59, 62, 66, 71]],
  [43, [55, 59, 62, 67]],
  [45, [57, 61, 64, 69]],
]
const PENTA = [62, 64, 66, 69, 71, 74, 76, 78, 81]

// Вступление (0–2): подкладка, звенящая арфа и нарастание к лотерее.
pad(0, [62, 66, 69], 2, 0.06)
;[74, 78, 81, 86].forEach((m, i) => pluck(0.25 + i * 0.12, m, 0.18, i % 2 ? 0.5 : -0.5))
bell(0.3, 74, 0.12)
riser(1.2, 0.8, 0.18)

for (let bar = 1; bar < 9; bar++) {
  const t0 = bar * 2
  const [root, chord] = CHORDS[(bar - 1) % 4]
  const quiet = t0 >= 9.5 && t0 < 12 // выбор: музыка сдержаннее
  pad(t0, chord.slice(0, 3), 2, quiet ? 0.035 : 0.05)
  for (let b = 0; b < 4; b++) {
    const at = t0 + b * BEAT
    if (at >= 18) break
    kick(at, quiet ? 0.6 : 1)
    if (b % 2 === 1 && !quiet) clap(at, 0.8)
    hat(at + BEAT / 2, 0.9, b === 3)
    hat(at + BEAT / 4, 0.4)
    hat(at + (3 * BEAT) / 4, 0.4)
    bass(at, root, BEAT * 0.8)
  }
  // Арпеджио шестнадцатыми по аккорду, на две октавы.
  for (let k = 0; k < 16; k++) {
    const at = t0 + k * (BEAT / 4)
    if (at >= 18) break
    const m = chord[[0, 1, 2, 3, 2, 1, 2, 3][k % 8]] + 12
    pluck(at, m, quiet ? 0.07 : 0.1, k % 2 ? 0.45 : -0.45, 0.993)
  }
}

// ---------- Звуки событий (моменты как в promo.ts) ----------

// Переходы сцен.
for (const at of [2, 5.5, 9.5, 12.5, 15.5, 18]) whoosh(at, 0.55, 0.3)

// Лотерея: рычаг, щелчки барабанов по каждой строке, удары остановки, звон выигрыша, итог.
put(2.2, 0.25, 0.4, 0.6, (t) => Math.sin(2 * Math.PI * 140 * t) * Math.exp(-t / 0.05) + (noise() - 0.5) * Math.exp(-t / 0.03))
const SPIN = 2.42
const STOPS = [3.55, 4.05, 4.55]
const FINAL = [30, 34, 40]
const outBack = (k, s) => 1 + (s + 1) * (k - 1) ** 3 + s * (k - 1) ** 2
STOPS.forEach((stop, r) => {
  let last = 0
  for (let t = SPIN; t < stop; t += 1 / 600) {
    const pos = Math.floor(FINAL[r] * outBack((t - SPIN) / (stop - SPIN), 0.9))
    if (pos !== last) {
      tick(t, 0.12)
      last = pos
    }
  }
  thunk(stop)
  bell(stop + 0.02, [74, 78, 81][r], 0.16, [-0.5, 0, 0.5][r])
})
;[74, 78, 81, 86, 90].forEach((m, i) => bell(4.6 + i * 0.07, m, 0.1, i % 2 ? 0.4 : -0.4))
whoosh(5.0, 0.4, 0.2)

// Жизнь: карточки ленты появляются в годы 3, 9, 14, 22, 41, 63.
const LIFE_T0 = 5.75
const LIFE_T1 = 9.1
const inOut = (k) => (k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2)
const lifeAge = (t) => {
  const k = Math.max(0, Math.min(1, (t - LIFE_T0) / (LIFE_T1 - LIFE_T0)))
  return Math.round(72 * inOut(k) * 0.98 + k * 72 * 0.02)
}
const ageTime = (a) => {
  let lo = LIFE_T0
  let hi = LIFE_T1
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2
    if (lifeAge(mid) < a) lo = mid
    else hi = mid
  }
  return hi
}
;[3, 9, 14, 22, 41, 63].forEach((a, i) => pop(ageTime(a) + 0.05, PENTA[i + 2], 0.2, 0.3))

// Выбор: курсор, щелчок, переворот карточки, удача, значки итога.
whoosh(10.5, 0.6, 0.08, false)
put(10.85, 0.05, 0.4, 0.2, (t) => (noise() * 2 - 1) * Math.exp(-t / 0.004) + Math.sin(2 * Math.PI * 3000 * t) * Math.exp(-t / 0.008))
whoosh(11.3, 0.35, 0.25)
;[74, 78, 81, 86].forEach((m, i) => bell(11.45 + i * 0.06, m, 0.14, 0))
;[0, 1, 2].forEach((i) => pop(11.55 + i * 0.12, [76, 79, 83][i], 0.18, -0.3 + i * 0.3))

// 13 миров: блеск плиток и восходящие «пики» на каждом портрете.
for (let i = 0; i < 7; i++) pop(12.62 + i * 0.06, 86 + (i % 3) * 3, 0.06, -0.6 + i * 0.2)
for (let i = 0; i < 13; i++) pop(13.55 + i * 0.07, PENTA[i % PENTA.length] + 12, 0.11, -0.8 + i * 0.13)

// Род: колокол на каждое поколение, выше и выше.
;[15.75, 16.15, 16.55, 16.95].forEach((at, i) => bell(at + 0.05, [62, 66, 69, 74][i], 0.2, -0.6 + i * 0.4))

// Финал: большой удар, тарелка, аккорд, затем звон кнопки.
riser(17.2, 0.8, 0.22)
kick(18, 1.3)
crash(18, 0.25)
pad(18, [50, 62, 66, 69, 74], 1.6, 0.07)
;[62, 66, 69, 74, 78].forEach((m, i) => pluck(18.02 + i * 0.03, m, 0.16, -0.4 + i * 0.2, 0.998))
bell(19.18, 86, 0.16)
bell(19.24, 90, 0.12)

// ---------- Сведение ----------

// Мягкий лимитер и нормализация; последние 0,25 с — затухание.
let peak = 0
for (let i = 0; i < N; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]))
const pre = 1.4 / peak
const buf = Buffer.alloc(44 + N * 4)
buf.write('RIFF', 0)
buf.writeUInt32LE(36 + N * 4, 4)
buf.write('WAVEfmt ', 8)
buf.writeUInt32LE(16, 16)
buf.writeUInt16LE(1, 20)
buf.writeUInt16LE(2, 22)
buf.writeUInt32LE(SR, 24)
buf.writeUInt32LE(SR * 4, 28)
buf.writeUInt16LE(4, 32)
buf.writeUInt16LE(16, 34)
buf.write('data', 36)
buf.writeUInt32LE(N * 4, 40)
for (let i = 0; i < N; i++) {
  const t = i / SR
  const fade = Math.min(1, t / 0.05, (DUR - t) / 0.25)
  const l = Math.tanh(L[i] * pre) * 0.75 * fade
  const r = Math.tanh(R[i] * pre) * 0.75 * fade
  buf.writeInt16LE(Math.round(l * 32767), 44 + i * 4)
  buf.writeInt16LE(Math.round(r * 32767), 46 + i * 4)
}
fs.writeFileSync(process.argv[2] ?? 'promo.wav', buf)
console.log('звук готов:', process.argv[2] ?? 'promo.wav')
