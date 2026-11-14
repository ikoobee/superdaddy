/* Service Worker —— cache-first，仅部署版生效（https） */
const CACHE = 'superdaddy-v0.43'
const CORE = [
  './', 'index.html',
  'styles/tokens.css', 'styles/app.css',
  'src/boot.js', 'src/ui.js', 'src/store.js', 'src/views.js', 'src/app.js',
  'src/utils/time.js', 'src/utils/vaccine.js', 'src/utils/summary.js',
  'src/utils/growth.js', 'src/utils/features.js', 'src/utils/trends.js', 'src/utils/tasks.js', 'src/utils/cal.js', 'src/utils/preg.js', 'src/utils/feedplan.js', 'src/utils/merge.js', 'src/utils/sync.js', 'src/utils/timers.js',
  'src/data/vaccine.data.js', 'src/data/who.data.js', 'src/data/guide.data.js',
  'src/data/feed.data.js', 'src/data/epds.data.js', 'src/data/bf_med.data.js',
  'src/data/health.data.js', 'src/data/mom.data.js', 'src/data/milestone.data.js',
  'src/data/sleep_ref.data.js', 'src/data/day42.data.js', 'src/data/bag.data.js', 'src/data/care.data.js',
  'manifest.webmanifest', 'icons/icon.svg',
]

self.addEventListener('install', e => {
  /* 预缓存一律 cache:'reload' 绕过 HTTP 缓存——否则新 SW 可能装进 4h 缓存窗内的旧资源（版本串滞后的根因） */
  e.waitUntil(
    caches.open(CACHE).then(async c => {
      await Promise.all(CORE.map(async u => {
        const res = await fetch(u, { cache: 'reload' })
        if (!res.ok) throw new Error('precache failed: ' + u)
        await c.put(u, res)
      }))
    }).then(() => self.skipWaiting()),
  )
})
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return
  e.respondWith(
    caches.match(e.request).then(hit => hit || fetch(e.request).then(res => {
      if (res.ok && new URL(e.request.url).origin === location.origin) {
        const copy = res.clone()
        caches.open(CACHE).then(c => c.put(e.request, copy))
      }
      return res
    }).catch(() => caches.match('index.html'))),
  )
})
