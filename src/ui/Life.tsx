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
import { checkAll, contextParams, maritalStatus, npcAge, regionOf, roleKey } from '../engine/rules'
import { isPet } from '../engine/pets'
import LONGEVITY from '../content/longevity.json'
import { ATTRIBUTES } from '../engine/types'
import type { ChoiceDef, DiaryEntry, EraDef, Effect, FocusDef, GameState, Hero, Lang, Npc, SceneTime } from '../engine/types'
import type { AvatarInput } from '../pixel/avatar'
import { formatMoney, formatYear, hasKey, nameOf, variantKey } from '../i18n'
import type { T } from '../i18n'
import { platform } from '../platform'
import { lifeStats } from '../telemetry'
import { Scene } from '../pixel/Scene'
import { moodFor, weatherFor } from '../pixel/season'
import { Avatar } from '../pixel/Avatar'
import { eventCast, eventRoles, familyCast } from './cast'
import { DreamModal } from './Dream'
import type { DreamResult } from './Dream'
import { entryScene } from './Summary'
import { attitudeText, diaryText, feelings, useUi } from './text'
import type { Change } from './text'

type Tab = 'life' | 'hero' | 'people' | 'diary'

/**
 * Длительность года на скорости ×1. Стандартная — из флагов (в раннем детстве короче).
 * Если игрок выбрал свою (до минуты), детство удлиняется в той же пропорции.
 */
function yearMs(age: number, custom?: number): number {
  const f = platform.flags
  const adult = custom ?? f.year_sec
  return (age <= 5 ? (adult * f.year_sec_child) / f.year_sec : adult) * 1000
}
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
  /** На чужбине: «Задумать возвращение». */
  onPlanReturn?: () => void
  onMenu: () => void
  choiceChanges: Change[]
  yearChanges: Change[]
  /** Своя длительность года из настроек (секунды); не задана — стандартная. */
  yearSec?: number
  /** Кнопка музыки. */
  sound?: preact.ComponentChildren
  /** Сон о будущем: ответы, подсказка, «Проснуться», закрыть итог. */
  dream?: { result: DreamResult | null; onAnswer: (value: unknown) => void; onHint: () => void; onWake: () => void; onClose: () => void }
}

/** Видна ли запись дневника: записи текущего года появляются по ходу года. */
function visible(state: GameState, index: number, entry: DiaryEntry, progress: number): boolean {
  if (state.phase !== 'running' || entry.year !== state.year) return true
  const at = state.reveal[index]
  return at === undefined || at <= progress
}

export function Life({ state, era, onStart, onFinish, onChoose, onDismiss, onLifestyle, onPlanReturn, onMenu, choiceChanges, yearChanges, yearSec, sound, dream }: LifeProps) {
  const { t, lang } = useUi()
  const hero = state.hero
  const o = { sex: hero.sex, region: hero.region, religion: hero.religion }
  const coin = regionOf(era, hero.region).coin
  const [tab, setTab] = useState<Tab>('life')
  const focuses = availableFocuses(state, era)
  const [focus, setFocus] = useState<string | null>(state.lastFocus)
  const selected = focuses.find((f) => f.id === focus)?.id ?? focuses.find((f) => f.id === 'work')?.id ?? focuses[0]?.id ?? null
  const [speed, setSpeed] = useState<Speed>(1)
  const [focusOpen, setFocusOpen] = useState(false)
  // Одноразовые подсказки (ТЗ P3): не ставят игру на паузу, закрываются касанием.
  const [hints, setHints] = useState<string[]>(() => (platform.kvGet('thousands.hints') ?? '').split(',').filter(Boolean))
  const [lifeSec, setLifeSec] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setLifeSec((x) => x + 1), 1000)
    return () => clearInterval(id)
  }, [])
  const hintFor = (id: string, when: boolean) => when && !hints.includes(id)
  const closeHint = (id: string) => {
    const next = [...hints, id]
    setHints(next)
    platform.kvSet('thousands.hints', next.join(','))
  }
  const [progress, setProgress] = useState(0)

  const next = state.queue[0]
  // Экран-глава в 16, 30, 45, 60 лет (флаг chapter_ages): год не начинается, пока игрок не нажмёт «Дальше».
  const [, bump] = useState(0)
  // Пока показывается реклама после главы, время стоит.
  const [adOpen, setAdOpen] = useState(false)
  const chapterDue = state.phase === 'year' && platform.flags.chapter_ages.includes(hero.age) && !(lifeStats(state).chapters ?? []).includes(hero.age)
  const closeChapter = () => {
    const s = lifeStats(state)
    s.chapters = [...(s.chapters ?? []), hero.age]
    platform.track('chapter_seen', { age: hero.age })
    setAdOpen(true)
    platform.showInterstitial('F2').finally(() => {
      setAdOpen(false)
      bump((x) => x + 1)
    })
  }
  const modalOpen = (state.phase === 'running' && !!next && progress >= next.at) || chapterDue || adOpen
  // Сигналы платформе: игра идёт, пока время не на паузе или открыто решение события; экран-глава (с рекламой),
  // пауза без решения и уход с экрана жизни — остановка.
  const playing = (speed > 0 || modalOpen) && !chapterDue && !adOpen && state.phase !== 'dead'
  useEffect(() => {
    if (playing) platform.gameplayStart()
    else platform.gameplayStop()
  }, [playing])
  useEffect(() => () => platform.gameplayStop(), [])

  // Часы года. Ссылки на свежие значения, чтобы таймер не держал устаревшие.
  const live = useRef({ state, progress, speed, modalOpen, selected, onStart, onFinish, yearSec })
  live.current = { state, progress, speed, modalOpen, selected, onStart, onFinish, yearSec }
  useEffect(() => {
    const id = setInterval(() => {
      const c = live.current
      if (!c.speed || c.modalOpen || c.state.phase === 'dead') return
      if (c.state.phase === 'year') {
        setProgress(0)
        c.onStart(c.selected)
        return
      }
      const np = c.progress + (TICK_MS * c.speed) / yearMs(c.state.hero.age, c.yearSec)
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
  // В ленте — справки только последнего года с ними, прошлые остаются во вкладке «Дневник».
  const primerYear = Math.max(-Infinity, ...entries.filter(([d]) => d.primer).map(([d]) => d.year))
  const feed = entries.filter(([d]) => !d.primer || d.year === primerYear).slice(-14).reverse()
  // Вверху — дом героя: семья, животные и дом нужного размера; если в этом году случилось бедствие, оно видно на доме.
  const disaster = [...entries]
    .reverse()
    .map(([d]) => (d.year === state.year && d.eventId ? entryScene(d, era).disaster : undefined))
    .find(Boolean)
  const TIMES = ['day', 'dawn', 'day', 'sunset', 'overcast'] as const
  const yearTime: SceneTime = disaster === 'fire' ? 'night' : TIMES[Math.abs(state.year) % TIMES.length]
  const yearScene = { place: 'yard' as const, time: yearTime, props: [yearTime === 'night' ? ('moon' as const) : ('sun' as const)], disaster }
  void stage
  // Время года на картинке двора идёт вместе с полоской года.
  const season = state.phase === 'running' ? progress : 0
  const kids = hero.npcs.filter((n) => n.role === 'child' && n.alive)

  return (
    <div class="life">
      <header class="hero-bar">
        <div class="hero-bar-row">
          <Avatar input={heroLook(hero)} label={t('life.portrait', { n: hero.age }, o)} />
          <div class="hero-bar-info">
            <div class="hero-bar-top">
              <h1 class="hero-name">{nameOf(hero.name, lang)}</h1>
              <div class="hero-bar-actions">
                {sound}
                <button class="link" onClick={onMenu}>{t('life.menu')}</button>
              </div>
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
            {state.offChronicle !== undefined && <p class="hero-meta small muted">{t('life.off_chronicle', { year: formatYear(state.offChronicle, lang) })}</p>}
            {hero.abroad && !hero.abroad.naturalized && <p class="hero-meta small muted">{t(hero.sex === 'f' ? 'life.foreigner_f' : 'life.foreigner', { year: formatYear(hero.abroad.since, lang) })}</p>}
          </div>
        </div>
      </header>

      {hintFor('hero', hero.age >= 12) && tab === 'life' && <Hint text={t('hint.hero')} onClose={() => closeHint('hero')} />}
      {/* Вкладки и скорость — вверху и прилипают при прокрутке: скорость рядом с картинкой, а не под лентой. */}
      <div class="life-top">
        <nav class="tabs" role="tablist">
          {(['life', 'hero', 'people', 'diary'] as Tab[]).map((id) => (
            <button role="tab" aria-selected={tab === id} class={tab === id ? 'tab active' : 'tab'} onClick={() => {
                setTab(id)
                platform.track('tab_open', { tab: id })
              }}>
              {t(`tab.${id}`)}
            </button>
          ))}
        </nav>
        {tab === 'life' && (
          <div class="speed-bar">
            <div class="speed" role="group" aria-label={t('life.speed')}>
              {SPEEDS.map((s) => (
                <button class={speed === s ? 'chip active' : 'chip'} aria-pressed={speed === s} aria-label={s === 0 ? t('life.pause') : `×${s}`} onClick={() => {
                  setSpeed(s)
                  platform.track('speed_change', { speed: s })
                }}>
                  {s === 0 ? '❚❚' : `×${s}`}
                </button>
              ))}
              <button class="chip" onClick={skip} aria-label={t('life.skip')} title={t('life.skip')}>
                ⏭
              </button>
            </div>
            <div class="year-clock" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)} aria-label={t('life.year_progress')}>
              <span class="year-label">{formatYear(state.year, lang)}</span>
              <span class="year-track">
                <span class="year-fill" style={{ width: `${Math.round((state.phase === 'running' ? progress : 0) * 100)}%` }} />
              </span>
            </div>
            {speed === 0 && <p class="small muted center paused-note">{t('life.paused')}</p>}
          </div>
        )}
      </div>
      {tab === 'life' && hintFor('speed', lifeSec >= 3) && <Hint text={t('hint.speed')} onClose={() => closeHint('speed')} />}

      {tab === 'life' && (
        <section class="panel">
          <Scene scene={yearScene} region={hero.region} seed={`${hero.id}:home`} cast={familyCast(state)} paused={speed === 0} season={season} weather={weatherFor(hero.region, season, state.year, hero.id)} mood={moodFor(hero.tags, hero.diary, state.year)} />

          {stage === 'infancy' || focuses.length === 0 ? (
            <p class="muted">{t('life.infancy', {}, o)}</p>
          ) : (
            <FocusPanel
              focuses={focuses}
              selected={selected}
              open={focusOpen}
              onToggle={() => {
                setFocusOpen(!focusOpen)
                if (!focusOpen) platform.track('tab_open', { tab: 'focus' })
              }}
              onPick={setFocus}
              o={o}
              hint={hintFor('focus', hero.age >= 5) ? <Hint text={t('hint.focus', {}, o)} onClose={() => closeHint('focus')} /> : null}
              lifestyle={lifestyleDefs(state, era).length > 0 ? () => setTab('hero') : null}
            />
          )}

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
              {groupPrimers(feed).map((item) => {
                if ('primers' in item) return <PrimerGroup key={item.key} ids={item.primers} o={o} />
                const [d, i] = item
                return (
                <li key={i} class={`${d.news ? 'news' : ''} ${d.major ? 'major' : ''} ${d.year === state.year ? 'now' : ''}`}>
                  <span class="diary-age">{d.news ? t('life.news') : t('diary.age', { n: d.age })}</span>
                  <span>{diaryText(t, d, hero.sex, hero.region, hero.religion, lang)}</span>
                </li>
                )
              })}
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

        </section>
      )}

      {tab === 'hero' && (
        <section class="panel">
          <h2 class="section-title">{t('hero.feelings')}</h2>
          <ul class="plain">{feelings(t, hero).map((f) => <li>{f}</li>)}</ul>
          <p class="small">
            <strong>{t('reveal.faith')}:</strong> <span class="cap">{t(`religion.${hero.religion}`, {}, o)}</span>
            <span class="muted"> — {t(`religion.${hero.religion}.desc`, {}, o)}</span>
          </p>
          <p class="small">
            <strong>{t('hero.family')}:</strong> {maritalText(t, hero, lang, 'marital')}
          </p>
          {hero.abroad && (
            // Чужбина: откуда родом, как вжился, и кнопка «Задумать возвращение».
            <div class="note-box small abroad-box">
              <p>
                {t(hero.abroad.naturalized ? 'abroad.naturalized' : 'abroad.status', {
                  homeland: { key: `era.${hero.abroad.homeland.era}` },
                  year: formatYear(hero.abroad.since, lang),
                  n: state.year - hero.abroad.since,
                }, o)}
              </p>
              <p class="muted">{t('abroad.feel', { i: hero.abroad.integration, h: hero.abroad.homesick, a: hero.abroad.acceptance })}</p>
              {onPlanReturn && !hero.abroad.planned && (
                <button class="secondary" onClick={onPlanReturn}>
                  {t('abroad.plan_return')}
                </button>
              )}
              {hero.abroad.planned && <p>{t('abroad.planned')}</p>}
            </div>
          )}
          <p class="small">
            <strong>{t('hero.home')}:</strong> {t(`home.${hero.home ?? 1}`, {}, o)} · <strong>{t('hero.animals')}:</strong>{' '}
            {hero.animals?.length
              ? hero.animals
                  .map((a) =>
                    // Питомец — с кличкой и возрастом: «пёс Полкан, 7 лет».
                    isPet(a.kind)
                      ? `${t(`pet.${a.kind}`, {}, o)}${a.name ? ` ${nameOf(a.name, lang)}` : ''}${a.born !== undefined ? `, ${t('hero.pet_age', { n: Math.max(0, state.year - a.born) })}` : ''}`
                      : t(`animal.${a.kind}`, {}, o),
                  )
                  .join('; ')
              : t('hero.no_animals')}
          </p>
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
              {groupPrimers([...entries].reverse()).map((item) => {
                if ('primers' in item) return <PrimerGroup key={item.key} ids={item.primers} o={o} />
                const [d, i] = item
                return (
                <li key={i} class={`${d.major ? 'major' : ''} ${d.news ? 'news' : ''}`}>
                  <span class="diary-age">{t('diary.age', { n: d.age })}</span>
                  <span>{diaryText(t, d, hero.sex, hero.region, hero.religion, lang)}</span>
                </li>
                )
              })}
            </ol>
          )}
        </section>
      )}

      {chapterDue && <Chapter state={state} era={era} onNext={closeChapter} />}
      {modalOpen && !chapterDue && !adOpen && dream && (state.dream || dream.result) ? (
        <DreamModal state={state} result={dream.result} onAnswer={dream.onAnswer} onHint={dream.onHint} onWake={dream.onWake} onClose={dream.onClose} />
      ) : (
        modalOpen && !chapterDue && !adOpen && <EventModal state={state} era={era} onChoose={onChoose} onDismiss={onDismiss} changes={choiceChanges} />
      )}
    </div>
  )
}

/** Как выглядит герой на портрете сейчас. */
function heroLook(hero: Hero): AvatarInput {
  return {
    region: hero.region,
    sex: hero.sex,
    age: hero.age,
    seed: hero.id,
    cls: hero.cls,
    body: hero.body ?? 0,
    happiness: hero.hidden.happiness,
    ill: hero.tags.includes('ill'),
    married: hero.npcs.some((n) => n.role === 'spouse'),
    widow: maritalStatus(hero).kind === 'widowed',
    homeRegion: hero.abroad?.homeland.region,
    integrated: !!hero.abroad && (!!hero.abroad.naturalized || hero.abroad.integration >= 60),
    dead: !hero.alive,
    enslaved: hero.tags.includes('enslaved'),
  }
}

/** Порядок кнопок фокуса: самые частые — первыми. */
const FOCUS_ORDER = ['play', 'learn', 'help_family', 'work', 'study', 'family', 'health', 'rest', 'religion', 'trade', 'savings', 'service']
const FOCUS_CHIPS = 6

/**
 * Фокус года над лентой событий. Свёрнуто — до шести коротких кнопок и строка о выбранном;
 * «Подробнее» раскрывает пояснение и все варианты с описаниями.
 */
function FocusPanel({ focuses, selected, open, onToggle, onPick, o, hint, lifestyle }: {
  focuses: FocusDef[]
  selected: string | null
  open: boolean
  onToggle: () => void
  onPick: (id: string) => void
  o: { sex: Hero['sex']; region: string; religion: string }
  hint: preact.ComponentChildren
  lifestyle: (() => void) | null
}) {
  const { t } = useUi()
  const sorted = [...focuses].sort((a, b) => FOCUS_ORDER.indexOf(a.id) - FOCUS_ORDER.indexOf(b.id))
  const more = sorted.length > FOCUS_CHIPS
  let chips = more ? sorted.slice(0, FOCUS_CHIPS - 1) : sorted
  if (selected && !chips.some((f) => f.id === selected)) chips = [...chips.slice(0, chips.length - 1), sorted.find((f) => f.id === selected)!]
  return (
    <section class={open ? 'focus-panel open' : 'focus-panel'} aria-labelledby="focus-title">
      {hint}
      <div class="focus-head">
        <h2 id="focus-title" class="section-title">{t('life.focus_title')}</h2>
        <button class="link small" aria-expanded={open} onClick={onToggle}>
          {open ? t('life.focus_less') : t('life.focus_more')} {open ? '▴' : '▾'}
        </button>
      </div>
      {open ? (
        <>
          <p class="small focus-explain">{t('life.focus_explain')}</p>
          <div class="focus-grid">
            {sorted.map((f) => (
              <button class={f.id === selected ? 'focus active' : 'focus'} aria-pressed={f.id === selected} onClick={() => onPick(f.id)}>
                <span class="focus-name">
                  {f.id === selected && <span aria-hidden="true">✓ </span>}
                  {t(`focus.${f.id}`, {}, o)}
                </span>
                <span class="focus-desc">{t(`focus.${f.id}.desc`, {}, o)}</span>
              </button>
            ))}
          </div>
          <p class="small muted">{t('life.focus_hint')}</p>
          {lifestyle && (
            <button class="link small" onClick={lifestyle}>
              {t('life.lifestyle_link')} →
            </button>
          )}
        </>
      ) : (
        <>
          <div class="focus-chips" role="group" aria-label={t('life.focus_title')}>
            {chips.map((f) => (
              <button class={f.id === selected ? 'focus-chip active' : 'focus-chip'} aria-pressed={f.id === selected} title={t(`focus.${f.id}.desc`, {}, o)} onClick={() => onPick(f.id)}>
                {t(`focus_short.${f.id}`, {}, o)}
              </button>
            ))}
            {more && (
              <button class="focus-chip more" aria-expanded={false} onClick={onToggle}>
                {t('life.focus_others')}
              </button>
            )}
          </div>
          {selected && <p class="small muted focus-now">{t(`focus.${selected}.desc`, {}, o)}</p>}
        </>
      )}
    </section>
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

/** Подсказка: пузырь с текстом, исчезает по касанию. */
function Hint({ text, onClose }: { text: string; onClose: () => void }) {
  return (
    <button class="hint" onClick={onClose}>
      <span>{text}</span>
      <span class="hint-x" aria-hidden="true">✕</span>
    </button>
  )
}

/** Экран-глава: итог прожитого отрезка в 2–3 строках и «Дальше». */
function Chapter({ state, era, onNext }: { state: GameState; era: EraDef; onNext: () => void }) {
  const { t, lang } = useUi()
  const hero = state.hero
  const o = { sex: hero.sex, region: hero.region, religion: hero.religion }
  const ages = platform.flags.chapter_ages
  const from = Math.max(0, ...ages.filter((a) => a < hero.age))
  const spouse = hero.npcs.find((n) => n.role === 'spouse' && n.alive)
  const kids = hero.npcs.filter((n) => n.role === 'child' && n.alive).length
  const best = hero.diary
    .filter((d) => d.age >= from && d.age < hero.age && !d.primer && !d.news && d.key !== 'diary.born' && !d.key.startsWith('diary.stage_') && !(spouse && d.key === 'diary.married'))
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))[0]
  const title = hasKey(lang, `chapter.${hero.age}`) ? t(`chapter.${hero.age}`, {}, o) : t('chapter.other', { n: hero.age }, o)
  return (
    <div class="modal-backdrop">
      <div class="modal chapter" role="dialog" aria-modal="true" aria-labelledby="chapter-title">
        <Scene scene={{ place: 'landmark', time: 'sunset', people: 3, props: ['sun'] }} region={hero.region} seed={`${hero.id}:ch${hero.age}`} cast={familyCast(state)} />
        <div class="modal-body">
          <p class="eyebrow">{t('chapter.eyebrow', { n: hero.age, year: formatYear(state.year, lang) })}</p>
          <h2 id="chapter-title">{title}</h2>
          <p>
            {hero.profession ? t('chapter.work', { prof: t(`prof.${hero.profession}`, {}, o).toLowerCase() }, o) : t('chapter.no_work', {}, o)}{' '}
            {maritalText(t, hero, lang, 'chapter')}{' '}
            {kids > 0 && t('chapter.kids', { n: kids })}
          </p>
          {best && (
            <p class="muted">
              {t('chapter.best')} {diaryText(t, best, hero.sex, hero.region, hero.religion, lang)}
            </p>
          )}
          <button class="primary" onClick={onNext} autoFocus>
            {t('chapter.next')}
          </button>
        </div>
      </div>
    </div>
  )
}

/** Справки «О твоём мире» подряд — одна компактная карточка: заголовок и начало текста в строку, «Читать» раскрывает. Год не останавливается. */
function PrimerGroup({ ids, o }: { ids: string[]; o: { sex: Hero['sex']; region: string; religion: string } }) {
  const { t } = useUi()
  const [open, setOpen] = useState<string | null>(null)
  const read = (id: string) => {
    setOpen(open === id ? null : id)
    if (open !== id) platform.track('tab_open', { tab: 'primer' })
  }
  return (
    <li class="primer">
      <span class="eyebrow">{t('primer.label')}</span>
      <div class="primer-list">
        {ids.map((id) => (
          <div key={id} class={open === id ? 'primer-item open' : 'primer-item'}>
            <button class="primer-row" aria-expanded={open === id} onClick={() => read(id)}>
              <span class="primer-line">
                <strong class="primer-title">{t(`primer.${id}.title`, {}, o)}</strong>
                {open !== id && <span class="primer-peek"> — {t(`primer.${id}.text`, {}, o)}</span>}
              </span>
              <span class="primer-more">{open === id ? '−' : t('primer.read')}</span>
            </button>
            {open === id && <p class="primer-text">{t(`primer.${id}.text`, {}, o)}</p>}
          </div>
        ))}
      </div>
    </li>
  )
}

/** Подряд идущие справки склеиваются в одну группу. */
function groupPrimers(list: (readonly [DiaryEntry, number])[]): (readonly [DiaryEntry, number] | { primers: string[]; key: number })[] {
  const out: (readonly [DiaryEntry, number] | { primers: string[]; key: number })[] = []
  for (const item of list) {
    const last = out[out.length - 1]
    if (item[0].primer && last && 'primers' in last) last.primers.push(item[0].primer)
    else if (item[0].primer) out.push({ primers: [item[0].primer], key: item[1] })
    else out.push(item)
  }
  return out
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
      {/* Цифра — из симуляции (npm run longevity): сколько лет добавляет взрослому бережный образ жизни в этой стране. */}
      <p class="small">{t('lifestyle.bonus', { n: (LONGEVITY.eras as Record<string, { bonus: number }>)[era.id]?.bonus ?? LONGEVITY.bonusMin })}</p>
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

/**
 * Семейное положение словами: для экрана-главы (`chapter.*`, целая фраза) или строки «Семья» во вкладке «Герой» (`marital.*`).
 * Тот, кто был в браке, никогда не «семьи не завёл»: вдовец, вдова, в разводе, снова в браке.
 */
function maritalText(t: T, hero: Hero, lang: Lang, prefix: 'chapter' | 'marital'): string {
  const m = maritalStatus(hero)
  const o = { sex: hero.sex, region: hero.region, religion: hero.religion }
  const params = { who: { name: m.spouse?.name ?? '' }, psex: m.spouse?.sex ?? 'm', year: m.since !== undefined ? formatYear(m.since, lang) : '' }
  const key =
    m.kind === 'never' ? (prefix === 'chapter' ? 'chapter.single' : 'marital.never') : m.kind === 'widowed' && m.widowed > 1 ? `${prefix}.widowed_again` : `${prefix}.${m.kind}`
  return t(key, params, o)
}

function People({ state }: { state: GameState }) {
  const { t, lang } = useUi()
  const hero = state.hero
  const alive = hero.npcs.filter((n) => n.alive && !n.away)
  const far = hero.npcs.filter((n) => n.alive && n.away)
  const dead = hero.npcs.filter((n) => !n.alive)
  const row = (n: Npc) => (
    <li class="person">
      <span class="person-role">{t(`npc.${roleKey(hero.npcs, n)}`, { sex: n.sex })}</span>
      <span class="person-name">{nameOf(n.name, lang)}</span>
      <span class="muted">
        {n.alive && n.away
          ? t(`people.away.${n.away.reason}`, { sex: n.sex, year: formatYear(n.away.since, lang) })
          : n.alive
          ? [
              t('life.age', { n: Math.max(0, npcAge(n, state.year)) }),
              attitudeText(t, n),
              n.profession ? t(`prof.${n.profession}`, {}, { sex: n.sex }).toLowerCase() : '',
              n.married ? t('people.married', { sex: n.sex }) : '',
              ...(n.tags ?? []).filter((tag) => hasKey(lang, `npctag.${tag}`)).map((tag) => t(`npctag.${tag}`, { sex: n.sex })),
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
      {far.length > 0 && (
        <>
          <h2 class="section-title">{t('people.far')}</h2>
          <ul class="people far">{far.map(row)}</ul>
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
  const offered = state.queue[0]?.dream
  useEffect(() => {
    if (offered && ev?.id === 'dream_intro' && !state.queue[0]?.outcome) platform.track('dream_offer', { dream: offered, era: state.hero.era, age: state.hero.age })
  }, [offered])
  if (!ev) return null
  const hero = state.hero
  const o = { sex: hero.sex, region: hero.region, religion: hero.religion }
  const coin = regionOf(era, hero.region).coin
  const active = state.queue[0]
  const outcome = active?.outcome
  const params = { ...contextParams(hero.region, hero.religion, state.year), ...(active ? eventParams(state, active) : {}) }
  const choices = eventChoices(state, era, ev)
  const isProfession = ev.dynamic === 'profession'
  const isName = ev.dynamic === 'name'
  const v = active?.variant
  const label = (c: ChoiceDef) => (isName ? nameOf(c.id, lang) : isProfession ? t(`prof.${c.id}`, {}, o) : t(variantKey(lang, `ev.${ev.id}.${c.id}`, v), params, o))
  const cost = (c: ChoiceDef) => {
    const m = (c.effects ?? []).reduce((sum, e) => sum + ('param' in e && e.param === 'money' && e.delta < 0 ? e.delta : 0), 0)
    return m < 0 ? formatMoney(t, -m, coin) : null
  }
  const resultKey = outcome && outcome.choiceId !== 'ok' && !isProfession && !isName ? variantKey(lang, `ev.${ev.id}.${outcome.choiceId}.${outcome.result}`, v) : null
  const resultText = resultKey && hasKey(lang, resultKey) ? t(resultKey, params, o) : null

  return (
    <div class="modal-backdrop">
      <div class={`modal ${ev.turning ? 'turning' : ''}`} role="dialog" aria-modal="true" aria-labelledby="ev-title">
        <Scene scene={ev.scene ?? { place: 'landmark' }} region={hero.region} seed={ev.id} cast={eventCast(state, active?.npcId, ev.scene?.place, eventRoles(ev), ev.topic === 'work' && (hero.cls === 'trader' || hero.cls === 'craftsman'))} label={t(variantKey(lang, `ev.${ev.id}.title`, v), params, o)} />
        <div class="modal-body">
          {ev.turning && <p class="eyebrow">{t('event.turning')}</p>}
          <h2 id="ev-title">{t(variantKey(lang, `ev.${ev.id}.title`, v), params, o)}</h2>
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
              {outcome.rescued !== undefined && hero.diary[outcome.rescued] && <p>{diaryText(t, hero.diary[outcome.rescued], hero.sex, hero.region, hero.religion, lang)}</p>}
              {changes.length > 0 && <ChangeList changes={changes} coin={coin} />}
              <button class="primary" onClick={onDismiss} autoFocus>{t('event.next')}</button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
