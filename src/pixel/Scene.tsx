import { useEffect, useRef } from 'preact/hooks'
import type { SceneDef } from '../engine/types'
import { buildScene, composeScene, H, W } from './scene'
import type { Cast, SceneMood } from './scene'
import type { Weather } from './fx'

/** Кадров в секунду: пиксельной анимации хватает 10. */
const FPS = 10

const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * Пиксельная сцена: рисуется на холсте 320×100 и растягивается без сглаживания.
 * Анимируется, только когда видна на экране; стоит на паузе игры (paused), в скрытой вкладке,
 * при prefers-reduced-motion и в неподвижных местах (still: лента итогов, дневник) — тогда один кадр.
 */
export function Scene(props: { scene: SceneDef; region: string; seed: string; label?: string; cast?: Cast; season?: number; weather?: Weather | null; mood?: SceneMood; still?: boolean; paused?: boolean }) {
  const { scene, region, seed, label, cast, season, weather, mood, still, paused } = props
  const ref = useRef<HTMLCanvasElement>(null)
  const t = useRef(0)
  const input = { scene, region, seed, cast, season, weather, mood }
  const key = JSON.stringify(input)
  const live = useRef({ paused, still })
  live.current = { paused, still }

  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const built = buildScene(input)
    composeScene(ctx, built, t.current)
    if (still || reducedMotion()) return
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
    }
  }, [key, still])

  return <canvas ref={ref} class="scene" width={W} height={H} role="img" aria-label={label} />
}
