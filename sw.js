const CACHE = 'ohm-certs-v10';
const SHELL = ['/certificates/', '/certificates/index.html'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Navigation — always serve shell
  if (e.request.mode === 'navigate') {
    e.respondWith(
      caches.match('/certificates/index.html')
        .then(c => c || fetch(e.request))
        .catch(() => caches.match('/certificates/index.html'))
    );
    return;
  }

  // App assets — cache on first fetch, serve from cache thereafter
  if (url.pathname.startsWith('/certificates/assets/')) {
    e.respondWith(
      caches.open(CACHE).then(async cache => {
        const cached = await cache.match(e.request);
        if (cached) return cached;
        try {
          const response = await fetch(e.request);
          if (response.ok) cache.put(e.request, response.clone());
          return response;
        } catch {
          return new Response('Offline', { status: 503 });
        }
      })
    );
    return;
  }

  // Favicon / manifest / sw itself — network with cache fallback
  if (url.pathname.startsWith('/certificates/') && !url.pathname.includes('supabase')) {
    e.respondWith(
      fetch(e.request)
        .then(response => {
          if (response.ok) {
            caches.open(CACHE).then(c => c.put(e.request, response.clone()));
          }
          return response;
        })
        .catch(() => caches.match(e.request))
    );
  }
});
