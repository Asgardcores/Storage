const CACHE = 'sst-cache-v1';

self.addEventListener('install', (e)=>{
  e.waitUntil(caches.open(CACHE).then(c=>c.addAll([
    './',
    './index.html',
    './app.css',
    './app.js',
    './manifest.json'
	'./cloud-sync.js',
	'./cloud-ui.js',
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
  const req = e.request;
  const url = new URL(req.url);

  // Only cache same-origin GET requests
  if (req.method !== 'GET' || url.origin !== location.origin) return;

  e.respondWith((async ()=>{
    const cached = await caches.match(req);
    if (cached) return cached;
    try{
      const res = await fetch(req);
      if (res.ok) {
        const c = await caches.open(CACHE); // or CACHE_NAME if that's your constant
        c.put(req, res.clone());
      }
      return res;
    }catch(err){
      return cached || Response.error();
    }
  })());
});
