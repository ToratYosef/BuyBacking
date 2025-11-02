import { firebaseApp } from "/assets/js/firebase-app.js";
import { getAuth, signOut, onAuthStateChanged, signInWithPopup, GoogleAuthProvider, signInWithEmailAndPassword, createUserWithEmailAndPassword, updateProfile } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, doc, runTransaction, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
const app = firebaseApp;
const auth = getAuth(app);
const db = getFirestore(app);

document.addEventListener('DOMContentLoaded', function() {
// --- MODAL & AUTH LOGIC ---
const modals = document.querySelectorAll('.modal');
const openModal = (modalId) => document.getElementById(modalId)?.classList.add('is-visible');
const closeModal = (modal) => modal.classList.remove('is-visible');

// Event listeners for the header links and modal closing
document.getElementById('aboutUsLink').addEventListener('click', (e) => { e.preventDefault(); openModal('aboutUsModal'); });
document.getElementById('privacyPolicyLink').addEventListener('click', (e) => { e.preventDefault(); openModal('privacyPolicyModal'); });
document.getElementById('termsAndConditionsLinkFooter').addEventListener('click', (e) => { e.preventDefault(); openModal('termsAndConditionsModal'); });

modals.forEach(modal => {
modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(modal); });
modal.querySelector('.close-modal-btn')?.addEventListener('click', () => closeModal(modal));
});

// Login/Signup Tab Logic
const loginTabBtn = document.getElementById('loginTabBtn');
const signupTabBtn = document.getElementById('signupTabBtn');
const loginForm = document.getElementById('loginForm');
const signupForm = document.getElementById('signupForm');
const authMessage = document.getElementById('authMessage');

const showTab = (tabName) => {
authMessage.classList.add('hidden');
[loginForm, signupForm].forEach(form => form.classList.add('hidden'));
[loginTabBtn, signupTabBtn].forEach(btn => btn.classList.remove('border-blue-600', 'text-blue-600'));

if (tabName === 'login') {
loginForm.classList.remove('hidden');
loginTabBtn.classList.add('border-blue-600', 'text-blue-600');
} else {
signupForm.classList.remove('hidden');
signupTabBtn.classList.add('border-blue-600', 'text-blue-600');
}
};

loginTabBtn.addEventListener('click', () => showTab('login'));
signupTabBtn.addEventListener('click', () => showTab('signup'));

const authStatusContainer = document.getElementById('authStatusContainer');
const loginNavBtn = document.getElementById('loginNavBtn');
const userMonogram = document.getElementById('userMonogram');
const authDropdown = document.getElementById('authDropdown');
const logoutBtn = document.getElementById('logoutBtn');
const googleLoginBtn = document.getElementById('googleLoginBtn');
const googleSignupBtn = document.getElementById('googleSignupBtn');
const loginEmailInput = document.getElementById('loginEmail');
const loginPasswordInput = document.getElementById('loginPassword');
const signupNameInput = document.getElementById('signupName');
const signupEmailInput = document.getElementById('signupEmail');
const signupPasswordInput = document.getElementById('signupPassword');

function showAuthMessage(msg, type = 'error') {
authMessage.textContent = msg;
authMessage.className = 'mt-4 p-3 rounded-lg text-sm text-center';
if (type === 'error') {
authMessage.classList.add('bg-red-100', 'text-red-700');
} else if (type === 'success') {
authMessage.classList.add('bg-green-100', 'text-green-700');
}
authMessage.classList.remove('hidden');
}

const googleProvider = new GoogleAuthProvider();
const signInWithGoogle = async () => {
try {
await signInWithPopup(auth, googleProvider);
closeModal(document.getElementById('loginModal'));
} catch (error) {
showAuthMessage(error.message);
}
};
googleLoginBtn.addEventListener('click', signInWithGoogle);
googleSignupBtn.addEventListener('click', signInWithGoogle);

loginForm.addEventListener('submit', async (e) => {
e.preventDefault();
try {
await signInWithEmailAndPassword(auth, loginEmailInput.value, loginPasswordInput.value);
closeModal(document.getElementById('loginModal'));
} catch (error) {
showAuthMessage(error.message);
}
});

signupForm.addEventListener('submit', async (e) => {
e.preventDefault();
if (signupPasswordInput.value.length < 6) {
showAuthMessage('Password must be at least 6 characters long.');
return;
}
try {
const userCredential = await createUserWithEmailAndPassword(auth, signupEmailInput.value, signupPasswordInput.value);
await updateProfile(userCredential.user, { displayName: signupNameInput.value });
closeModal(document.getElementById('loginModal'));
} catch (error) {
showAuthMessage(error.message);
}
});

onAuthStateChanged(auth, user => {
if (user) {
loginNavBtn.classList.add('hidden');
userMonogram.classList.remove('hidden');
const initials = (user.displayName || user.email).split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
userMonogram.textContent = initials;
} else {
loginNavBtn.classList.remove('hidden');
userMonogram.classList.add('hidden');
authDropdown.classList.add('hidden');
}
});

userMonogram.addEventListener('click', (e) => {
e.stopPropagation();
authDropdown.classList.toggle('hidden');
});

document.addEventListener('click', (e) => {
if (!authStatusContainer.contains(e.target)) {
authDropdown.classList.add('hidden');
}
});

logoutBtn.addEventListener('click', () => { signOut(auth); });

// Redirecting login button to open the modal instead
loginNavBtn.addEventListener('click', (e) => {
e.preventDefault();
openModal('loginModal');
showTab('login');
});

// --- REDIRECTION LOGIC ---
document.getElementById('chooseAnotherDeviceBtn').addEventListener('click', () => {
window.location.href = '/sell-device.html';
});
});
