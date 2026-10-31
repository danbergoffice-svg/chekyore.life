// Главное о прожитой жизни для карточки «Поделиться»: самый яркий факт («пережила двух мужей», «стала прабабушкой»)
// и темы жизни, по которым подбирается афоризм известного человека. Только чтение итогов жизни - ничего не меняет.
import { descentOf } from './rules'
import type { LifeSummary, TextParam } from './types'

export interface Highlight {
  key: string
  params?: Record<string, TextParam>
  /** Насколько факт яркий: на карточку идёт самый яркий. */
  score: number
}

/** Афоризм из src/content/common/quotes.json. */
export interface Quote {
  id: string
  ru: string
  en: string
  author_ru: string
  author_en: string
  /** Турецкий (может не быть - тогда английский). */
  tr?: string
  author_tr?: string
  tags: string[]
  culture?: string[]
}

const CLASS_RANK: Record<string, number> = { slave: 0, peasant: 1, craftsman: 2, trader: 3, landowner: 4, noble: 5 }
const JOBS: [RegExp, string][] = [
  [/physician|healer|herbal|midwife|apothecar/, 'healer'],
  [/priest|monk|nun|imam|qazi|hegumen|debtera|marabout|brahmin|abbot|shaman|bishop|deacon|mullah/, 'faith'],
  [/scribe|scholar|astronomer|teacher|rhetor|translator|clerk|notary|jurist|exam/, 'learning'],
  [/soldier|officer|legionary|centurion|druzhinnik|strelets|knight|samurai|mamluk|janissary|akrites|warrior|maryannu|archer|guard/, 'war'],
  [/merchant|trader|shipowner|banker|money|peddler/, 'trade'],
  [/artisan|smith|potter|weaver|mason|carver|carpenter|builder|tanner|jeweler|craft/, 'craft'],
]

function jobTheme(profession: string | null): string | null {
  if (!profession) return null
  for (const [re, theme] of JOBS) if (re.test(profession)) return theme
  return null
}

function greatGrandchildren(life: LifeSummary): number {
  return life.npcs.filter((n) => n.role === 'grandchild' && descentOf(life.npcs, n) === 3).length
}

function widowings(life: LifeSummary): number {
  return life.report.facts.partners.filter((p) => p.end === 'death').length
}

/** Поднялся из низов (рабы, крестьяне) к высокому положению - или выкупился из рабства. */
function rose(life: LifeSummary): boolean {
  const f = life.report.facts
  const from = CLASS_RANK[f.birthCls] ?? 2
  const to = CLASS_RANK[life.cls] ?? 2
  return (from === 0 && to > 0) || to - from >= 2 || (from <= 1 && f.percentile >= 85)
}

/** Родился наверху (знать, землевладельцы), а кончил в бедности или ниже по сословию. */
function fell(life: LifeSummary): boolean {
  const f = life.report.facts
  const from = CLASS_RANK[f.birthCls] ?? 2
  const to = CLASS_RANK[life.cls] ?? 2
  return from >= 4 && (to <= 2 || f.percentile <= 30 || (life.tags ?? []).includes('in_debt'))
}

/** Сколько ровесников (в процентах) прожили меньше героя (outlivedBy - сколько из 100 прожили дольше). */
export function outlivedShare(life: LifeSummary): number {
  return Math.max(0, Math.min(99, 100 - life.report.comparison.outlivedBy))
}

/** Яркие факты жизни - от самого яркого. Всегда есть хотя бы один (запасной). */
export function lifeHighlights(life: LifeSummary): Highlight[] {
  const f = life.report.facts
  const out: Highlight[] = []
  const age = life.age
  const share = outlivedShare(life)
  const great = greatGrandchildren(life)
  if (great > 0) out.push({ key: 'hook.great_grand', score: 92 })
  const widowed = widowings(life)
  if (widowed >= 2) out.push({ key: `hook.outlived.${Math.min(widowed, 4)}`, score: 86 + widowed })
  if (f.birthCls === 'slave' && life.cls !== 'slave') out.push({ key: 'hook.freed', score: 90 })
  if (rose(life) && life.profession) out.push({ key: 'hook.rise', params: { prof: { key: `prof.${life.profession}` }, from: { key: `class.${f.birthCls}.family` } }, score: 88 })
  else if (rose(life)) out.push({ key: 'hook.rise_cls', params: { from: { key: `class.${f.birthCls}.family` }, to: { key: `class.${life.cls}` } }, score: 84 })
  if (fell(life)) out.push({ key: 'hook.fall', params: { from: { key: `class.${f.birthCls}.family` } }, score: 78 })
  if (age >= 60 && share >= 85) out.push({ key: 'hook.longevity', params: { n: age, p: share }, score: 70 + Math.min(20, age - 60) })
  if (age < 16) out.push({ key: 'hook.short', params: { n: age }, score: 82 })
  const ds = life.dreamSeen
  if (ds && !ds.skipped && (ds.outcome === 'breakthrough' || ds.outcome === 'partial')) out.push({ key: 'hook.dream', params: { title: { key: `dream.${ds.id}.title` } }, score: ds.outcome === 'breakthrough' ? 80 : 66 })
  if (life.abroad) out.push({ key: life.returned ? 'hook.abroad_back' : 'hook.abroad', params: { from: { key: `era.${life.abroad.homeland.era}.short` }, to: { key: `era.${life.era}.short` } }, score: 74 })
  if (f.children >= 7) out.push({ key: 'hook.children', params: { n: f.children }, score: 64 + Math.min(10, f.children - 7) })
  if (f.grandchildren >= 12) out.push({ key: 'hook.grandchildren', params: { n: f.grandchildren }, score: 68 })
  if (f.partners.length >= 3) out.push({ key: `hook.married.${Math.min(f.partners.length, 4)}`, score: 62 })
  if (f.percentile >= 95 && !rose(life)) out.push({ key: 'hook.top', params: { p: f.percentile }, score: 58 })
  if (age >= 40 && f.partners.length === 0 && f.children === 0) out.push({ key: 'hook.alone', score: 40 })
  // Факты поскромнее - чтобы у любой жизни нашлось что сказать, кроме возраста.
  if (widowed === 1) {
    const p = f.partners.find((x) => x.end === 'death')!
    out.push({ key: 'hook.widowed', params: { n: p.endAge }, score: p.endAge < 40 ? 56 : 46 })
  }
  const longest = Math.max(0, ...f.partners.map((p) => p.years))
  if (longest >= 30) out.push({ key: 'hook.long_marriage', params: { n: longest }, score: 50 + Math.min(10, longest - 30) })
  if (f.children >= 2 && f.children < 7) out.push({ key: 'hook.children_some', params: { n: f.children }, score: 38 + f.children })
  if (f.grandchildren >= 1 && f.grandchildren < 12 && great === 0) out.push({ key: 'hook.grand_some', params: { n: f.grandchildren }, score: 47 })
  const hard = life.diary.filter((d) => d.major && (d.icon === 'war' || d.icon === 'disaster')).length
  if (hard >= 3) out.push({ key: 'hook.hardships', params: { n: hard }, score: 52 + Math.min(8, hard - 3) })
  if (ds && !ds.skipped && ds.outcome === 'failure') out.push({ key: 'hook.dream_lost', score: 44 })
  const dramatic: Record<string, number> = { arena: 72, shipwreck: 60, war: 56, childbirth: 52, snakebite: 50, drowning: 50, hunger: 50, epidemic: 46, smallpox: 46 }
  if (age >= 15 && dramatic[life.cause]) out.push({ key: `hook.cause.${life.cause}`, params: { n: age }, score: dramatic[life.cause] })
  // Запасной факт: возраст и чем кончилась жизнь - есть у всех.
  out.push({ key: share >= 50 ? 'hook.lived' : 'hook.lived_plain', params: { n: age, p: share }, score: 10 })
  return out.sort((a, b) => b.score - a.score)
}

/** Темы жизни с весами: по ним подбирается афоризм (см. теги в quotes.json). */
export function lifeThemes(life: LifeSummary): Record<string, number> {
  const f = life.report.facts
  const w: Record<string, number> = { fate: 0.6, death: 0.4, chance: 0.4 }
  const add = (k: string, v: number) => (w[k] = (w[k] ?? 0) + v)
  const age = life.age
  if (age >= 70 || (age >= 55 && outlivedShare(life) >= 85)) add('long_life', 3)
  if (age >= 60) add('old_age', 1.5)
  if (age < 25) add('short_life', 3)
  if (age < 18) add('youth', 2)
  if (f.children >= 6) add('many_children', 2.5)
  if (f.children >= 3 || f.grandchildren >= 3) add('family', 1)
  if (greatGrandchildren(life) > 0 || f.grandchildren >= 8) add('legacy', 2.5)
  if (age >= 40 && f.children === 0) add('childless', 2)
  if (widowings(life) >= 1) add('widowed', 1.5 + widowings(life))
  if (f.partners.length >= 1) add('love', 0.8)
  if (f.partners.length >= 2) add('marriage', 1.5)
  if (age >= 40 && f.partners.length === 0) add('lonely', 2)
  if (rose(life)) add('rise', 3.5)
  if (fell(life)) add('fall', 3.5)
  if ((CLASS_RANK[f.birthCls] ?? 2) === 0) add('freedom', rose(life) ? 3 : 1.5)
  if (f.percentile >= 80) add('rich', 1.5)
  if (f.percentile >= 90 || life.cls === 'noble') add('power', 1.5)
  if (f.percentile <= 25 || (life.tags ?? []).includes('in_debt')) add('poor', 2)
  const job = jobTheme(life.profession)
  if (job) add(job, 3)
  if (job === 'craft' || life.cls === 'craftsman') add('work', 0.8)
  if (life.cls === 'peasant') add('work', 1)
  if (life.dreamSeen && !life.dreamSeen.skipped) add('dream', 2.5)
  if (life.dreamSeen?.outcome === 'breakthrough') add('reason', 2)
  if (life.abroad) add(life.returned ? 'homeland' : 'exile', 3)
  if (life.abroad) add('travel', 1.5)
  if (life.diary.some((d) => d.key.startsWith('diary.rescued.'))) add('survivor', 2.5)
  if (life.diary.some((d) => d.icon === 'war')) add('war', 1.5)
  const hap = life.history.length ? life.history.reduce((s, y) => s + y.happiness, 0) / life.history.length : 50
  if (hap >= 65) add('happiness', 1.5)
  if (hap <= 35) add('sorrow', 1.5)
  if (f.farewell.length >= 5) add('friendship', 1)
  return w
}

/** Простой устойчивый хэш: одна и та же жизнь - тот же афоризм. */
function hash(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return (h >>> 0) / 4294967296
}

/** Афоризмы для жизни - от самого подходящего: темы жизни × теги цитаты, бонус мудрецам своей страны. Среди близких
 *  по смыслу (не хуже 60% лучшего, до 10 штук) первый выбирается по жизни - у похожих жизней разные афоризмы,
 *  а у одной и той же - всегда один. */
export function rankQuotes(life: LifeSummary, quotes: Quote[], folder: string, themes = lifeThemes(life)): Quote[] {
  const base = new Map(quotes.map((q) => [q, q.tags.reduce((s, tag) => s + (themes[tag] ?? 0), 0) / Math.sqrt(q.tags.length) + (q.culture?.includes(folder) ? 1 : 0)]))
  const sorted = [...quotes].sort((a, b) => base.get(b)! - base.get(a)!)
  const best = base.get(sorted[0]) ?? 0
  const pool = sorted.filter((q) => base.get(q)! >= best * 0.6).slice(0, 10)
  pool.sort((a, b) => hash(life.heroId + a.id) - hash(life.heroId + b.id))
  return [...pool, ...sorted.filter((q) => !pool.includes(q))]
}
