// Обучение для новичка (идея владельца 04.11): пять-шесть шагов по экрану жизни с подсветкой элемента -
// скорость и пауза, «К событию», параметры героя, вкладки, цель, меню со звуком и настройками. Один раз в первой
// жизни, «Пропустить» на каждом шаге, повторить - из меню. Пока обучение открыто, время стоит.
import { useEffect, useLayoutEffect, useState } from 'preact/hooks'
import { useUi } from './text'

export interface TourStep {
  /** CSS-селекторы элемента: первый найденный на экране. */
  at: string[]
  key: string
}

/** Шаги для обеих раскладок экрана жизни (XA): у каждой свои элементы, шаг без элемента пропускается. */
export const TOUR: TourStep[] = [
  { at: ['.time-play', '.speed-bar .speed'], key: 'speed' },
  { at: ['.time-skip', '.speed-bar .speed .chip:last-child'], key: 'skip' },
  { at: ['.hud-portrait', '.hero-bar .avatar'], key: 'hero' },
  { at: ['.life-top .tabs'], key: 'tabs' },
  { at: ['.goal-bar'], key: 'goal' },
  { at: ['.hud-menu', '.hero-bar-actions'], key: 'menu' },
]

const find = (s: TourStep) => s.at.map((q) => document.querySelector(q)).find((e): e is HTMLElement => !!e && e.getBoundingClientRect().width > 0) ?? null

export function Tour({ onEnd }: { onEnd: (step: number, skipped: boolean) => void }) {
  const { t } = useUi()
  const steps = TOUR.filter((s) => find(s))
  const [i, setI] = useState(0)
  const [rect, setRect] = useState<DOMRect | null>(null)
  const step = steps[i]
  useLayoutEffect(() => {
    const el = step && find(step)
    if (!el) return
    el.scrollIntoView({ block: 'nearest' })
    const upd = () => setRect(el.getBoundingClientRect())
    upd()
    window.addEventListener('resize', upd)
    window.addEventListener('scroll', upd, true)
    return () => {
      window.removeEventListener('resize', upd)
      window.removeEventListener('scroll', upd, true)
    }
  }, [i, steps.length])
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onEnd(i, true)
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [i])
  if (!step || !rect) return null
  const last = i === steps.length - 1
  const pad = 6
  const below = rect.top + rect.height / 2 < window.innerHeight / 2
  return (
    <div class="tour" role="dialog" aria-modal="true" aria-labelledby="tour-title">
      <div class="tour-spot" aria-hidden="true" style={{ left: `${rect.left - pad}px`, top: `${rect.top - pad}px`, width: `${rect.width + pad * 2}px`, height: `${rect.height + pad * 2}px` }} />
      <div class="tour-card" style={below ? { top: `${Math.min(window.innerHeight - 200, rect.bottom + 14)}px` } : { bottom: `${Math.min(window.innerHeight - 200, window.innerHeight - rect.top + 14)}px` }}>
        <p class="tour-n">{t('tour.n', { i: i + 1, n: steps.length })}</p>
        <h2 id="tour-title">{t(`tour.${step.key}.title`)}</h2>
        <p>{t(`tour.${step.key}.text`)}</p>
        <div class="tour-btns">
          <button type="button" class="link" onClick={() => onEnd(i, true)}>{t('tour.skip')}</button>
          <button type="button" class="primary" autoFocus onClick={() => (last ? onEnd(i, false) : setI(i + 1))}>
            {last ? t('tour.done') : t('tour.next')}
          </button>
        </div>
      </div>
    </div>
  )
}
