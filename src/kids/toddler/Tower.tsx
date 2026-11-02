// «Башня»: кубик плывёт над башней, нажми - и он падает. Поставь пять.
// Промах не ломает башню: кубик падает мимо, приходит новый. Звёзды - за промахи и ровность.
import { useEffect, useRef, useState } from 'preact/hooks'
import { playNote } from '../../audio'
import { shade } from './art'
import type { ToddlerGame, ToddlerProps } from './types'

const NEED = 5
const W = 400
const H = 360
const BW = 136 // ширина кубика
const BH = 40
const GROUND = 30
const MIN = BW / 2 + 6
const MAX = W - BW / 2 - 6

function Block({ x, y, color, cls }: { x: number; y: number; color: string; cls?: string }) {
  const line = shade(color, 0.6)
  return (
    <g class={cls}>
      <rect x={x - BW / 2} y={y} width={BW} height={BH} rx="5" fill={color} stroke={line} stroke-width="3" />
      <path d={`M${x - BW / 2 + 4} ${y + BH / 2} L${x + BW / 2 - 4} ${y + BH / 2} M${x - 20} ${y + 3} L${x - 20} ${y + BH / 2} M${x + 30} ${y + BH / 2} L${x + 30} ${y + BH - 3}`} stroke={line} stroke-width="2" opacity="0.6" />
      <rect x={x - BW / 2 + 6} y={y + 4} width={BW - 12} height="5" rx="2" fill={shade(color, 1.35)} opacity="0.7" />
    </g>
  )
}

function TowerGame({ skin, seed, onDone }: ToddlerProps) {
  const wall = skin.tower.wall
  const [stack, setStack] = useState<number[]>([])
  const [x, setX] = useState(seed % 2 ? MIN : MAX)
  const [falling, setFalling] = useState(false)
  const live = useRef({ x: seed % 2 ? MIN : MAX, dir: seed % 2 ? 1 : -1, moving: true, stack: [] as number[], misses: 0, off: 0 })

  useEffect(() => {
    let raf = 0
    let last = performance.now()
    const tick = (now: number) => {
      const L = live.current
      const dt = Math.min(50, now - last) / 1000
      last = now
      if (L.moving) {
        L.x += L.dir * (130 + L.stack.length * 16) * dt
        if (L.x > MAX) [L.x, L.dir] = [MAX, -1]
        if (L.x < MIN) [L.x, L.dir] = [MIN, 1]
        setX(L.x)
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  const drop = () => {
    const L = live.current
    if (!L.moving || L.stack.length >= NEED) return
    L.moving = false
    const top = L.stack.length ? L.stack[L.stack.length - 1] : W / 2
    const off = L.x - top
    if (Math.abs(off) <= BW * 0.6) {
      L.stack = [...L.stack, L.x]
      L.off += Math.abs(off)
      setStack(L.stack)
      playNote(392 + L.stack.length * 60, 140)
      if (L.stack.length >= NEED) {
        const even = L.off / NEED < BW * 0.2
        onDone({ stars: L.misses === 0 && even ? 3 : L.misses <= 1 ? 2 : 1, mistakes: L.misses })
        return
      }
      window.setTimeout(() => restart(), 300)
    } else {
      L.misses++
      playNote(196, 200, 'sine')
      setFalling(true)
      window.setTimeout(() => {
        setFalling(false)
        restart()
      }, 600)
    }
  }
  const restart = () => {
    const L = live.current
    L.x = L.stack.length % 2 ? MAX : MIN
    L.dir = L.x === MIN ? 1 : -1
    L.moving = true
  }

  const yOf = (n: number) => H - GROUND - (n + 1) * BH
  return (
    <svg class="kb-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="tower" onPointerDown={drop}>
      <rect x="0" y="0" width={W} height={H} rx="10" fill={skin.field} />
      <rect x="0" y={H - GROUND} width={W} height={GROUND} fill="rgba(43,33,25,0.25)" />
      <rect x={W / 2 - BW / 2} y={H - GROUND - 8} width={BW} height="12" rx="3" fill="#7d7568" stroke="#5a5348" stroke-width="2" />
      {stack.map((sx, n) => (
        <Block x={sx} y={yOf(n)} color={wall} cls="kt-land" />
      ))}
      {stack.length < NEED && (
        <g class={falling ? 'kt-fall' : ''} style={{ transformOrigin: `${x}px ${yOf(stack.length + 1.6)}px` }}>
          <Block x={x} y={yOf(stack.length + 1.6)} color={wall} />
        </g>
      )}
    </svg>
  )
}

export const towerGame: ToddlerGame = {
  id: 'tower',
  task: 'body',
  Game: TowerGame,
  rule: {
    ru: 'Нажми, когда кубик над башней. Поставь пять.',
    en: 'Tap when the block is over the tower. Stack five.',
    tr: 'Küp kulenin üstündeyken dokun. Beş tane diz.',
  },
}
