const CACHE = 'mochi-bird-v1';
const PRECACHE = ['/', '/manifest.json', '/style.css', '/game-v2.js', '/assets/avatar-v2.png', '/assets/dr-pepper-can.png'];
self.addEventListener('install', e => e.waitUntil(caches.open(CACHE).then(c => c.addAll(PRECACHE))));
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
});
