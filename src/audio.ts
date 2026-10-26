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
const MUSIC_VERSION = 1

/** Громкость на слух: ползунок 0–1 → квадрат (тихие значения различимы). */
const level = () => (enabled && blocked.size === 0 ? volume * volume : 0)

function apply(): void {
  if (!ctx || !master) return
  const l = level()
  master.gain.setTargetAtTime(l, ctx.currentTime, 0.2)
  if (l > 0) {
    if (ctx.state === 'suspended') ctx.resume().catch(() => {})
    switchTrack()
  } else {
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
  if (!buffer || wanted !== id || current?.id === id || !ctx || !master) return
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

/** Первое касание: создать звуковой контекст (раньше браузер не разрешает). */
function unlock(): void {
  if (ctx) return
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
  apply()
}

let started = false
/** Подключить музыку: настройки игрока, жесты для разблокировки, паузы платформы. */
export function initAudio(on: boolean, vol: number): void {
  enabled = on
  volume = vol
  if (started || typeof window === 'undefined') return
  started = true
  for (const ev of ['pointerdown', 'keydown', 'touchend'] as const) window.addEventListener(ev, unlock, { capture: true, passive: true })
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
