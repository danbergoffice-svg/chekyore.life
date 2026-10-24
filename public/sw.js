// Офлайн-режим: страница — из сети, а без сети из кэша; файлы сборки с хэшем в имени — сразу из кэша.
const CACHE = 'thousands-v1'

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()))

self.addEventListener('fetch', (e) => {
  const req = e.request
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return
  e.respondWith(
    (async () => {
      const cache = await caches.open(CACHE)
      if (req.mode === 'navigate') {
        try {
          const res = await fetch(req)
          cache.put(req, res.clone())
          return res
        } catch {
          return (await cache.match(req)) || (await cache.match('./')) || Response.error()
        }
      }
      const hit = await cache.match(req)
      if (hit) return hit
      const res = await fetch(req)
      if (res.ok) cache.put(req, res.clone())
      return res
    })(),
  )
})
