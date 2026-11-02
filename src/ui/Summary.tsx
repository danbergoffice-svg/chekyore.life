import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import { survivalTable } from '../engine/report'
import { EXTERNAL, platform } from '../platform'
import { classKey, npcAge, roleKey } from '../engine/rules'
import type { DiaryEntry, EraDef, LifeSummary, Npc, SceneDef, Topic } from '../engine/types'
import { formatYear, nameOf } from '../i18n'
import { dreamDef } from '../engine/dreams'
import { Scene } from '../pixel/Scene'
import { CARD_SIZES, cleanLine, drawCard } from './shareCard'
import { lifeCardData } from './lifeCard'
import { QUOTES } from '../content/quotes'
import type { CardFormat } from './shareCard'
import { diaryText, useUi } from './text'
import { Icon as Glyph } from './Icon'
import { Farewell, StoryCards, storyCards, Tombstone } from './Epilogue'
import { lifeHighlights } from '../engine/highlights'

/** Адрес сайта - только в сборке для сайта; на порталах ссылок наружу нет. */
const SITE_NAME = 'thousands.life'
const SITE = `https://${SITE_NAME}`

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
  /** Испытание после первой жизни - сразу под записью о смерти. */
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
  // Хроника страны кончилась: наследник есть, но его жизнь - уже за краем эпохи.
  const eraEnded = !!onOffChronicle && canContinue && life.diary.some((d) => d.key === 'diary.era_end')
  const { t, lang } = useUi()
  const r = life.report
  const o = { sex: life.sex, region: life.region, religion: life.religion }
  // Старые записи мемориала без сословия при рождении показывают итоговое.
  const birthCls = classKey(r.facts.birthCls ?? life.cls, life.tags)
  const name = nameOf(life.name, lang)
  const [sharing, setSharing] = useState<false | 'life' | 'dream'>(false)
  const starred = life.starred ?? []
  const toggleStar = (i: number) => onUpdate({ ...life, starred: starred.includes(i) ? starred.filter((x) => x !== i) : [...starred, i] })
  const archetype = t(`archetype.${r.pattern.code}`)
  const act = (action: string, run: () => void) => () => {
    platform.track('summary_action', { action })
    if (action === 'share') platform.track('share_open', { what: 'life' })
    if (action === 'share_dream') platform.track('share_open', { what: 'dream' })
    run()
  }

  // Яркие факты: первый - на надгробие.
  const hooks = useMemo(() => lifeHighlights(life).filter((h) => !h.key.startsWith('hook.lived')).map((h) => t(h.key, h.params, o)), [life.heroId, lang])
  const cards = useMemo(() => {
    const quote = lifeCardData(life, t, lang, { quotes: QUOTES, playerLine: '', site: '', scene: { place: 'landmark', time: 'day', people: 3 } }).quotes[0]
    return storyCards(t, life, era, lang, entryScene, quote)
  }, [life.heroId, lang])

  const bio = r.biography.map((s) => {
    const params: Record<string, string | number | { key: string } | { name: string }> = { ...(s.params ?? {}), name, year: formatYear(life.birthYear, lang) }
    if (s.key === 'bio.history' && typeof s.params?.list === 'string') params.list = s.params.list.split('|').map((k) => t(k, {}, o)).join(', ')
    return t(s.key, params, o)
  })

  return (
    <div class="screen summary">
      {/* 1. Надгробие: портрет, имя, годы, главный факт жизни */}
      <Tombstone life={life} epitaph={hooks[0] ?? ''} />
      <section class="block record-card">
        <p class="eyebrow">{t('summary.record', { n: String(life.record ?? 1).padStart(6, '0') })}</p>
        <p class="muted small">
          {t(`era.${life.era}`)} · {t(`region.${life.region}`)} · {t(`class.${birthCls}`, {}, o)}
          {birthCls !== classKey(life.cls, life.tags) ? ` → ${t(`class.${classKey(life.cls, life.tags)}`, {}, o)}` : ''}
        </p>
        <p class="bio-text">{bio.join(' ')}</p>
        {life.offChronicle !== undefined && <p class="small muted">{t('summary.off_chronicle', { year: formatYear(life.offChronicle, lang) })}</p>}
        {(life.erasLived?.length ?? 0) > 1 && <p class="small muted">{t('summary.path', { list: life.erasLived!.map((id) => t(`era.${id}`)).join(' → ') })}</p>}
        <details class="compare">
          <summary class="small">{t('summary.compare')}</summary>
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
        </details>
      </section>

      {/* 2. Жизнь в карточках: листаются как сторис */}
      <StoryCards life={life} cards={cards} />

      {/* 3. Слова у могилы, что осталось, 100 ровесников */}
      <Farewell life={life} era={era} />

      {challenge}

      {/* 2б. Сон о будущем: что приснилось, чем кончилось и как было на самом деле */}
      {life.dreamSeen && !life.dreamSeen.skipped && (
        <section class="block dream-block">
          <h2 class="section-title">{t('dream.title_block')}</h2>
          <p>
            <strong>{t(`dream.${life.dreamSeen.id}.title`)}</strong> - {t(`dream.result.${life.dreamSeen.outcome}`)} · {t('dream.score', { n: life.dreamSeen.score })}
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
                    <span class="ach-icon"><Glyph name="medal" /></span>
                    <span>
                      <strong>{t(`ach.${id}.title`, {}, o)}</strong>
                      <span class="muted small"> - {t(`ach.${id}.desc`, {}, o)}</span>
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
                    <span class="ach-icon"><Glyph name="hourglass" /></span>
                    <span>
                      <strong>{t(`ach.${id}.title`, {}, o)}</strong>
                      <span class="muted small"> - {t(`ach.${id}.desc`, {}, o)}</span>
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
                    <span class="ach-icon"><Glyph name="target" /></span>
                    <span>
                      <strong>{t(`ach.${id}.title`, {}, o)}</strong>
                      <span class="muted small"> - {t(`ach.${id}.hint`, {}, o)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}

      {/* 6. Полная запись жизни */}
      <FullRecord life={life} era={era} starred={starred} onStar={toggleStar} />

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
  // Сколько детей здесь доживало до 15 лет - по таблице дожития страны.
  const survived = Math.round(survivalTable(era, 16)[15] * 100)
  return (
    <div class="screen summary early-death">
      <section class="block record-card" aria-labelledby="early-name">
        <Scene scene={{ place: 'tomb', time: 'sunset', people: 2, props: ['lamp', 'olive'] }} region={life.region} seed={life.heroId} still frame year={life.deathYear} />
        <h1 id="early-name" class="hero-name big">{name}</h1>
        <p class="muted">
          {formatYear(life.birthYear, lang)} - {formatYear(life.deathYear, lang)} · {t('death.lived', { n: life.age })}
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
                        {t('record.led_to')} {led.map(([c]) => `${t('diary.age', { n: c.age })} - ${line(c)}`).join('; ')}
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

/** Заголовок карточки сна: «Я помню школьную химию - и совершил прорыв в прошлом» или «Я плохо учился в школе…». */
function dreamHeadline(t: ReturnType<typeof useUi>['t'], life: LifeSummary): string {
  const d = life.dreamSeen!
  const o = { sex: life.sex, region: life.region, religion: life.religion }
  const subject = t(`share.dream.subject.${dreamDef(d.id)?.subject ?? 'math'}`)
  const kind = d.outcome === 'partial' && d.known ? 'known' : d.outcome
  return t(`share.dream.${kind}`, { subject }, o)
}

function ShareDialog({ what, life, era, archetype, onClose, onUpdate }: { what: 'life' | 'dream'; life: LifeSummary; era: EraDef; archetype: string; onClose: () => void; onUpdate: (l: LifeSummary) => void }) {
  const { t, lang } = useUi()
  const [format, setFormat] = useState<CardFormat>('story')
  const [draft, setDraft] = useState(life.playerLine ?? '')
  const [copied, setCopied] = useState(false)
  const canvas = useRef<HTMLCanvasElement>(null)
  const clean = cleanLine(draft)
  const o = { sex: life.sex, region: life.region, religion: life.religion }
  const name = nameOf(life.name, lang)
  const years = `${formatYear(life.birthYear, lang)} - ${formatYear(life.deathYear, lang)}`
  const ds = what === 'dream' ? life.dreamSeen : undefined
  // Карточка: главное дело жизни, самый яркий факт, афоризм под эту жизнь, портреты по возрастам.
  const card = useMemo(
    () =>
      lifeCardData(life, t, lang, {
        quotes: QUOTES,
        playerLine: clean.text,
        site: EXTERNAL ? SITE_NAME : t('share.card.cta_portal'),
        dream: !!ds,
        scene: ds ? { place: 'landmark', time: 'night', people: 1, props: [] } : { place: 'landmark', time: 'sunset', people: 3, props: era.id === 'E03' && life.region === 'egypt' ? ['palm', 'sun'] : ['sun'] },
      }),
    [life, lang, clean.text, what],
  )
  const headline = ds ? dreamHeadline(t, life) : card.hook
  // На порталах - без ссылки на сайт: платформа сама добавит ссылку на страницу игры у себя.
  const quote = card.quotes[0]
  const baseText = ds
    ? `${headline} ${t('share.dream.ask')}`
    : t('share.text', { name, years, archetype: `${card.title}. ${card.hook}${quote ? `. ${quote.text} - ${quote.author}` : ''}` })
  const shareText = EXTERNAL ? `${baseText} ${SITE}` : baseText

  useEffect(() => {
    if (!canvas.current) return
    const el = canvas.current
    // Холст сам не перерисуется, когда догрузится шрифт «Летопись», - рисуем ещё раз после загрузки.
    const draw = () => drawCard(el, format, card)
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
          <canvas ref={canvas} class="card-preview" style={{ aspectRatio: `${w} / ${h}` }} role="img" aria-label={[`${name}, ${years}`, card.title, card.hook, quote && `${quote.text} - ${quote.author}`].filter(Boolean).map((x) => String(x).replace(/[.!?…]+$/, '')).join('. ')} />
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
