import { useEffect, useRef } from 'preact/hooks'
import type { SceneDef } from '../engine/types'
import { buildScene, composeScene, H, lookOf, W } from './scene'
import { frameImage } from './art'
import type { BuiltScene, Cast, SceneMood } from './scene'
import type { Weather } from './fx'
import { setAmbience } from '../audio'
import type { AmbienceLayer } from '../audio'

/** Кадров в секунду: пиксельной анимации хватает 10. */
const FPS = 10

/** Что слышно в этой сцене: погода, огонь, вода, люди, птицы днём и сверчки ночью. */
export function ambienceOf(b: BuiltScene): AmbienceLayer[] {
  const out = new Set<AmbienceLayer>()
  const outdoor = !['home', 'workshop', 'school', 'bath'].includes(b.place)
  const w = b.fx.weather
  if (w === 'rain') out.add('rain')
  if (w === 'storm') out.add('storm')
  if (w === 'wind' || w === 'snow') out.add('wind')
  if (b.fx.flames.length) out.add('fire')
  if (b.place === 'sea' || b.place === 'harbor') out.add('waves')
  if (b.place === 'river' || b.place === 'bath') out.add('stream')
  if (b.place === 'market' || b.place === 'arena' || b.mood === 'feast') out.add('crowd')
  else if (b.place === 'street' || b.place === 'camp' || b.place === 'battle') out.add('murmur')
  if (outdoor && !w && b.place !== 'battle') {
    if (b.time === 'night') out.add('crickets')
    else if (w !== 'heat') out.add('birds')
  }
  if (w === 'heat') out.add('cicadas')
  return [...out]
}

/** Звуки места задаёт главная сцена на экране; когда она уходит — возвращаются звуки предыдущей. */
const ambStack: { id: number; layers: AmbienceLayer[] }[] = []
let ambSeq = 0
function pushAmbience(layers: AmbienceLayer[]): number {
  const id = ++ambSeq
  ambStack.push({ id, layers })
  setAmbience(layers)
  return id
}
function popAmbience(id: number): void {
  const i = ambStack.findIndex((x) => x.id === id)
  if (i >= 0) ambStack.splice(i, 1)
  // Чуть позже: если сцена тут же пересобирается с теми же звуками, они не обрываются.
  queueMicrotask(() => setAmbience(ambStack[ambStack.length - 1]?.layers ?? []))
}

const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * Пиксельная сцена: рисуется на холсте 320×100 и растягивается без сглаживания.
 * Анимируется, только когда видна на экране; стоит на паузе игры (paused), в скрытой вкладке,
 * при prefers-reduced-motion и в неподвижных местах (still: лента итогов, дневник) — тогда один кадр.
 */
export function Scene(props: { scene: SceneDef; region: string; seed: string; label?: string; cast?: Cast; season?: number; weather?: Weather | null; mood?: SceneMood; still?: boolean; paused?: boolean; ambient?: boolean; art?: 'half' | 'full' | 'none'; year?: number; frame?: boolean }) {
  const { scene, region, seed, label, cast, season, weather, mood, still, paused, ambient, art, year, frame } = props
  const ref = useRef<HTMLCanvasElement>(null)
  const t = useRef(0)
  const input = { scene, region, seed, cast, season, weather, mood, art, year }
  const key = JSON.stringify(input)
  const live = useRef({ paused, still })
  live.current = { paused, still }

  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const built = buildScene(input)
    composeScene(ctx, built, t.current)
    const amb = ambient ? pushAmbience(ambienceOf(built)) : 0
    if (still || reducedMotion()) return () => amb && popAmbience(amb)
    let visible = true
    let raf = 0
    let last = performance.now()
    let acc = 0
    const io = typeof IntersectionObserver === 'function' ? new IntersectionObserver((e) => (visible = e[0]?.isIntersecting ?? true)) : null
    io?.observe(canvas)
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame)
      const dt = Math.min(0.25, (now - last) / 1000)
      last = now
      if (!visible || document.hidden || live.current.paused) return
      acc += dt
      if (acc < 1 / FPS) return
      t.current += acc
      acc = 0
      composeScene(ctx, built, t.current)
    }
    raf = requestAnimationFrame(frame)
    return () => {
      cancelAnimationFrame(raf)
      io?.disconnect()
      if (amb) popAmbience(amb)
    }
  }, [key, still, ambient])

  const canvas = <canvas ref={ref} class="scene" width={W} height={H} role="img" aria-label={label} />
  if (!frame) return canvas
  // Рамка-орнамент края (G5): пиксельный узор, нарисованный кодом.
  const img = frameImage(lookOf(region).style, year)
  return (
    <div class="art-frame" style={img ? { borderImage: `url(${img}) 6 round` } : undefined}>
      {canvas}
    </div>
  )
}
