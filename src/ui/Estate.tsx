// Имущество рода на вкладке «Герой» (src/engine/estate.ts, inheritance.ts): активы, покупка, улучшение, залог,
// продажа и завещание. Ничего не всплывает само - итоги года и раздел наследства идут записями в дневник.
import { useState } from 'preact/hooks'
import ASSETS from '../content/assets.json'
import { acquireAsset, assetDef, assetLock, assetPrice, canImprove, canRepair, conditionK, repairAsset, repairCost, estatePrice, estateValue, heroShare, homeUpgradeLock, improveAsset, improveCost, pledgeAsset, redeemAsset, saleValue, sellAsset, upgradeHome } from '../engine/estate'
import { createWill, customDistribution, validateWill } from '../engine/inheritance'
import { heirs } from '../engine/life'
import { regionOf } from '../engine/rules'
import type { Asset, AssetType, EraDef, GameState } from '../engine/types'
import { formatMoney, formatYear, nameOf } from '../i18n'
import { useUi } from './text'

const TYPES = ASSETS.types.map((t) => t.id as AssetType)

export function Estate({ state, era, onChange }: { state: GameState; era: EraDef; onChange: () => void }) {
  const { t, lang } = useUi()
  const coin = regionOf(era, state.hero.region).coin
  const money = (n: number) => formatMoney(t, n, coin)
  const estate = state.family.estate
  const assets = (estate?.assets ?? []).filter((a) => heroShare(state, a) > 0)
  const offers = TYPES.filter((ty) => {
    const lock = assetLock(state, ty)
    return !lock || lock === 'estate.lock.money'
  })
  const adult = state.hero.age >= era.stages.adult
  if (!adult && !assets.length) return null
  const act = (fn: () => unknown) => {
    fn()
    onChange()
  }
  return (
    <section class="estate">
      <h2 class="section-title">{t('estate.title')}</h2>
      <p class="small muted">{t('estate.hint')}</p>
      {adult && <HomeRow state={state} money={money} act={act} />}
      {assets.length === 0 ? (
        <p class="small">{t('estate.empty')}</p>
      ) : (
        <>
          <p class="small">
            {t('estate.worth', { money: money(estateValue(state)) })}
            {estate?.debts ? ` · ${t('estate.debts', { money: money(estate.debts) })}` : ''}
          </p>
          <ul class="kids">
            {assets.map((a) => (
              <AssetRow state={state} a={a} money={money} act={act} />
            ))}
          </ul>
        </>
      )}
      {adult && offers.length > 0 && (
        <div class="choice-row">
          <span class="small">{t('estate.buy')}</span>
          {offers.map((ty) => (
            <button type="button" class="option small" disabled={!!assetLock(state, ty)} onClick={() => act(() => acquireAsset(state, { type: ty }))}>
              <span class="option-label">{t(`asset.${ty}`, {}, { region: state.hero.region })}</span>
              <span class="option-desc">{t('estate.buy.desc', { money: money(assetPrice(state, ty)), income: money(usualNet(state, ty)) })}</span>
            </button>
          ))}
        </div>
      )}
      {assets.length > 0 && adult && <WillEditor state={state} era={era} onChange={onChange} lang={lang} />}
    </section>
  )
}

/** Чистый доход нового хозяйства в обычный год: средняя сохранность, содержание и подать (как считает assetsYear). */
const usualNet = (state: GameState, ty: AssetType) => Math.round(assetPrice(state, ty) * (assetDef(ty)!.income * conditionK(80) - assetDef(ty)!.maintenance - ASSETS.tax))

/** Что можно купить сейчас (или почти: не хватает денег) - для шторки «Купить» на вкладке «Герой». */
export function BuyOffers({ state, money, act }: { state: GameState; money: (n: number) => string; act: (fn: () => unknown) => void }) {
  const { t } = useUi()
  const offers = TYPES.filter((ty) => {
    const lock = assetLock(state, ty)
    return !lock || lock === 'estate.lock.money'
  })
  if (!offers.length) return <p class="small muted">{t('hold.buy_none')}</p>
  return (
    <div class="hold-offers">
      {offers.map((ty) => (
        <button type="button" class="option small" disabled={!!assetLock(state, ty)} onClick={() => act(() => acquireAsset(state, { type: ty }))}>
          <span class="option-label">{t(`asset.${ty}`, {}, { region: state.hero.region })}</span>
          <span class="option-desc">{t('estate.buy.desc', { money: money(assetPrice(state, ty)), income: money(usualNet(state, ty)) })}</span>
        </button>
      ))}
    </div>
  )
}

/** Свой дом: окно «Дом побольше» приходит раз за жизнь (решение владельца 10.11), дальше дом перестраивают здесь. */
export function HomeRow({ state, money, act }: { state: GameState; money: (n: number) => string; act: (fn: () => unknown) => void }) {
  const { t } = useUi()
  const hero = state.hero
  const o = { sex: hero.sex }
  const lock = homeUpgradeLock(state)
  const now = hero.rent ? t('estate.home_rent', {}, o) : t(`home.${Math.max(0, Math.min(4, hero.home ?? 1))}`)
  return (
    <div class="estate-home">
      <p class="small">{t('estate.home', { home: now })}</p>
      {lock !== 'estate.home_lock.max' && lock !== 'estate.home_lock.rent' && lock !== 'estate.home_lock.adult' && (
        <button type="button" class="option small" disabled={!!lock} onClick={() => act(() => upgradeHome(state))}>
          <span class="option-label">{t('estate.home_up', { home: t(`home.${Math.min(4, (hero.home ?? 1) + 1)}`) })}</span>
          <span class="option-desc">{lock ? `${money(estatePrice(state, 'home'))} · ${t('estate.home_lock.money')}` : money(estatePrice(state, 'home'))}</span>
        </button>
      )}
    </div>
  )
}

export function AssetRow({ state, a, money, act }: { state: GameState; a: Asset; money: (n: number) => string; act: (fn: () => unknown) => void }) {
  const { t } = useUi()
  const share = heroShare(state, a)
  return (
    <li class="person child-card">
      <span class="person-name cap">{t(`asset.${a.type}`, {}, { region: state.hero.region })}</span>
      <span class="muted small">
        {t('estate.info', { money: money(Math.round(a.income * share)), cost: money(Math.round(a.maintenance * share)), n: a.condition })}
        {share < 1 ? ` · ${t('estate.share', { n: Math.round(share * 100) })}` : ''}
        {a.pledged ? ` · ${t('estate.pledged', { money: money(a.pledged) })}` : ''}
      </span>
      <span class="choice-row">
        {a.condition < 100 && (
          <button type="button" class="option small" disabled={!canRepair(state, a)} onClick={() => act(() => repairAsset(state, a.id))}>
            {t('hold.repair', { money: money(repairCost(a)) })}
          </button>
        )}
        {(a.level ?? 0) < ASSETS.improve.maxLevel && (
          <button type="button" class="option small" disabled={!canImprove(state, a)} onClick={() => act(() => improveAsset(state, a.id))}>
            {t('estate.improve', { money: money(improveCost(a)) })}
          </button>
        )}
        {a.pledged ? (
          <button type="button" class="option small" disabled={state.hero.money < a.pledged} onClick={() => act(() => redeemAsset(state, a.id))}>
            {t('estate.redeem', { money: money(a.pledged) })}
          </button>
        ) : (
          <button type="button" class="option small" onClick={() => act(() => pledgeAsset(state, a.id))}>
            {t('estate.pledge', { money: money(Math.round(a.value * ASSETS.pledge.share * share)) })}
          </button>
        )}
        <button type="button" class="option small" onClick={() => act(() => sellAsset(state, a.id))}>
          {t('estate.sell', { money: money(Math.max(0, saleValue(state, a) - (a.pledged ?? 0))) })}
        </button>
      </span>
    </li>
  )
}

export function WillEditor({ state, era, onChange, lang }: { state: GameState; era: EraDef; onChange: () => void; lang: string }) {
  const { t } = useUi()
  const kids = heirs(state)
  const assets = (state.family.estate?.assets ?? []).filter((a) => heroShare(state, a) > 0)
  const custom = Object.fromEntries(customDistribution(state, era, kids).map((d) => [d.assetId, d.beneficiaryId]))
  const will = state.family.estate?.will?.by === state.hero.id ? state.family.estate.will : undefined
  const [pick, setPick] = useState<Record<string, string>>(() => Object.fromEntries((will?.distributions ?? []).map((d) => [d.assetId, d.beneficiaryId])))
  const [error, setError] = useState('')
  if (!kids.length) return null
  const chosen = (a: Asset) => pick[a.id] ?? custom[a.id] ?? kids[0].id
  const save = () => {
    const distributions = assets.map((a) => ({ assetId: a.id, beneficiaryId: chosen(a), share: heroShare(state, a) }))
    const v = validateWill(state, era, { createdYear: state.year, by: state.hero.id, distributions }, kids)
    if (!v.ok) {
      setError(t(v.errors.includes('custom_forbids') ? 'estate.will.error.custom_forbids' : 'estate.will.error.other'))
      return
    }
    createWill(state, era, distributions, kids)
    setError('')
    onChange()
  }
  return (
    <div class="will">
      <h3 class="section-title">{t('estate.will.title')}</h3>
      <p class="small muted">{t('estate.will.hint')}</p>
      {will && <p class="small">{t('estate.will.made', { year: formatYear(will.createdYear, lang as never) })}</p>}
      <ul class="plain">
        {assets.map((a) => (
          <li class="small">
            <span class="cap">{t(`asset.${a.type}`, {}, { region: state.hero.region })}</span>{' → '}
            <select value={chosen(a)} onChange={(e) => setPick({ ...pick, [a.id]: (e.target as HTMLSelectElement).value })}>
              {kids.map((k) => (
                <option value={k.id}>{nameOf(k.name, lang as never)}</option>
              ))}
            </select>
            <span class="muted">{' '}{t('estate.will.custom', { who: nameOf(kids.find((k) => k.id === custom[a.id])?.name ?? '', lang as never) })}</span>
          </li>
        ))}
      </ul>
      {error && <p class="small warn">{error}</p>}
      <button type="button" class="option small" onClick={save}>{t('estate.will.make')}</button>
    </div>
  )
}
