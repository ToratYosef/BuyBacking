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
getDoc
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

const app = firebaseApp;
const auth = getAuth(app);
const db = getFirestore(app);

window.firebaseAuth = auth;
window.GoogleAuthProvider = GoogleAuthProvider;
window.signInWithPopup = signInWithPopup;
window.signInWithEmailAndPassword = signInWithEmailAndPassword;
window.createUserWithEmailAndPassword = createUserWithEmailAndPassword;
window.signOut = signOut;
window.onAuthStateChanged = onAuthStateChanged;
window.updateProfile = updateProfile;
window.sendPasswordResetEmail = sendPasswordResetEmail;
window.firebaseDb = db;
window.firebaseServerTimestamp = serverTimestamp;
window.firebase = {
firestore: {
doc: doc,
getDoc: getDoc
}
};
