import { firebaseApp } from "/assets/js/firebase-app.js";
import { getAuth, onAuthStateChanged, signInAnonymously } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, doc, setDoc, onSnapshot, setLogLevel, collection, addDoc, runTransaction, getDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// --- Configuration and Constants ---
// NOTE: These are duplicated here for a self-contained page

// This is necessary for `doc(db, ...)` construction
const currentAppId = firebaseApp?.options?.projectId || 'buyback-a0f05';

let db, auth;
let userId = null;
let cart = []; // Global state for cart items

// --- DOM Elements ---
const mainContent = document.getElementById("mainContent");
const cartBadge = document.getElementById("cartBadge");
const cartPreviewList = document.getElementById("cartPreviewList");
const cartPreviewEmpty = document.getElementById("cartPreviewEmpty");
const toastContent = document.getElementById("toastContent");

const cartTableBody = document.getElementById("cartTableBody");
const emptyState = document.getElementById("emptyState");
const cartSection = document.getElementById("cartSection");
const summaryUnits = document.getElementById("summaryUnits");
const summaryOffer = document.getElementById("summaryOffer");
const submitOfferButton = document.getElementById("submitOffer");
const clearCartButton = document.getElementById("clearCart");
const notesField = document.getElementById("offerNotes");
const authRequiredNotice = document.getElementById("authRequiredNotice");

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
minimumFractionDigits: 2, // Cart page shows cents
maximumFractionDigits: 2
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
const initial = getInitial(user.email);
document.getElementById("accountInitial").textContent = initial;
document.getElementById("accountInitialClone").textContent = initial;
document.querySelector('[data-account-name]').textContent = user.displayName || 'Wholesale Buyer';
document.querySelector('[data-account-email]').textContent = user.email || 'Anonymous Session';
document.getElementById("currentUserId").textContent = user.uid.substring(0, 8) + '...';

// Set initial color based on auth state
const initialEl = document.getElementById("accountInitial");
if (user.isAnonymous) {
initialEl.classList.add('bg-slate-200', 'text-slate-500');
initialEl.classList.remove('bg-emerald-500', 'text-white');
} else {
initialEl.classList.add('bg-emerald-500', 'text-white');
initialEl.classList.remove('bg-slate-200', 'text-slate-500');
}
}

// --- Firestore References ---

function getCartDocRef() {
if (!db || !userId) return null;
// The path requested by the user: wholesaleusers/{userId}/cart/current
return doc(db, `wholesaleusers/${userId}/cart/current`);
}

function getOffersCollectionRef() {
if (!db || !userId) return null;
// The updated path requested by the user: wholesale/{userId}/offers
return collection(db, 'wholesale', userId, 'offers');
}

function getInventoryDocRef() {
if (!db) return null;
return doc(db, `wholesale/inventory`);
}

// --- Data Management (Firestore) ---

async function saveCart(currentCart) {
const ref = getCartDocRef();
if (!ref) {
console.error("Firestore not ready for cart save (No userId).");
showToast("Database not ready for cart save.", "rose");
return;
}
try {
// Save the full array of items
await setDoc(ref, { items: currentCart || [] });
// Note: The onSnapshot listener handles UI update and local cart state
} catch (error) {
console.error("Error saving cart:", error);
showToast("Failed to save cart to database.", "rose");
}
}

function clearCart() {
saveCart([]);
showToast("Cleared your cart.", "amber");
}

const generateOfferId = () => Math.random().toString(36).substring(2, 9).toUpperCase(); // Still useful for record ID simulation

async function updateStockInFirestore(updates) {
const inventoryRef = getInventoryDocRef();
if (!inventoryRef) return console.error("Inventory reference not ready.");

try {
// Use a transaction to safely update the nested stock quantity
await runTransaction(db, async (transaction) => {
const inventoryDoc = await transaction.get(inventoryRef);
if (!inventoryDoc.exists()) {
throw new Error("Inventory document does not exist!");
}

const inventoryData = inventoryDoc.data();
let updated = false;

updates.forEach(update => {
const { deviceId, storageVariant, grade, quantity } = update;
const deviceIndex = inventoryData.items.findIndex(d => d.id === deviceId);

if (deviceIndex !== -1) {
const storageIndex = inventoryData.items[deviceIndex].storages.findIndex(s => s.variant === storageVariant);
if (storageIndex !== -1) {
const currentStock = inventoryData.items[deviceIndex].storages[storageIndex].stock[grade];
if (currentStock >= quantity) {
inventoryData.items[deviceIndex].storages[storageIndex].stock[grade] = currentStock - quantity;
updated = true;
} else {
throw new Error(`Insufficient stock for ${deviceId} ${storageVariant} Grade ${grade}. Transaction aborted.`);
}
}
}
});

if (updated) {
// Write the entire modified inventory array back
transaction.set(inventoryRef, { items: inventoryData.items });
}
});
} catch (error) {
console.error("Stock Update Transaction failed: ", error);
throw new Error(`Stock reservation failed: ${error.message}`);
}
}

// --- UI Rendering ---

// Variables to restore focus after re-render (Focus Fix)
let focusedLineId = null;
let focusedField = null;
let focusedSelectionStart = 0;

// ** NEW: Function to update the header cart preview (was missing/incomplete) **
function updateCartPreviewUI() {
const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);

// 1. Update Badge
cartBadge.textContent = totalItems.toString();
cartBadge.classList.toggle("hidden", totalItems === 0);
cartBadge.classList.toggle("flex", totalItems > 0);

// 2. Update Preview List
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
// ** END NEW FUNCTION **

function updateCartUI() {
// Call the new preview function to update the header
updateCartPreviewUI();

const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);

// Save focus state before render (Focus Fix)
const activeElement = document.activeElement;
if (activeElement && (activeElement.dataset.quantityInput || activeElement.dataset.offerInput)) {
focusedLineId = activeElement.dataset.quantityInput || activeElement.dataset.offerInput;
focusedField = activeElement.dataset.quantityInput ? 'quantity' : 'offer';
focusedSelectionStart = activeElement.selectionStart;
} else {
focusedLineId = null;
}

// This is the cart page logic (full table view)
const hasItems = cart.length > 0;
emptyState.classList.toggle("hidden", hasItems);
cartSection.classList.toggle("hidden", !hasItems);

if (!hasItems) {
summaryUnits.textContent = "0";
summaryOffer.textContent = "$0.00";
submitOfferButton.disabled = true;
cartTableBody.innerHTML = "";
return;
}

cartTableBody.innerHTML = "";

cart.forEach((line) => {
// Ensure offerPrice is defined, defaulting to askingPrice if missing
if (typeof line.offerPrice === "undefined") {
line.offerPrice = line.askingPrice;
}
const row = document.createElement("tr");
row.dataset.lineId = line.lineId;

// Ensure number inputs reflect the capped values and current state
const quantity = Number(line.quantity) || 0;
const offerPrice = Number(line.offerPrice) || 0;

row.innerHTML = `
<td class="px-5 py-4">
<p class="font-semibold text-slate-900">${line.brand} ${line.model}</p>
<p class="text-xs uppercase tracking-[0.3em] text-slate-400 mt-1">${line.deviceId}</p>
</td>
<td class="px-5 py-4 text-sm text-slate-600">
<p class="font-medium text-slate-900">${line.storageVariant}</p>
<p class="text-xs uppercase tracking-[0.3em] text-slate-400 mt-1">Grade ${line.grade}</p>
</td>
<td class="px-5 py-4 text-sm text-slate-600">${line.available}</td>
<td class="px-5 py-4">
<input type="number" min="1" max="${line.available}" value="${quantity}" data-quantity-input="${line.lineId}" class="w-20 rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-emerald-400 focus:outline-none" />
</td>
<td class="px-5 py-4 text-sm text-slate-600">${formatCurrency(line.askingPrice)}</td>
<td class="px-5 py-4">
<!-- FIX: Changed type from "number" to "text" and added pattern for decimal currency input -->
<input
type="text"
min="0"
step="0.01"
value="${offerPrice}"
data-offer-input="${line.lineId}"
class="w-28 rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-emerald-400 focus:outline-none"
pattern="[0-9]*[.]?[0-9]*"
inputmode="decimal"
/>
</td>
<td class="px-5 py-4">
<button data-remove-line="${line.lineId}" class="text-sm font-semibold text-rose-500 transition hover:text-rose-600">Remove</button>
</td>
`;
cartTableBody.appendChild(row);
});

updateSummary();

// Restore focus state after render (Focus Fix)
if (focusedLineId) {
let selector = focusedField === 'quantity'
? `input[data-quantity-input="${focusedLineId}"]`
: `input[data-offer-input="${focusedLineId}"]`;
const inputToFocus = document.querySelector(selector);

if (inputToFocus) {
inputToFocus.focus();
inputToFocus.setSelectionRange(focusedSelectionStart, focusedSelectionStart);
}
// Reset tracker
focusedLineId = null;
}
}

function updateSummary() {
const units = cart.reduce((sum, line) => sum + (Number(line.quantity) || 0), 0);
const totalOffer = cart.reduce((sum, line) => {
const price = Number(line.offerPrice || 0);
return sum + price * (Number(line.quantity) || 0);
}, 0);
summaryUnits.textContent = units;
summaryOffer.textContent = formatCurrency(totalOffer);
submitOfferButton.disabled = units === 0;
}

// --- Event Handlers for Cart Table ---

cartTableBody.addEventListener("input", (event) => {
let itemUpdated = false;

// Handle Quantity Input (type="number")
const quantityInput = event.target.closest("input[data-quantity-input]");
if (quantityInput) {
const lineId = quantityInput.dataset.quantityInput;
const lineIndex = cart.findIndex((item) => item.lineId === lineId);
if (lineIndex === -1) return;

let nextQuantity = Number(quantityInput.value) || 0;

// Enforce min and max limits
const max = Number(quantityInput.max);
if (nextQuantity < 1) nextQuantity = 1;
if (nextQuantity > max) {
nextQuantity = max;
showToast(`Quantity capped at available stock: ${max}`, "amber");
}

// Update local state and UI
cart[lineIndex].quantity = nextQuantity;
quantityInput.value = nextQuantity;
itemUpdated = true;
}

// Handle Offer Price Input (type="text" for better cursor behavior)
const offerInput = event.target.closest("input[data-offer-input]");
if (offerInput) {
const lineId = offerInput.dataset.offerInput;
const lineIndex = cart.findIndex((item) => item.lineId === lineId);
if (lineIndex === -1) return;

// Use regex to sanitize input to ensure only numbers and a decimal point
let sanitizedValue = offerInput.value.replace(/[^0-9.]/g, '');

// Ensure only one decimal point
const parts = sanitizedValue.split('.');
if (parts.length > 2) {
sanitizedValue = parts[0] + '.' + parts.slice(1).join('');
}

// Update the input field with the sanitized value
offerInput.value = sanitizedValue;

const value = Number(sanitizedValue);
cart[lineIndex].offerPrice = Number.isNaN(value) ? 0 : value;
itemUpdated = true;
}

if(itemUpdated) {
saveCart(cart); // Save updated state to Firestore
updateSummary();
}
});

cartTableBody.addEventListener("click", (event) => {
const removeButton = event.target.closest("button[data-remove-line]");
if (removeButton) {
event.preventDefault();
const lineId = removeButton.dataset.removeLine;
// Update local state and save
const newCart = cart.filter((line) => line.lineId !== lineId);
cart = newCart; // Update global state immediately
saveCart(newCart);
showToast("Removed line from cart.", "amber");
}
});

clearCartButton.addEventListener("click", clearCart);

submitOfferButton.addEventListener("click", async () => {
if (!auth.currentUser || auth.currentUser.isAnonymous) {
showToast("Please sign in or register to submit a formal offer.", "rose");
return;
}

if (!cart.length) {
showToast("Your cart is empty.", "rose");
return;
}

const missingPrice = cart.some((line) => typeof line.offerPrice === "undefined" || Number.isNaN(Number(line.offerPrice)) || Number(line.offerPrice) <= 0);
if (missingPrice) {
showToast("Enter a valid offer price for each line.", "rose");
return;
}

const offersRef = getOffersCollectionRef();
if (!offersRef) {
showToast("Database error: Cannot reference offers collection. User ID is missing.", "rose");
return;
}

const offerId = generateOfferId();
const now = new Date().toISOString();

const offerItems = cart.map((line) => ({
lineId: line.lineId,
brand: line.brand,
model: line.model,
storageVariant: line.storageVariant, // Now includes color/GB
grade: line.grade,
quantity: line.quantity,
askingPrice: line.askingPrice,
offerPrice: Number(line.offerPrice || 0)
}));

// Prepare stock updates
const stockUpdates = offerItems.map(item => ({
deviceId: item.deviceId,
storageVariant: item.storageVariant,
grade: item.grade,
quantity: item.quantity
}));

// --- STOCK DECREMENTATION ON SUBMIT ---
try {
// 1. Attempt to reduce stock using a Firestore Transaction
// This correctly happens HERE, not on add to cart.
await updateStockInFirestore(stockUpdates);

// 2. If stock reduction is successful, submit the offer record
const offerRecord = {
id: offerId,
status: "pending",
createdAt: now,
updatedAt: now,
note: notesField.value.trim(),
buyer: {
uid: auth.currentUser.uid,
name: auth.currentUser.displayName || "Authenticated Buyer",
email: auth.currentUser.email || ""
},
items: offerItems,
history: [
{
status: "pending",
at: now
}
]
};

await addDoc(offersRef, offerRecord);

// 3. Clear cart and confirm success
clearCart(); // Clears cart in Firestore
notesField.value = "";
showToast("Offer submitted successfully and stock reserved. Track progress in My Account.");

} catch (error) {
console.error("Submission failed:", error);
// If the error is a stock reservation error, show the user the specific message
const displayMessage = error.message.includes("Stock reservation failed:")
? error.message
: "Failed to submit offer due to a database error. Please refresh and try again.";
showToast(displayMessage, "rose");
}
});

// Global Event Listeners (Cart & Account Dropdowns)
document.getElementById('cartButton').addEventListener('click', () => {
document.getElementById('cartPreview').classList.toggle('hidden');
});
document.querySelectorAll('[data-close-cart-preview]').forEach(btn => {
btn.addEventListener('click', () => {
document.getElementById('cartPreview').classList.add('hidden');
});
});
document.getElementById('accountButton').addEventListener('click', () => {
document.getElementById('accountDropdown').classList.toggle('hidden');
});
document.querySelector('[data-sign-out]').addEventListener('click', () => {
// Simple reload to clear session state for demo
window.location.reload();
});

// --- Firebase Auth & Listener Setup ---

onAuthStateChanged(auth, async (user) => {
if (user) {
userId = user.uid;
} else {
// Ensure a user (anonymous or otherwise) always exists for Firestore paths
try {
const anonUser = await signInAnonymously(auth);
userId = anonUser.user.uid;
} catch (e) {
console.error("Failed to sign in anonymously:", e);
return;
}
}

updateAccountUI(auth.currentUser);

// Show content once user ID is ready
mainContent.classList.add('ready');

// Set up Firestore listener
const cartRef = getCartDocRef();
if (cartRef) {
onSnapshot(cartRef, (docSnap) => {
if (docSnap.exists() && docSnap.data().items) {
cart = docSnap.data().items || [];
} else {
cart = [];
}
updateCartUI(); // Re-render the cart table and summary
}, (error) => {
console.error("Cart listener failed:", error);
showToast("Failed to load cart data from database.", "rose");
});
} else {
showToast("User ID not available to load cart.", "rose");
}

// Update auth notice visibility
const isAuth = user && !user.isAnonymous;
authRequiredNotice.classList.toggle("hidden", isAuth);
});
