// Экран детской игры: выбор задания (Тело / Ум / Люди) → головоломка → звёзды и прибавка.
import { useMemo, useState } from 'preact/hooks'
import type { KidsLang, KidsPuzzle, Task } from './types'
import { REWARD, starsFor, TASKS } from './types'
import { makeRng } from './rng'
import { kt, TASK_ICON } from './text'
import { Scene } from '../pixel/Scene'
import { Icon } from '../ui/Icon'
import './kids.css'

export interface KidsResult {
  puzzle: string
  task: Task
  stars: number
  moves: number
  par: number
  hints: number
  /** Прибавка к качествам задания. */
  gain: number
}

interface Props {
  puzzle: KidsPuzzle
  difficulty: number
  seed: number
  lang: KidsLang
  age?: number
  region?: string
  onFinish: (r: KidsResult) => void
}

export function KidsGame({ puzzle, difficulty, seed, lang, age = 8, region, onFinish }: Props) {
  const text = puzzle.text[lang] ?? puzzle.text.en
  const [task, setTask] = useState<Task | null>(null)
  const level = useMemo(() => (task ? puzzle.logic.generate(difficulty, makeRng(seed ^ (TASKS.indexOf(task) * 7919)), task) : null), [task, difficulty, seed, puzzle.id])
  const [state, setState] = useState<unknown>(null)
  const [moves, setMoves] = useState(0)
  const [hints, setHints] = useState(0)
  const [hinted, setHinted] = useState<unknown>(null)
  const [result, setResult] = useState<KidsResult | null>(null)
  const cur = state ?? level?.start
  const solved = !!level && !!cur && puzzle.logic.solved(cur)

  const finish = (ok: boolean) => {
    if (!level || !task) return
    const stars = starsFor(ok, moves, level.par, hints)
    setResult({ puzzle: puzzle.id, task, stars, moves, par: level.par, hints, gain: REWARD[stars] })
  }
  const move = (m: unknown) => {
    if (!level || solved || result) return
    const next = puzzle.logic.apply(cur, m)
    if (!next) return
    setState(next)
    setMoves((n) => n + 1)
    setHinted(null)
    if (puzzle.logic.solved(next)) {
      const stars = starsFor(true, moves + 1, level.par, hints)
      setTimeout(() => setResult({ puzzle: puzzle.id, task: task!, stars, moves: moves + 1, par: level.par, hints, gain: REWARD[stars] }), 650)
    }
  }
  const hint = () => {
    if (!level || solved) return
    const m = puzzle.logic.hint(cur, level)
    if (m === null) return
    setHints((n) => n + 1)
    setHinted(m)
  }
  const reset = () => {
    setState(null)
    setMoves(0)
    setHinted(null)
  }

  return (
    <div class="kids">
      <div class="kids-scene">
        <Scene scene={{ place: puzzle.place, time: 'day', people: 3 }} region={region ?? puzzle.region} seed={`kids-${puzzle.id}`} still />
        <span class="kids-age">{kt(lang, 'age', { n: age })}</span>
      </div>
      <h2 class="kids-title">{text.title}</h2>

      {!task && (
        <>
          <p class="kids-story">{text.story}</p>
          <p class="kids-choose">{kt(lang, 'choose')}</p>
          <div class="kids-tasks">
            {TASKS.map((t, i) => (
              <button class="kids-task" onClick={() => setTask(t)}>
                <span class="kids-dir">
                  <Icon name={TASK_ICON[t]} /> {kt(lang, `dir.${t}`)}
                </span>
                <span class="kids-label">{text.tasks[i]}</span>
                <span class="kids-reward">+ {kt(lang, `reward.${t}`)}</span>
              </button>
            ))}
          </div>
        </>
      )}

      {task && level && (
        <>
          {!result && <p class="kids-rule">{text.rule}</p>}
          <div class="kids-board">
            <puzzle.Board state={cur} level={level} task={task} lang={lang} onMove={move} hinted={hinted} done={solved || !!result} />
          </div>
        </>
      )}

      {task && level && !result && (
        <>
          <div class="kids-foot">
            <span>
              {kt(lang, 'moves', { n: moves })} · {kt(lang, 'par', { n: level.par })}
            </span>
            <button class="link small" onClick={() => finish(false)}>
              {kt(lang, 'give_up')}
            </button>
          </div>
          <div class="kids-btns">
            <button class="secondary" onClick={reset}>
              {kt(lang, 'reset')}
            </button>
            <button class="secondary" onClick={hint}>
              {kt(lang, 'hint')}
            </button>
          </div>
        </>
      )}

      {result && (
        <div class="kids-result">
          <p class="kids-win">{result.stars > 0 ? kt(lang, 'win') : kt(lang, 'lose')}</p>
          <Stars n={result.stars} />
          <p class="kids-gain">{kt(lang, 'gain', { n: result.gain, what: kt(lang, `reward.${result.task}`) })}</p>
          {result.hints > 0 && result.stars > 0 && <p class="small muted">{kt(lang, 'hint_used')}</p>}
          <button class="primary" onClick={() => onFinish(result)}>
            {kt(lang, 'next')}
          </button>
        </div>
      )}
    </div>
  )
}

export function Stars({ n }: { n: number }) {
  return (
    <span class="kids-stars" aria-label={`${n}/3`}>
      {[0, 1, 2].map((i) => (
        <svg viewBox="0 0 24 24">
          <path d="M12 2.5l2.9 6 6.6.8-4.9 4.5 1.3 6.5L12 17l-5.9 3.3 1.3-6.5L2.5 9.3l6.6-.8z" fill={i < n ? '#ecd06f' : 'none'} stroke="#ecd06f" stroke-width="1.6" stroke-linejoin="round" />
        </svg>
      ))}
    </span>
  )
}
