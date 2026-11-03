// Экран жизни по макету 06 (ТЗ редизайна, этап 2; эксперимент XA): компактная шапка героя, чип ближайшей вехи и
// нижняя панель времени в зоне большого пальца. Старая раскладка остаётся у рукава «a» (Life.tsx).
import { useEffect, useRef, useState } from 'preact/hooks'
import type { ComponentChildren } from 'preact'
import type { EraDef, GameState } from '../engine/types'
import { formatMoney, formatYear, nameOf } from '../i18n'
import { Avatar } from '../pixel/AvatarView'
import type { AvatarInput } from '../pixel/avatar'
import { useUi } from './text'
import { Icon } from './Icon'

/** Шапка 64 px: портрет (тап - подробности), имя и возраст, год · край · деньги, «Меню»; под ней - полоса здоровья 4 px. */
export function HudHeader(props: {
  state: GameState
  coin: string
  look: AvatarInput
  onMenu: () => void
  /** Подробности героя: занятие, положение, долг, болезнь, ожидаемая жизнь. */
  details: ComponentChildren
}) {
  const { t, lang } = useUi()
  const hero = props.state.hero
  const [open, setOpen] = useState(false)
  const ill = hero.tags.includes('ill')
  return (
    <header class={`hud ${ill ? 'ill' : ''}`}>
      <div class="hud-row">
        <button type="button" class="hud-portrait" aria-expanded={open} aria-label={t('hud.details')} onClick={() => setOpen(!open)}>
          <Avatar input={props.look} label={t('life.portrait', { n: hero.age })} />
        </button>
        <div class="hud-info">
          <h1 class="hud-name">
            {nameOf(hero.name, lang)} · {t('life.age', { n: hero.age })}
          </h1>
          <p class="hud-meta">
            {formatYear(props.state.year, lang)} · {t(`region.${hero.region}`)} · {formatMoney(t, hero.money, props.coin)}
            {hero.money < 0 && <span class="warn"> · {t('life.debt')}</span>}
            {ill && <span class="warn"> · {t('life.ill', {}, { sex: hero.sex })}</span>}
          </p>
        </div>
        <button type="button" class="hud-menu" aria-label={t('life.menu')} onClick={props.onMenu}>
          <Icon name="menu" />
        </button>
      </div>
      <div class="hud-health" role="img" aria-label={`${t('attr.health')}: ${Math.round(hero.attrs.health)}`}>
        <span style={{ width: `${Math.max(0, Math.min(100, hero.attrs.health))}%` }} />
      </div>
      {open && <div class="hud-details">{props.details}</div>}
    </header>
  )
}

const BAR_SPEEDS = [0.5, 1, 2, 4, 10] as const

/** Нижняя панель: Пауза/Играть, год и полоса года, «К событию». Скорость ×½…×10 - долгим нажатием на кнопку
 *  или касанием подписи скорости (её видно и с клавиатуры). */
export function TimeBar(props: {
  speed: number
  onSpeed: (s: number) => void
  progress: number
  year: number
  onSkip: () => void
  /** Ждёт выбора: окно события открыто - панель неактивна. */
  waiting: boolean
}) {
  const { t, lang } = useUi()
  const [menu, setMenu] = useState(false)
  // Скорость, к которой вернёт «Играть» после паузы.
  const last = useRef(props.speed || 1)
  if (props.speed) last.current = props.speed
  const press = useRef<{ timer: number; long: boolean } | null>(null)
  useEffect(() => () => { if (press.current) clearTimeout(press.current.timer) }, [])
  const down = () => {
    press.current = { timer: window.setTimeout(() => {
      if (press.current) press.current.long = true
      setMenu(true)
    }, 450), long: false }
  }
  const up = () => {
    const p = press.current
    press.current = null
    if (!p) return
    clearTimeout(p.timer)
    if (!p.long) props.onSpeed(props.speed ? 0 : last.current)
  }
  const label = (s: number) => (s === 0.5 ? '×½' : `×${s}`)
  const playing = props.speed > 0
  return (
    <div class={`time-bar ${props.waiting ? 'waiting' : ''}`}>
      {menu && (
        <div class="speed-pop" role="group" aria-label={t('life.speed')}>
          {BAR_SPEEDS.map((s) => (
            <button type="button" class={props.speed === s ? 'chip active' : 'chip'} aria-pressed={props.speed === s} onClick={() => {
              props.onSpeed(s)
              setMenu(false)
            }}>
              {label(s)}
            </button>
          ))}
        </div>
      )}
      <button
        type="button"
        class="time-play"
        aria-label={playing ? t('life.pause') : t('life.play')}
        aria-pressed={!playing}
        onPointerDown={down}
        onPointerUp={up}
        onPointerLeave={() => {
          if (press.current && !press.current.long) clearTimeout(press.current.timer)
          press.current = null
        }}
        onContextMenu={(e) => e.preventDefault()}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            props.onSpeed(props.speed ? 0 : last.current)
          }
        }}
      >
        <Icon name={playing ? 'pause' : 'play'} />
      </button>
      <div class="time-mid">
        <div class="time-line">
          <span>{formatYear(props.year, lang)}</span>
          <button type="button" class="time-speed" aria-expanded={menu} onClick={() => setMenu(!menu)}>
            {playing ? t('time.speed_hold', { s: label(props.speed) }) : t('life.paused_short')}
          </button>
        </div>
        <div class="time-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(props.progress * 100)} aria-label={t('life.year_progress')}>
          <span style={{ width: `${Math.round(props.progress * 100)}%` }} />
        </div>
      </div>
      <button type="button" class="time-skip" onClick={props.onSkip} aria-label={t('life.skip')}>
        <span>{t('time.to_event')}</span>
        <Icon name="skip" />
      </button>
    </div>
  )
}

/** Ближайшая веха жизни: выбор ремесла, пора свадеб, юность, зрелость, старость - что раньше. */
export function nextMilestone(state: GameState, era: EraDef): { years: number; key: string } | null {
  const hero = state.hero
  const age = hero.age
  const list: [number, string][] = [
    [era.stages.youth, 'youth'],
    [era.stages.adult, 'adult'],
    [era.stages.old, 'old'],
  ]
  if (!hero.profession && hero.cls !== 'slave') list.push([12, 'trade'])
  if (!hero.tags.includes('married') && !hero.tags.includes('vowed')) list.push([era.marriageAge[hero.sex][0], 'marriage'])
  const next = list.filter(([a]) => a > age).sort((a, b) => a[0] - b[0])[0]
  return next ? { years: next[0] - age, key: next[1] } : null
}

export function MilestoneChip({ state, era }: { state: GameState; era: EraDef }) {
  const { t } = useUi()
  const m = nextMilestone(state, era)
  // Веха наступила - чип коротко пульсирует (новый ключ вехи - новая анимация).
  if (!m) return null
  return (
    <p class="milestone-chip" key={m.key}>
      <Icon name="clock" />
      <span>{t('milestone.in', { n: m.years, what: { key: `milestone.${m.key}` } }, { sex: state.hero.sex })}</span>
    </p>
  )
}
