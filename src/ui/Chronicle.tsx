// Хроника рода (src/engine/chronicle.ts): поколения, главные события, история имущества, достижения рода
// и карточка рода для публикации (тот же холст, что у карточки жизни - src/ui/shareCard.ts).
import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import { familyChronicle, headlineAchievement } from '../engine/chronicle'
import type { Chronicle as ChronicleData, ChronicleEntry } from '../engine/chronicle'
import type { LifeSummary } from '../engine/types'
import { QUOTES } from '../content/quotes'
import { EXTERNAL, platform } from '../platform'
import { formatMoney, formatYear, nameOf } from '../i18n'
import { ERA_META } from '../content'
import { CARD_SIZES, drawCard } from './shareCard'
import type { CardData, CardFormat } from './shareCard'
import { lifeCardData } from './lifeCard'
import { diaryText, useUi } from './text'
import { Arms } from './Arms'

const SITE_NAME = 'thousands.life'
const SITE = `https://${SITE_NAME}`

/** Монета края (край мог исчезнуть из данных - тогда первого края страны). */
const coinOf = (era: string, region: string) => {
  const regions = ERA_META[era]?.regions ?? []
  return (regions.find((r) => r.id === region) ?? regions[0])?.coin ?? ''
}

export function Chronicle({ memorial, familyId, onOpen, onBack }: { memorial: LifeSummary[]; familyId: string; onOpen: (heroId: string) => void; onBack: () => void }) {
  const { t, lang } = useUi()
  const c = useMemo(() => familyChronicle(memorial, familyId), [memorial, familyId])
  const [sharing, setSharing] = useState(false)
  useEffect(() => {
    platform.track('chronicle_open', { generations: c.generations.length, achievements: c.achievements.filter((a) => a.done).length })
  }, [familyId])
  if (!c.generations.length) return null
  const last = memorial.find((l) => l.heroId === c.generations[c.generations.length - 1].heroId)!
  const house = last.house
  const line = (e: ChronicleEntry) => (
    <li>
      <span class="diary-age">{formatYear(e.year, lang)}</span>
      <span>
        <span class="muted">{nameOf(e.name, lang)}: </span>
        {diaryText(t, e.entry, e.sex, e.entry.reg ?? '', e.entry.rel ?? '', lang)}
      </span>
    </li>
  )
  return (
    <div class="screen chronicle">
      <button class="link back" onClick={onBack}>← {t('common.back')}</button>
      <h1 class="chronicle-title">
        {house && <Arms id={house} size={40} label={t(`house.${house}`)} />}
        {house ? t(`house.${house}`) : t('chronicle.title', { name: nameOf(c.founder, lang) })}
      </h1>
      <p class="small">
        {t('chronicle.summary', { gens: c.generations.length, years: c.span, n: c.descendants, countries: c.countries.map((e) => t(`era.${e}`)).join(', ') })}
      </p>
      <button class="secondary" onClick={() => setSharing(true)}>{t('chronicle.share')}</button>

      <h2 class="section-title">{t('chronicle.achievements')}</h2>
      <ul class="plain dynasty">
        {c.achievements.map((a) => (
          <li class={a.done ? 'done' : 'muted'}>
            {a.done ? '★ ' : '☆ '}
            <strong>{t(`dynasty.${a.id}.title`)}</strong> - {t(`dynasty.${a.id}.desc`, { n: a.need })}
            {!a.done && a.have > 0 && <span class="small"> ({t('chronicle.progress', { have: Math.min(a.have, a.need), need: a.need })})</span>}
          </li>
        ))}
      </ul>

      <h2 class="section-title">{t('chronicle.generations')}</h2>
      <ol class="tree">
        {c.generations.map((g) => (
          <li>
            <button class="tree-row" onClick={() => onOpen(g.heroId)}>
              <span class="muted">
                {t('memorial.generation', { n: g.generation })} · {t(`region.${g.region}`)} · {t(`archetype.${g.archetype}`)}
              </span>
              <span>
                {nameOf(g.name, lang)} · {formatYear(g.birthYear, lang)}–{formatYear(g.deathYear, lang)} · {t('death.lived', { n: g.age })}
              </span>
              <span class="small muted">
                {t('chronicle.gen_line', { n: g.children, money: formatMoney(t, g.wealth, coinOf(g.era, g.region)), losses: g.losses })}
              </span>
            </button>
          </li>
        ))}
      </ol>

      {c.events.length > 0 && (
        <>
          <h2 class="section-title">{t('chronicle.events')}</h2>
          <ul class="feed">{c.events.map(line)}</ul>
        </>
      )}
      {c.property.length > 0 && (
        <>
          <h2 class="section-title">{t('chronicle.property')}</h2>
          <ul class="feed">{c.property.map(line)}</ul>
        </>
      )}
      {sharing && <FamilyShare c={c} last={last} memorial={memorial} onClose={() => setSharing(false)} />}
    </div>
  )
}

/** Карточка рода: фон и портрет - последнего героя, крупно - поколения, годы и потомки, главное достижение. */
function familyCard(c: ChronicleData, last: LifeSummary, memorial: LifeSummary[], t: ReturnType<typeof useUi>['t'], lang: ReturnType<typeof useUi>['lang']): CardData {
  const base = lifeCardData(last, t, lang, {
    quotes: QUOTES,
    playerLine: '',
    site: EXTERNAL ? SITE_NAME : t('share.card.cta_portal'),
    scene: { place: 'landmark', time: 'sunset', people: 3, props: ['sun'] },
  })
  // Портреты - по одному на поколение (последние четыре).
  const portraits = c.generations
    .slice(-4)
    .map((g) => {
      const l = memorial.find((x) => x.heroId === g.heroId)
      if (!l) return undefined
      const p = lifeCardData(l, t, lang, { quotes: [], playerLine: '', site: '', scene: base.scene }).portraits
      const last = p[p.length - 1]
      return last ? { input: last.input, label: nameOf(g.name, lang) } : undefined
    })
    .filter((x): x is CardData['portraits'][number] => !!x)
  const top = headlineAchievement(c)
  const first = c.generations[0]
  const end = c.generations[c.generations.length - 1]
  return {
    ...base,
    name: last.house ? t(`house.${last.house}`) : t('chronicle.card.name', { name: nameOf(c.founder, lang) }),
    meta: `${formatYear(first.birthYear, lang)}–${formatYear(end.deathYear, lang)}`,
    title: t('chronicle.card.title', { gens: c.generations.length }),
    path: c.countries.length > 1 ? c.countries.map((e) => t(`era.${e}`)).join(' → ') : undefined,
    hook: top ? `${t(`dynasty.${top.id}.title`)}: ${t(`dynasty.${top.id}.desc`, { n: top.need })}` : t('chronicle.card.hook', { name: nameOf(end.name, lang) }),
    hook2: undefined,
    portraits: portraits.length ? portraits : base.portraits,
    stats: [
      { value: String(c.generations.length), label: t('chronicle.card.gens') },
      { value: String(c.span), label: t('chronicle.card.years') },
      { value: String(c.descendants), label: t('chronicle.card.children') },
    ],
    ask: t('chronicle.card.ask'),
    ageLine: t('chronicle.card.title', { gens: c.generations.length }),
    years: `${formatYear(first.birthYear, lang)}–${formatYear(end.deathYear, lang)}`,
  }
}

function FamilyShare({ c, last, memorial, onClose }: { c: ChronicleData; last: LifeSummary; memorial: LifeSummary[]; onClose: () => void }) {
  const { t, lang } = useUi()
  const [format, setFormat] = useState<CardFormat>('story')
  const [copied, setCopied] = useState(false)
  const canvas = useRef<HTMLCanvasElement>(null)
  const card = useMemo(() => familyCard(c, last, memorial, t, lang), [c, lang])
  const text = t('chronicle.share_text', { name: nameOf(c.founder, lang), gens: c.generations.length, years: c.span, hook: card.hook })
  const shareText = EXTERNAL ? `${text} ${SITE}` : text
  useEffect(() => {
    platform.track('share_open', { what: 'family' })
  }, [])
  useEffect(() => {
    if (!canvas.current) return
    const el = canvas.current
    const draw = () => drawCard(el, format, card)
    draw()
    if (document.fonts) Promise.all([document.fonts.load("600 40px 'Thousands Letopis'"), document.fonts.load("400 30px 'Alegreya Variable'")]).then(draw, () => {})
  }, [format, lang])
  const blob = () => new Promise<Blob | null>((res) => canvas.current?.toBlob(res, 'image/png'))
  const download = async () => {
    const b = await blob()
    if (!b) return
    const a = document.createElement('a')
    a.href = URL.createObjectURL(b)
    a.download = `thousands-of-lives-family-${format}.png`
    a.click()
    platform.track('share_done', { what: 'family', format, method: 'download' })
    setTimeout(() => URL.revokeObjectURL(a.href), 1000)
  }
  const systemShare = async () => {
    const b = await blob()
    const file = b ? new File([b], 'thousands-of-lives-family.png', { type: 'image/png' }) : null
    const result = await platform.share({ text: shareText, url: EXTERNAL ? SITE : undefined, file: file ?? undefined })
    if (result === 'copied') setCopied(true)
    if (result !== 'failed') platform.track('share_done', { what: 'family', format, method: result === 'shared' ? 'system' : 'copy' })
  }
  const [w, h] = CARD_SIZES[format]
  return (
    <div class="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div class="modal share" role="dialog" aria-modal="true" aria-labelledby="family-share-title">
        <h2 id="family-share-title">{t('chronicle.share')}</h2>
        <div class="choice-row">
          {(['story', 'square', 'wide'] as CardFormat[]).map((f) => (
            <button type="button" class={f === format ? 'option small active' : 'option small'} onClick={() => setFormat(f)}>
              {t(`share.format.${f}`)}
            </button>
          ))}
        </div>
        <canvas ref={canvas} width={w} height={h} class="share-canvas" style={{ width: '100%', height: 'auto' }} />
        <p class="small">{text}</p>
        <div class="choice-row">
          <button class="primary" onClick={systemShare}>{t('actions.share_short')}</button>
          <button class="secondary" onClick={download}>{t('share.download')}</button>
          <button class="link" onClick={onClose}>{t('common.close')}</button>
        </div>
        {copied && <p class="small">{t('share.copied')}</p>}
      </div>
    </div>
  )
}
