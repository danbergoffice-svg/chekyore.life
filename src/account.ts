// Аккаунт игрока на сайте (worker/account.ts): вход по ссылке на почту, сохранение мемориала и наград на сервере,
// рассылка новостей и бонусных кодов, удаление своих данных. Только на своём сайте (не в Яндекс Играх и CrazyGames)
// и не для игроков из России (сервер отвечает ru: true - форму не показываем).
import type { Earned } from './engine/achievements'
import type { LifeSummary } from './engine/types'

export const ACCOUNT_ON = !import.meta.env.VITE_PLATFORM
const API = `${(import.meta.env.VITE_API_BASE as string | undefined) ?? '/api'}/account`
const SESSION_KEY = 'thousands.session'
const EMAIL_KEY = 'thousands.account'

export interface AccountData {
  memorial: LifeSummary[]
  achievements: Earned[]
}

const safe = <T,>(fn: () => T, fallback: T): T => {
  try {
    return fn()
  } catch {
    return fallback
  }
}
export const session = () => safe(() => localStorage.getItem(SESSION_KEY), null)
export const accountEmail = () => safe(() => localStorage.getItem(EMAIL_KEY), null)
const PENDING_KEY = 'thousands.account_pending'
/** Почта, на которую последний раз просили ссылку (если ещё не вошёл): подставляется в форму при повторном входе. */
export const pendingEmail = () => safe(() => localStorage.getItem(PENDING_KEY), null) ?? ''
export const rememberPending = (email: string | null) =>
  safe(() => (email ? localStorage.setItem(PENDING_KEY, email) : localStorage.removeItem(PENDING_KEY)), undefined)
function remember(token: string | null, email: string | null) {
  safe(() => {
    if (token) localStorage.setItem(SESSION_KEY, token)
    else localStorage.removeItem(SESSION_KEY)
    if (email) localStorage.setItem(EMAIL_KEY, email)
    else localStorage.removeItem(EMAIL_KEY)
  }, undefined)
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T | null> {
  const headers = new Headers(init.headers)
  const s = session()
  if (s) headers.set('authorization', `Bearer ${s}`)
  if (init.body) headers.set('content-type', 'application/json')
  try {
    const res = await fetch(`${API}${path}`, { ...init, headers })
    const body = (await res.json().catch(() => null)) as T | null
    if (res.status === 401) remember(null, null)
    return body
  } catch {
    return null
  }
}

/** Можно ли предлагать вход: свой сайт и не Россия. null - не удалось узнать (форму не показываем). */
export async function accountAvailable(): Promise<boolean> {
  if (!ACCOUNT_ON) return false
  const r = await call<{ ok: boolean; ru: boolean }>('/geo')
  return !!r?.ok && !r.ru
}

export async function startLogin(email: string, lang: string, newsletter: boolean, playerId: string): Promise<{ ok: boolean; error?: string; detail?: string }> {
  const r = await call<{ ok: boolean; error?: string; detail?: string }>('/start', { method: 'POST', body: JSON.stringify({ email, lang, newsletter, player_id: playerId }) })
  return r ?? { ok: false, error: 'network' }
}

export async function verifyLogin(token: string): Promise<{ ok: boolean; email?: string; newsletter?: boolean; error?: string }> {
  const r = await call<{ ok: boolean; session?: string; email?: string; newsletter?: boolean; error?: string }>('/verify', { method: 'POST', body: JSON.stringify({ token }) })
  if (r?.ok && r.session) {
    remember(r.session, r.email ?? null)
    rememberPending(null)
  }
  return r ?? { ok: false, error: 'network' }
}

export async function pullData(): Promise<{ data: AccountData | null; newsletter: boolean } | null> {
  if (!session()) return null
  const r = await call<{ ok: boolean; data: AccountData | null; newsletter: boolean }>('/data')
  return r?.ok ? { data: r.data, newsletter: r.newsletter } : null
}

/** Данные для сервера не больше ~850 КБ: у старых жизней сначала убираются дневник и графики (итог остаётся). */
export function slim(data: AccountData): AccountData {
  const memorial = data.memorial.map((l) => ({ ...l }))
  let size = JSON.stringify({ ...data, memorial }).length
  for (let i = 0; i < memorial.length && size > 850_000; i++) {
    memorial[i] = { ...memorial[i], diary: [], history: [] }
    size = JSON.stringify({ ...data, memorial }).length
  }
  return { ...data, memorial }
}

export async function pushData(data: AccountData): Promise<boolean> {
  if (!session()) return false
  const r = await call<{ ok: boolean }>('/data', { method: 'PUT', body: JSON.stringify(slim(data)) })
  return !!r?.ok
}

export async function setNewsletter(subscribe: boolean): Promise<boolean> {
  const r = await call<{ ok: boolean; newsletter: boolean }>('/newsletter', { method: 'POST', body: JSON.stringify({ subscribe }) })
  return !!r?.ok && r.newsletter === subscribe
}

export async function logout(): Promise<void> {
  await call('/logout', { method: 'POST' })
  remember(null, null)
}

export async function deleteAccount(playerId: string): Promise<boolean> {
  const r = await call<{ ok: boolean }>('', { method: 'DELETE', body: JSON.stringify({ player_id: playerId }) })
  if (r?.ok) remember(null, null)
  return !!r?.ok
}

/** Объединить сохранения устройства и сервера: жизни - по heroId (без повторов), награды - по id (раньше полученная). */
export function mergeData(local: AccountData, remote: AccountData | null): AccountData {
  if (!remote) return local
  const lives = new Map<string, LifeSummary>()
  for (const l of [...(remote.memorial ?? []), ...local.memorial]) {
    const old = lives.get(l.heroId)
    // Полная запись (с дневником) лучше урезанной.
    if (!old || (old.diary?.length ?? 0) < (l.diary?.length ?? 0)) lives.set(l.heroId, l)
  }
  const memorial = [...lives.values()].sort((a, b) => (a.record ?? 0) - (b.record ?? 0) || a.deathYear - b.deathYear)
  const ach = new Map<string, Earned>()
  for (const e of [...(remote.achievements ?? []), ...local.achievements]) {
    const old = ach.get(e.id)
    if (!old || e.ts < old.ts) ach.set(e.id, e)
  }
  return { memorial, achievements: [...ach.values()] }
}
