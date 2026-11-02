// Экран ранней игры (2–4 года): выбор занятия (Тело / Ум / Люди) → игра → звёзды и прибавка.
// Занятия - ранние игры (toddler/) и головоломка своей страны (KidsGame с заданием, выбранным здесь).
import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import { Scene } from '../pixel/SceneView'
import { Icon } from '../ui/Icon'
import { platform } from '../platform'
import { KIDS_BY_ERA } from './index'
import { ageLabel, KidsGame, Stars } from './KidsGame'
import type { KidsResult } from './KidsGame'
import { earlyGain, earlyOffer, puzzleLevel } from './early'
import type { EarlyCard, EarlyResult } from './early'
import { kt, TASK_ICON } from './text'
import { TODDLER_BY_ID } from './toddler'
import { skinOf } from './toddler/skins'
import type { KidsLang } from './types'
import { TASKS } from './types'
import './kids.css'

interface Props {
  era: string
  region: string
  lang: KidsLang
  age: number
  livesBefore: number
  /** Сыгранные ранние игры прошлых жизней (для выбора новых). */
  seen: string[]
  seed: number
  onFinish: (r: EarlyResult) => void
}

function cardTitle(c: EarlyCard, era: string, lang: KidsLang): string {
  if (c.kind === 'puzzle') return KIDS_BY_ERA[era].text[lang].tasks[TASKS.indexOf(c.task)]
  const skin = skinOf(era) as unknown as Record<string, { card: Record<KidsLang, string> }>
  return skin[c.id].card[lang]
}

export function EarlyGame({ era, region, lang, age, livesBefore, seen, seed, onFinish }: Props) {
  const cards = useMemo(() => earlyOffer(era, livesBefore, seen), [era, livesBefore])
  const [card, setCard] = useState<EarlyCard | null>(null)
  const [result, setResult] = useState<EarlyResult | null>(null)
  const t0 = useRef(0)
  useEffect(() => platform.track('kids_offer', { games: cards.map((c) => c.id).join(','), age }), [])

  const pick = (c: EarlyCard) => {
    t0.current = Date.now()
    platform.track('kids_start', { game: c.id, kind: c.kind, task: c.task, fresh: seen.includes(c.id) ? 0 : 1 })
    setCard(c)
  }
  const end = (r: Omit<EarlyResult, 'sec' | 'gain'>) => {
    const full: EarlyResult = { ...r, gain: earlyGain(r.stars), sec: Math.round((Date.now() - t0.current) / 1000) }
    platform.track('kids_end', { game: full.id, kind: full.kind, task: full.task, stars: full.stars, sec: full.sec, mistakes: full.mistakes ?? 0, moves: full.moves ?? 0, hints: full.hints ?? 0, quit: full.stars === 0 ? 1 : 0 })
    return full
  }

  // Головоломка страны - свой экран целиком (поле, подсказка, «Сначала», итог).
  if (card?.kind === 'puzzle') {
    return (
      <KidsGame
        puzzle={KIDS_BY_ERA[era]}
        difficulty={puzzleLevel(livesBefore)}
        seed={seed}
        lang={lang}
        age={age}
        region={region}
        task={card.task}
        onFinish={(r: KidsResult) => onFinish(end({ kind: 'puzzle', id: card.id, task: card.task, stars: r.stars, moves: r.moves, par: r.par, hints: r.hints }))}
      />
    )
  }

  const toddler = card ? TODDLER_BY_ID[card.id] : null
  return (
    <div class="kids">
      <div class="kids-scene">
        <Scene scene={{ place: 'yard', time: 'day', people: 3 }} region={region} seed={`early-${seed}`} still />
        <span class="kids-age">{ageLabel(lang, age)}</span>
      </div>

      {!card && (
        <>
          <h2 class="kids-title">{kt(lang, 'choose')}</h2>
          <div class="kids-tasks">
            {cards.map((c) => (
              <button class="kids-task" onClick={() => pick(c)}>
                <span class="kids-dir">
                  <Icon name={TASK_ICON[c.task]} /> {kt(lang, `dir.${c.task}`)}
                </span>
                <span class="kids-label">{cardTitle(c, era, lang)}</span>
                <span class="kids-reward">+ {kt(lang, `reward.${c.task}`)}</span>
              </button>
            ))}
          </div>
        </>
      )}

      {card && toddler && (
        <>
          <h2 class="kids-title">{cardTitle(card, era, lang)}</h2>
          {!result && <p class="kids-rule">{toddler.rule[lang]}</p>}
          <div class="kids-board">
            <toddler.Game skin={skinOf(era)} lang={lang} seed={seed} onDone={(r) => window.setTimeout(() => setResult(end({ kind: 'toddler', id: card.id, task: card.task, stars: r.stars, mistakes: r.mistakes })), 650)} />
          </div>
          {!result && (
            <div class="kids-foot">
              <span />
              <button class="link small" onClick={() => setResult(end({ kind: 'toddler', id: card.id, task: card.task, stars: 0, mistakes: 0 }))}>
                {kt(lang, 'run_off')}
              </button>
            </div>
          )}
        </>
      )}

      {result && (
        <div class="kids-result">
          <p class="kids-win">{result.stars > 0 ? kt(lang, 'win') : kt(lang, 'lose')}</p>
          <Stars n={result.stars} />
          <p class="kids-gain">{kt(lang, 'gain', { n: result.gain, what: kt(lang, `reward.${result.task}`) })}</p>
          <button class="primary" onClick={() => onFinish(result)}>
            {kt(lang, 'next')}
          </button>
        </div>
      )}
    </div>
  )
}
