import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import { axisLabel } from '../engine/report'
import { npcAge, regionOf } from '../engine/rules'
import { AXES } from '../engine/types'
import type { DiaryEntry, EraDef, Icon, LifeSummary, Npc, SceneDef, Topic } from '../engine/types'
import { formatMoney, formatYear, hasKey, nameOf } from '../i18n'
import { Scene } from '../pixel/Scene'
import { BarList, LineChart, Numbers } from './charts'
import { CARD_SIZES, cleanLine, drawCard } from './shareCard'
import type { CardFormat } from './shareCard'
import { diaryText, useUi } from './text'

const ICON_GLYPH: Record<Icon, string> = {
  birth: '●',
  child: '◆',
  wedding: '◎',
  death: '■',
  move: '➜',
  loss: '▼',
  find: '▲',
  war: '⚑',
  disaster: '✷',
  freedom: '○',
  study: '✎',
  love: '♥',
}

/** Сцена для записи дневника: сцена события или подходящая по смыслу. */
export function entryScene(e: DiaryEntry, era: EraDef): SceneDef {
  const ev = e.eventId ? era.events.find((x) => x.id === e.eventId) : undefined
  if (ev?.scene) return ev.scene
  if (e.key === 'diary.born' || e.key.startsWith('diary.child_born') || e.key.startsWith('diary.grandchild')) return { place: 'home', time: 'dawn', people: 3, props: ['cradle'] }
  if (e.key === 'diary.died' || e.key.startsWith('diary.death_')) return { place: 'tomb', time: 'sunset', people: 2, props: ['lamp'] }
  if (e.key === 'diary.married') return { place: 'home', time: 'sunset', people: 5, props: ['table', 'amphora'] }
  if (e.key === 'diary.moved') return { place: 'road', time: 'day', people: 2, props: ['cart'] }
  if (e.key === 'diary.heir') return { place: 'home', time: 'day', people: 3, props: ['scroll'] }
  return { place: 'landmark', time: 'day', people: 3 }
}

type Filter = 'all' | Topic | 'decisions'
const FILTERS: Filter[] = ['all', 'family', 'work', 'health', 'money', 'history', 'decisions']

interface SummaryProps {
  life: LifeSummary
  era: EraDef
  /** Есть ли живые наследники в текущей игре. */
  canContinue: boolean
  onContinue?: () => void
  onAgain: () => void
  onMemorial: () => void
  onMenu: () => void
  onUpdate: (life: LifeSummary) => void
}

export function Summary({ life, era, canContinue, onContinue, onAgain, onMemorial, onMenu, onUpdate }: SummaryProps) {
  const { t, lang } = useUi()
  const r = life.report
  const o = { sex: life.sex, region: life.region }
  const name = nameOf(life.name, lang)
  const coin = regionOf(era, life.region).coin
  const [sharing, setSharing] = useState(false)
  const starred = life.starred ?? []
  const toggleStar = (i: number) => onUpdate({ ...life, starred: starred.includes(i) ? starred.filter((x) => x !== i) : [...starred, i] })
  const line = (e: DiaryEntry) => diaryText(t, e, life.sex, life.region)
  const archetype = t(`archetype.${r.pattern.code}`)

  const bio = r.biography.map((s) => {
    const params: Record<string, string | number | { key: string } | { name: string }> = { ...(s.params ?? {}), name, year: formatYear(life.birthYear, lang) }
    if (s.key === 'bio.history' && typeof s.params?.list === 'string') params.list = s.params.list.split('|').map((k) => t(k, {}, o)).join(', ')
    return t(s.key, params, o)
  })

  return (
    <div class="screen summary">
      {/* 1. Запись о смерти */}
      <section class="block record-card" aria-labelledby="sum-name">
        <Scene scene={{ place: 'tomb', time: 'sunset', people: 2, props: ['lamp', 'olive'] }} region={life.region} seed={life.heroId} />
        <p class="eyebrow">{t('summary.record', { n: String(life.record ?? 1).padStart(6, '0') })}</p>
        <h1 id="sum-name" class="hero-name big">{name}</h1>
        <p class="muted">
          {formatYear(life.birthYear, lang)} — {formatYear(life.deathYear, lang)} · {t('death.lived', { n: life.age })}
        </p>
        <p class="muted">
          {t(`era.${life.era}`)} · {t(`region.${life.region}`)} · {t(`summary.sex.${life.sex}`)} · {t(`class.${life.cls}`, {}, o)}
        </p>
        <p class="bio-text">{bio.join(' ')}</p>
        <p>
          <strong>{t('summary.cause')}:</strong> {t(`cause.${life.cause}`)}
        </p>
        <div class="note-box small">
          <p>{t('summary.cmp_expected', { n: r.comparison.expected, adult: r.comparison.expectedAdult })}</p>
          <p>
            {r.comparison.difference > 0
              ? t('summary.cmp_more', { name, n: r.comparison.difference }, o)
              : r.comparison.difference < 0
                ? t('summary.cmp_less', { n: -r.comparison.difference })
                : t('summary.cmp_same')}{' '}
            {t('summary.cmp_outlived', { n: r.comparison.outlivedBy }, o)}
          </p>
          {r.comparison.causeShare !== null && <p>{t('summary.cmp_cause', { n: r.comparison.causeShare })}</p>}
          <p class="confidence">{t('summary.source')}</p>
        </div>
      </section>

      {/* 2. Карточка фактов */}
      <section class="block">
        <h2 class="section-title">{t('facts.title')}</h2>
        <dl class="facts">
          <dt>{t('facts.education')}</dt>
          <dd>{r.facts.education.map((s) => t(s.key, s.key === 'facts.edu.skill' ? { skill: t((s.params?.skill as { key: string }).key).toLowerCase() } : s.params, o)).join(' ')}</dd>
          <dt>{t('facts.work')}</dt>
          <dd>{life.profession ? t(`prof.${life.profession}`, {}, o) : t('life.no_profession')}</dd>
          <dt>{t('facts.status')}</dt>
          <dd>{t('facts.status_value', { n: r.facts.percentile })}</dd>
          <dt>{t('facts.partners')}</dt>
          <dd>{r.facts.partners.length ? r.facts.partners.map((p) => t('facts.partner', { who: { name: p.name }, n: p.years })).join('; ') : t('facts.none')}</dd>
          <dt>{t('facts.children')}</dt>
          <dd>{t('facts.children_value', { n: r.facts.children, grand: r.facts.grandchildren })}</dd>
          <dt>{t('facts.farewell')}</dt>
          <dd>
            {r.facts.farewell.length
              ? r.facts.farewell
                  .map((id) => life.npcs.find((n) => n.id === id))
                  .filter((n): n is Npc => !!n)
                  .map((n) => `${nameOf(n.name, lang)} (${t(`npc.${n.role}`, { sex: n.sex }).toLowerCase()})`)
                  .join(', ')
              : t('facts.farewell_none')}
          </dd>
          {r.facts.happiestAge !== null && (
            <>
              <dt>{t('facts.happiest')}</dt>
              <dd>
                {t('facts.happiest_value', { n: r.facts.happiestAge })}
                {r.facts.happiestReason !== null && life.diary[r.facts.happiestReason] ? ` — ${line(life.diary[r.facts.happiestReason])}` : ''}
              </dd>
            </>
          )}
          <dt>{t('facts.places', {}, o)}</dt>
          <dd>{life.places.map((p) => (hasKey(lang, `place.${p}`) ? t(`place.${p}`) : t(`region.${p}`))).join(' → ')}</dd>
          {r.facts.hobbies.length > 0 && (
            <>
              <dt>{t('facts.hobbies')}</dt>
              <dd>{r.facts.hobbies.map((h) => t(`hobby.${h}`)).join(', ')}</dd>
            </>
          )}
          <dt>{t('facts.wealth')}</dt>
          <dd>{formatMoney(t, r.facts.wealth, coin)}</dd>
        </dl>
        {Object.keys(r.facts.timeUse).length > 0 && (
          <>
            <h3>{t('facts.timeuse')}</h3>
            <BarList
              label={t('facts.timeuse')}
              items={Object.entries(r.facts.timeUse)
                .sort((a, b) => b[1] - a[1])
                .map(([k, v]) => ({ label: t(`timeuse.${k}`), value: v }))}
            />
          </>
        )}
      </section>

      {/* 3. Узор жизни */}
      <section class="block">
        <h2 class="section-title">{t('pattern.title')}</h2>
        <p class="archetype">{archetype}</p>
        <div class="axes">
          {AXES.map((a) => {
            const v = r.pattern.scores[a]
            const side = t(`pattern.axis.${a}.${v > 0 ? 'right' : 'left'}`)
            return (
              <div class="axis">
                <div class="axis-labels">
                  <span>{t(`pattern.axis.${a}.left`)}</span>
                  <span class="muted">{t(`pattern.label.${axisLabel(v)}`, { side })}</span>
                  <span>{t(`pattern.axis.${a}.right`)}</span>
                </div>
                <div class="axis-track" role="meter" aria-valuemin={-100} aria-valuemax={100} aria-valuenow={v} aria-label={`${t(`pattern.axis.${a}.left`)} / ${t(`pattern.axis.${a}.right`)}`}>
                  <span class="axis-mid" />
                  <span class="axis-dot" style={{ left: `${(v + 100) / 2}%` }} />
                </div>
              </div>
            )
          })}
        </div>
        <p class="small muted">{t('pattern.disclaimer.no_best_life')}</p>
      </section>

      {/* 4. Карта жизни */}
      <section class="block">
        <h2 class="section-title">{t('map.title')}</h2>
        <div class="lifemap" role="list">
          {r.map.map((y) => (
            <span
              role="listitem"
              class={`cell mood-${Math.min(4, Math.floor(y.happiness / 20))}${y.age === r.comparison.expected ? ' expected' : ''}`}
              title={`${t('map.year', { n: y.age, mood: y.happiness })}${y.icons.length ? ` · ${y.icons.map((i) => t(`icon.${i}`)).join(', ')}` : ''}`}
              aria-label={`${t('map.year', { n: y.age, mood: y.happiness })}${y.icons.length ? `, ${y.icons.map((i) => t(`icon.${i}`)).join(', ')}` : ''}`}
            >
              {y.icons.length ? ICON_GLYPH[y.icons[0]] : ''}
            </span>
          ))}
        </div>
        <p class="small muted">{t('map.legend')}</p>
        <ul class="legend small">
          {(Object.keys(ICON_GLYPH) as Icon[])
            .filter((i) => r.map.some((y) => y.icons.includes(i)))
            .map((i) => (
              <li>
                {ICON_GLYPH[i]} {t(`icon.${i}`)}
              </li>
            ))}
        </ul>
        <h3 class="small">{t('map.survival', {}, o)}</h3>
        <LineChart label={t('map.survival', {}, o)} points={r.comparison.survival.slice(0, Math.max(life.age + 10, 60)).map((y, x) => ({ x, y }))} yMin={0} yMax={100} frameX={life.age} />
      </section>

      {/* 5. Моменты, которые стоит запомнить */}
      <section class="block">
        <h2 class="section-title">{t('moments.title')}</h2>
        <ol class="moments">
          {r.keyMoments
            .filter((i) => life.diary[i])
            .map((i) => {
              const e = life.diary[i]
              return (
                <li>
                  <Scene scene={entryScene(e, era)} region={life.region} seed={`${life.heroId}:${i}`} />
                  <p>
                    <span class="diary-age">{t('diary.age', { n: e.age })}</span> {line(e)}
                  </p>
                </li>
              )
            })}
        </ol>
      </section>

      {/* 6. Полная запись жизни */}
      <FullRecord life={life} era={era} starred={starred} onStar={toggleStar} />

      {/* 7. Графики */}
      <section class="block">
        <h2 class="section-title">{t('charts.title')}</h2>
        <h3>{t('charts.status')}</h3>
        <p class="small muted">{t('charts.status_desc')}</p>
        <LineChart
          label={t('charts.status')}
          points={r.charts.status.map((p) => ({ x: p.age, y: p.value }))}
          yMin={0}
          yMax={100}
          bands={r.charts.bands.map((b) => ({ from: b.from, to: b.to, label: t(`class.${b.cls}`, {}, o) }))}
        />
        <Numbers head={[t('charts.age'), t('charts.value')]} rows={r.charts.status.filter((_, i) => i % 5 === 0).map((p) => [p.age, p.value])} />
        <h3>{t('charts.wealth')}</h3>
        <LineChart
          label={t('charts.wealth')}
          points={r.charts.wealth.map((p) => ({ x: p.age, y: p.value }))}
          marks={r.charts.wealth.filter((p) => p.reasons.length).map((p) => p.age)}
          format={(v) => (Math.abs(v) >= 1000 ? `${Math.round(v / 100) / 10}k` : String(v))}
        />
        <Numbers
          head={[t('charts.age'), t('charts.value'), t('charts.reasons')]}
          rows={r.charts.wealth
            .filter((p, i) => i % 5 === 0 || p.reasons.length)
            .map((p) => [p.age, formatMoney(t, p.value, coin), p.reasons.map((i) => life.diary[i] && line(life.diary[i])).join('; ')])}
        />
        <h3>{t('charts.timeuse')}</h3>
        <BarList
          label={t('charts.timeuse')}
          items={Object.entries(r.charts.timeUse)
            .sort((a, b) => b[1] - a[1])
            .map(([k, v]) => ({ label: t(`timeuse.${k}`), value: v }))}
        />
      </section>

      {/* 8. Связь с родом */}
      <FamilyLink life={life} />

      {/* 9. Действия */}
      <section class="block stack">
        {canContinue && onContinue ? (
          <button class="primary" onClick={onContinue}>{t('actions.continue')}</button>
        ) : (
          <p class="muted">{t('actions.no_heirs')}</p>
        )}
        <button class={canContinue ? 'secondary' : 'primary'} onClick={onAgain}>{t('actions.again')}</button>
        <button class="secondary" onClick={() => setSharing(true)}>{t('actions.share')}</button>
        <button class="secondary" onClick={onMemorial}>{t('actions.memorial')}</button>
        <button class="link" onClick={onMenu}>{t('actions.menu')}</button>
      </section>

      {sharing && <ShareDialog life={life} era={era} archetype={archetype} onClose={() => setSharing(false)} onUpdate={onUpdate} />}
    </div>
  )
}

function periodOf(age: number, era: EraDef): number {
  return age < era.stages.youth ? 0 : age < era.stages.adult ? 1 : age < era.stages.old ? 2 : 3
}

function FullRecord({ life, era, starred, onStar }: { life: LifeSummary; era: EraDef; starred: number[]; onStar: (i: number) => void }) {
  const { t } = useUi()
  const [filter, setFilter] = useState<Filter>('all')
  const [notes, setNotes] = useState<number[]>([])
  const line = (e: DiaryEntry) => diaryText(t, e, life.sex, life.region)
  const visible = life.diary
    .map((e, i) => [e, i] as const)
    .filter(([e]) => !e.key.startsWith('diary.stage_'))
    .filter(([e]) => (filter === 'all' ? true : filter === 'decisions' ? e.decision : e.topic === filter))
  const consequences = (i: number) => life.diary.map((e, j) => [e, j] as const).filter(([e]) => e.causedBy === i)
  const groups = [0, 1, 2, 3].map((p) => visible.filter(([e]) => periodOf(e.age, era) === p)).filter((g) => g.length)
  return (
    <section class="block">
      <h2 class="section-title">{t('record.title')}</h2>
      <div class="filters" role="group">
        {FILTERS.map((f) => (
          <button class={filter === f ? 'chip active' : 'chip'} aria-pressed={filter === f} onClick={() => setFilter(f)}>
            {t(`filter.${f}`)}
          </button>
        ))}
      </div>
      {groups.map((g) => (
        <details class="period" open={filter !== 'all'}>
          <summary>
            {t(`record.period.${periodOf(g[0][0].age, era)}`)} <span class="muted">· {g.length}</span>
          </summary>
          <ol class="diary">
            {g.map(([e, i]) => {
              const ev = e.eventId ? era.events.find((x) => x.id === e.eventId) : undefined
              const led = e.decision ? consequences(i) : []
              return (
                <li class={`${e.decision ? 'decision' : ''} ${e.major ? 'major' : ''}`}>
                  <span class="diary-age">{t('diary.age', { n: e.age })}</span>
                  <span>
                    {line(e)}
                    {led.length > 0 && (
                      <span class="led-to">
                        {' '}
                        {t('record.led_to')} {led.map(([c]) => `${t('diary.age', { n: c.age })} — ${line(c)}`).join('; ')}
                      </span>
                    )}
                    {ev?.historian_note && (
                      <>
                        {' '}
                        <button class="link small" aria-expanded={notes.includes(i)} onClick={() => setNotes(notes.includes(i) ? notes.filter((x) => x !== i) : [...notes, i])}>
                          {t('event.note')}
                        </button>
                        {notes.includes(i) && (
                          <span class="note small">
                            {t(`ev.${ev.id}.note`)} {ev.confidence && <em class="confidence">({t(`event.confidence.${ev.confidence}`)})</em>}
                          </span>
                        )}
                      </>
                    )}
                  </span>
                  <button class={starred.includes(i) ? 'star on' : 'star'} aria-pressed={starred.includes(i)} aria-label={starred.includes(i) ? t('record.unstar') : t('record.star')} onClick={() => onStar(i)}>
                    {starred.includes(i) ? '★' : '☆'}
                  </button>
                </li>
              )
            })}
          </ol>
        </details>
      ))}
    </section>
  )
}

function FamilyLink({ life }: { life: LifeSummary }) {
  const { t, lang } = useUi()
  const year = life.deathYear
  const person = (n: Npc) => (
    <li class={n.alive ? '' : 'gone'}>
      {nameOf(n.name, lang)} <span class="muted">· {t(`npc.${n.role}`, { sex: n.sex })}{n.alive ? `, ${t('life.age', { n: Math.max(0, npcAge(n, year)) })}` : ' †'}</span>
    </li>
  )
  const parents = life.npcs.filter((n) => n.role === 'father' || n.role === 'mother')
  const spouses = life.npcs.filter((n) => n.role === 'spouse')
  const children = life.npcs.filter((n) => n.role === 'child')
  return (
    <section class="block">
      <h2 class="section-title">{t('familylink.title')}</h2>
      <div class="minitree">
        {parents.length > 0 && <ul class="tree-level">{parents.map(person)}</ul>}
        <ul class="tree-level self">
          <li>
            <strong>{nameOf(life.name, lang)}</strong>
          </li>
          {spouses.map(person)}
        </ul>
        {children.length > 0 && (
          <ul class="tree-level">
            {children.map((c) => (
              <>
                {person(c)}
                {life.npcs
                  .filter((g) => g.role === 'grandchild' && g.parentId === c.id)
                  .map((g) => (
                    <ul class="tree-sub">{person(g)}</ul>
                  ))}
              </>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}

function ShareDialog({ life, era, archetype, onClose, onUpdate }: { life: LifeSummary; era: EraDef; archetype: string; onClose: () => void; onUpdate: (l: LifeSummary) => void }) {
  const { t, lang } = useUi()
  const [format, setFormat] = useState<CardFormat>('square')
  const [draft, setDraft] = useState(life.playerLine ?? '')
  const [copied, setCopied] = useState(false)
  const canvas = useRef<HTMLCanvasElement>(null)
  const clean = cleanLine(draft)
  const o = { sex: life.sex, region: life.region }
  const name = nameOf(life.name, lang)
  const years = `${formatYear(life.birthYear, lang)} — ${formatYear(life.deathYear, lang)}`
  const r = life.report
  const starred = (life.starred ?? []).map((i) => life.diary[i]).filter(Boolean)
  const facts = useMemo(() => {
    if (starred.length) return starred.slice(0, 3).map((e) => diaryText(t, e, life.sex, life.region))
    const out = [life.profession ? t(`prof.${life.profession}`, {}, o) : t(`class.${life.cls}`, {}, o)]
    out.push(t('facts.children_value', { n: r.facts.children, grand: r.facts.grandchildren }))
    out.push(`${t('summary.cause')}: ${t(`cause.${life.cause}`)}`)
    return out
  }, [life, lang])
  const patternLine = AXES.map((a) => t(`pattern.axis.${a}.${r.pattern.scores[a] > 0 ? 'right' : 'left'}`)).join(' · ')
  const dark = document.documentElement.dataset.theme === 'dark' || (!document.documentElement.dataset.theme && matchMedia('(prefers-color-scheme: dark)').matches)
  const shareText = `${t('share.text', { name, years, archetype })} https://thousands.life`

  useEffect(() => {
    if (!canvas.current) return
    drawCard(canvas.current, format, {
      name,
      years,
      place: `${t(`era.${life.era}`)} · ${t(`region.${life.region}`)}`,
      archetype,
      patternLine,
      facts,
      playerLine: clean.text,
      cta: t('share.card.cta'),
      region: life.region,
      sex: life.sex,
      seed: life.heroId,
      scene: { place: 'landmark', time: 'sunset', people: 3, props: era.id === 'E03' && life.region === 'egypt' ? ['palm', 'sun'] : ['sun'] },
      dark,
    })
  }, [format, clean.text, lang])

  const save = () => onUpdate({ ...life, playerLine: clean.text })
  const blob = () => new Promise<Blob | null>((res) => canvas.current?.toBlob(res, 'image/png'))
  const download = async () => {
    save()
    const b = await blob()
    if (!b) return
    const a = document.createElement('a')
    a.href = URL.createObjectURL(b)
    a.download = `thousands-of-lives-${format}.png`
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 1000)
  }
  const systemShare = async () => {
    save()
    const b = await blob()
    const file = b ? new File([b], 'thousands-of-lives.png', { type: 'image/png' }) : null
    try {
      if (file && navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], text: shareText })
      else await navigator.share?.({ text: shareText, url: 'https://thousands.life' })
    } catch {
      // Пользователь закрыл меню «поделиться».
    }
  }
  const copy = async () => {
    save()
    try {
      await navigator.clipboard.writeText(shareText)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }
  const [w, h] = CARD_SIZES[format]

  return (
    <div class="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div class="modal share" role="dialog" aria-modal="true" aria-labelledby="share-title">
        <div class="modal-body">
          <h2 id="share-title">{t('share.title')}</h2>
          <label class="field">
            <span>{t('share.prompt.one_line')}</span>
            <input type="text" maxLength={140} value={draft} onInput={(e) => setDraft(e.currentTarget.value)} />
          </label>
          {clean.filtered && <p class="small warn">{t('share.filtered')}</p>}
          <div class="filters" role="group" aria-label={t('share.format')}>
            {(['square', 'story', 'wide'] as CardFormat[]).map((f) => (
              <button class={format === f ? 'chip active' : 'chip'} aria-pressed={format === f} onClick={() => setFormat(f)}>
                {t(`share.format.${f}`)}
              </button>
            ))}
          </div>
          <canvas ref={canvas} class="card-preview" style={{ aspectRatio: `${w} / ${h}` }} role="img" aria-label={`${name}, ${years}. ${archetype}. ${facts.join('. ')}`} />
          <p class="small muted">{t('share.privacy')}</p>
          <div class="stack">
            {'share' in navigator && <button class="primary" onClick={systemShare}>{t('share.system')}</button>}
            <button class="secondary" onClick={download}>{t('share.download')}</button>
            <div class="share-row">
              <a class="secondary" href={`https://x.com/intent/post?text=${encodeURIComponent(shareText)}`} target="_blank" rel="noopener" onClick={save}>
                X
              </a>
              <a class="secondary" href={`https://www.threads.net/intent/post?text=${encodeURIComponent(shareText)}`} target="_blank" rel="noopener" onClick={save}>
                Threads
              </a>
            </div>
            <button class="secondary" onClick={copy}>{copied ? t('share.copied') : t('share.copy')}</button>
            <button class="link" onClick={() => { save(); onClose() }}>{t('share.close')}</button>
          </div>
        </div>
      </div>
    </div>
  )
}
