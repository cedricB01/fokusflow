const CACHE = 'fokusflow-v1';

self.addEventListener('install', e => {
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  if (e.request.url.includes('supabase') || e.request.url.includes('anthropic')) return;
  e.respondWith(
    caches.open(CACHE).then(cache =>
      fetch(e.request).then(res => {
        cache.put(e.request, res.clone());
        return res;
      }).catch(() => caches.match(e.request))
    )
  );
});