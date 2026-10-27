// Раздел «Награды»: сетка по группам, полученные — с датой, неполученные — серые с условием и подсказкой,
// секретные — «???». Счётчик «12 из 66», коллекция стран (где уже прожита жизнь), редкость из флага ach_rarity.
import { ERA_IDS } from '../content'
import { ACH_GROUPS, ACHIEVEMENTS, schoolProgram } from '../engine/achievements'
import type { Earned } from '../engine/achievements'
import type { LifeSummary } from '../engine/types'
import { platform } from '../platform'
import { useUi } from './text'

export function Awards({ earned, memorial, onBack, onTrain }: { earned: Earned[]; memorial: LifeSummary[]; onBack: () => void; onTrain?: (id: string) => void }) {
  const { t } = useUi()
  const got = new Map(earned.map((e) => [e.id, e]))
  const lived = new Set(memorial.map((l) => l.era))
  const rarity = platform.flags.ach_rarity ?? {}
  const school = schoolProgram(memorial)
  return (
    <div class="screen awards">
      <button class="link back" onClick={onBack}>
        ← {t('common.back')}
      </button>
      <h1>{t('ach.title')}</h1>
      <p class="lead">{t('ach.count', { n: got.size, total: ACHIEVEMENTS.length })}</p>

      <section class="block">
        <h2 class="section-title">{t('ach.collection')}</h2>
        <ul class="era-chips">
          {ERA_IDS.map((id) => (
            <li class={lived.has(id) ? 'lived' : ''}>{t(`era.${id}`)}</li>
          ))}
        </ul>
      </section>

      {ACH_GROUPS.map((g) => (
        <section class="block">
          <h2 class="section-title">{t(`ach.group.${g}`)}</h2>
          <ul class="ach-grid">
            {ACHIEVEMENTS.filter((a) => a.group === g).map((a) => {
              const e = got.get(a.id)
              const hidden = a.secret && !e
              const share = rarity[a.id]
              return (
                <li class={e ? 'ach got' : 'ach'}>
                  <span class="ach-icon" aria-hidden="true">
                    {e ? '🏅' : hidden ? '❔' : '🔒'}
                  </span>
                  <span>
                    <strong>{hidden ? '???' : t(`ach.${a.id}.title`)}</strong>
                    {!hidden && <span class="small muted ach-desc">{t(`ach.${a.id}.desc`)}</span>}
                    {!e && !hidden && <span class="small ach-hint">{t(`ach.${a.id}.hint`)}</span>}
                    {a.hard && !e && <span class="small muted">{t('ach.hard')}</span>}
                    {share !== undefined && <span class="small muted">{t('ach.rarity', { n: Math.max(1, Math.round(share * 100)) })}</span>}
                  </span>
                </li>
              )
            })}
          </ul>
        </section>
      ))}

      <section class="block">
        <h2 class="section-title">{t('school.title')}</h2>
        <p class="small muted">{t('school.lead')}</p>
        {school.seen.size > 0 && <p class="small">{t('school.train')}</p>}
        {school.subjects.map((x) => (
          <>
            <h3 class="school-subject">{t('school.count', { subject: t(`school.subject.${x.subject}`), n: x.ids.filter((id) => school.solved.has(id)).length, total: x.ids.length })}</h3>
            <ul class="school-grid" aria-label={t(`school.subject.${x.subject}`)}>
              {x.ids.map((id) => (
                <li class={school.solved.has(id) ? 'solved' : school.seen.has(id) ? 'seen' : ''}>
                  {school.seen.has(id) && onTrain ? (
                    <button type="button" class="school-train" onClick={() => onTrain(id)} aria-label={t('school.train_aria', { title: t(`school.${id}`) })}>
                      {t(`school.${id}`)} <span aria-hidden="true">↻</span>
                    </button>
                  ) : school.seen.has(id) ? (
                    t(`school.${id}`)
                  ) : (
                    '???'
                  )}
                </li>
              ))}
            </ul>
          </>
        ))}
      </section>
    </div>
  )
}
