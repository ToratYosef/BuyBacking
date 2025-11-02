import { firebaseApp } from "/assets/js/firebase-app.js";
import { getAuth, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";

const app = firebaseApp;
const auth = getAuth(app);

document.addEventListener('DOMContentLoaded', function() {
const authStatusContainer = document.getElementById('authStatusContainer');
const userMonogram = document.getElementById('userMonogram');
const authDropdown = document.getElementById('authDropdown');
const logoutBtn = document.getElementById('logoutBtn');
const loginNavBtn = document.getElementById('loginNavBtn');

onAuthStateChanged(auth, (user) => {
if (user) {
loginNavBtn.classList.add('hidden');
userMonogram.classList.remove('hidden');
const displayName = user.displayName;
const email = user.email;
let initials = displayName ? displayName.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2) : (email ? email.charAt(0).toUpperCase() : '');
userMonogram.textContent = initials;
} else {
loginNavBtn.classList.remove('hidden');
userMonogram.classList.add('hidden');
authDropdown.classList.add('hidden');
}
});

userMonogram.addEventListener('click', (e) => { e.stopPropagation(); authDropdown.classList.toggle('hidden'); });
document.addEventListener('click', (e) => { if (!authStatusContainer.contains(e.target)) { authDropdown.classList.add('hidden'); } });
logoutBtn.addEventListener('click', () => signOut(auth));
loginNavBtn.addEventListener('click', (e) => {
e.preventDefault();
// Redirect to login modal on main page or show a modal here
// For simplicity, redirecting to index.html where modal logic exists
window.location.href = 'index.html#login';
});
});
