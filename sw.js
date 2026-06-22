/* 処分ナビ Service Worker
   - HTML（ページ本体）= network-first：オンラインなら常に最新を取得し、即座に更新が反映される。
     オフライン時のみキャッシュにフォールバック。
   - 静的アセット・データ（icon/manifest/json）= cache-first：高速・オフライン対応。
   ※ アイコンやデータを差し替えたら CACHE のバージョン（v5→v6…）を上げて再取得させる。 */
const CACHE = 'shobun-navi-v10';
const ASSETS = [
  './',
  './index.html',
  './soryo-tool.html',
  './reminder.html',
  './theme.css',
  './manifest.json',
  './icon.svg',
  './icon-180.png',
  './icon-192.png',
  './icon-512.png',
  './data/gomi/13109.json',
  './data/gomi/13103.json',
  './data/gomi/13105.json',
  './data/gomi/13108.json',
  './data/gomi/13102.json',
  './data/gomi/13114.json',
  './data/gomi/13106.json',
  './data/gomi/13111.json',
  './data/gomi/13113.json',
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

function cachePut(req, res) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {}); return res; }

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  if (new URL(req.url).origin !== self.location.origin) return; // 外部リンクはそのまま
  const isHTML = req.mode === 'navigate' || req.destination === 'document'
    || (req.headers.get('accept') || '').includes('text/html');
  if (isHTML) {
    // network-first：最新HTMLを優先、オフライン時のみキャッシュ
    e.respondWith(
      fetch(req).then(res => cachePut(req, res))
        .catch(() => caches.match(req).then(hit => hit || caches.match('./index.html')))
    );
  } else {
    // cache-first：静的アセット・データ
    e.respondWith(
      caches.match(req).then(hit => hit || fetch(req).then(res => cachePut(req, res)).catch(() => caches.match('./index.html')))
    );
  }
});
