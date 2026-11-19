// Дети героя на вкладке «Люди»: воспитание (раз в год) и учёба (src/engine/children.ts). Не всплывает само -
// игрок заходит сюда, когда хочет; итоги учёбы и отказы приходят записями в дневник.
import { availableEducation, canUpbring, decideMatch, educationCost, isStudying, matchCost, setChildEducation, trackOf, upbringStyle, UPBRINGING_STYLES } from '../engine/children'
import { npcAge, regionOf } from '../engine/rules'
import type { EducationPath, EraDef, GameState, Npc } from '../engine/types'
import { formatMoney, nameOf } from '../i18n'
import { useUi } from './text'

export function Children({ state, era, onChange }: { state: GameState; era: EraDef; onChange: () => void }) {
  const { t } = useUi()
  const kids = state.hero.npcs.filter((n) => n.role === 'child' && n.alive && !n.away && (npcAge(n, state.year) < 25 || !!n.match))
  // «Детей пока нет» - только если их правда нет; взрослые дети без сватовства - просто без панели.
  const any = state.hero.npcs.some((n) => n.role === 'child' && n.alive)
  if (!kids.length) return state.hero.age >= 16 && !any ? <section class="panel children"><p class="small muted">{t('children.none')}</p></section> : null
  return (
    <section class="panel children">
      <h2 class="section-title">{t('children.title')}</h2>
      {/* Сватовство - первым: его ждут с решением. */}
      {kids.filter((k) => k.match).map((k) => (
        <MatchCard key={`m${k.id}`} state={state} era={era} child={k} onChange={onChange} />
      ))}
      <p class="small muted">{t('children.hint')}</p>
      <ul class="kids">
        {kids.map((k) => (
          <ChildCard key={k.id} state={state} era={era} child={k} onChange={onChange} />
        ))}
      </ul>
    </section>
  )
}

export function ChildCard({ state, era, child, onChange }: { state: GameState; era: EraDef; child: Npc; onChange: () => void }) {
  const { t, lang } = useUi()
  const coin = regionOf(era, state.hero.region).coin
  const age = npcAge(child, state.year)
  const e = child.education
  const u = child.upbringing
  const track = trackOf(era, e?.path)
  const path = track ? t(`children.path.${track.id}`) : ''
  const status = !track
    ? ''
    : isStudying(child)
      ? t('children.edu.studying', { path, n: Math.round((e?.progress ?? 0) * 100) })
      : e?.completedYear
        ? t('children.edu.done', { path, level: t(`children.level.${e.level}`), sex: child.sex })
        : e?.refusedYear
          ? t('children.edu.refused', { path, sex: child.sex })
          : ''
  const options = availableEducation(state, era, child)
  const upbring = canUpbring(state, child)
  return (
    <li class="person child-card">
      <span class="person-role">{t('npc.child', { sex: child.sex })}</span>
      <span class="person-name">{nameOf(child.name, lang)}</span>
      <span class="muted">
        {t('life.age', { n: Math.max(0, age) })}
        {child.traits.length ? ` · ${child.traits.map((tr) => t(`trait.${tr}`)).join(', ')}` : ''}
      </span>
      {status && <span class="small">{status}</span>}
      {age < 16 && u && <span class="small muted">{t('children.up', { a: u.affection, d: u.discipline, f: u.autonomy })}</span>}
      {age < 16 &&
        (upbring ? (
          <span class="choice-row">
            {UPBRINGING_STYLES.map((s) => (
              <button
                type="button"
                class="option small"
                onClick={() => {
                  if (upbringStyle(state, child.id, s)) onChange()
                }}
              >
                {t(`children.style.${s}`)}
              </button>
            ))}
          </span>
        ) : (
          <span class="small muted">{t('children.style.done')}</span>
        ))}
      {options.length > 0 && (
        <span class="choice-row">
          <span class="small">{t('children.edu.pick')}</span>
          {options.map((tr) => (
            <button
              type="button"
              class="option small"
              disabled={state.hero.money < educationCost(state, era, tr)}
              onClick={() => {
                if (setChildEducation(state, era, child.id, tr.id as EducationPath)) onChange()
              }}
            >
              <span class="option-label">{t(`children.path.${tr.id}`)}</span>
              <span class="option-desc">{t('children.edu.cost', { money: formatMoney(t, educationCost(state, era, tr), coin), yrs: tr.years })}</span>
            </button>
          ))}
        </span>
      )}
    </li>
  )
}

export function MatchCard({ state, era, child, onChange }: { state: GameState; era: EraDef; child: Npc; onChange: () => void }) {
  const { t, lang } = useUi()
  const m = child.match!
  const coin = regionOf(era, state.hero.region).coin
  const cost = matchCost(state, era, child, m.kind)
  return (
    <div class="match-card">
      <p>
        <strong>{nameOf(child.name, lang)}</strong> · {t(`children.match.kind.${m.kind}`)}
      </p>
      <p class="small">{t('children.match', { suitor: { name: m.suitor }, from: { key: `match.from.${m.cls}` } })}</p>
      <p class="small muted">
        {[
          cost > 0 ? t('children.match.dowry', { money: formatMoney(t, cost, coin) }) : cost < 0 ? t('children.match.gain', { money: formatMoney(t, -cost, coin) }) : '',
          m.kind !== 'equal' ? t(`children.match.hint.${m.kind}`).replace(/\.$/, '') : '',
          t('children.match.wait', { sex: child.sex }).replace(/\.$/, ''),
        ]
          .filter(Boolean)
          .join('. ')}
        .
      </p>
      <span class="choice-row">
        <button type="button" class="option small" disabled={cost > 0 && state.hero.money < cost} onClick={() => decideMatch(state, era, child.id, true) !== undefined && onChange()}>
          {t('children.match.accept')}
        </button>
        <button type="button" class="option small" onClick={() => decideMatch(state, era, child.id, false) !== undefined && onChange()}>
          {t('children.match.refuse')}
        </button>
      </span>
    </div>
  )
}
