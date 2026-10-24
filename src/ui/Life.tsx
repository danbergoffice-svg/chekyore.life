import { useEffect, useState } from 'preact/hooks'
import { availableFocuses, choiceAvailable, currentEvent, eventChoices, riskChance, stageOf } from '../engine/game'
import { addYears, npcAge, regionOf } from '../engine/rules'
import { ATTRIBUTES } from '../engine/types'
import type { ChoiceDef, EraDef, EventDef, GameState } from '../engine/types'
import { formatMoney, formatYear, hasKey, nameOf } from '../i18n'
import { Art } from './Art'
import type { ArtCategory } from './Art'
import { attitudeText, diaryText, feelings, useUi } from './text'
import type { Change } from './text'

type Tab = 'life' | 'hero' | 'people' | 'diary'

const AUTO_DELAY = { 1: 2400, 2: 1200, 4: 600 } as const

interface LifeProps {
  state: GameState
  era: EraDef
  onLive: (focus: string | null) => void
  onChoose: (choiceId: string | null) => void
  onDismiss: () => void
  onMenu: () => void
  lastChanges: Change[]
}

export function Life({ state, era, onLive, onChoose, onDismiss, onMenu, lastChanges }: LifeProps) {
  const { t, lang } = useUi()
  const hero = state.hero
  const o = { sex: hero.sex, region: hero.region }
  const coin = regionOf(era, hero.region).coin
  const [tab, setTab] = useState<Tab>('life')
  const focuses = availableFocuses(state, era)
  const [focus, setFocus] = useState<string | null>(state.lastFocus)
  const [auto, setAuto] = useState<0 | 1 | 2 | 4>(0)
  const selected = focuses.find((f) => f.id === focus)?.id ?? null
  const canLive = state.phase === 'year' && (focuses.length === 0 || selected !== null)

  useEffect(() => {
    if (!auto || !canLive || tab !== 'life') return
    const id = setTimeout(() => onLive(selected ?? focuses[0]?.id ?? null), AUTO_DELAY[auto])
    return () => clearTimeout(id)
  })

  const thisYear = hero.diary.filter((d) => d.year === state.year || d.year === addYears(state.year, -1)).slice(-6)
  const stage = stageOf(state, era)

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
        </p>
        <Bar label={t('attr.health')} value={hero.attrs.health} />
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
          {lastChanges.length > 0 && <ChangeList changes={lastChanges} coin={coin} />}
          <h2 class="section-title">{t('life.this_year')}</h2>
          {thisYear.length === 0 ? (
            <p class="muted">{t('life.nothing')}</p>
          ) : (
            <ul class="feed">
              {thisYear.map((d) => (
                <li>{diaryText(t, d, hero.sex, hero.region)}</li>
              ))}
            </ul>
          )}

          {stage === 'infancy' || focuses.length === 0 ? (
            <p class="muted">{t('life.infancy', {}, o)}</p>
          ) : (
            <>
              <h2 class="section-title">{t('life.focus')}</h2>
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

          <div class="actions sticky">
            <button class="primary" disabled={!canLive} onClick={() => onLive(selected)}>
              {t('life.live_year')}
            </button>
            <div class="speed" role="group" aria-label={t('life.auto')}>
              <span class="muted">{t('life.auto')}</span>
              {([0, 1, 2, 4] as const).map((s) => (
                <button class={auto === s ? 'chip active' : 'chip'} aria-pressed={auto === s} onClick={() => setAuto(s)}>
                  {s === 0 ? '❚❚' : `×${s}`}
                </button>
              ))}
            </div>
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
          {hero.diary.length === 0 ? (
            <p class="muted">{t('diary.empty')}</p>
          ) : (
            <ol class="diary">
              {[...hero.diary].reverse().map((d) => (
                <li class={d.major ? 'major' : ''}>
                  <span class="diary-age">{t('diary.age', { n: d.age })}</span>
                  <span>{diaryText(t, d, hero.sex, hero.region)}</span>
                </li>
              ))}
            </ol>
          )}
        </section>
      )}

      {state.phase === 'event' && <EventModal state={state} era={era} onChoose={onChoose} onDismiss={onDismiss} changes={lastChanges} />}
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

function People({ state }: { state: GameState }) {
  const { t, lang } = useUi()
  const hero = state.hero
  const alive = hero.npcs.filter((n) => n.alive)
  const dead = hero.npcs.filter((n) => !n.alive)
  const row = (n: (typeof hero.npcs)[number]) => (
    <li class="person">
      <span class="person-role">{t(`npc.${n.role}`, { sex: n.sex })}</span>
      <span class="person-name">{nameOf(n.name, lang)}</span>
      <span class="muted">
        {n.alive
          ? `${t('life.age', { n: Math.max(0, npcAge(n, state.year)) })} · ${attitudeText(t, n)}`
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

const categoryOf = (ev: EventDef): ArtCategory =>
  ev.dynamic === 'profession' ? 'work' : ev.type === 'global_historical' ? 'global' : ev.type === 'local' ? 'local' : ev.type === 'family' ? 'family' : 'personal'

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
  const outcome = state.queue[0]?.outcome
  const choices = eventChoices(state, era, ev)
  const isProfession = ev.dynamic === 'profession'
  const label = (c: ChoiceDef) => (isProfession ? t(`prof.${c.id}`, {}, o) : t(`ev.${ev.id}.${c.id}`, {}, o))
  const cost = (c: ChoiceDef) => {
    const m = (c.effects ?? []).reduce((sum, e) => sum + ('param' in e && e.param === 'money' && e.delta < 0 ? e.delta : 0), 0)
    return m < 0 ? formatMoney(t, -m, coin) : null
  }
  const resultKey = outcome && outcome.choiceId !== 'ok' && !isProfession ? `ev.${ev.id}.${outcome.choiceId}.${outcome.result}` : null
  const resultText = resultKey && hasKey(lang, resultKey) ? t(resultKey, {}, o) : null

  return (
    <div class="modal-backdrop">
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="ev-title">
        <Art category={categoryOf(ev)} label={t(`ev.${ev.id}.title`, {}, o)} />
        <div class="modal-body">
          <h2 id="ev-title">{t(`ev.${ev.id}.title`, {}, o)}</h2>
          <p class="event-text">{t(`ev.${ev.id}.text`, {}, o)}</p>

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
