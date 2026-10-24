import { createContext } from 'preact'
import { useContext } from 'preact/hooks'
import type { T } from '../i18n'
import type { AttrId, DiaryEntry, GameState, Hero, Lang, Npc } from '../engine/types'
import { ATTRIBUTES } from '../engine/types'

export interface Ui {
  t: T
  lang: Lang
}

export const UiContext = createContext<Ui>(null as unknown as Ui)
export const useUi = () => useContext(UiContext)

/** Строка дневника: события показываются как «заголовок — выбор». */
export function diaryText(t: T, e: DiaryEntry, sex: Hero['sex'], region: string): string {
  const opts = { sex, region }
  if (e.key.startsWith('ev.')) {
    let s = t(e.key, {}, opts)
    const choice = e.params?.choice
    if (choice && typeof choice === 'object' && 'key' in choice && choice.key !== 'ui.ok') s += ` — ${t(choice.key, {}, opts)}`
    if (e.params?.result === 'success') s += ` (${t('diary.success')})`
    if (e.params?.result === 'failure') s += ` (${t('diary.failure')})`
    return s
  }
  return t(e.key, e.params, opts)
}

const band = (v: number, edges: number[]) => edges.filter((e) => v >= e).length

export function feelings(t: T, hero: Hero): string[] {
  const o = { sex: hero.sex }
  const h = hero.hidden
  return [
    t(`feel.happiness.${band(h.happiness, [20, 40, 60, 80])}`, {}, o),
    t(`feel.stress.${band(h.stress, [35, 70])}`, {}, o),
    t(`feel.loneliness.${band(h.loneliness, [30, 60])}`, {}, o),
    t(`feel.reputation.${band(h.reputation, [-10, 15, 50])}`, {}, o),
  ]
}

export function attitudeText(t: T, npc: Npc): string {
  return t(`npc.attitude.${band(npc.attitude, [-30, 0, 30, 65])}`)
}

export interface Snapshot {
  attrs: Record<AttrId, number>
  money: number
  skills: Record<string, number>
}

export function snapshot(state: GameState): Snapshot {
  return { attrs: { ...state.hero.attrs }, money: state.hero.money, skills: { ...state.hero.skills } }
}

export interface Change {
  key: string
  delta: number
  money?: boolean
}

/** Видимые изменения героя между двумя снимками. */
export function changes(before: Snapshot, state: GameState): Change[] {
  const hero = state.hero
  const out: Change[] = []
  for (const id of ATTRIBUTES) {
    const d = Math.round(hero.attrs[id] - before.attrs[id])
    if (d !== 0) out.push({ key: `attr.${id}`, delta: d })
  }
  for (const [skill, value] of Object.entries(hero.skills)) {
    const d = Math.round(value - (before.skills[skill] ?? 0))
    if (d !== 0) out.push({ key: `skill.${skill}`, delta: d })
  }
  const dm = hero.money - before.money
  if (dm !== 0) out.push({ key: 'attr.money', delta: dm, money: true })
  return out
}
