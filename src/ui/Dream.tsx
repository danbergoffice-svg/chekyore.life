// Экран сна о будущем (docs/TZ_dreams.md): три шага с вводом — отметить нужное, доли, порядок, число;
// спор с мудрецом; подсказка «Заглянуть в учебник»; в конце — итог и карточка «Как было на самом деле».
// Верно ли ответил игрок, видно только в конце. Вариантов «один из четырёх» нет.
import { useEffect, useMemo, useState } from 'preact/hooks'
import { dreamDef, expectedAnswer } from '../engine/dreams'
import { LOCALE, percent } from '../i18n'
import type { DreamInput, DreamOutcome, DreamState, GameState, Lang } from '../engine/types'
import { useUi } from './text'

/** Итог сна, который показывается после «Проснуться» (сам сон в состоянии игры уже закрыт). */
export interface DreamResult {
  dream: DreamState
  outcome: DreamOutcome
  era: string
}

interface Props {
  state: GameState
  result: DreamResult | null
  onAnswer: (value: unknown) => void
  onHint: () => void
  onWake: () => void
  onClose: () => void
  /** Тренировка из меню: итог без последствий для жизни. */
  training?: boolean
}

/** Перемешать варианты одинаково для этого сна (порядок не подсказывает ответ и не прыгает при перерисовке). */
function shuffled<T>(list: T[], seed: string): T[] {
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619)
  const out = [...list]
  for (let i = out.length - 1; i > 0; i--) {
    h = Math.imul(h ^ (h >>> 13), 1274126177)
    const j = (h >>> 0) % (i + 1)
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/** Число для показа: до двух знаков, без лишних нулей. */
function fmt(n: number, lang: string): string {
  return (Math.round(n * 100) / 100).toLocaleString(LOCALE[lang as Lang] ?? 'en-US')
}

export function DreamModal({ state, result, onAnswer, onHint, onWake, onClose, training }: Props) {
  const { t, lang } = useUi()
  const hero = state.hero
  const o = { sex: hero.sex, region: hero.region, religion: hero.religion }
  const d = result?.dream ?? state.dream
  const def = d && dreamDef(d.id)
  const [mood, setMood] = useState<string | null>(null)
  const [hintOpen, setHintOpen] = useState(false)
  if (!d || !def) return null
  const params = Object.fromEntries(Object.entries(d.params).map(([k, v]) => [k, fmt(v, lang)]))
  const opt = (k: string) => t(`dream.${d.id}.opt.${k}`, {}, o)
  const unit = (u?: string) => (u ? t(`unit.${u}`) : '')

  // Итог: верные ответы по шагам и «Как было на самом деле».
  if (result) {
    const era = result.era
    const show = (input: DreamInput): string => {
      const want = expectedAnswer(input, d.params, era)
      if (input.kind === 'pick') return (want as string[]).map(opt).join(', ')
      if (input.kind === 'order') return (want as string[]).map(opt).join(' → ')
      if (input.kind === 'ratio') return Object.entries(want as Record<string, number>).map(([k, v]) => `${opt(k)} ${percent(v, lang as Lang)}`).join(', ')
      return `${fmt(want as number, lang)} ${unit(input.unit)}`.trim()
    }
    const text = result.outcome === 'partial' && d.known ? `dream.${d.id}.known` : `dream.${d.id}.${result.outcome}`
    return (
      <div class="modal-backdrop dream-backdrop">
        <div class="modal dream-modal" role="dialog" aria-modal="true" aria-labelledby="dream-title">
          <div class="modal-body">
            <p class="eyebrow">{t(training ? 'dream.training' : 'dream.title_block')}</p>
            <h2 id="dream-title">{t(`dream.${d.id}.title`)}</h2>
            <p class="dream-result">
              {t('dream.score', { n: d.score ?? 0 })} · <strong>{t(`dream.result.${result.outcome}`)}</strong>
            </p>
            <p>{training ? t('dream.training.result', { n: d.score ?? 0 }) : t(text, params, o)}</p>
            <div class="dream-truth">
              <h3>{t('dream.truth_title')}</h3>
              <ol class="dream-answers">
                {def.steps.map((s, si) => (
                  <li>
                    <span aria-hidden="true">{d.correct[si]?.length && d.correct[si].every(Boolean) ? '✓' : '✗'}</span>{' '}
                    <strong>{t(s.kind === 'debate' ? 'dream.step.debate' : `dream.step.${si + 1}`)}:</strong> {s.items.map(show).join('; ')}
                  </li>
                ))}
              </ol>
              <p>{t(`dream.${d.id}.truth`)}</p>
            </div>
            <button class="primary" onClick={onClose} autoFocus>
              {t('event.next')}
            </button>
          </div>
        </div>
      </div>
    )
  }

  const step = def.steps[d.step]
  const input = d.done ? undefined : step.items[d.item]
  const debate = step.kind === 'debate'
  const answer = (value: unknown) => {
    setMood(t(`dream.mood.${1 + ((d.step * 2 + d.item) % 4)}`, {}, o))
    onAnswer(value)
  }

  return (
    <div class="modal-backdrop dream-backdrop">
      <div class="modal dream-modal" role="dialog" aria-modal="true" aria-labelledby="dream-title">
        <div class="modal-body">
          <p class="eyebrow">
            {training && `${t('dream.training')} · `}
            {d.done ? t('dream.title_block') : `${t('dream.step_of', { n: d.step + 1 })} · ${t(debate ? 'dream.step.debate' : `dream.step.${d.step + 1}`)}`}
          </p>
          <h2 id="dream-title">{t(`dream.${d.id}.title`)}</h2>
          {d.step === 0 && d.item === 0 && !d.done && <p class="dream-intro">{t(`dream.${d.id}.intro`, params, o)}</p>}
          {mood && <p class="dream-mood">{mood}</p>}
          {debate && !d.done && <p class="dream-sage">{t(`dream.${d.id}.sage`)}</p>}
          {input && (
            <>
              <p class="dream-question">{t(`dream.${d.id}.q${d.step + 1}.${d.item + 1}`, params, o)}</p>
              <DreamInputView
                key={`${d.step}.${d.item}`}
                input={input}
                seed={`${d.id}:${d.step}:${d.item}`}
                picked={(d.answers[d.step]?.[0] as string[] | undefined) ?? []}
                opt={opt}
                unit={unit((input as { unit?: string }).unit)}
                onDone={answer}
              />
              <div class="dream-hint">
                {!d.hint ? (
                  <button class="link" onClick={() => { onHint(); setHintOpen(true) }}>
                    {t('dream.hint')}
                  </button>
                ) : (
                  hintOpen && <p class="small">📖 {t(`dream.${d.id}.hint${d.step + 1}`)}</p>
                )}
              </div>
            </>
          )}
          {d.done && (
            <button class="primary" onClick={onWake} autoFocus>
              {t('dream.wake')}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

/** Один ввод: отметить нужное, доли, порядок или число. */
function DreamInputView({ input, seed, picked, opt, unit, onDone }: { input: DreamInput; seed: string; picked: string[]; opt: (k: string) => string; unit: string; onDone: (v: unknown) => void }) {
  const { t } = useUi()
  const options = useMemo(() => ('options' in input ? shuffled(input.options, seed) : []), [seed])
  const [sel, setSel] = useState<string[]>([])
  const [order, setOrder] = useState<string[]>(options)
  const [removed, setRemoved] = useState<string[]>([])
  const [num, setNum] = useState('')
  // Доли — для того, что игрок выбрал в предыдущем вводе этого шага.
  const parts = input.kind === 'ratio' ? picked : []
  const [ratio, setRatio] = useState<Record<string, string>>({})
  useEffect(() => setOrder(options), [options])

  if (input.kind === 'pick') {
    const toggle = (k: string) => setSel(sel.includes(k) ? sel.filter((x) => x !== k) : [...sel, k])
    return (
      <div class="dream-input">
        <p class="small muted">{t('dream.pick_hint')}</p>
        <div class="dream-pick">
          {options.map((k) => (
            <button type="button" class={sel.includes(k) ? 'dream-card active' : 'dream-card'} aria-pressed={sel.includes(k)} onClick={() => toggle(k)}>
              {opt(k)}
            </button>
          ))}
        </div>
        <button class="primary" onClick={() => onDone(sel)}>{t('dream.done')}</button>
      </div>
    )
  }
  if (input.kind === 'ratio') {
    const sum = parts.reduce((s, k) => s + (Number(String(ratio[k] ?? '').replace(',', '.')) || 0), 0)
    return (
      <div class="dream-input">
        {parts.map((k) => (
          <label class="dream-ratio">
            <span>{opt(k)}</span>
            <input inputMode="decimal" value={ratio[k] ?? ''} onInput={(e) => setRatio({ ...ratio, [k]: (e.target as HTMLInputElement).value })} aria-label={opt(k)} />
            <span>%</span>
          </label>
        ))}
        <p class={sum === 100 ? 'small' : 'small warn'}>{t('dream.ratio_sum', { n: Math.round(sum * 10) / 10 })}</p>
        <button class="primary" onClick={() => onDone(Object.fromEntries(parts.map((k) => [k, ratio[k] ?? ''])))}>{t('dream.done')}</button>
      </div>
    )
  }
  if (input.kind === 'order') {
    const active = order.filter((k) => !removed.includes(k))
    const move = (k: string, dir: -1 | 1) => {
      const i = order.indexOf(k)
      const j = i + dir
      if (j < 0 || j >= order.length) return
      const next = [...order]
      ;[next[i], next[j]] = [next[j], next[i]]
      setOrder(next)
    }
    return (
      <div class="dream-input">
        <p class="small muted">{t('dream.order_hint')}</p>
        <ol class="dream-order">
          {order.map((k) => {
            const off = removed.includes(k)
            return (
              <li class={off ? 'off' : ''}>
                <span class="dream-order-text">{opt(k)}</span>
                <span class="dream-order-btns">
                  <button type="button" class="chip" aria-label="↑" disabled={off} onClick={() => move(k, -1)}>↑</button>
                  <button type="button" class="chip" aria-label="↓" disabled={off} onClick={() => move(k, 1)}>↓</button>
                  <button type="button" class="chip" onClick={() => setRemoved(off ? removed.filter((x) => x !== k) : [...removed, k])}>
                    {off ? t('dream.restore') : '✕'}
                  </button>
                </span>
              </li>
            )
          })}
        </ol>
        <button class="primary" onClick={() => onDone(active)}>{t('dream.done')}</button>
      </div>
    )
  }
  return (
    <div class="dream-input">
      <label class="dream-number">
        <input inputMode="decimal" value={num} placeholder={t('dream.number_ph')} onInput={(e) => setNum((e.target as HTMLInputElement).value)} />
        {unit && <span>{unit}</span>}
      </label>
      <button class="primary" disabled={!num.trim()} onClick={() => onDone(num)}>{t('dream.done')}</button>
    </div>
  )
}
