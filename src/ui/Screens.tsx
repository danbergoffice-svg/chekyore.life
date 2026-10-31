import type { ComponentChildren } from 'preact'
import { useEffect, useState } from 'preact/hooks'
import { heirs, inheritanceShare } from '../engine/life'
import { ACHIEVEMENTS } from '../engine/achievements'
import { classKey, descentOf, regionOf, roleKey, yearsBetween } from '../engine/rules'
import { ERA_IDS, ERA_META } from '../content'
import STATS from '../content/stats.json'
import type { EraDef, GameState, Lang, LifeSummary, SceneDef } from '../engine/types'
import { formatMoney, formatYear, LANG_NAMES, LANGS, LOCALE, nameOf, percent } from '../i18n'
import type { Prefs } from '../storage'
import { BIG_DAYS, GIFT_ICON, GIFTS } from '../daily'
import type { Gift } from '../daily'
import { EXTERNAL, platform } from '../platform'
import { Scene } from '../pixel/Scene'
import { Avatar } from '../pixel/Avatar'
import { heroLook } from './Life'
import { VolumeSlider } from './Sound'
import { useUi } from './text'
import { Icon, IconText } from './Icon'

/** Виды для заставки: по региону каждой страны, меняются каждые несколько секунд. */
const TIMES = ['sunset', 'day', 'dawn', 'day', 'night', 'overcast'] as const
const SHOWCASE: { region: string; era: string; scene: SceneDef }[] = ERA_IDS.flatMap((id, i) =>
  ERA_META[id].regions.slice(0, 2).map((r, j) => ({
    region: r.id,
    era: id,
    scene: { place: j === 0 ? 'landmark' : 'street', time: TIMES[(i + j) % TIMES.length], people: 3 + j, props: [TIMES[(i + j) % TIMES.length] === 'night' ? 'moon' : 'sun'] } as SceneDef,
  })),
)

interface MenuProps {
  current: GameState | null
  /** Барабан лотереи рождения - сразу под названием игры, на первом экране. */
  slot: ComponentChildren
  onContinue: () => void
  onFeedback: () => void
  onLang: (lang: Lang) => void
  go: (s: 'memorial' | 'settings' | 'about' | 'awards') => void
  /** Кнопка музыки. */
  sound?: ComponentChildren
}

/** Сколько всего игроков заходило в игру: один запрос за загрузку страницы, число помнится до перезагрузки. */
let playersAsk: Promise<number | null> | null = null
let playersSeen: number | null = null

/** Главный экран (макет A, 28.10): сцена во всю ширину с кнопками поверх, название, барабан с «Дарами»,
 *  «Продолжить» с портретом героя и строка ссылок. Всё, что раньше было ниже, - в «Об игре». */
export function Menu({ current, slot, onContinue, onFeedback, onLang, go, sound }: MenuProps) {
  const { t, lang } = useUi()
  const [shot, setShot] = useState(() => Math.floor(Math.random() * SHOWCASE.length))
  useEffect(() => {
    const id = setInterval(() => setShot((x) => (x + 1) % SHOWCASE.length), 5000)
    return () => clearInterval(id)
  }, [])
  const [players, setPlayers] = useState(playersSeen)
  useEffect(() => {
    playersAsk ??= platform.playersCount()
    playersAsk.then((n) => {
      playersSeen = n
      setPlayers(n)
    })
  }, [])
  const view = SHOWCASE[shot]
  const hero = current?.hero
  const playing = !!current && current.phase !== 'dead' && !!hero
  return (
    <div class="screen menu">
      <header class="menu-hero">
        <Scene scene={view.scene} region={view.region} seed={`menu:${shot}`} label={`${t(`region.${view.region}`)} · ${t(`era.${view.era}.short`)}`} />
        <div class="menu-topbar">
          <span class="badge">{t('beta.badge')}</span>
          <span class="grow" />
          {sound}
          <div class="lang-switch" role="group" aria-label={t('settings.language')}>
            {LANGS.map((l) => (
              <button type="button" class={l === lang ? 'active' : ''} aria-pressed={l === lang} onClick={() => onLang(l)}>
                {l.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
      </header>
      <div class="title-block">
        {/* Длинное название (Thousands of Lives) - мельче, чтобы в одну строку на любом телефоне. */}
        <h1 class={`game-title ${t('app.title').length > 14 ? 'long' : ''}`}>{t('app.title')}</h1>
        <p class="lead">{t('menu.subtitle')}</p>
      </div>

      {slot}

      {playing && hero && (
        <button class="continue-card" onClick={onContinue}>
          <Avatar input={heroLook(hero)} label={t('life.portrait', { n: hero.age })} />
          <span class="continue-text">
            <strong>{t('menu.continue')}</strong>
            <span>
              {nameOf(hero.name, lang)} · {t('life.age', { n: hero.age })} · {t(`region.${hero.region}`)} · {formatYear(current!.year, lang)}
            </span>
          </span>
          <span class="continue-go" aria-hidden="true">›</span>
        </button>
      )}

      <nav class="menu-nav">
        <button class="link" onClick={() => go('memorial')}>{t('menu.nav.memorial')}</button>
        <button class="link" onClick={() => go('awards')}>{t('menu.nav.awards')}</button>
        <button class="link" onClick={() => go('settings')}>{t('menu.nav.settings')}</button>
        <button class="link" onClick={() => go('about')}>{t('menu.nav.about')}</button>
        {EXTERNAL && <button class="link" onClick={onFeedback}>{t('menu.nav.feedback')}</button>}
      </nav>
      {players !== null && <p class="small center players-note">{t('menu.players', { n: players, count: players.toLocaleString(LOCALE[lang]) })}</p>}
      <p class="small muted center beta-note">{t('beta.notice')}</p>
    </div>
  )
}

function Choice<V extends string>(props: { title: string; value: V; options: { id: V; label: string; desc?: string }[]; onChange: (v: V) => void }) {
  return (
    <fieldset class="choice-group">
      <legend>{props.title}</legend>
      {props.options.map((o) => (
        <button type="button" class={o.id === props.value ? 'option active' : 'option'} aria-pressed={o.id === props.value} onClick={() => props.onChange(o.id)}>
          <span class="option-label">{o.label}</span>
          {o.desc && <span class="option-desc">{o.desc}</span>}
        </button>
      ))}
    </fieldset>
  )
}

/** Три самые многолюдные страны: подсказка к режиму «как в жизни». */
function topByPopulation(t: (k: string) => string, lang: Lang): string {
  const total = ERA_IDS.reduce((n, id) => n + ERA_META[id].population, 0)
  return [...ERA_IDS]
    .sort((a, b) => ERA_META[b].population - ERA_META[a].population)
    .slice(0, 3)
    .map((id) => `${t(`era.${id}.short`)} ${percent(Math.round((ERA_META[id].population / total) * 100), lang)}`)
    .join(', ')
}

/** Настройки жизни: лотерея, длина, смертность, тяжёлые сцены. Открываются окном с экрана барабанов. */
/** Варианты страны: жребий или любая из стран игры. */
function countryOptions(t: (k: string) => string) {
  return [
    { id: '', label: t('country.random'), desc: t('country.random.desc') },
    ...ERA_IDS.map((id) => ({ id, label: t(`era.${id}`), desc: t(`era.${id}.years`) })),
  ]
}

export function SetupModal(props: {
  prefs: Prefs
  onPrefs: (p: Prefs) => void
  onClose: () => void
  /** Пробный период: приглашение оставить отзыв - за него страна по выбору на одну жизнь. */
  onFeedback?: () => void
}) {
  const { t, lang } = useUi()
  const p = props.prefs
  return (
    <div class="modal-backdrop" onClick={(e) => e.target === e.currentTarget && props.onClose()}>
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="setup-title">
        <div class="modal-body">
          <h2 id="setup-title">{t('setup.custom')}</h2>
          {props.onFeedback && (
            <div class="choice-group locked-country">
              <p class="small">
                <strong>{t('setup.country')}.</strong> {t('setup.country.locked')}
              </p>
              <button class="secondary" onClick={props.onFeedback}>
                {t('setup.country.feedback')}
              </button>
            </div>
          )}
          <Choice
            title={t('setup.lottery')}
            value={p.lottery}
            onChange={(lottery) => props.onPrefs({ ...p, lottery })}
            options={[
              { id: 'population', label: t('setup.lottery.population'), desc: t('setup.lottery.population.desc', { top: topByPopulation(t, lang) }) },
              { id: 'equal', label: t('setup.lottery.equal'), desc: t('setup.lottery.equal.desc', { n: ERA_IDS.length }) },
            ]}
          />
          <Choice
            title={t('setup.mode')}
            value={p.mode}
            onChange={(mode) => props.onPrefs({ ...p, mode })}
            options={[
              { id: 'quick', label: t('setup.mode.quick'), desc: t('setup.mode.quick.desc') },
              { id: 'full', label: t('setup.mode.full'), desc: t('setup.mode.full.desc') },
            ]}
          />
          <Choice
            title={t('setup.mortality')}
            value={p.mortality}
            onChange={(mortality) => props.onPrefs({ ...p, mortality })}
            options={[
              { id: 'soft', label: t('setup.mortality.soft'), desc: t('setup.mortality.soft.desc') },
              { id: 'historical', label: t('setup.mortality.historical'), desc: t('setup.mortality.historical.desc') },
            ]}
          />
          <label class="toggle">
            <input type="checkbox" checked={p.softenHeavy} onChange={(e) => props.onPrefs({ ...p, softenHeavy: e.currentTarget.checked })} />
            <span>
              <span class="option-label">{t('setup.soften')}</span>
              <span class="option-desc">{t('setup.soften.desc')}</span>
            </span>
          </label>
          <p class="small muted">{t('setup.warning')}</p>
          <button class="primary" onClick={props.onClose}>{t('setup.done')}</button>
        </div>
      </div>
    </div>
  )
}

/** Пробный период, после отзыва: где родиться в следующей жизни. */
export function CountryModal(props: { current?: string; onPick: (era: string | undefined) => void; onClose: () => void; lead?: string }) {
  const { t } = useUi()
  return (
    <div class="modal-backdrop" onClick={(e) => e.target === e.currentTarget && props.onClose()}>
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="country-title">
        <div class="modal-body">
          <h2 id="country-title">{t('country.title')}</h2>
          <p class="small muted">{props.lead ?? t('country.lead')}</p>
          <Choice title={t('setup.country')} value={props.current ?? ''} onChange={(v) => props.onPick(v || undefined)} options={countryOptions(t)} />
          <p class="center">
            <button class="link" onClick={props.onClose}>{t('common.close')}</button>
          </p>
        </div>
      </div>
    </div>
  )
}

/** Испытание после первой жизни: start - новое, retry - не вышло, ждёт в следующей жизни, ready - награда у барабана. */
export function ChallengeCard(props: { kind: 'start' | 'retry' | 'ready'; age: number }) {
  const { t } = useUi()
  return (
    <section class="block challenge-card">
      <h2 class="section-title">{t(props.kind === 'ready' ? 'challenge.ready.title' : 'challenge.title')}</h2>
      <p>{t(`challenge.${props.kind}`, { n: props.age, m: props.age + 1 })}</p>
    </section>
  )
}

/** Дары за вход: календарь недели (сильные дни 1, 4, 7), сегодняшний дар и кнопка «Забрать»; после - что будет завтра. */
export function DailyCard(props: { day: number; claimable: boolean; broken?: boolean; onClaim: () => void; compact?: boolean }) {
  const { t } = useUi()
  const gift = GIFTS[props.day - 1]
  const next = GIFTS[props.day % 7]
  const taken = (n: number) => n < props.day || (!props.claimable && n === props.day)
  return (
    <section class={props.compact ? 'daily-card compact' : 'block daily-card'}>
      {!props.compact && <h2 class="section-title"><Icon name="gift" /> {t('daily.title')}</h2>}
      {!props.compact && <p class="small">{t('daily.lead')}</p>}
      <ol class="daily-days">
        {GIFTS.map((g, i) => (
          <li
            class={[taken(i + 1) && 'taken', i + 1 === props.day && 'today', BIG_DAYS.includes(i + 1) && 'big'].filter(Boolean).join(' ')}
            aria-label={`${t('daily.day', { n: i + 1 })}: ${t(`gift.${g}`)}`}
          >
            <span class="daily-icon"><Icon name={GIFT_ICON[g]} /></span>
            <span class="daily-n" aria-hidden="true">{i + 1}</span>
          </li>
        ))}
      </ol>
      {props.claimable ? (
        <>
          {props.broken && <p class="small muted">{t('daily.broken')}</p>}
          <p>{t('daily.today', { gift: { key: `gift.${gift}` }, desc: { key: `gift.${gift}.desc` } })}</p>
          <button class="primary" onClick={props.onClaim}>
            <Icon name={GIFT_ICON[gift]} /> {t('daily.claim', { n: props.day })}
          </button>
        </>
      ) : (
        <p>
          {t('daily.got')} <strong>{props.day === 7 ? t('daily.week') : t('daily.tomorrow', { gift: { key: `gift.${next}` } })}</strong>
        </p>
      )}
    </section>
  )
}


/** Панель «Дары» снизу: всё, что изменит следующую жизнь, - в одном месте (макет A). Разделы показываются, только
 *  когда им есть что сказать: царская семья, выбор судьбы за испытание, дары за вход, страна по дару, остальные дары
 *  этой жизни и «На главный экран». */
export function GiftsSheet(props: {
  onClose: () => void
  royal?: 'install' | 'daily'
  fate?: ComponentChildren
  daily?: ComponentChildren
  dailyDay?: number
  country?: { value: string | null; onPick: () => void }
  gifts: Gift[]
  install?: ComponentChildren
}) {
  const { t } = useUi()
  const others = props.gifts.filter((g) => g !== 'country' && g !== 'royal')
  return (
    <div class="sheet-backdrop" onClick={(e) => e.target === e.currentTarget && props.onClose()}>
      <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="gifts-title">
        <div class="sheet-handle" aria-hidden="true" />
        <div class="sheet-head">
          <h2 id="gifts-title"><Icon name="gift" /> {t('gifts.sheet')}</h2>
          <button class="link sheet-x" aria-label={t('common.close')} onClick={props.onClose}>×</button>
        </div>
        {props.royal && (
          <section class="sheet-sec">
            <h3><Icon name="crown" /> {t('gift.royal')}</h3>
            <p>{t(props.royal === 'install' ? 'royal.note' : 'royal.note.daily')}</p>
          </section>
        )}
        {props.fate && <section class="sheet-sec">{props.fate}</section>}
        {props.daily && (
          <section class="sheet-sec">
            <h3>
              <Icon name="gift" /> {t('daily.title')}
              {props.dailyDay !== undefined && <span class="sub"><IconText text={t('gifts.daily.sub', { n: props.dailyDay })} /></span>}
            </h3>
            {props.daily}
          </section>
        )}
        {props.country && (
          <section class="sheet-sec">
            <h3><Icon name={GIFT_ICON.country} /> {t('gift.country')}</h3>
            <button class="sheet-pick" onClick={props.country.onPick}>
              <b>{props.country.value ? t(`era.${props.country.value}`) : t('gifts.country.none')}</b>
              <span>{t(props.country.value ? 'gifts.change' : 'gifts.choose')} ›</span>
            </button>
          </section>
        )}
        {others.length > 0 && (
          <section class="sheet-sec">
            <h3>{t('gifts.active')}</h3>
            <ul class="sheet-gifts">
              {others.map((g) => (
                <li>
                  <span class="gift-icon"><Icon name={GIFT_ICON[g]} /></span>
                  <span>
                    <b>{t(`gift.${g}`)}</b>
                    <span class="muted small"> - {t(`gift.${g}.desc`)}</span>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
        {props.install && (
          <section class="sheet-sec">
            <h3><Icon name="phone" /> {t('install.title')}</h3>
            {props.install}
          </section>
        )}
        <button class="primary sheet-done" onClick={props.onClose}>{t('gifts.done')}</button>
      </div>
    </div>
  )
}

/** «На главный экран»: Android - системное окно, iPhone - подсказка, как добавить из Safari. */
export function InstallCard(props: { kind: 'prompt' | 'ios'; reward?: boolean; onInstall: () => void; onLater: () => void; onDone: () => void; compact?: boolean }) {
  const { t } = useUi()
  return (
    <section class={props.compact ? 'install-card compact' : 'block install-card'}>
      {!props.compact && <h2 class="section-title"><Icon name="phone" /> {t('install.title')}</h2>}
      <p>{t('install.text')}</p>
      {props.kind === 'ios' && <p class="small">{t('install.ios')}</p>}
      {props.reward && <p class="install-reward"><IconText text={t(props.kind === 'ios' ? 'install.reward.ios' : 'install.reward')} /></p>}
      <div class="row">
        {props.kind === 'prompt' ? (
          <button class="primary" onClick={props.onInstall}>{t('install.go')}</button>
        ) : (
          <button class="primary" onClick={props.onDone}>{t('install.ok')}</button>
        )}
        <button class="link" onClick={props.onLater}>{t('install.later')}</button>
      </div>
    </section>
  )
}

/** Награда за испытание - у барабана: знатная семья, страна по выбору или жребий. */
export function FatePicker(props: { pick: string | null; onPick: (kind: 'high' | 'country' | null) => void }) {
  const { t } = useUi()
  const country = props.pick && props.pick !== 'high' ? props.pick : null
  return (
    <div class="fate-picker" role="group" aria-labelledby="fate-title">
      <p id="fate-title" class="fate-title"><Icon name="trophy" /> {t('fate.title')}</p>
      <div class="fate-options">
        <button class={props.pick === 'high' ? 'option active' : 'option'} aria-pressed={props.pick === 'high'} onClick={() => props.onPick('high')}>
          <span class="option-label">{t('fate.high')}</span>
        </button>
        <button class={country ? 'option active' : 'option'} aria-pressed={!!country} onClick={() => props.onPick('country')}>
          <span class="option-label">{country ? t(`era.${country}.short`) : t('fate.country')}</span>
        </button>
        <button class={!props.pick ? 'option active' : 'option'} aria-pressed={!props.pick} onClick={() => props.onPick(null)}>
          <span class="option-label">{t('fate.none')}</span>
        </button>
      </div>
    </div>
  )
}

export function Reveal(props: { state: GameState; era: EraDef; onStart: () => void; note?: string }) {
  const { t, lang } = useUi()
  const hero = props.state.hero
  const o = { sex: hero.sex, region: hero.region, religion: hero.religion }
  const father = hero.npcs.find((n) => n.role === 'father')
  const mother = hero.npcs.find((n) => n.role === 'mother')
  const siblings = hero.npcs.filter((n) => n.role === 'sibling' && n.alive).length
  const isHeir = hero.generation > 1
  const coin = regionOf(props.era, hero.region).coin
  return (
    <div class="screen reveal">
      <Scene
        scene={isHeir ? { place: 'landmark', time: 'day', people: 3, props: ['sun'] } : { place: 'home', time: 'dawn', people: 3, props: ['cradle', 'lamp'] }}
        region={hero.region}
        seed={hero.id}
      />
      <p class="eyebrow">{isHeir ? t('reveal.heir') : t('reveal.born', {}, o)}</p>
      <h1 class="hero-name big">{nameOf(hero.name, lang)}</h1>
      <dl class="facts">
        <dt>{t('reveal.era')}</dt>
        <dd>{t(`era.${hero.era}`)}</dd>
        <dt>{t('reveal.place')}</dt>
        <dd>{t(`region.${hero.region}`)}</dd>
        <dt>{t('reveal.year')}</dt>
        <dd>{formatYear(hero.birthYear, lang)}{isHeir ? ` · ${t('life.age', { n: hero.age })}` : ''}</dd>
        <dt>{t('reveal.class')}</dt>
        <dd>{t(`class.${classKey(hero.cls, hero.tags)}`, {}, o)}</dd>
        <dt>{t('reveal.faith')}</dt>
        <dd>
          <span class="cap">{t(`religion.${hero.religion}`, {}, o)}</span>
          <span class="muted small"> - {t(`religion.${hero.religion}.desc`, {}, o)}</span>
        </dd>
        <dt>{t('reveal.family')}</dt>
        <dd>
          {father && `${t('reveal.father')}: ${nameOf(father.name, lang)}${father.alive ? '' : ' †'}`}
          <br />
          {mother && `${t('reveal.mother')}: ${nameOf(mother.name, lang)}${mother.alive ? '' : ' †'}`}
          <br />
          {siblings > 0 ? t('reveal.siblings', { n: siblings }) : t('reveal.no_siblings')}
        </dd>
        <dt>{t('reveal.traits')}</dt>
        <dd>{hero.traits.map((tr) => t(`trait.${tr}`)).join(', ')}</dd>
        {isHeir && (
          <>
            <dt>{t('heirs.share')}</dt>
            <dd>{formatMoney(t, hero.money, coin)}</dd>
          </>
        )}
      </dl>
      <p class="intro">{t(`region.${hero.region}.intro`)}</p>
      {props.note && <p class="challenge-note"><Icon name="trophy" /> {props.note}</p>}
      <button class="primary" onClick={props.onStart}>{t('reveal.start')}</button>
    </div>
  )
}

export function Heirs(props: { state: GameState; era: EraDef; onChoose: (id: string) => void; onBack: () => void }) {
  const { t, lang } = useUi()
  const coin = regionOf(props.era, props.state.hero.region).coin
  const npcs = props.state.hero.npcs
  const list = heirs(props.state)
  const gen = list.length ? descentOf(npcs, list[0]) : 1
  return (
    <div class="screen">
      <button class="link back" onClick={props.onBack}>← {t('common.back')}</button>
      <h1>{t('heirs.title')}</h1>
      <p class="lead">{t(gen === 3 ? 'heirs.lead_great' : gen === 2 ? 'heirs.lead_grand' : 'heirs.lead')}</p>
      <ul class="cards">
        {list.map((k) => {
          const age = yearsBetween(k.birthYear, props.state.year)
          // У внука - чей он: «сын Таро (†1240)».
          const via = gen > 1 ? npcs.find((n) => n.id === k.parentId) : undefined
          return (
            <li class="card">
              <h2>
                {nameOf(k.name, lang)} <span class="muted">· {t(`npc.${roleKey(npcs, k)}`, { sex: k.sex })}</span>
              </h2>
              {via && (
                <p class="muted small">
                  {t('heirs.via', { sex: k.sex, who: `${nameOf(via.name, lang)}${via.alive ? '' : ` †${formatYear(via.deathYear ?? props.state.year, lang)}`}` })}
                </p>
              )}
              <p class="muted">
                {t('heirs.age', { n: age })} · {k.traits.map((tr) => t(`trait.${tr}`)).join(', ')}
              </p>
              <p>
                {t('heirs.share')}: {formatMoney(t, inheritanceShare(props.state, props.era, k), coin)}
              </p>
              <button class="primary" onClick={() => props.onChoose(k.id)}>{t('heirs.choose', { sex: k.sex })}</button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

export function Memorial(props: { memorial: LifeSummary[]; onOpen: (heroId: string) => void; onBack: () => void }) {
  const { t, lang } = useUi()
  const families = new Map<string, LifeSummary[]>()
  for (const l of props.memorial) families.set(l.familyId, [...(families.get(l.familyId) ?? []), l])
  return (
    <div class="screen">
      <button class="link back" onClick={props.onBack}>← {t('common.back')}</button>
      <h1>{t('memorial.title')}</h1>
      {props.memorial.length === 0 && <p class="muted">{t('memorial.empty')}</p>}
      {[...families.entries()].reverse().map(([id, lives]) => (
        <section class="family" key={id}>
          <h2 class="section-title">
            {t('memorial.family')} {nameOf(lives[0].name, lang)} · {t('memorial.lives', { n: lives.length })}
          </h2>
          <ol class="tree">
            {lives.map((l) => (
              <li>
                <button class="tree-row" onClick={() => props.onOpen(l.heroId)}>
                  <span class="muted">
                    {t('memorial.generation', { n: l.generation })} · {t(`region.${l.region}`)} · {t(`archetype.${l.report.pattern.code}`)}
                  </span>
                  <span>
                    {nameOf(l.name, lang)} · {formatYear(l.birthYear, lang)} - {formatYear(l.deathYear, lang)} · {t('death.lived', { n: l.age })}
                  </span>
                  {/* Род дошёл до конца хроники страны и ждёт следующей эпохи. */}
                  {l === lives[lives.length - 1] && l.diary.some((d) => d.key === 'diary.era_end') && <span class="small era-badge">{t('era_end.badge')}</span>}
                </button>
              </li>
            ))}
          </ol>
        </section>
      ))}
    </div>
  )
}

/** Варианты длительности года в настройках: 0 - стандартная, остальное - секунды, до минуты. */
const YEAR_SECS = [0, 20, 30, 45, 60]

export function Settings(props: {
  prefs: Prefs
  onPrefs: (p: Prefs) => void
  onReset: () => Promise<void>
  onExport: () => void
  onImport: (file: File) => Promise<boolean>
  onBack: () => void
}) {
  const { t } = useUi()
  const p = props.prefs
  const [confirm, setConfirm] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  return (
    <div class="screen">
      <button class="link back" onClick={props.onBack}>← {t('common.back')}</button>
      <h1>{t('settings.title')}</h1>
      <Choice title={t('settings.language')} value={p.lang} onChange={(lang) => props.onPrefs({ ...p, lang })} options={LANGS.map((l) => ({ id: l, label: LANG_NAMES[l] }))} />
      <fieldset class="choice-group">
        <legend>{t('settings.music')}</legend>
        <label class="toggle">
          <input type="checkbox" checked={p.sound ?? true} onChange={(e) => props.onPrefs({ ...p, sound: e.currentTarget.checked })} />
          <span class="option-label">{t('settings.music.on')}</span>
          <span class="option-desc">{t('settings.music.desc')}</span>
        </label>
        <VolumeSlider on={p.sound ?? true} volume={p.volume ?? 0.5} onChange={(sound, volume) => props.onPrefs({ ...p, sound, volume })} />
      </fieldset>
      <Choice
        title={t('settings.font')}
        value={p.font}
        onChange={(font) => props.onPrefs({ ...p, font })}
        options={(['s', 'm', 'l'] as const).map((f) => ({ id: f, label: t(`settings.font.${f}`) }))}
      />
      {/* Тема (светлая/тёмная) убрана: оформление «синяя ночь» одно на всех (src/skin.css). */}
      <Choice
        title={t('settings.year')}
        value={String(p.yearSec ?? 0)}
        onChange={(v) => props.onPrefs({ ...p, yearSec: Number(v) || undefined })}
        options={YEAR_SECS.map((n) =>
          n === 0
            ? { id: '0', label: t('settings.year.auto'), desc: t('settings.year.auto.desc', { n: platform.flags.year_sec }) }
            : { id: String(n), label: n === 60 ? t('settings.year.min') : t('settings.year.sec', { n }) },
        )}
      />
      <label class="toggle">
        <input type="checkbox" checked={p.contrast} onChange={(e) => props.onPrefs({ ...p, contrast: e.currentTarget.checked })} />
        <span class="option-label">{t('settings.contrast')}</span>
      </label>
      <label class="toggle">
        <input type="checkbox" checked={p.softenHeavy} onChange={(e) => props.onPrefs({ ...p, softenHeavy: e.currentTarget.checked })} />
        <span>
          <span class="option-label">{t('setup.soften')}</span>
          <span class="option-desc">{t('setup.soften.desc')}</span>
        </span>
      </label>

      <h2 class="section-title">{t('settings.saves')}</h2>
      <p class="small muted">{t('settings.saves.desc')}</p>
      <div class="stack">
        <button class="secondary" onClick={props.onExport}>{t('settings.export')}</button>
        <label class="secondary file-button">
          {t('settings.import')}
          <input
            type="file"
            accept="application/json,.json"
            onChange={async (e) => {
              const file = e.currentTarget.files?.[0]
              if (file) setMessage((await props.onImport(file)) ? t('settings.import.done') : t('settings.import.error'))
            }}
          />
        </label>
        {!confirm ? (
          <button class="danger" onClick={() => setConfirm(true)}>{t('settings.reset')}</button>
        ) : (
          <div class="confirm">
            <p>{t('settings.reset.confirm')}</p>
            <button
              class="danger"
              onClick={async () => {
                await props.onReset()
                setConfirm(false)
                setMessage(t('settings.reset.done'))
              }}
            >
              {t('settings.reset.yes')}
            </button>
            <button class="secondary" onClick={() => setConfirm(false)}>{t('settings.reset.no')}</button>
          </div>
        )}
        {message && <p role="status">{message}</p>}
      </div>
    </div>
  )
}

export function About(props: { onBack: () => void }) {
  const { t } = useUi()
  return (
    <div class="screen prose">
      <button class="link back" onClick={props.onBack}>← {t('common.back')}</button>
      <h1>{t('about.title')}</h1>
      <p>{t('about.body1')}</p>
      <p>{t('about.body2')}</p>
      <p>{t('about.body3')}</p>
      <p class="note-box">{t(EXTERNAL ? 'about.beta' : 'about.beta_portal')}</p>
      <h2 class="section-title">{t('menu.how')}</h2>
      <ol class="how">
        {[1, 2, 3, 4].map((i) => (
          <li>
            <strong>{t(`menu.how.${i}.title`)}</strong>
            <span>{t(`menu.how.${i}.text`)}</span>
          </li>
        ))}
      </ol>
      <h2 class="section-title">{t('menu.eras')}</h2>
      <p class="muted small">{t('menu.eras.lead')}</p>
      <ol class="eras">
        {ERA_IDS.map((id) => (
          <li class="open">
            <span class="era-name">{t(`era.${id}`)}</span>
            <span class="muted small">
              {t(`era.${id}.years`)} · {ERA_META[id].regions.map((r) => t(`region.${r.id}`)).join(', ')}
            </span>
          </li>
        ))}
      </ol>
      <h2 class="section-title">{t('menu.inside')}</h2>
      <ul class="stats">
        <li><strong>{STATS.events}</strong> {t('menu.stat.events')}</li>
        <li><strong>{STATS.history}</strong> {t('menu.stat.history')}</li>
        <li><strong>{STATS.news}</strong> {t('menu.stat.news')}</li>
        <li><strong>{STATS.religions}</strong> {t('menu.stat.religions')}</li>
      </ul>
      <h2 class="section-title">{t('about.sources')}</h2>
      <ul>
        {[1, 2, 3, 4, 5].map((i) => <li>{t(`about.source.${i}`)}</li>)}
      </ul>
      <p class="small muted">{t(EXTERNAL ? 'about.privacy' : 'about.privacy_portal')}</p>
    </div>
  )
}
