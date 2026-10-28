import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import { axisLabel, survivalTable } from '../engine/report'
import { EXTERNAL, platform } from '../platform'
import { classKey, npcAge, regionOf, roleKey } from '../engine/rules'
import { AXES } from '../engine/types'
import type { DiaryEntry, EraDef, Icon, LifeSummary, Npc, SceneDef, Topic } from '../engine/types'
import { formatMoney, formatYear, hasKey, nameOf } from '../i18n'
import { dreamDef } from '../engine/dreams'
import { Scene } from '../pixel/Scene'
import { Avatar } from '../pixel/Avatar'
import { lifeMarks } from '../pixel/avatar'
import { BarList, LineChart, Numbers } from './charts'
import { CARD_SIZES, cleanLine, drawCard } from './shareCard'
import type { CardFormat } from './shareCard'
import { diaryText, useUi } from './text'

/** Адрес сайта — только в сборке для сайта; на порталах ссылок наружу нет. */
const SITE_NAME = 'thousands.life'
const SITE = `https://${SITE_NAME}`

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
  /** Приглашение оставить отзыв (показывается после первой жизни). */
  feedback?: preact.ComponentChildren
  /** Испытание после первой жизни — сразу под записью о смерти. */
  challenge?: preact.ComponentChildren
  onContinue?: () => void
  onAgain: () => void
  onMemorial: () => void
  onMenu: () => void
  onUpdate: (life: LifeSummary) => void
  /** Хроника страны кончилась: «Продолжение следует» и кнопка «Всё равно продолжить без хроники». */
  onOffChronicle?: () => void
  /** Награды: полученные в этой жизни, «почти получилось», цели на следующую жизнь. */
  awards?: { got: string[]; near: { id: string; progress: number }[]; goals: string[] }
}

export function Summary({ life, era, canContinue, onContinue, onAgain, onMemorial, onMenu, onUpdate, feedback, challenge, awards, onOffChronicle }: SummaryProps) {
  // Хроника страны кончилась: наследник есть, но его жизнь — уже за краем эпохи.
  const eraEnded = !!onOffChronicle && canContinue && life.diary.some((d) => d.key === 'diary.era_end')
  const { t, lang } = useUi()
  const r = life.report
  const o = { sex: life.sex, region: life.region, religion: life.religion }
  // Старые записи мемориала без сословия при рождении показывают итоговое.
  const birthCls = classKey(r.facts.birthCls ?? life.cls, life.tags)
  const name = nameOf(life.name, lang)
  const coin = regionOf(era, life.region).coin
  const [sharing, setSharing] = useState<false | 'life' | 'dream'>(false)
  const starred = life.starred ?? []
  const toggleStar = (i: number) => onUpdate({ ...life, starred: starred.includes(i) ? starred.filter((x) => x !== i) : [...starred, i] })
  const line = (e: DiaryEntry) => diaryText(t, e, life.sex, life.region, life.religion, lang)
  const archetype = t(`archetype.${r.pattern.code}`)
  const act = (action: string, run: () => void) => () => {
    platform.track('summary_action', { action })
    if (action === 'share') platform.track('share_open', { what: 'life' })
    if (action === 'share_dream') platform.track('share_open', { what: 'dream' })
    run()
  }

  const bio = r.biography.map((s) => {
    const params: Record<string, string | number | { key: string } | { name: string }> = { ...(s.params ?? {}), name, year: formatYear(life.birthYear, lang) }
    if (s.key === 'bio.history' && typeof s.params?.list === 'string') params.list = s.params.list.split('|').map((k) => t(k, {}, o)).join(', ')
    return t(s.key, params, o)
  })

  return (
    <div class="screen summary">
      {/* 1. Запись о смерти */}
      <section class="block record-card" aria-labelledby="sum-name">
        <Scene scene={{ place: 'tomb', time: 'sunset', people: 2, props: ['lamp', 'olive'] }} region={life.region} seed={life.heroId} still frame year={life.deathYear} />
        <p class="eyebrow">{t('summary.record', { n: String(life.record ?? 1).padStart(6, '0') })}</p>
        <h1 id="sum-name" class="hero-name big">{name}</h1>
        <p class="muted">
          {formatYear(life.birthYear, lang)} — {formatYear(life.deathYear, lang)} · {t('death.lived', { n: life.age })}
        </p>
        <p class="muted">
          {t(`era.${life.era}`)} · {t(`region.${life.region}`)} · {t(`summary.sex.${life.sex}`)} · {t(`class.${birthCls}`, {}, o)}
        </p>
        <p class="muted small">{t('summary.cls_line', { born: { key: `class.${birthCls}` }, died: { key: `class.${classKey(life.cls, life.tags)}` } }, o)}</p>
        <p class="bio-text">{bio.join(' ')}</p>
        <PortraitRibbon life={life} />
        {life.offChronicle !== undefined && <p class="small muted">{t('summary.off_chronicle', { year: formatYear(life.offChronicle, lang) })}</p>}
        {(life.erasLived?.length ?? 0) > 1 && <p class="small muted">{t('summary.path', { list: life.erasLived!.map((id) => t(`era.${id}`)).join(' → ') })}</p>}
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
          {life.age >= 15 && (
            // Сравнение со взрослыми: детская смертность занижает «среднюю жизнь», доживший до 15 жил дольше.
            <p>
              {life.age - r.comparison.expectedAdult > 0
                ? t('summary.cmp_adult_more', { n: life.age, d: life.age - r.comparison.expectedAdult }, o)
                : t('summary.cmp_adult_less', { n: life.age, d: r.comparison.expectedAdult - life.age }, o)}
            </p>
          )}
          {r.comparison.causeShare !== null && <p>{t('summary.cmp_cause', { n: r.comparison.causeShare })}</p>}
          <p class="confidence">{t('summary.source')}</p>
        </div>
      </section>

      {challenge}

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
                  .map((n) => `${nameOf(n.name, lang)} (${t(`npc.${roleKey(life.npcs, n)}`, { sex: n.sex }).toLowerCase()})`)
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

      {/* 2б. Сон о будущем: что приснилось, чем кончилось и как было на самом деле */}
      {life.dreamSeen && !life.dreamSeen.skipped && (
        <section class="block dream-block">
          <h2 class="section-title">{t('dream.title_block')}</h2>
          <p>
            <strong>{t(`dream.${life.dreamSeen.id}.title`)}</strong> — {t(`dream.result.${life.dreamSeen.outcome}`)} · {t('dream.score', { n: life.dreamSeen.score })}
          </p>
          <p class="small">{t(`dream.${life.dreamSeen.id}.truth`)}</p>
          <button class="secondary" onClick={act('share_dream', () => setSharing('dream'))}>{t('share.dream.button')}</button>
        </section>
      )}

      {/* 2а. Награды этой жизни, почти полученные и цели на следующую */}
      {awards && (awards.got.length > 0 || awards.near.length > 0 || awards.goals.length > 0) && (
        <section class="block awards-block">
          {awards.got.length > 0 && (
            <>
              <h2 class="section-title">{t('ach.got_here')}</h2>
              <ul class="ach-list">
                {awards.got.map((id) => (
                  <li class="ach got">
                    <span class="ach-icon" aria-hidden="true">🏅</span>
                    <span>
                      <strong>{t(`ach.${id}.title`, {}, o)}</strong>
                      <span class="muted small"> — {t(`ach.${id}.desc`, {}, o)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
          {awards.near.length > 0 && (
            <>
              <h2 class="section-title">{t('ach.near')}</h2>
              <ul class="ach-list">
                {awards.near.map(({ id, progress }) => (
                  <li class="ach">
                    <span class="ach-icon" aria-hidden="true">⏳</span>
                    <span>
                      <strong>{t(`ach.${id}.title`, {}, o)}</strong>
                      <span class="muted small"> — {t(`ach.${id}.desc`, {}, o)}</span>
                      <span class="ach-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)}>
                        <span style={{ width: `${Math.round(progress * 100)}%` }} />
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
          {awards.goals.length > 0 && (
            <>
              <h2 class="section-title">{t('ach.goals')}</h2>
              <ul class="ach-list">
                {awards.goals.map((id) => (
                  <li class="ach">
                    <span class="ach-icon" aria-hidden="true">🎯</span>
                    <span>
                      <strong>{t(`ach.${id}.title`, {}, o)}</strong>
                      <span class="muted small"> — {t(`ach.${id}.hint`, {}, o)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}

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
                  <Scene scene={entryScene(e, era)} region={life.region} seed={`${life.heroId}:${i}`} still />
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

      {/* 7. Графики — свёрнуты, чтобы итог читался быстро */}
      <details class="block fold" onToggle={(e) => e.currentTarget.open && platform.track('tab_open', { tab: 'charts' })}>
        <summary>
          <h2 class="section-title">{t('charts.title')}</h2>
        </summary>
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
      </details>

      {/* 8. Связь с родом */}
      <FamilyLink life={life} />

      {feedback}

      {eraEnded && (
        <section class="block note-box era-end">
          <h2>{t('era_end.title')}</h2>
          <p>{t('era_end.text', { n: life.generation, era: { key: `era.${life.era}` } }, o)}</p>
          <button class="secondary" onClick={act('off_chronicle', onOffChronicle!)}>{t('era_end.off')}</button>
          <p class="small muted">{t('era_end.off_hint')}</p>
        </section>
      )}

      {/* 9. Остальные действия */}
      <section class="block stack">
        {!(canContinue && onContinue) && <p class="muted">{t('actions.no_heirs')}</p>}
        {canContinue && onContinue && !eraEnded && <button class="secondary" onClick={act('reborn', onAgain)}>{t('actions.again')}</button>}
        <button class="secondary" onClick={act('memorial', onMemorial)}>{t('actions.memorial')}</button>
        <button class="link" onClick={act('menu', onMenu)}>{t('actions.menu')}</button>
      </section>

      {/* Главное действие всегда под рукой: панель прилипает к низу экрана. */}
      <div class="sticky-actions">
        {canContinue && onContinue && !eraEnded ? (
          <button class="primary" onClick={act('heir', onContinue)}>{t('actions.continue')}</button>
        ) : (
          <button class="primary" onClick={act('reborn', onAgain)}>{t('actions.again')}</button>
        )}
        <button class="secondary" onClick={act('share', () => setSharing('life'))}>{t('actions.share_short')}</button>
      </div>

      {sharing && <ShareDialog what={sharing} life={life} era={era} archetype={archetype} onClose={() => setSharing(false)} onUpdate={onUpdate} />}
    </div>
  )
}

/** Короткий итог ранней смерти: имя, годы, причина, исторический факт и две кнопки. */
export function EarlyDeath({ life, era, onAgain, onFull, challenge }: { life: LifeSummary; era: EraDef; onAgain: () => void; onFull: () => void; challenge?: preact.ComponentChildren }) {
  const { t, lang } = useUi()
  const o = { sex: life.sex, region: life.region, religion: life.religion }
  const name = nameOf(life.name, lang)
  // Сколько детей здесь доживало до 15 лет — по таблице дожития страны.
  const survived = Math.round(survivalTable(era, 16)[15] * 100)
  return (
    <div class="screen summary early-death">
      <section class="block record-card" aria-labelledby="early-name">
        <Scene scene={{ place: 'tomb', time: 'sunset', people: 2, props: ['lamp', 'olive'] }} region={life.region} seed={life.heroId} still frame year={life.deathYear} />
        <h1 id="early-name" class="hero-name big">{name}</h1>
        <p class="muted">
          {formatYear(life.birthYear, lang)} — {formatYear(life.deathYear, lang)} · {t('death.lived', { n: life.age })}
        </p>
        <p>
          <strong>{t('summary.cause')}:</strong> {t(`cause.${life.cause}`)}
        </p>
        <div class="note-box small">
          <p>{t('early.fact', { n: survived, region: { key: `region.${life.region}.in` } }, o)}</p>
          <p class="confidence">{t('summary.source')}</p>
        </div>
      </section>
      {challenge}
      <div class="sticky-actions">
        <button class="primary" onClick={onAgain}>{t('actions.again')}</button>
        <button class="secondary" onClick={onFull}>{t('early.full')}</button>
      </div>
    </div>
  )
}

function periodOf(age: number, era: EraDef): number {
  return age < era.stages.youth ? 0 : age < era.stages.adult ? 1 : age < era.stages.old ? 2 : 3
}

function FullRecord({ life, era, starred, onStar }: { life: LifeSummary; era: EraDef; starred: number[]; onStar: (i: number) => void }) {
  const { t, lang } = useUi()
  const [filter, setFilter] = useState<Filter>('all')
  const [notes, setNotes] = useState<number[]>([])
  const line = (e: DiaryEntry) => diaryText(t, e, life.sex, life.region, life.religion, lang)
  const visible = life.diary
    .map((e, i) => [e, i] as const)
    .filter(([e]) => !e.key.startsWith('diary.stage_'))
    .filter(([e]) => (filter === 'all' ? true : filter === 'decisions' ? e.decision : e.topic === filter))
  const consequences = (i: number) => life.diary.map((e, j) => [e, j] as const).filter(([e]) => e.causedBy === i)
  const groups = [0, 1, 2, 3].map((p) => visible.filter(([e]) => periodOf(e.age, era) === p)).filter((g) => g.length)
  return (
    <details class="block fold" onToggle={(e) => e.currentTarget.open && platform.track('tab_open', { tab: 'record' })}>
      <summary>
        <h2 class="section-title">{t('record.title')}</h2>
      </summary>
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
    </details>
  )
}

function FamilyLink({ life }: { life: LifeSummary }) {
  const { t, lang } = useUi()
  const year = life.deathYear
  const person = (n: Npc) => (
    <li class={n.alive ? '' : 'gone'}>
      {nameOf(n.name, lang)} <span class="muted">· {t(`npc.${roleKey(life.npcs, n)}`, { sex: n.sex })}{n.alive ? `, ${t('life.age', { n: Math.max(0, npcAge(n, year)) })}` : ' †'}</span>
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

/** Заголовок карточки сна: «Я помню школьную химию — и совершил прорыв в прошлом» или «Я плохо учился в школе…». */
function dreamHeadline(t: ReturnType<typeof useUi>['t'], life: LifeSummary): string {
  const d = life.dreamSeen!
  const o = { sex: life.sex, region: life.region, religion: life.religion }
  const subject = t(`share.dream.subject.${dreamDef(d.id)?.subject ?? 'math'}`)
  const kind = d.outcome === 'partial' && d.known ? 'known' : d.outcome
  return t(`share.dream.${kind}`, { subject }, o)
}

function ShareDialog({ what, life, era, archetype, onClose, onUpdate }: { what: 'life' | 'dream'; life: LifeSummary; era: EraDef; archetype: string; onClose: () => void; onUpdate: (l: LifeSummary) => void }) {
  const { t, lang } = useUi()
  const [format, setFormat] = useState<CardFormat>('square')
  const [draft, setDraft] = useState(life.playerLine ?? '')
  const [copied, setCopied] = useState(false)
  const canvas = useRef<HTMLCanvasElement>(null)
  const clean = cleanLine(draft)
  const o = { sex: life.sex, region: life.region, religion: life.religion }
  const name = nameOf(life.name, lang)
  const years = `${formatYear(life.birthYear, lang)} — ${formatYear(life.deathYear, lang)}`
  const r = life.report
  const starred = (life.starred ?? []).map((i) => life.diary[i]).filter(Boolean)
  const facts = useMemo(() => {
    if (starred.length) return starred.slice(0, 3).map((e) => diaryText(t, e, life.sex, life.region, life.religion, lang))
    const out = [life.profession ? t(`prof.${life.profession}`, {}, o) : t(`class.${classKey(life.cls, life.tags)}`, {}, o)]
    out.push(t('facts.children_value', { n: r.facts.children, grand: r.facts.grandchildren }))
    out.push(`${t('summary.cause')}: ${t(`cause.${life.cause}`)}`)
    return out
  }, [life, lang])
  const ds = what === 'dream' ? life.dreamSeen : undefined
  const headline = ds ? dreamHeadline(t, life) : archetype
  const patternLine = ds
    ? `${t(`dream.${ds.id}.title`)} — ${t(`dream.result.${ds.outcome}`)}`
    : AXES.map((a) => t(`pattern.axis.${a}.${r.pattern.scores[a] > 0 ? 'right' : 'left'}`)).join(' · ')
  const cardFacts = ds ? [t('share.dream.ask')] : facts
  const dark = document.documentElement.dataset.theme === 'dark' || (!document.documentElement.dataset.theme && matchMedia('(prefers-color-scheme: dark)').matches)
  // На порталах — без ссылки на сайт: платформа сама добавит ссылку на страницу игры у себя.
  const baseText = ds ? `${headline} ${t('share.dream.ask')}` : t('share.text', { name, years, archetype })
  const shareText = EXTERNAL ? `${baseText} ${SITE}` : baseText

  useEffect(() => {
    if (!canvas.current) return
    const el = canvas.current
    // Холст сам не перерисуется, когда догрузится шрифт «Летопись», — рисуем ещё раз после загрузки.
    const draw = () => drawCard(el, format, {
      name,
      years: ds ? t('share.dream.when', { year: formatYear(ds.year, lang) }) : years,
      place: `${t(`era.${ds?.era ?? life.era}`)} · ${t(`region.${life.region}`)}`,
      archetype: headline,
      patternLine,
      facts: cardFacts,
      playerLine: clean.text,
      cta: EXTERNAL ? `${t('share.card.cta')} · ${SITE_NAME}` : t('share.card.cta_portal'),
      region: life.region,
      sex: life.sex,
      seed: life.heroId,
      scene: ds ? { place: 'landmark', time: 'night', people: 1, props: [] } : { place: 'landmark', time: 'sunset', people: 3, props: era.id === 'E03' && life.region === 'egypt' ? ['palm', 'sun'] : ['sun'] },
      dark,
    })
    draw()
    if (document.fonts) Promise.all([document.fonts.load("600 40px 'Thousands Letopis'"), document.fonts.load("400 30px 'Alegreya Variable'")]).then(draw, () => {})
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
    platform.track('share_done', { what, format, method: 'download' })
    setTimeout(() => URL.revokeObjectURL(a.href), 1000)
  }
  const systemShare = async () => {
    save()
    const b = await blob()
    const file = b ? new File([b], 'thousands-of-lives.png', { type: 'image/png' }) : null
    const result = await platform.share({ text: shareText, url: EXTERNAL ? SITE : undefined, file: file ?? undefined })
    if (result === 'copied') setCopied(true)
    if (result !== 'failed') platform.track('share_done', { what, format, method: result === 'shared' ? 'system' : 'copy' })
  }
  const copy = async () => {
    save()
    // На портале к тексту добавляется ссылка-приглашение на страницу игры у платформы.
    const ok = (await platform.share({ text: shareText, copyOnly: EXTERNAL })) === 'copied'
    setCopied(ok)
    if (ok) platform.track('share_done', { what, format: 'text', method: 'copy' })
  }
  const [w, h] = CARD_SIZES[format]

  return (
    <div class="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div class="modal share" role="dialog" aria-modal="true" aria-labelledby="share-title">
        <div class="modal-body">
          <h2 id="share-title">{t(ds ? 'share.dream.title' : 'share.title')}</h2>
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
          <canvas ref={canvas} class="card-preview" style={{ aspectRatio: `${w} / ${h}` }} role="img" aria-label={`${name}, ${years}. ${headline}. ${cardFacts.join('. ')}`} />
          <p class="small muted">{t('share.privacy')}</p>
          <div class="stack">
            {EXTERNAL && 'share' in navigator && <button class="primary" onClick={systemShare}>{t('share.system')}</button>}
            <button class="secondary" onClick={download}>{t('share.download')}</button>
            {EXTERNAL && (
            <div class="share-row">
              <a class="secondary" href={`https://x.com/intent/post?text=${encodeURIComponent(shareText)}`} target="_blank" rel="noopener" onClick={save}>
                X
              </a>
              <a class="secondary" href={`https://www.threads.net/intent/post?text=${encodeURIComponent(shareText)}`} target="_blank" rel="noopener" onClick={save}>
                Threads
              </a>
            </div>
            )}
            <button class="secondary" onClick={copy}>{copied ? t('share.copied') : t('share.copy')}</button>
            <button class="link" onClick={() => { save(); onClose() }}>{t('share.close')}</button>
          </div>
        </div>
      </div>
    </div>
  )
}

/** Лента портретов: детство, юность, зрелость, старость — по истории героя, без хранения картинок. */
function PortraitRibbon({ life }: { life: LifeSummary }) {
  const { t } = useUi()
  const ages = [6, 17, 32, 50, 68].filter((a) => a < life.age)
  if (life.age >= 2) ages.push(life.age)
  const shown = ages.slice(-5)
  if (shown.length < 2) return null
  const birthCls = life.report.facts.birthCls ?? life.cls
  return (
    <div class="portrait-ribbon" role="list" aria-label={t('summary.portraits')}>
      {shown.map((age, i) => {
        const y = life.history.find((h) => h.age === age)
        const last = i === shown.length - 1
        return (
          <figure role="listitem">
            <Avatar
              input={{
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
              }}
              label={t('life.portrait', { n: age })}
            />
            <figcaption class="small muted">{t('summary.portrait_age', { n: age })}</figcaption>
          </figure>
        )
      })}
    </div>
  )
}
