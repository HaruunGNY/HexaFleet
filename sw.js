/* HexaFleet — çevrimdışı çalışma için service worker
 * Strateji: önce internet (güncel sürüm gelsin), internet yoksa/yavaşsa önbellek. */
const ONBELLEK = 'tir-takip-v10';
const FONT_ONBELLEK = 'tir-takip-fontlar';
const DOSYALAR = ['./', 'index.html', 'app.js?v=10', 'styles.css?v=10', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-180.png', 'icons/amblem.png', 'icons/logo.jpg'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(ONBELLEK).then(c => c.addAll(DOSYALAR)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== ONBELLEK && k !== FONT_ONBELLEK).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const host = new URL(req.url).hostname;
  // Google yazı tipleri: önbellekten ver (çevrimdışı da marka fontu görünsün)
  if (host === 'fonts.googleapis.com' || host === 'fonts.gstatic.com') {
    e.respondWith(caches.open(FONT_ONBELLEK).then(async c => {
      const k = await c.match(req); if (k) return k;
      const r = await fetch(req); if (r.ok || r.type === 'opaque') c.put(req, r.clone()); return r;
    }));
    return;
  }
  if (new URL(req.url).origin !== self.location.origin) return; // Apps Script isteklerine dokunma

  e.respondWith((async () => {
    const onbellek = await caches.open(ONBELLEK);
    const ag = fetch(req, { cache: 'no-cache' }).then(r => {
      if (r.ok) onbellek.put(req, r.clone());
      return r;
    });
    const zamanAsimi = new Promise(res => setTimeout(res, 3500));
    try {
      const sonuc = await Promise.race([ag, zamanAsimi]);
      if (sonuc) return sonuc;
    } catch (err) { /* çevrimdışı */ }
    const kayitli = await onbellek.match(req, { ignoreSearch: true });
    if (kayitli) return kayitli;
    try { return await ag; } catch (err) {
      return (await onbellek.match('index.html')) || Response.error();
    }
  })());
});
