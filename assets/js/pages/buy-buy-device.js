import { firebaseApp } from "/assets/js/firebase-app.js";
import {
getAuth,
signInAnonymously,
onAuthStateChanged,
signOut,
createUserWithEmailAndPassword,
signInWithEmailAndPassword,
GoogleAuthProvider,
signInWithPopup,
updateProfile
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, doc, setDoc, onSnapshot, setLogLevel } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// --- Configuration and Constants ---

const appId = firebaseApp?.options?.projectId || 'buyback-a0f05';
const GRADE_ORDER = ["A", "B", "C", "F"];
const GRADE_LABELS = {
A: "Grade A (Excellent)",
B: "Grade B (Good)",
C: "Grade C (Fair)",
F: "Grade F (Broken/Parts)"
};

let db, auth;
let userId = null;
let userEmail = "Anonymous";
let isAuthReady = false;
let inventoryState = []; // This will be populated by the Firestore listener or mock data
let cart = [];
let activeBrand = "all";
let currentAuthMode = 'signIn';
let searchTerm = "";

// --- Mock Inventory Data (Restored for initial load/fallback) ---
const MOCK_INVENTORY = [
{
id: "IP15PM", brand: "Apple", model: "iPhone 15 Pro Max", tagline: "High-demand flagships", image: "https://placehold.co/40x40/1f2937/ffffff?text=15PM",
storages: [
{ variant: "256GB (Natural Titanium)", color: "Natural Titanium", carrierLock: "Unlocked", stock: { A: 120, B: 80, C: 30, F: 10 }, asking: { A: 1050, B: 950, C: 800, F: 200 } },
{ variant: "256GB (Blue Titanium)", color: "Blue Titanium", carrierLock: "Unlocked", stock: { A: 90, B: 60, C: 20, F: 8 }, asking: { A: 1050, B: 950, C: 800, F: 200 } },
{ variant: "512GB (Black Titanium)", color: "Black Titanium", carrierLock: "AT&T Locked", stock: { A: 50, B: 25, C: 10, F: 5 }, asking: { A: 1150, B: 1050, C: 900, F: 250 } },
{ variant: "1TB (White Titanium)", color: "White Titanium", carrierLock: "Verizon Unlocked", stock: { A: 15, B: 5, C: 2, F: 0 }, asking: { A: 1250, B: 1150, C: 1000, F: 300 } }
]
},
{
id: "IP13", brand: "Apple", model: "iPhone 13", tagline: "Bulk quantity available", image: "https://placehold.co/40x40/1f2937/ffffff?text=13",
storages: [
{ variant: "128GB (Starlight)", color: "Starlight", carrierLock: "Unlocked", stock: { A: 200, B: 150, C: 80, F: 40 }, asking: { A: 450, B: 380, C: 300, F: 80 } },
{ variant: "128GB (Midnight)", color: "Midnight", carrierLock: "Unlocked", stock: { A: 180, B: 120, C: 70, F: 30 }, asking: { A: 450, B: 380, C: 300, F: 80 } },
{ variant: "256GB (Pink)", color: "Pink", carrierLock: "Locked (Various)", stock: { A: 100, B: 60, C: 30, F: 10 }, asking: { A: 400, B: 330, C: 250, F: 50 } }
]
},
{
id: "SSGS24U", brand: "Samsung", model: "Galaxy S24 Ultra", tagline: "Premium Android Stock", image: "https://placehold.co/40x40/0f4c81/ffffff?text=S24U",
storages: [
{ variant: "256GB (Phantom Black)", color: "Phantom Black", carrierLock: "T-Mobile Locked", stock: { A: 90, B: 60, C: 20, F: 8 }, asking: { A: 850, B: 750, C: 600, F: 150 } },
{ variant: "256GB (Titanium Gray)", color: "Titanium Gray", carrierLock: "T-Mobile Locked", stock: { A: 70, B: 50, C: 15, F: 5 }, asking: { A: 850, B: 750, C: 600, F: 150 } },
{ variant: "512GB (Titanium Violet)", color: "Titanium Violet", carrierLock: "Unlocked", stock: { A: 40, B: 15, C: 5, F: 1 }, asking: { A: 950, B: 850, C: 700, F: 200 } }
]
},
{
id: "SSGS21", brand: "Samsung", model: "Galaxy S21", tagline: "Previous generation", image: "https://placehold.co/40x40/0f4c81/ffffff?text=S21",
storages: [
{ variant: "128GB (White)", color: "White", carrierLock: "Unlocked", stock: { A: 150, B: 100, C: 50, F: 20 }, asking: { A: 300, B: 250, C: 200, F: 50 } }
]
}
];

// --- DOM Elements ---
const loadingOverlay = document.getElementById("loadingOverlay");
const mainContent = document.getElementById("mainContent");
const cartBadge = document.getElementById("cartBadge");
const cartPreviewList = document.getElementById("cartPreviewList");
const cartPreviewEmpty = document.getElementById("cartPreviewEmpty");
const brandFilters = document.getElementById("brandFilters");
const inventorySections = document.getElementById("inventorySections");
const toastContent = document.getElementById("toastContent");
const deviceSearchInput = document.getElementById("deviceSearch");

const appleDeviceList = document.getElementById("appleDeviceList");
const samsungDeviceList = document.getElementById("samsungDeviceList");
const otherDeviceList = document.getElementById("otherDeviceList");

const accountButton = document.getElementById("accountButton");
const accountDropdown = document.getElementById("accountDropdown");
const loggedInView = document.getElementById("loggedInView");
const loggedOutView = document.getElementById("loggedOutView");
const accountInitial = document.getElementById("accountInitial");
const accountInitialClone = document.getElementById("accountInitialClone");
const accountName = document.getElementById("accountName");
const accountEmail = document.getElementById("accountEmail");
const currentUserIdDisplay = document.getElementById("currentUserId");

// Auth Modal Elements (omitted for brevity)

// --- Firebase Initialization ---
try {
const app = firebaseApp;
db = getFirestore(app);
auth = getAuth(app);
setLogLevel('Debug');
} catch (e) {
console.error("Firebase initialization failed:", e);
}

// --- Utility Functions ---

const formatCurrency = (amount) => {
return new Intl.NumberFormat("en-US", {
style: "currency",
currency: "USD",
minimumFractionDigits: 0,
maximumFractionDigits: 0
}).format(amount);
};

function showToast(message, tone = "emerald") {
if (!toastContent) return;
clearTimeout(window.toastTimeout);
toastContent.textContent = message;
toastContent.className = `w-full max-w-xl rounded-3xl border px-4 py-3 text-sm shadow-lg ${
tone === "rose"
? "border-rose-200 bg-rose-50 text-rose-600"
: tone === "amber"
? "border-amber-200 bg-amber-50 text-amber-700"
: "border-emerald-200 bg-emerald-50 text-emerald-700"
}`;
toastContent.classList.remove("hidden");
window.toastTimeout = setTimeout(() => {
toastContent.classList.add("hidden");
}, 2800);
}

function getInitial(email) {
if (!email || email === 'Anonymous') return 'SC';
return email.charAt(0).toUpperCase();
}

function updateAccountUI(user) {
if (user && !user.isAnonymous) {
userId = user.uid;
userEmail = user.email || "Email/Google User";
const displayName = user.displayName || userEmail;
const initial = getInitial(user.email);

loggedInView.classList.remove('hidden');
loggedOutView.classList.add('hidden');

accountName.textContent = displayName;
accountEmail.textContent = userEmail;
accountInitial.textContent = initial;
accountInitialClone.textContent = initial;

accountButton.querySelector('span').classList.remove('bg-slate-200', 'text-slate-500');
accountButton.querySelector('span').classList.add('bg-emerald-500', 'text-white');

} else if (user && user.isAnonymous) {
userId = user.uid;
userEmail = "Anonymous Buyer";

loggedInView.classList.add('hidden');
loggedOutView.classList.remove('hidden');

accountInitial.textContent = 'SC';
accountInitial.classList.add('bg-slate-200', 'text-slate-500');
accountInitial.classList.remove('bg-emerald-500', 'text-white');

} else {
userId = null;
userEmail = "Not Authenticated";
loggedInView.classList.add('hidden');
loggedOutView.classList.remove('hidden');
}

currentUserIdDisplay.textContent = userId ? `${userId.substring(0, 8)}...` : 'N/A';
}

// Auth related functions (omitted for brevity)
function setAuthMode(mode) { /* ... */ }
function openAuthModal() { /* ... */ }
function closeAuthModal() { /* ... */ }
const signInUser = async (email, password) => { /* ... */ };
const signUpUser = async (email, password, displayName) => { /* ... */ };
const signInWithGoogle = async () => { /* ... */ };
const signOutUser = async () => { /* ... */ };

// Main Auth State Listener
onAuthStateChanged(auth, async (user) => {
if (!isAuthReady) {
if (!user) { await signInAnonymously(auth); }
isAuthReady = true;

updateAccountUI(auth.currentUser);
startListeners();

if (loadingOverlay) {
loadingOverlay.style.opacity = '0';
setTimeout(() => {
loadingOverlay.style.display = 'none';
mainContent.classList.add('ready');
}, 300);
}
} else {
updateAccountUI(user);
}
});

// --- Firestore References & Persistence ---
function getInventoryDocRef() {
if (!db) return null;
return doc(db, `wholesale/inventory`);
}

function getCartDocRef() {
if (!db || !userId) return null;
const currentUserId = auth.currentUser?.uid || userId;
return doc(db, `wholesaleusers/${currentUserId}/cart/current`);
}

async function saveCart(currentCart) {
const ref = getCartDocRef();
if (!ref) {
console.error("Firestore not ready for cart save (No userId).");
showToast("Database not ready for cart save.", "rose");
return;
}
try {
await setDoc(ref, { items: currentCart || [] });
console.log("Cart saved successfully.");
} catch (error) {
console.error("Error saving cart:", error);
showToast("Failed to save cart to database.", "rose");
}
}

function clearCart() {
saveCart([]);
showToast("Cleared all items from your cart.", "amber");
}

// --- Cart UI Logic ---
function updateCartUI() {
const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);

cartBadge.textContent = totalItems.toString();
cartBadge.classList.toggle("hidden", totalItems === 0);
cartBadge.classList.toggle("flex", totalItems > 0);

cartPreviewList.innerHTML = '';
if (cart.length === 0) {
cartPreviewEmpty.classList.remove('hidden');
} else {
cartPreviewEmpty.classList.add('hidden');
cart.slice(0, 3).forEach(item => {
const itemElement = document.createElement('div');
itemElement.className = 'flex items-center justify-between border-b border-slate-100 pb-2 last:border-b-0';
itemElement.innerHTML = `
<div>
<p class="text-sm font-medium text-slate-900">${item.brand} ${item.model}</p>
<p class="text-xs text-slate-500">${item.storageVariant} · Grade ${item.grade}</p>
</div>
<p class="text-sm font-semibold text-slate-700">x${item.quantity}</p>
`;
cartPreviewList.appendChild(itemElement);
});
if (cart.length > 3) {
const moreElement = document.createElement('p');
moreElement.className = 'text-center text-xs font-medium text-slate-400 pt-2';
moreElement.textContent = `...and ${cart.length - 3} more line items`;
cartPreviewList.appendChild(moreElement);
}
}
}

// --- Input Max Stock and Persistence Listeners ---

function attachInputListeners() {
document.querySelectorAll("input[data-grade-input]").forEach(input => {

// Enforce Max Stock (Client-side check on input event)
input.addEventListener('input', (event) => {
let value = Number(event.target.value);
const max = Number(event.target.max);
if (value > max) {
event.target.value = max;
showToast(`Quantity capped at available stock: ${max}`, "amber");
}
saveInputQuantity(event.target); // Save immediately on input
});

// Final save check on change (blur)
input.addEventListener('change', (event) => {
saveInputQuantity(event.target);
});
});
}

function getSessionKey(deviceId, storageVariant, grade) {
return `inventory-input-${deviceId}__${storageVariant}__${grade}`;
}

function loadSavedQuantity(deviceId, storageVariant, grade) {
const key = getSessionKey(deviceId, storageVariant, grade);
const savedValue = sessionStorage.getItem(key);
return savedValue !== null ? Number(savedValue) : '';
}

function saveInputQuantity(inputElement) {
const { deviceId, storage, grade, available } = inputElement.dataset;
let quantity = Number(inputElement.value) || 0;
const max = Number(available);

if (quantity > max) {
quantity = max;
inputElement.value = max;
}

const key = getSessionKey(deviceId, storage, grade);
if (quantity > 0) {
sessionStorage.setItem(key, quantity.toString());
} else {
sessionStorage.removeItem(key);
}
}

// --- Search Listener ---
deviceSearchInput.addEventListener('input', (event) => {
searchTerm = event.target.value.toLowerCase().trim();
renderInventory();
});

// --- Render Functions (Refactored for Brand Grouping and Styling) ---

function renderBrandFilters() {
const brands = ["all", ...Array.from(new Set(inventoryState.map((device) => device.brand)))].filter(b => b);
brandFilters.innerHTML = "";
if (brands.length <= 1 && inventoryState.length === 0) {
brandFilters.innerHTML = `
<span class="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Loading brands...</span>
`;
return;
}
brands.forEach((brand) => {
const button = document.createElement("button");
button.type = "button";
button.textContent = brand === "all" ? "All brands" : brand;
button.className = `rounded-full border px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] transition ${
activeBrand === brand
? "border-emerald-400 bg-emerald-500 text-white"
: "border-slate-300 text-slate-600 hover:border-emerald-300 hover:text-emerald-600"
}`;
button.addEventListener("click", () => {
activeBrand = brand;
renderBrandFilters();
renderInventory();
});
brandFilters.appendChild(button);
});
}

// --- Inner Function: Creates the Grade Input Cell (Matrix Cell) ---
function createGradeCell(device, storage, grade) {
const available = storage.stock?.[grade] || 0;
const asking = storage.asking?.[grade] || 0;
const savedQuantity = loadSavedQuantity(device.id, storage.variant, grade);

return `
<td class="w-1/4 align-top text-center">
<div class="space-y-1 grade-input-group">
<label class="block text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">${grade}</label>
<input
type="number"
min="0"
max="${available}"
value="${savedQuantity}"
data-grade-input
data-device-id="${device.id}"
data-brand="${device.brand}"
data-model="${device.model}"
data-storage="${storage.variant}"
data-grade="${grade}"
data-asking="${asking}"
data-available="${available}"
class="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm text-slate-900 focus:border-emerald-400 focus:outline-none"
placeholder="0"
/>
<p class="stock-ask-label mt-3">Stock:</p>
<p class="big-metric">${available}</p>
<p class="stock-ask-label mt-3">Ask:</p>
<p class="big-metric text-emerald-600">${formatCurrency(asking)}</p>
</div>
</td>
`;
}

// --- Core Function: Renders the Nested Accordion Inventory ---
function renderInventory() {
// Clear all device containers
appleDeviceList.innerHTML = "";
samsungDeviceList.innerHTML = "";
otherDeviceList.innerHTML = "";

let filtered = inventoryState;

// 1. Filter by Brand and Search Term
if (activeBrand !== "all") {
filtered = filtered.filter((device) => device.brand === activeBrand);
}
if (searchTerm) {
filtered = filtered.filter(device =>
device.model.toLowerCase().includes(searchTerm) ||
device.brand.toLowerCase().includes(searchTerm)
);
}

if (!filtered.length) {
if (inventoryState.length > 0) {
inventorySections.innerHTML = `
<div class="rounded-3xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center text-sm text-slate-500">
No inventory matches your current filters.
</div>
`;
}
return;
}

const deviceMap = {
"Apple": appleDeviceList,
"Samsung": samsungDeviceList
};

// Re-render the section headers (in case they were hidden by a filter)
document.getElementById("appleInventory").style.display = (activeBrand === 'all' || activeBrand === 'Apple') ? 'block' : 'none';
document.getElementById("samsungInventory").style.display = (activeBrand === 'all' || activeBrand === 'Samsung') ? 'block' : 'none';
document.getElementById("otherInventory").style.display = activeBrand === 'all' ? 'block' : 'none';

filtered.forEach((device) => {
const targetList = deviceMap[device.brand] || otherDeviceList;

// Level 1: Device Model Accordion
const deviceDetails = document.createElement("details");
deviceDetails.className = "device-model-details shadow-lg";
deviceDetails.id = `device-${device.id}`;

// Level 1: Summary (Device Model Header)
deviceDetails.innerHTML = `
<summary class="device-model-summary flex items-center justify-between gap-4">
<div class="flex items-center gap-4">
${device.image
? `<img src="${device.image}" alt="${device.model}" class="h-10 w-10 rounded-full border border-slate-200 bg-white object-contain p-1" onerror="this.onerror=null; this.src='https://placehold.co/40x40/e2e8f0/475569?text=IMG'" />`
: `<div class="h-10 w-10 rounded-full border border-slate-200 bg-slate-100 flex items-center justify-center text-sm font-semibold text-slate-500">SC</div>`}
<div>
<p class="text-xs font-semibold uppercase tracking-[0.3em] text-emerald-600">${device.brand}</p>
<h4 class="text-xl font-semibold text-slate-900">${device.model}</h4>
</div>
</div>
<i class="fa-solid fa-chevron-down text-slate-400 transition group-open:rotate-180"></i>
</summary>
`;

// Content container for Level 2 Accordions and Action Button
const contentContainer = document.createElement('div');
contentContainer.className = "border-slate-300 rounded-b-xl overflow-hidden";

// Level 2: Storage Variant Accordions
device.storages.forEach((storage) => {
const storageDetails = document.createElement("details");
storageDetails.className = "storage-variant-details";

// Locked/Unlocked Status Badge
const lockStatus = storage.carrierLock;
const isUnlocked = lockStatus && lockStatus.toLowerCase().includes('unlocked');
const statusClass = isUnlocked
? 'bg-green-100 text-green-700'
: 'bg-red-100 text-red-700';

// Level 2: Summary (Storage Variant Header)
storageDetails.innerHTML = `
<summary class="storage-variant-summary">
<div class="flex items-center gap-4">
<p class="text-base font-semibold text-slate-900">${storage.variant}</p>
<span class="rounded-full px-3 py-1 text-xs font-medium ${statusClass}">
${lockStatus}
</span>
</div>
<i class="fa-solid fa-chevron-right text-slate-400 transition storage-variant-details-icon"></i>
</summary>
`;

// Level 2: Matrix Content (The actual table)
const matrixDiv = document.createElement("div");
matrixDiv.className = "inventory-table-container bg-white p-4";
matrixDiv.innerHTML = `
<table class="min-w-full text-left text-sm inventory-matrix-table">
<thead>
<tr>
${GRADE_ORDER.map((grade) => `<th class="w-1/4">${grade}</th>`).join("")}
</tr>
</thead>
<tbody>
<tr>
${GRADE_ORDER.map((grade) => createGradeCell(device, storage, grade)).join("")}
</tr>
</tbody>
</table>
`;
storageDetails.appendChild(matrixDiv);
contentContainer.appendChild(storageDetails);
});

// Action Row (Applies to all selections made under this model)
const actionRow = document.createElement("div");
actionRow.className = "flex items-center justify-end px-4 py-4 bg-slate-50 border-t border-slate-200";
actionRow.innerHTML = `
<button
type="button"
class="rounded-full bg-emerald-500 px-5 py-3 text-xs font-semibold uppercase tracking-[0.3em] text-white shadow-lg shadow-emerald-200/60 transition hover:bg-emerald-400"
data-add-device="${device.id}"
>
Add selections to cart
</button>
`;
contentContainer.appendChild(actionRow);

deviceDetails.appendChild(contentContainer);
targetList.appendChild(deviceDetails);
});

// Attach listeners after all inputs are rendered
attachInputListeners();
}

// --- Event Handlers ---

function addSelectionsToCart(button) {
const deviceDetails = button.closest("details.device-model-details");
if (!deviceDetails) return;

const inputs = Array.from(deviceDetails.querySelectorAll("input[data-grade-input]"));

// 1. Gather Selections and Check Validity
const selections = inputs
.map((input) => ({
quantity: Number(input.value),
grade: input.dataset.grade,
available: Number(input.dataset.available),
askingPrice: Number(input.dataset.asking),
deviceId: input.dataset.deviceId,
brand: input.dataset.brand,
model: input.dataset.model,
storageVariant: input.dataset.storage // Includes color and GB
}))
.filter((line) => line.quantity > 0);

if (!selections.length) {
showToast("Select at least one quantity before adding to cart.", "rose");
return;
}

let newCart = [...cart];

// 2. Update Cart State (NO stock decrement here)
selections.forEach((line) => {
const cappedQuantity = Math.min(line.quantity, line.available);
const lineId = `${line.deviceId}__${line.storageVariant}__${line.grade}`;
const existingIndex = newCart.findIndex((item) => item.lineId === lineId);

if (cappedQuantity > 0) {
if (existingIndex >= 0) {
// Update existing item: cap the new total quantity at available stock
newCart[existingIndex].quantity = Math.min(
newCart[existingIndex].quantity + cappedQuantity,
line.available
);
} else {
// Add new item
newCart.push({
lineId,
deviceId: line.deviceId,
brand: line.brand,
model: line.model,
storageVariant: line.storageVariant,
grade: line.grade,
quantity: cappedQuantity,
available: line.available,
askingPrice: line.askingPrice,
});
}
}
});

// 3. Save Cart State (Local/Firestore Cart Document)
saveCart(newCart);

// 4. Clear Local Inputs (Session Storage & UI)
inputs.forEach((input) => {
input.value = "";
const { deviceId, storage, grade } = input.dataset;
sessionStorage.removeItem(getSessionKey(deviceId, storage, grade));
});

showToast("Added selections to your cart. Stock will be reserved upon final offer submission.");
}

// Global delegate listener for "Add to Cart"
inventorySections.addEventListener("click", (event) => {
const button = event.target.closest("button[data-add-device]");
if (button) {
addSelectionsToCart(button);
}
});

// Global Event Listeners (Cart & Account Dropdowns - same as before)
document.getElementById('cartButton').addEventListener('click', () => {
document.getElementById('cartPreview').classList.toggle('hidden');
});
document.querySelectorAll('[data-close-cart-preview]').forEach(btn => {
btn.addEventListener('click', () => {
document.getElementById('cartPreview').classList.add('hidden');
});
});

accountButton.addEventListener('click', () => {
accountDropdown.classList.toggle('hidden');
});

document.querySelector('#accountDropdown').addEventListener('click', (event) => {
// ... (auth logic)
});

// --- Firestore Listeners ---

function startListeners() {
if (!isAuthReady || !db) return;

// 1. Inventory Listener (Read-Only)
onSnapshot(getInventoryDocRef(), (docSnap) => {
if (docSnap.exists() && docSnap.data().items) {
inventoryState = docSnap.data().items || [];
} else {
inventoryState = MOCK_INVENTORY;
// When the Firestore doc is empty/missing, initialize it with mock data (one time)
if (!docSnap.exists() && auth.currentUser && !auth.currentUser.isAnonymous) {
setDoc(getInventoryDocRef(), { items: MOCK_INVENTORY }).catch(e => console.error("Failed to initialize inventory:", e));
}
console.warn("Inventory document not found or empty. Using mock data.");
}
renderBrandFilters();
renderInventory();
}, (error) => {
console.error("Inventory listener failed:", error);
inventoryState = MOCK_INVENTORY;
renderBrandFilters();
renderInventory();
showToast("Failed to load live inventory data. Displaying cached/mock data.", "rose");
});

// 2. Cart Listener (Read/Write) - Handles Real-time Cart Update
onSnapshot(getCartDocRef(), (docSnap) => {
if (docSnap.exists() && docSnap.data().items) {
cart = docSnap.data().items || [];
} else {
cart = [];
}
updateCartUI();
}, (error) => {
console.error("Cart listener failed:", error);
showToast("Failed to load cart data from database.", "rose");
});
}
