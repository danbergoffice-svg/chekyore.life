// Четыре варианта экрана после смерти (02.11) на настоящей жизни из движка: ?seed=…&era=EUR
// А «Летопись» - главы жизни, Б «Тропа» - путь с остановками, В «Прощание» - надгробие и голоса родных, Г «Истории» - факты-карточки.
import { render } from 'preact'
import type { ComponentChildren } from 'preact'
import '@fontsource-variable/alegreya'
import '../../src/style.css'
import '../../src/skin.css'
import { loadAllEras } from '../../src/content'
import { autoplay } from '../../src/engine/game'
import { newLife } from '../../src/engine/life'
import { createT, formatMoney, formatYear, loadAllTexts, nameOf } from '../../src/i18n'
import { classKey, npcAge, regionOf } from '../../src/engine/rules'
import type { DiaryEntry, EraDef, LifeSummary, Npc } from '../../src/engine/types'
import { Scene } from '../../src/pixel/Scene'
import { Avatar } from '../../src/pixel/Avatar'
import { lifeCardData, portraitAges, portraitInput } from '../../src/ui/lifeCard'
import { lifeHighlights, outlivedShare } from '../../src/engine/highlights'
import { QUOTES } from '../../src/content/quotes'
import { diaryText, UiContext } from '../../src/ui/text'
import { entryScene } from '../../src/ui/Summary'
import { Icon } from '../../src/ui/Icon'
import type { IconName } from '../../src/ui/icons'

const q = new URLSearchParams(location.search)
const eras = await loadAllEras()
await loadAllTexts()
const t = createT('ru')
const era: EraDef = eras[q.get('era') ?? 'EUR']

// Жизнь поярче: взрослая, с семьёй и событиями.
let life: LifeSummary | undefined
for (let seed = Number(q.get('seed') ?? 410); seed < 3000; seed++) {
  const s = autoplay(newLife(era, { mode: 'full', mortality: 'soft', softenHeavy: false, livesBefore: 3 }, seed), era)
  const l = s.family.lives[s.family.lives.length - 1]
  if (l.age >= 58 && l.age <= 80 && l.report.facts.partners.length >= 1 && l.children >= 3 && l.report.keyMoments.length >= 5 && l.profession) {
    life = l
    console.log('seed', seed)
    break
  }
}
if (!life) throw new Error('нет жизни')
const L = life
const r = L.report
const o = { sex: L.sex, region: L.region, religion: L.religion }
const name = nameOf(L.name, 'ru')
const line = (e: DiaryEntry) => diaryText(t, e, L.sex, L.region, L.religion, 'ru')
const years = `${formatYear(L.birthYear, 'ru')} - ${formatYear(L.deathYear, 'ru')}`
const card = lifeCardData(L, t, 'ru', { quotes: QUOTES, playerLine: '', site: 'thousands.life', scene: { place: 'landmark', time: 'sunset', people: 3 } })
const quote = card.quotes[0]
const hooks = lifeHighlights(L).map((h) => t(h.key, h.params, o))
const prof = L.profession ? t(`prof.${L.profession}`, {}, o) : t(`class.${classKey(L.cls, L.tags)}`, {}, o)
const place = `${t(`region.${L.region}`)}, ${t(`era.${L.era}.short`)}`
const share = outlivedShare(L)
const spouses = L.npcs.filter((n) => n.role === 'spouse')
const kids = L.npcs.filter((n) => n.role === 'child')
const grand = L.npcs.filter((n) => n.role === 'grandchild')
const moments = r.keyMoments.filter((i) => L.diary[i]).map((i) => ({ i, e: L.diary[i] }))
const happy = r.facts.happiestAge
const happyText = r.facts.happiestReason !== null && L.diary[r.facts.happiestReason] ? line(L.diary[r.facts.happiestReason]) : ''
// Самый тяжёлый год - самый низкий в карте настроения (после 12 лет).
const worst = [...r.map].filter((y) => y.age >= 12).sort((a, b) => a.happiness - b.happiness)[0]
const worstEntry = L.diary.filter((d) => d.age === worst?.age && line(d).length >= 28).sort((a, b) => (b.score ?? 0) - (a.score ?? 0))[0]
const NAMING = new Set(['child_naming', 'naming'])
const good = (e: DiaryEntry) => !(e.eventId && (NAMING.has(e.eventId) || e.eventId.includes('naming'))) && line(e).length >= 28
const rel = (n: Npc) => t(`npc.${n.role === 'grandchild' ? 'grandchild' : n.role}`, { sex: n.sex }).toLocaleLowerCase('ru')

const Screen = (p: { title: string; sub: string; children: ComponentChildren }) => (
  <div class="col">
    <div class="cap">
      <b>{p.title}</b>
      <span>{p.sub}</span>
    </div>
    <div class="phone">
      <div class="screen summary mock">{p.children}</div>
      <div class="sticky-actions mock-actions">
        <button class="primary">{kids.some((k) => k.alive) ? 'Продолжить род' : 'Родиться снова'}</button>
        <button class="secondary">Поделиться</button>
      </div>
    </div>
  </div>
)

const Head = (p: { small?: boolean }) => (
  <>
    <p class="eyebrow">Запись № 000214</p>
    <h1 class={`hero-name ${p.small ? '' : 'big'}`}>{name}</h1>
    <p class="muted">{years} · {t('death.lived', { n: L.age })}</p>
    <p class="muted small">{prof} · {place}</p>
  </>
)

// ---------- А. Летопись: жизнь главами ----------
const CHAPTERS = [
  { title: 'Детство', from: 0, to: era.stages.youth - 1 },
  { title: 'Юность', from: era.stages.youth, to: 29 },
  { title: 'Зрелость', from: 30, to: era.stages.old - 1 },
  { title: 'Старость', from: era.stages.old, to: 200 },
]
function Chronicle() {
  return (
    <Screen title="А. Летопись" sub="Жизнь главами: портрет того возраста, картина главного события и 2–3 строки о нём">
      <section class="block">
        <Head />
        <p class="epitaph">{quote ? <>{quote.text} <span>- {quote.author}</span></> : null}</p>
      </section>
      {CHAPTERS.filter((c) => c.from <= L.age).map((c) => {
        const inside = L.diary.map((e, i) => ({ e, i })).filter(({ e }) => e.age >= c.from && e.age <= c.to && good(e) && (e.major || (e.score ?? 0) >= 15))
        const best = [...inside].sort((a, b) => (b.e.score ?? 0) - (a.e.score ?? 0)).slice(0, 3).sort((a, b) => a.e.age - b.e.age)
        const mood = r.map.filter((y) => y.age >= c.from && y.age <= c.to)
        const avg = mood.length ? Math.round(mood.reduce((s, y) => s + y.happiness, 0) / mood.length) : 50
        const age = Math.min(L.age, Math.round((c.from + Math.min(c.to, L.age)) / 2))
        if (!best.length) return null
        return (
          <section class="block chapter">
            <div class="chapter-head">
              <Avatar input={portraitInput(L, age, c.to >= L.age)} />
              <div>
                <h2 class="section-title">{c.title}</h2>
                <p class="small muted">{c.from}–{Math.min(c.to, L.age)} лет · {avg >= 60 ? 'светлые годы' : avg >= 40 ? 'ровные годы' : 'тяжёлые годы'}</p>
              </div>
            </div>
            <Scene scene={entryScene(best[0].e, era)} region={L.region} seed={`${L.heroId}:${best[0].i}`} still />
            {best.map(({ e }) => (
              <p class="chapter-line"><span class="diary-age">{e.age}</span> {line(e)}</p>
            ))}
          </section>
        )
      })}
      <section class="block">
        <h2 class="section-title">Итог</h2>
        <p class="bio-text">{hooks.slice(0, 3).join('. ')}.</p>
      </section>
    </Screen>
  )
}

// ---------- Б. Тропа: путь с остановками, цвет пути - настроение ----------
const STOP_ICON: Record<string, IconName> = { birth: 'spark', child: 'heart', wedding: 'crown', death: 'hourglass', move: 'house', loss: 'moon', find: 'purse', war: 'target', disaster: 'target', freedom: 'chain', study: 'book', love: 'heart' }
function Path() {
  // Остановки - по всей жизни: самые значимые записи, не больше двух на десятилетие.
  const all = L.diary.map((e, i) => ({ e, i })).filter(({ e }) => (e.major || (e.score ?? 0) >= 25) && good(e) && e.key !== 'diary.died')
  const per = new Map<number, number>()
  const stops = [...all].sort((a, b) => (b.e.score ?? 0) - (a.e.score ?? 0)).filter(({ e }) => {
    const d = Math.floor(e.age / 10)
    if ((per.get(d) ?? 0) >= 2) return false
    per.set(d, (per.get(d) ?? 0) + 1)
    return true
  }).slice(0, 11).sort((a, b) => a.e.age - b.e.age || a.i - b.i)
  return (
    <Screen title="Б. Тропа" sub="Путь от рождения до смерти: остановки - главные события, цвет тропы - счастливые и тяжёлые годы">
      <section class="block">
        <Head />
        <div class="signs">
          <span><b>{L.age}</b>лет</span>
          <span><b>{kids.length}</b>детей</span>
          <span><b>{grand.length}</b>внуков</span>
          <span><b>{share}%</b>ровесников пережил{L.sex === 'f' ? 'а' : ''}</span>
        </div>
      </section>
      <section class="block trail">
        {stops.map(({ e }, k) => {
          const y = r.map.find((m) => m.age === e.age)
          const mood = y ? y.happiness : 50
          return (
            <div class={`stop ${k % 2 ? 'r' : 'l'}`} style={{ '--mood': mood >= 60 ? 'var(--mustard)' : mood >= 40 ? 'var(--ochre)' : '#6f8fc9' } as never}>
              <span class="pin"><Icon name={STOP_ICON[e.icon!] ?? 'spark'} /></span>
              <div class="stop-text">
                <span class="stop-age">{e.age} лет · {formatYear(e.year, 'ru')}</span>
                <span>{line(e)}</span>
              </div>
            </div>
          )
        })}
        <div class="stop end">
          <span class="pin"><Icon name="hourglass" /></span>
          <div class="stop-text"><span class="stop-age">{L.age} лет</span><span>{t(`cause.${L.cause}`)}</span></div>
        </div>
      </section>
    </Screen>
  )
}

// ---------- В. Прощание: надгробие, голоса родных, что осталось ----------
const VOICES: Record<string, string[]> = {
  spouse: ['{Him} держал{a} дом, когда всё рушилось. Мне будет не с кем говорить по вечерам.', 'Мы прожили вместе долго. Не всегда ладно, но вместе.'],
  child: ['{Him} научил{a} меня ремеслу и терпению. Не знаю, как теперь без {her}.', '{Him} всегда вставал{a} раньше всех. Дом без {her} тихий.', 'Мы спорили до последнего дня. Теперь некому возразить.'],
  grandchild: ['{Him} рассказывал{a} нам про старые времена - про пожар и про то, как всё отстроили.', 'У {her} в кармане всегда был орех для нас.'],
  friend: ['Таких, как {him}, в округе больше нет.'],
}
let said = 0
function voice(n: Npc): string {
  const f = L.sex === 'f'
  const list = VOICES[n.role] ?? ['Пусть земля будет пухом.']
  return list[said++ % list.length].replace('{Him}', f ? 'Она' : 'Он').replace(/\{a\}/g, f ? 'а' : '').replace(/\{her\}/g, f ? 'неё' : 'него').replace('{him}', f ? 'она' : 'он')
}
function Farewell() {
  const voices = [...L.npcs.filter((n) => n.alive && ['spouse', 'child', 'grandchild', 'friend'].includes(n.role))].sort((a, b) => b.attitude - a.attitude).slice(0, 3)
  const outlived = 100 - share
  return (
    <Screen title="В. Прощание" sub="Надгробие с эпитафией, слова живых родных, что осталось после героя, 100 ровесников человечками">
      <section class="block stone-wrap">
        <Scene scene={{ place: 'tomb', time: 'sunset', people: 2, props: ['lamp', 'olive'] }} region={L.region} seed={L.heroId} still frame year={L.deathYear} />
        <div class="stone">
          <p class="stone-name">{name}</p>
          <p class="stone-years">{years}</p>
          <p class="stone-epi">{hooks[0]}</p>
        </div>
      </section>
      <section class="block">
        <h2 class="section-title">Что сказали у могилы</h2>
        {voices.map((n) => (
          <figure class="voice">
            <Avatar input={{ ...portraitInput(L, 30, false), sex: n.sex, age: Math.max(4, npcAge(n, L.deathYear)) } as never} />
            <blockquote>
              «{voice(n)}»
              <cite>{nameOf(n.name, 'ru')}, {rel(n)}</cite>
            </blockquote>
          </figure>
        ))}
      </section>
      <section class="block">
        <h2 class="section-title">Что осталось</h2>
        <ul class="left">
          <li><Icon name="house" /> Дом и {t(`class.${classKey(L.cls, L.tags)}`, {}, o).toLocaleLowerCase('ru')} имя</li>
          <li><Icon name="purse" /> {formatMoney(t, r.facts.wealth, regionOf(era, L.region).coin)}</li>
          <li><Icon name="heart" /> {kids.filter((k) => k.alive).length} живых детей, {grand.length} внуков</li>
          <li><Icon name="book" /> {prof}</li>
        </ul>
      </section>
      <section class="block">
        <h2 class="section-title">Из 100 ровесников</h2>
        <div class="people100">
          {Array.from({ length: 100 }, (_, i) => <span class={i < outlived ? 'longer' : i === outlived ? 'me' : ''} />)}
        </div>
        <p class="small muted">Светлые - прожили меньше. Красный - {name}. Тёмные - дольше: {outlived} из 100.</p>
      </section>
    </Screen>
  )
}

// ---------- Г. Истории: факты-карточки, листаются как сторис ----------
function Stories() {
  const cards: { big: string; small: string; scene?: { e: DiaryEntry; i: number }; tone: string }[] = [
    { big: `${L.age} лет`, small: `${name}, ${prof.toLocaleLowerCase('ru')}. ${place}. ${years}`, tone: 'night' },
    ...(happy !== null ? [{ big: `${happy} лет`, small: `Самый счастливый год. ${happyText}`, scene: moments.find((m) => m.e.age === happy) ?? moments[1], tone: 'sun' }] : []),
    ...(worstEntry ? [{ big: `${worst.age} лет`, small: `Самый тяжёлый год. ${line(worstEntry)}`, scene: { e: worstEntry, i: L.diary.indexOf(worstEntry) }, tone: 'cold' }] : []),
    { big: `${kids.length} + ${grand.length}`, small: `Детей и внуков. ${spouses.map((s) => nameOf(s.name, 'ru')).join(', ')} - рядом ${r.facts.partners[0]?.years ?? 0} лет`, tone: 'terra' },
    { big: `${share}%`, small: `ровесников ${L.sex === 'f' ? 'она пережила' : 'он пережил'}. ${hooks[0]}`, tone: 'olive' },
  ]
  return (
    <Screen title="Г. Истории" sub="Каждый факт - отдельная яркая карточка во весь экран, листаются пальцем как сторис; внизу - вся летопись">
      <div class="stories-dots">{cards.map((_, i) => <span class={i === 0 ? 'on' : ''} />)}</div>
      {cards.map((c, i) => (
        <section class={`story tone-${c.tone}`}>
          {i === 0 && <Avatar input={portraitInput(L, L.age, true)} />}
          {c.scene && <Scene scene={entryScene(c.scene.e, era)} region={L.region} seed={`${L.heroId}:${c.scene.i}`} still />}
          <p class="story-big">{c.big}</p>
          <p class="story-small">{c.small}</p>
        </section>
      ))}
      {quote && (
        <section class="story tone-paper">
          <p class="story-quote">{quote.text}</p>
          <p class="story-small">- {quote.author}</p>
        </section>
      )}
    </Screen>
  )
}

render(
  <UiContext.Provider value={{ t, lang: 'ru' }}>
    <div class="grid">
      <Chronicle />
      <Path />
      <Farewell />
      <Stories />
    </div>
  </UiContext.Provider>,
  document.getElementById('app')!,
)
await document.fonts.ready
setTimeout(() => (document.body.dataset.ready = '1'), 800)
