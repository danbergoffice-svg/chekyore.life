import { useEffect, useRef } from 'preact/hooks'
import type { SceneDef } from '../engine/types'
import { drawScene, H, W } from './scene'

/** Пиксельная сцена: рисуется на маленьком холсте и растягивается без сглаживания. */
export function Scene({ scene, region, seed, label }: { scene: SceneDef; region: string; seed: string; label?: string }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const key = JSON.stringify([scene, region, seed])
  useEffect(() => {
    const ctx = ref.current?.getContext('2d')
    if (ctx) drawScene(ctx, { scene, region, seed })
  }, [key])
  return <canvas ref={ref} class="scene" width={W} height={H} role="img" aria-label={label} />
}
