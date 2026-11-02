// Выбор цели жизни (docs/TZ_goal.md): после лотереи рождения, у наследника - в начале его жизни, в юности - смена.
// Три карточки (спокойная, смелая, почти невозможная), у наследника - «Доделать за …», с goal_free_from-й жизни - «Без цели».
import { useEffect, useRef } from 'preact/hooks'
import { GOAL_STEPS } from '../engine/goals'
import type { GoalId, GoalOffer, GoalTier } from '../engine/goals'
import type { GameState } from '../engine/types'
import { nameOf } from '../i18n'
import { platform } from '../platform'
import { goalOffers, inheritable } from '../goal'
import { useUi } from './text'

export interface GoalChoice {
  id: GoalId | null
  tier?: GoalTier
  /** Наследник взял цель родителя - его шаги. */
  inherited?: number[]
}

interface Props {
  state: GameState
  mode: 'birth' | 'change'
  onPick: (c: GoalChoice) => void
  /** Смена цели: «Оставить прежнюю». */
  onKeep?: () => void
}

export function GoalPick({ state, mode, onPick, onKeep }: Props) {
  const { t, lang } = useUi()
  const hero = state.hero
  const o = { sex: hero.sex, region: hero.region, religion: hero.religion }
  const offers: GoalOffer[] = goalOffers(state, mode === 'change' && hero.goal ? [hero.goal.id] : [])
  const heir = mode === 'birth' ? inheritable(state) : null
  const free = mode === 'birth' && (state.settings.livesBefore ?? 0) + 1 >= platform.flags.goal_free_from
  const opened = useRef(Date.now())
  useEffect(() => {
    platform.track('goal_offer', { goals: offers.map((g) => g.id).join(','), mode, cls: hero.cls, ...(heir ? { inherit: heir.id } : {}), ...(free ? { free: 1 } : {}) })
  }, [])
  const pick = (c: GoalChoice) => {
    platform.track(mode === 'change' ? 'goal_change' : 'goal_pick', { goal: c.id ?? 'none', tier: c.tier ?? 0, sec: Math.round((Date.now() - opened.current) / 1000), ...(c.inherited ? { inherited: c.inherited.length } : {}), ...(mode === 'change' ? { from: hero.goal?.id } : {}) })
    onPick(c)
  }
  const parent = hero.npcs.find((n) => n.role === 'mother' && n.alive) ? 'mother' : hero.npcs.find((n) => n.role === 'father' && n.alive) ? 'father' : null
  const ask = mode === 'change' ? 'goal.ask.change' : hero.generation > 1 || hero.age > 0 || !parent ? 'goal.ask.heir' : `goal.ask.${parent}`

  const card = (id: GoalId, tier: GoalTier | null, done: number, onClick: () => void, extra?: string) => (
    <button class={`goal-card tier-${tier ?? 0}`} onClick={onClick}>
      <span class="goal-card-head">
        <span class="goal-title">{t(`goal.${id}.title`, {}, o)}</span>
        {tier && <span class="goal-tier">{t(`goal.tier.${tier}`)}</span>}
      </span>
      {extra ? <span class="goal-wish">{extra}</span> : <span class="goal-wish">«{t(`goal.${id}.wish`, {}, o)}»</span>}
      <span class="goal-steps" aria-label={t('goal.steps_label')}>
        {Array.from({ length: GOAL_STEPS }, (_, i) => (
          <span class={i < done ? 'goal-step done' : 'goal-step'}>{t(`goal.${id}.step.${i + 1}`, {}, o)}</span>
        ))}
      </span>
    </button>
  )

  return (
    <div class="modal-backdrop">
      <div class="modal goal-modal" role="dialog" aria-modal="true" aria-labelledby="goal-title">
        <div class="modal-body">
          <p class="eyebrow">{t('goal.eyebrow')}</p>
          <h2 id="goal-title">{t(ask, {}, o)}</h2>
          <p class="small muted">{t('goal.lead')}</p>
          <div class="goal-cards">
            {heir && card(heir.id, null, heir.steps.length, () => pick({ id: heir.id, tier: heir.tier, inherited: heir.steps }), t('goal.inherit', { name: { name: nameOf(heir.from, lang) }, n: heir.steps.length }))}
            {offers.map((g) => card(g.id, g.tier, 0, () => pick({ id: g.id, tier: g.tier })))}
            {free && (
              <button class="goal-card none" onClick={() => pick({ id: null })}>
                <span class="goal-title">{t('goal.none')}</span>
                <span class="goal-wish">{t('goal.none.desc')}</span>
              </button>
            )}
          </div>
          {onKeep && (
            <button class="secondary" onClick={onKeep}>
              {t('goal.keep')}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

/** Полоса цели на экране жизни: название и четыре шага; касание раскрывает названия шагов. */
export function GoalBar({ state, open, onToggle }: { state: GameState; open: boolean; onToggle: () => void }) {
  const { t } = useUi()
  const hero = state.hero
  const goal = hero.goal
  if (!goal) return null
  const o = { sex: hero.sex, region: hero.region, religion: hero.religion }
  const done = goal.steps.length
  return (
    <div class={done >= GOAL_STEPS ? 'goal-bar done' : 'goal-bar'}>
      <button class="goal-bar-row" aria-expanded={open} onClick={onToggle}>
        <span class="goal-bar-label">{t('goal.bar')}</span>
        <span class="goal-bar-title">{t(`goal.${goal.id}.title`, {}, o)}</span>
        <span class="goal-dots" role="meter" aria-valuemin={0} aria-valuemax={GOAL_STEPS} aria-valuenow={done} aria-label={t('goal.progress', { n: done })}>
          {Array.from({ length: GOAL_STEPS }, (_, i) => (
            <span class={i < done ? 'on' : ''} />
          ))}
        </span>
      </button>
      {open && (
        <ol class="goal-bar-steps">
          {Array.from({ length: GOAL_STEPS }, (_, i) => (
            <li class={i < done ? 'done' : ''}>
              {t(`goal.${goal.id}.step.${i + 1}`, {}, o)}
              {i < done && <span class="muted"> · {t('diary.age', { n: goal.steps[i] })}</span>}
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
