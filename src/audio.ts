// Фоновая музыка: свой трек у меню и у каждой страны (public/music/<id>.mp3, сочиняет tools/gen/music.mjs).
// Под музыкой - звуки места (setAmbience): дождь, ветер, огонь, волны, ручей, гомон рынка, птицы, сверчки, цикады.
// Они синтезируются здесь же из шума и коротких тонов - ни одного файла.
// Играет по кругу через Web Audio (так громкость работает и на iPhone), между треками - плавный переход.
// Начинает после первого касания или клавиши (раньше браузеры звук не пускают), молчит, пока вкладка скрыта,
// идёт реклама или платформа просит выключить звук. Грузится только тот трек, который нужен сейчас.
import { platform } from './platform'
import { leverSound, reelsSound } from './sfx'
import type { ReelTiming } from './sfx'

type Ctx = AudioContext

let ctx: Ctx | null = null
let master: GainNode | null = null
let enabled = true
let volume = 0.5
/** Причины тишины: скрытая вкладка или реклама ('pause'), запрет платформы ('platform'). */
const blocked = new Set<string>()
let wanted: string | null = null
let current: { id: string; src: AudioBufferSourceNode; gain: GainNode } | null = null
const buffers = new Map<string, Promise<AudioBuffer | null>>()

const FADE = 2
/** Номер версии музыки: увеличить после npm run music, чтобы офлайн-кэш сайта взял новые файлы. */
const MUSIC_VERSION = 2

/** Громкость: ползунок 0–1 линейно (в квадрате на телефоне было почти не слышно). */
const level = () => (enabled && blocked.size === 0 ? volume : 0)

/** Контекст спит (пауза, блокировка телефона, звонок на iOS - 'interrupted'). */
const asleep = () => !!ctx && ctx.state !== 'running' && ctx.state !== 'closed'

function apply(): void {
  if (!ctx || !master) return
  const l = level()
  master.gain.setTargetAtTime(l, ctx.currentTime, 0.2)
  sfxOut?.gain.setTargetAtTime(l * SFX_LEVEL, ctx.currentTime, 0.05)
  if (l > 0) {
    if (asleep()) ctx.resume().catch(() => {})
    switchTrack()
  } else {
    silent?.pause()
    // Через секунду после затухания - пауза контекста: не тратим батарею.
    setTimeout(() => {
      if (ctx && level() === 0 && ctx.state === 'running') ctx.suspend().catch(() => {})
    }, 1000)
  }
}

function load(id: string): Promise<AudioBuffer | null> {
  let p = buffers.get(id)
  if (!p) {
    p = fetch(`./music/${id}.mp3?v=${MUSIC_VERSION}`)
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
      .then((data) => new Promise<AudioBuffer>((resolve, reject) => ctx!.decodeAudioData(data, resolve, reject)))
      .catch(() => {
        buffers.delete(id)
        return null
      })
    buffers.set(id, p)
    // В памяти держим не больше двух треков.
    for (const key of [...buffers.keys()]) if (buffers.size > 2 && key !== id && key !== current?.id) buffers.delete(key)
  }
  return p
}

async function switchTrack(): Promise<void> {
  if (!ctx || !master || level() === 0) return
  const id = wanted
  if (current?.id === id) return
  if (!id) return fadeOut()
  const buffer = await load(id)
  if (!buffer || wanted !== id || current?.id === id || !ctx || !master || level() === 0) return
  const gain = ctx.createGain()
  gain.gain.setValueAtTime(0, ctx.currentTime)
  gain.gain.linearRampToValueAtTime(1, ctx.currentTime + FADE)
  gain.connect(master)
  const src = ctx.createBufferSource()
  src.buffer = buffer
  src.loop = true
  src.connect(gain)
  src.start()
  fadeOut()
  current = { id, src, gain }
}

function fadeOut(): void {
  if (!ctx || !current) return
  const old = current
  current = null
  old.gain.gain.setValueAtTime(old.gain.gain.value, ctx.currentTime)
  old.gain.gain.linearRampToValueAtTime(0, ctx.currentTime + FADE)
  setTimeout(() => {
    try {
      old.src.stop()
    } catch {
      // уже остановлен
    }
    old.gain.disconnect()
  }, FADE * 1000 + 100)
}

/** iPhone и iPad (в том числе iPad, который называет себя Mac). */
const IOS = typeof navigator !== 'undefined' && (/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1))

/**
 * Беззвучный режим iPhone глушит Web Audio, но не «воспроизведение» (как у видео).
 * iOS 17+: audioSession.type = 'playback'; раньше - зацикленный беззвучный <audio>, который переключает сессию.
 */
let silent: HTMLAudioElement | null = null
function playbackSession(): void {
  const session = (navigator as unknown as { audioSession?: { type: string } }).audioSession
  if (session) {
    try {
      session.type = 'playback'
      return
    } catch {
      // не поддерживается - запасной путь ниже
    }
  }
  if (!IOS) return
  if (!silent) {
    silent = document.createElement('audio')
    silent.src = silentWav()
    silent.loop = true
    silent.setAttribute('playsinline', '')
    silent.setAttribute('x-webkit-airplay', 'deny')
  }
  if (silent.paused) silent.play().catch(() => {})
}

/** Полсекунды тишины в WAV (data: URL), чтобы не возить файл. */
function silentWav(): string {
  const n = 4000
  const b = new DataView(new ArrayBuffer(44 + n))
  const str = (o: number, t: string) => [...t].forEach((c, i) => b.setUint8(o + i, c.charCodeAt(0)))
  str(0, 'RIFF')
  b.setUint32(4, 36 + n, true)
  str(8, 'WAVEfmt ')
  b.setUint32(16, 16, true)
  b.setUint16(20, 1, true)
  b.setUint16(22, 1, true)
  b.setUint32(24, 8000, true)
  b.setUint32(28, 8000, true)
  b.setUint16(32, 1, true)
  b.setUint16(34, 8, true)
  str(36, 'data')
  b.setUint32(40, n, true)
  for (let i = 0; i < n; i++) b.setUint8(44 + i, 128)
  let bin = ''
  for (let i = 0; i < b.byteLength; i++) bin += String.fromCharCode(b.getUint8(i))
  return `data:audio/wav;base64,${btoa(bin)}`
}

/**
 * Каждое касание: создать звуковой контекст (раньше браузер не разрешает) или разбудить его.
 * На iOS проснуться после блокировки, звонка или рекламы контекст может только внутри касания.
 */
function unlock(): void {
  if (level() > 0) playbackSession()
  if (ctx) {
    if (level() > 0 && asleep()) {
      ctx.resume().then(() => switchTrack()).catch(() => {})
    }
    return
  }
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!AC) return
  try {
    ctx = new AC()
  } catch {
    return
  }
  master = ctx.createGain()
  master.gain.value = 0
  master.connect(ctx.destination)
  ctx.onstatechange = () => debug()
  apply()
  applyAmbience()
  if (IOS && level() > 0) iosHint?.()
}

/** Подсказка про беззвучный режим (показывает интерфейс один раз за всё время). */
let iosHint: (() => void) | null = null
export function onIosHint(cb: () => void): void {
  iosHint = cb
}

/** ?audiodebug=1 - состояние звука в углу экрана, чтобы проверить телефон. */
let debugBox: HTMLElement | null = null
function debug(): void {
  if (typeof location === 'undefined' || !/[?&]audiodebug=1/.test(location.search)) return
  if (!debugBox) {
    debugBox = document.createElement('pre')
    debugBox.style.cssText = 'position:fixed;left:4px;bottom:4px;z-index:9999;margin:0;padding:4px 6px;font:11px monospace;background:rgba(0,0,0,.75);color:#9f9;pointer-events:none;white-space:pre'
    document.body.appendChild(debugBox)
  }
  const session = (navigator as unknown as { audioSession?: { type: string } }).audioSession
  debugBox.textContent = [
    `ctx: ${ctx ? ctx.state : 'нет'} ${ctx ? ctx.sampleRate + ' Гц' : ''}`,
    `трек: ${current?.id ?? '-'} (нужен ${wanted ?? '-'})`,
    `громкость: ${enabled ? 'вкл' : 'выкл'} ${volume.toFixed(2)} → ${level().toFixed(2)}`,
    `блок: ${[...blocked].join(', ') || 'нет'}`,
    `iOS: ${IOS} session: ${session?.type ?? '-'} silent: ${silent ? (silent.paused ? 'пауза' : 'играет') : '-'}`,
  ].join('\n')
}

let started = false
/** Подключить музыку: настройки игрока, жесты для разблокировки, паузы платформы. */
export function initAudio(on: boolean, vol: number): void {
  enabled = on
  volume = vol
  if (started || typeof window === 'undefined') return
  started = true
  for (const ev of ['pointerdown', 'keydown', 'touchend', 'click'] as const) window.addEventListener(ev, unlock, { capture: true, passive: true })
  if (/[?&]audiodebug=1/.test(location.search)) setInterval(debug, 500)
  platform.onPause((paused) => setBlocked('pause', paused))
  platform.onAudio?.((allowed) => setBlocked('platform', !allowed))
}

function setBlocked(reason: string, on: boolean): void {
  if (on) blocked.add(reason)
  else blocked.delete(reason)
  apply()
}

/** Какой трек должен звучать: id страны в нижнем регистре или 'menu'. */
export function setMusic(id: string | null): void {
  wanted = id
  switchTrack()
}

/** Включить или выключить музыку, громкость 0–1. */
export function setSound(on: boolean, vol: number): void {
  enabled = on
  volume = Math.max(0, Math.min(1, vol))
  apply()
}

// ---------- Звуки места ----------

export type AmbienceLayer = 'rain' | 'storm' | 'wind' | 'fire' | 'waves' | 'stream' | 'crowd' | 'murmur' | 'birds' | 'crickets' | 'cicadas'

/** Насколько звуки места тише музыки. */
const AMB_LEVEL = 0.45
let ambWanted = new Set<AmbienceLayer>()
let ambOut: GainNode | null = null
const ambLive = new Map<AmbienceLayer, { gain: GainNode; stop: () => void }>()
let noiseBuf: AudioBuffer | null = null
let crackleBuf: AudioBuffer | null = null

/** Белый шум на 2 секунды (зациклен). */
function noise(): AudioBuffer {
  if (noiseBuf) return noiseBuf
  const b = ctx!.createBuffer(1, ctx!.sampleRate * 2, ctx!.sampleRate)
  const d = b.getChannelData(0)
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
  return (noiseBuf = b)
}

/** Треск костра: редкие щелчки с затуханием поверх тихого гула. */
function crackle(): AudioBuffer {
  if (crackleBuf) return crackleBuf
  const sr = ctx!.sampleRate
  const b = ctx!.createBuffer(1, sr * 3, sr)
  const d = b.getChannelData(0)
  let low = 0
  for (let i = 0; i < d.length; i++) {
    low = low * 0.995 + (Math.random() * 2 - 1) * 0.005
    d[i] = low * 6
  }
  for (let k = 0; k < 60; k++) {
    const at = Math.floor(Math.random() * (d.length - sr * 0.05))
    const amp = 0.2 + Math.random() * 0.6
    const len = Math.floor(sr * (0.004 + Math.random() * 0.02))
    for (let i = 0; i < len; i++) d[at + i] += (Math.random() * 2 - 1) * amp * Math.exp(-i / (len / 4))
  }
  return (crackleBuf = b)
}

function noiseSource(): AudioBufferSourceNode {
  const src = ctx!.createBufferSource()
  src.buffer = noise()
  src.loop = true
  src.loopStart = Math.random()
  return src
}

function lfo(freq: number, depth: number, target: AudioParam): OscillatorNode {
  const o = ctx!.createOscillator()
  o.frequency.value = freq
  const g = ctx!.createGain()
  g.gain.value = depth
  o.connect(g).connect(target)
  o.start()
  return o
}

/** Повторять звук через случайные промежутки (птицы, раскаты грома). */
function every(min: number, max: number, play: (at: number) => void): () => void {
  let stopped = false
  let timer = 0
  const next = () => {
    if (stopped || !ctx) return
    if (ctx.state === 'running') play(ctx.currentTime + 0.05)
    timer = window.setTimeout(next, (min + Math.random() * (max - min)) * 1000)
  }
  timer = window.setTimeout(next, Math.random() * max * 1000)
  return () => {
    stopped = true
    clearTimeout(timer)
  }
}

function chirp(out: AudioNode, at: number, f0: number, f1: number, dur: number, vol: number) {
  const o = ctx!.createOscillator()
  const g = ctx!.createGain()
  o.type = 'sine'
  o.frequency.setValueAtTime(f0, at)
  o.frequency.exponentialRampToValueAtTime(f1, at + dur)
  g.gain.setValueAtTime(0, at)
  g.gain.linearRampToValueAtTime(vol, at + dur * 0.2)
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur)
  o.connect(g).connect(out)
  o.start(at)
  o.stop(at + dur + 0.05)
}

/** Собрать слой: источник → фильтры → своя громкость (плавно появляется). */
function startLayer(layer: AmbienceLayer): { gain: GainNode; stop: () => void } {
  const c = ctx!
  const gain = c.createGain()
  gain.gain.value = 0
  gain.connect(ambOut!)
  const nodes: (AudioScheduledSourceNode)[] = []
  let cancel: (() => void) | null = null
  let level = 0.2
  const filter = (type: BiquadFilterType, f: number, q = 0.7) => {
    const b = c.createBiquadFilter()
    b.type = type
    b.frequency.value = f
    b.Q.value = q
    return b
  }
  switch (layer) {
    case 'rain':
    case 'storm': {
      const src = noiseSource()
      src.connect(filter('highpass', 900)).connect(filter('lowpass', 6000)).connect(gain)
      src.start()
      nodes.push(src)
      level = layer === 'storm' ? 0.32 : 0.22
      if (layer === 'storm') {
        // Раскаты грома: низкий шум с долгим затуханием.
        const thunder = c.createGain()
        thunder.gain.value = 0
        const low = noiseSource()
        low.connect(filter('lowpass', 120)).connect(thunder).connect(gain)
        low.start()
        nodes.push(low)
        cancel = every(6, 14, (at) => {
          thunder.gain.setValueAtTime(0, at)
          thunder.gain.linearRampToValueAtTime(2.5, at + 0.15)
          thunder.gain.exponentialRampToValueAtTime(0.001, at + 3)
        })
      }
      break
    }
    case 'wind': {
      const src = noiseSource()
      const f = filter('bandpass', 500, 0.8)
      src.connect(f).connect(gain)
      src.start()
      nodes.push(src, lfo(0.13, 300, f.frequency))
      level = 0.25
      break
    }
    case 'fire': {
      const src = c.createBufferSource()
      src.buffer = crackle()
      src.loop = true
      src.connect(filter('highpass', 200)).connect(gain)
      src.start()
      nodes.push(src)
      level = 0.35
      break
    }
    case 'waves': {
      // Прибой: низкий шум, громкость дышит раз в 6–7 секунд.
      const src = noiseSource()
      const swell = c.createGain()
      swell.gain.value = 0.6
      src.connect(filter('lowpass', 700)).connect(swell).connect(gain)
      src.start()
      nodes.push(src, lfo(0.15, 0.45, swell.gain))
      level = 0.35
      break
    }
    case 'stream': {
      const src = noiseSource()
      src.connect(filter('bandpass', 1400, 0.6)).connect(gain)
      src.start()
      nodes.push(src)
      level = 0.12
      break
    }
    case 'crowd':
    case 'murmur': {
      // Гомон: шум в полосе голоса, громкость гуляет, как разговор многих людей.
      for (const f0 of [450, 1100, 2300]) {
        const src = noiseSource()
        const g = c.createGain()
        g.gain.value = 0.5
        src.connect(filter('bandpass', f0, 4)).connect(g).connect(gain)
        src.start()
        nodes.push(src, lfo(2 + Math.random() * 3, 0.35, g.gain))
      }
      level = layer === 'crowd' ? 0.4 : 0.18
      break
    }
    case 'birds':
      level = 0.5
      cancel = every(1.2, 4.5, (at) => {
        const f = 2400 + Math.random() * 2400
        const n = 1 + Math.floor(Math.random() * 3)
        for (let i = 0; i < n; i++) chirp(gain, at + i * 0.13, f, f * (0.75 + Math.random() * 0.6), 0.09, 0.05)
      })
      break
    case 'crickets':
      level = 0.5
      cancel = every(0.5, 1.4, (at) => {
        for (let i = 0; i < 3; i++) chirp(gain, at + i * 0.06, 4300, 4200, 0.035, 0.02)
      })
      break
    case 'cicadas': {
      const o = c.createOscillator()
      o.frequency.value = 5800
      const am = c.createGain()
      am.gain.value = 0.3
      o.connect(am).connect(gain)
      o.start()
      nodes.push(o, lfo(38, 0.3, am.gain))
      level = 0.05
      break
    }
  }
  gain.gain.setTargetAtTime(level, c.currentTime, 0.8)
  return {
    gain,
    stop: () => {
      cancel?.()
      gain.gain.setTargetAtTime(0, c.currentTime, 0.5)
      setTimeout(() => {
        for (const n of nodes) {
          try {
            n.stop()
          } catch {
            // уже остановлен
          }
        }
        gain.disconnect()
      }, 2500)
    },
  }
}

function applyAmbience(): void {
  if (!ctx || !master) return
  if (!ambOut) {
    ambOut = ctx.createGain()
    ambOut.gain.value = AMB_LEVEL
    ambOut.connect(master)
  }
  for (const [layer, l] of ambLive) {
    if (!ambWanted.has(layer)) {
      l.stop()
      ambLive.delete(layer)
    }
  }
  for (const layer of ambWanted) if (!ambLive.has(layer)) ambLive.set(layer, startLayer(layer))
}

/** Какие звуки места слышны сейчас (пустой список - тишина). Включаются плавно, лишние гаснут. */
export function setAmbience(layers: AmbienceLayer[]): void {
  const next = new Set(layers)
  if (next.size === ambWanted.size && [...next].every((l) => ambWanted.has(l))) return
  ambWanted = next
  applyAmbience()
}

// ---------- Звуки барабана лотереи (src/sfx.ts) ----------

/** Громкость звуков барабана относительно ползунка. */
const SFX_LEVEL = 0.9
let sfxOut: GainNode | null = null

/** Куда играть звук: мимо плавного нарастания музыки (первое касание - это и есть рывок рычага). */
function sfxTarget(): GainNode | null {
  if (!ctx || level() === 0) return null
  if (asleep()) ctx.resume().catch(() => {})
  if (!sfxOut) {
    sfxOut = ctx.createGain()
    sfxOut.connect(ctx.destination)
  }
  sfxOut.gain.cancelScheduledValues(ctx.currentTime)
  sfxOut.gain.setValueAtTime(level() * SFX_LEVEL, ctx.currentTime)
  return sfxOut
}

/** Рывок рычага. */
export function playLever(): void {
  const out = sfxTarget()
  if (out && ctx) leverSound(ctx, out, ctx.currentTime + 0.01)
}

/** Барабаны пошли: щелчки строк и остановки по заранее рассчитанному времени. */
export function playReels(reels: ReelTiming[]): void {
  const out = sfxTarget()
  if (out && ctx) reelsSound(ctx, out, ctx.currentTime + 0.02, reels)
}
