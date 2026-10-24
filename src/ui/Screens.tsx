import { useState } from 'preact/hooks'
import { heirs, inheritanceShare } from '../engine/life'
import { regionOf, yearsBetween } from '../engine/rules'
import type { EraDef, GameState, LifeSummary } from '../engine/types'
import { formatMoney, formatYear, LANGS, nameOf } from '../i18n'
import type { Prefs } from '../storage'
import { Scene } from '../pixel/Scene'
import { useUi } from './text'

export function Menu(props: { canContinue: boolean; onNew: () => void; onContinue: () => void; go: (s: 'memorial' | 'settings' | 'about') => void }) {
  const { t } = useUi()
  return (
    <div class="screen menu">
      <div class="title-block">
        <span class="badge">{t('beta.badge')}</span>
        <h1 class="game-title">{t('app.title')}</h1>
        <p class="lead">{t('app.tagline')}</p>
      </div>
      <div class="stack">
        {props.canContinue && <button class="primary" onClick={props.onContinue}>{t('menu.continue')}</button>}
        <button class={props.canContinue ? 'secondary' : 'primary'} onClick={props.onNew}>{t('menu.new')}</button>
        <button class="secondary" onClick={() => props.go('memorial')}>{t('menu.memorial')}</button>
        <button class="secondary" onClick={() => props.go('settings')}>{t('menu.settings')}</button>
        <button class="link" onClick={() => props.go('about')}>{t('menu.about')}</button>
      </div>
      <p class="small muted">{t('beta.notice')}</p>
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

export function Setup(props: { prefs: Prefs; onPrefs: (p: Prefs) => void; onStart: () => void; onBack: () => void }) {
  const { t } = useUi()
  const p = props.prefs
  return (
    <div class="screen">
      <button class="link back" onClick={props.onBack}>← {t('common.back')}</button>
      <h1>{t('setup.title')}</h1>
      <p class="lead">{t('setup.lead')}</p>
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
      <button class="primary" onClick={props.onStart}>{t('setup.start')}</button>
    </div>
  )
}

export function Reveal(props: { state: GameState; era: EraDef; onStart: () => void }) {
  const { t, lang } = useUi()
  const hero = props.state.hero
  const o = { sex: hero.sex }
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
        <dd>{t(`class.${hero.cls}`, {}, o)}</dd>
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
      <button class="primary" onClick={props.onStart}>{t('reveal.start')}</button>
    </div>
  )
}

export function Heirs(props: { state: GameState; era: EraDef; onChoose: (id: string) => void; onBack: () => void }) {
  const { t, lang } = useUi()
  const coin = regionOf(props.era, props.state.hero.region).coin
  return (
    <div class="screen">
      <button class="link back" onClick={props.onBack}>← {t('common.back')}</button>
      <h1>{t('heirs.title')}</h1>
      <p class="lead">{t('heirs.lead')}</p>
      <ul class="cards">
        {heirs(props.state).map((k) => {
          const age = yearsBetween(k.birthYear, props.state.year)
          return (
            <li class="card">
              <h2>
                {nameOf(k.name, lang)} <span class="muted">· {t(`npc.child`, { sex: k.sex })}</span>
              </h2>
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
                    {nameOf(l.name, lang)} · {formatYear(l.birthYear, lang)} — {formatYear(l.deathYear, lang)} · {t('death.lived', { n: l.age })}
                  </span>
                </button>
              </li>
            ))}
          </ol>
        </section>
      ))}
    </div>
  )
}

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
      <Choice title={t('settings.language')} value={p.lang} onChange={(lang) => props.onPrefs({ ...p, lang })} options={LANGS.map((l) => ({ id: l, label: l === 'ru' ? 'Русский' : 'English' }))} />
      <Choice
        title={t('settings.font')}
        value={p.font}
        onChange={(font) => props.onPrefs({ ...p, font })}
        options={(['s', 'm', 'l'] as const).map((f) => ({ id: f, label: t(`settings.font.${f}`) }))}
      />
      <Choice
        title={t('settings.theme')}
        value={p.theme}
        onChange={(theme) => props.onPrefs({ ...p, theme })}
        options={(['auto', 'light', 'dark'] as const).map((f) => ({ id: f, label: t(`settings.theme.${f}`) }))}
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
      <p class="note-box">{t('about.beta')}</p>
      <h2 class="section-title">{t('about.sources')}</h2>
      <ul>
        {[1, 2, 3, 4, 5].map((i) => <li>{t(`about.source.${i}`)}</li>)}
      </ul>
      <p class="small muted">{t('about.privacy')}</p>
    </div>
  )
}
