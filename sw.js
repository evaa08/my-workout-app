// Service worker intentionally does not cache app files to avoid stale versions after GitHub Pages updates.
self.addEventListener('install',()=>self.skipWaiting());self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
