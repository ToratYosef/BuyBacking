const firebaseConfig = {
  apiKey: "AIzaSyAmUGWbpbJIWLrBMJpZb8iMpFt-uc24J0k",
  authDomain: "auth.secondhandcell.com",
  projectId: "buyback-a0f05",
  storageBucket: "buyback-a0f05.firebasestorage.app",
  messagingSenderId: "876430429098",
  appId: "1:876430429098:web:f6dd64b1960d90461979d3",
  measurementId: "G-6WWQN44JHT",
};

let firebaseReady = false;
let firebaseApp = null;
let firebaseModules = null;

export async function loadFirebase() {
  if (firebaseReady) {
    return { app: firebaseApp, modules: firebaseModules, config: firebaseConfig };
  }
  firebaseReady = true;

  const appModule = await import("https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js");
  const authModule = await import("https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js");
  const firestoreModule = await import("https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js");

  const { initializeApp, getApps } = appModule;
  firebaseApp = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
  firebaseModules = {
    app: appModule,
    auth: authModule,
    firestore: firestoreModule,
  };

  if (typeof window !== "undefined") {
    window.firebaseConfig = firebaseConfig;
    window.firebaseApp = firebaseApp;
  }

  return { app: firebaseApp, modules: firebaseModules, config: firebaseConfig };
}

export function isFirebaseReady() {
  return firebaseReady;
}
