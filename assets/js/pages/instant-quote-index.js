import { firebaseApp } from "/assets/js/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-analytics.js";
import { getAuth, signInAnonymously, GoogleAuthProvider, signInWithPopup, signInWithEmailAndPassword, createUserWithEmailAndPassword, updateProfile, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, collection, getDocs, doc, getDoc, setLogLevel } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// --- Configuration and State ---
setLogLevel('Debug');

// ** API URL FOR BACKEND SUBMISSION **
// This should point to your Firebase Cloud Functions HTTP endpoint (exports.api).
const BACKEND_API_URL = 'https://us-central1-buyback-a0f05.cloudfunctions.net/api';

const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';

const initialAuthToken = null;

const app = firebaseApp;
const analytics = getAnalytics(app);
const db = getFirestore(app);
const auth = getAuth(app);
const devicesCollectionPath = `devices`;

let selectedBrand = '';
let selectedDevice = '';
let deviceData = null;
let conditions = { power: '', screen: '', cracks: '' };
let isAuthReady = false;
let finalQuote = 0.00; // Final calculated price
let currentUserId = null; // New: to store user ID
let pendingShippingUnlock = false;

const US_STATES = [
{ name: "Alabama", code: "AL" }, { name: "Alaska", code: "AK" }, { name: "Arizona", code: "AZ" }, { name: "Arkansas", code: "AR" },
{ name: "California", code: "CA" }, { name: "Colorado", code: "CO" }, { name: "Connecticut", code: "CT" }, { name: "Delaware", code: "DE" },
{ name: "Florida", code: "FL" }, { name: "Georgia", code: "GA" }, { name: "Hawaii", code: "HI" }, { name: "Idaho", code: "ID" },
{ name: "Illinois", code: "IL" }, { name: "Indiana", code: "IN" }, { name: "Iowa", code: "IA" }, { name: "Kansas", code: "KS" },
{ name: "Kentucky", code: "KY" }, { name: "Louisiana", code: "LA" }, { name: "Maine", code: "ME" }, { name: "Maryland", code: "MD" },
{ name: "Massachusetts", code: "MA" }, { name: "Michigan", code: "MI" }, { name: "Minnesota", code: "MN" }, { name: "Mississippi", code: "MS" },
{ name: "Missouri", code: "MO" }, { name: "Montana", code: "MT" }, { name: "Nebraska", code: "NE" }, { name: "Nevada", code: "NV" },
{ name: "New Hampshire", code: "NH" }, { name: "New Jersey", code: "NJ" }, { name: "New Mexico", code: "NM" }, { name: "New York", code: "NY" },
{ name: "North Carolina", code: "NC" }, { name: "North Dakota", code: "ND" }, { name: "Ohio", code: "OH" }, { name: "Oklahoma", code: "OK" },
{ name: "Oregon", code: "OR" }, { name: "Pennsylvania", code: "PA" }, { name: "Rhode Island", code: "RI" }, { name: "South Carolina", code: "SC" },
{ name: "South Dakota", code: "SD" }, { name: "Tennessee", code: "TN" }, { name: "Texas", code: "TX" }, { name: "Utah", code: "UT" },
{ name: "Vermont", code: "VT" }, { name: "Virginia", code: "VA" }, { name: "Washington", code: "WA" }, { name: "West Virginia", code: "WV" },
{ name: "Wisconsin", code: "WI" }, { name: "Wyoming", code: "WY" }
];

// --- Authentication/Modal Elements ---
const loginModal = document.getElementById('loginModal');
const loginTabBtn = document.getElementById('loginTabBtn');
const signupTabBtn = document.getElementById('signupTabBtn');
const loginForm = document.getElementById('loginForm');
const signupForm = document.getElementById('signupForm');
const authMessage = document.getElementById('authMessage');
const googleProvider = new GoogleAuthProvider();

const SHIPPING_INFO_STORAGE_KEY = 'instantQuoteShippingInfo';
let cachedShippingInfo = null;

function loadStoredShippingInfo() {
    if (cachedShippingInfo) {
        return cachedShippingInfo;
    }
    try {
        const raw = localStorage.getItem(SHIPPING_INFO_STORAGE_KEY);
        if (!raw) {
            return null;
        }
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
            cachedShippingInfo = parsed;
            return parsed;
        }
    } catch (error) {
        console.warn('Unable to read stored shipping information', error);
    }
    return null;
}

function persistShippingInfo(update = {}) {
    const existing = loadStoredShippingInfo() || {};
    const merged = { ...existing, ...update };
    cachedShippingInfo = merged;
    try {
        localStorage.setItem(SHIPPING_INFO_STORAGE_KEY, JSON.stringify(merged));
    } catch (error) {
        console.warn('Unable to store shipping information', error);
    }
    return merged;
}

function applyShippingInfo(info, { overwriteExisting = false } = {}) {
    const data = info || loadStoredShippingInfo();
    if (!data) return;

    const mappings = [
        ['fullName', 'fullName'],
        ['email', 'email'],
        ['phone', 'phone'],
        ['street-address', 'streetAddress'],
        ['city', 'city'],
        ['state', 'state'],
        ['zip-code', 'zipCode']
    ];

    mappings.forEach(([elementId, key]) => {
        const field = document.getElementById(elementId);
        if (!field) return;
        const value = data[key];
        if (typeof value === 'undefined' || value === null) return;
        if (overwriteExisting || !field.value) {
            field.value = value;
        }
    });

    if (data.shippingPreference) {
        const radio = document.querySelector(`input[name="shipping_preference"][value="${data.shippingPreference}"]`);
        if (radio) {
            radio.checked = true;
        }
    }

    if (typeof window.updateOverview === 'function') {
        window.updateOverview();
    }
}

const devicePreviewImg = document.getElementById('device-preview-img');
const deviceImagePreviewDiv = document.getElementById('device-image-preview');

// --- Utility Functions ---

/** Formats the phone number as the user types: (###) ###-####. */
window.formatPhoneNumber = function(input) {
let cleaned = ('' + input.value).replace(/\D/g, '');
if (cleaned.length === 11 && cleaned.startsWith('1')) { cleaned = cleaned.substring(1); }
cleaned = cleaned.substring(0, 10);

let formatted = '';
if (cleaned.length > 0) { formatted += '(' + cleaned.substring(0, 3); }
if (cleaned.length >= 4) { formatted += ') ' + cleaned.substring(3, 6); }
if (cleaned.length >= 7) { formatted += '-' + cleaned.substring(6, 10); }

input.value = formatted;
input.maxLength = 14;
window.updateOverview();
}

/** Populates the state select dropdown. */
function populateStateSelect() {
const selectElement = document.getElementById('state');
if (!selectElement) return;

const fragment = document.createDocumentFragment();
US_STATES.forEach(state => {
const option = document.createElement('option');
option.value = state.code;
option.textContent = `${state.name} (${state.code})`;
fragment.appendChild(option);
});
selectElement.appendChild(fragment);
}

/** Opens a modal by making it visible and interactive */
function openModal(modalId) {
document.getElementById(modalId)?.classList.add('is-visible');
}

/** Closes a modal by hiding it and removing interactivity */
window.closeModal = function(modalId) {
document.getElementById(modalId)?.classList.remove('is-visible');
}

/** Opens the functional details modal. */
window.showFunctionalModal = function(e) {
e.preventDefault();
openModal('functional-details-modal');
}

function showMessage(message, title = "Operation Failed") {
document.getElementById('message-text').textContent = message;
const modal = document.getElementById('message-modal');
const header = modal.querySelector('h4');

header.textContent = title;
header.classList.toggle('text-red-600', title.includes('Required') || title.includes('Error') || title.includes('Failed'));
header.classList.toggle('text-indigo-600', !title.includes('Required') && !title.includes('Error') && !title.includes('Failed'));

modal.classList.remove('opacity-0', 'pointer-events-none', 'visibility-hidden');
modal.querySelector('div').classList.remove('translate-y-4');
}

window.hideMessage = function() {
const modal = document.getElementById('message-modal');
modal.classList.add('opacity-0', 'pointer-events-none', 'visibility-hidden');
modal.querySelector('div').classList.add('translate-y-4');
const header = modal.querySelector('h4');
header.textContent = "Required Fields";
header.classList.add('text-red-600');
header.classList.remove('text-indigo-600');
}

function showPaymentMessage(msg, type) {
const messageBox = document.getElementById('payment-message-box');
messageBox.textContent = msg;
messageBox.className = 'text-center text-sm p-3 rounded-lg mb-4';
messageBox.classList.remove('hidden', 'bg-red-100', 'text-red-700', 'bg-green-100', 'text-green-700', 'bg-blue-100', 'text-blue-700');
if (type === 'error') {
messageBox.classList.add('bg-red-100', 'text-red-700');
} else if (type === 'success') {
messageBox.classList.add('bg-green-100', 'text-green-700');
} else if (type === 'info') {
messageBox.classList.add('bg-blue-100', 'text-blue-700');
}
messageBox.classList.remove('hidden');
}

function clearPaymentMessage() {
document.getElementById('payment-message-box').classList.add('hidden');
}

// --- AUTHENTICATION LOGIC ---

const AUTH_ERROR_MESSAGES = {
    'invalid-credential': 'The email or password you entered is incorrect.',
    'wrong-password': 'The email or password you entered is incorrect.',
    'user-not-found': 'We couldn\'t find an account with that email address.',
    'invalid-email': 'Please enter a valid email address.',
    'missing-email': 'Please enter your email address.',
    'email-already-in-use': 'An account with this email already exists. Try logging in instead.',
    'weak-password': 'Your password must be at least 6 characters.',
    'popup-closed-by-user': 'The sign-in popup was closed before you finished. Please try again.',
    'popup-blocked': 'Your browser blocked the sign-in popup. Please allow popups and try again.',
    'network-request-failed': 'We couldn\'t reach the server. Check your internet connection and try again.',
    'too-many-requests': 'Too many attempts have been made. Please wait a moment and try again.',
    'user-disabled': 'This account has been disabled. Contact our support team for assistance.'
};

function extractAuthCode(error) {
    if (!error) return null;
    if (typeof error.code === 'string') {
        return error.code.startsWith('auth/') ? error.code.slice(5) : error.code;
    }
    if (typeof error.message === 'string') {
        const match = error.message.match(/auth\/([^)]+)/);
        if (match && match[1]) {
            return match[1];
        }
    }
    return null;
}

function formatAuthCodeToSentence(code) {
    if (!code) return '';
    const cleaned = code.replace(/-/g, ' ');
    return cleaned.charAt(0).toUpperCase() + cleaned.slice(1) + '.';
}

function getAuthErrorMessage(actionDescription, error) {
    const fallback = `We couldn't ${actionDescription}. Please try again.`;
    const code = extractAuthCode(error);
    if (!code) {
        return fallback;
    }
    const normalizedCode = code.toLowerCase();
    const friendly = AUTH_ERROR_MESSAGES[normalizedCode];
    if (friendly) {
        return `We couldn't ${actionDescription}. ${friendly}`;
    }
    return `We couldn't ${actionDescription}. ${formatAuthCodeToSentence(normalizedCode)}`;
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
}

function clearAuthMessage() {
    authMessage.classList.add('hidden');
    authMessage.textContent = '';
}

window.showLoginModal = function(initialTab = 'signup') {
    openModal('loginModal');
    clearAuthMessage();
    showTab(initialTab);
};

window.hideLoginModal = function() {
    closeModal('loginModal');
    document.getElementById('loginEmail').value = '';
    document.getElementById('loginPassword').value = '';
    clearAuthMessage();
    pendingShippingUnlock = false;
};

function showTab(tabName) {
    clearAuthMessage();

    loginTabBtn.classList.remove('border-indigo-600', 'text-indigo-600', 'border-transparent', 'text-gray-500');
    signupTabBtn.classList.remove('border-indigo-600', 'text-indigo-600', 'border-transparent', 'text-gray-500');

    if (tabName === 'login') {
        loginForm.classList.remove('hidden');
        signupForm.classList.add('hidden');
        loginTabBtn.classList.add('border-indigo-600', 'text-indigo-600');
        signupTabBtn.classList.add('border-transparent', 'text-gray-500');
    } else {
        signupForm.classList.remove('hidden');
        loginForm.classList.add('hidden');
        signupTabBtn.classList.add('border-indigo-600', 'text-indigo-600');
        loginTabBtn.classList.add('border-transparent', 'text-gray-500');
    }
}

function handleAuthSuccess(user) {
    currentUserId = user.uid;

    const existingInfo = loadStoredShippingInfo() || {};
    const updates = {};
    if (user.email) {
        const emailField = document.getElementById('email');
        if (emailField && !emailField.value) {
            emailField.value = user.email;
        }
        if (!existingInfo.email) {
            updates.email = user.email;
        }
    }

    if (user.displayName) {
        const nameField = document.getElementById('fullName');
        if (nameField && !nameField.value) {
            nameField.value = user.displayName;
        }
        if (!existingInfo.fullName) {
            updates.fullName = user.displayName;
        }
    }

    if (Object.keys(updates).length) {
        const mergedInfo = persistShippingInfo(updates);
        applyShippingInfo(mergedInfo, { overwriteExisting: false });
    } else {
        applyShippingInfo();
    }

    window.closeModal('loginModal');

    if (finalQuote > 0 && document.getElementById('pricing-input-section').classList.contains('hidden')) {
        window.updateOverview();
    }

    if (pendingShippingUnlock) {
        window.lockPriceAndProceed({ bypassAuthCheck: true });
    }
}

// Event Listeners for Login/Sign Up buttons (added in DOMContentLoaded listener below)

// --- CORE FLOW LOGIC ---

async function initializeAppAndLoadBrands() {
populateStateSelect();

// 1. Initial Anonymous Sign-in (Required for Firestore access)
try {
const userCredential = await signInAnonymously(auth);
currentUserId = userCredential.user.uid;
console.log("Firebase signed in anonymously for initial data loading.");
isAuthReady = true;
resetDeviceSelection();
} catch (error) {
console.error("Firebase anonymous authentication failed:", error);
showMessage("Authentication failed. Cannot load device data.", "Authentication Error");
}
}

/** Loads an image with fallbacks and updates the preview area. */
function loadImagePreview(imageUrl) {
if (!imageUrl) {
deviceImagePreviewDiv.classList.add('hidden');
return;
}

const baseSrc = imageUrl.substring(0, imageUrl.lastIndexOf('.'));
const extensions = ['.webp', '.avif', '.png', '.jpeg', '.jpg'];
let current = 0;

function tryLoad() {
if (current >= extensions.length) {
deviceImagePreviewDiv.classList.add('hidden');
console.log("Image load failed for all extensions.");
return;
}
const testSrc = baseSrc + extensions[current];
const img = new Image();
img.onload = () => {
devicePreviewImg.src = testSrc;
deviceImagePreviewDiv.classList.remove('hidden');
};
img.onerror = () => {
current++;
tryLoad();
};
img.src = testSrc;
}
tryLoad();
}

window.loadDevices = async function() {
const brand = document.getElementById('brand-select').value;
const deviceSelect = document.getElementById('device-select');

if (!brand) {
resetDeviceSelection();
return;
}

selectedBrand = brand;
deviceSelect.disabled = true;
deviceSelect.innerHTML = '<option value="">Fetching models...</option>';

// Hide preview when changing brands/models
deviceImagePreviewDiv.classList.add('hidden');

const modelsCollectionPath = `${devicesCollectionPath}/${brand}/models`;
const modelsColRef = collection(db, modelsCollectionPath);

try {
const modelsSnapshot = await getDocs(modelsColRef);

const devices = modelsSnapshot.docs.map(doc => ({
model: doc.id,
data: JSON.stringify(doc.data())
})).filter(d => d.model).sort((a, b) => a.model.localeCompare(b.model));

if (devices.length === 0) {
deviceSelect.innerHTML = '<option value="">No models found for this brand.</option>';
return;
}

deviceSelect.disabled = false;
deviceSelect.innerHTML = '<option value="">Choose a device...</option>' +
devices.map(device =>
`<option value="${device.model}" data-device-data='${device.data}'>${device.model.replace(/-/g, ' ').split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}</option>`
).join('');

} catch (e) {
console.error(`Error loading models for brand ${brand}:`, e);
showMessage(`Failed to load models for ${brand}. Check Firestore structure. Error: ${e.message}`, "Data Loading Error");
deviceSelect.innerHTML = '<option value="">Error loading devices</option>';
}
}

window.loadStorage = function() {
const select = document.getElementById('device-select');
const option = select.options[select.selectedIndex];

deviceData = null;

if (!option || !option.value) {
document.getElementById('storage-select').disabled = true;
deviceImagePreviewDiv.classList.add('hidden');
return;
}

selectedDevice = option.value;

const deviceDataString = option.getAttribute('data-device-data');
try {
deviceData = JSON.parse(deviceDataString);

// ** NEW: Load Image Preview **
if (deviceData.imageUrl) {
loadImagePreview(deviceData.imageUrl);
} else {
deviceImagePreviewDiv.classList.add('hidden');
}

} catch (e) {
console.error("Error parsing device data:", e);
showMessage("Could not parse pricing data for this device.", "Data Error");
return;
}

let storage = Object.keys(deviceData.prices || {});

if (storage.length === 0) {
showMessage("Pricing data is missing storage options for this device.", "Data Error");
storage = ['64GB', '128GB'];
}

const storageSelect = document.getElementById('storage-select');
storageSelect.disabled = false;
storageSelect.innerHTML = '<option value="">Select</option>' +
storage.map(s => `<option value="${s}">${s}</option>`).join('');

window.checkFullForm();
}

function resetDeviceSelection() {
const deviceSelect = document.getElementById('device-select');
const storageSelect = document.getElementById('storage-select');

deviceSelect.disabled = true;
deviceSelect.innerHTML = '<option value="">Choose a device...</option>';
storageSelect.disabled = true;
storageSelect.innerHTML = '<option value="">Select</option>';

selectedBrand = '';
selectedDevice = '';
deviceData = null;
conditions = { power: '', screen: '', cracks: '' };

document.querySelectorAll('.option-btn').forEach(btn => btn.classList.remove('selected'));
document.getElementById('placeholder-summary').classList.remove('hidden');
document.getElementById('price-summary').classList.add('hidden');
deviceImagePreviewDiv.classList.add('hidden');
}

window.selectOption = function(type, value) {
conditions[type] = value;

const container = document.getElementById(`${type}-options`);
if (container) {
container.querySelectorAll('.option-btn').forEach(btn => btn.classList.remove('selected'));
const selectedBtn = container.querySelector(`[onclick*="'${value}'"]`);
if (selectedBtn) {
selectedBtn.classList.add('selected');
}
}
window.checkFullForm();
}

window.checkFullForm = function() {
const storage = document.getElementById('storage-select').value;
const carrier = document.getElementById('carrier-select').value;
const calculateBtn = document.getElementById('calculatePriceBtn');

const isReady = selectedBrand && selectedDevice && deviceData && storage && carrier && conditions.power && conditions.screen && conditions.cracks;

if(isReady) {
calculateBtn.classList.remove('opacity-50', 'cursor-not-allowed');
calculateBtn.disabled = false;
} else {
calculateBtn.classList.add('opacity-50', 'cursor-not-allowed');
calculateBtn.disabled = true;
}
}

window.calculatePrice = function() {
const storage = document.getElementById('storage-select').value;
const carrier = document.getElementById('carrier-select').value;

if (!selectedBrand || !selectedDevice || !deviceData || !storage || !carrier || !conditions.power || !conditions.screen || !conditions.cracks) {
showMessage('Please make a selection for Brand, Device, Storage, Carrier, and all Condition questions to get a price.', "Required Fields");
return;
}

const q1PowerOn = conditions.power;
const q2Functional = conditions.screen;

let q3NoCracks = 'yes';
let q4Cosmetic = 'flawless';

switch (conditions.cracks) {
case 'flawless':
q3NoCracks = 'yes';
q4Cosmetic = 'flawless';
break;
case 'scratched':
q3NoCracks = 'yes';
q4Cosmetic = 'good';
break;
case 'damaged':
q3NoCracks = 'no';
q4Cosmetic = 'damaged';
break;
}

let selectedCarrierPricingKey = carrier;
if (['att', 'tmobile', 'verizon', 'other'].includes(carrier)) {
selectedCarrierPricingKey = 'locked';
} else if (carrier === 'unlocked') {
selectedCarrierPricingKey = 'unlocked';
}

const basePrices = deviceData.prices[storage]?.[selectedCarrierPricingKey];

if (!basePrices) {
showMessage(`Pricing data for ${storage} and ${carrier} is missing in Firebase.`, 'Data Error');
return;
}

let calculatedPrice = 0;
let conditionDescription = '';
let iconClass = 'fa-check-circle text-green-400';

if (q1PowerOn === 'yes') {
if (q2Functional === 'yes') {
if (q3NoCracks === 'yes') {
calculatedPrice = basePrices[q4Cosmetic] || 0;
conditionDescription = `Cosmetic: ${q4Cosmetic.charAt(0).toUpperCase() + q4Cosmetic.slice(1)}`;
iconClass = (q4Cosmetic === 'flawless') ? 'fa-star text-yellow-400' : 'fa-check-circle text-green-400';
} else {
calculatedPrice = basePrices.damaged || 0;
conditionDescription = 'Physical: Damaged (Screen OK, cracks allowed)';
iconClass = 'fa-exclamation-triangle text-red-400';
}
} else {
calculatedPrice = basePrices.broken || 0;
conditionDescription = 'Functional: Non-Functional/Defective';
iconClass = 'fa-tools text-orange-400';
}
} else {
calculatedPrice = basePrices.noPower || 0;
conditionDescription = 'Functional: Does Not Power On';
iconClass = 'fa-power-off text-red-400';
}

const basePrice = Math.max(0, calculatedPrice);
const promo = Math.floor(basePrice * 0.06);
finalQuote = basePrice + promo;

const displayedBrand = selectedBrand.charAt(0).toUpperCase() + selectedBrand.slice(1);
const displayedModel = selectedDevice.replace(/-/g, ' ').split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

document.getElementById('device-name').textContent = `${displayedBrand} ${displayedModel}`;
document.getElementById('device-specs').textContent = `${storage} | ${carrier.toUpperCase()}`;
document.getElementById('original-price').textContent = basePrice.toFixed(2);
document.getElementById('final-price').textContent = finalQuote.toFixed(2);

document.getElementById('condition-power').classList.toggle('hidden', conditions.power !== 'yes');
document.getElementById('condition-screen').classList.toggle('hidden', conditions.screen !== 'yes');

const cracksSummaryText = document.getElementById('cracks-summary-text');
const conditionCracksDiv = document.getElementById('condition-cracks');
conditionCracksDiv.classList.remove('hidden');
conditionCracksDiv.querySelector('i').className = `fas ${iconClass} mr-2`;
cracksSummaryText.textContent = conditionDescription;

document.getElementById('placeholder-summary').classList.add('hidden');
document.getElementById('price-summary').classList.remove('hidden');

document.getElementById('price-summary').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function proceedToShippingSection() {
    document.getElementById('pricing-input-section').classList.add('hidden');
    document.getElementById('calculatePriceBtn').classList.add('hidden');
    document.getElementById('quote-message-box').classList.add('hidden');

    const shippingSection = document.getElementById('shipping-details-section');
    shippingSection.classList.remove('hidden');

    const displayedBrand = selectedBrand.charAt(0).toUpperCase() + selectedBrand.slice(1);
    const displayedModel = selectedDevice.replace(/-/g, ' ').split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    const carrier = document.getElementById('carrier-select').value.toUpperCase();

    document.getElementById('overviewDevice').textContent = `${displayedBrand} ${displayedModel} - ${document.getElementById('storage-select').value}`;
    document.getElementById('overviewCarrier').textContent = carrier;
    document.getElementById('overviewQuote').textContent = `$${finalQuote.toFixed(2)}`;

    const storedInfo = loadStoredShippingInfo();
    if (storedInfo) {
        applyShippingInfo(storedInfo, { overwriteExisting: false });
    }

    if (auth.currentUser && auth.currentUser.email) {
        const emailField = document.getElementById('email');
        if (emailField && !emailField.value) {
            emailField.value = auth.currentUser.email;
        }
    }

    window.updateOverview();

    shippingSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

window.lockPriceAndProceed = function(options = {}) {
    const { bypassAuthCheck = false } = options;
    if (!bypassAuthCheck && (!auth.currentUser || auth.currentUser.isAnonymous)) {
        pendingShippingUnlock = true;
        window.showLoginModal();
        return;
    }

    pendingShippingUnlock = false;
    proceedToShippingSection();
};

window.continueAsGuest = function() {
    pendingShippingUnlock = false;
    window.hideLoginModal();
    window.lockPriceAndProceed({ bypassAuthCheck: true });
};

window.updateOverview = function() {
const shippingPreference = document.querySelector('input[name="shipping_preference"]:checked')?.value;

let displayShippingText = 'Not Selected';
if (shippingPreference === 'ship_kit') {
displayShippingText = 'Shipping Kit Requested';
} else if (shippingPreference === 'email_label') {
displayShippingText = 'Email Label Requested';
}
document.getElementById('overviewShippingPreference').textContent = displayShippingText;

const fullName = document.getElementById('fullName')?.value || '';
const streetAddress = document.getElementById('street-address')?.value || '';
const city = document.getElementById('city')?.value || '';
const state = document.getElementById('state')?.value || '';
const zipCode = document.getElementById('zip-code')?.value || '';

const address = [streetAddress, city, state, zipCode].filter(Boolean).join(', ');
document.getElementById('overviewAddress').textContent = (fullName && address) ? `${fullName}, ${address}` : 'Not Entered';
}

window.validateShippingAndOpenPayment = function() {
const shippingPref = document.querySelector('input[name="shipping_preference"]:checked');
const terms = document.getElementById('termsAccepted');
const requiredInputs = document.querySelectorAll('#shipping-address-card input[required], #shipping-address-card select[required]');
const messageBox = document.getElementById('quote-message-box');

document.querySelectorAll('.highlight-missing').forEach(el => el.classList.remove('highlight-missing'));
messageBox.classList.add('hidden');

let isFormValid = true;
let firstMissing = null;

// 1. Address and Contact Validation
requiredInputs.forEach(input => {
let isValid = true;
if (!input.value) {
isValid = false;
} else if (input.id === 'phone') {
const cleanedPhone = input.value.replace(/\D/g, '');
if (cleanedPhone.length !== 10) isValid = false;
}

if (!isValid) {
input.classList.add('highlight-missing');
isFormValid = false;
if (!firstMissing) firstMissing = input;
}
});

// 2. Shipping Preference Validation
if (!shippingPref) {
document.getElementById('shippingOptions').classList.add('highlight-missing');
isFormValid = false;
if (!firstMissing) firstMissing = document.getElementById('shippingOptions');
}

// 3. Terms Acceptance Validation
if (!terms.checked) {
document.querySelector('.custom-checkbox .checkmark').classList.add('highlight-missing');
isFormValid = false;
if (!firstMissing) firstMissing = terms;
}

if (!isFormValid) {
messageBox.textContent = 'Please fill out all required fields and accept the terms.';
messageBox.classList.remove('hidden');
messageBox.classList.add('bg-red-100', 'text-red-700');
if (firstMissing) firstMissing.scrollIntoView({ behavior: 'smooth', block: 'center' });
return;
}

const shippingInfo = {
fullName: document.getElementById('fullName').value,
email: document.getElementById('email').value,
phone: document.getElementById('phone').value,
streetAddress: document.getElementById('street-address').value,
city: document.getElementById('city').value,
state: document.getElementById('state').value,
zipCode: document.getElementById('zip-code').value,
shippingPreference: shippingPref.value
};
persistShippingInfo(shippingInfo);

// If validation passes, open payment modal
openModal('paymentModal');
clearPaymentMessage();
updatePaymentButtonState();
}

// --- Payment Modal Logic ---

function validatePaymentFields() {
const selectedMethod = document.querySelector('input[name="payment_method"]:checked')?.value;
let isComplete = false;

if (!selectedMethod) return false;

// Logic to determine if fields are filled and match
const fields = document.querySelectorAll(`#${selectedMethod}Fields input`);
isComplete = Array.from(fields).every(input => input.value && input.value.trim() !== '');

// Check for matching values
if (isComplete && fields.length === 2 && fields[0].value !== fields[1].value) {
isComplete = false;
}

return isComplete;
}

function updatePaymentButtonState() {
const submitBtn = document.getElementById('submitFinalOrderBtn');
const selectedMethod = document.querySelector('input[name="payment_method"]:checked');

// Hide all detail sections first
document.getElementById('venmoFields').classList.add('hidden');
document.getElementById('zelleFields').classList.add('hidden');
document.getElementById('paypalFields').classList.add('hidden');

if (selectedMethod) {
const method = selectedMethod.value;
document.getElementById(`${method}Fields`).classList.remove('hidden');
}

if (validatePaymentFields()) {
submitBtn.classList.remove('btn-disabled');
submitBtn.disabled = false;
submitBtn.classList.remove('bg-indigo-600');
submitBtn.classList.add('bg-green-600', 'hover:bg-green-700');
} else {
submitBtn.classList.add('btn-disabled');
submitBtn.disabled = true;
submitBtn.classList.remove('bg-green-600', 'hover:bg-green-700');
submitBtn.classList.add('bg-indigo-600', 'hover:bg-indigo-700');
}
// Clear all highlight errors in the modal when inputs change
document.querySelectorAll('#paymentModal input').forEach(input => input.classList.remove('highlight-missing'));
}

// Add listeners to payment radio buttons and inputs to update the state
document.querySelectorAll('input[name="payment_method"]').forEach(radio => {
radio.addEventListener('change', updatePaymentButtonState);
});
document.querySelectorAll('#paymentModal input').forEach(input => {
input.addEventListener('input', () => {
clearPaymentMessage();
updatePaymentButtonState();
});
});

window.submitFinalOrder = async function() {
const submitBtn = document.getElementById('submitFinalOrderBtn');
const messageBox = document.getElementById('payment-message-box');
clearPaymentMessage();

// 1. Re-validate payment fields
if (!validatePaymentFields()) {
showPaymentMessage('Please fill out all payment details and ensure they match.', 'error');
document.getElementById('paymentOptions').classList.add('highlight-missing');

const selectedMethod = document.querySelector('input[name="payment_method"]:checked')?.value;
if (selectedMethod) {
const fields = document.querySelectorAll(`#${selectedMethod}Fields input`);
Array.from(fields).forEach(input => {
if (!input.value || (fields.length === 2 && fields[0].value !== fields[1].value)) {
input.classList.add('highlight-missing');
}
});
}
return;
}

document.getElementById('paymentOptions').classList.remove('highlight-missing');
submitBtn.textContent = 'Submitting...';
submitBtn.classList.add('btn-disabled');

// --- 2. Construct Final Order Data ---
const selectedPayment = document.querySelector('input[name="payment_method"]:checked');
const phoneInput = document.getElementById('phone');

const orderData = {
device: document.getElementById('overviewDevice').textContent,
brand: selectedBrand,
modelSlug: selectedDevice,
carrier: document.getElementById('carrier-select').value,
storage: document.getElementById('storage-select').value,
condition_power_on: conditions.power,
condition_functional: conditions.screen,
condition_cosmetic: conditions.cracks, // 3-tier value: flawless, scratched, damaged
estimatedQuote: finalQuote,
shippingPreference: document.querySelector('input[name="shipping_preference"]:checked').value === 'ship_kit' ? 'Shipping Kit Requested' : 'Email Label Requested',
paymentMethod: selectedPayment.value,
paymentDetails: {},
shippingInfo: {
fullName: document.getElementById('fullName').value,
email: document.getElementById('email').value,
phone: phoneInput.value.replace(/\D/g, ''),
streetAddress: document.getElementById('street-address').value,
city: document.getElementById('city').value,
state: document.getElementById('state').value,
zipCode: document.getElementById('zip-code').value
},
termsAccepted: document.getElementById('termsAccepted').checked,
// Ensure we use the logged-in user ID if available, otherwise the anonymous ID
userId: auth.currentUser?.uid || currentUserId,
};

if (selectedPayment.value === 'venmo') {
orderData.paymentDetails.venmoUsername = document.getElementById('venmoUsername').value;
} else if (selectedPayment.value === 'zelle') {
orderData.paymentDetails.zelleIdentifier = document.getElementById('zelleIdentifier').value;
} else if (selectedPayment.value === 'paypal') {
orderData.paymentDetails.paypalEmail = document.getElementById('paypalEmail').value;
}

// --- 3. Send to Backend ---
try {
const response = await fetch(`${BACKEND_API_URL}/submit-order`, {
method: 'POST',
headers: {
'Content-Type': 'application/json',
},
body: JSON.stringify(orderData),
});

const result = await response.json();

if (!response.ok) {
throw new Error(result.error || 'Failed to submit order. Server responded with error.');
}

const orderId = result.orderId || 'N/A';

showPaymentMessage(`Order #${orderId} submitted successfully! You will receive an email confirmation shortly.`, 'success');

// --- 4. Success Handling and Redirect Simulation ---

setTimeout(() => {
closeModal('paymentModal');
showMessage(`Order #${orderId} submitted! Check the console for submission log.`, "Order Complete", "Success");
}, 3000);

submitBtn.textContent = 'Submitted!';
submitBtn.classList.remove('bg-green-600', 'hover:bg-green-700');
submitBtn.classList.add('btn-disabled');

} catch (e) {
console.error("Error submitting order: ", e);
const errorMessage = e.message.includes('Failed to fetch')
? 'Network Error: Could not connect to the backend server. Please check your deployment/network access.'
: `Submission failed: ${e.message}`;

showPaymentMessage(errorMessage, 'error');

submitBtn.textContent = 'Submit Order & Finalize Payout';
submitBtn.classList.remove('btn-disabled');
submitBtn.classList.add('bg-indigo-600', 'hover:bg-indigo-700');
submitBtn.disabled = false;
}
}

// Start the application process
initializeAppAndLoadBrands();

// --- DOMContentLoaded / Setup Listeners ---
document.addEventListener('DOMContentLoaded', () => {
// AUTH LISTENERS
const googleLoginBtn = document.getElementById('googleLoginBtn');
const googleSignupBtn = document.getElementById('googleSignupBtn');
const emailLoginBtn = document.getElementById('emailLoginBtn');
const emailSignupBtn = document.getElementById('emailSignupBtn');
const loginEmailInput = document.getElementById('loginEmail');
const loginPasswordInput = document.getElementById('loginPassword');
const signupNameInput = document.getElementById('signupName');
const signupEmailInput = document.getElementById('signupEmail');
const signupPasswordInput = document.getElementById('signupPassword');
const loginForm = document.getElementById('loginForm');
const signupForm = document.getElementById('signupForm');
const guestCheckoutBtn = document.getElementById('guestCheckoutBtn');

// Tab switching
loginTabBtn.addEventListener('click', () => showTab('login'));
signupTabBtn.addEventListener('click', () => showTab('signup'));

if (guestCheckoutBtn) {
guestCheckoutBtn.addEventListener('click', () => {
clearAuthMessage();
window.continueAsGuest();
});
}

// Google Sign-In
googleLoginBtn.addEventListener('click', async () => {
try {
clearAuthMessage();
showAuthMessage('Signing in with Google...', 'info');
const result = await signInWithPopup(auth, googleProvider);
handleAuthSuccess(result.user);
} catch (error) {
console.error("Google login error:", error);
showAuthMessage(getAuthErrorMessage('complete Google sign-in', error), 'error');
}
});

// Google Sign-Up
googleSignupBtn.addEventListener('click', async () => {
try {
clearAuthMessage();
showAuthMessage('Signing up with Google...', 'info');
const result = await signInWithPopup(auth, googleProvider);
handleAuthSuccess(result.user);
} catch (error) {
console.error("Google signup error:", error);
showAuthMessage(getAuthErrorMessage('complete Google sign-up', error), 'error');
}
});

// Email/Password Login
loginForm.addEventListener('submit', async (e) => {
e.preventDefault();
const email = loginEmailInput.value;
const password = loginPasswordInput.value;
try {
clearAuthMessage();
showAuthMessage('Logging in...', 'info');
const userCredential = await signInWithEmailAndPassword(auth, email, password);
handleAuthSuccess(userCredential.user);
} catch (error) {
console.error("Email login error:", error);
showAuthMessage(getAuthErrorMessage('log you in', error), 'error');
}
});

// Email/Password Sign Up
signupForm.addEventListener('submit', async (e) => {
e.preventDefault();
const name = signupNameInput.value;
const email = signupEmailInput.value;
const password = signupPasswordInput.value;

if (password.length < 6) {
showAuthMessage('Password must be at least 6 characters.', 'error');
return;
}

try {
clearAuthMessage();
showAuthMessage('Creating account...', 'info');
const userCredential = await createUserWithEmailAndPassword(auth, email, password);
await updateProfile(userCredential.user, {
displayName: name
});
handleAuthSuccess(userCredential.user);
} catch (error) {
console.error("Email signup error:", error);
showAuthMessage(getAuthErrorMessage('create your account', error), 'error');
}
});
});
