// Доска «Числа майя»: выбрал фишку внизу → тап по ярусу корзины (положить); инструмент «снять» → тап по фишке.
import { useEffect, useState } from 'preact/hooks'
import type { JSX } from 'preact'
import type { BoardProps, KidsLang, KidsPuzzle, Task } from './types'
import { basketOk, CHIPS, maya, mayaWhy, type Chip, type MayaMove, type MayaState, type MayaWhy, type Pile } from './maya'

type Tool = Chip | 'take'

const L: Record<KidsLang, Record<string, string>> = {
  ru: {
    body: 'Сколько лепёшек?', mind: 'Сколько дней до праздника?', people: 'Сколько даров жрецу?',
    dot: 'точка', bar: 'черта', shell: 'ракушка', take: 'снять',
    'why.empty': 'Таких фишек больше нет - сними лишнюю.', 'why.none': 'Здесь такой фишки нет.',
    'why.shell': 'Ракушку кладут только в пустой ярус.', 'why.onshell': 'Тут лежит ракушка - сначала сними её.',
    'why.dots': 'Пять точек - это одна черта!', 'why.bars': 'Больше трёх черт в ярусе не бывает.', 'why.bad': '',
  },
  en: {
    body: 'How many tortillas?', mind: 'How many days to the festival?', people: 'How many gifts for the priest?',
    dot: 'dot', bar: 'bar', shell: 'shell', take: 'take',
    'why.empty': 'No more of these pieces - take back an extra one.', 'why.none': 'There is no such piece here.',
    'why.shell': 'A shell goes only into an empty level.', 'why.onshell': 'There is a shell here - take it out first.',
    'why.dots': 'Five dots make one bar!', 'why.bars': 'A level never has more than three bars.', 'why.bad': '',
  },
  tr: {
    body: 'Kaç tortilla?', mind: 'Bayrama kaç gün var?', people: 'Rahibe kaç armağan?',
    dot: 'nokta', bar: 'çizgi', shell: 'kabuk', take: 'al',
    'why.empty': 'Bu taştan kalmadı - fazla olanı geri al.', 'why.none': 'Burada böyle bir taş yok.',
    'why.shell': 'Kabuk yalnızca boş kata konur.', 'why.onshell': 'Burada kabuk var - önce onu al.',
    'why.dots': 'Beş nokta bir çizgi eder!', 'why.bars': 'Bir katta üçten fazla çizgi olmaz.', 'why.bad': '',
  },
}

const W = 360
const TOP = 34
const TAB = 42
const TH = 92
const GAP = 8
const INK = '#3a2414'

/** Фишки: боб, палочка, ракушка. */
function ChipShape({ k, x, y, w = 80 }: { k: Chip; x: number; y: number; w?: number }) {
  if (k === 'dot')
    return (
      <g>
        <ellipse cx={x} cy={y} rx="9" ry="7.5" fill={INK} />
        <ellipse cx={x - 3} cy={y - 2.5} rx="3" ry="1.8" fill="#8a6a4a" />
      </g>
    )
  if (k === 'bar')
    return (
      <g>
        <rect x={x - w / 2} y={y - 6} width={w} height="12" rx="6" fill="#7a4a22" stroke={INK} stroke-width="2" />
        <line x1={x - w / 2 + 8} y1={y - 1.5} x2={x + w / 2 - 8} y2={y - 1.5} stroke="#b07a42" stroke-width="2" stroke-linecap="round" />
      </g>
    )
  return (
    <g>
      <path d={`M${x - 20} ${y + 6} Q${x - 18} ${y - 13} ${x} ${y - 13} Q${x + 18} ${y - 13} ${x + 20} ${y + 6} Q${x} ${y + 13} ${x - 20} ${y + 6} Z`} fill="#fbf3e0" stroke="#8a6a4a" stroke-width="2" />
      {[-10, -3.5, 3.5, 10].map((dx) => (
        <line x1={x + dx * 0.6} y1={y - 10} x2={x + dx} y2={y + 7} stroke="#c9a77a" stroke-width="1.6" />
      ))}
    </g>
  )
}

/** Значок задания на табличке: лепёшка, солнце (дни), нефритовая бусина (дар). */
function TaskIcon({ task, x, y }: { task: Task; x: number; y: number }) {
  if (task === 'body')
    return (
      <g>
        <circle cx={x} cy={y} r="8" fill="#e9c46a" stroke="#a8742c" stroke-width="1.5" />
        <circle cx={x - 3} cy={y - 2} r="1.3" fill="#a8742c" />
        <circle cx={x + 2.5} cy={y + 2.5} r="1.3" fill="#a8742c" />
      </g>
    )
  if (task === 'mind')
    return (
      <g stroke="#c9772f" stroke-width="2" stroke-linecap="round">
        <circle cx={x} cy={y} r="5" fill="#f0b23a" />
        {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => {
          const r = (a * Math.PI) / 180
          return <line x1={x + Math.cos(r) * 7.5} y1={y + Math.sin(r) * 7.5} x2={x + Math.cos(r) * 10} y2={y + Math.sin(r) * 10} />
        })}
      </g>
    )
  return (
    <g>
      <circle cx={x} cy={y} r="8" fill="#3f9a6a" stroke="#1f5a3a" stroke-width="1.5" />
      <circle cx={x - 2.5} cy={y - 2.5} r="2.2" fill="#a8e0c0" />
    </g>
  )
}

/** Фишки яруса: точки рядом сверху, черты под ними; ракушка - одна посередине. */
function tierChips(p: Pile, cx: number, top: number, bw: number, hintK: Chip | null): JSX.Element[] {
  const out: JSX.Element[] = []
  let hinted = false
  const mark = (k: Chip) => {
    if (hintK !== k || hinted) return ''
    hinted = true
    return ' kb-hint'
  }
  const cy = top + TH / 2
  if (p.shell)
    for (let j = 0; j < p.shell; j++)
      out.push(
        <g class={`kb-tap${mark('shell')}`} data-k="shell">
          <ChipShape k="shell" x={cx} y={cy + j * 6} />
        </g>,
      )
  const hd = p.dot ? 18 : 0
  const hb = p.bar ? p.bar * 18 - 6 : 0
  const h = hd + hb + (p.dot && p.bar ? 6 : 0)
  let y = cy - h / 2
  if (p.dot) {
    for (let j = 0; j < p.dot; j++) {
      const x = cx + (j - (p.dot - 1) / 2) * 24
      out.push(
        <g class={`kb-tap${mark('dot')}`} data-k="dot">
          <rect x={x - 12} y={y - 3} width="24" height="24" fill="transparent" />
          <ChipShape k="dot" x={x} y={y + 9} />
        </g>,
      )
    }
    y += hd + 6
  }
  for (let j = 0; j < p.bar; j++)
    out.push(
      <g class={`kb-tap${mark('bar')}`} data-k="bar">
        <rect x={cx - bw / 2 + 6} y={y + j * 18 - 3} width={bw - 12} height="18" fill="transparent" />
        <ChipShape k="bar" x={cx} y={y + j * 18 + 6} w={bw - 34} />
      </g>,
    )
  return out
}

export function MayaBoard({ state: s, level, onMove, hinted, done, lang, task }: BoardProps<MayaState, MayaMove>) {
  const t = L[lang] ?? L.en
  const [tool, setTool] = useState<Tool>('dot')
  const [why, setWhy] = useState<MayaWhy | null>(null)
  useEffect(() => {
    if (hinted) setTool(hinted.add ? hinted.k : 'take')
  }, [hinted])
  const B = s.nums.length
  const colW = W / B
  const bw = Math.min(colW - 14, 132)
  const H = TOP + TAB + 10 + s.tiers * (TH + GAP) + 4
  const kinds = CHIPS.filter((k) => level.start.supply[k] > 0)

  const send = (m: MayaMove) => {
    const w = mayaWhy(s, m)
    setWhy(w)
    if (!w) onMove(m)
  }
  const tapTier = (b: number, tier: number, e: MouseEvent) => {
    if (done) return
    // Подсказанный ярус: тап делает подсказанный ход, что бы ни было выбрано.
    if (hinted && hinted.b === b && hinted.t === tier) return send(hinted)
    if (tool !== 'take') return send({ b, t: tier, k: tool, add: true })
    const el = (e.target as Element | null)?.closest?.('[data-k]')
    const p = s.bins[b][tier]
    const k = (el?.getAttribute('data-k') as Chip | null) ?? (p.shell ? 'shell' : p.dot ? 'dot' : 'bar')
    send({ b, t: tier, k, add: false })
  }

  return (
    <div>
      <svg class="kb-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="maya numbers">
        <text x={W / 2} y="18" text-anchor="middle" font-size="15" font-weight="700" fill="#ecd06f">
          {t[task]}
        </text>
        {s.nums.map((n, b) => {
          const cx = colW * b + colW / 2
          const ok = basketOk(s, b)
          const y0 = TOP + TAB + 10
          return (
            <g>
              {/* Табличка с числом. */}
              <rect x={cx - bw / 2 + 8} y={TOP} width={bw - 16} height={TAB} rx="6" fill="#e8d9b0" stroke={ok ? '#6fbf5a' : '#9a8460'} stroke-width={ok ? 4 : 2} />
              <TaskIcon task={task} x={cx - bw / 2 + 26} y={TOP + TAB / 2} />
              <text x={cx + 10} y={TOP + TAB / 2 + 9} text-anchor="middle" font-size="26" font-weight="800" fill={INK}>
                {n}
              </text>
              {ok && (
                <g>
                  <circle cx={cx + bw / 2 - 10} cy={TOP + 2} r="11" fill="#3f8a3a" stroke="#e8d9b0" stroke-width="2" />
                  <path d={`M${cx + bw / 2 - 15} ${TOP + 2} l4 4 l7 -8`} stroke="#fff" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round" />
                </g>
              )}
              {/* Корзина: ярусы сверху вниз (верхний - двадцатки). */}
              {Array.from({ length: s.tiers }, (_, i) => {
                const tier = s.tiers - 1 - i
                const top = y0 + i * (TH + GAP)
                const p = s.bins[b][tier]
                const h = !!hinted && hinted.b === b && hinted.t === tier
                const hintK = h && !hinted!.add ? hinted!.k : null
                return (
                  <g class={`kb-tap${h && hinted!.add ? ' kb-hint' : ''}`} onClick={(e) => tapTier(b, tier, e as unknown as MouseEvent)}>
                    <rect x={cx - bw / 2} y={top} width={bw} height={TH} rx="10" fill={ok ? '#eedcae' : '#e3c88f'} stroke="#8a5a2b" stroke-width="2.5" />
                    {[0.25, 0.5, 0.75].map((f) => (
                      <line x1={cx - bw / 2 + 6} y1={top + TH * f} x2={cx + bw / 2 - 6} y2={top + TH * f} stroke="#c9a467" stroke-width="1.5" stroke-dasharray="7 5" />
                    ))}
                    {s.tiers > 1 && (
                      <text x={cx - bw / 2 + 7} y={top + 15} font-size="12" font-weight="700" fill="#8a5a2b">
                        {tier === 1 ? '×20' : '×1'}
                      </text>
                    )}
                    {tierChips(p, cx, top, bw, hintK)}
                  </g>
                )
              })}
            </g>
          )
        })}
      </svg>
      {!done && (
        <div class="kb-palette">
          {[...kinds, 'take' as const].map((k) => (
            <button class={`kb-swatch${tool === k ? ' on' : ''}`} style={{ width: '72px', height: '62px', background: '#e8d9b0', padding: '0' }} aria-label={t[k]} onClick={() => setTool(k)}>
              <svg viewBox="0 0 72 62" width="72" height="62" style={{ display: 'block' }}>
                {k === 'take' ? (
                  <g stroke={INK} stroke-width="3.5" fill="none" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M26 15 H44 a8 8 0 0 1 0 16 H34" />
                    <path d="M32 8 l-7 7 l7 7" />
                  </g>
                ) : (
                  <ChipShape k={k} x={36} y={18} w={46} />
                )}
                <text x="36" y={k === 'take' ? 50 : 41} text-anchor="middle" font-size="12" font-weight="700" fill={INK}>
                  {t[k]}
                </text>
                {k !== 'take' && (
                  <text x="36" y="56" text-anchor="middle" font-size="13" font-weight="800" fill={s.supply[k] ? '#8a3a1e' : '#9a8460'}>
                    ×{s.supply[k]}
                  </text>
                )}
              </svg>
            </button>
          ))}
        </div>
      )}
      <p style={{ minHeight: '20px', margin: '4px 6px 0', textAlign: 'center', fontSize: '14px', fontWeight: 700, color: '#ecd06f' }}>{why && !done ? t[`why.${why}`] : ''}</p>
    </div>
  )
}

export const mayaPuzzle: KidsPuzzle<MayaState, MayaMove> = {
  id: 'maya',
  era: 'MAY',
  region: 'tikal',
  place: 'school',
  logic: maya,
  Board: MayaBoard,
  text: {
    ru: {
      title: 'Числа майя',
      story: 'В школе писцов учат счёт: точка - один, черта - пять, ракушка - ноль. Помоги учителю подписать корзины.',
      rule: 'Выбери фишку и нажми на корзину, чтобы положить; «снять» - и нажми на фишку. Верхний ярус считает по двадцать.',
      tasks: ['Сколько лепёшек', 'Сколько дней до праздника', 'Сколько даров жрецу'],
    },
    en: {
      title: 'Maya numbers',
      story: 'At the scribe school they teach counting: a dot is one, a bar is five, a shell is zero. Help the teacher label the baskets.',
      rule: 'Pick a piece and tap a basket to put it in; pick "take" and tap a piece to remove it. The upper level counts in twenties.',
      tasks: ['How many tortillas', 'Days until the festival', 'Gifts for the priest'],
    },
    tr: {
      title: 'Maya sayıları',
      story: 'Kâtip okulunda sayı saymayı öğretiyorlar: nokta bir, çizgi beş, deniz kabuğu sıfır. Öğretmenin sepetleri işaretlemesine yardım et.',
      rule: 'Bir taş seç ve koymak için sepete dokun; çıkarmak için "al" seç ve taşa dokun. Üst kat yirmişer sayar.',
      tasks: ['Kaç tortilla', 'Bayrama kaç gün', 'Rahibe kaç armağan'],
    },
  },
}
