// Торговля и дела рода на вкладке «Герой» (src/engine/trade.ts, business.ts). Ничего не всплывает само:
// порча запаса, прибыль и разорение дел - записями в дневник.
import { addPartner, businessDef, businessForm, businessLock, businessTypes, closeBusiness, createBusiness, heroStake, partnerCandidates } from '../engine/business'
import { buyGoods, buyPrice, capacity, marketGoods, sellGoods, sellPrice, stockOf, stockTotal } from '../engine/trade'
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
  const goods = marketGoods(era)
  const held = (trade?.inventory.goods ?? []).filter((g) => !goods.some((x) => x.id === g.id))
  return (
    <>
      <section class="estate trade">
        <h2 class="section-title">{t('trade.title')}</h2>
        <p class="small muted">{t('trade.hint')}</p>
        {!adult && <p class="small">{t('trade.young')}</p>}
        <p class="small">{t('trade.stock', { n: stockTotal(state), max: capacity(state), money: money(trade?.profit ?? 0) })}</p>
        <ul class="kids">
          {[...goods.map((g) => g.id), ...held.map((g) => g.id)].map((id) => {
            const have = stockOf(state, id)
            const item = trade?.inventory.goods.find((g) => g.id === id)
            return (
              <li class="person child-card">
                <span class="person-name cap">{t(`good.${id}`)}</span>
                <span class="small muted">{t('trade.row', { buy: money(buyPrice(state, id)), sell: money(sellPrice(state, id)) })}</span>
                {have > 0 && <span class="small">{t('trade.have', { n: have, money: money(Math.round(item!.averagePrice)) })}</span>}
                {adult && (
                  <span class="choice-row">
                    {[1, 5].map((n) => (
                      <button type="button" class="option small" disabled={hero.money < buyPrice(state, id) * n || stockTotal(state) + n > capacity(state) || !goods.some((g) => g.id === id)} onClick={() => act(() => buyGoods(state, id, n))}>
                        {t('trade.buy', { n })}
                      </button>
                    ))}
                    {have > 0 && (
                      <button type="button" class="option small" onClick={() => act(() => sellGoods(state, id, have))}>
                        {t('trade.sell_all')}
                      </button>
                    )}
                  </span>
                )}
              </li>
            )
          })}
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
