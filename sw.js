const CACHE_VERSION = '4.83';
const CACHE_SHELL = `pokoala-shell-${CACHE_VERSION}`;
// Cache images NON versionné : les images ne changent jamais, inutile de
// les re-télécharger à chaque nouvelle version (cause de rate-limit TCGdex)
const CACHE_IMAGES = 'pokoala-images';
const CACHE_API = 'pokoala-api';
// Base de cartes (data/) : non versionné, la clé contient ?v=DATA_VER
const CACHE_DATA = 'pokoala-data';

const IMAGE_HOSTS = [
  'assets.tcgdex.net',
  'images.pokemontcg.io',
  'images.scrydex.com',
  'archives.bulbagarden.net',
  'fonts.googleapis.com',
  'fonts.gstatic.com'
];

// Plus de skipWaiting automatique : la nouvelle version attend que
// l'utilisateur appuie sur « Installer », ou le prochain lancement de l'app
// après fermeture complète.
self.addEventListener('install', () => {});

self.addEventListener('message', e => {
  if(e.data === 'skipWaiting' || (e.data && e.data.type === 'SKIP_WAITING')) self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys
        .filter(k => k !== CACHE_SHELL && k !== CACHE_IMAGES && k !== CACHE_API && k !== CACHE_DATA)
        .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Vérification de version (?_=…) et rechargement après installation
  // (?maj=…) : réseau direct, sans rien stocker (une entrée par appel sinon)
  if(url.origin === self.location.origin && (url.searchParams.has('_') || url.searchParams.has('maj'))){
    return;
  }

  // Base de cartes : cache d'abord (une nouvelle version change ?v=)
  if(url.origin === self.location.origin && url.pathname.includes('/data/')){
    e.respondWith(
      caches.open(CACHE_DATA).then(cache =>
        cache.match(e.request).then(hit => hit || fetch(e.request).then(r => {
          if(r.ok){
            cache.put(e.request, r.clone());
            // ne garder que la version courante de chaque fichier
            cache.keys().then(ks => ks.forEach(k => {
              const u = new URL(k.url);
              if(u.pathname === url.pathname && u.search !== url.search) cache.delete(k);
            }));
          }
          return r;
        }))
      )
    );
    return;
  }

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

  // Fiches de cartes TCGdex : toujours réseau (elles portent les prix du
  // jour ; un cache servirait la tendance de la veille)
  if(url.hostname.includes('api.tcgdex.net') && url.pathname.includes('/cards/')){
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
