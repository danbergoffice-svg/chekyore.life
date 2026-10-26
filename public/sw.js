// Офлайн-режим: страница — из сети, а без сети из кэша; файлы сборки с хэшем в имени — сразу из кэша.
// v2: не кэшируем HTML под видом скрипта (Cloudflare на отсутствующий файл отдаёт главную страницу),
// при обновлении удаляем старые кэши.
const CACHE = 'thousands-v2'

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (e) =>
  e.waitUntil(
    (async () => {
      for (const key of await caches.keys()) if (key !== CACHE) await caches.delete(key)
      await self.clients.claim()
    })(),
  ),
)

const isHtml = (res) => (res.headers.get('content-type') || '').includes('text/html')

self.addEventListener('fetch', (e) => {
  const req = e.request
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return
  e.respondWith(
    (async () => {
      const cache = await caches.open(CACHE)
      if (req.mode === 'navigate') {
        try {
          const res = await fetch(req)
          if (res.ok) cache.put(req, res.clone())
          return res
        } catch {
          return (await cache.match(req)) || (await cache.match('./')) || Response.error()
        }
      }
      const hit = await cache.match(req)
      if (hit && !isHtml(hit)) return hit
      const res = await fetch(req)
      // Файл сборки, которого больше нет на сервере, приходит как главная страница — такое не кэшируем.
      if (res.ok && !isHtml(res)) cache.put(req, res.clone())
      return res
    })(),
  )
})
