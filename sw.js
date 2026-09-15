const CACHE='ohm-certs-v2';
const SHELL=['/certificates/','/certificates/index.html'];
self.addEventListener('install',e=>{
  e.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL)));
  self.skipWaiting();
});
self.addEventListener('activate',e=>{
  e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener('fetch',e=>{
  if(e.request.mode==='navigate'){
    e.respondWith(caches.match('/certificates/index.html').then(c=>c||fetch(e.request)).catch(()=>caches.match('/certificates/index.html')));
  }
});
