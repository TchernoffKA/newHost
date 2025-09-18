// Service Worker для ToDo PWA
// Обеспечивает офлайн-работу и кэширование ресурсов

const CACHE_NAME = 'todo-pwa-v0.1.0';
const STATIC_CACHE_NAME = 'todo-static-v0.1.0';
const DYNAMIC_CACHE_NAME = 'todo-dynamic-v0.1.0';

// Список файлов для предварительного кэширования
const STATIC_FILES = [
  '/',
  '/index.html',
  '/todo-styles.css',
  '/todo-script.js',
  '/storage.js',
  '/manifest.json',
  // Google Fonts (будут кэшированы динамически)
  'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600&display=swap'
];

// Установка Service Worker
self.addEventListener('install', (event) => {
  console.log('[SW] Installing Service Worker');
  
  event.waitUntil(
    caches.open(STATIC_CACHE_NAME)
      .then((cache) => {
        console.log('[SW] Precaching static files');
        return cache.addAll(STATIC_FILES);
      })
      .catch((error) => {
        console.error('[SW] Failed to precache:', error);
      })
  );
  
  // Немедленно активировать новый SW
  self.skipWaiting();
});

// Активация Service Worker
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating Service Worker');
  
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          // Удалить старые кэши
          if (cacheName !== STATIC_CACHE_NAME && cacheName !== DYNAMIC_CACHE_NAME) {
            console.log('[SW] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  
  // Немедленно взять управление всеми клиентами
  self.clients.claim();
});

// Перехват сетевых запросов
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  
  // Игнорировать не-GET запросы
  if (request.method !== 'GET') {
    return;
  }
  
  // Игнорировать запросы к Telegram API и другим внешним API
  if (url.hostname.includes('telegram.org') || 
      url.hostname.includes('t.me') ||
      url.pathname.includes('/api/')) {
    return;
  }
  
  event.respondWith(
    handleFetchRequest(request)
  );
});

// Обработка запросов с стратегией Cache First для статических файлов
async function handleFetchRequest(request) {
  const url = new URL(request.url);
  
  try {
    // Для HTML файлов используем Network First стратегию
    if (request.headers.get('accept')?.includes('text/html')) {
      return await networkFirstStrategy(request);
    }
    
    // Для статических ресурсов (CSS, JS, шрифты) используем Cache First
    if (isStaticResource(request)) {
      return await cacheFirstStrategy(request);
    }
    
    // Для остальных запросов используем Network First с fallback
    return await networkFirstStrategy(request);
    
  } catch (error) {
    console.error('[SW] Fetch error:', error);
    
    // Fallback для HTML запросов
    if (request.headers.get('accept')?.includes('text/html')) {
      const cachedResponse = await caches.match('/index.html');
      if (cachedResponse) {
        return cachedResponse;
      }
    }
    
    // Возвращаем ошибку если ничего не найдено
    return new Response('Офлайн режим. Проверьте подключение к интернету.', {
      status: 503,
      statusText: 'Service Unavailable',
      headers: { 'Content-Type': 'text/plain; charset=utf-8' }
    });
  }
}

// Cache First стратегия - сначала проверяем кэш
async function cacheFirstStrategy(request) {
  const cachedResponse = await caches.match(request);
  
  if (cachedResponse) {
    // Асинхронно обновляем кэш в фоне (stale-while-revalidate)
    updateCacheInBackground(request);
    return cachedResponse;
  }
  
  // Если в кэше нет, загружаем из сети и кэшируем
  const networkResponse = await fetch(request);
  await cacheResponse(request, networkResponse.clone(), STATIC_CACHE_NAME);
  return networkResponse;
}

// Network First стратегия - сначала пытаемся загрузить из сети
async function networkFirstStrategy(request) {
  try {
    const networkResponse = await fetch(request);
    
    // Кэшируем успешные ответы
    if (networkResponse.ok) {
      await cacheResponse(request, networkResponse.clone(), DYNAMIC_CACHE_NAME);
    }
    
    return networkResponse;
  } catch (error) {
    // Если сеть недоступна, ищем в кэше
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    throw error;
  }
}

// Асинхронное обновление кэша в фоне
async function updateCacheInBackground(request) {
  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      await cacheResponse(request, networkResponse, STATIC_CACHE_NAME);
    }
  } catch (error) {
    // Игнорируем ошибки фонового обновления
    console.log('[SW] Background update failed:', error.message);
  }
}

// Кэширование ответа
async function cacheResponse(request, response, cacheName) {
  try {
    const cache = await caches.open(cacheName);
    await cache.put(request, response);
  } catch (error) {
    console.error('[SW] Failed to cache response:', error);
  }
}

// Проверка, является ли запрос статическим ресурсом
function isStaticResource(request) {
  const url = new URL(request.url);
  const pathname = url.pathname;
  
  return (
    pathname.endsWith('.css') ||
    pathname.endsWith('.js') ||
    pathname.endsWith('.png') ||
    pathname.endsWith('.jpg') ||
    pathname.endsWith('.jpeg') ||
    pathname.endsWith('.svg') ||
    pathname.endsWith('.ico') ||
    pathname.endsWith('.webp') ||
    pathname.endsWith('.woff2') ||
    pathname.endsWith('.woff') ||
    url.hostname.includes('fonts.googleapis.com') ||
    url.hostname.includes('fonts.gstatic.com')
  );
}

// Обработка сообщений от главного потока
self.addEventListener('message', (event) => {
  const { type, payload } = event.data;
  
  switch (type) {
    case 'SKIP_WAITING':
      self.skipWaiting();
      break;
      
    case 'GET_VERSION':
      event.ports[0].postMessage({ version: CACHE_NAME });
      break;
      
    case 'CLEAR_CACHE':
      clearAllCaches().then(() => {
        event.ports[0].postMessage({ success: true });
      });
      break;
      
    default:
      console.log('[SW] Unknown message type:', type);
  }
});

// Очистка всех кэшей
async function clearAllCaches() {
  const cacheNames = await caches.keys();
  await Promise.all(cacheNames.map(name => caches.delete(name)));
  console.log('[SW] All caches cleared');
}

// Логирование ошибок
self.addEventListener('error', (event) => {
  console.error('[SW] Error:', event.error);
});

self.addEventListener('unhandledrejection', (event) => {
  console.error('[SW] Unhandled promise rejection:', event.reason);
});

console.log('[SW] Service Worker script loaded');
