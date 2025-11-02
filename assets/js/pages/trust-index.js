import { firebaseApp } from "/assets/js/firebase-app.js";
import { getAuth, signOut, onAuthStateChanged, signInWithPopup, GoogleAuthProvider, signInWithEmailAndPassword, createUserWithEmailAndPassword, updateProfile, sendPasswordResetEmail, signInWithCustomToken, signInAnonymously } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, collection, addDoc, doc, runTransaction, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { setLogLevel } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

setLogLevel('debug');

// Use global variables provided by the platform
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';

const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;

// Initialize Firebase
const app = firebaseApp;
const auth = getAuth(app);
const db = getFirestore(app);

// Utility to get or create a guest ID for localStorage persistence
const getOrCreateGuestId = () => {
let id = localStorage.getItem('guestChatId');
if (!id) {
id = `guest_${crypto.randomUUID()}`;
localStorage.setItem('guestChatId', id);
}
return id;
};

// Simplified Click Tracker
const trackButtonClick = async (buttonName) => {
console.log(`Tracking click: ${buttonName}`);
// Note: Using dummy console log as full Firestore tracking requires complex dependencies not strictly needed for this file.
};

document.addEventListener('DOMContentLoaded', function() {

// --- UI ELEMENT SELECTION ---
const loginModal = document.getElementById('loginModal');
const loginNavBtn = document.getElementById('loginNavBtn');
const userMonogram = document.getElementById('userMonogram');
const authDropdown = document.getElementById('authDropdown');
const logoutBtn = document.getElementById('logoutBtn');
const aboutUsModal = document.getElementById('aboutUsModal');
const aboutUsLink = document.getElementById('aboutUsLink');
const closeButtons = document.querySelectorAll('.close-modal-btn');

// Modal Tab and Form elements
const loginTabBtn = document.getElementById('loginTabBtn');
const signupTabBtn = document.getElementById('signupTabBtn');
const loginForm = document.getElementById('loginForm');
const signupForm = document.getElementById('signupForm');
const forgotPasswordForm = document.getElementById('forgotPasswordForm');
const authMessage = document.getElementById('authMessage');
const authStatusContainer = document.getElementById('authStatusContainer');

// --- MODAL UTILITIES ---
const openModal = (modal) => { modal.classList.add('is-visible'); };
const closeModal = (modal) => { modal.classList.remove('is-visible'); };
const showAuthMessage = (msg, type) => {
authMessage.textContent = msg;
authMessage.className = 'mt-4 p-3 rounded-lg text-sm text-center w-full';
if (type === 'error') authMessage.classList.add('bg-red-100', 'text-red-700');
else if (type === 'success') authMessage.classList.add('bg-green-100', 'text-green-700');
else authMessage.classList.add('bg-blue-100', 'text-blue-700');
authMessage.classList.remove('hidden');
};

const showTab = (tabName) => {
if (authMessage) authMessage.classList.add('hidden');
[loginForm, signupForm, forgotPasswordForm].forEach(form => form?.classList.add('hidden'));
[loginTabBtn, signupTabBtn].forEach(btn => {
btn?.classList.remove('border-blue-600', 'text-blue-600');
btn?.classList.add('border-transparent', 'text-slate-500');
});
if (tabName === 'login') { loginForm?.classList.remove('hidden'); loginTabBtn?.classList.add('border-blue-600', 'text-blue-600'); }
else if (tabName === 'signup') { signupForm?.classList.remove('hidden'); signupTabBtn?.classList.add('border-blue-600', 'text-blue-600'); }
else if (tabName === 'forgotPassword') { forgotPasswordForm?.classList.remove('hidden'); }
};

// --- AUTH STATE LISTENER & INITIAL LOGIN ---

// This logic is designed to run anytime the auth state changes.
onAuthStateChanged(auth, async (user) => {
if (user && !user.isAnonymous) {
if (loginNavBtn) loginNavBtn.classList.add('hidden');
if (userMonogram) {
userMonogram.classList.remove('hidden');
const initials = user.displayName ? user.displayName.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2) : (user.email ? user.email.charAt(0).toUpperCase() : '');
userMonogram.textContent = initials;
}
closeModal(loginModal);
} else {
if (loginNavBtn) loginNavBtn.classList.remove('hidden');
if (userMonogram) userMonogram.classList.add('hidden');
if (authDropdown) authDropdown.classList.add('hidden');

// Attempt anonymous login if no user is present.
if (!auth.currentUser) {
try {
await signInAnonymously(auth);
} catch (e) {
console.error("Anonymous sign-in failed:", e);
}
}
}
});

// --- EVENT LISTENERS ---

// Header/Dropdown Interactions
if (loginNavBtn) {
loginNavBtn.addEventListener('click', (e) => {
e.preventDefault();
openModal(loginModal);
showTab('login'); // Ensure it defaults to login tab
});
}
if (userMonogram) {
userMonogram.addEventListener('click', (e) => { e.stopPropagation(); authDropdown.classList.toggle('hidden'); });
document.addEventListener('click', (e) => {
if (authStatusContainer && !authStatusContainer.contains(e.target)) {
authDropdown.classList.add('hidden');
}
});
}
if (logoutBtn) logoutBtn.addEventListener('click', () => signOut(auth));
if (aboutUsLink) aboutUsLink.addEventListener('click', (e) => { e.preventDefault(); openModal(aboutUsModal); });

// Modal Close Listeners
closeButtons.forEach(button => {
button.addEventListener('click', () => { closeModal(loginModal); closeModal(aboutUsModal); });
});
[loginModal, aboutUsModal].forEach(modal => {
modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(modal); });
});

// Auth Modal Tab/Form Listeners
if (loginTabBtn) loginTabBtn.addEventListener('click', () => showTab('login'));
if (signupTabBtn) signupTabBtn.addEventListener('click', () => showTab('signup'));
const switchToLogin = document.getElementById('switchToLogin');
if (switchToLogin) switchToLogin.addEventListener('click', (e) => { e.preventDefault(); showTab('login'); });
const forgotPasswordLink = document.getElementById('forgotPasswordLink');
if (forgotPasswordLink) forgotPasswordLink.addEventListener('click', (e) => { e.preventDefault(); showTab('forgotPassword'); });
const returnToLogin = document.getElementById('returnToLogin');
if (returnToLogin) returnToLogin.addEventListener('click', (e) => { e.preventDefault(); showTab('login'); });

// Google Sign In
const googleProvider = new GoogleAuthProvider();
const signInWithGoogle = async () => {
try {
showAuthMessage('Redirecting to Google...', 'info');
await signInWithPopup(auth, googleProvider);
} catch (error) {
showAuthMessage(`Google sign-in failed: ${error.message}`, 'error');
}
};
const googleLoginBtn = document.getElementById('googleLoginBtn');
if (googleLoginBtn) googleLoginBtn.addEventListener('click', signInWithGoogle);
const googleSignupBtn = document.getElementById('googleSignupBtn');
if (googleSignupBtn) googleSignupBtn.addEventListener('click', signInWithGoogle);

// Email Login/Signup/Reset
if (loginForm) loginForm.addEventListener('submit', async (e) => {
e.preventDefault();
const email = document.getElementById('loginEmail').value;
const password = document.getElementById('loginPassword').value;
try {
showAuthMessage('Logging in...', 'info');
await signInWithEmailAndPassword(auth, email, password);
} catch (error) {
showAuthMessage(`Login failed: ${error.code.replace('auth/', '').split('-').map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(' ')}`, 'error');
}
});

if (signupForm) signupForm.addEventListener('submit', async (e) => {
e.preventDefault();
const name = document.getElementById('signupName').value;
const email = document.getElementById('signupEmail').value;
const password = document.getElementById('signupPassword').value;
if (password.length < 6) { showAuthMessage('Password must be at least 6 characters.', 'error'); return; }
try {
showAuthMessage('Creating account...', 'info');
const userCredential = await createUserWithEmailAndPassword(auth, email, password);
await updateProfile(userCredential.user, { displayName: name });
} catch (error) {
showAuthMessage(`Sign up failed: ${error.code.replace('auth/', '').split('-').map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(' ')}`, 'error');
}
});

if (forgotPasswordForm) forgotPasswordForm.addEventListener('submit', async (e) => {
e.preventDefault();
const email = document.getElementById('forgotEmail').value;
try {
showAuthMessage('Sending reset email...', 'info');
await sendPasswordResetEmail(auth, email);
showAuthMessage('Password reset email sent! Check your inbox.', 'success');
} catch (error) {
showAuthMessage(`Failed to send email: ${error.message}`, 'error');
}
});

// Footer Email Signup (using Firestore stub - retained logic)
const footerEmailSignupForm = document.getElementById('footerEmailSignupForm');
const footerSignupMessage = document.getElementById('footerSignupMessage');
if (footerEmailSignupForm) {
footerEmailSignupForm.addEventListener('submit', async (e) => {
e.preventDefault();
const email = document.getElementById('footerPromoEmail').value;
footerSignupMessage.textContent = 'Submitting...';
footerSignupMessage.className = 'mt-3 text-sm text-center text-blue-300';

try {
// Example: Use Firestore to record email signups
await addDoc(collection(db, "signed_up_emails"), { email: email, timestamp: new Date() });
footerSignupMessage.textContent = 'Success! Thanks for signing up.';
footerSignupMessage.className = 'mt-3 text-sm text-center text-green-300';
footerEmailSignupForm.reset();
} catch (error) {
console.error("Error adding document: ", error);
footerSignupMessage.textContent = 'Error: Could not sign up.';
footerSignupMessage.className = 'mt-3 text-sm text-center text-red-300';
}
});
}

// Click tracking for links
document.querySelectorAll('a[id^="review-link-"]').forEach(link => {
link.addEventListener('click', () => trackButtonClick(`Review_Link_Click_${link.id}`));
});
document.querySelectorAll('a[id^="device-link-"]').forEach(link => {
link.addEventListener('click', () => trackButtonClick(`Device_Link_Click_${link.id}`));
});

});
