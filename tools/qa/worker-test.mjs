// Проверка приёмника на локальном SQLite вместо D1.
import { DatabaseSync } from 'node:sqlite'
const mod = await import(process.argv[2])
const sql = new DatabaseSync(':memory:')
const wrap = (q, args = []) => ({
  bind: (...a) => wrap(q, a),
  run: async () => sql.prepare(q).run(...args),
  all: async () => ({ results: sql.prepare(q).all(...args) }),
  q, args,
})
const DB = { prepare: (q) => wrap(q), batch: async (list) => list.map((s) => sql.prepare(s.q).run(...s.args)), exec: async (q) => sql.exec(q) }
const env = { DB, ADMIN_PASSWORD: 'pw', ASSETS: { fetch: async () => new Response('static') } }
const ctx = { waitUntil() {} }
const call = (path, init = {}) => mod.default.fetch(new Request('https://thousands.life' + path, init), env, ctx)
const post = (path, body) => call(path, { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://thousands.life' }, body: JSON.stringify(body) })
let r = await post('/api/events', { events: [
  { name: 'app_open', ts: Date.now(), player_id: 'p1', session_id: 's1', platform: 'web', build: 'b', lang: 'ru', life_index: 1 },
  { name: 'life_start', player_id: 'p1', life_index: 1, mode: 'quick' },
  { name: 'age_milestone', player_id: 'p1', age: 20, sec_in_life: 300 },
  { name: 'life_end', player_id: 'p1', mode: 'quick', age: 54, sec_in_life: 700, choices: 30 },
  { name: 'choice_made', player_id: 'p1', event_id: 'market_fight', success: true },
  { name: 'session_end', player_id: 'p1', screen: 'life', age: 12, sec_in_session: 400 },
  { name: 'Bad Name!' },
] })
console.log('events', r.status, await r.json(), r.headers.get('access-control-allow-origin'))
r = await post('/api/feedback', { rating: 4, answers: { liked: 'сцены', change: 'быстрее' }, contact: '', context: { era: 'E03' }, player_id: 'p1' })
console.log('feedback', r.status, await r.json())
r = await call('/api/time', { method: 'HEAD' }); console.log('time', r.status)
r = await call('/admin'); console.log('admin no auth', r.status)
r = await call('/admin', { headers: { authorization: 'Basic ' + btoa('x:pw') } }); const html = await r.text()
console.log('admin', r.status, html.length, /быстрее/.test(html), (html.match(/<table>/g) || []).length, 'tables')
console.log(html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 900))
r = await call('/'); console.log('static', await r.text())
r = await post('/api/events', { events: [] }); console.log('empty', r.status)
