import { useEffect, useRef } from 'preact/hooks'
import { AH, AW, drawAvatar } from './avatar'
import type { AvatarInput } from './avatar'
import { loadPortrait, paintedEnabled } from './painted'

/**
 * Портрет героя: маленький холст, растянутый без сглаживания. В живописном режиме (painted.ts) поверх
 * пиксельного, как только загрузится, - живописный портрет края: сословие × пол × возраст, та же пропорция 4:5.
 */
export function Avatar({ input, label }: { input: AvatarInput; label?: string }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const key = JSON.stringify(input) + (paintedEnabled() ? ':painted' : '')
  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    canvas.width = AW
    canvas.height = AH
    canvas.classList.remove('painted')
    drawAvatar(ctx, input)
    if (!paintedEnabled()) return
    let gone = false
    loadPortrait(input).then((im) => {
      if (gone || !im) return
      canvas.width = 256
      canvas.height = 320
      canvas.classList.add('painted')
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = 'high'
      // Умерших (мемориал, итог жизни) - чуть приглушить, как старую картину.
      if (input.dead) ctx.filter = 'saturate(0.6) sepia(0.15)'
      ctx.drawImage(im, 0, 0, 256, 320)
      ctx.filter = 'none'
    })
    return () => {
      gone = true
    }
  }, [key])
  return <canvas ref={ref} class="avatar" width={AW} height={AH} role="img" aria-label={label} />
}
