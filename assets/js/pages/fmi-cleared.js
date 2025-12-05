import { firebaseApp } from "/assets/js/firebase-app.js";
import {
getAuth,
signInWithPopup,
GoogleAuthProvider,
signInWithEmailAndPassword,
createUserWithEmailAndPassword,
signOut,
onAuthStateChanged,
updateProfile,
sendPasswordResetEmail
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import {
getFirestore,
collection,
addDoc,
serverTimestamp,
doc,
getDoc,
updateDoc,
setDoc
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { app, db } from "../firebase-config.js";

const auth = getAuth(app);
const firestore = db;

window.firebaseAuth = auth;
window.GoogleAuthProvider = GoogleAuthProvider;
window.signInWithPopup = signInWithPopup;
window.signInWithEmailAndPassword = signInWithEmailAndPassword;
window.createUserWithEmailAndPassword = createUserWithEmailAndPassword;
window.signOut = signOut;
window.onAuthStateChanged = onAuthStateChanged;
window.updateProfile = updateProfile;
window.sendPasswordResetEmail = sendPasswordResetEmail;
window.firebaseDb = firestore;
window.firebaseServerTimestamp = serverTimestamp;
window.firebase = {
firestore: {
doc: doc,
getDoc: getDoc
}
};
