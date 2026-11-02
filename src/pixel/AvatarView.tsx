import { useEffect, useRef } from 'preact/hooks'
import { AH, AW, drawAvatar } from './avatar'
import type { AvatarInput } from './avatar'

/** Портрет героя: маленький холст, растянутый без сглаживания. */
export function Avatar({ input, label }: { input: AvatarInput; label?: string }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const key = JSON.stringify(input)
  useEffect(() => {
    const ctx = ref.current?.getContext('2d')
    if (ctx) drawAvatar(ctx, input)
  }, [key])
  return <canvas ref={ref} class="avatar" width={AW} height={AH} role="img" aria-label={label} />
}
