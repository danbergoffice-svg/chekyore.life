// Хозяйство рода на вкладке «Герой» (план 19.11, docs/TZ_hero.md п. 1): вместо длинной ленты - сводка (деньги,
// имущество, доход за год по источникам), переключатель разделов и плитки владений и дел. Подробности и действия -
// в нижней шторке по касанию плитки, так что прокрутка не растёт, сколько бы ни было имущества.
import { useEffect, useState } from 'preact/hooks'
import type { ComponentChildren } from 'preact'
import { assetNet, estateValue, estateWorth, heroShare, LAND_INCOME, manageable, SLAVE_INCOME, underSteward, yearTax } from '../engine/estate'
import { businessDef, businessLock, businessTypes, createBusiness, heroStake } from '../engine/business'
import { capacity, stockTotal, stockValue } from '../engine/trade'
import { heirs } from '../engine/life'
import { regionOf } from '../engine/rules'
import { isPet } from '../engine/pets'
import type { Asset, Business, EraDef, GameState } from '../engine/types'
import { formatMoney } from '../i18n'
import { platform } from '../platform'
import { AssetRow, BuyOffers, HomeRow, WillEditor } from './Estate'
import { BizRow, Trade } from './Trade'
import { Icon } from './Icon'
import type { IconName } from './icons'
import { useUi } from './text'

export type HeroSection = 'estate' | 'business' | 'trade' | 'me'
export const HERO_SECTIONS: HeroSection[] = ['estate', 'business', 'trade', 'me']

const ASSET_ICON: Record<string, IconName> = { farm: 'barn', workshop: 'hammer', shop: 'stall', house: 'building', warehouse: 'store' }
const BIZ_ICON: Record<string, IconName> = { artel: 'hammer', trading_house: 'scales', caravan: 'cart', shipping: 'ship' }

/** Чистый доход в обычный год (без удачи и бед): хозяйства, наделы, невольники, минус подать. */
function usualIncome(state: GameState): number {
  const assets = (state.family.estate?.assets ?? []).filter((a) => heroShare(state, a) > 0).reduce((s, a) => s + assetNet(state, a), 0)
  return assets + Math.round((state.hero.land ?? 0) * LAND_INCOME * 0.9) + (state.hero.slaves ?? 0) * SLAVE_INCOME - yearTax(state)
}

/** Всё, чем владеет род (доля героя): дом, наделы, невольники, хозяйства, доли в делах, запас товара. */
function totalWorth(state: GameState): number {
  const biz = (state.family.trade?.businesses ?? []).filter((b) => b.active).reduce((s, b) => s + Math.max(0, b.capital) * heroStake(b), 0)
  return estateWorth(state.hero, state) + estateValue(state) + Math.round(biz) + stockValue(state)
}

const signed = (money: (n: number) => string, n: number) => (n > 0 ? `+${money(n)}` : n < 0 ? `−${money(-n)}` : money(0))

/** Сводка рода: деньги, имущество, доход за этот год по источникам и в обычный год. */
export function HoldingsSummary({ state, era }: { state: GameState; era: EraDef }) {
  const { t } = useUi()
  const coin = regionOf(era, state.hero.region).coin
  const money = (n: number) => formatMoney(t, n, coin)
  const hero = state.hero
  const L = state.family.ledger?.year === state.year ? state.family.ledger : undefined
  const parts = L ? ([['assets', L.assets], ['land', L.land], ['business', L.business], ['tax', L.tax], ['repairs', L.repairs]] as const).filter(([, v]) => v !== 0) : []
  const total = parts.reduce((s, [, v]) => s + v, 0)
  const worth = totalWorth(state)
  const usual = usualIncome(state)
  return (
    <div class="hold-summary">
      <div class="hold-figures">
        <div>
          <span class="hold-label">{t('hold.money')}</span>
          <strong class={hero.money < 0 ? 'warn' : ''}>{money(hero.money)}</strong>
          {hero.money < 0 && <span class="small warn">{t('hero.in_debt')}</span>}
        </div>
        <div>
          <span class="hold-label">{t('hold.worth')}</span>
          <strong>{money(worth)}</strong>
        </div>
        <div>
          <span class="hold-label">{t('hold.year')}</span>
          <strong class={total < 0 ? 'warn' : ''}>{signed(money, total)}</strong>
        </div>
      </div>
      {parts.length > 0 && (
        <p class="small hold-parts">{parts.map(([k, v]) => `${t(`hold.src.${k}`)} ${signed(money, v)}`).join(' · ')}</p>
      )}
      {usual !== 0 && <p class="small muted hold-parts">{t('hold.usual', { money: signed(money, usual) })}</p>}
    </div>
  )
}

/** Переключатель разделов вкладки: Хозяйство · Дела · Торговля · Я. Выбор помнится в этом браузере. */
export function useHeroSection(adult: boolean): [HeroSection, (s: HeroSection) => void] {
  const [sec, setSec] = useState<HeroSection>(() => {
    const saved = platform.kvGet('thousands.hero_section') as HeroSection | null
    return saved && HERO_SECTIONS.includes(saved) ? saved : adult ? 'estate' : 'me'
  })
  useEffect(() => {
    platform.kvSet('thousands.hero_section', sec)
  }, [sec])
  return [sec, setSec]
}

export function HeroSections({ sec, onPick }: { sec: HeroSection; onPick: (s: HeroSection) => void }) {
  const { t } = useUi()
  return (
    <nav class="hold-tabs" role="tablist" aria-label={t('hold.sections')}>
      {HERO_SECTIONS.map((s) => (
        <button type="button" role="tab" aria-selected={sec === s} class={sec === s ? 'chip active' : 'chip'} onClick={() => {
          onPick(s)
          platform.track('hero_section', { section: s })
        }}>
          {t(`hero.sec.${s}`)}
        </button>
      ))}
    </nav>
  )
}

/** Нижняя шторка: подробности плитки и действия. */
function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ComponentChildren }) {
  const { t } = useUi()
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])
  return (
    <div class="sheet-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div class="sheet hold-sheet" role="dialog" aria-modal="true" aria-label={title}>
        <div class="sheet-handle" aria-hidden="true" />
        <div class="sheet-head">
          <h2>{title}</h2>
          <button class="link sheet-x" aria-label={t('common.close')} onClick={onClose}>×</button>
        </div>
        {children}
      </div>
    </div>
  )
}

function Tile(props: { icon: IconName; title: string; sub?: string; net?: string; bad?: boolean; cond?: number; mark?: IconName; onClick: () => void; add?: boolean }) {
  return (
    <button type="button" class={`hold-tile${props.add ? ' add' : ''}${props.bad ? ' bad' : ''}`} onClick={props.onClick}>
      <span class="hold-tile-icon">
        <Icon name={props.icon} size={1.7} />
        {props.mark && <span class="hold-tile-mark"><Icon name={props.mark} size={0.9} /></span>}
      </span>
      <span class="hold-tile-title">{props.title}</span>
      {props.cond !== undefined && (
        <span class="hold-cond" aria-hidden="true">
          <span style={{ width: `${Math.max(4, props.cond)}%` }} class={props.cond < 30 ? 'low' : props.cond < 50 ? 'mid' : ''} />
        </span>
      )}
      {props.sub && <span class="hold-tile-sub">{props.sub}</span>}
      {props.net && <span class={`hold-tile-net${props.bad ? ' warn' : ''}`}>{props.net}</span>}
    </button>
  )
}

type Open = { kind: 'asset'; id: string } | { kind: 'home' } | { kind: 'land' } | { kind: 'animals' } | { kind: 'buy' } | { kind: 'will' } | { kind: 'biz'; id: string } | { kind: 'found' } | { kind: 'market' } | null

/** Раздел «Хозяйство»: дом, наделы, невольники, скот и хозяйства рода плитками; купить; завещание. */
export function EstateTiles({ state, era, onChange }: { state: GameState; era: EraDef; onChange: () => void }) {
  const { t, lang } = useUi()
  const [open, setOpen] = useState<Open>(null)
  const coin = regionOf(era, state.hero.region).coin
  const money = (n: number) => formatMoney(t, n, coin)
  const hero = state.hero
  const o = { sex: hero.sex, region: hero.region }
  const adult = hero.age >= era.stages.adult
  const act = (fn: () => unknown) => {
    fn()
    onChange()
  }
  const assets = (state.family.estate?.assets ?? []).filter((a) => heroShare(state, a) > 0)
  const animals = (hero.animals ?? []).filter((a) => !isPet(a.kind))
  const cur = open?.kind === 'asset' ? assets.find((a) => a.id === open.id) : undefined
  const assetName = (a: Asset) => t(`asset.${a.type}`, {}, { region: hero.region })
  const extra = Math.max(0, assets.length - manageable(state))
  return (
    <section class="hold">
      <div class="hold-grid">
        <Tile icon="house" title={hero.rent ? t('estate.home_rent', {}, o) : t(`home.${Math.max(0, Math.min(4, hero.home ?? 1))}`)} sub={t('hold.home')} onClick={() => setOpen({ kind: 'home' })} />
        {!!hero.land && <Tile icon="field" title={t('hold.land_n', { n: hero.land })} net={signed(money, Math.round(hero.land * LAND_INCOME * 0.9))} onClick={() => setOpen({ kind: 'land' })} />}
        {!!hero.slaves && <Tile icon="chain" title={t('hold.slaves_n', { n: hero.slaves })} net={signed(money, hero.slaves * SLAVE_INCOME)} onClick={() => setOpen({ kind: 'land' })} />}
        {animals.length > 0 && <Tile icon="herd" title={t('hold.animals_n', { n: animals.length })} onClick={() => setOpen({ kind: 'animals' })} />}
        {assets.map((a) => {
          const net = assetNet(state, a)
          const idle = (a.idleUntil ?? 0) >= state.year
          return (
            <Tile
              icon={ASSET_ICON[a.type] ?? 'castle'}
              title={assetName(a)}
              cond={a.condition}
              net={idle ? t('hold.idle_short') : t('hold.per_year', { money: signed(money, net) })}
              bad={idle || net < 0}
              mark={a.pledged ? 'lock' : underSteward(state, a) ? 'person' : undefined}
              onClick={() => setOpen({ kind: 'asset', id: a.id })}
            />
          )
        })}
        {adult && hero.cls !== 'slave' && <Tile icon="plus" title={t('hold.buy')} add onClick={() => setOpen({ kind: 'buy' })} />}
      </div>
      {!assets.length && adult && <p class="small muted">{t('hold.empty_estate')}</p>}
      {extra > 0 && <p class="small muted">{t('hold.manage', { n: manageable(state), m: extra })}</p>}
      {assets.length > 0 && adult && heirs(state).length > 0 && (
        <button type="button" class="link hold-will" onClick={() => setOpen({ kind: 'will' })}>{t('hold.will')} ›</button>
      )}

      {open?.kind === 'home' && (
        <Sheet title={t('hold.home')} onClose={() => setOpen(null)}>
          {adult ? <HomeRow state={state} money={money} act={act} /> : <p class="small">{t('estate.home', { home: t(`home.${hero.home ?? 1}`) })}</p>}
        </Sheet>
      )}
      {open?.kind === 'land' && (
        <Sheet title={t('hold.land_title')} onClose={() => setOpen(null)}>
          {!!hero.land && <p class="small">{t('hold.land_n', { n: hero.land })} · {t('hold.per_year', { money: signed(money, Math.round(hero.land * LAND_INCOME * 0.9)) })}</p>}
          {!!hero.slaves && <p class="small">{t('hold.slaves_n', { n: hero.slaves })} · {t('hold.per_year', { money: signed(money, hero.slaves * SLAVE_INCOME) })}</p>}
          <p class="small muted">{t('hold.land_hint')}</p>
        </Sheet>
      )}
      {open?.kind === 'animals' && (
        <Sheet title={t('hero.animals')} onClose={() => setOpen(null)}>
          <p class="small">{animals.map((a) => t(`animal.${a.kind}`, {}, o)).join(', ')}</p>
        </Sheet>
      )}
      {cur && (
        <Sheet title={assetName(cur)} onClose={() => setOpen(null)}>
          <p class="small">{t('hold.per_year', { money: signed(money, assetNet(state, cur)) })} · {t('hold.cond', { n: cur.condition })}{cur.level ? ` · ${t('hold.level', { n: cur.level })}` : ''}</p>
          {underSteward(state, cur) && <p class="small warn">{t('hold.steward')}</p>}
          {(cur.idleUntil ?? 0) >= state.year && <p class="small warn">{t('hold.idle')}</p>}
          {cur.condition < 50 && <p class="small warn">{t('hold.worn')}</p>}
          <ul class="kids">
            <AssetRow state={state} a={cur} money={money} act={(fn) => {
              act(fn)
              if (!state.family.estate?.assets.some((x) => x.id === cur.id)) setOpen(null)
            }} />
          </ul>
        </Sheet>
      )}
      {open?.kind === 'buy' && (
        <Sheet title={t('hold.buy')} onClose={() => setOpen(null)}>
          <p class="small muted">{t('estate.hint')}</p>
          <BuyOffers state={state} money={money} act={(fn) => {
            act(fn)
            setOpen(null)
          }} />
        </Sheet>
      )}
      {open?.kind === 'will' && (
        <Sheet title={t('estate.will.title')} onClose={() => setOpen(null)}>
          <WillEditor state={state} era={era} onChange={onChange} lang={lang} />
        </Sheet>
      )}
    </section>
  )
}

/** Раздел «Дела»: товарищества плитками; основать новое. */
export function BusinessTiles({ state, era, onChange }: { state: GameState; era: EraDef; onChange: () => void }) {
  const { t, lang } = useUi()
  const [open, setOpen] = useState<Open>(null)
  const coin = regionOf(era, state.hero.region).coin
  const money = (n: number) => formatMoney(t, n, coin)
  const hero = state.hero
  const adult = hero.age >= era.stages.adult && hero.cls !== 'slave'
  const act = (fn: () => unknown) => {
    fn()
    onChange()
  }
  const list = (state.family.trade?.businesses ?? []).filter((b) => b.active)
  const cur = open?.kind === 'biz' ? list.find((b) => b.id === open.id) : undefined
  const offers = businessTypes().filter((ty) => {
    const lock = businessLock(state, ty, businessDef(ty)!.capital)
    return !lock || lock === 'business.lock.money'
  })
  const profit = (b: Business) => b.income - b.expenses
  return (
    <section class="hold">
      <div class="hold-grid">
        {list.map((b) => (
          <Tile icon={BIZ_ICON[b.type] ?? 'scales'} title={t(`business.type.${b.type}`)} sub={t('hold.capital', { money: money(Math.round(b.capital * heroStake(b))) })} net={b.income || b.expenses ? signed(money, Math.round(profit(b) * heroStake(b))) : undefined} bad={profit(b) < 0} onClick={() => setOpen({ kind: 'biz', id: b.id })} />
        ))}
        {adult && offers.length > 0 && <Tile icon="plus" title={t('hold.found')} add onClick={() => setOpen({ kind: 'found' })} />}
      </div>
      {!list.length && <p class="small muted">{adult ? t('business.hint') : t('trade.young')}</p>}
      {list.length > 0 && <p class="small muted">{t('business.attention')}</p>}
      {cur && (
        <Sheet title={t(`business.type.${cur.type}`)} onClose={() => setOpen(null)}>
          <ul class="kids">
            <BizRow state={state} b={cur} money={money} act={(fn) => {
              act(fn)
              if (!cur.active) setOpen(null)
            }} lang={lang} />
          </ul>
        </Sheet>
      )}
      {open?.kind === 'found' && (
        <Sheet title={t('hold.found')} onClose={() => setOpen(null)}>
          <p class="small muted">{t('business.hint')}</p>
          <div class="hold-offers">
            {offers.map((ty) => {
              const cap = businessDef(ty)!.capital
              return (
                <button type="button" class="option small" disabled={!!businessLock(state, ty, cap)} onClick={() => {
                  act(() => createBusiness(state, { type: ty, capital: cap }))
                  setOpen(null)
                }}>
                  <span class="option-label">{t(`business.type.${ty}`)}</span>
                  <span class="option-desc">{t('business.found', { money: money(cap) })}</span>
                </button>
              )
            })}
          </div>
        </Sheet>
      )}
    </section>
  )
}

/** Раздел «Торговля»: одна строка о запасе и прибыли, рынок - в шторке. */
export function TradeLine({ state, era, onChange }: { state: GameState; era: EraDef; onChange: () => void }) {
  const { t } = useUi()
  const [open, setOpen] = useState(false)
  const coin = regionOf(era, state.hero.region).coin
  const money = (n: number) => formatMoney(t, n, coin)
  const adult = state.hero.age >= era.stages.adult && state.hero.cls !== 'slave'
  return (
    <section class="hold">
      <p class="small">{t('trade.stock', { n: stockTotal(state), max: capacity(state), money: money(state.family.trade?.profit ?? 0) })}</p>
      <p class="small muted">{adult ? t('trade.hint') : t('trade.young')}</p>
      {adult && <button type="button" class="primary hold-market" onClick={() => setOpen(true)}>{t('hold.market')}</button>}
      {open && (
        <Sheet title={t('trade.title')} onClose={() => setOpen(false)}>
          <Trade state={state} era={era} onChange={onChange} marketOnly />
        </Sheet>
      )}
    </section>
  )
}
