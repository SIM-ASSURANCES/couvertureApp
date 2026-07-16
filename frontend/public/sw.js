/**
 * Service worker minimal pour le mode hors-ligne de l'espace agent IMF.
 * Stratégie "réseau d'abord, repli sur le cache" : chaque requête réussie
 * (navigation, JS/CSS/images) est mise en cache au passage ; en cas d'échec
 * réseau, on sert la dernière version connue. Volontairement simple (pas de
 * précaching basé sur un manifeste de build) : l'app devient utilisable
 * hors-ligne progressivement, dès qu'un agent l'a ouverte une première fois
 * en étant connecté — cohérent avec l'usage réel (un agent de terrain a déjà
 * utilisé l'appli au bureau avant de partir en zone non couverte).
 */
const CACHE_NAME = "sim-imf-shell-v1";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  // Ne jamais intercepter les appels API : ils doivent échouer nettement en
  // l'absence de réseau pour que la logique hors-ligne applicative (file
  // IndexedDB, calcul local) prenne le relais, pas un cache HTTP silencieux.
  if (req.method !== "GET" || new URL(req.url).pathname.startsWith("/api/")) {
    return;
  }

  event.respondWith(
    fetch(req)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
        return res;
      })
      .catch(() => caches.match(req).then((cached) => cached || Promise.reject("offline-no-cache")))
  );
});
