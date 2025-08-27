// Import the Firebase app and messaging scripts.
// These are special 'compat' versions required for service workers.
importScripts("https://www.gstatic.com/firebasejs/11.6.1/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/11.6.1/firebase-messaging-compat.js");

// Initialize the Firebase app in the service worker with the same config
// as your web app.
const firebaseConfig = {
    apiKey: "AIzaSyAmUGWbpbJIWLrBMJpZb8iMpFt-uc24J0k",
    authDomain: "buyback-a0f05.firebaseapp.com",
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
        icon: '/apple-touch-icon.png' // Optional: path to an icon for the notification
    };

    // The service worker shows the notification to the user.
    return self.registration.showNotification(notificationTitle, notificationOptions);
});
