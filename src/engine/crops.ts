// Что сеять на наделах (просьба 20.11): на своей земле герой выбирает культуру из тех, что растили в его краю и эпохе
// (src/content/crops.json); урожай - товар рынка (зерно, вино, масло, ткань…). Если не выбрано «в запас», урожай
// продаётся сам по рыночной цене года; «в запас» - ложится в запас рода, пока есть место (остальное продаётся).
// Доход надела в средний год - как прежде (~30), но цена культуры качается с рынком, а дорогие культуры - сильнее.
import { ERA_META } from '../content'
import CROPS from '../content/crops.json'
import { initializeTrade, capacity, goodDef, goodsHere, sellPrice, stockTotal } from './trade'
import type { GameState } from './types'

export interface CropDef {
  id: string
  good: string
  yield: number
  needs?: string[]
  eras?: string[]
  notEras?: string[]
}
const C = CROPS as { crops: CropDef[] }

/** Культуры, которые растили в этом краю и эпохе. */
export function cropsHere(state: GameState): CropDef[] {
  const era = ERA_META[state.hero.era]
  if (!era) return []
  return C.crops.filter((c) => (c.eras ? c.eras.includes(era.id) : !c.needs || c.needs.some((f) => era.features.includes(f))) && !c.notEras?.includes(era.id))
}

/** Что сейчас сеют: выбранное игроком, если оно растёт здесь, иначе первое (хлеб края). */
export function cropOf(state: GameState): CropDef | undefined {
  const here = cropsHere(state)
  return here.find((c) => c.id === state.hero.crop) ?? here[0]
}

/** Цена меры урожая на здешнем рынке (если товара на рынке нет - базовая цена). */
export function cropPrice(state: GameState, c: CropDef): number {
  return goodsHere(state).some((g) => g.id === c.good) ? sellPrice(state, c.good) : Math.round((goodDef(c.good)?.price ?? 10) * 0.9)
}

/** Сколько в среднем даст надел этой культурой в год (мер и денег) - для выбора в шторке надела. */
export function cropOutlook(state: GameState, c: CropDef): { units: number; money: number } {
  const units = Math.max(1, Math.round((state.hero.land ?? 0) * c.yield * 0.9))
  return { units, money: Math.round(units * cropPrice(state, c)) }
}

/**
 * Урожай года: k - удача года (0,4–1,4) с поправкой на работников. Продаётся по цене рынка или ложится в запас рода.
 * Возвращает деньги, вырученные в этом году (для учёта дохода).
 */
export function harvestYear(state: GameState, k: number): number {
  const hero = state.hero
  const land = hero.land ?? 0
  const crop = cropOf(state)
  if (!land || !crop) return 0
  const units = Math.max(0, Math.round(land * crop.yield * k))
  const price = cropPrice(state, crop)
  let stored = 0
  if (hero.cropStore && units > 0) {
    const trade = initializeTrade(state)
    stored = Math.max(0, Math.min(units, capacity(state) - stockTotal(state)))
    if (stored > 0) {
      let item = trade.inventory.goods.find((g) => g.id === crop.good)
      if (!item) trade.inventory.goods.push((item = { id: crop.good, quantity: 0, averagePrice: 0 }))
      item.averagePrice = (item.averagePrice * item.quantity + price * stored) / (item.quantity + stored)
      item.quantity += stored
    }
  }
  const money = (units - stored) * price
  hero.money += money
  hero.lastHarvest = { year: state.year, crop: crop.id, units, stored, money }
  return money
}
