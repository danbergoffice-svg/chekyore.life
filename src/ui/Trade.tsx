// Торговля и дела рода на вкладке «Герой» (src/engine/trade.ts, business.ts). Ничего не всплывает само:
// порча запаса, прибыль и разорение дел - записями в дневник.
import { addPartner, businessDef, businessForm, businessLock, businessTypes, closeBusiness, createBusiness, heroStake, partnerCandidates } from '../engine/business'
import { buyGoods, buyPrice, capacity, goodsHere, sellGoods, sellPrice, stockOf, stockTotal, unitOf } from '../engine/trade'
import { useState } from 'preact/hooks'
import { regionOf } from '../engine/rules'
import type { Business, EraDef, GameState } from '../engine/types'
import { formatMoney, nameOf } from '../i18n'
import { useUi } from './text'

export function Trade({ state, era, onChange, marketOnly }: { state: GameState; era: EraDef; onChange: () => void; marketOnly?: boolean }) {
  const { t } = useUi()
  const coin = regionOf(era, state.hero.region).coin
  const money = (n: number) => formatMoney(t, n, coin)
  const hero = state.hero
  const adult = hero.age >= era.stages.adult && hero.cls !== 'slave'
  const trade = state.family.trade
  if (!adult && !trade?.inventory.goods.length && !trade?.businesses.some((b) => b.active)) return null
  const act = (fn: () => unknown) => {
    fn()
    onChange()
  }
  const goods = goodsHere(state)
  const held = (trade?.inventory.goods ?? []).filter((g) => !goods.some((x) => x.id === g.id))
  return (
    <>
      <section class="estate trade">
        <h2 class="section-title">{t('trade.title')}</h2>
        <p class="small muted">{t('trade.hint')}</p>
        {!adult && <p class="small">{t('trade.young')}</p>}
        <p class="small">{t('trade.stock', { n: stockTotal(state), max: capacity(state), money: money(trade?.profit ?? 0) })}</p>
        <p class="small muted">{t(state.lastFocus === 'trade' ? 'trade.focus_on' : 'trade.focus_off')}</p>
        <ul class="kids market">
          {[...goods.map((g) => g.id), ...held.map((g) => g.id)].map((id) => (
            <MarketRow state={state} id={id} here={goods.some((g) => g.id === id)} adult={adult} money={money} act={act} />
          ))}
        </ul>
      </section>
      {!marketOnly && <Businesses state={state} era={era} money={money} act={act} adult={adult} />}
    </>
  )
}

export function Businesses({ state, era, money, act, adult }: { state: GameState; era: EraDef; money: (n: number) => string; act: (fn: () => unknown) => void; adult: boolean }) {
  const { t, lang } = useUi()
  const list = (state.family.trade?.businesses ?? []).filter((b) => b.active)
  const offers = businessTypes().filter((ty) => {
    const lock = businessLock(state, ty, businessDef(ty)!.capital)
    return !lock || lock === 'business.lock.money'
  })
  if (!list.length && (!adult || !offers.length)) return null
  return (
    <section class="estate business">
      <h2 class="section-title">{t('business.title')}</h2>
      <p class="small muted">{t('business.hint')}</p>
      <p class="small muted">{t('business.attention')}</p>
      <p class="small">{t('business.form', { form: t(`business.form.${businessForm(state.hero.era)}`) })}</p>
      <ul class="kids">
        {list.map((b) => (
          <BizRow state={state} b={b} money={money} act={act} lang={lang} />
        ))}
      </ul>
      {adult && offers.length > 0 && (
        <div class="choice-row">
          {offers.map((ty) => {
            const cap = businessDef(ty)!.capital
            return (
              <button type="button" class="option small" disabled={!!businessLock(state, ty, cap)} onClick={() => act(() => createBusiness(state, { type: ty, capital: cap }))}>
                <span class="option-label">{t(`business.type.${ty}`)}</span>
                <span class="option-desc">{t('business.found', { money: money(cap) })}</span>
              </button>
            )
          })}
        </div>
      )}
    </section>
  )
}

export function BizRow({ state, b, money, act, lang }: { state: GameState; b: Business; money: (n: number) => string; act: (fn: () => unknown) => void; lang: string }) {
  const { t } = useUi()
  const cands = partnerCandidates(state, b)
  const stake = heroStake(b)
  return (
    <li class="person child-card">
      <span class="person-name cap">{t(`business.type.${b.type}`)}</span>
      <span class="small muted">{t('business.row', { money: money(b.capital), n: Math.round(stake * 100), rep: b.reputation })}</span>
      {(b.income > 0 || b.expenses > 0) && <span class="small muted">{t('business.last', { income: money(b.income), cost: money(b.expenses) })}</span>}
      {b.partners.length > 0 && <span class="small">{t('business.partners', { list: b.partners.map((p) => `${nameOf(p.name ?? '', lang as never)} ${Math.round(p.share * 100)}%`).join(', ') })}</span>}
      <span class="choice-row">
        {stake - 0.25 >= 0.1 && cands.length > 0 && (
          <>
            <span class="small">{t('business.add_partner')}</span>
            {cands.slice(0, 4).map((n) => (
              <button type="button" class="option small" onClick={() => act(() => addPartner(state, b.id, n.id, 0.25))}>
                {nameOf(n.name, lang as never)}
              </button>
            ))}
          </>
        )}
        <button type="button" class="option small" onClick={() => act(() => closeBusiness(state, b.id))}>
          {t('business.close', { money: money(Math.round(Math.max(0, b.capital) * stake)) })}
        </button>
      </span>
    </li>
  )
}

/** Товар на рынке (20.11): мера, цены, запас; «Купить» или «Продать» раскрывают бегунок - сколько угодно до предела
 *  денег, места или запаса, а не только 1 и 5. */
function MarketRow({ state, id, here, adult, money, act }: { state: GameState; id: string; here: boolean; adult: boolean; money: (n: number) => string; act: (fn: () => unknown) => void }) {
  const { t } = useUi()
  const [mode, setMode] = useState<'buy' | 'sell' | null>(null)
  const [n, setN] = useState(1)
  const hero = state.hero
  const have = stockOf(state, id)
  const item = state.family.trade?.inventory.goods.find((g) => g.id === id)
  const bp = buyPrice(state, id)
  const sp = sellPrice(state, id)
  const unit = t(`unit.${unitOf(id, hero.era)}`)
  const maxBuy = here ? Math.max(0, Math.min(Math.floor(Math.max(0, hero.money) / bp), capacity(state) - stockTotal(state), 500)) : 0
  const max = mode === 'buy' ? maxBuy : have
  const qty = Math.max(1, Math.min(n, max))
  const open = (m: 'buy' | 'sell') => {
    setMode(mode === m ? null : m)
    setN(1)
  }
  return (
    <li class="person child-card market-row">
      <span class="person-name cap">{t(`good.${id}`)} <span class="muted small">· {unit}</span></span>
      <span class="small muted">{t('trade.row', { buy: money(bp), sell: money(sp) })}</span>
      {have > 0 && <span class="small">{t('trade.have', { n: have, money: money(Math.round(item!.averagePrice)) })}</span>}
      {adult && (
        <span class="choice-row">
          <button type="button" class={`option small${mode === 'buy' ? ' on' : ''}`} disabled={maxBuy < 1} onClick={() => open('buy')}>{t('trade.buy_open')}</button>
          {have > 0 && <button type="button" class={`option small${mode === 'sell' ? ' on' : ''}`} onClick={() => open('sell')}>{t('trade.sell_open')}</button>}
        </span>
      )}
      {mode && max >= 1 && (
        <div class="market-qty">
          <input type="range" min={1} max={max} value={qty} aria-label={t('trade.qty')} onInput={(e) => setN(Number((e.target as HTMLInputElement).value))} />
          <div class="market-qty-row">
            <span class="small">{t('trade.qty_line', { n: qty, unit, money: money(qty * (mode === 'buy' ? bp : sp)) })}</span>
            <button type="button" class="primary small" onClick={() => {
              act(() => (mode === 'buy' ? buyGoods(state, id, qty) : sellGoods(state, id, qty)))
              setMode(null)
              setN(1)
            }}>{t(mode === 'buy' ? 'trade.do_buy' : 'trade.do_sell')}</button>
          </div>
          <div class="market-qty-quick">
            {[1, 10, 50].filter((x) => x < max).map((x) => <button type="button" class="chip" onClick={() => setN(x)}>{x}</button>)}
            <button type="button" class="chip" onClick={() => setN(max)}>{t('trade.max', { n: max })}</button>
          </div>
        </div>
      )}
    </li>
  )
}
