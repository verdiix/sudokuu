// Prosty service worker (cache-first) dla Sudoku PWA
const CACHE_NAME = "sudoku-pwa-v1";
const ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png"
];

self.addEventListener("install", (event)=>{
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache=>cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event)=>{
  event.waitUntil((async ()=>{
    const keys = await caches.keys();
    await Promise.all(keys.filter(k=>k!==CACHE_NAME).map(k=>caches.delete(k)));
  })());
  self.clients.claim();
});

self.addEventListener("fetch", (event)=>{
  const url = new URL(event.request.url);
  // network-first dla HTML (żeby się nie zaklinowało)
  if(event.request.mode === "navigate"){
    event.respondWith((async ()=>{
      try{
        const net = await fetch(event.request);
        const cache = await caches.open(CACHE_NAME);
        cache.put(event.request, net.clone());
        return net;
      }catch{
        const cache = await caches.open(CACHE_NAME);
        return (await cache.match("./index.html")) || Response.error();
      }
    })());
    return;
  }
  // cache-first dla reszty
  event.respondWith((async ()=>{
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(event.request);
    if(cached) return cached;
    try{
      const res = await fetch(event.request);
      if(res && res.status === 200 && res.type === "basic"){
        cache.put(event.request, res.clone());
      }
      return res;
    }catch{
      return cached || Response.error();
    }
  })());
});
