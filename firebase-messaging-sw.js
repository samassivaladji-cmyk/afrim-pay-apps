// Service Worker Firebase Messaging — AFRIM PAY
// À déployer à la racine de samassivaladji-cmyk.github.io/afrim-pay-apps/

importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyCtWT_Z6VznIIgM5mOp_Ikt-aTyrm5JGyY",
  authDomain: "afrim-pay.firebaseapp.com",
  projectId: "afrim-pay",
  storageBucket: "afrim-pay.firebasestorage.app",
  messagingSenderId: "20456105449",
  appId: "1:20456105449:web:7cd703cf77924420621778"
});

const messaging = firebase.messaging();

// Notification reçue en arrière-plan
messaging.onBackgroundMessage(function(payload) {
  console.log('[SW] Push reçu en arrière-plan:', payload);
  const { title, body } = payload.notification || {};
  const data = payload.data || {};
  
  self.registration.showNotification(title || 'AFRIM PAY', {
    body: body || '',
    icon: 'https://samassivaladji-cmyk.github.io/afrim-pay-apps/logo.png',
    badge: 'https://samassivaladji-cmyk.github.io/afrim-pay-apps/logo.png',
    tag: 'afrim-pay-' + Date.now(),
    data: data,
    requireInteraction: false,
    silent: false
  });
});

// Clic sur notification → ouvrir l'app
self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
      for (var client of clientList) {
        if (client.url.includes('afrim-pay-apps') && 'focus' in client) {
          return client.focus();
        }
      }
      return clients.openWindow('https://samassivaladji-cmyk.github.io/afrim-pay-apps/afrim-client.html');
    })
  );
});
