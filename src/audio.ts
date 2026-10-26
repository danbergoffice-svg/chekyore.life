// Фоновая музыка: свой трек у меню и у каждой страны (public/music/<id>.mp3, сочиняет tools/gen/music.mjs).
// Играет по кругу через Web Audio (так громкость работает и на iPhone), между треками — плавный переход.
// Начинает после первого касания или клавиши (раньше браузеры звук не пускают), молчит, пока вкладка скрыта,
// идёт реклама или платформа просит выключить звук. Грузится только тот трек, который нужен сейчас.
import { platform } from './platform'

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

/** Контекст спит (пауза, блокировка телефона, звонок на iOS — 'interrupted'). */
const asleep = () => !!ctx && ctx.state !== 'running' && ctx.state !== 'closed'

function apply(): void {
  if (!ctx || !master) return
  const l = level()
  master.gain.setTargetAtTime(l, ctx.currentTime, 0.2)
  if (l > 0) {
    if (asleep()) ctx.resume().catch(() => {})
    switchTrack()
  } else {
    silent?.pause()
    // Через секунду после затухания — пауза контекста: не тратим батарею.
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
 * iOS 17+: audioSession.type = 'playback'; раньше — зацикленный беззвучный <audio>, который переключает сессию.
 */
let silent: HTMLAudioElement | null = null
function playbackSession(): void {
  const session = (navigator as unknown as { audioSession?: { type: string } }).audioSession
  if (session) {
    try {
      session.type = 'playback'
      return
    } catch {
      // не поддерживается — запасной путь ниже
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
  if (IOS && level() > 0) iosHint?.()
}

/** Подсказка про беззвучный режим (показывает интерфейс один раз за всё время). */
let iosHint: (() => void) | null = null
export function onIosHint(cb: () => void): void {
  iosHint = cb
}

/** ?audiodebug=1 — состояние звука в углу экрана, чтобы проверить телефон. */
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
    `трек: ${current?.id ?? '—'} (нужен ${wanted ?? '—'})`,
    `громкость: ${enabled ? 'вкл' : 'выкл'} ${volume.toFixed(2)} → ${level().toFixed(2)}`,
    `блок: ${[...blocked].join(', ') || 'нет'}`,
    `iOS: ${IOS} session: ${session?.type ?? '—'} silent: ${silent ? (silent.paused ? 'пауза' : 'играет') : '—'}`,
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
