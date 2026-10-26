// Генератор фоновой музыки: npm run music
// Для меню и каждой страны сочиняет свою спокойную мелодию (лад, темп, инструменты эпохи), записывает её
// в MIDI (tools/gen/music/<id>.mid — можно открыть в любом редакторе) и сам синтезирует звук:
// щипковые струны (Карплус — Стронг), флейты с дыханием, язычковые, хор, колокола, мягкие барабаны, реверберация.
// Готовые треки — public/music/<id>.mp3 (моно, ~100 с, по кругу без резкого шва). Нужен ffmpeg с libmp3lame.
// Всё детерминировано: одинаковый запуск даёт одинаковые файлы.
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const SR = 32000
const OUT_MP3 = 'public/music'
const OUT_MID = 'tools/gen/music'

// ---------- Случайность по зерну ----------

function rng(seed) {
  let h = 2166136261
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619)
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507)
    h = Math.imul(h ^ (h >>> 13), 3266489909)
    return ((h ^= h >>> 16) >>> 0) / 4294967296
  }
}
const pickOf = (r, list) => list[Math.floor(r() * list.length)]
const midiHz = (m) => 440 * 2 ** ((m - 69) / 12)

// ---------- Инструменты (синтез одной ноты) ----------

/** Щипковая струна: лира, арфа, кото, гучжэн, уд, кора, лютня, гусли, крар, чаранго. */
function pluck(f, dur, o = {}) {
  const r = rng(`pl${f}${dur}`)
  const len = Math.floor(SR * Math.min(dur + (o.ring ?? 1.6), 5))
  const out = new Float32Array(len)
  const n = Math.max(2, Math.round(SR / f))
  const buf = new Float32Array(n)
  // Начальный шум, сглаженный: чем мягче, тем темнее звук.
  let prev = 0
  const soft = o.soft ?? 0.5
  for (let i = 0; i < n; i++) {
    prev = prev * soft + (r() * 2 - 1) * (1 - soft)
    buf[i] = prev
  }
  const decay = o.decay ?? 0.996
  let idx = 0
  for (let i = 0; i < len; i++) {
    const a = buf[idx]
    const b = buf[(idx + 1) % n]
    const v = decay * 0.5 * (a + b)
    buf[idx] = v
    out[i] = a
    idx = (idx + 1) % n
  }
  // Глушение после конца ноты и лёгкое «тело» (вторая гармоника).
  const end = Math.floor(dur * SR)
  for (let i = end; i < len; i++) out[i] *= Math.exp(-(i - end) / (SR * (o.ring ?? 1.6) * 0.35))
  if (o.buzz) for (let i = 0; i < len; i++) out[i] = Math.tanh(out[i] * 2.2) * 0.6
  return norm(out, 0.9)
}

/** Флейта, ней, сякухати, кена, окарина, дизи, вашинт: синус с гармониками, вибрато и дыханием. */
function flute(f, dur, o = {}) {
  const r = rng(`fl${f}${dur}`)
  const len = Math.floor(SR * (dur + 0.3))
  const out = new Float32Array(len)
  let ph = 0
  let lp = 0
  let lp2 = 0
  const att = o.attack ?? 0.09
  const breath = o.breath ?? 0.08
  const h2 = o.h2 ?? 0.22
  const h3 = o.h3 ?? 0.08
  for (let i = 0; i < len; i++) {
    const t = i / SR
    const vib = 1 + (o.vib ?? 0.004) * Math.sin(2 * Math.PI * 5.2 * t) * Math.min(1, Math.max(0, (t - 0.25) / 0.4))
    // Сякухати и ней «подъезжают» к ноте снизу.
    const bend = o.bend ? 1 - o.bend * Math.exp(-t / 0.12) : 1
    ph += (2 * Math.PI * f * vib * bend) / SR
    const tone = Math.sin(ph) + h2 * Math.sin(2 * ph) + h3 * Math.sin(3 * ph)
    // Дыхание: шум через два сглаживающих фильтра, громче в начале ноты.
    lp = lp * 0.93 + (r() * 2 - 1) * 0.07
    lp2 = lp2 * 0.9 + lp * 0.1
    const env = envelope(t, dur, att, 0.18)
    const puff = 0.35 + 0.65 * Math.exp(-t / 0.12)
    out[i] = (tone + lp2 * breath * 12 * puff) * env
  }
  return norm(out, 0.8)
}

/** Язычковые и смычковые: авлос, свирель с язычком, масинко. Нечётные гармоники, тёмный тон. */
function reed(f, dur, o = {}) {
  const len = Math.floor(SR * (dur + 0.3))
  const out = new Float32Array(len)
  let ph = 0
  const harm = o.bowed ? [1, 0.5, 0.33, 0.25, 0.2, 0.16] : [1, 0.12, 0.45, 0.08, 0.25, 0.05, 0.12]
  for (let i = 0; i < len; i++) {
    const t = i / SR
    const vib = 1 + 0.005 * Math.sin(2 * Math.PI * 5.5 * t) * Math.min(1, t / 0.5)
    ph += (2 * Math.PI * f * vib) / SR
    let v = 0
    for (let k = 0; k < harm.length; k++) v += harm[k] * Math.sin((k + 1) * ph)
    out[i] = v * envelope(t, dur, o.bowed ? 0.15 : 0.06, 0.2)
  }
  return lowpass(norm(out, 0.7), o.bowed ? 0.25 : 0.32)
}

/** Хор «а»: гармоники с формантами гласной, несколько голосов с расстройкой. */
function voice(f, dur) {
  const len = Math.floor(SR * (dur + 0.6))
  const out = new Float32Array(len)
  const formant = (hz) => Math.exp(-(((hz - 700) / 180) ** 2)) + 0.7 * Math.exp(-(((hz - 1150) / 220) ** 2)) + 0.25 * Math.exp(-(((hz - 2600) / 300) ** 2)) + 0.05
  for (const det of [-0.004, 0, 0.0045]) {
    let ph = det * 1000
    for (let i = 0; i < len; i++) {
      const t = i / SR
      const vib = 1 + det + 0.006 * Math.sin(2 * Math.PI * (4.8 + det * 200) * t)
      ph += (2 * Math.PI * f * vib) / SR
      let v = 0
      for (let k = 1; k <= 14; k++) if (k * f < 4000) v += formant(k * f) * Math.sin(k * ph) / Math.sqrt(k)
      out[i] += v * envelope(t, dur, 0.35, 0.5)
    }
  }
  return norm(out, 0.6)
}

/** Подкладка и бурдон: мягкие расстроенные тоны, медленно появляются и гаснут. */
function pad(f, dur, o = {}) {
  const len = Math.floor(SR * (dur + 1.5))
  const out = new Float32Array(len)
  for (const det of [-0.003, 0.0025, 0]) {
    let ph = det * 777
    for (let i = 0; i < len; i++) {
      const t = i / SR
      ph += (2 * Math.PI * f * (1 + det)) / SR
      const v = Math.sin(ph) + 0.3 * Math.sin(2 * ph) + (o.bright ?? 0.12) * Math.sin(3 * ph)
      out[i] += v * envelope(t, dur, o.attack ?? 1.2, 1.4)
    }
  }
  return norm(out, 0.6)
}

/** Колокол и гонг: негармонические призвуки с долгим затуханием. */
function bell(f, dur, o = {}) {
  const len = Math.floor(SR * Math.min(6, dur + 4))
  const out = new Float32Array(len)
  const parts = o.gong ? [[1, 1, 3], [1.52, 0.6, 2], [2.03, 0.4, 1.4], [2.68, 0.3, 1], [3.31, 0.2, 0.8]] : [[0.5, 0.5, 3.5], [1, 1, 2.5], [1.19, 0.6, 2], [1.56, 0.4, 1.5], [2, 0.5, 1.2], [2.51, 0.3, 0.8], [3, 0.2, 0.6]]
  for (const [m, a, d] of parts) {
    for (let i = 0; i < len; i++) {
      const t = i / SR
      out[i] += a * Math.sin(2 * Math.PI * f * m * t) * Math.exp(-t / d) * Math.min(1, t / 0.004)
    }
  }
  return norm(out, 0.7)
}

/** Балафон, ксилофон, щелевой барабан: короткий деревянный тон. */
function mallet(f, dur, o = {}) {
  const len = Math.floor(SR * 1.2)
  const out = new Float32Array(len)
  const r = rng(`ml${f}`)
  for (let i = 0; i < len; i++) {
    const t = i / SR
    const d = o.slit ? 0.35 : 0.45
    out[i] = (Math.sin(2 * Math.PI * f * t) + 0.35 * Math.sin(2 * Math.PI * f * 3.9 * t) * Math.exp(-t / 0.05) + 0.12 * Math.sin(2 * Math.PI * f * 9.2 * t) * Math.exp(-t / 0.02)) * Math.exp(-t / d) * Math.min(1, t / 0.002)
    if (o.buzz) out[i] += (r() * 2 - 1) * 0.08 * Math.exp(-t / 0.15)
  }
  return norm(out, 0.8)
}

/** Ударные: бубен/даф, табла, кебэро, джембе, бомбо, деревянная коробочка, погремушка. */
function drum(kind, vel = 1) {
  const r = rng(`dr${kind}${vel}`)
  const spec = {
    frame: { f0: 140, f1: 80, d: 0.25, noise: 0.25, nd: 0.03 },
    low: { f0: 110, f1: 55, d: 0.4, noise: 0.15, nd: 0.02 },
    tabla: { f0: 330, f1: 300, d: 0.35, noise: 0.15, nd: 0.015 },
    tabla_low: { f0: 120, f1: 70, d: 0.3, noise: 0.1, nd: 0.02 },
    djembe: { f0: 220, f1: 150, d: 0.18, noise: 0.35, nd: 0.03 },
    block: { f0: 900, f1: 880, d: 0.05, noise: 0.05, nd: 0.01 },
    rattle: { f0: 0, f1: 0, d: 0.01, noise: 1, nd: 0.07 },
  }[kind]
  const len = Math.floor(SR * 0.8)
  const out = new Float32Array(len)
  let ph = 0
  let hp = 0
  let prev = 0
  for (let i = 0; i < len; i++) {
    const t = i / SR
    const f = spec.f1 + (spec.f0 - spec.f1) * Math.exp(-t / 0.04)
    ph += (2 * Math.PI * f) / SR
    const n = r() * 2 - 1
    hp = n - prev
    prev = n
    out[i] = (spec.f0 ? Math.sin(ph) * Math.exp(-t / spec.d) : 0) + (kind === 'rattle' ? hp : n) * spec.noise * Math.exp(-t / spec.nd)
  }
  return norm(out, 0.8 * vel)
}

function envelope(t, dur, att, rel) {
  if (t < att) return t / att
  if (t < dur) return 1 - 0.15 * Math.min(1, (t - att) / Math.max(0.01, dur - att))
  return 0.85 * Math.max(0, 1 - (t - dur) / rel)
}

function norm(a, peak) {
  let m = 0
  for (const v of a) m = Math.max(m, Math.abs(v))
  if (m > 0) for (let i = 0; i < a.length; i++) a[i] *= peak / m
  return a
}

function lowpass(a, k) {
  let y = 0
  for (let i = 0; i < a.length; i++) a[i] = y += k * (a[i] - y)
  return a
}

/** Реверберация (Шрёдер): параллельные гребенчатые фильтры и последовательные фазовращатели. */
function reverb(x, wet, size = 1) {
  const combs = [1557, 1617, 1491, 1422, 1277, 1356].map((n) => Math.round(n * size * (SR / 44100)))
  const out = new Float32Array(x.length)
  for (const n of combs) {
    const buf = new Float32Array(n)
    let idx = 0
    let lp = 0
    for (let i = 0; i < x.length; i++) {
      const y = buf[idx]
      lp = y * 0.75 + lp * 0.25
      buf[idx] = x[i] + lp * 0.8
      out[i] += y / combs.length
      idx = (idx + 1) % n
    }
  }
  for (const n of [556, 441, 341, 225].map((v) => Math.round(v * (SR / 44100)))) {
    const buf = new Float32Array(n)
    let idx = 0
    for (let i = 0; i < out.length; i++) {
      const b = buf[idx]
      const y = -out[i] + b
      buf[idx] = out[i] + b * 0.5
      out[i] = y
      idx = (idx + 1) % n
    }
  }
  const res = new Float32Array(x.length)
  for (let i = 0; i < x.length; i++) res[i] = x[i] * (1 - wet * 0.5) + out[i] * wet * 3
  return res
}

const SYNTH = {
  pluck: (f, d, o) => pluck(f, d, o),
  flute: (f, d, o) => flute(f, d, o),
  reed: (f, d, o) => reed(f, d, o),
  voice: (f, d) => voice(f, d),
  pad: (f, d, o) => pad(f, d, o),
  bell: (f, d, o) => bell(f, d, o),
  mallet: (f, d, o) => mallet(f, d, o),
}

// ---------- Пьесы ----------
// scale — ступени лада в полутонах от тоники; root — MIDI-нота тоники; beats — долей в такте; shift — сдвиг мелодии.
// lead — кто ведёт мелодию в разных частях, accomp — сопровождение (остинато), drone — бурдон, perc — ритм.
// gm — номера инструментов General MIDI для файла .mid.

const PIECES = {
  menu: { title: 'Main theme', scale: [0, 2, 4, 7, 9], root: 62, bpm: 66, beats: 4, lead: [['flute', { breath: 0.06 }, 73], ['pluck', { soft: 0.6, decay: 0.997 }, 46]], accomp: ['pluck', { soft: 0.7, decay: 0.997 }, 46], drone: ['pad', {}, 89], perc: null, arp: [0, 7, 12, 16] },
  E03: { title: 'Rome and Hellas', scale: [0, 2, 3, 5, 7, 9, 10], root: 64, bpm: 64, beats: 4, lead: [['reed', {}, 68], ['flute', { breath: 0.1 }, 75]], accomp: ['pluck', { soft: 0.55, decay: 0.995 }, 46], drone: ['pad', { bright: 0.05 }, 89], perc: ['frame', [0, 2.5], 0.35], arp: [0, 7, 12, 7] },
  ANE: { title: 'Ancient East', scale: [0, 1, 3, 5, 7, 8, 10], root: 62, bpm: 58, beats: 4, lead: [['flute', { breath: 0.16, bend: 0.03 }, 77], ['reed', {}, 68]], accomp: ['pluck', { soft: 0.45, decay: 0.997, ring: 2 }, 46], drone: ['pad', { bright: 0.2 }, 89], perc: ['frame', [0, 3], 0.3, 'rattle', [1.5, 3.5]], arp: [0, 3, 7, 12] },
  BYZ: { title: 'Byzantium', scale: [0, 2, 3, 5, 7, 9, 10], root: 62, shift: -12, bpm: 54, beats: 4, lead: [['voice', {}, 52], ['voice', {}, 52]], accomp: null, drone: ['voice', {}, 52], perc: null, bells: true, arp: [0, 7] },
  CHN: { title: 'China', scale: [0, 2, 4, 7, 9], root: 67, bpm: 68, beats: 4, lead: [['flute', { breath: 0.12, vib: 0.006 }, 72], ['pluck', { soft: 0.35, decay: 0.996 }, 107]], accomp: ['pluck', { soft: 0.35, decay: 0.996 }, 107], drone: ['pad', { bright: 0.05 }, 89], perc: ['block', [0], 0.25], arp: [0, 4, 7, 12, 16, 12] },
  JPN: { title: 'Japan', scale: [0, 1, 5, 7, 8], root: 62, bpm: 52, beats: 4, lead: [['flute', { breath: 0.22, bend: 0.04, vib: 0.007 }, 77], ['pluck', { soft: 0.3, decay: 0.995 }, 107]], accomp: ['pluck', { soft: 0.3, decay: 0.995 }, 107], drone: null, perc: ['low', [0], 0.25], sparse: true, arp: [0, 7, 12] },
  IND: { title: 'India', scale: [0, 1, 4, 5, 7, 8, 11], root: 61, bpm: 70, beats: 4, lead: [['pluck', { soft: 0.3, decay: 0.997, buzz: true }, 104], ['flute', { breath: 0.12, bend: 0.03 }, 73]], accomp: null, drone: ['tanpura', {}, 104], perc: ['tabla_low', [0, 2.5], 0.3, 'tabla', [1, 1.5, 3]], arp: [7, 12, 12, 0] },
  ISL: { title: 'The Islamic world', scale: [0, 1, 4, 5, 7, 8, 10], root: 57, bpm: 62, beats: 4, lead: [['flute', { breath: 0.2, bend: 0.03 }, 77], ['pluck', { soft: 0.4, decay: 0.995 }, 105]], accomp: ['pluck', { soft: 0.4, decay: 0.995 }, 105], drone: ['pad', { bright: 0.15 }, 89], perc: ['low', [0, 2.5], 0.3, 'frame', [1.5, 3]], arp: [0, 7, 12, 7] },
  EUR: { title: 'Medieval Europe', scale: [0, 2, 3, 5, 7, 9, 10], root: 62, bpm: 84, beats: 3, lead: [['flute', { breath: 0.05, h2: 0.35 }, 74], ['reed', {}, 69]], accomp: ['pluck', { soft: 0.5, decay: 0.996 }, 25], drone: ['pad', { bright: 0.2 }, 89], perc: ['frame', [0], 0.25], arp: [0, 7, 12] },
  RUS: { title: 'Rus', scale: [0, 2, 3, 5, 7, 8, 10], root: 57, bpm: 62, beats: 4, lead: [['flute', { breath: 0.1, vib: 0.005 }, 75], ['pluck', { soft: 0.5, decay: 0.997 }, 15]], accomp: ['pluck', { soft: 0.5, decay: 0.997 }, 15], drone: ['pad', { bright: 0.1 }, 89], perc: null, bells: true, arp: [0, 7, 12, 15] },
  ETH: { title: 'Ethiopia', scale: [0, 2, 3, 7, 8], root: 64, bpm: 72, beats: 4, lead: [['flute', { breath: 0.18 }, 77], ['reed', { bowed: true }, 110]], accomp: ['pluck', { soft: 0.45, decay: 0.996 }, 46], drone: ['pad', { bright: 0.05 }, 89], perc: ['low', [0, 2], 0.3, 'djembe', [3]], arp: [0, 7, 3, 12] },
  WAF: { title: 'West Africa', scale: [0, 2, 4, 5, 7, 9, 10], root: 65, bpm: 80, beats: 4, lead: [['mallet', { buzz: true }, 12], ['pluck', { soft: 0.4, decay: 0.997 }, 46]], accomp: ['pluck', { soft: 0.4, decay: 0.997 }, 46], drone: null, perc: ['djembe', [0, 1.5, 2.5], 0.25, 'low', [0]], arp: [0, 7, 12, 16, 12, 7], busy: true },
  MAY: { title: 'The Maya', scale: [0, 3, 5, 7, 10], root: 67, bpm: 64, beats: 4, lead: [['flute', { breath: 0.14, h2: 0.05, h3: 0.02 }, 79], ['mallet', { slit: true }, 115]], accomp: ['mallet', { slit: true }, 115], drone: ['pad', { bright: 0.05 }, 89], perc: ['rattle', [0.5, 1.5, 2.5, 3.5], 0.2], arp: [0, 7] },
  AMR: { title: 'Aztecs and Incas', scale: [0, 3, 5, 7, 10], root: 64, bpm: 70, beats: 4, lead: [['flute', { breath: 0.2, vib: 0.006 }, 75], ['pluck', { soft: 0.25, decay: 0.995 }, 24]], accomp: ['pluck', { soft: 0.25, decay: 0.995 }, 24], drone: ['pad', { bright: 0.05 }, 89], perc: ['low', [0, 2], 0.3, 'rattle', [1, 3]], arp: [0, 7, 12, 10] },
}

/** Ступень лада → MIDI-нота (ступени за пределами лада переходят в другую октаву). */
function degree(p, d) {
  const n = p.scale.length
  const oct = Math.floor(d / n)
  return p.root + oct * 12 + p.scale[((d % n) + n) % n]
}

/** Ритмы мотивов (в долях), сумма — один такт. */
function rhythms(beats, busy) {
  if (beats === 3) return [[1, 1, 1], [1.5, 0.5, 1], [2, 1], [1, 0.5, 0.5, 1], [3]]
  return busy ? [[1, 0.5, 0.5, 1, 1], [0.5, 0.5, 1, 0.5, 0.5, 1], [1.5, 0.5, 1, 1], [1, 1, 2]] : [[2, 1, 1], [1, 1, 2], [1.5, 0.5, 2], [3, 1], [1, 1, 1, 1], [4]]
}

/** Мелодическая фраза из 4 тактов: мотив, повтор с вариацией, секвенция, каденция на устойчивой ступени. */
function phrase(r, p, base, end) {
  const rh = rhythms(p.beats, p.busy)
  const motifR = pickOf(r, rh.filter((x) => x.length >= 2))
  let d = base
  const motif = motifR.map(() => {
    d += pickOf(r, [-1, 1, 1, 2, -2, 0, 1, -1])
    return d
  })
  const notes = []
  const bar = (rhythm, degs, shift = 0) => rhythm.map((len, i) => ({ d: degs[Math.min(i, degs.length - 1)] + shift, len }))
  notes.push(bar(motifR, motif))
  const varied = motif.map((x, i) => (i === motif.length - 1 ? x + pickOf(r, [-1, 1, 2]) : x))
  notes.push(bar(motifR, varied))
  notes.push(bar(pickOf(r, rh), motif.slice().reverse(), pickOf(r, [1, 2, -1])))
  // Каденция: подход к тонике или квинте и долгая нота.
  const last = end
  notes.push(p.beats === 3 ? [{ d: last + 1, len: 1 }, { d: last, len: 2 }] : [{ d: last + 1, len: 1 }, { d: last, len: 3 }])
  return notes
}

/** Сочинить пьесу: список нот по дорожкам. */
function compose(id, p) {
  const r = rng(`music:${id}`)
  const beat = 60 / p.bpm
  const n = p.scale.length
  const A = phrase(r, p, n, n)
  const A2 = phrase(r, p, n, 0 + n)
  const B = phrase(r, p, n + 2, n + Math.floor(n / 2) + (n === 5 ? 0 : 1))
  // Порядок частей: вступление (только сопровождение), A, A', B, A, проигрыш, B, A', кода — по 2 такта без мелодии.
  const plan = [null, ['A', 0], ['A2', 1], ['B', 0], ['A', 1], null, ['B', 1], ['A2', 0], null]
  const tracks = { lead0: [], lead1: [], accomp: [], drone: [], perc: [], bell: [] }
  let bar = 0
  const sections = { A, A2, B }
  for (const part of plan) {
    const bars = part ? 4 : 2
    if (part) {
      const [name, who] = part
      sections[name].forEach((notes, i) => {
        let t = (bar + i) * p.beats
        for (const nt of notes) {
          // У редкого (Япония) — паузы внутри фраз.
          if (!(p.sparse && r() < 0.18 && nt.len < 2)) tracks[`lead${who}`].push({ t, len: nt.len, m: degree(p, nt.d) + (p.shift ?? 0) })
          t += nt.len
        }
      })
    }
    for (let b = bar; b < bar + bars; b++) {
      const t0 = b * p.beats
      // Остинато: арпеджио аккорда тоники, на последнем такте фразы — на квинте.
      if (p.accomp && !(p.sparse && b % 2)) {
        const step = p.busy ? 0.5 : p.beats === 3 ? 1 : 1
        const shift = b % 4 === 3 ? 7 : b % 8 === 5 ? 5 : 0
        let k = 0
        for (let t = 0; t < p.beats; t += step, k++) tracks.accomp.push({ t: t0 + t, len: step * 1.5, m: p.root - 12 + shift + p.arp[k % p.arp.length] })
      }
      if (p.drone && b % 2 === 0) {
        tracks.drone.push({ t: t0, len: p.beats * 2, m: p.root - (p.drone[0] === 'voice' ? 24 : 12) })
        if (p.drone[0] !== 'voice') tracks.drone.push({ t: t0, len: p.beats * 2, m: p.root - 5 })
      }
      if (p.perc && b >= 2 && b < bar + bars - (part ? 0 : 1)) {
        for (let k = 0; k < p.perc.length; k += 3) {
          const kind = p.perc[k]
          const at = p.perc[k + 1]
          const vel = p.perc[k + 2] ?? p.perc[2]
          for (const a of at) if (a < p.beats) tracks.perc.push({ t: t0 + a, len: 0.5, kind, vel: typeof vel === 'number' ? vel : 0.3 })
        }
      }
      if (p.bells && b % 4 === 0) tracks.bell.push({ t: t0, len: p.beats * 2, m: p.root - 12 + (b % 8 ? 7 : 0) })
    }
    bar += bars
  }
  return { tracks, bars: bar, beat }
}

// ---------- Звук ----------

function render(id, p) {
  const { tracks, bars, beat } = compose(id, p)
  const total = Math.floor(bars * p.beats * beat * SR)
  const mix = new Float32Array(total + SR * 6)
  const add = (buf, at, gain) => {
    const s = Math.floor(at * SR)
    for (let i = 0; i < buf.length && s + i < mix.length; i++) mix[s + i] += buf[i] * gain
  }
  const cache = new Map()
  const voiceOf = (spec, f, dur) => {
    const key = `${spec[0]}:${JSON.stringify(spec[1])}:${f.toFixed(2)}:${dur.toFixed(2)}`
    if (!cache.has(key)) cache.set(key, spec[0] === 'tanpura' ? pluck(f, dur, { soft: 0.2, decay: 0.999, ring: 3, buzz: true }) : SYNTH[spec[0]](f, dur, spec[1]))
    return cache.get(key)
  }
  const human = rng(`human:${id}`)
  for (const who of [0, 1]) {
    const spec = p.lead[who]
    const gain = spec[0] === 'pluck' || spec[0] === 'mallet' ? 0.32 : 0.24
    for (const n of tracks[`lead${who}`]) add(voiceOf(spec, midiHz(n.m), n.len * beat * 0.95), n.t * beat + (human() - 0.5) * 0.015, gain)
  }
  if (p.accomp) for (const n of tracks.accomp) add(voiceOf(p.accomp, midiHz(n.m), n.len * beat), n.t * beat + (human() - 0.5) * 0.01, 0.14)
  if (p.drone) {
    if (p.drone[0] === 'tanpura') {
      // Танпура: Па-Са-Са-Са на каждые полтакта.
      for (let b = 0; b < bars; b++) for (let k = 0; k < 4; k++) add(voiceOf(p.drone, midiHz(p.root - 12 + (k === 0 ? -5 : k === 3 ? -12 : 0)), beat * 2), (b * p.beats + k) * beat, 0.12)
    } else for (const n of tracks.drone) add(voiceOf(p.drone, midiHz(n.m), n.len * beat), n.t * beat, p.drone[0] === 'voice' ? 0.11 : 0.055)
  }
  for (const n of tracks.perc) add(drum(n.kind, 1), n.t * beat + (human() - 0.5) * 0.01, n.vel * 0.5)
  for (const n of tracks.bell) add(bell(midiHz(n.m), 3), n.t * beat, 0.08)
  // Реверберация, затем хвост сворачивается в начало: шов петли не слышен.
  const wet = reverb(mix, p.lead[0][0] === 'voice' ? 0.55 : 0.32, p.lead[0][0] === 'voice' ? 1.3 : 1)
  const out = new Float32Array(total)
  for (let i = 0; i < wet.length; i++) out[i % total] += wet[i]
  // Мягкие верха (фильтр ~5 кГц, два прохода), без постоянной составляющей.
  lowpass(out, 0.62)
  lowpass(out, 0.62)
  let dc = 0
  let prevX = 0
  for (let i = 0; i < out.length; i++) {
    const x = out[i]
    dc = x - prevX + 0.997 * dc
    prevX = x
    out[i] = dc
  }
  // Одинаковая средняя громкость у всех треков (−22 дБ), пик не выше −3 дБ.
  let peak = 0
  let sq = 0
  for (const v of out) {
    peak = Math.max(peak, Math.abs(v))
    sq += v * v
  }
  const gain = Math.min(0.7 / peak, 10 ** (-22 / 20) / Math.sqrt(sq / out.length))
  for (let i = 0; i < out.length; i++) out[i] *= gain
  return { audio: out, tracks, bars, beat }
}

function wav(samples) {
  const buf = Buffer.alloc(44 + samples.length * 2)
  buf.write('RIFF', 0)
  buf.writeUInt32LE(36 + samples.length * 2, 4)
  buf.write('WAVEfmt ', 8)
  buf.writeUInt32LE(16, 16)
  buf.writeUInt16LE(1, 20)
  buf.writeUInt16LE(1, 22)
  buf.writeUInt32LE(SR, 24)
  buf.writeUInt32LE(SR * 2, 28)
  buf.writeUInt16LE(2, 32)
  buf.writeUInt16LE(16, 34)
  buf.write('data', 36)
  buf.writeUInt32LE(samples.length * 2, 40)
  for (let i = 0; i < samples.length; i++) buf.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(samples[i] * 32767))), 44 + i * 2)
  return buf
}

// ---------- MIDI ----------

function vlq(n) {
  const bytes = [n & 0x7f]
  while ((n >>= 7)) bytes.unshift((n & 0x7f) | 0x80)
  return bytes
}

const DRUM_NOTE = { frame: 45, low: 41, tabla: 60, tabla_low: 61, djembe: 63, block: 76, rattle: 70 }

function midiFile(p, tracks) {
  const TPQ = 480
  const chunk = (events, name, program, channel) => {
    const ev = []
    for (const e of events) {
      const note = e.kind ? DRUM_NOTE[e.kind] : e.m
      const vel = e.kind ? Math.round(40 + e.vel * 60) : 70
      ev.push({ tick: Math.round(e.t * TPQ), data: [0x90 | channel, note, vel] })
      ev.push({ tick: Math.round((e.t + e.len) * TPQ), data: [0x80 | channel, note, 0] })
    }
    ev.sort((a, b) => a.tick - b.tick || a.data[0] - b.data[0])
    const nameBytes = [...Buffer.from(name)]
    const bytes = [0x00, 0xff, 0x03, nameBytes.length, ...nameBytes]
    if (program !== null) bytes.push(0x00, 0xc0 | channel, program)
    let last = 0
    for (const e of ev) {
      bytes.push(...vlq(e.tick - last), ...e.data)
      last = e.tick
    }
    bytes.push(0x00, 0xff, 0x2f, 0x00)
    const head = Buffer.alloc(8)
    head.write('MTrk', 0)
    head.writeUInt32BE(bytes.length, 4)
    return Buffer.concat([head, Buffer.from(bytes)])
  }
  const tempo = Math.round(60_000_000 / p.bpm)
  const meta = [0x00, 0xff, 0x51, 0x03, (tempo >> 16) & 255, (tempo >> 8) & 255, tempo & 255, 0x00, 0xff, 0x58, 0x04, p.beats, 2, 24, 8, 0x00, 0xff, 0x2f, 0x00]
  const metaChunk = Buffer.concat([Buffer.from('MTrk'), Buffer.from([0, 0, 0, meta.length]), Buffer.from(meta)])
  const list = [
    chunk(tracks.lead0, 'Melody', p.lead[0][2], 0),
    chunk(tracks.lead1, 'Melody 2', p.lead[1][2], 1),
    chunk(tracks.accomp, 'Ostinato', p.accomp?.[2] ?? 46, 2),
    chunk(tracks.drone, 'Drone', p.drone?.[2] ?? 89, 3),
    chunk(tracks.bell, 'Bells', 14, 4),
    chunk(tracks.perc, 'Percussion', null, 9),
  ]
  const head = Buffer.alloc(14)
  head.write('MThd', 0)
  head.writeUInt32BE(6, 4)
  head.writeUInt16BE(1, 8)
  head.writeUInt16BE(list.length + 1, 10)
  head.writeUInt16BE(TPQ, 12)
  return Buffer.concat([head, metaChunk, ...list])
}

// ---------- Запуск ----------

fs.mkdirSync(OUT_MP3, { recursive: true })
fs.mkdirSync(OUT_MID, { recursive: true })
const only = process.argv.slice(2)
for (const [id, p] of Object.entries(PIECES)) {
  if (only.length && !only.includes(id)) continue
  const { audio, tracks, bars, beat } = render(id, p)
  const name = id.toLowerCase()
  fs.writeFileSync(path.join(OUT_MID, `${name}.mid`), midiFile(p, tracks))
  const tmp = path.join(OUT_MID, `${name}.wav`)
  fs.writeFileSync(tmp, wav(audio))
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', tmp, '-ac', '1', '-ar', String(SR), '-b:a', '48k', '-codec:a', 'libmp3lame', path.join(OUT_MP3, `${name}.mp3`)])
  fs.rmSync(tmp)
  let rms = 0
  for (const v of audio) rms += v * v
  rms = Math.sqrt(rms / audio.length)
  const kb = Math.round(fs.statSync(path.join(OUT_MP3, `${name}.mp3`)).size / 1024)
  console.log(`${name.padEnd(5)} ${p.title.padEnd(20)} ${bars} тактов, ${(bars * p.beats * beat).toFixed(0)} с, RMS ${(20 * Math.log10(rms)).toFixed(1)} дБ, ${kb} КБ`)
}
