import type { EraDef, EraMeta, EventDef, NewsDef, ReligionDef } from '../engine/types'
import patternWeights from './pattern_weights.json'
import religions from './religions.json'

// Контент устроен слоями:
//   common/  — события, которые случаются в любой стране (детство, семья, работа, пороки, драмы);
//   <страна>/era.json — сословия, профессии, имена, вера, смертность (грузится сразу для всех стран);
//   <страна>/events*.json, news*.json — местные события и вести (грузятся, когда страна нужна).
// Местное событие с тем же id заменяет общее.

const metas = import.meta.glob<EraMeta>('./*/era.json', { eager: true, import: 'default' })
const packs = import.meta.glob<unknown[]>(['./*/events*.json', './*/news*.json'], { import: 'default' })

export const RELIGIONS = religions as ReligionDef[]
export const RELIGION_BY_ID = new Map(RELIGIONS.map((r) => [r.id, r]))

/** Все страны: id → описание без событий. */
export const ERA_META: Record<string, EraMeta> = {}
/** Папка с контентом страны. */
export const ERA_FOLDER: Record<string, string> = {}
/** К какой стране относится регион (id регионов уникальны). */
export const REGION_ERA: Record<string, string> = {}

for (const [path, meta] of Object.entries(metas)) {
  const folder = path.split('/')[1]
  ERA_META[meta.id] = meta
  ERA_FOLDER[meta.id] = folder
  for (const r of meta.regions) REGION_ERA[r.id] = meta.id
}

/** Страны в порядке времени. */
export const ERA_IDS = Object.keys(ERA_META).sort((a, b) => ERA_META[a].years[0] - ERA_META[b].years[0])

export const DEFAULT_ERA = 'E03'

async function loadFiles<T>(folder: string, kind: 'events' | 'news'): Promise<T[]> {
  const loaders = Object.entries(packs)
    .filter(([path]) => path.startsWith(`./${folder}/${kind}`))
    .sort(([a], [b]) => a.localeCompare(b))
  return (await Promise.all(loaders.map(([, load]) => load()))).flat() as T[]
}

function professionsIn(ev: EventDef): string[] {
  const out: string[] = []
  const walk = (x: unknown) => {
    if (Array.isArray(x)) x.forEach(walk)
    else if (x && typeof x === 'object') {
      for (const [k, v] of Object.entries(x)) {
        if ((k === 'set_profession' || k === 'npc_profession') && typeof v === 'string') out.push(v)
        else walk(v)
      }
    }
  }
  walk(ev)
  return out
}

/** Подходит ли событие общего слоя этой стране. */
export function fitsEra(ev: EventDef, meta: EraMeta): boolean {
  if (ev.eras && !ev.eras.includes(meta.id)) return false
  if (ev.not_eras?.includes(meta.id)) return false
  if (meta.exclude_events?.includes(ev.id)) return false
  if (ev.needs && !ev.needs.every((f) => meta.features.includes(f))) return false
  if (ev.regions && !ev.regions.some((r) => REGION_ERA[r] === meta.id)) return false
  const profs = new Set(meta.professions.map((p) => p.id))
  if (professionsIn(ev).some((p) => !profs.has(p))) return false
  if (ev.religions) {
    const present = new Set<string>()
    for (const r of meta.regions) {
      for (const w of [r.religions, ...(r.religionEras ?? []).map((x) => x.religions), ...Object.values(r.classReligions ?? {})]) {
        for (const id of Object.keys(w)) {
          const def = RELIGION_BY_ID.get(id)
          present.add(id)
          if (def) [def.group, ...(def.tags ?? [])].forEach((g) => present.add(g))
        }
      }
    }
    if (!ev.religions.some((r) => present.has(r))) return false
  }
  return true
}

const loaded: Record<string, EraDef> = {}
const loading: Record<string, Promise<EraDef>> = {}
let common: Promise<EventDef[]> | null = null

/** Загрузить страну со всеми событиями. Повторный вызов возвращает уже загруженную. */
export function loadEra(id: string): Promise<EraDef> {
  const meta = ERA_META[id]
  if (!meta) return Promise.reject(new Error(`Unknown era ${id}`))
  if (id in loading) return loading[id]
  common ??= loadFiles<EventDef>('common', 'events')
  loading[id] = Promise.all([common, loadFiles<EventDef>(ERA_FOLDER[id], 'events'), loadFiles<NewsDef>(ERA_FOLDER[id], 'news')]).then(
    ([shared, local, news]) => {
      const byId = new Map<string, EventDef>()
      for (const ev of shared) if (fitsEra(ev, meta)) byId.set(ev.id, ev)
      for (const ev of local) byId.set(ev.id, ev)
      // Последствия, ведущие к событиям, которых в этой стране нет, просто не наступают.
      const events = [...byId.values()].map((ev) => {
        if (!ev.choices?.some((c) => c.delayed_effects?.some((d) => !byId.has(d.trigger_event)))) return ev
        return { ...ev, choices: ev.choices.map((c) => ({ ...c, delayed_effects: c.delayed_effects?.filter((d) => byId.has(d.trigger_event)) })) }
      })
      const era: EraDef = { ...meta, events, news, patternWeights: patternWeights as EraDef['patternWeights'] }
      loaded[id] = era
      return era
    },
  )
  return loading[id]
}

/** Все страны (для тестов и инструментов). */
export async function loadAllEras(): Promise<Record<string, EraDef>> {
  await Promise.all(ERA_IDS.map(loadEra))
  return { ...loaded }
}

export function isEraLoaded(id: string): boolean {
  return id in loaded
}

/** Уже загруженная страна. */
export function eraById(id: string): EraDef {
  const era = loaded[id]
  if (!era) throw new Error(`Era ${id} is not loaded`)
  return era
}
