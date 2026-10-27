// Раздел «Награды»: сетка по группам, полученные — с датой, неполученные — серые с условием и подсказкой,
// секретные — «???». Счётчик «12 из 66», коллекция стран (где уже прожита жизнь), редкость из флага ach_rarity.
import { ERA_IDS } from '../content'
import { ACH_GROUPS, ACHIEVEMENTS } from '../engine/achievements'
import type { Earned } from '../engine/achievements'
import type { LifeSummary } from '../engine/types'
import { platform } from '../platform'
import { useUi } from './text'

export function Awards({ earned, memorial, onBack }: { earned: Earned[]; memorial: LifeSummary[]; onBack: () => void }) {
  const { t } = useUi()
  const got = new Map(earned.map((e) => [e.id, e]))
  const lived = new Set(memorial.map((l) => l.era))
  const rarity = platform.flags.ach_rarity ?? {}
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
    </div>
  )
}
