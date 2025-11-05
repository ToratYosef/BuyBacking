import { firebaseApp } from "/assets/js/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, updateProfile, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";

// Your Firebase configuration

// Initialize Firebase
const app = firebaseApp;
const auth = getAuth(app);

// Get elements
const loginSection = document.getElementById('loginSection');
const signupSection = document.getElementById('signupSection');
const loginForm = document.getElementById('loginForm');
const signupForm = document.getElementById('signupForm');
const showSignupLink = document.getElementById('showSignupLink');
const showLoginLink = document.getElementById('showLoginLink');
const messageDiv = document.getElementById('message');
const loginLink = document.getElementById('login-link');
const logoutButton = document.getElementById('logout-button');
const accountLink = document.getElementById('account-link');

// --- Helper Functions ---

function showMessage(msg, type) {
messageDiv.textContent = msg;
messageDiv.className = `mb-4 p-3 rounded-md text-sm text-center ${type === 'success' ? 'bg-green-100 text-green-700' : type === 'error' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'}`;
messageDiv.classList.remove('hidden');
}

function clearMessage() {
messageDiv.classList.add('hidden');
messageDiv.textContent = '';
}

// --- Firebase Auth State Listener for Header ---
// This listener ensures the header links are correct based on auth status
onAuthStateChanged(auth, (user) => {
if (user) {
// User is signed in
loginLink.classList.add('hidden');
logoutButton.classList.remove('hidden');
accountLink.classList.remove('hidden');
// If a logged-in user somehow lands on login.html, redirect them to their account
if (window.location.pathname.endsWith('/login.html')) {
window.location.href = 'my-account.html';
}
} else {
// User is signed out
loginLink.classList.remove('hidden');
logoutButton.classList.add('hidden');
accountLink.classList.add('hidden');
}
});

// --- Form Toggling Logic ---

showSignupLink.addEventListener('click', (e) => {
e.preventDefault();
loginSection.classList.add('hidden');
signupSection.classList.remove('hidden');
clearMessage();
});

showLoginLink.addEventListener('click', (e) => {
e.preventDefault();
signupSection.classList.add('hidden');
loginSection.classList.remove('hidden');
clearMessage();
});

// --- Handle Login ---
loginForm.addEventListener('submit', async (e) => {
e.preventDefault();
clearMessage();
const email = loginForm['loginEmail'].value;
const password = loginForm['loginPassword'].value;

try {
await signInWithEmailAndPassword(auth, email, password);
showMessage('Successfully logged in!', 'success');
// onAuthStateChanged listener will handle the redirect to my-account.html
} catch (error) {
console.error("Login error:", error.code, error.message);
let errorMessage = "An unknown error occurred. Please try again.";
switch (error.code) {
case 'auth/invalid-email':
case 'auth/user-not-found':
case 'auth/wrong-password':
case 'auth/invalid-credential':
errorMessage = 'Invalid email or password.';
break;
case 'auth/user-disabled':
errorMessage = 'Your account has been disabled.';
break;
default:
errorMessage = error.message;
}
showMessage(`Login Failed: ${errorMessage}`, 'error');
}
});

// --- Handle Sign Up ---
signupForm.addEventListener('submit', async (e) => {
e.preventDefault();
clearMessage();
const name = signupForm['signupName'].value;
const email = signupForm['signupEmail'].value;
const password = signupForm['signupPassword'].value;

try {
const userCredential = await createUserWithEmailAndPassword(auth, email, password);
const user = userCredential.user;
await updateProfile(user, { displayName: name });
showMessage('Account created successfully!', 'success');
// onAuthStateChanged listener will handle the redirect to my-account.html
} catch (error) {
console.error("Registration error:", error.code, error.message);
let errorMessage = "An unknown error occurred during registration.";
switch (error.code) {
case 'auth/email-already-in-use':
errorMessage = 'The email address is already in use by another account.';
break;
case 'auth/invalid-email':
errorMessage = 'The email address is not valid.';
break;
case 'auth/weak-password':
errorMessage = 'The password is too weak. Please choose a stronger password.';
break;
default:
errorMessage = error.message;
}
showMessage(`Registration Failed: ${errorMessage}`, 'error');
}
});

// --- Handle Logout (for header button) ---
logoutButton.addEventListener('click', async () => {
try {
await signOut(auth);
// onAuthStateChanged listener will handle redirect to login.html if successful
} catch (error) {
console.error("Logout error:", error);
showMessage('Failed to log out. Please try again.', 'error');
}
});
