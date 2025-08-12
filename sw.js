const CACHE = 'sst-cache-v6';

self.addEventListener('install', (e)=>{
  e.waitUntil(caches.open(CACHE).then(c=>c.addAll([
    './',
    './index.html',
    './app.css',
    './app.js',
    './manifest.json'
  ])));
  self.skipWaiting();
});

self.addEventListener('activate', (e)=>{
  e.waitUntil((async ()=>{
    const keys = await caches.keys();
    await Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)));
  })());
  self.clients.claim();
});

self.addEventListener('fetch', (e)=>{
  e.respondWith((async ()=>{
    const cached = await caches.match(e.request);
    if (cached) return cached;
    try{
      const res = await fetch(e.request);
      const c = await caches.open(CACHE);
      c.put(e.request, res.clone());
      return res;
    }catch(err){
      return cached || Response.error();
    }
  })());
});

