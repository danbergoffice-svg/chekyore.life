import type { ComponentChildren } from 'preact'
import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import { ERA_IDS, ERA_META } from '../content'
import type { Birth } from '../engine/life'
import { formatYear } from '../i18n'
import { playLever, playReels } from '../audio'
import type { ReelTiming } from '../sfx'
import { Scene } from '../pixel/Scene'
import { useUi } from './text'
import { Icon } from './Icon'
import type { IconName } from './icons'

/** Лотерея рождения: три барабана - где и когда, положение, пол. Игрок дёргает рычаг, барабаны останавливаются по очереди. */

interface Item {
  top: string
  bottom?: string
  icon?: IconName
}

/** Ярлык награды на окне барабана: значок и подпись. */
export interface ReelTag {
  icon: IconName
  text: string
}

const CLASS_ICON: Record<string, IconName> = { slave: 'chain', peasant: 'wheat', craftsman: 'hammer', trader: 'scales', landowner: 'house', noble: 'crown' }
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

/** Ход барабана: кривая CSS-перехода ленты (в конце - лёгкий перелёт). По ней же считаются щелчки строк. */
const EASE = [0.15, 0.6, 0.22, 1.04] as const

/** Когда (секунды от начала вращения) через середину окна проезжает каждая строка и когда барабан встаёт. */
export function reelTiming(duration: number, rows: number): ReelTiming {
  const [x1, y1, x2, y2] = EASE
  const bez = (s: number, a: number, b: number) => 3 * (1 - s) * (1 - s) * s * a + 3 * (1 - s) * s * s * b + s * s * s
  const ticks: number[] = []
  let next = 1
  let land = -1
  for (let i = 1; i <= 800; i++) {
    const s = i / 800
    const t = (bez(s, x1, x2) * duration) / 1000
    const d = bez(s, y1, y2) * rows
    for (; next < rows && d >= next; next++) ticks.push(t)
    if (land < 0 && d >= rows - 0.03) land = t
  }
  return { ticks, land: land < 0 ? duration / 1000 : land }
}

function reducedMotion(): boolean {
  return typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches
}

function Reel(props: { label: string; items: Item[]; spinning: boolean; duration: number; onStop: () => void; stopped: boolean; tag?: ReelTag }) {
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
      {/* Награда, которая уже решила этот барабан: «[замок] Византия», «[корона] Знать» - над краем окна. */}
      <div class="reel-frame">
        {props.tag && (
          <span class="reel-tag">
            <Icon name={props.tag.icon} /> {props.tag.text}
          </span>
        )}
        <div class="reel-window" style={{ height: `${WINDOW}px` }}>
          {/* Соседние строки видны только у середины и плавно гаснут к краям окна, чтобы надписи не обрезались. */}
          <div class="reel-clip">
            <div
              class={`reel-strip ${blur ? 'blur' : ''}`}
              style={{ transform: `translateY(${y}px)`, transitionDuration: props.spinning ? `${props.duration}ms` : '0ms', transitionTimingFunction: `cubic-bezier(${EASE.join(', ')})` }}
              onTransitionEnd={stop}
            >
              {props.items.map((it, i) => (
                <div class={`reel-item ${i === final && props.stopped ? 'win' : ''}`} style={{ height: `${ROW}px` }}>
                  {it.icon && (
                    <span class="reel-icon">
                      <Icon name={it.icon} />
                    </span>
                  )}
                  <span class="reel-text">
                    <span class="reel-top">{it.top}</span>
                    {it.bottom && <span class="reel-bottom">{it.bottom}</span>}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/** Какой запрос «к барабану» уже выполнен: при возврате в меню страница сама к нему не едет. */
let focused = 0

/**
 * Барабан в главном меню: рычаг и кнопка «Крутить новую жизнь». Страна, которая выпадет, грузится с рывка рычага -
 * пока крутятся барабаны; если не успела, кнопка «Начать жизнь» ждёт загрузки.
 */
export function SlotMachine(props: {
  birth: Birth
  seed: number
  ready: boolean
  error?: boolean
  onRetry?: () => void
  onPull: () => void
  onDone: () => void
  onSetup?: () => void
  /** Растёт, когда к барабану нужно прокрутить страницу (новая жизнь с экрана итогов). */
  focus?: number
  /** Перекрутить после результата (рычаг остаётся активным); left - сколько раз ещё можно. */
  onRespin?: () => void
  left?: number
  /** Это перекрутка: барабан сам дёргает рычаг сразу после появления. */
  autoSpin?: boolean
  /** Бесплатные перекрутки кончились - ещё одна за рекламу (CrazyGames); adBusy - реклама грузится или идёт. */
  onAdRespin?: () => void
  adBusy?: boolean
  /** Справа над барабаном - кнопка «Дары» со значком подарка (если они есть). */
  gifts?: ComponentChildren
  /** Ярлыки наград на окнах барабана: страна и положение. */
  tags?: { where?: ReelTag; status?: ReelTag }
}) {
  const { t, lang } = useUi()
  const { birth } = props
  const [phase, setPhase] = useState<'idle' | 'pull' | 'spin' | 'done'>('idle')
  const [stopped, setStopped] = useState([false, false, false])
  const fast = useMemo(reducedMotion, [])
  const box = useRef<HTMLDivElement>(null)
  const result = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!props.focus || props.focus === focused) return
    focused = props.focus
    // После смены экрана страница сама прокручивается наверх - к барабану едем чуть позже.
    const id = setTimeout(() => box.current?.scrollIntoView({ block: 'center', behavior: fast ? 'auto' : 'smooth' }), 80)
    return () => clearTimeout(id)
  }, [props.focus])
  // Если мир грузится дольше 12 секунд после рывка - подсказать, что делать.
  const [slow, setSlow] = useState(false)
  useEffect(() => {
    if (props.ready || phase === 'idle') return
    const id = setTimeout(() => setSlow(true), 12000)
    return () => clearTimeout(id)
  }, [props.ready, phase === 'idle'])
  useEffect(() => {
    if (phase === 'done') result.current?.scrollIntoView({ block: 'nearest', behavior: fast ? 'auto' : 'smooth' })
  }, [phase])
  const o = { sex: birth.sex, region: birth.region }

  const reels = useMemo(() => {
    const r = rand(props.seed)
    const q: Item = { top: '?', icon: 'spark' }
    const pick = <T,>(xs: readonly T[]) => xs[Math.floor(r() * xs.length)]
    const where: Item[] = [q]
    const status: Item[] = [q]
    const sex: Item[] = [q]
    const lockWhere = !!props.tags?.where
    const lockStatus = !!props.tags?.status
    for (let i = 0; i < DECOYS; i++) {
      const id = lockWhere ? birth.era : ERA_IDS[(i + Math.floor(r() * 3)) % ERA_IDS.length]
      const meta = ERA_META[id]
      const year = Math.round(meta.years[0] + r() * (meta.years[1] - meta.years[0] - 20)) || 1
      where.push({ top: t(`era.${id}.short`), bottom: formatYear(year, lang) })
      const cls = lockStatus ? birth.cls : pick(Object.keys(CLASS_ICON))
      status.push({ top: t(`class.${lockStatus && birth.royal ? 'royal' : cls}.short`), icon: CLASS_ICON[cls] })
      const s = i % 2 === 0 ? 'm' : 'f'
      sex.push({ top: t(`spin.sex.${s}`), icon: s === 'm' ? 'male' : 'female' })
    }
    where.push({ top: t(`era.${birth.era}.short`), bottom: formatYear(birth.year, lang) }, { top: '…' })
    status.push({ top: t(`class.${birth.royal ? 'royal' : birth.cls}.short`, {}, o), icon: CLASS_ICON[birth.cls] }, { top: '…' })
    sex.push({ top: t(`spin.sex.${birth.sex}`), icon: birth.sex === 'm' ? 'male' : 'female' }, { top: '…' })
    return [where, status, sex]
  }, [props.seed, lang])

  const durations = fast ? [300, 400, 500] : [2300, 3200, 4100]

  const pull = () => {
    if (phase !== 'idle') return
    playLever()
    props.onPull()
    setPhase('pull')
    setTimeout(() => setPhase('spin'), fast ? 50 : 450)
  }
  useEffect(() => {
    if (props.autoSpin) pull()
  }, [])
  // Барабаны пошли - щелчки строк и стук остановки в такт ленте.
  useEffect(() => {
    if (phase === 'spin') playReels(durations.map((d, i) => reelTiming(d, reels[i].length - 2)))
  }, [phase])
  const canRespin = !!props.onRespin && (props.left ?? 0) > 0
  const left = props.left ?? 0
  const onStop = (i: number) =>
    setStopped((s) => {
      const next = s.map((v, j) => v || j === i)
      if (next.every(Boolean)) setTimeout(() => setPhase('done'), fast ? 0 : 350)
      return next
    })

  const labels = [t('spin.where'), t('spin.status'), t('spin.sex')]
  return (
    <section class="spin" ref={box}>
      <div class="spin-head">
        <span class="caps">{t('spin.head')}</span>
        {props.gifts}
      </div>

      <div class={`slot-machine ${phase}`}>
        <div class="slot-lights" aria-hidden="true">
          {Array.from({ length: 11 }, (_, i) => (
            <span style={{ animationDelay: `${i * 0.09}s` }} />
          ))}
        </div>
        <div class="slot-body">
          <div class="reels">
            {reels.map((items, i) => (
              <Reel
                label={labels[i]}
                items={items}
                spinning={phase === 'spin' || phase === 'done'}
                duration={durations[i]}
                stopped={stopped[i]}
                onStop={() => onStop(i)}
                tag={phase === 'idle' ? (i === 0 ? props.tags?.where : i === 1 ? props.tags?.status : undefined) : undefined}
              />
            ))}
          </div>
          <button
            class={`lever ${phase === 'pull' ? 'pulled' : ''}`}
            onClick={phase === 'done' ? props.onRespin : pull}
            disabled={phase === 'pull' || phase === 'spin' || (phase === 'done' && !canRespin)}
            aria-label={phase === 'done' ? t('spin.again.unlimited') : t('menu.spin')}
          >
            <span class="lever-knob" />
            <span class="lever-rod" />
            <span class="lever-base" />
          </button>
        </div>
      </div>

      {phase === 'idle' && (
        <button class="primary spin-button" onClick={pull}>
          {t('menu.spin')}
        </button>
      )}
      {phase !== 'idle' && phase !== 'done' && <p class="muted center small">{t('spin.wait')}</p>}
      {phase === 'done' && (
        <div class="spin-result" ref={result}>
          <Scene scene={{ place: 'landmark', time: 'dawn', people: 2, props: ['sun'] }} region={birth.region} seed={`spin:${props.seed}`} label={t(`region.${birth.region}`)} />
          <p class="lead center">
            {t('spin.result', { cls: { key: `class.${birth.royal ? 'royal' : birth.cls}.family` }, region: { key: `region.${birth.region}` }, era: { key: `era.${birth.era}` }, year: formatYear(birth.year, lang) }, o)}
          </p>
          {!props.error && (
            <button class="primary" onClick={props.onDone} disabled={!props.ready}>
              {props.ready ? t('spin.go') : t('spin.loading')}
            </button>
          )}
          {canRespin && (
            <button class="secondary" onClick={props.onRespin}>
              {Number.isFinite(left) ? t('spin.again', { n: left }) : t('spin.again.unlimited')}
            </button>
          )}
          {!canRespin && props.onAdRespin && (
            <button class="secondary ad-respin" onClick={props.onAdRespin} disabled={props.adBusy}>
              {props.adBusy ? t('spin.ad.loading') : t('spin.again.ad')}
            </button>
          )}
          {props.onRespin && !canRespin && !props.onAdRespin && <p class="muted small center">{t('spin.fate')}</p>}
        </div>
      )}
      {phase !== 'idle' && !props.ready && (props.error || slow) && (
        <div class="load-problem" role="alert">
          <p>{props.error ? t('spin.error') : t('spin.slow')}</p>
          <div class="row">
            {/* Неудачную загрузку браузер запоминает, поэтому после ошибки помогает только обновление страницы. */}
            {props.error ? (
              <button class="primary" onClick={() => location.reload()}>{t('spin.reload')}</button>
            ) : (
              <>
                <button class="secondary" onClick={props.onRetry}>{t('spin.retry')}</button>
                <button class="link" onClick={() => location.reload()}>{t('spin.reload')}</button>
              </>
            )}
          </div>
        </div>
      )}
      {/* В первой жизни настроек нет: меньше решений до начала игры. */}
      {phase === 'idle' && props.onSetup && (
        <p class="center">
          <button class="link" onClick={props.onSetup}>{t('setup.custom')}</button>
        </p>
      )}
    </section>
  )
}
