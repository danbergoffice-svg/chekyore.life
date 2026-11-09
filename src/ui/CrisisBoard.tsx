// Перелом сорокалетия: доска Плинко внутри окна события (как стол костей). Синий корпус, золотая рамка, латунные
// колышки. Исход выбирает движок (engine/crisis.ts) до броска - доска только показывает, куда скатится шар, со стуком
// о колышки и звуком лунки. После первого шара - «Принять», «Ещё раз…» (азарт), «Опереться на близких / на хозяйство».
import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import { BOARD, crisisDrop, crisisFinal, crisisOptions, crisisSecond, passionPoly, SLOT_CAT, STANCES } from '../engine/crisis'
import type { CrisisAction, CrisisChange, CrisisRecord, SlotCat, StanceId } from '../engine/crisis'
import { styleOf } from '../engine/pets'
import type { EraDef, GameState } from '../engine/types'
import { formatMoney, nameOf } from '../i18n'
import { platform } from '../platform'
import { playLand, playPeg } from '../audio'
import { useUi } from './text'

const ROWS = 8
const FALL_MS = 2400
const COLORS: Record<SlotCat, string> = { clean: '#4f7d3a', mixed: '#c99a3a', neg: '#b4452c' }
const SECOND: Record<CrisisAction, { ids: string[]; cats: SlotCat[] }> = {
  gamble: { ids: ['double', 'half', 'bust'], cats: ['clean', 'mixed', 'neg'] },
  family: { ids: ['strong', 'partial', 'conflict', 'rupture'], cats: ['clean', 'mixed', 'neg', 'neg'] },
  home: { ids: ['strong', 'partial', 'fail'], cats: ['clean', 'mixed', 'neg'] },
}
const TAG_KEY: Record<string, string> = {
  crisis_freed: 'freed', late_romance: 'romance', reckless_forties: 'reckless', family_quarrel: 'quarrel', family_rupture: 'rupture', home_mortgaged: 'mortgaged', home_drained: 'drained',
}
const reducedMotion = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches

interface Labels {
  slots: { label: string; cat: SlotCat; own?: boolean }[]
  target: number
  path: number[]
}

/** Путь к лунке k из n для второго шара (только картинка, на игру не влияет). */
function visualPath(k: number, n: number): number[] {
  const rights = Math.round((k / Math.max(1, n - 1)) * ROWS)
  const steps: number[] = Array.from({ length: ROWS }, (_, i) => (i < rights ? 1 : 0))
  for (let i = steps.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[steps[i], steps[j]] = [steps[j], steps[i]]
  }
  return steps
}

/** Доска: рисует колышки, лунки и шар по доле полёта t (0…1), landed - шар в лунке. */
function Board({ labels, t, landed }: { labels: Labels; t: number; landed: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const cv = ref.current
    if (!cv) return
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    const W = cv.clientWidth
    const H = cv.clientHeight
    if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) {
      cv.width = Math.round(W * dpr)
      cv.height = Math.round(H * dpr)
    }
    const x = cv.getContext('2d')!
    x.setTransform(dpr, 0, 0, dpr, 0, 0)
    x.clearRect(0, 0, W, H)
    const n = labels.slots.length
    const slotH = 64
    const top = 22
    const bottom = H - slotH - 12
    const gap = (W - 24) / 9
    const slotW = (W - 24) / n
    const rowH = (bottom - top) / (ROWS + 0.5)
    // Корпус: золотая рамка, синее поле.
    x.fillStyle = '#d8b860'
    rr(x, 0, 0, W, H, 16)
    x.fill()
    x.fillStyle = '#1f2c4a'
    rr(x, 7, 7, W - 14, H - 14, 11)
    x.fill()
    // Колышки шахматкой во всю ширину.
    for (let r = 0; r < ROWS; r++)
      for (let k = -6; k <= 6; k++) {
        const px = W / 2 + (k - (r % 2) / 2) * gap
        if (px < 16 || px > W - 16) continue
        const py = top + (r + 0.5) * rowH
        x.fillStyle = '#d8b860'
        x.beginPath()
        x.arc(px, py, 4, 0, Math.PI * 2)
        x.fill()
        x.fillStyle = '#fff1c2'
        x.fillRect(px - 1.5, py - 2.5, 2, 2)
      }
    // Лунки.
    labels.slots.forEach((s, k) => {
      const cx = 12 + slotW * (k + 0.5)
      const w = slotW - 3
      const hit = landed && k === labels.target
      x.fillStyle = hit ? '#fff7e2' : '#e9dcc0'
      rr(x, cx - w / 2, bottom, w, slotH, 6)
      x.fill()
      x.strokeStyle = hit ? '#ffcf4d' : '#d8b860'
      x.lineWidth = hit ? 3 : 1.5
      x.stroke()
      x.fillStyle = COLORS[s.cat]
      x.beginPath()
      x.arc(cx, bottom + 10, 4, 0, Math.PI * 2)
      x.fill()
      if (s.own) {
        x.fillStyle = '#ef7a5c'
        x.beginPath()
        x.moveTo(cx - 4, bottom - 7)
        x.lineTo(cx + 4, bottom - 7)
        x.lineTo(cx, bottom - 1)
        x.fill()
      }
      x.save()
      x.translate(cx, bottom + slotH / 2 + 7)
      if (n > 5) x.rotate(-Math.PI / 2)
      x.font = `${hit ? 700 : 600} ${n > 5 ? 12 : 13}px 'Alegreya Variable', Georgia, serif`
      x.textAlign = 'center'
      x.textBaseline = 'middle'
      x.fillStyle = '#2b2119'
      x.fillText(s.label, 0, 0, n > 5 ? slotH - 22 : w - 6)
      x.restore()
    })
    // Шар: от верха через ряды колышков к лунке, с подскоками.
    const pos = (row: number, col: number) => {
      if (row < ROWS) return { x: W / 2 + (col - row / 2) * gap, y: top + (row + 0.5) * rowH - rowH * 0.45 }
      const k = n === 9 ? col : labels.target
      return { x: 12 + slotW * (k + 0.5), y: bottom - 12 }
    }
    const at = (tt: number) => {
      const seg = tt * (ROWS + 1)
      const i = Math.min(ROWS, Math.floor(seg))
      const k = seg - i
      let col = 0
      // До броска пути ещё нет: шар ждёт наверху, над серединой.
      for (let r = 0; r < i; r++) col += labels.path[r] ?? 0
      const a = pos(i, col)
      const b = i < ROWS ? pos(i + 1, col + (labels.path[i] ?? 0)) : a
      return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k - Math.sin(k * Math.PI) * rowH * 0.35 }
    }
    const b = at(landed ? 1 : t)
    if (!landed && t > 0.04) {
      for (let i = 1; i <= 4; i++) {
        const p = at(Math.max(0, t - i * 0.02))
        x.globalAlpha = 0.16 / i
        x.fillStyle = '#ffe38a'
        x.beginPath()
        x.arc(p.x, p.y, 6, 0, Math.PI * 2)
        x.fill()
      }
      x.globalAlpha = 1
    }
    const gl = x.createRadialGradient(b.x, b.y, 1, b.x, b.y, 16)
    gl.addColorStop(0, 'rgba(255,230,140,.9)')
    gl.addColorStop(1, 'rgba(255,230,140,0)')
    x.fillStyle = gl
    x.fillRect(b.x - 16, b.y - 16, 32, 32)
    x.fillStyle = '#fff1c2'
    x.beginPath()
    x.arc(b.x, b.y, 6.5, 0, Math.PI * 2)
    x.fill()
  })
  return <canvas ref={ref} class="crisis-canvas" aria-hidden="true" />
}
function rr(x: CanvasRenderingContext2D, a: number, b: number, w: number, h: number, r: number) {
  x.beginPath()
  x.moveTo(a + r, b)
  x.arcTo(a + w, b, a + w, b + h, r)
  x.arcTo(a + w, b + h, a, b + h, r)
  x.arcTo(a, b + h, a, b, r)
  x.arcTo(a, b, a + w, b, r)
  x.closePath()
}

/** Шар катится FALL_MS: доля полёта, стук о каждый ряд, звук лунки; done - когда упал. */
function useFall(key: string | null, cat: SlotCat | null, onLanded: () => void): number {
  const [t, setT] = useState(0)
  useEffect(() => {
    if (!key) return
    const ms = reducedMotion() ? 300 : FALL_MS
    const t0 = performance.now()
    let row = -1
    let id = 0
    const tick = (now: number) => {
      const k = Math.min(1, (now - t0) / ms)
      const r = Math.floor(k * (ROWS + 1))
      if (r > row && r <= ROWS && r >= 1) {
        row = r
        if (r < ROWS + 1 && r <= ROWS - 0 && !reducedMotion()) playPeg(r - 1)
      }
      setT(k)
      if (k < 1) id = requestAnimationFrame(tick)
      else {
        if (cat) playLand(cat)
        onLanded()
      }
    }
    id = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(id)
  }, [key])
  return t
}

export function CrisisBoard(props: { state: GameState; era: EraDef; stance: StanceId; coin: string; onSave: () => void; onDone: () => void }) {
  const { t, lang } = useUi()
  const { state, era, coin } = props
  const hero = state.hero
  const o = { sex: hero.sex, region: hero.region, religion: hero.religion }
  const [rec, setRec] = useState<CrisisRecord | null>(() => state.queue[0]?.crisis ?? null)
  const stance = rec?.stance ?? props.stance
  // Шаг: ready - до броска; fall1/fall2 - шар катится; first - исход первого; pick - выбор близкого; final - итог.
  const [step, setStep] = useState<'ready' | 'fall1' | 'first' | 'pick' | 'fall2' | 'final'>(() => (rec?.second ? 'final' : rec ? 'first' : 'ready'))
  const started = useRef(Date.now())
  const stakes = STANCES[stance].stakes
  const statName = (p: string) => (p === 'faith' ? t('crisis.faith') : t(`attr.${p}`))

  const firstLabels: Labels = useMemo(
    () => ({
      slots: BOARD.map((id) => ({ label: t(`crisis.short.${id}`), cat: SLOT_CAT[id], own: STANCES[stance].own.includes(id) })),
      target: rec ? BOARD.indexOf(rec.slot) : 4,
      path: rec?.path ?? [],
    }),
    [rec?.slot, stance],
  )
  const secondLabels: Labels | null = useMemo(() => {
    const s = rec?.second
    if (!s) return null
    const def = SECOND[s.kind]
    const k = def.ids.indexOf(s.outcome)
    return { slots: def.ids.map((id, i) => ({ label: t(`crisis.s2.${s.kind}.${id}`), cat: def.cats[i] })), target: k, path: visualPath(k, def.ids.length) }
  }, [rec?.second?.outcome, rec?.second?.kind])

  const t1 = useFall(step === 'fall1' && rec ? `1:${rec.slot}` : null, rec ? SLOT_CAT[rec.slot] : null, () => setStep('first'))
  const t2 = useFall(step === 'fall2' && rec?.second ? `2:${rec.second.outcome}` : null, rec?.second && secondLabels ? secondLabels.slots[secondLabels.target].cat : null, () => setStep('final'))

  const drop = () => {
    const r = crisisDrop(state, era, stance)
    props.onSave()
    platform.track('crisis_drop', { ball: 1, stance, slot: r.slot, category: SLOT_CAT[r.slot] })
    setRec({ ...r })
    setStep('fall1')
  }
  const second = (action: CrisisAction, npcId?: string) => {
    if (!rec) return
    const n = npcId ? hero.npcs.find((x) => x.id === npcId) : undefined
    platform.track('crisis_action', { action, who_role: n?.role ?? '', attitude: n?.attitude ?? '' })
    // Второй шар пишется в запись окна (её применит движок при закрытии), а не в копию для экрана.
    const stored = state.queue[0]?.crisis ?? rec
    crisisSecond(state, stored, action, npcId)
    props.onSave()
    platform.track('crisis_drop', { ball: 2, stance, slot: stored.second!.kind, category: stored.second!.outcome })
    setRec({ ...stored })
    setStep('fall2')
  }
  const finish = () => {
    if (rec) {
      const s = rec.second
      platform.track('crisis_end', { stance, slot: rec.slot, second: s?.kind ?? 'accept', second_result: s?.outcome ?? '', balls: s ? 2 : 1, sec_in_crisis: Math.round((Date.now() - started.current) / 1000) })
      if (!s) platform.track('crisis_action', { action: 'accept' })
    }
    props.onDone()
  }

  const opts = rec && step === 'first' ? crisisOptions(state, rec) : null
  const changes = rec ? crisisFinal(rec) : []
  const chip = (c: CrisisChange) => {
    if (c.tag) return TAG_KEY[c.tag] ? <li class={c.tag === 'crisis_freed' ? 'up' : 'down'}>{t(`crisis.tag.${TAG_KEY[c.tag]}`)}</li> : null
    if (c.npcId) {
      const n = hero.npcs.find((x) => x.id === c.npcId)
      return n && c.delta ? <li class={c.delta > 0 ? 'up' : 'down'}>{t('crisis.attitude', { name: { name: n.name } })} {c.delta > 0 ? '+' : '−'}{Math.abs(c.delta)}</li> : null
    }
    if (!c.param || !c.delta) return null
    if (c.param === 'money') return <li class={c.delta > 0 ? 'up' : 'down'}>{t('attr.money')} {c.delta > 0 ? '+' : '−'}{formatMoney(t, Math.abs(c.delta), coin)}</li>
    if (!(stakes as string[]).includes(c.param) && !['health', 'intellect', 'strength', 'charisma', 'diligence', 'risk_tolerance', 'faith'].includes(c.param)) return null
    return <li class={c.delta > 0 ? 'up' : 'down'}>{statName(c.param)} {c.delta > 0 ? '+' : '−'}{Math.abs(c.delta)}</li>
  }
  const slotText = (id: string) => {
    if (id === 'new_passion' && hero.sex === 'm' && passionPoly(styleOf(state))) return t('crisis.text.new_passion.poly', {}, o)
    if (id === 'windfall' && stance === 'seek_freedom') return t('crisis.text.windfall.freedom', {}, o)
    return t(`crisis.text.${id}`, {}, o)
  }
  const s = rec?.second
  const sNpc = s?.npcId ? hero.npcs.find((x) => x.id === s.npcId) : undefined
  const falling = step === 'fall1' || step === 'fall2'
  const showSecondBoard = (step === 'fall2' || step === 'final') && secondLabels

  return (
    <div class="crisis">
      <div class="crisis-stakes">
        <span class="chip-static">{t('crisis.stake')}: {statName(stakes[0])} {Math.round(hero.attrs[stakes[0] as 'health'] ?? hero.hidden[stakes[0] as 'faith'] ?? 0)}</span>
        <span class="chip-static">{statName(stakes[1])} {Math.round(hero.attrs[stakes[1] as 'health'] ?? hero.hidden[stakes[1] as 'faith'] ?? 0)}</span>
      </div>
      <p class="small muted crisis-hint">{t(`crisis.hint.${stance}`, {}, o)}</p>
      <div class={`crisis-board ${showSecondBoard ? 'second' : ''}`}>
        {showSecondBoard ? (
          <Board labels={secondLabels!} t={step === 'final' ? 1 : t2} landed={step === 'final'} />
        ) : (
          <Board labels={firstLabels} t={step === 'ready' ? 0 : step === 'fall1' ? t1 : 1} landed={step !== 'ready' && step !== 'fall1'} />
        )}
      </div>

      {step === 'ready' && (
        <div class="crisis-actions">
          <button type="button" class="primary" onClick={drop} autoFocus>{t('crisis.drop')}</button>
          <p class="small muted center">{t('crisis.own')} · {t('crisis.no_undo')}</p>
        </div>
      )}
      {falling && (
        <div class="crisis-actions">
          <button type="button" class="primary" disabled>{t('crisis.rolling')}</button>
        </div>
      )}
      {rec && (step === 'first' || step === 'pick' || step === 'final') && (
        <div class="crisis-result" aria-live="polite">
          <h3>{t(`crisis.slot.${rec.slot}`, {}, o)}</h3>
          <p>{slotText(rec.slot)}</p>
          {s && step === 'final' && (
            <p class={`result ${['strong', 'partial', 'double'].includes(s.outcome) ? 'success' : s.outcome === 'half' ? '' : 'failure'}`}>
              {t(`crisis.result.${s.kind}.${s.outcome}`, sNpc ? { name: { name: sNpc.name }, sex: sNpc.sex } : {}, o)}
            </p>
          )}
          <ul class="changes">{changes.map(chip)}</ul>
        </div>
      )}
      {step === 'first' && opts && (
        <div class="crisis-actions">
          <button type="button" class="primary" onClick={finish} autoFocus>{t('crisis.btn.accept')}</button>
          {opts.gamble && (
            <>
              <p class="small warn">{t('crisis.gamble.warn')}</p>
              <button type="button" class="secondary crisis-gamble" onClick={() => second('gamble')}>{t('crisis.btn.gamble')}</button>
            </>
          )}
          {opts.family.length > 0 && <button type="button" class="secondary" onClick={() => setStep('pick')}>{t('crisis.btn.family')}</button>}
          {opts.home && (
            <button type="button" class="secondary" onClick={() => second('home')}>
              {t('crisis.btn.home')}
              <span class="choice-desc">{t('crisis.home.cost')}</span>
            </button>
          )}
        </div>
      )}
      {step === 'pick' && opts === null && rec && (
        <div class="crisis-actions">
          <p class="small">{t('crisis.family.pick')}</p>
          {crisisOptions(state, rec).family.map((n) => (
            <button type="button" class="secondary" onClick={() => second('family', n.id)}>
              {nameOf(n.name, lang)} · {t(`npc.${n.role}`, { sex: n.sex })}
              <span class="choice-desc">{t(n.attitude >= 60 ? 'crisis.family.cost.low' : n.attitude >= 30 ? 'crisis.family.cost.mid' : 'crisis.family.cost.high')}</span>
            </button>
          ))}
          <button type="button" class="link" onClick={() => setStep('first')}>{t('crisis.btn.back')}</button>
        </div>
      )}
      {step === 'final' && (
        <div class="crisis-actions">
          <button type="button" class="primary" onClick={finish} autoFocus>{t('crisis.btn.done')}</button>
        </div>
      )}
    </div>
  )
}
