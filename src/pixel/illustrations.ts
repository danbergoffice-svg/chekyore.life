// Иллюстрации ключевых моментов (ТЗ графики, G3): по 18 моментов на страну + сон и справка.
// Файлы - src/art/<папка страны>/<момент>.png (или .webp), 256×144, палитра стиля страны, ≤ 30 КБ.
// Грузятся только для страны героя (import.meta.glob без eager - файлы с хешем, как чанки стран).
// Если картинки нет или она не загрузилась - показывается процедурная сцена: игра картинку не ждёт.
import { ERA_FOLDER } from '../content'
import type { EventDef } from '../engine/types'

export const MOMENTS = [
  'birth', 'childhood', 'wedding', 'child_born', 'old_age',
  'study', 'work', 'market', 'rich', 'poor',
  'rite', 'pilgrimage', 'court',
  'war', 'plague', 'famine', 'fire', 'funeral',
  'dream', 'primer',
] as const
export type Moment = (typeof MOMENTS)[number]

export const ART_W = 256
export const ART_H = 144

const FILES = import.meta.glob<string>('../art/*/*.{png,webp}', { query: '?url', import: 'default' })

function fileOf(folder: string, moment: Moment): string | undefined {
  return Object.keys(FILES).find((k) => k === `../art/${folder}/${moment}.png` || k === `../art/${folder}/${moment}.webp`)
}

/** Есть ли иллюстрация момента для страны (папка - как у контента: rus, europe, china…). */
export function hasIllustration(era: string, moment: Moment): boolean {
  return !!fileOf(ERA_FOLDER[era] ?? era.toLowerCase(), moment)
}

const urls = new Map<string, Promise<string | null>>()

/** Адрес картинки (загружается лениво, один раз). null - картинки нет. */
export function illustrationUrl(era: string, moment: Moment): Promise<string | null> {
  const folder = ERA_FOLDER[era] ?? era.toLowerCase()
  const key = `${folder}/${moment}`
  let p = urls.get(key)
  if (!p) {
    const file = fileOf(folder, moment)
    p = file ? FILES[file]().catch(() => null) : Promise.resolve(null)
    urls.set(key, p)
  }
  return p
}

const RULES: [RegExp, Moment][] = [
  [/wedding|marriage|marry|betroth|bride|groom/, 'wedding'],
  [/child_born|newborn|childbirth|first_child|baby/, 'child_born'],
  [/^birth|birth_naming|naming/, 'birth'],
  [/plague|epidemic|smallpox|pox|black_death|cocoliztli|cholera|fever/, 'plague'],
  [/famine|hunger|drought|bad_harvest|harvest_fail/, 'famine'],
  [/fire|flood|earthquake|storm|quake|eruption/, 'fire'],
  [/war|raid|battle|siege|army|conscript|invasion|horde|crusade/, 'war'],
  [/funeral|burial|mourning|death_of|widow/, 'funeral'],
  [/pilgrim|hajj|journey|voyage/, 'pilgrimage'],
  [/court|trial|judge|palace|emperor|king|sultan|tsar|prince|khan|shogun|pharaoh|caliph/, 'court'],
  [/school|study|apprentic|teacher|exam|scholar|letters|read/, 'study'],
  [/market|trade|merchant|caravan|bargain|shop/, 'market'],
  [/debt|poverty|beggar|ruin|bankrupt/, 'poor'],
  [/new_house|fortune|inherit|wealth|rich|estate|promotion/, 'rich'],
  [/festival|feast|rite|ritual|temple|baptism|holiday|church|mosque|monaster|prayer/, 'rite'],
  [/old_age|elder|grandchild|retire/, 'old_age'],
  [/play|game|toy|childhood/, 'childhood'],
  [/profession|job|work|craft|guild|field|harvest/, 'work'],
]

const BY_PLACE: Partial<Record<string, Moment>> = { market: 'market', temple: 'rite', battle: 'war', camp: 'war', palace: 'court', school: 'study', tomb: 'funeral', workshop: 'work', field: 'work' }

/**
 * Момент для иллюстрации события: поле image_slot или - у событий-вех, поворотов, исторических и с бедствиями -
 * по id и месту сцены. Остальные события остаются с процедурной сценой.
 */
export function momentOf(ev: EventDef): Moment | undefined {
  if (ev.image_slot && (MOMENTS as readonly string[]).includes(ev.image_slot)) return ev.image_slot as Moment
  if (ev.type === 'dream') return 'dream'
  const key = ev.milestone || ev.turning || ev.type === 'global_historical' || !!ev.scene?.disaster
  if (!key) return undefined
  if (ev.scene?.disaster) return ev.scene.disaster === 'fire' || ev.scene.disaster === 'flood' || ev.scene.disaster === 'ruin' ? 'fire' : undefined
  for (const [re, m] of RULES) if (re.test(ev.id)) return m
  return BY_PLACE[ev.scene?.place ?? '']
}
