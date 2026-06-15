const CACHE_SHELL = 'pokoala-shell-v1';
const CACHE_IMAGES = 'pokoala-images-v1';

const SHELL_FILES = [
  './pokoala_mobile.html',
  './Logo.png'
];

const IMAGE_HOSTS = [
  'assets.tcgdex.net',
  'images.pokemontcg.io',
  'images.scrydex.com',
  'fonts.googleapis.com',
  'fonts.gstatic.com'
];

// Installation : mise en cache du shell
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_SHELL).then(cache => cache.addAll(SHELL_FILES))
  );
  self.skipWaiting();
});

// Activation : nettoyage des anciens caches
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys
        .filter(k => k !== CACHE_SHELL && k !== CACHE_IMAGES)
        .map(k => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// Fetch : stratégie cache-first pour les images, network-first pour le reste
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

  // APIs Google (Drive, OAuth) : toujours réseau
  if(url.hostname.includes('googleapis.com') || 
     url.hostname.includes('accounts.google.com') ||
     url.hostname.includes('gstatic.com') && url.pathname.includes('gsi')){
    return;
  }

  // Shell (HTML, Logo) : cache-first avec fallback réseau
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});
