// Вкладка «Близкие» (20.11): все люди героя карточками с портретами, сгруппированы - «Дом» (кто живёт под одной крышей),
// «Рядом», «Далеко», «Память». На карточке - шкала «тепло — холодно» (Npc.attitude). Касание открывает шторку:
// подробности и что можно сделать (engine/kin.ts), детям - воспитание, учёба, учитель, спорт или воинское учение,
// присмотр, учение своему делу (engine/children.ts). Сватовство, которое ждёт ответа, - первым, как раньше.
import { useState } from 'preact/hooks'
import { CARE, ownTradeTrack, setOversee, setTraining, setTutor, teachOwnTrade, trainingCost, tutorCost, isStudying } from '../engine/children'
import { callDoctor, canCallDoctor, caredThisYear, doctorCost, doKin, kinActions, kinCost, kinLock } from '../engine/kin'
import type { KinAction } from '../engine/kin'
import { npcAge, regionOf, roleKey } from '../engine/rules'
import type { EraDef, GameState, Npc } from '../engine/types'
import { formatMoney, nameOf } from '../i18n'
import { Avatar } from '../pixel/AvatarView'
import { ChildCard, MatchCard } from './Children'
import { Sheet } from './Holdings'
import { livesWithHero, npcFacts, npcMore } from './Life'
import { attitudeText, useUi } from './text'

type Group = 'home' | 'near' | 'far' | 'dead'

export function KinTab({ state, era, onChange }: { state: GameState; era: EraDef; onChange: () => void }) {
  const { t } = useUi()
  const [open, setOpen] = useState<string | null>(null)
  const hero = state.hero
  const groupOf = (n: Npc): Group => (!n.alive ? 'dead' : n.away ? 'far' : livesWithHero(hero, n, state.year) ? 'home' : 'near')
  const groups: Record<Group, Npc[]> = { home: [], near: [], far: [], dead: [] }
  for (const n of hero.npcs) groups[groupOf(n)].push(n)
  const matches = hero.npcs.filter((n) => n.role === 'child' && n.alive && !n.away && n.match)
  const cur = hero.npcs.find((n) => n.id === open)
  if (!hero.npcs.length) return <section class="panel"><p class="muted">{t('people.empty')}</p></section>
  return (
    <section class="panel kin">
      {matches.map((k) => (
        <MatchCard key={`m${k.id}`} state={state} era={era} child={k} onChange={onChange} />
      ))}
      <p class="small muted">{t('kin.hint')}</p>
      {(['home', 'near', 'far'] as Group[]).map((g) =>
        groups[g].length ? (
          <>
            <h2 class="section-title">{t(`kin.group.${g}`)}</h2>
            <div class="kin-grid">{groups[g].map((n) => <KinCard state={state} n={n} onOpen={() => setOpen(n.id)} />)}</div>
          </>
        ) : null,
      )}
      {groups.dead.length > 0 && (
        <details class="kin-dead">
          <summary class="section-title">{t('kin.group.dead')} ({groups.dead.length})</summary>
          <div class="kin-grid">{groups.dead.map((n) => <KinCard state={state} n={n} onOpen={() => setOpen(n.id)} />)}</div>
        </details>
      )}
      {cur && <KinSheet state={state} era={era} n={cur} onChange={onChange} onClose={() => setOpen(null)} />}
    </section>
  )
}

/** Портрет человека из семьи героя (живописный, как у героя; умершие - приглушённые). */
function portrait(state: GameState, n: Npc) {
  const age = Math.max(0, n.alive ? npcAge(n, state.year) : (n.deathYear ?? state.year) - n.birthYear)
  return { region: state.hero.region, sex: n.sex, age, seed: n.id, cls: state.hero.cls, married: !!n.married || n.role === 'spouse', dead: !n.alive, ill: !!n.ill }
}

/** Шкала «тепло — холодно»: середина - безразлично, вправо - теплее. */
function Warmth({ n }: { n: Npc }) {
  const { t } = useUi()
  const v = Math.max(-100, Math.min(100, n.attitude))
  return (
    <span class="kin-warmth" title={attitudeText(t, n)} aria-label={attitudeText(t, n)}>
      <span class="kin-warmth-track">
        <span class={`kin-warmth-fill ${v >= 0 ? 'warm' : 'cold'}`} style={v >= 0 ? { left: '50%', width: `${v / 2}%` } : { left: `${50 + v / 2}%`, width: `${-v / 2}%` }} />
      </span>
      <span class="kin-warmth-label">{attitudeText(t, n)}</span>
    </span>
  )
}

function KinCard({ state, n, onOpen }: { state: GameState; n: Npc; onOpen: () => void }) {
  const { t, lang } = useUi()
  const hero = state.hero
  return (
    <button type="button" class={`kin-card${n.alive ? '' : ' dead'}`} onClick={onOpen}>
      <span class="kin-photo">
        <Avatar input={portrait(state, n)} label={nameOf(n.name, lang)} />
      </span>
      <span class="kin-name">{nameOf(n.name, lang)}</span>
      <span class="kin-role">{t(`npc.${roleKey(hero.npcs, n)}`, { sex: n.sex })}{n.alive ? ` · ${t('life.age', { n: Math.max(0, npcAge(n, state.year)) })}` : ''}</span>
      {n.alive && <Warmth n={n} />}
      {n.alive && n.ill && <span class="small ill-badge">{t('people.ill_badge', { sex: n.sex })}</span>}
      {n.alive && isStudying(n) && <span class="small muted">{t('kin.studying')}</span>}
    </button>
  )
}

function KinSheet({ state, era, n, onChange, onClose }: { state: GameState; era: EraDef; n: Npc; onChange: () => void; onClose: () => void }) {
  const { t, lang } = useUi()
  const hero = state.hero
  const coin = regionOf(era, hero.region).coin
  const money = (x: number) => formatMoney(t, x, coin)
  const actions = kinActions(state, n)
  const age = npcAge(n, state.year)
  const child = n.role === 'child' && n.alive && !n.away
  const act = (fn: () => unknown) => {
    fn()
    onChange()
  }
  return (
    <Sheet title={nameOf(n.name, lang)} onClose={onClose}>
      <div class="kin-sheet-head">
        <span class="kin-photo big">
          <Avatar input={portrait(state, n)} label={nameOf(n.name, lang)} />
        </span>
        <div>
          <p class="small"><strong>{t(`npc.${roleKey(hero.npcs, n)}`, { sex: n.sex })}</strong> · {npcFacts(t, lang, n, state.year)}</p>
          <p class="small muted">{npcMore(t, lang, hero.npcs, n)}</p>
          {n.alive && <Warmth n={n} />}
        </div>
      </div>
      {n.alive && n.ill && !n.away && (
        <div class="hold-offers">
          <button type="button" class="option small" disabled={!canCallDoctor(state, n)} onClick={() => act(() => callDoctor(state, n.id))}>
            <span class="option-label">{t(n.ill.doctor ? 'kin.doctor.done' : 'kin.doctor')}</span>
            <span class="option-desc">{n.ill.doctor ? t('kin.doctor.done_desc') : t('kin.doctor.desc', { money: money(doctorCost(state)) })}</span>
          </button>
        </div>
      )}
      {actions.length > 0 && (
        <>
          <h3 class="arms-row-title">{t('kin.actions')}</h3>
          {caredThisYear(state, n) && <p class="small muted">{t('kin.lock.year')}</p>}
          <div class="hold-offers">
            {actions.map((a: KinAction) => {
              const cost = kinCost(state, a)
              const lock = kinLock(state, n, a)
              return (
                <button type="button" class="option small" disabled={!!lock} onClick={() => act(() => doKin(state, n.id, a))}>
                  <span class="option-label">{t(`kin.act.${a}`, { sex: n.sex })}</span>
                  <span class="option-desc">{t(`kin.act.${a}.desc`, { sex: n.sex })}{cost ? ` · ${money(cost)}` : ''}</span>
                </button>
              )
            })}
          </div>
        </>
      )}
      {child && <ChildCare state={state} era={era} n={n} age={age} money={money} act={act} />}
      {child && (age < 25 || n.match) && (
        <ul class="kids">
          <ChildCard state={state} era={era} child={n} onChange={onChange} />
        </ul>
      )}
    </Sheet>
  )
}

/** Забота о ребёнке: учитель, спорт или воинское учение, присмотр за учёбой, учение своему делу. */
function ChildCare({ state, era, n, age, money, act }: { state: GameState; era: EraDef; n: Npc; age: number; money: (x: number) => string; act: (fn: () => unknown) => void }) {
  const { t } = useUi()
  const own = ownTradeTrack(state, era)
  const canOwn = !!own && !isStudying(n) && !n.education?.completedYear && !n.education?.refusedYear && age >= own.ages[0] && age <= own.ages[1]
  const rows: preact.ComponentChildren[] = []
  if (age < 16)
    rows.push(
      <button type="button" class={`option small${n.tutor ? ' on' : ''}`} aria-pressed={!!n.tutor} disabled={!n.tutor && state.hero.money < tutorCost(state)} onClick={() => act(() => setTutor(state, n.id, !n.tutor))}>
        <span class="option-label">{t(n.tutor ? 'kin.tutor.off' : 'kin.tutor.on', { sex: n.sex })}</span>
        <span class="option-desc">{t('kin.tutor.desc', { money: money(tutorCost(state)) })}</span>
      </button>,
    )
  if (age >= CARE.trainFrom && age <= CARE.trainTo)
    for (const kind of ['sport', 'military'] as const)
      rows.push(
        <button type="button" class={`option small${n.training === kind ? ' on' : ''}`} aria-pressed={n.training === kind} onClick={() => act(() => setTraining(state, n.id, n.training === kind ? null : kind))}>
          <span class="option-label">{t(n.training === kind ? 'kin.train.stop' : `kin.train.${kind}`)}</span>
          <span class="option-desc">{t(`kin.train.${kind}.desc`, { money: money(trainingCost(state)), n: CARE.trainYears })}</span>
        </button>,
      )
  if (isStudying(n))
    rows.push(
      <button type="button" class={`option small${n.oversee ? ' on' : ''}`} aria-pressed={!!n.oversee} onClick={() => act(() => setOversee(state, n.id, !n.oversee))}>
        <span class="option-label">{t(n.oversee ? 'kin.oversee.off' : 'kin.oversee.on')}</span>
        <span class="option-desc">{t('kin.oversee.desc', { sex: n.sex })}</span>
      </button>,
    )
  if (canOwn)
    rows.push(
      <button type="button" class="option small" onClick={() => act(() => teachOwnTrade(state, era, n.id))}>
        <span class="option-label">{t('kin.own.on', { path: t(`children.path.${own!.id}`) })}</span>
        <span class="option-desc">{t('kin.own.desc')}</span>
      </button>,
    )
  if (!rows.length) return null
  return (
    <>
      <h3 class="arms-row-title">{t('kin.care')}</h3>
      <div class="hold-offers">{rows}</div>
    </>
  )
}
