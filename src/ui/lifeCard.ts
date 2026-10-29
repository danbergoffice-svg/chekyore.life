// Данные карточки «Поделиться» из итогов жизни: главное дело, самый яркий факт, афоризм под эту жизнь,
// портреты героя по возрастам. Рисует карточку shareCard.ts.
import { ERA_FOLDER, ERA_META } from '../content'
import { dreamDef } from '../engine/dreams'
import { lifeHighlights, lifeThemes, outlivedShare, rankQuotes } from '../engine/highlights'
import type { Quote } from '../engine/highlights'
import { classKey } from '../engine/rules'
import type { Lang, LifeSummary, SceneDef } from '../engine/types'
import { LOCALE, nameOf } from '../i18n'
import type { T } from '../i18n'
import { lifeMarks } from '../pixel/avatar'
import type { AvatarInput } from '../pixel/avatar'
import type { CardData } from './shareCard'

/** Портрет героя в этом возрасте — по истории жизни, без хранения картинок. */
export function portraitInput(life: LifeSummary, age: number, last: boolean): AvatarInput {
  const y = life.history.find((h) => h.age === age)
  const birthCls = life.report.facts.birthCls ?? life.cls
  return {
    region: life.region,
    sex: life.sex,
    age,
    seed: life.heroId,
    cls: age < 18 ? birthCls : life.cls,
    happiness: y?.happiness,
    stress: y?.stress,
    ill: last && (y?.health ?? 100) < 25,
    married: age >= 20 && life.npcs.some((n) => n.role === 'spouse'),
    ...lifeMarks(life.diary, life.traits ?? [], age),
  }
}

/** Возрасты для ленты портретов: детство, юность, зрелость, старость — и последний год. */
export function portraitAges(life: LifeSummary, max = 6): number[] {
  const ages = [7, 17, 32, 50, 65, 80].filter((a) => a < life.age - 2)
  if (life.age >= 1) ages.push(life.age)
  return ages.slice(-max)
}

/** Годы жизни коротко: «1328–1415», «350–280 до н. э.». */
function span(from: number, to: number, lang: Lang): string {
  if (lang === 'tr') return from < 0 && to < 0 ? `MÖ ${-from}–${-to}` : from < 0 ? `MÖ ${-from} – MS ${to}` : `${from}–${to}`
  const bc = lang === 'ru' ? ' до н. э.' : ' BC'
  if (from < 0 && to < 0) return `${-from}–${-to}${bc}`
  if (from < 0) return lang === 'ru' ? `${-from} до н. э. – ${to} н. э.` : `${-from} BC – AD ${to}`
  return `${from}–${to}`
}

export function lifeCardData(
  life: LifeSummary,
  t: T,
  lang: Lang,
  opts: { quotes: Quote[]; playerLine: string; site: string; scene: SceneDef; dream?: boolean },
): CardData {
  // Заглавная — по правилам языка (турецкое i → İ).
  const cap = (s: string) => (s ? s[0].toLocaleUpperCase(lang) + s.slice(1) : s)
  const o = { sex: life.sex, region: life.region, religion: life.religion }
  const f = life.report.facts
  const title = life.profession
    ? cap(t(`prof.${life.profession}`, {}, o))
    : life.age < 15
      ? t('card.child', { cls: { key: `class.${classKey(f.birthCls ?? life.cls, life.tags)}.family` } }, o)
      : cap(t(`class.${classKey(life.cls, life.tags)}`, {}, o))
  const highlights = lifeHighlights(life)
  const hooks = highlights.map((h) => cap(t(h.key, h.params ?? {}, o)))
  // Путь по сословию — если положение изменилось, а факт об этом ещё не сказал.
  const said = highlights[0]?.key.startsWith('hook.rise') || highlights[0]?.key === 'hook.freed'
  const changed = f.birthCls && f.birthCls !== life.cls && !said
  const path = changed ? `${t(`class.${f.birthCls}`, {}, o)} → ${t(`class.${classKey(life.cls, life.tags)}`, {}, o)}` : undefined
  const ds = opts.dream ? life.dreamSeen : undefined
  const themes = ds ? { dream: 3, reason: 2, learning: 2, fate: 1 } : lifeThemes(life)
  const quotes = rankQuotes(life, opts.quotes, ERA_FOLDER[life.era] ?? '', themes)
    .slice(0, 8)
    .map((q) => (lang === 'ru' ? { text: `«${q.ru}»`, author: q.author_ru } : lang === 'tr' && q.tr ? { text: `“${q.tr}”`, author: q.author_tr ?? q.author_en } : { text: `“${q.en}”`, author: q.author_en }))
  const ages = portraitAges(life)
  let hook = hooks[0]
  let hook2 = highlights[1] && highlights[1].score >= 50 ? hooks[1] : undefined
  if (ds) {
    const subject = t(`share.dream.subject.${dreamDef(ds.id)?.subject ?? 'math'}`)
    hook = t(`share.dream.${ds.outcome === 'partial' && ds.known ? 'known' : ds.outcome}`, { subject }, o)
    hook2 = `${t(`dream.${ds.id}.title`)} — ${t(`dream.result.${ds.outcome}`)}`
  }
  // Три крупные цифры: семья, сколько ровесников прожили меньше, богатство в монетах края.
  const coin = ERA_META[life.era]?.regions.find((r) => r.id === life.region)?.coin
  const wealth = Math.max(0, f.wealth)
  const stats = [
    { value: `${f.children} · ${f.grandchildren}`, label: t('card.stat.family') },
    { value: `${outlivedShare(life)}%`, label: t('card.stat.outlived') },
    ...(coin ? [{ value: wealth.toLocaleString(LOCALE[lang]), label: t(`coin.${coin}`, { n: wealth }) }] : []),
  ]
  return {
    brand: t('app.title'),
    stats,
    name: nameOf(life.name, lang),
    meta: `${t('life.age', { n: life.age })} · ${span(life.birthYear, life.deathYear, lang)} · ${t(`region.${life.region}`)}, ${t(`era.${life.era}.short`)}`,
    title,
    path,
    hook,
    hook2,
    quotes,
    portraits: ages.map((age, i) => ({ input: portraitInput(life, age, i === ages.length - 1), label: t('summary.portrait_age', { n: age }) })),
    playerLine: opts.playerLine ? (lang === 'ru' ? `«${opts.playerLine}»` : `“${opts.playerLine}”`) : '',
    cta: t('card.cta'),
    site: opts.site,
    region: life.region,
    seed: life.heroId,
    scene: opts.scene,
  }
}
