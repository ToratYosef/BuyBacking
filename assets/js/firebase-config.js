import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyAmUGWbpbJIWLrBMJpZb8iMpFt-uc24J0k",
  authDomain: "auth.secondhandcell.com",
  projectId: "buyback-a0f05",
  storageBucket: "buyback-a0f05.appspot.com",
  messagingSenderId: "876430429098",
  appId: "1:876430429098:web:f6dd64b1960d90461979d3",
  measurementId: "G-6WWQN44JHT",
};

// Initialize Firebase app if not already initialized
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

// Initialize Firestore
const db = getFirestore(app);

export { app, db };