// Партия в кости (ТЗ «Кости», 04.11): две кости у тебя против двух у соперника, до двух побед из трёх бросков.
// Мастерство открывает приёмы: 20 - видно характер соперника, 40 - переброс, 60 - подменить кость (могут поймать),
// 80 - видно чужое жульничество. После проигрыша - «Отыграться» (азарт растёт вдвое). «Положиться на судьбу» -
// партия без мини-игры. Каждая партия сразу записывается (onGame), чтобы следующая ставка считалась от новых денег.
// На кнопке ставки - что ставишь (с ценой) и сколько получишь при выигрыше; проиграл скотину - можно откупиться деньгами.
import { useMemo, useState } from 'preact/hooks'
import type { GameState } from '../engine/types'
import { canRansom, catchChance, diceOf, pickOpponent, SKILL, STAKE_LUST } from '../engine/dice'
import type { DiceResult, Opponent, Stake } from '../engine/dice'
import { formatMoney, nameOf } from '../i18n'
import { useUi } from './text'

type Pair = [number, number]
interface Round { me: Pair; them?: Pair; theyCheated?: boolean }

const MAX_GAMES = 3
const die = () => 1 + Math.floor(Math.random() * 6)
const sum = (p: Pair) => p[0] + p[1]

function Die({ v, rolling }: { v: number; rolling?: boolean }) {
  // Точки на гранях 1–6 по сетке 3×3.
  const PIPS: Record<number, number[]> = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] }
  return (
    <span class={`die ${rolling ? 'rolling' : ''}`} role="img" aria-label={String(v)}>
      {Array.from({ length: 9 }, (_, i) => <span class={PIPS[v]?.includes(i) ? 'pip on' : 'pip'} />)}
    </span>
  )
}

export function DiceGame(props: { state: GameState; stakes: Stake[]; coin: string; onGame: (r: DiceResult) => void; onDone: () => void }) {
  const { t, lang } = useUi()
  const hero = props.state.hero
  const d = diceOf(hero)
  const o = { sex: hero.sex, region: hero.region, religion: hero.religion }
  const [games, setGames] = useState(0)
  const [chase, setChase] = useState(false)
  const [stake, setStake] = useState<Stake | null>(null)
  const opponent = useMemo<Opponent>(() => pickOpponent(Math.random), [games])
  const [rounds, setRounds] = useState<Round[]>([])
  const [rerolls, setRerolls] = useState(0)
  const [cheated, setCheated] = useState(false)
  const [last, setLast] = useState<DiceResult | null>(null)
  // Проиграл скотину, а деньги есть: отдать её или откупиться её ценой.
  const [ransom, setRansom] = useState<DiceResult | null>(null)
  // Кто сейчас бросает: его кости крутятся и мелькают гранями (у соперника - тоже).
  const [rolling, setRolling] = useState<'me' | 'them' | null>(null)
  const [, flick] = useState(0)

  const freeRerolls = (d.skill >= SKILL.reroll ? 1 : 0) + (hero.tags.includes('lucky_dice') ? 1 : 0)
  const score = (who: 'me' | 'them') => rounds.filter((r) => r.them && sum(r.me) !== sum(r.them) && (who === 'me' ? sum(r.me) > sum(r.them) : sum(r.me) < sum(r.them))).length
  const cur = rounds[rounds.length - 1]
  const waitingThem = !!cur && !cur.them

  const stakeLabel = (s: Stake) => {
    const who = s.npcId ? hero.npcs.find((n) => n.id === s.npcId) : undefined
    return t(`dice.stake.${s.kind}`, { money: formatMoney(t, s.amount, props.coin), who: { name: who?.name ?? '' }, animal: { key: `animal.${s.animal ?? 'horse'}` } }, o)
  }
  const start = (s: Stake) => {
    setStake(s)
    setRounds([])
    setRerolls(0)
    setCheated(false)
    setLast(null)
  }
  const record = (r: DiceResult) => {
    setRansom(null)
    props.onGame(r)
    setLast(r)
    setGames((n) => n + 1)
    setStake(null)
    setChase(false)
  }
  const finish = (r: DiceResult) => {
    if (!(r.won && !r.caught) && canRansom(hero, r.stake)) {
      setStake(null)
      return setRansom(r)
    }
    record(r)
  }
  const fate = (s: Stake) => {
    let me = die() + die()
    let them = opponent === 'cheat' ? Math.max(die() + die(), die() + die()) : die() + die()
    while (me === them) {
      me = die() + die()
      them = die() + die()
    }
    finish({ stake: s, won: me > them, cheated: false, caught: false, exposed: false, fate: true, chase, opponent })
  }
  const shake = (who: 'me' | 'them', then: () => void) => {
    setRolling(who)
    const id = setInterval(() => flick((n) => n + 1), 70)
    setTimeout(() => {
      clearInterval(id)
      setRolling(null)
      then()
    }, 450)
  }
  const throwMine = () => shake('me', () => setRounds([...rounds, { me: [die(), die()] }]))
  const reroll = () => shake('me', () => {
    setRerolls(rerolls + 1)
    setRounds([...rounds.slice(0, -1), { me: [die(), die()] }])
  })
  const cheat = () => {
    const me: Pair = [...cur.me] as Pair
    me[me[0] < me[1] ? 0 : 1] = 6
    setCheated(true)
    setRounds([...rounds.slice(0, -1), { me }])
  }
  const throwTheirs = () => shake('them', () => {
    const crooked = opponent === 'cheat' && Math.random() < 0.6
    const them: Pair = crooked ? [Math.max(die(), die()), Math.max(die(), die())] : [die(), die()]
    const next = [...rounds.slice(0, -1), { ...cur, them, theyCheated: crooked }]
    setRounds(next)
    const mine = next.filter((r) => r.them && sum(r.me) > sum(r.them!)).length
    const theirs = next.filter((r) => r.them && sum(r.me) < sum(r.them!)).length
    if (mine >= 2 || theirs >= 2) {
      const caught = cheated && Math.random() < catchChance(hero, opponent)
      setTimeout(() => finish({ stake: stake!, won: mine >= 2, cheated, caught, exposed: false, fate: false, chase, opponent }), 700)
    }
  })
  const expose = () => finish({ stake: stake!, won: true, cheated, caught: false, exposed: true, fate: false, chase, opponent })

  const oppKey = d.skill >= SKILL.read ? opponent : 'unknown'
  const locked = ([2, 3, 4, 5] as const).find((l) => d.lust < STAKE_LUST[l])

  // Скотина проиграна: отдать её победителю или заплатить её цену.
  if (ransom) {
    const money = formatMoney(t, ransom.stake.amount, props.coin)
    const animal = { key: `animal.${ransom.stake.animal ?? 'horse'}` }
    return (
      <div class="dice">
        {ransom.caught && <p class="dice-result lose">{t('dice.caught')}</p>}
        <p class="dice-result lose" aria-live="polite">{t('dice.ransom.ask', { animal, money }, o)}</p>
        <div class="dice-ransom">
          <button type="button" class="secondary" onClick={() => record({ ...ransom, ransom: false })}>{t('dice.ransom.give', { animal }, o)}</button>
          <button type="button" class="primary" onClick={() => record({ ...ransom, ransom: true })}>{t('dice.ransom.pay', { money }, o)}</button>
        </div>
      </div>
    )
  }

  // Итог партии и что дальше: ещё партию, отыграться или встать из-за стола.
  if (!stake) {
    const canMore = games < MAX_GAMES && props.stakes.length > 0
    return (
      <div class="dice">
        <p class="dice-stats small">{t('dice.stats', { s: d.skill, l: d.lust })}</p>
        {last && (
          <p class={`dice-result ${last.won && !last.caught ? 'win' : 'lose'}`} aria-live="polite">
            {last.caught ? t('dice.caught') : last.exposed ? t('dice.exposed') : last.won ? t('dice.won', { money: formatMoney(t, last.stake.amount, props.coin) }, o) : last.ransom ? t('dice.ransom.paid', { money: formatMoney(t, last.stake.amount, props.coin) }, o) : t('dice.lost', { what: stakeLabel(last.stake) }, o)}
          </p>
        )}
        {canMore && (
          <>
            <p class="dice-opp"><strong>{t('dice.opponent')}:</strong> {t(`dice.opp.${oppKey}`)}</p>
            <p class="small muted">{last && !last.won ? t('dice.chase_hint') : t('dice.pick')}</p>
            <div class="dice-stakes">
              {props.stakes.map((s) => (
                <button type="button" class={`dice-stake lvl${s.level}`} onClick={() => {
                  if (last && !last.won) setChase(true)
                  start(s)
                }}>
                  <span>{stakeLabel(s)}</span>
                  <span class="dice-win">{t('dice.stake.win', { money: formatMoney(t, s.amount, props.coin) })}</span>
                </button>
              ))}
            </div>
            {locked && <p class="small muted">{t('dice.locked')}</p>}
            <button type="button" class="link" onClick={() => {
              if (last && !last.won) setChase(true)
              fate(props.stakes[0])
            }}>{t('dice.fate')}</button>
          </>
        )}
        <button type="button" class="primary" onClick={props.onDone}>{games ? t('dice.leave') : t('dice.no')}</button>
      </div>
    )
  }

  return (
    <div class="dice">
      <p class="dice-stake-now small"><strong>{t('dice.on_table')}:</strong> {stakeLabel(stake)}</p>
      <p class="dice-score" aria-live="polite">{t('dice.score', { a: score('me'), b: score('them') })}</p>
      <div class="dice-board">
        <div class="dice-side">
          <span class="dice-who">{nameOf(hero.name, lang)}</span>
          <span class="dice-pair">{rolling === 'me' ? <><Die v={die()} rolling /><Die v={die()} rolling /></> : cur ? cur.me.map((v) => <Die v={v} />) : <><Die v={1} /><Die v={1} /></>}</span>
          {cur && <span class="dice-sum">{sum(cur.me)}</span>}
        </div>
        <div class="dice-side">
          <span class="dice-who">{t(`dice.opp_short.${oppKey}`)}</span>
          <span class="dice-pair">{rolling === 'them' ? <><Die v={die()} rolling /><Die v={die()} rolling /></> : cur?.them ? cur.them.map((v) => <Die v={v} />) : <><Die v={1} /><Die v={1} /></>}</span>
          {cur?.them && <span class="dice-sum">{sum(cur.them)}</span>}
        </div>
      </div>
      {cur?.them && sum(cur.me) === sum(cur.them) && <p class="small center">{t('dice.tie')}</p>}
      <div class="dice-actions">
        {(!cur || cur.them) && score('me') < 2 && score('them') < 2 && (
          <button type="button" class="primary" disabled={!!rolling} onClick={throwMine}>{t('dice.throw')}</button>
        )}
        {waitingThem && (
          <>
            <button type="button" class="primary" disabled={!!rolling} onClick={throwTheirs}>{t('dice.their_turn')}</button>
            {rerolls < freeRerolls && <button type="button" class="secondary" disabled={!!rolling} onClick={reroll}>{t('dice.reroll')}</button>}
            {d.skill >= SKILL.cheat && !cheated && Math.min(...cur.me) < 6 && <button type="button" class="secondary danger-soft" onClick={cheat}>{t('dice.cheat')}</button>}
          </>
        )}
        {cur?.theyCheated && d.skill >= SKILL.spot && <button type="button" class="secondary" onClick={expose}>{t('dice.expose')}</button>}
      </div>
      {cur?.theyCheated && d.skill >= SKILL.spot && <p class="small warn">{t('dice.spotted')}</p>}
    </div>
  )
}
