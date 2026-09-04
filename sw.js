const CACHE_VERSION = '4.33';
const CACHE_SHELL = `pokoala-shell-${CACHE_VERSION}`;
// Cache images NON versionné : les images ne changent jamais, inutile de
// les re-télécharger à chaque nouvelle version (cause de rate-limit TCGdex)
const CACHE_IMAGES = 'pokoala-images';
const CACHE_API = 'pokoala-api';

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
        .filter(k => k !== CACHE_SHELL && k !== CACHE_IMAGES && k !== CACHE_API)
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
            // Les images cross-origin sans CORS renvoient une réponse OPAQUE :
            // status 0 et ok=false. Il faut donc la cacher explicitement,
            // sinon rien n'est jamais stocké.
            if(response.ok || response.type === 'opaque'){
              cache.put(e.request, response.clone());
            }
            return response;
          }).catch(() => cached);
        })
      )
    );
    return;
  }

  // API TCGdex : stale-while-revalidate — on sert le cache immédiatement et
  // on rafraîchit en arrière-plan (évite l'attente au retour dans un set)
  if(url.hostname.includes('api.tcgdex.net')){
    e.respondWith(
      caches.open(CACHE_API).then(cache =>
        cache.match(e.request).then(cached => {
          const net = fetch(e.request).then(response => {
            if(response.ok) cache.put(e.request, response.clone());
            return response;
          }).catch(() => cached);
          return cached || net;
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
