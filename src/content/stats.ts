import { loadAllEras, RELIGIONS } from '.'

/** Числа для меню: разные события во всех странах (общие считаются один раз), исторические, вести, веры. */
export async function computeStats() {
  const eras = Object.values(await loadAllEras())
  const events = new Set(eras.flatMap((e) => e.events.map((ev) => ev.id)))
  const history = new Set(eras.flatMap((e) => e.events.filter((ev) => ev.type === 'global_historical').map((ev) => ev.id)))
  const news = eras.reduce((n, e) => n + e.news.length, 0)
  return { countries: eras.length, events: events.size, history: history.size, news, religions: RELIGIONS.length }
}
