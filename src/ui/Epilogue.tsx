// Экран после смерти (выбор владельца 02.11 - смесь вариантов «Прощание» и «Истории», макеты tools/mockups/death.html):
// сверху надгробие с портретом и годами, ниже - яркие карточки-факты (листаются как сторис), слова родных у могилы,
// что осталось после героя и 100 ровесников человечками вместо графика.
import { useState } from 'preact/hooks'
import type { DiaryEntry, EraDef, LifeSummary, Npc, SceneDef } from '../engine/types'
import { AXES } from '../engine/types'
import { classKey, npcAge, regionOf, roleKey } from '../engine/rules'
import { lifeHighlights, outlivedShare } from '../engine/highlights'
import { formatMoney, formatYear, hasKey, nameOf, variantKey } from '../i18n'
import type { T } from '../i18n'
import type { Lang } from '../engine/types'
import { Scene } from '../pixel/Scene'
import { Avatar } from '../pixel/Avatar'
import type { AvatarInput } from '../pixel/avatar'
import { portraitAges, portraitInput } from './lifeCard'
import { diaryText, useUi } from './text'
import { Icon } from './Icon'

/** Текст записи для карточки: у решения - чем оно кончилось (если такой текст есть), иначе - строка дневника. */
export function storyText(t: T, e: DiaryEntry, life: LifeSummary, lang: Lang): string {
  const o = { sex: life.sex, region: e.reg ?? life.region, religion: e.rel ?? life.religion }
  const choice = e.params?.choice
  if (e.key.startsWith('ev.') && choice && typeof choice === 'object' && 'key' in choice && choice.key !== 'ui.ok') {
    const result = (e.params?.result as string | undefined) ?? 'ok'
    const key = variantKey(lang, `${choice.key}.${result}`, e.params?.v as number | undefined)
    if (hasKey(lang, key)) return t(key, e.params as never, o)
  }
  return diaryText(t, e, life.sex, life.region, life.religion, lang)
}

// ---------- Надгробие ----------

export function Tombstone({ life, epitaph }: { life: LifeSummary; epitaph: string }) {
  const { t, lang } = useUi()
  const name = nameOf(life.name, lang)
  return (
    <section class="block tomb" aria-labelledby="sum-name">
      <Scene scene={{ place: 'tomb', time: 'sunset', people: 2, props: ['lamp', 'olive'] }} region={life.region} seed={life.heroId} still frame year={life.deathYear} />
      <div class="stone">
        <div class="stone-portrait">
          <Avatar input={portraitInput(life, life.age, true)} label={t('life.portrait', { n: life.age })} />
        </div>
        <h1 id="sum-name" class="stone-name">{name}</h1>
        <p class="stone-years">
          {formatYear(life.birthYear, lang)} - {formatYear(life.deathYear, lang)}
        </p>
        <p class="stone-age">{t('death.lived', { n: life.age })}</p>
        {epitaph && <p class="stone-epi">{epitaph}</p>}
      </div>
    </section>
  )
}

// ---------- Карточки-факты ----------

interface Story {
  id: string
  tone: 'night' | 'sun' | 'cold' | 'terra' | 'olive' | 'paper' | 'sky'
  big: string
  label?: string
  text?: string
  scene?: { scene: SceneDef; seed: string }
  portraits?: boolean
  quote?: { text: string; author: string }
}

export function storyCards(t: T, life: LifeSummary, era: EraDef, lang: Lang, entryScene: (e: DiaryEntry, era: EraDef) => SceneDef, quote?: { text: string; author: string }): Story[] {
  const r = life.report
  const o = { sex: life.sex, region: life.region, religion: life.religion }
  const text = (e: DiaryEntry) => storyText(t, e, life, lang)
  const sceneOf = (i: number) => ({ scene: entryScene(life.diary[i], era), seed: `${life.heroId}:${i}` })
  const used = new Set<number>()
  const out: Story[] = []
  const prof = life.profession ? t(`prof.${life.profession}`, {}, o) : t(`class.${classKey(life.cls, life.tags)}`, {}, o)
  const place = life.places.length > 1 ? life.places.map((p) => (hasKey(lang, `place.${p}`) ? t(`place.${p}`) : t(`region.${p}`))).join(' → ') : t(`region.${life.region}`)
  out.push({ id: 'life', tone: 'night', big: t('death.lived', { n: life.age }), text: `${prof}. ${place}, ${t(`era.${life.era}.short`)}.`, portraits: true })

  // Самый счастливый год - с картиной события.
  const hi = r.facts.happiestReason
  if (r.facts.happiestAge !== null && hi !== null && life.diary[hi]) {
    used.add(hi)
    out.push({ id: 'happy', tone: 'sun', big: t('death.lived', { n: r.facts.happiestAge }), label: t('story.happiest'), text: text(life.diary[hi]), scene: sceneOf(hi) })
  }
  // Самый тяжёлый год: ниже всех по настроению (после детства), запись того года - самая значимая.
  const worst = r.map.filter((y) => y.age >= 10 && y.age !== r.facts.happiestAge).sort((a, b) => a.happiness - b.happiness)[0]
  if (worst && worst.happiness < 45) {
    const cand = life.diary
      .map((e, i) => ({ e, i }))
      .filter(({ e }) => e.age === worst.age && e.key !== 'diary.died')
      .sort((a, b) => (a.e.mood ?? 0) - (b.e.mood ?? 0) || (b.e.score ?? 0) - (a.e.score ?? 0))[0]
    if (cand) {
      used.add(cand.i)
      out.push({ id: 'hard', tone: 'cold', big: t('death.lived', { n: worst.age }), label: t('story.hardest'), text: text(cand.e), scene: sceneOf(cand.i) })
    }
  }
  // Семья.
  const f = r.facts
  out.push({
    id: 'family',
    tone: 'terra',
    big: f.children ? `${f.children} + ${f.grandchildren}` : '0',
    label: f.children ? t('story.family') : t('story.family_none'),
    text: f.partners.map((p) => t('facts.partner', { who: { name: p.name }, n: p.years })).join('. ') || undefined,
  })
  // Скольких ровесников пережил и самый яркий факт жизни.
  const hook = lifeHighlights(life).find((h) => !h.key.startsWith('hook.lived'))
  out.push({ id: 'outlived', tone: 'olive', big: `${outlivedShare(life)}%`, label: t('story.outlived', {}, o), text: hook ? t(hook.key, hook.params, o) : undefined })
  // Ещё два ярких момента, которых не было в карточках выше.
  const moments = r.keyMoments.filter((i) => life.diary[i] && !used.has(i) && life.diary[i].key !== 'diary.born' && life.diary[i].key !== 'diary.died').slice(0, 2)
  for (const i of moments) out.push({ id: `m${i}`, tone: 'paper', big: t('death.lived', { n: life.diary[i].age }), label: t('story.moment'), text: text(life.diary[i]), scene: sceneOf(i) })
  // Узор жизни - одним словом.
  const sides = AXES.map((a) => ({ a, v: r.pattern.scores[a] }))
    .filter((x) => Math.abs(x.v) >= 15)
    .sort((x, y) => Math.abs(y.v) - Math.abs(x.v))
    .slice(0, 2)
    .map((x) => t(`pattern.axis.${x.a}.${x.v > 0 ? 'right' : 'left'}`))
  out.push({ id: 'pattern', tone: 'sky', big: t(`archetype.${r.pattern.code}`, {}, o), label: t('pattern.title'), text: sides.join(' · ') || undefined })
  if (quote) out.push({ id: 'quote', tone: 'paper', big: '', quote })
  return out
}

export function StoryCards({ life, cards }: { life: LifeSummary; cards: Story[] }) {
  const { t } = useUi()
  const [at, setAt] = useState(0)
  const ages = portraitAges(life, 4)
  return (
    <section class="block stories-block" aria-label={t('story.cards')}>
      <div
        class="stories"
        onScroll={(e) => {
          const el = e.currentTarget
          const w = (el.firstElementChild as HTMLElement | null)?.offsetWidth ?? 1
          setAt(Math.round(el.scrollLeft / (w + 10)))
        }}
      >
        {cards.map((c) => (
          <article class={`story tone-${c.tone}${c.quote ? ' story-q' : ''}`}>
            {c.portraits && (
              <div class="story-portraits">
                {ages.map((a, i) => (
                  <Avatar input={portraitInput(life, a, i === ages.length - 1)} label={t('life.portrait', { n: a })} />
                ))}
              </div>
            )}
            {c.scene && <Scene scene={c.scene.scene} region={life.region} seed={c.scene.seed} still />}
            {c.quote ? (
              <>
                <p class="story-quote">{c.quote.text}</p>
                <p class="story-text">- {c.quote.author}</p>
              </>
            ) : (
              <>
                {c.label && <p class="story-label">{c.label}</p>}
                <p class={`story-big${c.big.length > 9 ? ' long' : ''}`}>{c.big}</p>
                {c.text && <p class="story-text">{c.text}</p>}
              </>
            )}
          </article>
        ))}
      </div>
      <div class="story-dots" aria-hidden="true">
        {cards.map((_, i) => (
          <span class={i === at ? 'on' : ''} />
        ))}
        <span class="story-swipe">{t('story.swipe')}</span>
      </div>
    </section>
  )
}

// ---------- Слова у могилы ----------

const VOICES: Record<string, { warm: number; cold: number }> = {
  spouse: { warm: 4, cold: 2 },
  child: { warm: 4, cold: 2 },
  grandchild: { warm: 3, cold: 1 },
  parent: { warm: 2, cold: 1 },
  sibling: { warm: 2, cold: 2 },
  friend: { warm: 2, cold: 1 },
}
const ORDER = ['spouse', 'child', 'parent', 'grandchild', 'sibling', 'friend']
const group = (n: Npc) => (n.role === 'mother' || n.role === 'father' ? 'parent' : n.role)

function hash(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return h >>> 0
}

/** Кто говорит у могилы: живые и рядом; сначала супруг, потом самый близкий ребёнок, родители, внук, брат или друг. */
export function farewellVoices(life: LifeSummary, max = 3): { npc: Npc; key: string }[] {
  const year = life.deathYear
  const near = life.npcs.filter((n) => n.alive && !n.away && VOICES[group(n)] && npcAge(n, year) >= 6)
  const out: { npc: Npc; key: string }[] = []
  const usedKeys = new Set<string>()
  const pickKey = (n: Npc) => {
    const g = group(n)
    const tone = n.attitude >= 25 ? 'warm' : 'cold'
    const count = VOICES[g][tone]
    const start = hash(`${life.heroId}:${n.id}`) % count
    for (let k = 0; k < count; k++) {
      const key = `farewell.${g}.${tone}.${((start + k) % count) + 1}`
      if (!usedKeys.has(key)) return key
    }
    return null
  }
  for (const g of ORDER) {
    if (out.length >= max) break
    const best = near.filter((n) => group(n) === g).sort((a, b) => b.attitude - a.attitude)[0]
    const key = best && pickKey(best)
    if (best && key) {
      usedKeys.add(key)
      out.push({ npc: best, key })
    }
  }
  return out
}

function npcPortrait(life: LifeSummary, n: Npc): AvatarInput {
  const age = Math.max(4, npcAge(n, life.deathYear))
  return { region: life.region, sex: n.sex, age, seed: `${life.heroId}:${n.id}`, cls: life.cls, happiness: 30, married: n.role === 'spouse' || !!n.married, widow: n.role === 'spouse' && n.sex === 'f' }
}

export function Farewell({ life, era }: { life: LifeSummary; era: EraDef }) {
  const { t, lang } = useUi()
  const o = { sex: life.sex, region: life.region, religion: life.religion }
  const name = nameOf(life.name, lang)
  const voices = farewellVoices(life)
  const r = life.report
  const kidsAlive = life.npcs.filter((n) => n.role === 'child' && n.alive).length
  const grand = life.npcs.filter((n) => n.role === 'grandchild').length
  const coin = regionOf(era, life.region).coin
  const longer = Math.max(0, Math.min(99, r.comparison.outlivedBy))
  return (
    <>
      <section class="block">
        <h2 class="section-title">{t('farewell.title')}</h2>
        {voices.length ? (
          voices.map(({ npc, key }) => (
            <figure class="voice">
              <Avatar input={npcPortrait(life, npc)} />
              <blockquote>
                «{t(key, { s: npc.sex }, o)}»
                <cite>
                  {nameOf(npc.name, lang)}, {t(`npc.${roleKey(life.npcs, npc)}`, { sex: npc.sex }).toLocaleLowerCase(lang)}
                </cite>
              </blockquote>
            </figure>
          ))
        ) : (
          <p class="muted">{t('farewell.nobody', {}, o)}</p>
        )}
      </section>

      <section class="block">
        <h2 class="section-title">{t('remains.title')}</h2>
        <ul class="remains">
          <li><Icon name="house" /> {t('remains.home')}</li>
          <li><Icon name="purse" /> {r.facts.wealth > 0 ? t('remains.money', { sum: formatMoney(t, r.facts.wealth, coin) }) : r.facts.wealth < 0 ? t('remains.debts') : t('remains.nothing')}</li>
          <li><Icon name="heart" /> {kidsAlive || grand ? t('remains.kids', { n: kidsAlive, m: grand }) : t('remains.no_kids')}</li>
          <li><Icon name="hammer" /> {t('remains.trade', { prof: life.profession ? t(`prof.${life.profession}`, {}, o) : t('life.no_profession') })}</li>
        </ul>
      </section>

      <section class="block">
        <h2 class="section-title">{t('people.title')}</h2>
        <div class="people100" role="img" aria-label={t('people.legend', { n: longer, name })}>
          {Array.from({ length: 100 }, (_, i) => (
            <span class={i < 99 - longer ? '' : i === 99 - longer ? 'me' : 'longer'} />
          ))}
        </div>
        <p class="small muted">{t('people.legend', { n: longer, name })}</p>
        <p>
          <strong>{t('summary.cause')}:</strong> {t(`cause.${life.cause}`)}
        </p>
      </section>
    </>
  )
}
