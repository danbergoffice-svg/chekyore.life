// Макеты детской мини-игры (02.11): своя головоломка у каждой страны, три задания - Тело / Ум / Люди.
// Поля нарисованы SVG поверх настоящей пиксельной сцены края. Снимок - out/kids-*.png.
import { render } from 'preact'
import type { ComponentChildren } from 'preact'
import '@fontsource-variable/alegreya'
import '../../src/style.css'
import '../../src/skin.css'
import { Scene } from '../../src/pixel/Scene'
import { Icon } from '../../src/ui/Icon'
import type { IconName } from '../../src/ui/icons'
import type { ScenePlace } from '../../src/engine/types'

const C = { sand: '#d9c18f', sand2: '#c7a96b', water: '#4f8fd6', water2: '#9cc7f0', ink: '#2a2119', paper: '#f3ead7', terra: '#df6c4f', gold: '#ecd06f', green: '#6f9a4a', wood: '#9a6a3c', wood2: '#c08a52', stone: '#8d8a84', night: '#16213a', purple: '#7d3c8c', muted: '#bfa987', ice: '#d8ecf7', ice2: '#b5d6ea', snow: '#ffffff' }

interface Task {
  icon: IconName
  dir: string
  label: string
  reward: string
}
interface Game {
  era: string
  region: string
  place: ScenePlace
  country: string
  title: string
  story: string
  rule: string
  tasks: [Task, Task, Task]
  moves: string
  board: () => ComponentChildren
}

const body = (label: string, reward: string): Task => ({ icon: 'heart', dir: 'Тело', label, reward })
const mind = (label: string, reward: string): Task => ({ icon: 'book', dir: 'Ум', label, reward })
const people = (label: string, reward: string): Task => ({ icon: 'crown', dir: 'Люди', label, reward })

// ---------- Поля ----------

/** Плитка с каналом: стороны n e s w. */
function Pipe({ x, y, s, ends, wet }: { x: number; y: number; s: number; ends: string; wet?: boolean }) {
  const c = { x: x + s / 2, y: y + s / 2 }
  const to: Record<string, [number, number]> = { n: [c.x, y], s: [c.x, y + s], e: [x + s, c.y], w: [x, c.y] }
  return (
    <g>
      <rect x={x + 1} y={y + 1} width={s - 2} height={s - 2} rx={4} fill={C.sand} stroke={C.sand2} />
      {[...ends].map((d) => (
        <line x1={c.x} y1={c.y} x2={to[d][0]} y2={to[d][1]} stroke={wet ? C.water : '#b08a52'} stroke-width={s * 0.28} stroke-linecap="round" />
      ))}
      <circle cx={c.x} cy={c.y} r={s * 0.14} fill={wet ? C.water : '#b08a52'} />
    </g>
  )
}

function Canals() {
  const s = 56
  const grid = [
    ['ew', 'sw', 'es', 'ew', 'ew'],
    ['ns', 'ne', 'nw', 'es', 'sw'],
    ['ne', 'ew', 'esw', 'nw', 'ns'],
    ['es', 'ew', 'nw', 'ew', 'ne'],
  ]
  const wet = new Set(['0,0', '0,1', '1,1', '1,2', '2,2', '2,3'])
  return (
    <svg viewBox="0 0 340 260">
      <rect x="0" y="0" width="22" height="260" fill={C.water} />
      <text x="11" y="130" fill="#fff" font-size="11" text-anchor="middle" transform="rotate(-90 11 130)">Нил</text>
      {grid.map((row, r) => row.map((e, c) => <Pipe x={24 + c * s} y={16 + r * s} s={s} ends={e} wet={wet.has(`${r},${c}`)} />))}
      <rect x="306" y="20" width="32" height="48" rx="4" fill={C.green} />
      <text x="322" y="48" font-size="10" text-anchor="middle" fill="#fff">поле</text>
      <rect x="306" y="100" width="32" height="48" rx="4" fill={C.gold} />
      <text x="322" y="128" font-size="10" text-anchor="middle">храм</text>
      <rect x="306" y="180" width="32" height="48" rx="4" fill="#b98a6a" />
      <text x="322" y="208" font-size="10" text-anchor="middle" fill="#fff">школа</text>
      <path d="M232 120 a14 14 0 1 1 -2 -14" fill="none" stroke={C.terra} stroke-width="3" />
      <path d="M226 102 l6 4 -7 3z" fill={C.terra} />
    </svg>
  )
}

function Mosaic() {
  const col = ['#b5523b', '#e2c27a', '#2b2622', '#efe6d2']
  const grid = [
    [0, 1, -1, 3],
    [-1, 3, 0, -1],
    [3, -1, 1, 0],
    [-1, 0, -1, 1],
  ]
  const s = 58
  return (
    <svg viewBox="0 0 340 300">
      <rect x="44" y="6" width={s * 4 + 12} height={s * 4 + 12} fill="#6b5a48" rx="4" />
      {grid.map((row, r) =>
        row.map((v, c) => (
          <g>
            <rect x={50 + c * s} y={12 + r * s} width={s - 4} height={s - 4} fill={v < 0 ? 'rgba(255,255,255,0.12)' : col[v]} stroke={v < 0 ? '#c9b89c' : 'none'} stroke-dasharray="4 3" />
            {v >= 0 && <path d={`M${50 + c * s + 8} ${12 + r * s + 8} l${s - 20} ${s - 20}`} stroke="rgba(0,0,0,0.12)" stroke-width="3" />}
          </g>
        )),
      )}
      {col.map((cl, i) => (
        <rect x={74 + i * 52} y={262} width="40" height="32" fill={cl} stroke={i === 2 ? C.gold : '#00000033'} stroke-width={i === 2 ? 4 : 1} />
      ))}
    </svg>
  )
}

function MayaNumber({ x, y, n }: { x: number; y: number; n: number }) {
  const bars = Math.floor(n / 5)
  const dots = n % 5
  return (
    <g>
      {Array.from({ length: dots }, (_, i) => <circle cx={x + 20 + i * 12 - (dots - 1) * 6} cy={y + 8} r="4.5" fill={C.ink} />)}
      {Array.from({ length: bars }, (_, i) => <rect x={x + 2} y={y + 16 + i * 10} width="40" height="7" rx="3" fill={C.ink} />)}
    </g>
  )
}

function Maya() {
  const baskets = [
    { label: 'лепёшки', n: 8, have: 6 },
    { label: 'дни до праздника', n: 13, have: 13 },
    { label: 'дары жрецу', n: 19, have: 10 },
  ]
  return (
    <svg viewBox="0 0 340 300">
      {baskets.map((b, i) => (
        <g>
          <rect x={10 + i * 112} y="6" width="98" height="64" rx="10" fill={C.paper} stroke={C.wood} stroke-width="2" />
          <MayaNumber x={36 + i * 112} y={14} n={b.n} />
          <text x={59 + i * 112} y="86" font-size="11" text-anchor="middle" fill={C.paper}>{b.label}</text>
          <path d={`M${16 + i * 112} 98 h86 l-8 64 h-70z`} fill={C.wood2} stroke={C.wood} stroke-width="2" />
          <MayaNumber x={37 + i * 112} y={112} n={b.have} />
          {b.have === b.n && <text x={59 + i * 112} y="180" font-size="12" text-anchor="middle" fill={C.gold}>готово</text>}
        </g>
      ))}
      <rect x="10" y="200" width="320" height="90" rx="8" fill="rgba(0,0,0,0.25)" />
      <text x="20" y="218" font-size="11" fill={C.paper}>Бобы какао - 1, палочки - 5, ракушка - 0</text>
      {Array.from({ length: 7 }, (_, i) => <ellipse cx={34 + i * 18} cy="246" rx="6" ry="4.5" fill="#6b3b22" />)}
      {Array.from({ length: 3 }, (_, i) => <rect x={170 + i * 4} y={232 + i * 14} width="56" height="8" rx="3" fill={C.wood2} />)}
      <path d="M262 236 q22 -14 40 4 q-18 20 -40 -4z" fill="#f4e7d6" stroke="#b39a7b" />
    </svg>
  )
}

function Quipu() {
  const cords = [
    { n: 132, label: 'ламы', done: true, color: '#c9a35b' },
    { n: 47, label: 'мешки маиса', done: false, color: '#b5523b', partial: [0, 4, 3] },
    { n: 205, label: 'дары инке', done: false, color: '#5b6fa8', partial: [2, 0, 0] },
    { n: 18, label: 'семьи айлью', done: false, color: '#6f9a4a', partial: [0, 0, 0] },
  ]
  return (
    <svg viewBox="0 0 340 300">
      <path d="M14 30 Q170 10 326 30" stroke="#e8dcc0" stroke-width="7" fill="none" />
      {cords.map((cd, i) => {
        const x = 52 + i * 78
        const digits = String(cd.n).padStart(3, '0').split('').map(Number)
        const tied = cd.done ? digits : (cd.partial ?? [0, 0, 0])
        return (
          <g>
            <path d={`M${x} 26 q${i % 2 ? 6 : -6} 110 0 220`} stroke={cd.color} stroke-width="5" fill="none" />
            {tied.map((d, lvl) => Array.from({ length: d }, (_, k) => <ellipse cx={x + (i % 2 ? 3 : -3)} cy={56 + lvl * 64 + k * 9} rx="7" ry="4.5" fill="#3a2a1a" />))}
            {[0, 1, 2].map((lvl) => <line x1={x - 18} x2={x + 18} y1={52 + lvl * 64} y2={52 + lvl * 64} stroke="rgba(255,255,255,0.15)" stroke-dasharray="3 3" />)}
            <rect x={x - 32} y="250" width="64" height="40" rx="6" fill={cd.done ? C.gold : C.paper} />
            <text x={x} y="267" font-size="15" font-weight="700" text-anchor="middle" fill={C.ink}>{cd.n}</text>
            <text x={x} y="283" font-size="9.5" text-anchor="middle" fill={C.ink}>{cd.label}</text>
          </g>
        )
      })}
      <text x="4" y="58" font-size="9" fill={C.paper}>сотни</text>
      <text x="4" y="122" font-size="9" fill={C.paper}>десятки</text>
      <text x="4" y="186" font-size="9" fill={C.paper}>единицы</text>
    </svg>
  )
}

function Tables() {
  // Силуэт «джонка» из клеток, столики трёх размеров (как у Хуан Босы в эпоху Сун).
  const s = 34
  const shape = ['..XXXXX..', '.XXXXXXX.', 'XXXXXXXXX', '.XXXXXXX.', '...XXX...']
  const placed = [
    { x: 2, y: 0, w: 3, h: 1, c: '#a0612e' },
    { x: 5, y: 0, w: 2, h: 1, c: '#c08a52' },
    { x: 1, y: 1, w: 1, h: 2, c: '#8a5228' },
    { x: 2, y: 2, w: 3, h: 1, c: '#a0612e' },
  ]
  return (
    <svg viewBox="0 0 340 300">
      {shape.map((row, r) => [...row].map((ch, c) => ch === 'X' && <rect x={18 + c * s} y={8 + r * s} width={s - 2} height={s - 2} fill="rgba(243,234,215,0.14)" stroke="rgba(243,234,215,0.35)" stroke-dasharray="3 3" />))}
      {placed.map((p) => <rect x={18 + p.x * s} y={8 + p.y * s} width={p.w * s - 2} height={p.h * s - 2} rx="3" fill={p.c} stroke="#3a2010" stroke-width="2" />)}
      <rect x="10" y="196" width="320" height="96" rx="8" fill="rgba(0,0,0,0.25)" />
      {[
        { x: 22, w: 3, h: 1 },
        { x: 138, w: 2, h: 1 },
        { x: 220, w: 1, h: 2 },
        { x: 262, w: 2, h: 1 },
      ].map((p) => <rect x={p.x} y={214} width={p.w * 30} height={p.h * 30} rx="3" fill="#c08a52" stroke="#3a2010" stroke-width="2" />)}
      <text x="20" y="286" font-size="11" fill={C.paper}>осталось 4 столика</text>
    </svg>
  )
}

function Garden() {
  const s = 46
  const rocks = new Set(['1,1', '3,4', '4,1'])
  const path = [[0, 0], [0, 1], [0, 2], [0, 3], [0, 4], [0, 5], [1, 5], [1, 4], [1, 3], [1, 2], [2, 2], [2, 1], [2, 0], [1, 0]]
  return (
    <svg viewBox="0 0 340 300">
      <rect x="28" y="8" width={s * 6 + 4} height={s * 6 + 4} fill="#e8e2d4" />
      {Array.from({ length: 6 }, (_, r) =>
        Array.from({ length: 6 }, (_, c) => (
          <g>
            <rect x={30 + c * s} y={10 + r * s} width={s} height={s} fill="none" stroke="#d6cfbe" />
            {!rocks.has(`${r},${c}`) && [8, 16, 24, 32, 40].map((d) => <line x1={30 + c * s + 4} x2={30 + c * s + s - 4} y1={10 + r * s + d} y2={10 + r * s + d} stroke="#d2cab6" />)}
          </g>
        )),
      )}
      {[...rocks].map((k) => {
        const [r, c] = k.split(',').map(Number)
        return (
          <g>
            <ellipse cx={30 + c * s + s / 2} cy={10 + r * s + s / 2} rx="20" ry="15" fill="#6d6a64" />
            <ellipse cx={30 + c * s + s / 2 - 5} cy={10 + r * s + s / 2 - 5} rx="8" ry="5" fill="#8d8a84" />
            <ellipse cx={30 + c * s + s / 2} cy={10 + r * s + s / 2} rx="23" ry="18" fill="none" stroke="#bdb5a3" stroke-dasharray="2 3" />
          </g>
        )
      })}
      <polyline points={path.map(([r, c]) => `${30 + c * s + s / 2},${10 + r * s + s / 2}`).join(' ')} fill="none" stroke={C.terra} stroke-width="6" stroke-linecap="round" stroke-linejoin="round" />
      <circle cx={30 + s / 2} cy={10 + s / 2} r="8" fill={C.terra} />
      <text x="170" y="296" font-size="11" text-anchor="middle" fill={C.paper}>провести грабли по всему гравию одной бороздой</text>
    </svg>
  )
}

function Rangoli() {
  const s = 40
  const col: Record<string, string> = { o: '#f08a24', p: '#e0507a', w: '#fbf6ea', y: '#f2c531', g: '#4f9a5a' }
  const q = ['oyp', 'yww', 'pwg']
  const full = [...q.map((r) => r + [...r].reverse().join('')), ...[...q].reverse().map((r) => r + [...r].reverse().join(''))]
  const shown = (r: number, c: number) => (r < 3 && c < 3) || (r < 3 && c >= 3 && c < 5 && r < 2) || (r >= 3 && c < 2 && r < 5)
  return (
    <svg viewBox="0 0 340 300">
      <rect x="46" y="6" width={s * 6 + 8} height={s * 6 + 8} rx="10" fill="#7a4a2a" />
      {full.map((row, r) =>
        [...row].map((ch, c) =>
          shown(r, c) ? (
            <rect x={50 + c * s + 2} y={10 + r * s + 2} width={s - 4} height={s - 4} rx="10" fill={col[ch]} />
          ) : (
            <circle cx={50 + c * s + s / 2} cy={10 + r * s + s / 2} r="3" fill="rgba(255,255,255,0.5)" />
          ),
        ),
      )}
      <line x1={50 + 3 * s} x2={50 + 3 * s} y1="6" y2={14 + 6 * s} stroke={C.paper} stroke-dasharray="5 4" />
      <line x1="46" x2={54 + 6 * s} y1={10 + 3 * s} y2={10 + 3 * s} stroke={C.paper} stroke-dasharray="5 4" />
      {Object.values(col).map((cl, i) => <circle cx={92 + i * 40} cy="276" r="14" fill={cl} stroke={i === 0 ? C.gold : 'none'} stroke-width="3" />)}
    </svg>
  )
}

function Scales() {
  return (
    <svg viewBox="0 0 340 300">
      <rect x="166" y="40" width="8" height="170" fill={C.wood} />
      <rect x="130" y="206" width="80" height="12" rx="4" fill={C.wood} />
      <g transform="rotate(-7 170 44)">
        <rect x="40" y="40" width="260" height="8" rx="4" fill="#b88a3a" />
        <line x1="56" y1="46" x2="40" y2="110" stroke="#8a6a2a" />
        <line x1="56" y1="46" x2="96" y2="110" stroke="#8a6a2a" />
        <line x1="284" y1="46" x2="244" y2="110" stroke="#8a6a2a" />
        <line x1="284" y1="46" x2="324" y2="110" stroke="#8a6a2a" />
        <path d="M34 110 h68 q-6 18 -34 18 q-28 0 -34 -18z" fill="#c9a24a" />
        <path d="M238 110 h92 q-6 18 -46 18 q-40 0 -46 -18z" fill="#c9a24a" />
        <path d="M50 108 q18 -40 36 0z" fill="#d8c08a" stroke="#8a6a2a" />
        <text x="68" y="102" font-size="12" text-anchor="middle" font-weight="700">шафран 7</text>
        <rect x="258" y="94" width="18" height="16" rx="3" fill="#6d6a64" />
        <text x="267" y="106" font-size="10" text-anchor="middle" fill="#fff">9</text>
      </g>
      <text x="170" y="30" font-size="12" text-anchor="middle" fill={C.paper}>уравновесь весы</text>
      <rect x="10" y="232" width="320" height="60" rx="8" fill="rgba(0,0,0,0.25)" />
      {[1, 3, 9, 27].map((w, i) => (
        <g>
          <rect x={40 + i * 72} y={246 + (3 - i) * 2} width={20 + i * 6} height={22 - (3 - i) * 2} rx="3" fill={i === 2 ? '#3d3b38' : '#6d6a64'} />
          <text x={50 + i * 72 + i * 3} y="262" font-size="11" text-anchor="middle" fill="#fff">{w}</text>
        </g>
      ))}
      <text x="20" y="287" font-size="10" fill={C.paper}>гирю можно класть на любую чашу</text>
    </svg>
  )
}

function Harbor() {
  const s = 46
  const ships = [
    { x: 0, y: 2, w: 2, h: 1, c: C.purple, main: true },
    { x: 2, y: 0, w: 1, h: 3, c: '#a0612e' },
    { x: 3, y: 1, w: 1, h: 2, c: '#7a5a3a' },
    { x: 4, y: 3, w: 2, h: 1, c: '#a0612e' },
    { x: 0, y: 4, w: 3, h: 1, c: '#7a5a3a' },
    { x: 5, y: 0, w: 1, h: 3, c: '#8a6a4a' },
  ]
  return (
    <svg viewBox="0 0 340 300">
      <rect x="24" y="8" width={s * 6 + 4} height={s * 6 + 4} fill="#3f78b0" />
      {Array.from({ length: 6 }, (_, r) => Array.from({ length: 6 }, (_, c) => <rect x={26 + c * s} y={10 + r * s} width={s} height={s} fill="none" stroke="rgba(255,255,255,0.12)" />))}
      <rect x={26 + 6 * s} y={10 + 2 * s} width="24" height={s} fill={C.wood2} />
      <text x={26 + 6 * s + 12} y={10 + 2 * s + 28} font-size="9" text-anchor="middle" transform={`rotate(-90 ${26 + 6 * s + 12} ${10 + 2 * s + 26})`}>причал</text>
      {ships.map((sh) => (
        <g>
          <rect x={28 + sh.x * s} y={12 + sh.y * s} width={sh.w * s - 4} height={sh.h * s - 4} rx={sh.w > sh.h ? 18 : 12} fill={sh.c} stroke="#2a1a10" stroke-width="2" />
          <rect x={28 + sh.x * s + (sh.w * s) / 2 - 8} y={12 + sh.y * s + (sh.h * s) / 2 - 10} width="12" height="16" fill={sh.main ? C.gold : C.paper} opacity="0.9" />
        </g>
      ))}
      <path d={`M${28 + 2 * s - 6} ${12 + 2 * s + 20} h30`} stroke={C.gold} stroke-width="3" />
      <path d={`M${28 + 2 * s + 26} ${12 + 2 * s + 14} l8 6 -8 6z`} fill={C.gold} />
      <text x="170" y="296" font-size="11" text-anchor="middle" fill={C.paper}>корабль с зерном (пурпурный) - к причалу</text>
    </svg>
  )
}

function Knights() {
  const s = 80
  const pieces: Record<string, 'w' | 'b'> = { '0,0': 'w', '0,2': 'w', '2,0': 'b', '2,2': 'b' }
  const knight = (x: number, y: number, k: 'w' | 'b') => (
    <path
      transform={`translate(${x} ${y}) scale(2)`}
      d="M8 26 h16 v-3 h-2 c0-6 -1-9 1-13 l-3-5 c-4 0 -9 3 -11 8 l3 2 3-2 c0 3 -4 5 -6 8 v2 h-2z"
      fill={k === 'w' ? '#f3ead7' : '#2b2622'}
      stroke={k === 'w' ? '#2b2622' : '#f3ead7'}
      stroke-width="1"
    />
  )
  return (
    <svg viewBox="0 0 340 300">
      {Array.from({ length: 3 }, (_, r) =>
        Array.from({ length: 3 }, (_, c) => (
          <rect x={50 + c * s} y={10 + r * s} width={s} height={s} fill={(r + c) % 2 ? '#8a5a32' : '#e3c48f'} />
        )),
      )}
      {Object.entries(pieces).map(([k, v]) => {
        const [r, c] = k.split(',').map(Number)
        return knight(50 + c * s + 8, 10 + r * s + 6, v)
      })}
      <path d={`M${50 + s / 2} ${10 + s / 2} L${50 + s / 2} ${10 + 2.5 * s - 20} L${50 + 1.5 * s - 10} ${10 + 2.5 * s - 20}`} fill="none" stroke={C.terra} stroke-width="4" stroke-dasharray="6 5" />
      <circle cx={50 + 1.5 * s} cy={10 + 2.5 * s} r="10" fill="none" stroke={C.terra} stroke-width="4" />
      <text x="170" y="272" font-size="12" text-anchor="middle" fill={C.paper}>поменяй белых и чёрных коней местами</text>
      <text x="170" y="290" font-size="11" text-anchor="middle" fill={C.muted}>конь ходит буквой «Г»</text>
    </svg>
  )
}

function Ice() {
  const s = 40
  const map = ['.......', '.#...o.', '...#...', '.o.....', '....#..', '#......', '...o..H']
  return (
    <svg viewBox="0 0 340 300">
      <rect x="30" y="6" width={s * 7 + 4} height={s * 7 + 4} fill={C.ice2} />
      {map.map((row, r) =>
        [...row].map((ch, c) => (
          <g>
            <rect x={32 + c * s} y={8 + r * s} width={s - 1} height={s - 1} fill={C.ice} />
            {ch === '#' && <path d={`M${32 + c * s} ${8 + r * s + s} q${s / 2} ${-s} ${s} 0z`} fill={C.snow} stroke="#cfe2ee" />}
            {ch === 'o' && <ellipse cx={32 + c * s + s / 2} cy={8 + r * s + s / 2} rx="15" ry="11" fill="#2f5a7a" />}
            {ch === 'H' && (
              <g>
                <path d={`M${32 + c * s + 4} ${8 + r * s + 18} l16 -14 16 14z`} fill="#8a4a2a" />
                <rect x={32 + c * s + 8} y={8 + r * s + 18} width="24" height="18" fill={C.wood2} />
              </g>
            )}
          </g>
        )),
      )}
      <rect x={32 + 0 * s + 8} y={8 + 0 * s + 12} width="24" height="14" rx="3" fill={C.terra} />
      <path d={`M${32 + s / 2} ${8 + s / 2} H${32 + 6 * s + s / 2} V${8 + 3 * s + s / 2}`} fill="none" stroke={C.terra} stroke-width="3" stroke-dasharray="6 5" />
      <text x="170" y="298" font-size="11" text-anchor="middle" fill={C.paper}>сани едут, пока не упрутся в сугроб; полыньи - мимо</text>
    </svg>
  )
}

function Gebeta() {
  const top = [4, 0, 3, 5, 1, 2]
  const bot = [2, 4, 0, 6, 3, 1]
  const pit = (cx: number, cy: number, n: number, hi?: boolean) => (
    <g>
      <ellipse cx={cx} cy={cy} rx="21" ry="24" fill="#5a3418" stroke={hi ? C.gold : '#3a2010'} stroke-width={hi ? 4 : 2} />
      {Array.from({ length: n }, (_, i) => <circle cx={cx - 8 + (i % 3) * 8} cy={cy - 8 + Math.floor(i / 3) * 9} r="3.6" fill="#e9dcc0" />)}
      <text x={cx} y={cy + 38} font-size="11" text-anchor="middle" fill={C.paper}>{n}</text>
    </g>
  )
  return (
    <svg viewBox="0 0 340 300">
      <rect x="6" y="40" width="328" height="170" rx="40" fill="#8a5a32" stroke="#5a3418" stroke-width="3" />
      {top.map((n, i) => pit(62 + i * 43, 82, n))}
      {bot.map((n, i) => pit(62 + i * 43, 162, n, i === 3))}
      <ellipse cx="24" cy="125" rx="12" ry="50" fill="#5a3418" />
      <ellipse cx="316" cy="125" rx="12" ry="50" fill="#5a3418" />
      <path d="M191 140 q40 -6 72 0 q30 -20 30 -60" fill="none" stroke={C.gold} stroke-width="3" stroke-dasharray="5 4" />
      <text x="170" y="240" font-size="12" text-anchor="middle" fill={C.paper}>разложи семена по одному в лунки по кругу</text>
      <text x="170" y="258" font-size="12" text-anchor="middle" fill={C.paper}>последнее зерно должно упасть в лунку с 3 семенами</text>
    </svg>
  )
}

function Manuscripts() {
  const col = ['#b5523b', '#3f6aa0', '#5b8a3a', '#c9a35b']
  const stacks = [
    [0, 1, 2, 0],
    [1, 3, 3],
    [2, 0, 1, 2],
    [3, 1],
    [],
  ]
  return (
    <svg viewBox="0 0 340 300">
      {stacks.map((st, i) => (
        <g>
          <path d={`M${12 + i * 66} 250 h58 v26 h-58z`} fill="#7a4a2a" stroke="#3a2010" stroke-width="2" />
          <path d={`M${12 + i * 66} 250 l6 -10 h46 l6 10z`} fill="#9a6a3c" />
          {st.map((cl, k) => (
            <g>
              <rect x={18 + i * 66} y={222 - k * 30} width="46" height="26" rx="3" fill={col[cl]} stroke="#2a1a10" stroke-width="1.5" />
              <line x1={24 + i * 66} x2={58 + i * 66} y1={235 - k * 30} y2={235 - k * 30} stroke="rgba(255,255,255,0.4)" />
            </g>
          ))}
        </g>
      ))}
      <rect x="216" y="70" width="46" height="26" rx="3" fill={col[1]} stroke={C.gold} stroke-width="3" />
      <path d="M239 100 v40" stroke={C.gold} stroke-width="3" stroke-dasharray="4 4" />
      <text x="170" y="40" font-size="12" text-anchor="middle" fill={C.paper}>разложи рукописи по сундукам: в каждом - один цвет</text>
      <text x="170" y="296" font-size="11" text-anchor="middle" fill={C.paper}>брать можно только верхнюю</text>
    </svg>
  )
}

// ---------- Страны ----------

const GAMES: Game[] = [
  {
    era: 'ANE', region: 'thebes', place: 'river', country: 'Египет и Двуречье',
    title: 'Каналы на разливе', story: 'Нил разлился. Отец доверил тебе открыть заслонки - куда пойдёт вода?',
    rule: 'Поворачивай плитки, чтобы вода дошла от реки до цели.',
    tasks: [body('Вода к полю семьи', '+здоровье, +сила'), mind('Пруд у школы писцов', '+ум, +грамота'), people('Сад при храме', '+положение')], moves: 'Поворотов: 6 из 12', board: Canals,
  },
  {
    era: 'E03', region: 'rome', place: 'workshop', country: 'Классическая античность',
    title: 'Мозаичный пол', story: 'Мастер-мозаичник разрешил тебе выложить угол пола.',
    rule: 'В каждой строке и в каждом столбце - все четыре цвета по одному разу.',
    tasks: [body('Пол в термах', '+здоровье'), mind('Пол в библиотеке', '+ум'), people('Пол в доме сенатора', '+положение')], moves: 'Осталось клеток: 6', board: Mosaic,
  },
  {
    era: 'MAY', region: 'tikal', place: 'school', country: 'Майя',
    title: 'Счёт точками и чертами', story: 'Жрец учит считать по-майяски: точка - один, черта - пять.',
    rule: 'Положи в корзину столько бобов и палочек, сколько написано на табличке.',
    tasks: [body('Лепёшки на всю семью', '+сила'), mind('Дни до праздника', '+ум'), people('Дары жрецу', '+положение')], moves: 'Ошибок: 0 из 3', board: Maya,
  },
  {
    era: 'AMR', region: 'cusco', place: 'field', country: 'Ацтеки и инки',
    title: 'Узелки кипу', story: 'Счётчик айлью показывает, как записать число узлами на шнуре.',
    rule: 'Навяжи узлы: верхний ряд - сотни, средний - десятки, нижний - единицы.',
    tasks: [body('Стадо лам', '+сила'), mind('Мешки маиса', '+ум'), people('Дары инке', '+положение')], moves: 'Шнуров: 1 из 4', board: Quipu,
  },
  {
    era: 'CHN', region: 'hangzhou', place: 'home', country: 'Китай: Сун, Юань, Мин',
    title: 'Столики для гостей', story: 'Гостей много. Расставь столики так, чтобы вышла фигура джонки - как в книге о столиках эпохи Сун.',
    rule: 'Заполни силуэт столиками трёх размеров без щелей.',
    tasks: [body('Обед для работников', '+здоровье'), mind('Задача учителя', '+ум'), people('Пир чиновника', '+положение')], moves: 'Столиков: 4 из 8', board: Tables,
  },
  {
    era: 'JPN', region: 'kyoto', place: 'temple', country: 'Япония',
    title: 'Сад камней', story: 'Монах дал тебе грабли: гравий должен лечь ровными волнами.',
    rule: 'Проведи одну борозду через весь гравий, обходя камни и не пересекая себя.',
    tasks: [body('Двор у колодца', '+здоровье'), mind('Сад при храме', '+ум'), people('Сад даймё', '+положение')], moves: 'Клеток: 14 из 33', board: Garden,
  },
  {
    era: 'IND', region: 'vijayanagara', place: 'home', country: 'Индия',
    title: 'Узор ранголи', story: 'К празднику сёстры рисуют у порога узор из цветного порошка.',
    rule: 'Закончи узор: он должен быть одинаковым во всех четырёх четвертях.',
    tasks: [body('У порога дома', '+здоровье'), mind('У дверей гуру', '+ум'), people('У ворот раджи', '+положение')], moves: 'Клеток: 18 из 36', board: Rangoli,
  },
  {
    era: 'ISL', region: 'baghdad', place: 'market', country: 'Исламский мир',
    title: 'Весы на базаре', story: 'Лавочник занят - взвесь товар сам. Гирь всего четыре: 1, 3, 9 и 27.',
    rule: 'Уравновесь чаши. Гирю можно класть и рядом с товаром.',
    tasks: [body('Муку для дома', '+сила'), mind('Задачу из книги аль-Хорезми', '+ум'), people('Шафран для визиря', '+положение')], moves: 'Взвешиваний: 2 из 5', board: Scales,
  },
  {
    era: 'BYZ', region: 'constantinople', place: 'harbor', country: 'Византия',
    title: 'Гавань Золотого Рога', story: 'Корабль с египетским зерном не может пройти к причалу - мешают другие.',
    rule: 'Двигай корабли вдоль их борта, освободи путь пурпурному.',
    tasks: [body('Зерно для квартала', '+здоровье'), mind('Задача логофета', '+ум'), people('Груз для дворца', '+положение')], moves: 'Ходов: 3 из 9', board: Harbor,
  },
  {
    era: 'EUR', region: 'florence', place: 'home', country: 'Средневековая Европа',
    title: 'Задача о конях', story: 'Старый нотариус показал шахматную загадку из итальянской рукописи.',
    rule: 'Поменяй местами белых и чёрных коней. Конь ходит буквой «Г».',
    tasks: [body('Сыграть с конюхом', '+сила'), mind('Загадка нотариуса', '+ум'), people('Партия с сыном сеньора', '+положение')], moves: 'Ходов: 4 из 16', board: Knights,
  },
  {
    era: 'RUS', region: 'novgorod', place: 'river', country: 'Русь и Московия',
    title: 'Сани по льду', story: 'Река встала. Довези сани домой, не угодив в полынью.',
    rule: 'Сани скользят, пока не упрутся в сугроб. Полыньи объезжай.',
    tasks: [body('Дрова домой', '+здоровье, +сила'), mind('Грамоту дьячку', '+ум'), people('Гостинец боярыне', '+положение')], moves: 'Толчков: 2 из 7', board: Ice,
  },
  {
    era: 'ETH', region: 'lalibela', place: 'yard', country: 'Эфиопия',
    title: 'Гебета', story: 'Дед учит старой игре: семена кладут в лунки по одному.',
    rule: 'Выбери лунку так, чтобы последнее семя упало туда, где их три, - и забери урожай.',
    tasks: [body('Сыграть с пастухами', '+сила'), mind('Обыграть деда', '+ум'), people('Сыграть с сыном раса', '+положение')], moves: 'Ходов: 1 из 3', board: Gebeta,
  },
  {
    era: 'WAF', region: 'timbuktu', place: 'school', country: 'Мали и Сонгай',
    title: 'Рукописи Тимбукту', story: 'Учёный попросил разобрать сундуки: книги смешались после дороги.',
    rule: 'Перекладывай верхние рукописи, пока в каждом сундуке не будет одного цвета.',
    tasks: [body('Помочь караванщикам', '+сила'), mind('Помочь учёному', '+ум'), people('Сундуки для мансы', '+положение')], moves: 'Перекладываний: 5 из 14', board: Manuscripts,
  },
]

function Stars({ n }: { n: number }) {
  return (
    <span class="kstars">
      {[0, 1, 2].map((i) => (
        <svg viewBox="0 0 24 24" width="22" height="22">
          <path d="M12 2.5l2.9 6 6.6.8-4.9 4.5 1.3 6.5L12 17l-5.9 3.3 1.3-6.5L2.5 9.3l6.6-.8z" fill={i < n ? C.gold : 'none'} stroke={C.gold} stroke-width="1.6" />
        </svg>
      ))}
    </span>
  )
}

function Phone({ g, i }: { g: Game; i: number }) {
  const sel = i % 3
  return (
    <div class="kcol">
      <p class="kcap">{g.country}</p>
      <div class="kphone">
        <div class="kscene">
          <Scene scene={{ place: g.place, time: 'day', people: 3 }} region={g.region} seed={`kids-${g.era}`} still />
          <span class="kage">8 лет · лето</span>
        </div>
        <div class="kbody">
          <h2 class="ktitle">{g.title}</h2>
          <p class="kstory">{g.story}</p>
          <div class="ktasks">
            {g.tasks.map((tk, k) => (
              <div class={`ktask${k === sel ? ' on' : ''}`}>
                <span class="kdir"><Icon name={tk.icon} /> {tk.dir}</span>
                <span class="klabel">{tk.label}</span>
                <span class="kreward">{tk.reward}</span>
              </div>
            ))}
          </div>
          <div class="kboard">{g.board()}</div>
          <p class="krule">{g.rule}</p>
          <div class="kfoot">
            <span>{g.moves}</span>
            <Stars n={2} />
          </div>
          <div class="kbtns">
            <button class="secondary">Сначала</button>
            <button class="secondary">Подсказка</button>
          </div>
        </div>
      </div>
    </div>
  )
}

render(
  <div class="kgrid">
    {GAMES.map((g, i) => (
      <Phone g={g} i={i} />
    ))}
  </div>,
  document.getElementById('app')!,
)
await document.fonts.ready
setTimeout(() => (document.body.dataset.ready = '1'), 1200)
