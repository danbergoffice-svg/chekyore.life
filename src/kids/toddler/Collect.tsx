// «Собери»: вещи появляются на поле, нажми, пока не спрятались. Нужно 8.
// Пока ребёнок не поймал первую, ничего не убегает. Звёзды - за пропущенные.
import { useEffect, useRef, useState } from 'preact/hooks'
import { makeRng, pickOne } from '../rng'
import { playNote } from '../../audio'
import { Thing } from './art'
import type { ToddlerGame, ToddlerProps } from './types'

const NEED = 8
const COLS = 4
const ROWS = 3
const W = 400
const H = 330
const CW = W / COLS
const CH = (H - 50) / ROWS
const LIFE_MS = 2600

interface Item {
  id: number
  cell: number
  /** живёт · пойман · спрятался */
  st: 'up' | 'got' | 'gone'
}

function CollectGame({ skin, seed, onDone }: ToddlerProps) {
  const s = skin.collect
  const rng = useRef(makeRng(seed)).current
  const [items, setItems] = useState<Item[]>([])
  const live = useRef({ items: [] as Item[], got: 0, missed: 0, next: 1, over: false })
  const set = (list: Item[]) => {
    live.current.items = list
    setItems(list)
  }

  useEffect(() => {
    const timers: number[] = []
    const later = (fn: () => void, ms: number) => timers.push(window.setTimeout(fn, ms))
    const spawn = () => {
      const L = live.current
      if (L.over) return
      const up = L.items.filter((i) => i.st === 'up')
      const busy = new Set(L.items.map((i) => i.cell))
      const free = [...Array(COLS * ROWS).keys()].filter((c) => !busy.has(c))
      if (up.length < 3 && free.length) {
        const item: Item = { id: L.next++, cell: pickOne(rng, free), st: 'up' }
        set([...L.items, item])
        const expire = () => {
          const cur = live.current.items.find((i) => i.id === item.id)
          if (!cur || cur.st !== 'up' || live.current.over) return
          // Пока правило не понято (ни одной не поймано), вещи ждут.
          if (live.current.got === 0) return later(expire, 600)
          live.current.missed++
          set(live.current.items.map((i) => (i.id === item.id ? { ...i, st: 'gone' } : i)))
          later(() => set(live.current.items.filter((i) => i.id !== item.id)), 320)
        }
        later(expire, LIFE_MS)
      }
      later(spawn, up.length === 0 ? 250 : 750)
    }
    later(spawn, 400)
    return () => timers.forEach(clearTimeout)
  }, [])

  const grab = (id: number) => {
    const L = live.current
    const it = L.items.find((i) => i.id === id)
    if (!it || it.st !== 'up' || L.over) return
    L.got++
    playNote(520 + L.got * 40, 120)
    set(L.items.map((i) => (i.id === id ? { ...i, st: 'got' } : i)))
    window.setTimeout(() => set(live.current.items.filter((i) => i.id !== id)), 260)
    if (L.got >= NEED) {
      L.over = true
      onDone({ stars: L.missed <= 2 ? 3 : L.missed <= 5 ? 2 : 1, mistakes: L.missed })
    }
  }

  const got = live.current.got
  return (
    <svg class="kb-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="collect">
      <rect x="0" y="0" width={W} height={H - 50} rx="10" fill={skin.field} />
      {items.map((it) => {
        const cx = (it.cell % COLS) * CW + CW / 2
        const cy = Math.floor(it.cell / COLS) * CH + CH / 2
        return (
          <g class={`kt-pop kt-${it.st}`} style={{ transformOrigin: `${cx}px ${cy}px` }} onPointerDown={() => grab(it.id)}>
            <circle cx={cx} cy={cy} r="40" fill="#fff8e6" opacity="0.35" />
            <Thing kind={s.thing} color={s.color} x={cx} y={cy} size={64} />
          </g>
        )
      })}
      <rect x="0" y={H - 44} width={W} height="44" rx="8" fill="rgba(0,0,0,0.22)" />
      {[...Array(NEED).keys()].map((i) => (
        <g opacity={i < got ? 1 : 0.22}>
          <Thing kind={s.thing} color={i < got ? s.color : '#f3ead7'} x={28 + i * 49} y={H - 22} size={30} />
        </g>
      ))}
    </svg>
  )
}

export const collectGame: ToddlerGame = {
  id: 'collect',
  task: 'body',
  Game: CollectGame,
  rule: {
    ru: 'Нажимай, пока не спрятались! Собери восемь.',
    en: 'Tap them before they hide! Collect eight.',
    tr: 'Saklanmadan önce dokun! Sekiz tane topla.',
  },
}
