import { firebaseApp } from "/assets/js/firebase-app.js";
import { getAuth, signOut, onAuthStateChanged, signInWithPopup, GoogleAuthProvider, signInWithEmailAndPassword, createUserWithEmailAndPassword, updateProfile } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, collection, addDoc, doc, onSnapshot, query, orderBy, serverTimestamp, updateDoc, setDoc, getDocs, where } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

const ADMIN_ACCESS_CODE = 'sleighbells';

const MANUAL_ORDER_STATUS_OPTIONS = [
  { value: 'order_pending', label: 'Order Pending' },
  { value: 'kit_needs_printing', label: 'Needs Printing' },
  { value: 'kit_sent', label: 'Kit Sent' },
  { value: 'kit_delivered', label: 'Kit Delivered' },
  { value: 'label_generated', label: 'Label Generated' },
  { value: 'emailed', label: 'Emailed' },
  { value: 'received', label: 'Received' },
  { value: 'completed', label: 'Completed' },
  { value: 're-offered-pending', label: 'Reoffer Pending' },
  { value: 're-offered-accepted', label: 'Reoffer Accepted' },
  { value: 're-offered-declined', label: 'Reoffer Declined' },
  { value: 'return-label-generated', label: 'Return Label Generated' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'order_cancelled', label: 'Order Cancelled' }
];

// --- Firebase Config & Initialization ---
// Global variables provided by the environment
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';

const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;

const app = firebaseApp;
const auth = getAuth(app);
const db = getFirestore(app);

document.addEventListener('DOMContentLoaded', async function() {
// --- AUTHENTICATION LOGIC ---
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
const loginTabBtn = document.getElementById('loginTabBtn');
const signupTabBtn = document.getElementById('signupTabBtn');
const loginForm = document.getElementById('loginForm');
const signupForm = document.getElementById('signupForm');
const authMessage = document.getElementById('authMessage');
const modals = document.querySelectorAll('.modal');
const devicePromoCountdown = document.getElementById('devicePromoCountdown');
const catalogDepthStat = document.getElementById('catalogDepthStat');
const bundleBonusStat = document.getElementById('bundleBonusStat');
const adminCodeInput = document.getElementById('admin-code-input');
const adminCodeVerifyBtn = document.getElementById('admin-code-verify');
const adminCodeStatus = document.getElementById('admin-code-status');
const adminOrderBuilder = document.getElementById('admin-order-builder');
const manualOrderForm = document.getElementById('manual-order-form');
const manualOrderStatus = document.getElementById('manual-order-status');
const manualOrderFeedback = document.getElementById('manual-order-feedback');
const manualOrderId = document.getElementById('manual-order-id');
const manualOrderDevice = document.getElementById('manual-order-device');
const manualOrderStorage = document.getElementById('manual-order-storage');
const manualOrderCarrier = document.getElementById('manual-order-carrier');
const manualOrderOffer = document.getElementById('manual-order-offer');
const manualOrderPayment = document.getElementById('manual-order-payment');
const manualOrderFullName = document.getElementById('manual-order-fullname');
const manualOrderEmail = document.getElementById('manual-order-email');
const manualOrderPhone = document.getElementById('manual-order-phone');
const manualOrderReferral = document.getElementById('manual-order-referral');
const manualOrderAddress = document.getElementById('manual-order-address');
const manualOrderCity = document.getElementById('manual-order-city');
const manualOrderState = document.getElementById('manual-order-state');
const manualOrderZip = document.getElementById('manual-order-zip');
const manualOrderNotes = document.getElementById('manual-order-notes');

const animateLandingStat = (element, target, formatter = (value) => Math.round(value).toLocaleString()) => {
if (!element) return;
let frame = 0;
const totalFrames = 40;
const update = () => {
frame += 1;
const progress = Math.min(frame / totalFrames, 1);
const current = target * progress;
element.textContent = formatter(current);
if (progress < 1) {
requestAnimationFrame(update);
}
};
requestAnimationFrame(update);
};

animateLandingStat(catalogDepthStat, 412, (value) => Math.round(value).toLocaleString());
animateLandingStat(bundleBonusStat, 82000, (value) => `$${Math.round(value).toLocaleString()}`);

const setManualOrderFeedback = (message, tone = 'info') => {
if (!manualOrderFeedback) return;
manualOrderFeedback.classList.add('hidden');
manualOrderFeedback.classList.remove('border-emerald-200', 'bg-emerald-50', 'text-emerald-700', 'border-red-200', 'bg-red-50', 'text-red-700');
if (!message) return;
manualOrderFeedback.textContent = message;
if (tone === 'error') {
manualOrderFeedback.classList.add('border-red-200', 'bg-red-50', 'text-red-700');
} else {
manualOrderFeedback.classList.add('border-emerald-200', 'bg-emerald-50', 'text-emerald-700');
}
manualOrderFeedback.classList.remove('hidden');
};

const setAdminCodeStatus = (message, tone = 'info') => {
if (!adminCodeStatus) return;
adminCodeStatus.classList.add('hidden');
adminCodeStatus.classList.remove('text-emerald-600', 'text-red-600');
if (!message) return;
adminCodeStatus.textContent = message;
adminCodeStatus.classList.add(tone === 'error' ? 'text-red-600' : 'text-emerald-600');
adminCodeStatus.classList.remove('hidden');
};

const populateManualOrderStatuses = () => {
if (!manualOrderStatus) return;
manualOrderStatus.innerHTML = '';
MANUAL_ORDER_STATUS_OPTIONS.forEach(({ value, label }) => {
const option = document.createElement('option');
option.value = value;
option.textContent = label;
manualOrderStatus.appendChild(option);
});
};

populateManualOrderStatuses();

let manualOrderUnlocked = false;

const verifyAdminCode = () => {
if (!adminCodeInput) return;
const attempt = adminCodeInput.value.trim().toLowerCase();
if (!attempt) {
setAdminCodeStatus('Enter the holiday code word to unlock manual order tools.', 'error');
return;
}
if (attempt === ADMIN_ACCESS_CODE) {
manualOrderUnlocked = true;
setAdminCodeStatus('Access granted. Manual order builder is now unlocked.', 'success');
adminOrderBuilder?.classList.remove('hidden');
adminCodeInput.value = '';
manualOrderDevice?.focus();
setManualOrderFeedback('');
} else {
manualOrderUnlocked = false;
adminOrderBuilder?.classList.add('hidden');
setManualOrderFeedback('');
setAdminCodeStatus('Invalid code word. Try again or reach out to leadership for the latest passphrase.', 'error');
}
};

adminCodeVerifyBtn?.addEventListener('click', verifyAdminCode);
adminCodeInput?.addEventListener('keyup', (event) => {
if (event.key === 'Enter') {
verifyAdminCode();
}
});

const getTrimmedValue = (input) => (input ? input.value.trim() : '');

manualOrderForm?.addEventListener('submit', async (event) => {
event.preventDefault();
if (!manualOrderUnlocked) {
setManualOrderFeedback('Unlock the manual order sandbox with the admin code first.', 'error');
return;
}

const statusValue = manualOrderStatus?.value;
const deviceValue = getTrimmedValue(manualOrderDevice);
const fullName = getTrimmedValue(manualOrderFullName);

if (!statusValue) {
setManualOrderFeedback('Select a status for the order before saving.', 'error');
return;
}

if (!deviceValue) {
setManualOrderFeedback('Provide a device description so the team knows what was created.', 'error');
return;
}

if (!fullName) {
setManualOrderFeedback('Include the customer name to keep records tidy.', 'error');
return;
}

const submitButton = manualOrderForm.querySelector('button[type="submit"]');
const originalButtonText = submitButton?.textContent;
if (submitButton) {
submitButton.disabled = true;
submitButton.textContent = 'Creating…';
}

const offerRaw = getTrimmedValue(manualOrderOffer);
const offerAmount = offerRaw ? Number.parseFloat(offerRaw) : null;
const safeOffer = Number.isFinite(offerAmount) ? Number(offerAmount.toFixed(2)) : null;

const shippingInfo = {
fullName,
email: getTrimmedValue(manualOrderEmail) || null,
phone: getTrimmedValue(manualOrderPhone) || null,
streetAddress: getTrimmedValue(manualOrderAddress) || null,
city: getTrimmedValue(manualOrderCity) || null,
state: getTrimmedValue(manualOrderState) || null,
zipCode: getTrimmedValue(manualOrderZip) || null
};
Object.keys(shippingInfo).forEach((key) => {
if (shippingInfo[key] === null || shippingInfo[key] === '') {
delete shippingInfo[key];
}
});

const manualCreator = auth.currentUser && !auth.currentUser.isAnonymous
? {
uid: auth.currentUser.uid,
email: auth.currentUser.email || null,
displayName: auth.currentUser.displayName || null
}
: null;

const orderPayload = {
status: statusValue,
createdAt: serverTimestamp(),
updatedAt: serverTimestamp(),
channel: 'manual-admin',
manualEntry: true,
manualCreator,
device: deviceValue,
storage: getTrimmedValue(manualOrderStorage) || null,
carrier: getTrimmedValue(manualOrderCarrier) || null,
offerAmount: safeOffer,
offerCurrency: safeOffer !== null ? 'USD' : null,
paymentMethod: getTrimmedValue(manualOrderPayment) || null,
referralSource: getTrimmedValue(manualOrderReferral) || null,
manualNotes: getTrimmedValue(manualOrderNotes) || null,
shippingInfo: Object.keys(shippingInfo).length ? shippingInfo : undefined,
statusHistory: [
{
status: statusValue,
changedAt: serverTimestamp(),
changedBy: manualCreator?.uid || 'manual-admin',
note: 'Manual entry created from sell page sandbox'
}
],
activityLog: [
{
event: 'manual_order_created',
message: `Manual order created with status ${statusValue}`,
actor: manualCreator?.uid || 'manual-admin',
actorEmail: manualCreator?.email || null,
createdAt: serverTimestamp()
}
]
};

const cleanObject = (obj) => {
Object.keys(obj).forEach((key) => {
const value = obj[key];
if (value && typeof value === 'object' && !Array.isArray(value)) {
cleanObject(value);
if (Object.keys(value).length === 0) {
delete obj[key];
}
} else if (value === null || value === undefined || value === '') {
delete obj[key];
}
});
};

cleanObject(orderPayload);

let createdId = null;

try {
const requestedId = getTrimmedValue(manualOrderId);
if (requestedId) {
const targetDoc = doc(db, 'orders', requestedId);
await setDoc(targetDoc, orderPayload, { merge: true });
createdId = requestedId;
} else {
const docRef = await addDoc(collection(db, 'orders'), orderPayload);
createdId = docRef.id;
}

setManualOrderFeedback(`Manual order saved successfully. Reference ID: ${createdId}`, 'success');
manualOrderForm.reset();
populateManualOrderStatuses();
if (manualOrderStatus) {
manualOrderStatus.value = statusValue;
}
} catch (error) {
console.error('Failed to create manual order', error);
setManualOrderFeedback(`Failed to save manual order: ${error.message || error}`, 'error');
} finally {
if (submitButton) {
submitButton.disabled = false;
submitButton.textContent = originalButtonText || 'Create order';
}
}
});

const updateDeviceCountdown = () => {
if (!devicePromoCountdown) return;
const now = new Date();
let eventDate = new Date(`${now.getFullYear()}-10-19T09:00:00`);
if (now > eventDate) {
eventDate = new Date(`${now.getFullYear() + 1}-10-19T09:00:00`);
}
const diff = eventDate - now;
if (diff <= 0) {
devicePromoCountdown.textContent = 'Promo Live!';
return;
}
const days = Math.floor(diff / (1000 * 60 * 60 * 24));
const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
const minutes = Math.floor((diff / (1000 * 60)) % 60);
devicePromoCountdown.textContent = `${days}d ${hours}h ${minutes}m`;
};

if (devicePromoCountdown) {
updateDeviceCountdown();
setInterval(updateDeviceCountdown, 60000);
}

const openModal = (modalId) => document.getElementById(modalId)?.classList.add('is-visible');
const closeModal = (modal) => modal.classList.remove('is-visible');

const showTab = (tabName) => {
authMessage.classList.add('hidden');
[loginForm, signupForm].forEach(form => form.classList.add('hidden'));
[loginTabBtn, signupTabBtn].forEach(btn => btn.classList.remove('border-blue-600', 'text-blue-600', 'border-b-2'));

if (tabName === 'login') {
loginForm.classList.remove('hidden');
loginTabBtn.classList.add('border-blue-600', 'text-blue-600', 'border-b-2');
} else {
signupForm.classList.remove('hidden');
signupTabBtn.classList.add('border-blue-600', 'text-blue-600', 'border-b-2');
}
};

function showAuthMessage(msg, type = 'error') {
authMessage.textContent = msg;
authMessage.className = 'mt-4 p-3 rounded-lg text-sm text-center';
if (type === 'error') {
authMessage.classList.add('bg-red-100', 'text-red-700');
authMessage.classList.remove('hidden');
} else if (type === 'success') {
authMessage.classList.add('bg-green-100', 'text-green-700');
authMessage.classList.remove('hidden');
}
}

onAuthStateChanged(auth, user => {
const isLoggedIn = !!user && !user.isAnonymous;
if (isLoggedIn) {
loginNavBtn.classList.add('hidden');
userMonogram.classList.remove('hidden');
const initials = (user.displayName || user.email || 'N/A').split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
userMonogram.textContent = initials;
} else {
loginNavBtn.classList.remove('hidden');
userMonogram.classList.add('hidden');
authDropdown.classList.add('hidden');
}
});

const googleProvider = new GoogleAuthProvider();
const signInWithGoogle = async () => {
try {
await signInWithPopup(auth, googleProvider);
closeModal(document.getElementById('loginModal'));
} catch (error) {
showAuthMessage(error.message);
}
};

if (auth) {
googleLoginBtn.addEventListener('click', signInWithGoogle);
googleSignupBtn.addEventListener('click', signInWithGoogle);
}

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

userMonogram.addEventListener('click', (e) => {
e.stopPropagation();
authDropdown.classList.toggle('hidden');
});

document.addEventListener('click', () => {
if (!authDropdown.classList.contains('hidden')) {
authDropdown.classList.add('hidden');
}
});

logoutBtn.addEventListener('click', () => {
clearStoredChatSession();
currentChatId = null;
signOut(auth);
});

document.getElementById('loginNavBtn').addEventListener('click', (e) => { e.preventDefault(); openModal('loginModal'); showTab('login'); });
document.getElementById('aboutUsLink').addEventListener('click', (e) => { e.preventDefault(); openModal('aboutUsModal'); });

modals.forEach(modal => {
modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(modal); });
modal.querySelector('.close-modal-btn')?.addEventListener('click', () => closeModal(modal));
});

const modalPriceEstimate = document.getElementById('modal-price-estimate');
const modalEstimatedPrice = document.getElementById('modal-estimated-price');
const brandSelect = document.getElementById('modal-brand-select');
const deviceSelect = document.getElementById('modal-device-select');
const storageSelect = document.getElementById('modal-storage-select');
const carrierSelect = document.getElementById('modal-carrier-select');
const conditionButtons = Array.from(document.querySelectorAll('.condition-btn'));
const continueBtn = document.getElementById('modal-continue-btn');
const brandIcon = document.getElementById('brand-icon');
const quoteWizardTriggers = document.querySelectorAll('[data-open-quote-wizard]');

const pricingModal = {
brand: '',
device: '',
deviceSlug: '',
storage: '',
carrier: 'unlocked',
conditions: { power: null, functionality: null, quality: null },
deviceData: null,
setContinueState(enabled) {
if (!continueBtn) return;
continueBtn.disabled = !enabled;
continueBtn.classList.toggle('opacity-50', !enabled);
continueBtn.classList.toggle('cursor-not-allowed', !enabled);
},
reset() {
this.brand = '';
this.device = '';
this.deviceSlug = '';
this.storage = '';
this.carrier = 'unlocked';
this.conditions = { power: null, functionality: null, quality: null };

if (brandSelect) brandSelect.value = '';
if (deviceSelect) {
deviceSelect.innerHTML = '<option value="">Choose a device...</option>';
deviceSelect.disabled = true;
}
if (storageSelect) {
storageSelect.innerHTML = '<option value="">Select storage...</option>';
storageSelect.disabled = true;
}
if (carrierSelect) {
carrierSelect.value = 'unlocked';
}
if (brandIcon) {
brandIcon.classList.add('hidden');
brandIcon.removeAttribute('src');
}

modalEstimatedPrice.textContent = '0';
modalPriceEstimate.classList.add('hidden');

conditionButtons.forEach(btn => {
btn.classList.remove('border-indigo-500', 'bg-indigo-50', 'ring-2', 'ring-indigo-200');
});

this.setContinueState(false);
},
open() {
this.reset();
openModal('pricingModal');
},
updateBrandIcon(option) {
if (!brandIcon) return;
const iconUrl = option?.dataset?.icon;
if (iconUrl) {
brandIcon.src = iconUrl;
brandIcon.classList.remove('hidden');
} else {
brandIcon.classList.add('hidden');
brandIcon.removeAttribute('src');
}
},
async loadDevices() {
if (!this.brand) return;

if (deviceSelect) {
deviceSelect.innerHTML = '<option value="">Loading devices...</option>';
deviceSelect.disabled = true;
}
if (storageSelect) {
storageSelect.innerHTML = '<option value="">Select storage...</option>';
storageSelect.disabled = true;
}

try {
const devicesCol = collection(db, `devices/${this.brand}/models`);
const devicesSnapshot = await getDocs(devicesCol);

if (deviceSelect) {
deviceSelect.innerHTML = '<option value="">Choose a device...</option>';
deviceSelect.disabled = false;

devicesSnapshot.forEach((docSnap) => {
const data = docSnap.data();
const option = document.createElement('option');
option.value = docSnap.id;
option.textContent = data.name || docSnap.id;
option.dataset.deviceData = JSON.stringify(data);
deviceSelect.appendChild(option);
});
}
} catch (error) {
console.error('Error loading devices:', error);
if (deviceSelect) {
deviceSelect.innerHTML = '<option value="">Error loading devices</option>';
}
}

this.device = '';
this.storage = '';
this.deviceData = null;
this.checkComplete();
},
loadStorage() {
if (!deviceSelect || !storageSelect) return;

storageSelect.innerHTML = '<option value="">Select storage...</option>';

const selectedOption = deviceSelect.options[deviceSelect.selectedIndex];
if (this.device && selectedOption && selectedOption.dataset.deviceData) {
this.deviceData = JSON.parse(selectedOption.dataset.deviceData);
this.deviceSlug = this.device;

const prices = this.deviceData.prices;
if (prices) {
storageSelect.disabled = false;
Object.keys(prices).forEach(storage => {
const option = document.createElement('option');
option.value = storage;
option.textContent = storage;
storageSelect.appendChild(option);
});
}
} else {
storageSelect.disabled = true;
}

this.storage = '';
this.checkComplete();
},
checkComplete() {
const ready = this.brand && this.device && this.storage &&
this.conditions.power && this.conditions.functionality && this.conditions.quality;

if (!ready) {
modalPriceEstimate.classList.add('hidden');
this.setContinueState(false);
return;
}

this.calculatePrice();
},
calculatePrice() {
if (!this.deviceData || !this.deviceData.prices) {
modalPriceEstimate.classList.add('hidden');
this.setContinueState(false);
return;
}

const carrierKey = this.carrier === 'unlocked' ? 'unlocked' : 'locked';
const storageKey = this.storage;

let conditionKey = 'good';
if (this.conditions.power === 'no') {
conditionKey = 'noPower';
} else if (this.conditions.functionality === 'not-working') {
conditionKey = 'broken';
} else if (this.conditions.quality === 'flawless') {
conditionKey = 'flawless';
} else if (this.conditions.quality === 'damaged') {
conditionKey = 'damaged';
}

const price = this.deviceData.prices?.[storageKey]?.[carrierKey]?.[conditionKey];
if (price) {
modalEstimatedPrice.textContent = price;
modalPriceEstimate.classList.remove('hidden');
this.setContinueState(true);
} else {
modalPriceEstimate.classList.add('hidden');
this.setContinueState(false);
}
}
};

if (brandSelect) {
brandSelect.addEventListener('change', (event) => {
pricingModal.brand = event.target.value;
pricingModal.updateBrandIcon(event.target.options[event.target.selectedIndex]);

if (!pricingModal.brand) {
pricingModal.reset();
return;
}

pricingModal.loadDevices();
});
}

if (deviceSelect) {
deviceSelect.addEventListener('change', (event) => {
pricingModal.device = event.target.value;
pricingModal.loadStorage();
});
}

if (storageSelect) {
storageSelect.addEventListener('change', (event) => {
pricingModal.storage = event.target.value;
pricingModal.checkComplete();
});
}

if (carrierSelect) {
carrierSelect.addEventListener('change', (event) => {
pricingModal.carrier = event.target.value || 'unlocked';
pricingModal.checkComplete();
});
}

conditionButtons.forEach((btn) => {
btn.addEventListener('click', () => {
const condition = btn.dataset.condition;
const value = btn.dataset.value;

conditionButtons
.filter(button => button.dataset.condition === condition)
.forEach(button => button.classList.remove('border-indigo-500', 'bg-indigo-50', 'ring-2', 'ring-indigo-200'));

btn.classList.add('border-indigo-500', 'bg-indigo-50', 'ring-2', 'ring-indigo-200');
pricingModal.conditions[condition] = value;
pricingModal.checkComplete();
});
});

if (continueBtn) {
continueBtn.addEventListener('click', () => {
const params = new URLSearchParams({
device: `${pricingModal.brand}-${pricingModal.device}`,
storage: pricingModal.storage,
carrier: pricingModal.carrier,
power: pricingModal.conditions.power,
functionality: pricingModal.conditions.functionality,
quality: pricingModal.conditions.quality,
price: modalEstimatedPrice.textContent
});

window.location.href = `sell/?${params.toString()}`;
});
}

quoteWizardTriggers.forEach(trigger => {
trigger.addEventListener('click', (event) => {
event.preventDefault();
pricingModal.open();
});
});

pricingModal.reset();

loginTabBtn.addEventListener('click', () => showTab('login'));
signupTabBtn.addEventListener('click', () => showTab('signup'));

// --- ADVANCED LIVE CHAT LOGIC ---
const chatWindow = document.getElementById('chat-window');
const chatOpenBtn = document.getElementById('chat-open-btn');
const chatCloseBtn = document.getElementById('chat-close-btn');
const chatMinimizeBtn = document.getElementById('chat-minimize-btn');
const chatMessages = document.getElementById('chat-messages');
const chatInput = document.getElementById('chat-input');
const chatInputContainer = document.getElementById('chat-input-container');
const guestPromptContainer = document.getElementById('guest-prompt-container');
const guestLoginBtn = document.getElementById('guest-login-btn');
const unreadCounter = document.getElementById('unread-counter');
const typingIndicatorContainer = document.getElementById('typing-indicator-container');
const surveyContainer = document.getElementById('chat-survey-container');
const surveyForm = document.getElementById('chat-survey-form');
const starRatingContainer = document.getElementById('star-rating');
const endChatConfirmModal = document.getElementById('end-chat-confirm-modal');
const endChatYesBtn = document.getElementById('end-chat-yes');
const endChatNoBtn = document.getElementById('end-chat-no');
const orderSelectionContainer = document.getElementById('order-selection-container');
const orderList = document.getElementById('order-list');
const closeOrderSelectionBtn = document.getElementById('close-order-selection-btn');
const sendMessageBtn = document.getElementById('send-message-btn');
const globalTooltip = document.getElementById('globalTooltip');

const CHAT_STORAGE_KEY = 'chatSessionState';

const storeChatSession = (chatId) => {
const user = auth.currentUser;
if (!user || user.isAnonymous || !chatId) return;
localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify({ chatId, uid: user.uid }));
};

const getStoredChatSession = () => {
const raw = localStorage.getItem(CHAT_STORAGE_KEY);
if (!raw) return null;
try {
const parsed = JSON.parse(raw);
const user = auth.currentUser;
if (!user || user.isAnonymous || parsed.uid !== user.uid) return null;
return parsed;
} catch (error) {
console.error('Failed to parse stored chat session', error);
return null;
}
};

const clearStoredChatSession = () => {
localStorage.removeItem(CHAT_STORAGE_KEY);
};

let currentChatId = getStoredChatSession()?.chatId || null;
let unsubscribeFromMessages = null;
let unsubscribeFromChatSession = null;
let isChatMinimized = true;
let unreadCount = 0;
let userTypingTimeout = null;
let initialWelcomeRendered = {};

const notificationSound = new Audio('https://cdn.freesound.org/previews/253/253887_3900531-lq.mp3');
notificationSound.volume = 0.5;

const ensureUserAuthenticatedForChat = () => {
const user = auth.currentUser;
const isAuthenticated = !!user && !user.isAnonymous;
if (!isAuthenticated) {
guestPromptContainer.classList.remove('hidden');
chatInputContainer.classList.add('hidden');
surveyContainer.classList.add('hidden');
orderSelectionContainer.classList.add('hidden');
} else {
guestPromptContainer.classList.add('hidden');
chatInputContainer.classList.remove('hidden');
}
return isAuthenticated;
};

onAuthStateChanged(auth, (user) => {
const isLoggedIn = !!user && !user.isAnonymous;
if (isLoggedIn) {
currentChatId = getStoredChatSession()?.chatId || currentChatId;
if (chatWindow.classList.contains('is-visible')) {
ensureUserAuthenticatedForChat();
if (currentChatId) {
listenForMessages(currentChatId);
listenForChatSessionChanges(currentChatId);
}
}
} else {
clearStoredChatSession();
currentChatId = null;
if (chatWindow.classList.contains('is-visible')) {
ensureUserAuthenticatedForChat();
}
}
});

const getOrCreateGuestId = () => {
let id = localStorage.getItem('guestChatId');
if (!id) {
id = `guest_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
localStorage.setItem('guestChatId', id);
}
return id;
};

const getOrCreateChatSession = async () => {
const user = auth.currentUser;
if (!user || user.isAnonymous) return null;

const storedSession = getStoredChatSession();
if (storedSession?.chatId) {
return storedSession.chatId;
}

const chatSessionData = {
createdAt: serverTimestamp(),
ownerUid: user.uid,
guestId: null,
status: 'active',
agentName: null,
isAgentTyping: false,
userTypingText: '',
agentAskingForOrderId: false
};
const docRef = await addDoc(collection(db, "chats"), chatSessionData);
const chatId = docRef.id;
storeChatSession(chatId);
return chatId;
};

const renderMessage = (msg) => {
const messageDiv = document.createElement('div');
const user = auth.currentUser;
const isMyMessage = !!user && !user.isAnonymous && msg.sender === user.uid;

let classes = 'p-3 rounded-lg max-w-[85%] mb-2 break-words';
if (msg.type === 'system') {
classes = 'text-center text-sm text-slate-500 my-2';
messageDiv.innerHTML = `<span class="bg-white px-2 py-1 rounded-full">${msg.text}</span>`;
} else {
classes += isMyMessage ? ' bg-gray-200 text-slate-800 self-end' : ' bg-blue-100 text-blue-800 self-start';
messageDiv.textContent = msg.text;
}

messageDiv.className = classes;
if (msg.type === 'system' && msg.text.includes('has joined the chat.')) {
messageDiv.id = `agent-joined-${currentChatId}`;
}
chatMessages.appendChild(messageDiv);
chatMessages.scrollTop = chatMessages.scrollHeight;
};

const listenForChatSessionChanges = (chatId) => {
if (unsubscribeFromChatSession) unsubscribeFromChatSession();
unsubscribeFromChatSession = onSnapshot(doc(db, "chats", chatId), async (docSnap) => {
const data = docSnap.data();
if (!data) return;

const agentJoinedFlag = localStorage.getItem(`agentJoined_${chatId}`);
if (data.agentName && data.agentHasJoined && !agentJoinedFlag) {
const joinMsgText = `<i class="fa-solid fa-headset mr-2"></i>${data.agentName} has joined the chat.`;
addDoc(collection(db, `chats/${chatId}/messages`), {
text: joinMsgText,
timestamp: serverTimestamp(),
sender: 'system',
type: 'system'
});
localStorage.setItem(`agentJoined_${chatId}`, 'true');
}

typingIndicatorContainer.style.display = data.isAgentTyping ? 'block' : 'none';
if (data.isAgentTyping) chatMessages.scrollTop = chatMessages.scrollHeight;
if (data.status === 'ended_by_agent') {
chatInputContainer.classList.add('hidden');
guestPromptContainer.classList.add('hidden');
surveyContainer.classList.remove('hidden');
orderSelectionContainer.classList.add('hidden');
clearStoredChatSession();
localStorage.removeItem(`agentJoined_${chatId}`);
}
if (data.agentAskingForOrderId) {
displayOrderSelectionUI();
} else {
orderSelectionContainer.classList.add('hidden');
}
});
};

const listenForMessages = (chatId) => {
if (unsubscribeFromMessages) unsubscribeFromMessages();
currentChatId = chatId;
const messagesRef = collection(db, `chats/${chatId}/messages`);
const q = query(messagesRef, orderBy("timestamp"));
unsubscribeFromMessages = onSnapshot(q, (snapshot) => {
chatMessages.innerHTML = '';
if (!initialWelcomeRendered[chatId] && snapshot.empty) {
const user = auth.currentUser;
const userName = user?.displayName?.split(' ')[0] || 'there';
renderMessage({ type: 'system', text: `Hi ${userName}, how can we help you today?` });
initialWelcomeRendered[chatId] = true;
}

snapshot.forEach(doc => {
const msgData = doc.data();
renderMessage(msgData);
const user = auth.currentUser;
const isMyMessage = !!user && !user.isAnonymous && msgData.sender === user.uid;
if (!isMyMessage && isChatMinimized) {
unreadCount++;
unreadCounter.textContent = unreadCount;
unreadCounter.classList.add('visible');
notificationSound.play().catch(e => console.log("Audio play failed:", e));
}
});
});
};

const resetChatUI = () => {
endChatConfirmModal.classList.add('hidden');
endChatConfirmModal.classList.remove('flex');
surveyContainer.classList.add('hidden');
guestPromptContainer.classList.add('hidden');
chatInputContainer.classList.remove('hidden');
orderSelectionContainer.classList.add('hidden');
typingIndicatorContainer.style.display = 'none';
chatMessages.innerHTML = '';
initialWelcomeRendered = {};
};

const openChat = async () => {
resetChatUI();
chatWindow.classList.add('is-visible');
isChatMinimized = false;
unreadCount = 0;
unreadCounter.classList.remove('visible');
if (!ensureUserAuthenticatedForChat()) {
currentChatId = null;
return;
}

if (!currentChatId) {
currentChatId = await getOrCreateChatSession();
}

if (currentChatId) {
listenForMessages(currentChatId);
listenForChatSessionChanges(currentChatId);
}
};
chatOpenBtn.addEventListener('click', openChat);

const minimizeChat = () => {
chatWindow.classList.remove('is-visible');
isChatMinimized = true;
};
chatMinimizeBtn.addEventListener('click', minimizeChat);

chatCloseBtn.addEventListener('click', () => {
endChatConfirmModal.classList.remove('hidden');
endChatConfirmModal.classList.add('flex');
});

endChatNoBtn.addEventListener('click', () => {
endChatConfirmModal.classList.add('hidden');
endChatConfirmModal.classList.remove('flex');
});

endChatYesBtn.addEventListener('click', async () => {
if (currentChatId) {
await addDoc(collection(db, `chats/${currentChatId}/messages`), {
text: "Chat ended by user.",
timestamp: serverTimestamp(),
sender: 'system',
type: 'system'
});
await updateDoc(doc(db, "chats", currentChatId), { status: 'ended_by_user' });
}
clearStoredChatSession();
localStorage.removeItem(`agentJoined_${currentChatId}`);
currentChatId = null;
chatMessages.innerHTML = '';
endChatConfirmModal.classList.add('hidden');
endChatConfirmModal.classList.remove('flex');
});

const sendMessage = async (text) => {
if (text.trim() === '') return;

if (!ensureUserAuthenticatedForChat()) return;

if (!currentChatId) {
currentChatId = await getOrCreateChatSession();
if (!currentChatId) return;
}

const user = auth.currentUser;
if (!user || user.isAnonymous) return;

const messageData = { text, timestamp: serverTimestamp(), sender: user.uid };
await addDoc(collection(db, `chats/${currentChatId}/messages`), messageData);
chatInput.value = '';
await updateDoc(doc(db, "chats", currentChatId), {
userTypingText: '',
lastMessage: `User: ${text}`,
lastMessageTimestamp: serverTimestamp()
});
};

chatInput.addEventListener('keypress', (e) => {
if (e.key === 'Enter') {
e.preventDefault();
sendMessage(chatInput.value);
}
});
sendMessageBtn.addEventListener('click', () => {
sendMessage(chatInput.value);
});

chatInput.addEventListener('keyup', () => {
clearTimeout(userTypingTimeout);
userTypingTimeout = setTimeout(async () => {
const user = auth.currentUser;
if (currentChatId && user && !user.isAnonymous) {
await updateDoc(doc(db, "chats", currentChatId), { userTypingText: chatInput.value });
}
}, 300);
});

guestLoginBtn.addEventListener('click', () => openModal('loginModal'));

starRatingContainer.addEventListener('mouseover', e => {
if (e.target.tagName === 'I') {
const rating = e.target.dataset.value;
Array.from(starRatingContainer.children).forEach(star => star.classList.toggle('selected', star.dataset.value <= rating));
}
});
starRatingContainer.addEventListener('mouseout', () => {
const currentRating = starRatingContainer.dataset.rating;
Array.from(starRatingContainer.children).forEach(star => star.classList.toggle('selected', star.dataset.value <= currentRating));
});
starRatingContainer.addEventListener('click', e => {
if (e.target.tagName === 'I') {
starRatingContainer.dataset.rating = e.target.dataset.value;
}
});
surveyForm.addEventListener('submit', async (e) => {
e.preventDefault();
const surveyData = {
overallRating: parseInt(starRatingContainer.dataset.rating, 10)
};
await setDoc(doc(db, `chats/${currentChatId}/survey/feedback`), { ...surveyData, submittedAt: serverTimestamp() });
surveyContainer.innerHTML = '<p class="text-center font-semibold text-green-600">Thank you for your feedback!</p>';
});

// --- USER ORDERS LOGIC ---
const fetchUserOrders = async () => {
return new Promise((resolve) => {
const unsubscribe = onAuthStateChanged(auth, async (user) => {
unsubscribe();
if (!user || user.isAnonymous) {
resolve({ requiresLogin: true });
return;
}
const userId = user.uid;
const ordersRef = collection(db, "orders");
const q = query(ordersRef, where("userId", "==", userId), orderBy("createdAt", "desc"));
try {
const snapshot = await getDocs(q);
const orders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
resolve(orders);
} catch (error) {
console.error("Error fetching user orders:", error);
resolve({ error: error.message });
}
});
});
};

const renderOrderSelection = (orders) => {
orderList.innerHTML = '';
if (orders.requiresLogin) {
orderList.innerHTML = '<p class="text-center text-slate-500">Please <a href="#" id="orderLoginPromptLink" class="text-blue-600 font-semibold hover:underline">log in</a> to view orders.</p>';
document.getElementById('orderLoginPromptLink').addEventListener('click', (e) => {
e.preventDefault();
openModal('loginModal');
orderSelectionContainer.classList.add('hidden');
});
return;
}

if (!orders || orders.length === 0) {
orderList.innerHTML = '<p class="text-center text-slate-500">No recent orders found.</p>';
return;
}
orders.forEach(order => {
const orderCard = document.createElement('div');
orderCard.className = 'order-card';
orderCard.dataset.orderId = order.orderId;
orderCard.innerHTML = `
<img src="${order.imageUrl || 'https://placehold.co/48x48/e0e7ff/4338ca?text=📱'}" alt="${order.device}" onerror="this.onerror=null;this.src='https://placehold.co/48x48/e0e7ff/4338ca?text=📱';">
<div class="order-card-details">
<strong>ID: ${order.orderId} - ${order.device}</strong>
<span>${order.storage} | $${order.estimatedQuote}</span>
</div>`;
orderCard.addEventListener('click', () => handleOrderSelection(order));
orderList.appendChild(orderCard);
});
};

const displayOrderSelectionUI = async () => {
guestPromptContainer.classList.add('hidden');
orderSelectionContainer.classList.remove('hidden');
orderList.innerHTML = '<p class="text-center text-blue-500">Loading your orders...</p>';
const orders = await fetchUserOrders();
renderOrderSelection(orders);
};

const handleOrderSelection = async (order) => {
const messageText = `Selected Order: ID: ${order.orderId} - Device: ${order.device}`;
await sendMessage(messageText);
orderSelectionContainer.classList.add('hidden');
if (currentChatId) {
await updateDoc(doc(db, "chats", currentChatId), { agentAskingForOrderId: false });
}
};

closeOrderSelectionBtn.addEventListener('click', async () => {
orderSelectionContainer.classList.add('hidden');
if (currentChatId) {
await updateDoc(doc(db, "chats", currentChatId), { agentAskingForOrderId: false });
}
});

const chatOrderBtn = document.getElementById('chat-order-btn');
chatOrderBtn.addEventListener('click', async () => {
if (currentChatId) {
await updateDoc(doc(db, "chats", currentChatId), { agentAskingForOrderId: true });
} else {
displayOrderSelectionUI();
}
});

const chatHeaderButtons = document.querySelectorAll('.chat-header-button');
chatHeaderButtons.forEach(button => {
let tooltipTimeout;
button.addEventListener('mouseover', (e) => {
clearTimeout(tooltipTimeout);
const tooltipText = button.dataset.tooltipText;
if (tooltipText) {
globalTooltip.textContent = tooltipText;
globalTooltip.style.visibility = 'visible';
globalTooltip.style.opacity = '1';
const rect = button.getBoundingClientRect();
globalTooltip.style.top = `${rect.bottom + 8}px`;
globalTooltip.style.left = `${rect.left + rect.width / 2}px`;
globalTooltip.style.transform = `translateX(-50%)`;
}
});
button.addEventListener('mouseout', () => {
tooltipTimeout = setTimeout(() => {
globalTooltip.style.visibility = 'hidden';
globalTooltip.style.opacity = '0';
}, 100);
});
});
});
