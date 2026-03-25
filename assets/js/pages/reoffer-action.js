// Import Firebase modules

import { firebaseApp } from "/assets/js/firebase-app.js";
import {
getAuth,
signOut,
onAuthStateChanged,
signInWithPopup,
GoogleAuthProvider,
signInWithEmailAndPassword,
createUserWithEmailAndPassword,
updateProfile
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { apiGet, apiPost } from "/public/js/apiClient.js";

// Your Firebase configuration

// Initialize Firebase
const app = firebaseApp;
const auth = getAuth(app);

const AUTO_ACCEPT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
let countdownInterval = null;
let pendingAction = null;


const loadingState = document.getElementById('loadingState');
const offerDetailsState = document.getElementById('offerDetailsState');
const confirmationState = document.getElementById('confirmationState');
const confirmationHeading = document.getElementById('confirmationHeading');
const confirmationMessage = document.getElementById('confirmationMessage');
const orderIdDisplay = document.getElementById('orderIdDisplay');
const newOfferPrice = document.getElementById('newOfferPrice');
const reofferReason = document.getElementById('reofferReason');
const reofferComments = document.getElementById('reofferComments');
const oldOfferPrice = document.getElementById('oldOfferPrice');
const buyerNameSpan = document.getElementById('buyerName');
const errorMessage = document.getElementById('errorMessage');
const acceptOfferBtn = document.getElementById('acceptOfferBtn');
const returnPhoneBtn = document.getElementById('returnPhoneBtn');
const actionButtonsDiv = document.getElementById('actionButtons');
const replySection = document.getElementById('replySection');
const emailContactLink = document.getElementById('emailContactLink');
const smsContactLink = document.getElementById('smsContactLink');
const confirmPrompt = document.getElementById('confirmPrompt');
const confirmMessage = document.getElementById('confirmMessage');
const confirmYesBtn = document.getElementById('confirmYesBtn');
const confirmCancelBtn = document.getElementById('confirmCancelBtn');
const countdownContainer = document.getElementById('countdownContainer');
const countdownTimer = document.getElementById('countdownTimer');

// Login Modal Elements
const loginModal = document.getElementById('loginModal');
const closeModalBtn = document.getElementById('closeModalBtn');
const loginTabBtn = document.getElementById('loginTabBtn');
const signupTabBtn = document.getElementById('signupTabBtn');
const loginForm = document.getElementById('loginForm');
const signupForm = document.getElementById('signupForm');
const googleLoginBtn = document.getElementById('googleLoginBtn');
const emailLoginBtn = document.getElementById('emailLoginBtn');
const loginEmailInput = document.getElementById('loginEmail');
const loginPasswordInput = document.getElementById('loginPassword');
const googleSignupBtn = document.getElementById('googleSignupBtn');
const emailSignupBtn = document.getElementById('emailSignupBtn');
const signupNameInput = document.getElementById('signupName');
const signupEmailInput = document.getElementById('signupEmail');
const signupPasswordInput = document.getElementById('signupPassword');
const signupPhoneInput = document.getElementById('signupPhone');
const authMessage = document.getElementById('authMessage');
const switchToLogin = document.getElementById('switchToLogin');

const formatTimeRemaining = (ms) => {
const days = Math.floor(ms / (1000 * 60 * 60 * 24));
const hours = Math.floor((ms % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
const seconds = Math.floor((ms % (1000 * 60)) / 1000);
return `${days}d ${hours}h ${minutes}m ${seconds}s`;
};

const extractTimestampMillis = (timestamp) => {
if (!timestamp) return null;
if (typeof timestamp === 'number') {
return timestamp > 1e12 ? timestamp : timestamp * 1000;
}
if (typeof timestamp === 'string') {
const parsed = Date.parse(timestamp);
return Number.isNaN(parsed) ? null : parsed;
}
if (timestamp instanceof Date) {
return timestamp.getTime();
}
if (typeof timestamp === 'object') {
if (typeof timestamp._seconds === 'number') {
return timestamp._seconds * 1000;
}
if (typeof timestamp.seconds === 'number') {
return timestamp.seconds * 1000;
}
if (typeof timestamp.toDate === 'function') {
return timestamp.toDate().getTime();
}
}
return null;
};


const formatMoney = (amount) => {
if (!Number.isFinite(Number(amount))) return 'N/A';
return `$${Number(amount).toFixed(2)}`;
};

const buildSupportContactLinks = ({ orderId, customerName }) => {
const safeOrderId = String(orderId || '').trim() || 'unknown';
const safeCustomerName = String(customerName || '').trim() || 'there';
const draftMessage = `Hi ${safeCustomerName}, my order ID is ${safeOrderId}. `;
const email = 'sales@secondhandcell.com';
const subject = `Re-offer question for order ${safeOrderId}`;

if (emailContactLink) {
emailContactLink.href = `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(draftMessage)}`;
}

if (smsContactLink) {
smsContactLink.href = `mailto:sales@secondhandcell.com?subject=${encodeURIComponent("Question about my offer")}&body=${encodeURIComponent(draftMessage)}`;
}
};

const firstValidAmount = (...values) => {
for (const value of values) {
const n = Number(value);
if (Number.isFinite(n)) return n;
}
return null;
};

const resolveOriginalOfferAmount = (order, offer, selectedDeviceKey) => {
const orderItems = Array.isArray(order?.items) ? order.items : [];
const matchedItem = selectedDeviceKey
? orderItems.find((item) => String(item?.deviceKey || item?.id || '').trim() === String(selectedDeviceKey).trim())
: orderItems[0];

return firstValidAmount(
offer?.oldPrice,
offer?.originalPrice,
matchedItem?.originalQuote,
matchedItem?.estimatedQuote,
matchedItem?.quote,
order?.originalQuote,
order?.estimatedQuote,
order?.totalPayout
);
};

const getAutoAcceptDeadline = (order, selectedDeviceKey) => {
const deviceOffer = selectedDeviceKey
? (order?.reOfferByDevice?.[selectedDeviceKey] || order?.reofferByDevice?.[selectedDeviceKey] || null)
: null;
const sourceOffer = deviceOffer || order?.reOffer || null;

if (!sourceOffer) return null;
const explicit = extractTimestampMillis(sourceOffer.autoAcceptDate);
if (explicit) return explicit;
const created = extractTimestampMillis(sourceOffer.createdAt);
return created ? created + AUTO_ACCEPT_WINDOW_MS : null;
};

const renderConfirmationState = (status, orderId) => {
offerDetailsState.classList.add('hidden');
loadingState.classList.add('hidden');
confirmationState.classList.remove('hidden');
confirmPrompt.classList.add('hidden');
actionButtonsDiv.classList.add('hidden');
clearInterval(countdownInterval);
countdownContainer.classList.add('hidden');

const accepted = status === 're-offered-accepted' || status === 're-offered-auto-accepted';
const declined = status === 're-offered-declined';

if (accepted) {
confirmationHeading.textContent = 'Offer Accepted! ✅';
confirmationHeading.className = `text-4xl font-bold mb-6 text-green-600`;
confirmationMessage.textContent = `You have successfully accepted the revised offer for Order #${orderId}. We will process your payment shortly. This decision is final.`;
} else if (declined) {
confirmationHeading.textContent = 'Offer Declined. ❌';
confirmationHeading.className = `text-4xl font-bold mb-6 text-red-600`;
confirmationMessage.textContent = `You have successfully declined the revised offer for Order #${orderId}. We will process the return shipment shortly. This decision is final.`;
} else {
// Fallback for any other status, though unlikely with the current logic
confirmationHeading.textContent = 'Decision Finalized.';
confirmationHeading.className = `text-4xl font-bold mb-6 text-gray-600`;
confirmationMessage.textContent = `Your choice for Order #${orderId} has been recorded. This decision is final.`;
}

replySection.classList.remove('hidden');
};

const loadOfferDetails = async () => {
const urlParams = new URLSearchParams(window.location.search);
const orderId = urlParams.get('orderId');
const selectedDeviceKey = urlParams.get('deviceKey');

if (!orderId) {
errorMessage.textContent = 'Error: Order ID is missing from the URL.';
errorMessage.classList.remove('hidden');
loadingState.classList.add('hidden');
return;
}

loadingState.classList.remove('hidden');
offerDetailsState.classList.add('hidden');
confirmationState.classList.add('hidden');
confirmPrompt.classList.add('hidden');
errorMessage.classList.add('hidden');
replySection.classList.add('hidden');
clearInterval(countdownInterval);

try {
const currentOrderData = await apiGet(`/orders/${orderId}`, { authRequired: false });
const deviceOffer = selectedDeviceKey
? (currentOrderData?.reOfferByDevice?.[selectedDeviceKey] || currentOrderData?.reofferByDevice?.[selectedDeviceKey] || null)
: null;
const deviceStatus = selectedDeviceKey
? (currentOrderData?.deviceStatusByKey?.[selectedDeviceKey] || currentOrderData?.status)
: currentOrderData?.status;

orderIdDisplay.textContent = `#${orderId}`;
const offerToDisplay = deviceOffer || currentOrderData.reOffer || null;
const newOfferAmount = firstValidAmount(offerToDisplay?.newPrice, currentOrderData?.estimatedQuote);
const originalAmount = resolveOriginalOfferAmount(currentOrderData, offerToDisplay, selectedDeviceKey);

newOfferPrice.textContent = formatMoney(newOfferAmount);
oldOfferPrice.textContent = formatMoney(originalAmount);

const reasons = Array.isArray(offerToDisplay?.reasons) ? offerToDisplay.reasons.filter(Boolean) : [];
reofferReason.textContent = reasons.length ? reasons.join('\n') : 'No reason was provided.';
reofferReason.style.whiteSpace = 'pre-line';
reofferComments.textContent = offerToDisplay?.comments || 'No additional notes provided by our team.';
buyerNameSpan.textContent = currentOrderData.shippingInfo?.fullName || 'Customer';
buildSupportContactLinks({
orderId,
customerName: currentOrderData.shippingInfo?.fullName || 'Customer',
});

loadingState.classList.add('hidden');

const autoAcceptDeadline = getAutoAcceptDeadline(currentOrderData, selectedDeviceKey);

if ((String(deviceStatus) === 're-offered-pending') && autoAcceptDeadline) {
offerDetailsState.classList.remove('hidden');
replySection.classList.remove('hidden');
actionButtonsDiv.classList.remove('hidden');
countdownContainer.classList.remove('hidden');

if (countdownInterval) clearInterval(countdownInterval);

const updateCountdown = () => {
const timeRemaining = autoAcceptDeadline - Date.now();
if (timeRemaining <= 0) {
clearInterval(countdownInterval);
countdownTimer.textContent = 'Offer expired and has been auto-accepted.';
location.reload();
} else {
countdownTimer.textContent = formatTimeRemaining(timeRemaining);
}
};

updateCountdown();
countdownInterval = setInterval(updateCountdown, 1000);
} else if (String(deviceStatus) === 're-offered-pending') {
offerDetailsState.classList.remove('hidden');
replySection.classList.remove('hidden');
actionButtonsDiv.classList.remove('hidden');
countdownContainer.classList.add('hidden');

} else if (String(deviceStatus) === 're-offered-accepted' || String(deviceStatus) === 're-offered-auto-accepted') {
renderConfirmationState('re-offered-accepted', orderId);
} else if (String(deviceStatus) === 're-offered-declined') {
renderConfirmationState('re-offered-declined', orderId);
} else {
errorMessage.textContent = 'No pending offer found for this order, or it has been processed already.';
errorMessage.classList.remove('hidden');
}

} catch (error) {
console.error('Error loading offer page:', error);
errorMessage.textContent = `Error: ${error.message}. Please try again or contact support.`;
errorMessage.classList.remove('hidden');
loadingState.classList.add('hidden');
}
};

const handleAction = async (actionType) => {
loadingState.classList.remove('hidden');
offerDetailsState.classList.add('hidden');
confirmPrompt.classList.add('hidden');
errorMessage.classList.add('hidden');
clearInterval(countdownInterval);

try {
const urlParams = new URLSearchParams(window.location.search);
const orderId = urlParams.get('orderId');
const deviceKey = urlParams.get('deviceKey');
const actionEndpoint = `/${actionType}-action`;
await apiPost(actionEndpoint, { orderId: orderId, deviceKey: deviceKey || null }, { authRequired: false });

await loadOfferDetails();

} catch (error) {
console.error(`Error during ${actionType} action:`, error);
loadingState.classList.add('hidden');
errorMessage.textContent = `Error: ${error.message}. Please try again or contact support.`;
errorMessage.classList.remove('hidden');
offerDetailsState.classList.remove('hidden');
replySection.classList.remove('hidden');
countdownContainer.classList.remove('hidden');
}
};

acceptOfferBtn?.addEventListener('click', () => {
pendingAction = 'accept-offer';
confirmMessage.textContent = 'Do you want to accept the new offer?';
confirmPrompt.classList.remove('hidden');
actionButtonsDiv.classList.add('hidden');
});

returnPhoneBtn?.addEventListener('click', () => {
pendingAction = 'return-phone';
confirmMessage.textContent = 'Do you want to decline the offer and have your phone returned?';
confirmPrompt.classList.remove('hidden');
actionButtonsDiv.classList.add('hidden');
});

confirmYesBtn?.addEventListener('click', () => {
if (pendingAction) {
handleAction(pendingAction);
}
});

confirmCancelBtn?.addEventListener('click', () => {
confirmPrompt.classList.add('hidden');
actionButtonsDiv.classList.remove('hidden');
pendingAction = null;
});

// --- Login Modal Functions ---
// These functions are now standalone and do not need to check for the existence of header elements.
function showLoginModal() {
loginModal.classList.add('is-visible');
clearAuthMessage();
showTab('login');
}

function hideLoginModal() {
loginModal.classList.remove('is-visible');
}

function showTab(tabName) {
clearAuthMessage();
loginTabBtn.classList.remove('border-indigo-600', 'text-indigo-600');
signupTabBtn.classList.remove('border-indigo-600', 'text-indigo-600');
loginTabBtn.classList.add('border-transparent', 'text-slate-500');
signupTabBtn.classList.add('border-transparent', 'text-slate-500');

if (tabName === 'login') {
loginForm.classList.remove('hidden');
signupForm.classList.add('hidden');
loginTabBtn.classList.add('border-indigo-600', 'text-indigo-600');
} else {
signupForm.classList.remove('hidden');
loginForm.classList.add('hidden');
signupTabBtn.classList.add('border-indigo-600', 'text-indigo-600');
}
}

function showAuthMessage(msg, type) {
authMessage.textContent = msg;
authMessage.classList.remove('hidden', 'bg-red-100', 'text-red-700', 'bg-green-100', 'text-green-700', 'bg-blue-100', 'text-blue-700');
if (type === 'error') {
authMessage.classList.add('bg-red-100', 'text-red-700');
} else if (type === 'success') {
authMessage.classList.add('bg-green-100', 'text-green-700');
} else if (type === 'info') {
authMessage.classList.add('bg-blue-100', 'text-blue-700');
}
authMessage.classList.remove('hidden');
}

function clearAuthMessage() {
authMessage.classList.add('hidden');
authMessage.textContent = '';
}

// --- Event Listeners for Modals and Auth (now correctly referencing elements within the modal) ---
closeModalBtn.addEventListener('click', hideLoginModal);
loginModal.addEventListener('click', (e) => {
if (e.target.id === 'loginModal') {
hideLoginModal();
}
});
loginTabBtn.addEventListener('click', () => showTab('login'));
signupTabBtn.addEventListener('click', () => showTab('signup'));
if (switchToLogin) {
switchToLogin.addEventListener('click', (e) => {
e.preventDefault();
showTab('login');
});
}

// --- Firebase Authentication Logic ---
const googleProvider = new GoogleAuthProvider();

googleLoginBtn.addEventListener('click', async () => {
try {
clearAuthMessage();
showAuthMessage('Signing in with Google...', 'info');
await signInWithPopup(auth, googleProvider);
} catch (error) {
console.error("Google login error:", error);
showAuthMessage(`Google login failed: ${error.message}`, 'error');
}
});

googleSignupBtn.addEventListener('click', async () => {
try {
clearAuthMessage();
showAuthMessage('Signing up with Google...', 'info');
await signInWithPopup(auth, googleProvider);
} catch (error) {
console.error("Google signup error:", error);
showAuthMessage(`Google signup failed: ${error.message}`, 'error');
}
});

loginForm.addEventListener('submit', async (e) => {
e.preventDefault();
const email = loginEmailInput.value;
const password = loginPasswordInput.value;
if (!email || !password) {
showAuthMessage('Please enter both email and password.', 'error');
return;
}
try {
clearAuthMessage();
showAuthMessage('Logging in...', 'info');
await signInWithEmailAndPassword(auth, email, password);
} catch (error) {
console.error("Email login error:", error);
showAuthMessage(`Login failed: ${error.message}`, 'error');
}
});

signupForm.addEventListener('submit', async (e) => {
e.preventDefault();
const name = signupNameInput.value;
const email = signupEmailInput.value;
const password = signupPasswordInput.value;
const phone = signupPhoneInput.value;

if (!name || !email || !password) {
showAuthMessage('Please enter your name, email, and password.', 'error');
return;
}
if (password.length < 6) {
showAuthMessage('Password should be at least 6 characters.', 'error');
return;
}

try {
clearAuthMessage();
showAuthMessage('Creating account...', 'info');
const userCredential = await createUserWithEmailAndPassword(auth, email, password);
await updateProfile(userCredential.user, {
displayName: name
});
if (phone) {
}
showAuthMessage('Account created successfully! You are now logged in.', 'success');
} catch (error) {
console.error("Email signup error:", error);
showAuthMessage(`Sign up failed: ${error.message}`, 'error');
}
});

// This page is meant to be a standalone landing page from an email link.
// The auth state listener and associated elements are not needed.

// Initial load of offer details
loadOfferDetails();
