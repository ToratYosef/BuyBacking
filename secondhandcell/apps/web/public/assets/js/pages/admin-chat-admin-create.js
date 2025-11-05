// Import Firebase modules

import { firebaseApp } from "/assets/js/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut, GoogleAuthProvider, signInWithPopup } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";

// --- IMPORTANT: PASTE YOUR FIREBASE CONFIGURATION OBJECT HERE ---

// Initialize Firebase
const app = firebaseApp;
const auth = getAuth(app);

// Get DOM elements
const loginContainer = document.getElementById('login-container');
const createAdminContainer = document.getElementById('create-admin-container');
const loginForm = document.getElementById('login-form');
const googleLoginBtn = document.getElementById('google-login-btn');
const createAdminForm = document.getElementById('create-admin-form');
const submitBtn = document.getElementById('submit-btn');
const formMessage = document.getElementById('form-message');
const loginMessage = document.getElementById('login-message');
const logoutBtn = document.getElementById('logout-btn');

// --- Authentication State Observer ---
// This function acts as the main controller. It checks the user's login state
// and shows the appropriate view (login page or create admin page).
onAuthStateChanged(auth, (user) => {
if (user) {
// If a user is logged in, hide the login form and show the admin creation form.
loginContainer.classList.add('hidden');
createAdminContainer.classList.remove('hidden');
loginMessage.textContent = '';
} else {
// If no user is logged in, show the login form and hide the admin creation form.
loginContainer.classList.remove('hidden');
createAdminContainer.classList.add('hidden');
}
});

// --- Email & Password Login Logic ---
loginForm.addEventListener('submit', async (e) => {
e.preventDefault();
const email = document.getElementById('login-email').value;
const password = document.getElementById('login-password').value;
loginMessage.textContent = '';

try {
await signInWithEmailAndPassword(auth, email, password);
// onAuthStateChanged will automatically handle showing the create admin page on success.
} catch (error) {
console.error("Login failed:", error.code);
loginMessage.textContent = "Login failed. Please check your credentials.";
}
});

// --- Google Login Logic ---
googleLoginBtn.addEventListener('click', async () => {
const googleProvider = new GoogleAuthProvider();
loginMessage.textContent = '';
try {
await signInWithPopup(auth, googleProvider);
// onAuthStateChanged will automatically handle showing the create admin page on success.
} catch (error) {
console.error("Google Sign-In failed:", error);
loginMessage.textContent = "Google Sign-In failed. Please try again.";
}
});

// --- Logout Button Logic ---
logoutBtn.addEventListener('click', () => {
signOut(auth);
});

// --- Create Admin Form Logic ---
createAdminForm.addEventListener('submit', async (e) => {
e.preventDefault();

const email = document.getElementById('admin-email').value;
const password = document.getElementById('admin-password').value;
const displayName = document.getElementById('admin-display-name').value;

// Get the currently logged-in admin user. This is crucial for authorization.
const currentUser = auth.currentUser;
if (!currentUser) {
formMessage.textContent = "Authentication error. Please log in again.";
formMessage.className = "text-sm text-center text-red-500";
return;
}

// Disable button and show loading state
submitBtn.disabled = true;
submitBtn.innerHTML = `
<svg class="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
</svg>
<span>Creating...</span>`;
formMessage.textContent = '';

try {
// Get the ID token from the logged-in admin. This token is the proof
// that an authorized user is making this request.
const idToken = await currentUser.getIdToken();

// The URL of your secure backend Cloud Function
const cloudFunctionUrl = 'https://us-central1-buyback-a0f05.cloudfunctions.net/api/create-admin';

const response = await fetch(cloudFunctionUrl, {
method: 'POST',
headers: {
'Content-Type': 'application/json',
// The Authorization header is what your backend middleware will check.
'Authorization': `Bearer ${idToken}`
},
body: JSON.stringify({ email, password, displayName })
});

const result = await response.json();

if (!response.ok) {
throw new Error(result.error || 'An unknown error occurred.');
}

formMessage.textContent = `Successfully created admin: ${result.email}`;
formMessage.className = "text-sm text-center text-green-600";
createAdminForm.reset();

} catch (error) {
formMessage.textContent = `Error: ${error.message}`;
formMessage.className = "text-sm text-center text-red-500";
} finally {
// Re-enable the button and restore its original content
submitBtn.disabled = false;
submitBtn.innerHTML = `<i class="fa-solid fa-user-plus"></i> <span>Create Admin User</span>`;
}
});
