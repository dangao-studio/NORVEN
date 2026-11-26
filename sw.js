/* 諾文小鎮 Service Worker：離線也能打開
 * 更新內容後，把 CACHE 的版本號 +1，使用者下次開啟就會拿到新版。 */
const CACHE = "novum-town-v3.23.0";
const FILES = [
  "./", "index.html", "manifest.webmanifest", "css/style.css",
  "data/characters.js", "data/locations.js", "data/schedules.js",
  "data/events-new.js", "data/events-more.js", "data/events-original.js",
  "data/events-solo.js", "data/voices.js", "data/voices-b.js", "data/relations.js", "data/phone.js", "data/phone-voices.js", "data/festivals.js", "data/shops.js", "data/floorplans.js", "data/interiors.js", "data/interiors-extra.js", "data/diary.js", "data/skins.js",
  "js/engine.js", "js/lofi.js", "js/sfx.js", "js/splash.js", "js/picto.js", "js/blocky.js", "js/life.js", "js/voxroom.js", "js/voxtown.js", "js/voxcity.js", "js/town3d.js", "js/app.js", "vendor/three.min.js",
  "icons/skins/sk01.png", "icons/skins/sk02.png", "icons/skins/sk03.png", "icons/skins/sk04.png", "icons/skins/sk05.png", "icons/skins/sk06.png", "icons/skins/sk07.png", "icons/skins/sk08.png", "icons/skins/sk09.png", "icons/skins/sk10.png", "icons/skins/sk11.png", "icons/skins/sk12.png", "icons/skins/sk13.png", "icons/skins/sk14.png", "icons/skins/sk15.png", "icons/skins/sk16.png", "icons/icon-180.png", "icons/icon-192.png", "icons/icon-512.png", "icons/icon-maskable-512.png",
  "icons/avatars/av01.webp", "icons/avatars/av02.webp", "icons/avatars/av03.webp", "icons/avatars/av04.webp", "icons/avatars/av05.webp", "icons/avatars/av06.webp", "icons/avatars/av07.webp", "icons/avatars/av08.webp", "icons/avatars/av09.webp", "icons/avatars/av10.webp", "icons/avatars/av11.webp", "icons/avatars/av12.webp", "icons/avatars/av13.webp", "icons/avatars/av14.webp", "icons/avatars/av15.webp", "icons/avatars/av16.webp"
];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
// 先用網路拿最新版，拿不到再用快取（離線）
self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  e.respondWith(
    fetch(e.request).then(res => {
      if (res.ok && new URL(e.request.url).origin === location.origin) {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy));
      }
      return res;
    }).catch(() => caches.match(e.request, { ignoreSearch: true })
      .then(r => r || (e.request.mode === "navigate" ? caches.match("index.html") : undefined)))
  );
});
