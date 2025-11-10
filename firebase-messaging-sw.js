// firebase-messaging-sw.js

// Import the Firebase app and messaging scripts.
// These are special 'compat' versions required for service workers.
importScripts("https://www.gstatic.com/firebasejs/11.6.1/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/11.6.1/firebase-messaging-compat.js");

// Initialize the Firebase app in the service worker with the same config
// as your web app.
const firebaseConfig = {
    apiKey: "AIzaSyAmUGWbpbJIWLrBMJpZb8iMpFt-uc24J0k",
    authDomain: "auth.secondhandcell.com",
    projectId: "buyback-a0f05",
    storageBucket: "buyback-a0f05.appspot.com",
    messagingSenderId: "876430429098",
    appId: "1:876430429098:web:f6dd64b1960d90461979d3",
    measurementId: "G-6WWQN44JHT",
    databaseURL: "https://buyback-a0f05-default-rtdb.firebaseio.com/"
};

firebase.initializeApp(firebaseConfig);

// Retrieve an instance of Firebase Messaging so that it can handle background
// messages.
const messaging = firebase.messaging();

/**
 * This is the magic part for background notifications.
 * When a push message is received and the app is not in the foreground,
 * this handler will be triggered.
 */
messaging.onBackgroundMessage(function(payload) {
    console.log('[firebase-messaging-sw.js] Received background message ', payload);

    // Customize the notification here
    const notificationTitle = payload.notification.title;
    const notificationOptions = {
        body: payload.notification.body,
        icon: 'https://secondhandcell.com/assets/logo.png', // Updated icon path
        data: payload.data // Pass along custom data for click handling
    };

    // The service worker shows the notification to the user.
    return self.registration.showNotification(notificationTitle, notificationOptions);
});

/**
 * Handles clicks on notifications.
 * This is crucial for navigating the admin to the correct chat.
 */
self.addEventListener('notificationclick', function(event) {
    console.log('[firebase-messaging-sw.js] Notification click received.', event);
    event.notification.close(); // Close the notification

    const clickedNotification = event.notification;
    const notificationData = clickedNotification.data; // Access the data payload

    if (notificationData && notificationData.chatId && notificationData.action === 'open_chat') {
        const chatId = notificationData.chatId;
        const chatUrl = `https://secondhandcell.com/chat/chat.html?chatId=${chatId}`; // Construct dynamic URL

        event.waitUntil(
            clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
                for (let i = 0; i < clientList.length; i++) {
                    const client = clientList[i];
                    // If the admin dashboard is already open, focus it and navigate
                    if (client.url.includes('admin-dashboard.html')) {
                        return client.focus().then(() => client.navigate(chatUrl));
                    }
                }
                // If dashboard is not open, open a new window
                return clients.openWindow(chatUrl);
            })
        );
    } else {
        // Fallback if no specific chat data is present
        event.waitUntil(
            clients.openWindow('https://secondhandcell.com/admin') // Default dashboard URL
        );
    }
});
