import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import { ERA_IDS, ERA_META } from '../content'
import type { Birth } from '../engine/life'
import { formatYear } from '../i18n'
import { Scene } from '../pixel/Scene'
import { useUi } from './text'

/** Лотерея рождения: три барабана — где и когда, положение, пол. Игрок дёргает рычаг, барабаны останавливаются по очереди. */

interface Item {
  top: string
  bottom?: string
  icon?: string
}

const CLASS_ICON: Record<string, string> = { slave: '⛓', peasant: '🌾', craftsman: '🔨', trader: '⚖️', landowner: '🏡', noble: '👑' }
const ROW = 60
const WINDOW = 150
const DECOYS = 26

/** Простой детерминированный генератор для подставных картинок барабана. */
function rand(seed: number) {
  let h = seed >>> 0
  return () => {
    h = (h + 0x6d2b79f5) | 0
    let x = Math.imul(h ^ (h >>> 15), h | 1)
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61)
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296
  }
}

function reducedMotion(): boolean {
  return typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches
}

function Reel(props: { label: string; items: Item[]; spinning: boolean; duration: number; onStop: () => void; stopped: boolean }) {
  const final = props.items.length - 2
  const offset = (WINDOW - ROW) / 2
  const [blur, setBlur] = useState(false)
  const done = useRef(false)
  useEffect(() => {
    if (!props.spinning) return
    setBlur(true)
    const a = setTimeout(() => setBlur(false), props.duration * 0.72)
    // Запасной таймер: если transitionend не придёт (вкладка в фоне), барабан всё равно остановится.
    const b = setTimeout(stop, props.duration + 150)
    return () => {
      clearTimeout(a)
      clearTimeout(b)
    }
  }, [props.spinning])
  function stop() {
    if (done.current) return
    done.current = true
    props.onStop()
  }
  const y = props.spinning ? offset - final * ROW : offset
  return (
    <div class={`reel ${props.stopped ? 'stopped' : ''}`}>
      <div class="reel-label">{props.label}</div>
      <div class="reel-window" style={{ height: `${WINDOW}px` }}>
        <div
          class={`reel-strip ${blur ? 'blur' : ''}`}
          style={{ transform: `translateY(${y}px)`, transitionDuration: props.spinning ? `${props.duration}ms` : '0ms' }}
          onTransitionEnd={stop}
        >
          {props.items.map((it, i) => (
            <div class={`reel-item ${i === final && props.stopped ? 'win' : ''}`} style={{ height: `${ROW}px` }}>
              {it.icon && <span class="reel-icon" aria-hidden="true">{it.icon}</span>}
              <span class="reel-text">
                <span class="reel-top">{it.top}</span>
                {it.bottom && <span class="reel-bottom">{it.bottom}</span>}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export function Slots(props: { birth: Birth; seed: number; ready: boolean; onDone: () => void; onBack: () => void }) {
  const { t, lang } = useUi()
  const { birth } = props
  const [phase, setPhase] = useState<'idle' | 'pull' | 'spin' | 'done'>('idle')
  const [stopped, setStopped] = useState([false, false, false])
  const fast = useMemo(reducedMotion, [])
  const o = { sex: birth.sex, region: birth.region }

  const reels = useMemo(() => {
    const r = rand(props.seed)
    const q: Item = { top: '?', icon: '✦' }
    const pick = <T,>(xs: readonly T[]) => xs[Math.floor(r() * xs.length)]
    const where: Item[] = [q]
    const status: Item[] = [q]
    const sex: Item[] = [q]
    for (let i = 0; i < DECOYS; i++) {
      const id = ERA_IDS[(i + Math.floor(r() * 3)) % ERA_IDS.length]
      const meta = ERA_META[id]
      const year = Math.round(meta.years[0] + r() * (meta.years[1] - meta.years[0] - 40)) || 1
      where.push({ top: t(`era.${id}.short`), bottom: formatYear(year, lang) })
      const cls = pick(Object.keys(CLASS_ICON))
      status.push({ top: t(`class.${cls}.short`), icon: CLASS_ICON[cls] })
      const s = i % 2 === 0 ? 'm' : 'f'
      sex.push({ top: t(`spin.sex.${s}`), icon: s === 'm' ? '♂' : '♀' })
    }
    where.push({ top: t(`era.${birth.era}.short`), bottom: formatYear(birth.year, lang) }, { top: '…' })
    status.push({ top: t(`class.${birth.cls}.short`, {}, o), icon: CLASS_ICON[birth.cls] ?? '•' }, { top: '…' })
    sex.push({ top: t(`spin.sex.${birth.sex}`), icon: birth.sex === 'm' ? '♂' : '♀' }, { top: '…' })
    return [where, status, sex]
  }, [props.seed, props.ready, lang])

  const durations = fast ? [300, 400, 500] : [2300, 3200, 4100]

  const pull = () => {
    if (phase !== 'idle') return
    setPhase('pull')
    setTimeout(() => setPhase('spin'), fast ? 50 : 450)
  }
  const onStop = (i: number) =>
    setStopped((s) => {
      const next = s.map((v, j) => v || j === i)
      if (next.every(Boolean)) setTimeout(() => setPhase('done'), fast ? 0 : 350)
      return next
    })

  const labels = [t('spin.where'), t('spin.status'), t('spin.sex')]
  return (
    <div class="screen spin">
      <button class="link back" onClick={props.onBack}>← {t('common.back')}</button>
      <h1>{t('spin.title')}</h1>
      <p class="lead">{t('spin.lead')}</p>

      <div class={`slot-machine ${phase}`}>
        <div class="slot-lights" aria-hidden="true">
          {Array.from({ length: 11 }, (_, i) => (
            <span style={{ animationDelay: `${i * 0.09}s` }} />
          ))}
        </div>
        <div class="slot-body">
          <div class="reels">
            {reels.map((items, i) => (
              <Reel label={labels[i]} items={items} spinning={phase === 'spin' || phase === 'done'} duration={durations[i]} stopped={stopped[i]} onStop={() => onStop(i)} />
            ))}
          </div>
          <button class={`lever ${phase === 'pull' ? 'pulled' : ''}`} onClick={pull} disabled={phase !== 'idle' || !props.ready} aria-label={t('spin.pull')}>
            <span class="lever-knob" />
            <span class="lever-rod" />
            <span class="lever-base" />
          </button>
        </div>
      </div>

      {phase === 'idle' && (
        <button class="primary" onClick={pull} disabled={!props.ready}>
          {props.ready ? t('spin.pull') : t('spin.loading')}
        </button>
      )}
      {phase === 'done' && (
        <div class="spin-result">
          <Scene scene={{ place: 'landmark', time: 'dawn', people: 2, props: ['sun'] }} region={birth.region} seed={`spin:${props.seed}`} label={t(`region.${birth.region}`)} />
          <p class="lead center">
            {t('spin.result', { cls: { key: `class.${birth.cls}.family` }, region: { key: `region.${birth.region}` }, era: { key: `era.${birth.era}` }, year: formatYear(birth.year, lang) }, o)}
          </p>
          <button class="primary" onClick={props.onDone}>{t('spin.go')}</button>
        </div>
      )}
      {phase !== 'idle' && phase !== 'done' && <p class="muted center small">{t('spin.wait')}</p>}
    </div>
  )
}
