// Портрет на надгробии (19.11): без фона - вырезан по силуэту, чёрно-белый, как выбитый в камне. Живописный
// портрет вырезается заливкой от краёв (cutout.ts), пиксельный - тем же способом, что для карточки «Поделиться»
// (portraitHd). Чёрно-белый тон, сепия и «выбитый» край - фильтром CSS (.stone-portrait в skin.css).
import { useEffect, useRef } from 'preact/hooks'
import type { AvatarInput } from './avatar'
import { cutoutPainted } from './cutout'
import { loadPortrait, paintedEnabled } from './painted'
import { portraitHd } from './portraitHd'

const W = 256
const H = 320

export function StonePortrait({ input, label }: { input: AvatarInput; label?: string }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const key = JSON.stringify(input) + (paintedEnabled() ? ':painted' : '')
  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    let gone = false
    const pixel = () => {
      const img = portraitHd(input)
      canvas.width = img.width
      canvas.height = img.height
      canvas.classList.remove('painted')
      ctx.imageSmoothingEnabled = false
      ctx.drawImage(img, 0, 0)
    }
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    if (!paintedEnabled()) {
      pixel()
      return
    }
    loadPortrait(input).then((im) => {
      if (gone) return
      if (!im) return pixel()
      canvas.width = W
      canvas.height = H
      canvas.classList.add('painted')
      ctx.drawImage(im, 0, 0, W, H)
      try {
        const data = ctx.getImageData(0, 0, W, H)
        cutoutPainted(data.data, W, H)
        ctx.putImageData(data, 0, 0)
      } catch {
        // холст недоступен для чтения - остаётся с фоном, его гасит маска по краям
      }
    })
    return () => {
      gone = true
    }
  }, [key])
  return <canvas ref={ref} class="avatar stone-carving" width={W} height={H} role="img" aria-label={label} />
}
