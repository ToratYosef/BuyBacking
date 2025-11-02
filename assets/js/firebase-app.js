import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";

export const firebaseConfig = {
  apiKey: "AIzaSyAmUGWbpbJIWLrBMJpZb8iMpFt-uc24J0k",
  authDomain: "auth.secondhandcell.com",
  projectId: "buyback-a0f05",
  storageBucket: "buyback-a0f05.firebasestorage.app",
  messagingSenderId: "876430429098",
  appId: "1:876430429098:web:f6dd64b1960d90461979d3",
  measurementId: "G-6WWQN44JHT"
};

const apps = getApps();
export const firebaseApp = apps.length ? apps[0] : initializeApp(firebaseConfig);

export const getFirebaseApp = () => firebaseApp;

if (typeof window !== 'undefined') {
  window.firebaseConfig = firebaseConfig;
  window.firebaseApp = firebaseApp;
}
