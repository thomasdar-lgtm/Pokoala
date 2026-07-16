const CACHE_VERSION = '3.93';
const CACHE_SHELL = `pokoala-shell-${CACHE_VERSION}`;
const CACHE_IMAGES = `pokoala-images-${CACHE_VERSION}`;

const IMAGE_HOSTS = [
  'assets.tcgdex.net',
  'images.pokemontcg.io',
  'images.scrydex.com',
  'fonts.googleapis.com',
  'fonts.gstatic.com'
];

self.addEventListener('install', e => {
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys
        .filter(k => k !== CACHE_SHELL && k !== CACHE_IMAGES)
        .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Images : cache-first
  if(IMAGE_HOSTS.some(h => url.hostname.includes(h))){
    e.respondWith(
      caches.open(CACHE_IMAGES).then(cache =>
        cache.match(e.request).then(cached => {
          if(cached) return cached;
          return fetch(e.request).then(response => {
            if(response.ok) cache.put(e.request, response.clone());
            return response;
          }).catch(() => cached);
        })
      )
    );
    return;
  }

  // APIs Google : toujours réseau
  if(url.hostname.includes('googleapis.com') ||
     url.hostname.includes('accounts.google.com') ||
     (url.hostname.includes('gstatic.com') && url.pathname.includes('gsi'))){
    return;
  }

  // Shell : network-first
  e.respondWith(
    fetch(e.request)
      .then(response => {
        if(response.ok){
          caches.open(CACHE_SHELL).then(cache => cache.put(e.request, response.clone()));
        }
        return response;
      })
      .catch(() => caches.match(e.request))
  );
});
