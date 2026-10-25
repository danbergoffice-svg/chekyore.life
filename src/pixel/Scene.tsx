import { useEffect, useRef } from 'preact/hooks'
import type { SceneDef } from '../engine/types'
import { drawScene, H, W } from './scene'
import type { Cast } from './scene'

/** Пиксельная сцена: рисуется на маленьком холсте и растягивается без сглаживания. */
export function Scene({ scene, region, seed, label, cast }: { scene: SceneDef; region: string; seed: string; label?: string; cast?: Cast }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const key = JSON.stringify([scene, region, seed, cast])
  useEffect(() => {
    const ctx = ref.current?.getContext('2d')
    if (ctx) drawScene(ctx, { scene, region, seed, cast })
  }, [key])
  return <canvas ref={ref} class="scene" width={W} height={H} role="img" aria-label={label} />
}
