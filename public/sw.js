const CACHE = 'emmark-shell-v2';
const SHELL_ASSETS = [
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable-512.png',
];

// 離線時仍要能開的頁面/API：讀取用網路優先，失敗才退回上一次成功的快取
const OFFLINE_FALLBACK_PATHS = [
  '/', '/index.html', '/links.html', '/meetings.html', '/order.html', '/songs.html', '/worship.html',
  '/api/dashboard/notes', '/api/worship/schedule', '/api/worship/config',
];

function isOfflineFallbackRequest(url) {
  if (OFFLINE_FALLBACK_PATHS.includes(url.pathname)) return true;
  return false;
}

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL_ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // 殼層素材（icon/manifest）：快取優先，反正內容不會變
  if (SHELL_ASSETS.includes(url.pathname)) {
    event.respondWith(caches.match(event.request).then((hit) => hit || fetch(event.request)));
    return;
  }

  // 頁面本身跟讀取型 API：網路優先，離線或網路失敗時退回上一次成功的回應，
  // 讓斷網時至少能看到上次載入的資料，不是整頁瀏覽器錯誤畫面
  if (event.request.method === 'GET' && isOfflineFallbackRequest(url)) {
    event.respondWith(
      fetch(event.request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(event.request, copy));
          return res;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  event.respondWith(fetch(event.request));
});
