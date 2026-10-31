import { useEffect, useRef, useState } from 'preact/hooks'
import type { ComponentChildren } from 'preact'
import { drawFxMid, drawFxTop, emptyFx } from './fx'
import type { Weather } from './fx'
import { ART_H, ART_W, hasIllustration, illustrationUrl } from './illustrations'
import type { Moment } from './illustrations'

const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * Иллюстрация момента (G3): рисованная картинка страны 256×144, поверх - процедурное движение (осадки, огонь).
 * Пока картинки нет, она грузится или не загрузилась - показывается fallback (процедурная сцена); игра не ждёт.
 */
export function Illustration(props: { era: string; moment?: Moment; label?: string; weather?: Weather | null; fire?: boolean; still?: boolean; children: ComponentChildren }) {
  const { era, moment, label, weather, fire, still } = props
  const [img, setImg] = useState<HTMLImageElement | null>(null)
  const ref = useRef<HTMLCanvasElement>(null)
  const available = !!moment && hasIllustration(era, moment)

  useEffect(() => {
    setImg(null)
    if (!available || !moment) return
    let alive = true
    illustrationUrl(era, moment).then((url) => {
      if (!url || !alive) return
      const im = new Image()
      im.onload = () => alive && setImg(im)
      im.src = url
    })
    return () => {
      alive = false
    }
  }, [era, moment, available])

  useEffect(() => {
    const ctx = ref.current?.getContext('2d')
    if (!img || !ctx) return
    const fx = emptyFx(ART_W * 7 + ART_H, ART_H - 20)
    fx.weather = weather ?? undefined
    if (fire) for (const x of [30, 110, 190]) fx.flames.push({ x, y: ART_H - 14, w: 40, h: 10 })
    const draw = (t: number) => {
      ctx.imageSmoothingEnabled = false
      ctx.clearRect(0, 0, ART_W, ART_H)
      ctx.drawImage(img, 0, 0, ART_W, ART_H)
      drawFxMid(ctx, fx, t)
      drawFxTop(ctx, fx, t)
    }
    draw(0)
    if (still || reducedMotion() || (!weather && !fire)) return
    let raf = 0
    const start = performance.now()
    let last = 0
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame)
      if (document.hidden || now - last < 100) return
      last = now
      draw((now - start) / 1000)
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [img, weather, fire, still])

  if (!img) return <>{props.children}</>
  return <canvas ref={ref} class="scene illustration" width={ART_W} height={ART_H} role="img" aria-label={label} />
}
