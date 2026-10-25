import { useEffect, useRef, useState } from 'preact/hooks'
import {
  availableFocuses,
  choiceAvailable,
  currentEvent,
  eventChoices,
  eventParams,
  eventTextKey,
  expectedAge,
  lifestyleDefs,
  lifestyleOption,
  riskChance,
  stageOf,
} from '../engine/game'
import { checkAll, npcAge, regionOf } from '../engine/rules'
import { ATTRIBUTES } from '../engine/types'
import type { ChoiceDef, DiaryEntry, EraDef, Effect, GameState, Npc } from '../engine/types'
import { formatMoney, formatYear, hasKey, nameOf } from '../i18n'
import { Scene } from '../pixel/Scene'
import { entryScene } from './Summary'
import { attitudeText, diaryText, feelings, useUi } from './text'
import type { Change } from './text'

type Tab = 'life' | 'hero' | 'people' | 'diary'

/** Год длится 30 секунд на обычной скорости. */
const YEAR_MS = 30000
const TICK_MS = 100
export const SPEEDS = [0, 1, 2, 4, 10] as const
export type Speed = (typeof SPEEDS)[number]

interface LifeProps {
  state: GameState
  era: EraDef
  onStart: (focus: string | null) => void
  onFinish: () => void
  onChoose: (choiceId: string | null) => void
  onDismiss: () => void
  onLifestyle: (category: string, option: string) => void
  onMenu: () => void
  choiceChanges: Change[]
  yearChanges: Change[]
}

/** Видна ли запись дневника: записи текущего года появляются по ходу года. */
function visible(state: GameState, index: number, entry: DiaryEntry, progress: number): boolean {
  if (state.phase !== 'running' || entry.year !== state.year) return true
  const at = state.reveal[index]
  return at === undefined || at <= progress
}

export function Life({ state, era, onStart, onFinish, onChoose, onDismiss, onLifestyle, onMenu, choiceChanges, yearChanges }: LifeProps) {
  const { t, lang } = useUi()
  const hero = state.hero
  const o = { sex: hero.sex, region: hero.region }
  const coin = regionOf(era, hero.region).coin
  const [tab, setTab] = useState<Tab>('life')
  const focuses = availableFocuses(state, era)
  const [focus, setFocus] = useState<string | null>(state.lastFocus)
  const selected = focuses.find((f) => f.id === focus)?.id ?? focuses.find((f) => f.id === 'work')?.id ?? focuses[0]?.id ?? null
  const [speed, setSpeed] = useState<Speed>(1)
  const [progress, setProgress] = useState(0)

  const next = state.queue[0]
  const modalOpen = state.phase === 'running' && !!next && progress >= next.at

  // Часы года. Ссылки на свежие значения, чтобы таймер не держал устаревшие.
  const live = useRef({ state, progress, speed, modalOpen, selected, onStart, onFinish })
  live.current = { state, progress, speed, modalOpen, selected, onStart, onFinish }
  useEffect(() => {
    const id = setInterval(() => {
      const c = live.current
      if (!c.speed || c.modalOpen || c.state.phase === 'dead') return
      if (c.state.phase === 'year') {
        setProgress(0)
        c.onStart(c.selected)
        return
      }
      const np = c.progress + (TICK_MS * c.speed) / YEAR_MS
      const ev = c.state.queue[0]
      if (ev && np >= ev.at) setProgress(ev.at)
      else if (np >= 1 && !ev) {
        setProgress(0)
        c.onFinish()
      } else setProgress(Math.min(np, 1))
    }, TICK_MS)
    return () => clearInterval(id)
  }, [])

  /** Перемотать к следующему событию или к концу года. */
  const skip = () => {
    if (state.phase === 'year') return onStart(selected)
    if (next) setProgress(next.at)
    else {
      setProgress(0)
      onFinish()
    }
  }

  const stage = stageOf(state, era)
  const entries = hero.diary.map((d, i) => [d, i] as const).filter(([d, i]) => visible(state, i, d, progress) && !d.key.startsWith('diary.stage_'))
  const feed = entries.slice(-14).reverse()
  const lastScene = [...entries].reverse().find(([d]) => d.eventId && d.year === state.year)
  const yearScene = lastScene
    ? entryScene(lastScene[0], era)
    : stage === 'infancy' || stage === 'childhood'
      ? { place: 'home' as const, time: 'day' as const, people: 3, props: ['cradle' as const] }
      : { place: 'landmark' as const, time: 'day' as const, people: 3, props: ['sun' as const] }
  const kids = hero.npcs.filter((n) => n.role === 'child' && n.alive)

  return (
    <div class="life">
      <header class="hero-bar">
        <div class="hero-bar-top">
          <h1 class="hero-name">{nameOf(hero.name, lang)}</h1>
          <button class="link" onClick={onMenu}>{t('life.menu')}</button>
        </div>
        <p class="hero-meta">
          {t('life.age', { n: hero.age })} · {formatYear(state.year, lang)} · {t(`region.${hero.region}`)}
        </p>
        <p class="hero-meta">
          {hero.profession ? t(`prof.${hero.profession}`, {}, o) : t('life.no_profession')} · {formatMoney(t, hero.money, coin)}
          {hero.money < 0 && <span class="warn"> · {t('life.debt')}</span>}
          {hero.tags.includes('ill') && <span class="warn"> · {t('life.ill', {}, o)}</span>}
        </p>
        <Bar label={t('attr.health')} value={hero.attrs.health} />
        {hero.age >= 12 && <p class="hero-meta small">{t('life.expected', { n: expectedAge(state, era) })}</p>}
      </header>

      <nav class="tabs" role="tablist">
        {(['life', 'hero', 'people', 'diary'] as Tab[]).map((id) => (
          <button role="tab" aria-selected={tab === id} class={tab === id ? 'tab active' : 'tab'} onClick={() => setTab(id)}>
            {t(`tab.${id}`)}
          </button>
        ))}
      </nav>

      {tab === 'life' && (
        <section class="panel">
          <Scene scene={yearScene} region={hero.region} seed={`${hero.id}:${state.year}`} />
          <div class="year-clock" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)} aria-label={t('life.year_progress')}>
            <span class="year-label">{formatYear(state.year, lang)}</span>
            <span class="year-track">
              <span class="year-fill" style={{ width: `${Math.round((state.phase === 'running' ? progress : 0) * 100)}%` }} />
            </span>
          </div>

          {yearChanges.length > 0 && (
            <>
              <p class="small muted">{t('life.last_year')}</p>
              <ChangeList changes={yearChanges} coin={coin} />
            </>
          )}

          <h2 class="section-title">{t('life.feed')}</h2>
          {feed.length === 0 ? (
            <p class="muted">{t('life.nothing')}</p>
          ) : (
            <ul class="feed">
              {feed.map(([d]) => (
                <li class={`${d.news ? 'news' : ''} ${d.major ? 'major' : ''} ${d.year === state.year ? 'now' : ''}`}>
                  <span class="diary-age">{d.news ? t('life.news') : t('diary.age', { n: d.age })}</span>
                  <span>{diaryText(t, d, hero.sex, hero.region)}</span>
                </li>
              ))}
            </ul>
          )}

          {kids.length > 0 && (
            <>
              <h2 class="section-title">{t('life.children')}</h2>
              <ul class="kids">
                {kids.map((k) => (
                  <ChildRow child={k} year={state.year} all={hero.npcs} />
                ))}
              </ul>
            </>
          )}

          {stage === 'infancy' || focuses.length === 0 ? (
            <p class="muted">{t('life.infancy', {}, o)}</p>
          ) : (
            <>
              <h2 class="section-title">{t('life.focus')}</h2>
              <p class="small muted">{t('life.focus_hint')}</p>
              <div class="focus-grid">
                {focuses.map((f) => (
                  <button class={f.id === selected ? 'focus active' : 'focus'} aria-pressed={f.id === selected} onClick={() => setFocus(f.id)}>
                    <span class="focus-name">{t(`focus.${f.id}`)}</span>
                    <span class="focus-desc">{t(`focus.${f.id}.desc`)}</span>
                  </button>
                ))}
              </div>
            </>
          )}
          {lifestyleDefs(state, era).length > 0 && (
            <button class="link" onClick={() => setTab('hero')}>
              {t('life.lifestyle_link')} →
            </button>
          )}

          <div class="actions sticky">
            <div class="speed" role="group" aria-label={t('life.speed')}>
              {SPEEDS.map((s) => (
                <button class={speed === s ? 'chip active' : 'chip'} aria-pressed={speed === s} aria-label={s === 0 ? t('life.pause') : `×${s}`} onClick={() => setSpeed(s)}>
                  {s === 0 ? '❚❚' : `×${s}`}
                </button>
              ))}
              <button class="chip" onClick={skip} aria-label={t('life.skip')} title={t('life.skip')}>
                ⏭
              </button>
            </div>
            {speed === 0 && <p class="small muted center">{t('life.paused')}</p>}
          </div>
        </section>
      )}

      {tab === 'hero' && (
        <section class="panel">
          <h2 class="section-title">{t('hero.feelings')}</h2>
          <ul class="plain">{feelings(t, hero).map((f) => <li>{f}</li>)}</ul>
          <div class="bars">
            {ATTRIBUTES.map((id) => <Bar label={t(`attr.${id}`)} value={hero.attrs[id]} />)}
          </div>
          {era.vices.some((v) => hero.tags.includes(v.tag)) && (
            <>
              <h2 class="section-title">{t('hero.vices')}</h2>
              <p class="warn">{era.vices.filter((v) => hero.tags.includes(v.tag)).map((v) => t(`vice.${v.tag}`, {}, o)).join(', ')}</p>
            </>
          )}
          <Lifestyle state={state} era={era} coin={coin} onChange={onLifestyle} />
          <h2 class="section-title">{t('hero.traits')}</h2>
          <p>{hero.traits.map((tr) => t(`trait.${tr}`)).join(', ')}</p>
          <h2 class="section-title">{t('hero.skills')}</h2>
          {Object.entries(hero.skills).filter(([, v]) => v >= 1).length === 0 ? (
            <p class="muted">{t('hero.no_skills')}</p>
          ) : (
            <div class="bars">
              {Object.entries(hero.skills)
                .filter(([, v]) => v >= 1)
                .sort((a, b) => b[1] - a[1])
                .map(([id, v]) => <Bar label={t(`skill.${id}`)} value={v} />)}
            </div>
          )}
        </section>
      )}

      {tab === 'people' && <People state={state} />}

      {tab === 'diary' && (
        <section class="panel">
          {entries.length === 0 ? (
            <p class="muted">{t('diary.empty')}</p>
          ) : (
            <ol class="diary">
              {[...entries].reverse().map(([d]) => (
                <li class={`${d.major ? 'major' : ''} ${d.news ? 'news' : ''}`}>
                  <span class="diary-age">{t('diary.age', { n: d.age })}</span>
                  <span>{diaryText(t, d, hero.sex, hero.region)}</span>
                </li>
              ))}
            </ol>
          )}
        </section>
      )}

      {modalOpen && <EventModal state={state} era={era} onChoose={onChoose} onDismiss={onDismiss} changes={choiceChanges} />}
    </div>
  )
}

function Bar({ label, value }: { label: string; value: number }) {
  const v = Math.round(value)
  return (
    <div class="bar">
      <span class="bar-label">{label}</span>
      <span class="bar-track" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={v} aria-label={label}>
        <span class="bar-fill" style={{ width: `${v}%` }} />
      </span>
      <span class="bar-value">{v}</span>
    </div>
  )
}

function ChangeList({ changes, coin }: { changes: Change[]; coin: string }) {
  const { t } = useUi()
  return (
    <ul class="changes" aria-label={t('event.changes')}>
      {changes.map((c) => (
        <li class={c.delta > 0 ? 'up' : 'down'}>
          {t(c.key)} {c.delta > 0 ? '+' : '−'}
          {c.money ? formatMoney(t, Math.abs(c.delta), coin) : Math.abs(c.delta)}
        </li>
      ))}
    </ul>
  )
}

function ChildRow({ child, year, all }: { child: Npc; year: number; all: Npc[] }) {
  const { t, lang } = useUi()
  const grand = all.filter((g) => g.role === 'grandchild' && g.parentId === child.id && g.alive).length
  const bits = [t('life.age', { n: Math.max(0, npcAge(child, year)) })]
  if (child.profession) bits.push(t(`prof.${child.profession}`, {}, { sex: child.sex }).toLowerCase())
  if (child.married) bits.push(t('people.married', { sex: child.sex }))
  if (grand) bits.push(t('people.grandkids', { n: grand }))
  return (
    <li class="person">
      <span class="person-role">{t('npc.child', { sex: child.sex })}</span>
      <span class="person-name">{nameOf(child.name, lang)}</span>
      <span class="muted">{bits.join(' · ')}</span>
    </li>
  )
}

function Lifestyle({ state, era, coin, onChange }: { state: GameState; era: EraDef; coin: string; onChange: (c: string, o: string) => void }) {
  const { t } = useUi()
  const defs = lifestyleDefs(state, era)
  if (defs.length === 0) return null
  const healthPerYear = (effects: Effect[] | undefined) => (effects ?? []).reduce((s, e) => s + ('param' in e && e.param === 'health' ? e.delta : 0), 0)
  return (
    <>
      <h2 class="section-title">{t('lifestyle.title')}</h2>
      <p class="expected">{t('lifestyle.expected', { n: expectedAge(state, era) })}</p>
      <p class="small muted">{t('lifestyle.hint')}</p>
      {defs.map((def) => {
        const current = lifestyleOption(state, def).id
        return (
          <fieldset class="choice-group lifestyle">
            <legend>{t(`lifestyle.${def.id}`)}</legend>
            {def.options.map((opt) => {
              const ok = checkAll(state, opt.requirements)
              return (
                <button type="button" class={opt.id === current ? 'option active' : 'option'} aria-pressed={opt.id === current} disabled={!ok} onClick={() => onChange(def.id, opt.id)}>
                  <span class="option-label">{t(`lifestyle.${def.id}.${opt.id}`)}</span>
                  <span class="option-desc">{t(`lifestyle.${def.id}.${opt.id}.desc`)}</span>
                  <span class="option-desc">
                    {opt.cost > 0 ? t('lifestyle.cost', { cost: formatMoney(t, opt.cost, coin) }) : opt.cost < 0 ? t('lifestyle.saves', { cost: formatMoney(t, -opt.cost, coin) }) : t('lifestyle.free')}
                  </span>
                  {(healthPerYear(opt.effects) !== 0 || (opt.mortality ?? 1) !== 1) && (
                    <span class="option-effect">
                      {[
                        healthPerYear(opt.effects) ? t('lifestyle.health_year', { d: `${healthPerYear(opt.effects) > 0 ? '+' : '−'}${Math.abs(healthPerYear(opt.effects))}` }) : '',
                        (opt.mortality ?? 1) !== 1 ? t('lifestyle.risk', { d: `${(opt.mortality ?? 1) > 1 ? '+' : '−'}${Math.round(Math.abs((opt.mortality ?? 1) - 1) * 100)}` }) : '',
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  )}
                </button>
              )
            })}
          </fieldset>
        )
      })}
    </>
  )
}

function People({ state }: { state: GameState }) {
  const { t, lang } = useUi()
  const hero = state.hero
  const alive = hero.npcs.filter((n) => n.alive)
  const dead = hero.npcs.filter((n) => !n.alive)
  const row = (n: Npc) => (
    <li class="person">
      <span class="person-role">{t(`npc.${n.role}`, { sex: n.sex })}</span>
      <span class="person-name">{nameOf(n.name, lang)}</span>
      <span class="muted">
        {n.alive
          ? [
              t('life.age', { n: Math.max(0, npcAge(n, state.year)) }),
              attitudeText(t, n),
              n.profession ? t(`prof.${n.profession}`, {}, { sex: n.sex }).toLowerCase() : '',
              n.married ? t('people.married', { sex: n.sex }) : '',
            ]
              .filter(Boolean)
              .join(' · ')
          : t('npc.dead', { sex: n.sex, year: formatYear(n.deathYear ?? state.year, lang) })}
      </span>
    </li>
  )
  return (
    <section class="panel">
      {hero.npcs.length === 0 && <p class="muted">{t('people.empty')}</p>}
      {alive.length > 0 && (
        <>
          <h2 class="section-title">{t('people.alive')}</h2>
          <ul class="people">{alive.map(row)}</ul>
        </>
      )}
      {dead.length > 0 && (
        <>
          <h2 class="section-title">{t('people.dead')}</h2>
          <ul class="people dead">{dead.map(row)}</ul>
        </>
      )}
    </section>
  )
}

interface EventProps {
  state: GameState
  era: EraDef
  onChoose: (id: string | null) => void
  onDismiss: () => void
  changes: Change[]
}

function EventModal({ state, era, onChoose, onDismiss, changes }: EventProps) {
  const { t, lang } = useUi()
  const ev = currentEvent(state, era)
  const [noteOpen, setNoteOpen] = useState(false)
  if (!ev) return null
  const hero = state.hero
  const o = { sex: hero.sex, region: hero.region }
  const coin = regionOf(era, hero.region).coin
  const active = state.queue[0]
  const outcome = active?.outcome
  const params = active ? eventParams(state, active) : {}
  const choices = eventChoices(state, era, ev)
  const isProfession = ev.dynamic === 'profession'
  const isName = ev.dynamic === 'name'
  const label = (c: ChoiceDef) => (isName ? nameOf(c.id, lang) : isProfession ? t(`prof.${c.id}`, {}, o) : t(`ev.${ev.id}.${c.id}`, params, o))
  const cost = (c: ChoiceDef) => {
    const m = (c.effects ?? []).reduce((sum, e) => sum + ('param' in e && e.param === 'money' && e.delta < 0 ? e.delta : 0), 0)
    return m < 0 ? formatMoney(t, -m, coin) : null
  }
  const resultKey = outcome && outcome.choiceId !== 'ok' && !isProfession && !isName ? `ev.${ev.id}.${outcome.choiceId}.${outcome.result}` : null
  const resultText = resultKey && hasKey(lang, resultKey) ? t(resultKey, params, o) : null

  return (
    <div class="modal-backdrop">
      <div class={`modal ${ev.turning ? 'turning' : ''}`} role="dialog" aria-modal="true" aria-labelledby="ev-title">
        <Scene scene={ev.scene ?? { place: 'landmark' }} region={hero.region} seed={ev.id} label={t(`ev.${ev.id}.title`, params, o)} />
        <div class="modal-body">
          {ev.turning && <p class="eyebrow">{t('event.turning')}</p>}
          <h2 id="ev-title">{t(`ev.${ev.id}.title`, params, o)}</h2>
          <p class="event-text">{t(eventTextKey(ev, active?.variant), params, o)}</p>

          {ev.historian_note && (
            <div class="note">
              <button class="link" aria-expanded={noteOpen} onClick={() => setNoteOpen(!noteOpen)}>
                {t('event.note')} {noteOpen ? '▴' : '▾'}
              </button>
              {noteOpen && (
                <>
                  <p>{t(`ev.${ev.id}.note`)}</p>
                  {ev.confidence && <p class="confidence">{t(`event.confidence.${ev.confidence}`)}</p>}
                </>
              )}
            </div>
          )}

          {!outcome && (
            <div class="choices">
              {choices.length === 0 && (
                <button class="primary" onClick={() => onChoose(null)}>{t('event.ok')}</button>
              )}
              {choices.map((c) => {
                const ok = choiceAvailable(state, c)
                const p = riskChance(state, c)
                const price = cost(c)
                return (
                  <button class="choice" disabled={!ok} onClick={() => onChoose(c.id)}>
                    <span>{label(c)}</span>
                    {isProfession && <span class="choice-desc">{t(`prof.${c.id}.desc`)}</span>}
                    <span class="choice-meta">
                      {price && <span class="chip-static">−{price}</span>}
                      {p !== null && <span class="chip-static">{t('event.chance', { n: Math.round(p * 100) })}</span>}
                      {!ok && <span class="chip-static">{t('event.locked')}</span>}
                    </span>
                  </button>
                )
              })}
            </div>
          )}

          {outcome && (
            <div class="outcome">
              {outcome.result !== 'ok' && <p class={`result ${outcome.result}`}>{t(`event.${outcome.result}`)}</p>}
              {resultText && <p>{resultText}</p>}
              {changes.length > 0 && <ChangeList changes={changes} coin={coin} />}
              <button class="primary" onClick={onDismiss} autoFocus>{t('event.next')}</button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
