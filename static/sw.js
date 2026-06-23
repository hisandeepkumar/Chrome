const CACHE_NAME = 'winlauncher-v4';
const ASSETS = ['/', '/static/style.css', '/static/script.js', '/static/manifest.json', '/static/icon-192.png', '/static/icon-512.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(keys => Promise.all(keys.map(key => { if(key !== CACHE_NAME) return caches.delete(key); }))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => { e.respondWith(caches.match(e.request).then(r => r || fetch(e.request))); });
