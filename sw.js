/* 処分ナビ Service Worker — アプリシェルをキャッシュしオフライン動作させる。
   ファイルを更新したら CACHE のバージョン名（v1→v2…）を上げると確実に反映されます。 */
const CACHE = 'shobun-navi-v3';
const ASSETS = [
  './',
  './index.html',
  './soryo-tool.html',
  './reminder.html',
  './manifest.json',
  './icon.svg',
  './icon-180.png',
  './icon-192.png',
  './icon-512.png',
  './data/gomi/13109.json',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  // 同一オリジンのみキャッシュ対象（外部リンク先はそのままネットワークへ）
  if (new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(
    caches.match(req).then(hit => hit || fetch(req)
      .then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match('./index.html')))
  );
});
