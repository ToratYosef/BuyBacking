import { firebaseApp } from "/assets/js/firebase-app.js";
import {
getAuth,
signOut,
onAuthStateChanged,
checkActionCode,
verifyPasswordResetCode,
confirmPasswordReset
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";

// Your Firebase configuration

const app = firebaseApp;
const auth = getAuth(app);

document.addEventListener('DOMContentLoaded', function() {
const feedbackMessage = document.getElementById('feedbackMessage');
const resetPasswordForm = document.getElementById('resetPasswordForm');
const newPasswordInput = document.getElementById('newPassword');
const confirmPasswordInput = document.getElementById('confirmPassword');
const urlParams = new URLSearchParams(window.location.search);
const actionCode = urlParams.get('oobCode');

function showFeedback(message, type) {
feedbackMessage.textContent = message;
feedbackMessage.classList.remove('hidden', 'bg-red-100', 'text-red-700', 'bg-green-100', 'text-green-700');
if (type === 'error') {
feedbackMessage.classList.add('bg-red-100', 'text-red-700');
} else if (type === 'success') {
feedbackMessage.classList.add('bg-green-100', 'text-green-700');
}
}

// Verify the password reset code before showing the form
async function verifyCode() {
if (!actionCode) {
showFeedback("Invalid or missing password reset code.", 'error');
resetPasswordForm.style.display = 'none';
return;
}

try {
await verifyPasswordResetCode(auth, actionCode);
showFeedback("Enter your new password below.", 'success');
resetPasswordForm.style.display = 'block';
} catch (error) {
console.error("Password reset code verification failed:", error);
showFeedback("The password reset link is invalid or has expired. Please try again.", 'error');
resetPasswordForm.style.display = 'none';
}
}

verifyCode();

resetPasswordForm.addEventListener('submit', async (e) => {
e.preventDefault();
const newPassword = newPasswordInput.value;
const confirmPassword = confirmPasswordInput.value;

if (newPassword !== confirmPassword) {
showFeedback("Passwords do not match.", 'error');
return;
}
if (newPassword.length < 6) {
showFeedback("Password must be at least 6 characters long.", 'error');
return;
}

try {
await confirmPasswordReset(auth, actionCode, newPassword);
showFeedback("Your password has been reset successfully! You can now log in with your new password.", 'success');
resetPasswordForm.innerHTML = '<p class="text-center text-gray-600">Password reset successful. <a href="https://secondhandcell.com/index.html" class="text-indigo-600 font-semibold hover:underline">Return to Home</a></p>';
} catch (error) {
console.error("Password reset failed:", error);
showFeedback(`Password reset failed: ${error.message}`, 'error');
}
});

// --- Header Auth State Listener (Copied from template for consistent behavior) ---
const loginNavBtn = document.getElementById('loginNavBtn');
const userMonogram = document.getElementById('userMonogram');
const authDropdown = document.getElementById('authDropdown');
const logoutBtn = document.getElementById('logoutBtn');
const authStatusContainer = document.getElementById('authStatusContainer');

function getRandomLightColor() {
const hue = Math.floor(Math.random() * 360);
const saturation = Math.floor(Math.random() * 30) + 70;
const lightness = Math.floor(Math.random() * 20) + 70;
return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
}

onAuthStateChanged(auth, (user) => {
if (user) {
loginNavBtn.classList.add('hidden');
authStatusContainer.classList.remove('hidden');
userMonogram.classList.remove('hidden');
const displayName = user.displayName;
const email = user.email;
let initials = '';
if (displayName) {
initials = displayName.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);
} else if (email) {
initials = email.charAt(0).toUpperCase();
}
userMonogram.textContent = initials;
userMonogram.style.backgroundColor = getRandomLightColor();
} else {
loginNavBtn.classList.remove('hidden');
authStatusContainer.classList.remove('hidden');
userMonogram.classList.add('hidden');
authDropdown.classList.add('hidden');
}
});

userMonogram.addEventListener('click', (e) => {
e.stopPropagation();
authDropdown.classList.toggle('hidden');
});
document.addEventListener('click', (e) => {
if (authStatusContainer && !authStatusContainer.contains(e.target)) {
authDropdown.classList.add('hidden');
}
});
logoutBtn.addEventListener('click', async () => {
try {
await signOut(auth);
} catch (error) {
console.error("Logout error:", error);
}
});
});
