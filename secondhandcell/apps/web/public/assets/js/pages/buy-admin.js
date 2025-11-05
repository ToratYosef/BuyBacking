import { firebaseApp } from "/assets/js/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import {
getFirestore,
doc,
setDoc,
onSnapshot,
collection,
updateDoc,
setLogLevel,
collectionGroup, // New import for Collection Group Query
query
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// --- Firebase Configuration and Setup ---

// This is a simplified default inventory for initialization
const DEFAULT_INVENTORY_ITEMS = [
{
id: "apple-iphone-15",
brand: "Apple",
model: "iPhone 15",
tagline: "Latest model, pristine stock",
image: "https://placehold.co/100x100/10b981/ffffff?text=i15",
storages: [
{ variant: "128GB", stock: { A: 50, B: 20, C: 5, F: 1 }, asking: { A: 650, B: 580, C: 450, F: 100 } },
{ variant: "256GB", stock: { A: 30, B: 15, C: 3, F: 0 }, asking: { A: 700, B: 630, C: 500, F: 120 } }
]
},
{
id: "samsung-s23",
brand: "Samsung",
model: "Galaxy S23",
tagline: "Tested units, ready to ship",
image: "https://placehold.co/100x100/3b82f6/ffffff?text=S23",
storages: [
{ variant: "128GB", stock: { A: 40, B: 25, C: 10, F: 2 }, asking: { A: 450, B: 380, C: 250, F: 80 } }
]
}
];

let db, auth;
let userId = null;
let isAuthReady = false;

try {
const app = firebaseApp;
db = getFirestore(app);
auth = getAuth(app);
setLogLevel('Debug');
} catch (e) {
console.error("Firebase initialization failed:", e);
}

const loadingOverlay = document.getElementById("loadingOverlay");
const mainContent = document.getElementById("mainContent");

onAuthStateChanged(auth, async (user) => {
if (user) {
userId = user.uid;
} else {
// Admin Console should always sign in anonymously for database access if no auth is provided
await signInAnonymously(auth);
}
isAuthReady = true;
if (loadingOverlay) {
loadingOverlay.style.opacity = '0';
setTimeout(() => {
loadingOverlay.style.display = 'none';
mainContent.classList.add('ready');
}, 300);
}
startListeners();
});

// --- Constants and Utility Functions ---
const GRADE_ORDER = ["A", "B", "C", "F"];
const GRADE_LABELS = { A: "Grade A", B: "Grade B", C: "Grade C", F: "Grade F" };
const INVENTORY_DOC_PATH = "inventory";
// Offers collection path is now assumed to be user-specific subcollections: wholesale/{userId}/offers
const OFFERS_COLLECTION_NAME = "offers";

const formatCurrency = (amount) => {
return new Intl.NumberFormat("en-US", {
style: "currency",
currency: "USD",
minimumFractionDigits: 0,
maximumFractionDigits: 0
}).format(amount);
};
const summarizeOffer = (offer) => {
const units = offer.items.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);
const total = offer.items.reduce((sum, item) => {
let price = item.offerPrice;
if (offer.counter?.items?.[item.lineId]) {
price = offer.counter.items[item.lineId];
}
return sum + (Number(price) || 0) * (Number(item.quantity) || 0);
}, 0);
return { units, total };
};

// --- State and DOM Elements ---
const toastContent = document.getElementById("toastContent");
const metricCards = document.getElementById("metricCards");
const offerFilters = document.getElementById("offerFilters");
const offerList = document.getElementById("offerList");
const emptyOffers = document.getElementById("emptyOffers");
const inventoryTable = document.getElementById("inventoryTable");
const resetInventoryButton = document.getElementById("resetInventory");
const addDeviceForm = document.getElementById("addDeviceForm");
const inventoryUploadInput = document.getElementById("inventoryUpload");
const importInventoryButton = document.getElementById("importInventoryButton");
const refreshInventoryButton = document.getElementById("refreshInventoryButton");

// Global State
let inventoryState = [];
let allOffers = [];
let activeOfferFilter = "all";

// --- Firestore References & Persistence ---
function getInventoryDocRef() {
if (!db) return null;
return doc(db, `wholesale/${INVENTORY_DOC_PATH}`);
}

function getOffersQuery() {
if (!db) return null;
// Using collectionGroup to query all 'offers' subcollections across the database,
// which matches the wholesale/{userId}/offers structure.
// NOTE: This requires a composite index in Firestore for collection group 'offers'.
return query(collectionGroup(db, OFFERS_COLLECTION_NAME));
}

async function setInventory(data) {
const ref = getInventoryDocRef();
if (!ref) {
showToast("DB not ready.", "rose");
return;
}
try {
await setDoc(ref, { items: data || [] });
showToast("Inventory updated in Firestore.");
} catch (error) {
console.error("Error setting inventory:", error);
showToast("Failed to save inventory to Firestore.", "rose");
}
}

async function updateOffer(docId, updateData) {
// Because we are using Collection Group, we need the full path reference for updateDoc.
// This is complex in the Admin UI context as we only have docId.
// We must find the full path from the cached 'allOffers' data, which contains the offer data itself.
const offerToUpdate = allOffers.find(o => o.docId === docId);

if (!offerToUpdate || !offerToUpdate.buyer?.uid) {
console.error("Cannot find full offer path for update. Missing buyer UID.");
showToast("Error updating offer: Missing buyer data.", "rose");
return;
}

try {
// Construct the full document reference using the known collection name and buyer UID
const offerRef = doc(db, 'wholesale', offerToUpdate.buyer.uid, OFFERS_COLLECTION_NAME, docId);
await updateDoc(offerRef, updateData);
showToast("Offer status synced to Firestore.");
} catch (error) {
console.error("Error updating offer:", error);
showToast("Failed to update offer in Firestore.", "rose");
}
}

async function resetInventoryToDefault() {
const ref = getInventoryDocRef();
if (!ref) return;
try {
await setDoc(ref, { items: DEFAULT_INVENTORY_ITEMS });
showToast("Inventory reset to default values in Firestore.", "amber");
} catch (error) {
console.error("Error resetting inventory:", error);
showToast("Failed to reset inventory.", "rose");
}
}

// --- UI Logic ---

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

function renderMetrics() {
const offers = allOffers;
const pending = offers.filter((offer) => offer.status === "pending").length;
const counter = offers.filter((offer) => offer.status === "counter" || offer.status === "declined").length;
const completed = offers.filter((offer) => offer.status === "completed").length;
const units = offers.reduce((sum, offer) => sum + offer.items.reduce((lineSum, item) => lineSum + (Number(item.quantity) || 0), 0), 0);

const totalValue = offers.reduce((sum, offer) => sum + summarizeOffer(offer).total, 0);

const cards = [
{ label: "Total offers", value: offers.length.toString(), tone: "text-slate-900" },
{ label: "Pending review", value: pending.toString(), tone: "text-amber-600" },
{ label: "Counters / declines", value: counter.toString(), tone: "text-sky-600" },
{ label: "Total units", value: units.toString(), tone: "text-slate-900" },
{ label: "Total offer value", value: formatCurrency(totalValue), tone: "text-emerald-600" }
];

metricCards.innerHTML = "";
cards.forEach((card) => {
const wrapper = document.createElement("div");
wrapper.className = "rounded-3xl border border-slate-200 bg-white p-6 shadow-sm";
wrapper.innerHTML = `
<p class="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">${card.label}</p>
<p class="mt-2 text-3xl font-semibold ${card.tone}">${card.value}</p>
`;
metricCards.appendChild(wrapper);
});
}

function renderOfferFilters() {
offerFilters.innerHTML = "";
const statusFilters = [
{ id: "all", label: "All" },
{ id: "pending", label: "Pending" },
{ id: "counter", label: "Counter" },
{ id: "accepted", label: "Accepted" },
{ id: "declined", label: "Declined" },
{ id: "completed", label: "Completed" }
];
statusFilters.forEach((status) => {
const button = document.createElement("button");
button.type = "button";
button.dataset.filter = status.id;
button.textContent = status.label;
button.className = `rounded-full border px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] transition ${
activeOfferFilter === status.id
? "border-emerald-400 bg-emerald-500 text-white"
: "border-slate-300 text-slate-600 hover:border-emerald-300 hover:text-emerald-600"
}`;
offerFilters.appendChild(button);
});
}

function statusBadge(status) {
const tones = {
pending: "bg-amber-100 text-amber-700 border-amber-200",
counter: "bg-sky-100 text-sky-700 border-sky-200",
declined: "bg-rose-100 text-rose-700 border-rose-200",
accepted: "bg-emerald-100 text-emerald-700 border-emerald-200",
completed: "bg-slate-900 text-white border-slate-900"
};
const classes = tones[status] || "bg-slate-100 text-slate-600 border-slate-200";
return `<span class="inline-flex items-center gap-2 rounded-full border ${classes} px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.3em]">${status}</span>`;
}

function renderOfferCards() {
const filtered = activeOfferFilter === "all" ? allOffers : allOffers.filter((offer) => offer.status === activeOfferFilter);
offerList.innerHTML = "";

filtered.forEach((offer) => {
const card = document.createElement("article");
card.className = "flex flex-col gap-5 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm";
card.dataset.offerDocId = offer.docId; // Use Firestore document ID
const submitted = offer.createdAt ? new Date(offer.createdAt).toLocaleString() : "—";
const updated = offer.updatedAt ? new Date(offer.updatedAt).toLocaleString() : submitted;
const { units, total } = summarizeOffer(offer);

// Determine the current counter prices for pre-filling inputs
const currentCounterValues = {};
if (offer.counter?.items) {
Object.entries(offer.counter.items).forEach(([lineId, price]) => {
currentCounterValues[lineId] = price;
});
}

card.innerHTML = `
<div class="flex flex-wrap items-center justify-between gap-3">
<div>
<p class="text-xs uppercase tracking-[0.3em] text-slate-400">${offer.buyer?.email || "Anonymous"}</p>
<p class="text-sm font-semibold text-slate-900">Buyer ID: ${offer.buyer?.uid.substring(0, 8) || "N/A"}</p>
</div>
${statusBadge(offer.status)}
</div>
<div class="grid gap-3 text-xs text-slate-500">
<p>Submitted: <span class="font-semibold text-slate-900">${submitted}</span></p>
<p>Last update: <span class="font-semibold text-slate-900">${updated}</span></p>
<p>Units: <span class="font-semibold text-slate-900">${units}</span></p>
<p>Current Total: <span class="font-semibold text-emerald-600">${formatCurrency(total)}</span></p>
</div>
<div class="overflow-hidden rounded-2xl border border-slate-200">
<table class="min-w-full divide-y divide-slate-200 text-left text-sm">
<thead class="bg-slate-50 text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
<tr>
<th class="px-4 py-3">Device</th>
<th class="px-4 py-3">Qty</th>
<th class="px-4 py-3">Offer</th>
<th class="px-4 py-3">Counter</th>
</tr>
</thead>
<tbody class="divide-y divide-slate-100 bg-white">
${offer.items
.map((item) => {
const counterPrice = currentCounterValues[item.lineId] ?? "";
return `
<tr>
<td class="px-4 py-3">
<p class="font-semibold text-slate-900">${item.brand} ${item.model}</p>
<p class="text-xs uppercase tracking-[0.3em] text-slate-400">${item.storageVariant} · Grade ${item.grade}</p>
</td>
<td class="px-4 py-3 text-sm text-slate-600">${item.quantity}</td>
<td class="px-4 py-3 text-sm text-slate-600">${formatCurrency(item.offerPrice)}</td>
<td class="px-4 py-3 text-sm text-slate-600">
<input type="number" min="0" step="0.01" value="${counterPrice}" data-counter-price="${item.lineId}" class="w-24 rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-emerald-400 focus:outline-none" />
</td>
</tr>
`;
})
.join("")}
</tbody>
</table>
</div>
<div class="grid gap-3 text-sm text-slate-600">
${offer.note ? `<p class="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm text-slate-700">Buyer note: ${offer.note}</p>` : ""}
<label class="font-medium text-slate-700">Status
<select data-offer-status class="mt-2 w-full rounded-2xl border border-slate-300 px-4 py-3 text-slate-900 focus:border-emerald-400 focus:outline-none">
${["pending", "counter", "accepted", "declined", "completed"]
.map((option) => `<option value="${option}" ${offer.status === option ? "selected" : ""}>${option.charAt(0).toUpperCase() + option.slice(1)}</option>`)
.join("")}
</select>
</label>
<label class="font-medium text-slate-700">Admin note / counter note
<textarea data-offer-note rows="3" class="mt-2 w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm text-slate-900 focus:border-emerald-400 focus:outline-none" placeholder="Share counters, decline reasons, or shipping instructions.">${offer.counter?.note || ""}</textarea>
</label>
</div>
<div class="flex flex-wrap items-center gap-3">
<button data-save-offer class="rounded-full bg-emerald-500 px-5 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-white shadow-sm transition hover:bg-emerald-400">Save changes</button>
<button data-accept-offer class="rounded-full border border-emerald-300 px-5 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-emerald-600 transition hover:bg-emerald-50">Mark accepted</button>
<button data-decline-offer class="rounded-full border border-rose-300 px-5 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-rose-500 transition hover:bg-rose-50">Decline</button>
</div>
`;
offerList.appendChild(card);
});
emptyOffers.classList.toggle("hidden", filtered.length > 0);
}

function renderInventoryTable() {
inventoryTable.innerHTML = "";
inventoryState.forEach((device) => {
device.storages.forEach((storage) => {
GRADE_ORDER.forEach((grade) => {
const row = document.createElement("tr");
row.dataset.deviceId = device.id;
row.dataset.storageVariant = storage.variant;
row.dataset.grade = grade;

const stock = storage.stock?.[grade] ?? 0;
const price = storage.asking?.[grade] ?? 0;

row.innerHTML = `
<td class="px-5 py-4">
<p class="font-semibold text-slate-900">${device.brand} ${device.model}</p>
<p class="text-xs uppercase tracking-[0.3em] text-slate-400">${device.tagline || ""}</p>
</td>
<td class="px-5 py-4 text-sm text-slate-600">${storage.variant}</td>
<td class="px-5 py-4 text-sm text-slate-600">${GRADE_LABELS[grade]}</td>
<td class="px-5 py-4">
<input type="number" min="0" value="${stock}" data-stock-input class="w-24 rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-emerald-400 focus:outline-none" />
</td>
<td class="px-5 py-4">
<input type="number" min="0" step="0.01" value="${price}" data-price-input class="w-28 rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-emerald-400 focus:outline-none" />
</td>
<td class="px-5 py-4">
<button data-save-inventory class="text-sm font-semibold text-emerald-600 transition hover:text-emerald-700">Update</button>
</td>
`;
inventoryTable.appendChild(row);
});
});
});
}

// --- Event Handlers and Listeners ---

offerFilters.addEventListener("click", (event) => {
const button = event.target.closest("button[data-filter]");
if (!button) return;
activeOfferFilter = button.dataset.filter;
renderOfferFilters();
renderOfferCards();
});

offerList.addEventListener("click", (event) => {
const card = event.target.closest("article[data-offer-doc-id]");
if (!card) return;
const offerDocId = card.dataset.offerDocId;

const offerIndex = allOffers.findIndex(o => o.docId === offerDocId);
if (offerIndex === -1) return;
const originalOffer = allOffers[offerIndex];

// Function to gather current UI state
const getCurrentUiUpdate = (requestedStatus = originalOffer.status) => {
const noteField = card.querySelector("[data-offer-note]");
const counterInputs = card.querySelectorAll("[data-counter-price]");
const note = noteField.value.trim();

const counterValues = {};
counterInputs.forEach((input) => {
const value = Number(input.value);
if (!Number.isNaN(value) && value > 0) {
counterValues[input.dataset.counterPrice] = value;
}
});

const mapItemsWithCounterPricing = (overrides) => {
const lines = Array.isArray(originalOffer.items) ? originalOffer.items : [];
return lines.map((item) => {
const override = overrides[item.lineId];
const updated = { ...item };

if (override !== undefined) {
updated.counterPrice = override;
} else if ("counterPrice" in updated) {
delete updated.counterPrice;
}

return updated;
});
};

const now = new Date().toISOString();
const update = {
updatedAt: now,
};

let nextStatus = requestedStatus;

// History Update
const newHistory = [...(originalOffer.history || [{ status: originalOffer.status, at: originalOffer.createdAt }])];

const hasCounterValues = Object.keys(counterValues).length > 0;
if (hasCounterValues) {
nextStatus = "counter";
update.counter = {
note,
items: counterValues,
};
update.items = mapItemsWithCounterPricing(counterValues);
} else if (note) {
update.counter = {
...(originalOffer.counter || {}),
note,
};
if (originalOffer.counter?.items) {
update.items = mapItemsWithCounterPricing({});
}
} else if (originalOffer.counter && !hasCounterValues) {
update.counter = null;
update.items = mapItemsWithCounterPricing({});
}
if (nextStatus === "completed") {
update.completedAt = originalOffer.completedAt || now;
}

if (nextStatus !== originalOffer.status) {
newHistory.push({ status: nextStatus, at: now });
}
update.history = newHistory;
update.status = nextStatus;

if (nextStatus === "accepted") {
update.acceptedAt = originalOffer.acceptedAt || now;
update.counter = null; // Clear counter info on acceptance
}
if (nextStatus === "completed") {
update.completedAt = originalOffer.completedAt || now;
}

if (nextStatus !== originalOffer.status) {
newHistory.push({ status: nextStatus, at: now });
}
update.history = newHistory;
update.status = nextStatus;

if (nextStatus === "accepted") {
update.acceptedAt = originalOffer.acceptedAt || now;
update.counter = null; // Clear counter info on acceptance
}
if (nextStatus === "completed") {
update.completedAt = originalOffer.completedAt || now;
}

if (nextStatus !== originalOffer.status) {
newHistory.push({ status: nextStatus, at: now });
}
update.history = newHistory;
update.status = nextStatus;

return update;
};

if (event.target.closest("[data-save-offer]")) {
const statusSelect = card.querySelector("[data-offer-status]");
const updateData = getCurrentUiUpdate(statusSelect.value);
updateOffer(offerDocId, updateData);
}

if (event.target.closest("[data-accept-offer]")) {
const updateData = getCurrentUiUpdate("accepted");
updateOffer(offerDocId, updateData);
}

if (event.target.closest("[data-decline-offer]")) {
const updateData = getCurrentUiUpdate("declined");
updateOffer(offerDocId, updateData);
}
});

inventoryTable.addEventListener("click", (event) => {
const button = event.target.closest("[data-save-inventory]");
if (!button) return;
const row = button.closest("tr");
if (!row) return;
const { deviceId, storageVariant, grade } = row.dataset;
const stockInput = row.querySelector("[data-stock-input]");
const priceInput = row.querySelector("[data-price-input]");
const stock = Number(stockInput.value) || 0;
const price = Number(priceInput.value) || 0;

const newInventoryState = JSON.parse(JSON.stringify(inventoryState)); // Deep copy
const device = newInventoryState.find((item) => item.id === deviceId);
if (!device) return;
const storage = device.storages.find((item) => item.variant === storageVariant);
if (!storage) return;

storage.stock = storage.stock || {};
storage.asking = storage.asking || {};
storage.stock[grade] = stock;
storage.asking[grade] = price;

setInventory(newInventoryState);
});

resetInventoryButton.addEventListener("click", resetInventoryToDefault);

if (refreshInventoryButton) {
refreshInventoryButton.addEventListener("click", async (event) => {
event.preventDefault();
showToast("Data refreshes automatically via Firestore listener.");
});
}

if (importInventoryButton) {
importInventoryButton.addEventListener("click", async (event) => {
event.preventDefault();
const file = inventoryUploadInput?.files?.[0];
if (!file) {
showToast("Select a JSON file to import.", "rose");
return;
}
try {
const text = await file.text();
const parsed = JSON.parse(text);
const items = Array.isArray(parsed) ? parsed : parsed.items;

if (!Array.isArray(items) || !items.length) {
throw new Error("No items present in JSON file");
}

await setInventory(items);

inventoryUploadInput.value = "";
showToast(`Imported ${items.length} records to Firestore.`);
} catch (error) {
console.error("Inventory file import failed", error);
showToast("Invalid JSON file format or save error.", "rose");
}
});
}

addDeviceForm.addEventListener("submit", async (event) => {
event.preventDefault();
const formData = new FormData(addDeviceForm);
const brand = formData.get("brand").trim();
const model = formData.get("model").trim();
const tagline = formData.get("tagline").trim();
const image = formData.get("image").trim();
const highlights = formData.get("highlights").trim();
const storageVariant = formData.get("storage").trim();
const grade = formData.get("grade");
const stock = Number(formData.get("stock")) || 0;
const price = Number(formData.get("price")) || 0;

if (!brand || !model || !storageVariant || !grade) {
showToast("Fill out all required fields.", "rose");
return;
}

const newInventoryState = JSON.parse(JSON.stringify(inventoryState));
const deviceId = `${brand.toLowerCase().replace(/\s+/g, "-")}-${model.toLowerCase().replace(/\s+/g, "-")}`;
let device = newInventoryState.find((item) => item.id === deviceId);

if (!device) {
device = {
id: deviceId,
brand,
model,
tagline,
image,
highlights: highlights ? highlights.split(",").map((item) => item.trim()).filter(Boolean) : [],
storages: []
};
newInventoryState.push(device);
} else {
if (tagline) device.tagline = tagline;
if (image) device.image = image;
if (highlights) {
device.highlights = highlights.split(",").map((item) => item.trim()).filter(Boolean);
}
}

let storage = device.storages.find((item) => item.variant === storageVariant);
if (!storage) {
storage = {
variant: storageVariant,
stock: {},
asking: {}
};
device.storages.push(storage);
}

storage.stock = storage.stock || {};
storage.asking = storage.asking || {};
storage.stock[grade] = stock;
storage.asking[grade] = price;

await setInventory(newInventoryState);
addDeviceForm.reset();
showToast("Device added/updated and synced to Firestore.");
});

// --- Firestore Listeners ---

function startListeners() {
if (!isAuthReady || !db) return;

// 1. Inventory Listener
onSnapshot(getInventoryDocRef(), (docSnap) => {
if (docSnap.exists()) {
inventoryState = docSnap.data().items || [];
} else {
resetInventoryToDefault();
inventoryState = [];
}
renderInventoryTable();
}, (error) => {
console.error("Inventory listener failed:", error);
});

// 2. Offers Listener (Reading from all 'offers' subcollections via Collection Group)
onSnapshot(getOffersQuery(), (querySnapshot) => {
allOffers = [];
querySnapshot.forEach(doc => {
// Storing the document ID as 'docId' and the offer data
allOffers.push({ docId: doc.id, ...doc.data() });
});
// Sort by creation date descending
allOffers.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

renderMetrics();
renderOfferFilters();
renderOfferCards();
}, (error) => {
console.error("Offers listener failed:", error);
showToast("Failed to load offer data.", "rose");
});
}
