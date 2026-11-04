// Звук ролика про кости: node tools/video/dice-sound.mjs <выход.wav>
// 15 секунд, стерео 48 кГц: бит 120 ударов в минуту, бас в ре миноре, треск костей на бросках, удары при падении,
// звон на подмене кости и выигрыше, удары на ступенях ставок, финальный аккорд - по тем же моментам, что в dice.ts.
import fs from 'node:fs'

const SR = 48000
const DUR = 15
const N = SR * DUR
const L = new Float32Array(N)
const R = new Float32Array(N)

function rng(seed) {
  let h = seed >>> 0
  return () => {
    h = (h + 0x6d2b79f5) | 0
    let x = Math.imul(h ^ (h >>> 15), h | 1)
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61)
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296
  }
}
const noise = rng(7)
const hz = (m) => 440 * 2 ** ((m - 69) / 12)

function put(at, len, gain, pan, gen) {
  const s = Math.floor(at * SR)
  const n = Math.floor(len * SR)
  const gl = gain * Math.cos(((pan + 1) * Math.PI) / 4)
  const gr = gain * Math.sin(((pan + 1) * Math.PI) / 4)
  for (let i = 0; i < n && s + i < N; i++) {
    if (s + i < 0) continue
    const v = gen(i / SR)
    L[s + i] += v * gl
    R[s + i] += v * gr
  }
}

const kick = (at, g = 1) => put(at, 0.45, 0.85 * g, 0, (t) => Math.sin(2 * Math.PI * (45 * t + 90 * 0.035 * (1 - Math.exp(-t / 0.035)))) * Math.exp(-t / 0.18))
function hat(at, g = 1) {
  let prev = 0
  put(at, 0.06, 0.14 * g, 0.3, (t) => {
    const n = noise() * 2 - 1
    const hp = n - prev
    prev = n
    return hp * Math.exp(-t / 0.018)
  })
}
/** Щелчок кости о доску: короткий деревянный стук. */
function click(at, g = 1, pan = 0) {
  const f = 1800 + noise() * 1600
  put(at, 0.05, 0.32 * g, pan, (t) => (Math.sin(2 * Math.PI * f * t) * 0.6 + (noise() - 0.5)) * Math.exp(-t / 0.008))
}
/** Треск костей в горсти: серия щелчков. */
function rattle(at, len, g = 1) {
  for (let x = 0; x < len; x += 0.025 + noise() * 0.035) click(at + x, g * (0.6 + noise() * 0.5), (noise() - 0.5) * 0.8)
}
/** Удар кости о стол: низкий стук. */
const thud = (at, g = 1) => put(at, 0.18, 0.6 * g, 0, (t) => Math.sin(2 * Math.PI * (120 - 60 * t) * t) * Math.exp(-t / 0.05) + (noise() - 0.5) * Math.exp(-t / 0.01) * 0.6)
function bell(at, m, g = 1, len = 1.2) {
  put(at, len, 0.22 * g, 0.1, (t) => (Math.sin(2 * Math.PI * hz(m) * t) + 0.4 * Math.sin(2 * Math.PI * hz(m + 12) * t) + 0.2 * Math.sin(2 * Math.PI * hz(m + 19) * t)) * Math.exp(-t / (len * 0.35)))
}
function bass(at, m, len) {
  put(at, len, 0.3, 0, (t) => {
    const f = hz(m)
    const saw = 2 * ((f * t) % 1) - 1
    return (Math.sin(2 * Math.PI * f * t) * 0.7 + saw * 0.2) * Math.min(1, t / 0.01) * Math.exp(-t / (len * 0.8))
  })
}
function pad(at, notes, len, g = 1) {
  for (const m of notes) put(at, len, 0.06 * g, 0, (t) => Math.sin(2 * Math.PI * hz(m) * t + Math.sin(t * 3) * 0.2) * Math.min(1, t / 0.4, (len - t) / 0.5))
}
const whoosh = (at, g = 1) => {
  let lp = 0
  put(at, 0.35, 0.25 * g, 0, (t) => {
    lp = lp * 0.85 + (noise() * 2 - 1) * 0.15
    return lp * Math.sin(Math.PI * (t / 0.35))
  })
}

// ---------- Партитура ----------

// Бит: с 1,3 с (кости упали) до 14,5; бас - ре минор: Dm - Bb - F - A по 2 такта.
const BASS = [38, 34, 41, 33]
for (let b = 0; b < 30; b++) {
  const at = b * 0.5
  if (at < 1.3 || at > 14.2) continue
  kick(at, b % 4 === 0 ? 1 : 0.7)
  hat(at + 0.25)
  if (b % 2 === 0) bass(at, BASS[Math.floor(b / 4) % 4], 0.9)
}
pad(0, [50, 53, 57], 2.6, 0.8)
pad(12, [50, 53, 57, 62], 3, 1.2)

// 1. Кости падают (0,15 и 0,3 с) и подпрыгивают - треск в полёте, стук на каждом касании.
rattle(0.1, 0.55, 0.8)
for (const t0 of [0.15, 0.3]) for (const k of [0.364, 0.727, 0.909, 0.98]) thud(t0 + k, k < 0.5 ? 1 : k < 0.8 ? 0.6 : 0.3)
bell(1.3, 74, 1, 1.4)
bell(1.3, 69, 0.7, 1.4)

// 2. Смена стран - вжух и щелчок; кости катятся под названием.
for (const at of [2.5, 3.25, 4.0, 4.75]) {
  whoosh(at - 0.15, 0.8)
  click(at, 1.2)
}
rattle(2.6, 2.8, 0.25)

// 3. Партия: три броска, подмена кости, выигрыш.
for (const at of [6.0, 6.9, 7.7]) {
  rattle(at - 0.05, 0.35, 1)
  thud(at + 0.35, 0.9)
  thud(at + 0.4, 0.6)
}
for (let i = 0; i < 3; i++) click(6.55 + i * 0.5, 0.9)
bell(8.1, 81, 0.7, 0.6)
bell(8.35, 74, 1, 1.2)
bell(8.45, 78, 0.8, 1.2)
bell(8.55, 81, 0.8, 1.4)

// 4. Ставки: удар на каждой ступени, выше и тревожнее.
for (let i = 0; i < 5; i++) {
  thud(9.45 + i * 0.42, 0.7 + i * 0.12)
  bell(9.45 + i * 0.42, 62 + [0, 3, 5, 7, 8][i], 0.5 + i * 0.1, 0.5)
}

// 5. Финал: аккорд и последний бросок.
bell(12.05, 62, 1.1, 2.5)
bell(12.05, 69, 0.9, 2.5)
bell(12.05, 74, 0.8, 2.5)
rattle(12.0, 0.25, 0.8)

// ---------- Сведение ----------

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
  const fade = Math.min(1, t / 0.05, (DUR - t) / 0.3)
  buf.writeInt16LE(Math.round(Math.tanh(L[i] * pre) * 0.75 * fade * 32767), 44 + i * 4)
  buf.writeInt16LE(Math.round(Math.tanh(R[i] * pre) * 0.75 * fade * 32767), 46 + i * 4)
}
fs.writeFileSync(process.argv[2] ?? 'dice.wav', buf)
console.log('звук готов:', process.argv[2] ?? 'dice.wav')
