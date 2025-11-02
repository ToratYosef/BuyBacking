import { firebaseApp } from "/assets/js/firebase-app.js";
import { getAuth, onAuthStateChanged, signInAnonymously } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import {
getFirestore,
setLogLevel,
collection,
query,
where,
getDocs,
doc,
updateDoc
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// --- Configuration and Constants (Must be in all files) ---

let db, auth;
let userId = null;
let cachedOffers = [];

// --- DOM Elements ---
const statusFilters = document.getElementById("statusFilters");
const offerList = document.getElementById("offerList");
const emptyMessage = document.getElementById("emptyMessage");
const accountNameDisplay = document.getElementById("accountName");
const accountEmailDisplay = document.getElementById("accountEmail");
const accountUidDisplay = document.getElementById("accountUid");
const signinPrompt = document.getElementById("signinPrompt");
const toastContent = document.getElementById("toastContent");
const completedList = document.getElementById("completedList");
const emptyCompleted = document.getElementById("emptyCompleted");
const imeiList = document.getElementById("imeiList");
const emptyImeis = document.getElementById("emptyImeis");
const historyList = document.getElementById("historyList");
const emptyHistory = document.getElementById("emptyHistory");
const accountInitial = document.getElementById("accountInitial");
const accountInitialClone = document.getElementById("accountInitialClone");

const statusMap = [
{ id: "all", label: "All" },
{ id: "pending", label: "Pending" },
{ id: "counter", label: "Counter" },
{ id: "accepted", label: "Accepted" },
{ id: "processing", label: "Payment pending" },
{ id: "declined", label: "Declined" },
{ id: "completed", label: "Completed" }
];

let activeStatus = "all";

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

const formatCurrency = (amount) => new Intl.NumberFormat("en-US", {
style: "currency",
currency: "USD",
minimumFractionDigits: 0,
maximumFractionDigits: 0
}).format(amount);

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
if (!user) return;
const email = user.email || 'Anonymous Session';
const displayName = user.displayName || 'Wholesale Buyer';
const uid = user.uid;

accountNameDisplay.textContent = user.displayName || 'buyer';
accountEmailDisplay.textContent = email;
accountUidDisplay.textContent = uid;

// Header dropdown updates
const initial = getInitial(email);
accountInitial.textContent = initial;
accountInitialClone.textContent = initial;
document.querySelector('[data-account-name]').textContent = displayName;
document.querySelector('[data-account-email]').textContent = email;

// Set initial color based on auth state
const initialElements = [accountInitial, accountInitialClone];
initialElements.forEach(el => {
if (user.isAnonymous) {
el.classList.add('bg-slate-200', 'text-slate-500');
el.classList.remove('bg-emerald-500', 'text-white');
} else {
el.classList.add('bg-emerald-500', 'text-white');
el.classList.remove('bg-slate-200', 'text-slate-500');
}
});
}

function summarizeOffer(offer) {
const units = offer.items.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);
// Calculate total based on the final offer price or counter price if present.
const total = offer.items.reduce((sum, item) => {
let price = item.offerPrice;
// If there's a counter, use the counter price for calculation
if (offer.counter?.items?.[item.lineId]) {
price = offer.counter.items[item.lineId];
}
return sum + (Number(price) || 0) * (Number(item.quantity) || 0);
}, 0);
return { units, total };
}

// --- Firestore References & Fetching ---

function getOffersCollectionRef() {
if (!db || !userId) return null;
// The collection where offers are stored: wholesale/{userId}/offers
return collection(db, 'wholesale', userId, 'offers');
}

async function fetchOffers(uid) {
// offersRef now points to the user's specific subcollection: wholesale/{uid}/offers
const offersRef = getOffersCollectionRef();
if (!offersRef) return [];

// Query the user's specific subcollection. No need for a 'where' clause since the path is filtered.
const q = query(offersRef);

try {
const querySnapshot = await getDocs(q);
const offers = [];
querySnapshot.forEach((docSnap) => {
const data = docSnap.data();
offers.push({
docId: docSnap.id,
...data,
id: data.id || docSnap.id,
});
});
// Sort by createdAt descending
offers.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
return offers;
} catch (error) {
console.error("Error fetching offers:", error);
showToast("Failed to load offer history.", "rose");
return [];
}
}

// --- UI Rendering ---

function renderStatusFilters() {
statusFilters.innerHTML = "";
statusMap.forEach((status) => {
const button = document.createElement("button");
button.type = "button";
button.textContent = status.label;
button.dataset.statusFilter = status.id;
button.className = `rounded-full border px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] transition ${
activeStatus === status.id
? "border-emerald-400 bg-emerald-500 text-white"
: "border-slate-300 text-slate-600 hover:border-emerald-300 hover:text-emerald-600"
}`;
statusFilters.appendChild(button);
});
}

function statusBadge(status) {
const colors = {
pending: "bg-amber-100 text-amber-700 border-amber-200",
counter: "bg-sky-100 text-sky-700 border-sky-200",
processing: "bg-sky-100 text-sky-700 border-sky-200",
accepted: "bg-emerald-100 text-emerald-700 border-emerald-200",
declined: "bg-rose-100 text-rose-700 border-rose-200",
completed: "bg-slate-900 text-white border-slate-900"
};
const tone = colors[status] || "bg-slate-100 text-slate-600 border-slate-200";
return `<span class="inline-flex items-center gap-2 rounded-full border ${tone} px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.3em]">${status}</span>`;
}

function renderOfferCard(offer) {
const { units, total } = summarizeOffer(offer);
const card = document.createElement("article");
card.className = "flex flex-col gap-5 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm";
const createdDate = offer.createdAt ? new Date(offer.createdAt).toLocaleString() : "";
const updatedDate = offer.updatedAt ? new Date(offer.updatedAt).toLocaleString() : "";

// Check if there is an active counter that needs acceptance
const canAcceptCounter = offer.status === "counter" || (offer.status === "declined" && offer.counter?.items);
const canDeclineCounter = offer.status === "counter";

card.innerHTML = `
<div class="flex flex-col gap-3">
<div class="flex flex-wrap items-center justify-between gap-3">
<div>
<p class="text-xs uppercase tracking-[0.3em] text-slate-400">Offer ID</p>
<p class="text-sm font-semibold text-slate-900">${offer.id}</p>
</div>
${statusBadge(offer.status)}
</div>
<div class="grid gap-3 text-sm text-slate-600">
<p>Submitted: <span class="font-semibold text-slate-900">${createdDate}</span></p>
<p>Last update: <span class="font-semibold text-slate-900">${updatedDate}</span></p>
<p>Units: <span class="font-semibold text-slate-900">${units}</span></p>
<p>Offer total: <span class="font-semibold text-slate-900">${formatCurrency(total)}</span></p>
</div>
</div>
<div class="overflow-hidden rounded-2xl border border-slate-200">
<table class="min-w-full divide-y divide-slate-200 text-left text-sm">
<thead class="bg-slate-50 text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
<tr>
<th class="px-4 py-3">Device</th>
<th class="px-4 py-3">Qty</th>
<th class="px-4 py-3">Your offer</th>
${offer.counter?.items ? '<th class="px-4 py-3">Counter</th>' : ''}
</tr>
</thead>
<tbody class="divide-y divide-slate-100 bg-white">
${offer.items
.map((item) => {
const counterPrice = offer.counter?.items?.[item.lineId];
return `
<tr>
<td class="px-4 py-3">
<p class="font-semibold text-slate-900">${item.brand} ${item.model}</p>
<p class="text-xs uppercase tracking-[0.3em] text-slate-400">${item.storageVariant} · Grade ${item.grade}</p>
</td>
<td class="px-4 py-3 text-sm text-slate-600">${item.quantity}</td>
<td class="px-4 py-3 text-sm text-slate-600">${formatCurrency(item.offerPrice)}</td>
${offer.counter?.items ? `<td class="px-4 py-3 text-sm text-slate-600 ${counterPrice ? 'font-bold text-sky-700' : ''}">${counterPrice ? formatCurrency(counterPrice) : '—'}</td>` : ''}
</tr>
`;
})
.join("")}
</tbody>
</table>
</div>
${offer.note ? `<p class="text-sm text-slate-500">Your note: ${offer.note}</p>` : ""}
${offer.counter?.note ? `<p class="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-700">Counter note: ${offer.counter.note}</p>` : ""}
<div class="flex flex-wrap items-center gap-3">
${
canAcceptCounter
? `<button data-accept-counter="${offer.docId}" class="rounded-full bg-emerald-500 px-5 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-white shadow-sm transition hover:bg-emerald-400">${offer.status === "declined" ? "Accept new price &amp; checkout" : "Accept counter &amp; checkout"}</button>`
: ""
}
${
canDeclineCounter
? `<button data-decline-counter="${offer.docId}" class="rounded-full border border-rose-300 px-5 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-rose-600 transition hover:border-rose-400 hover:text-rose-700">Decline counter</button>`
: ""
}
${
offer.status === "accepted"
? `<a href="/buy/checkout.html?offer=${offer.id}" class="rounded-full border border-emerald-300 px-5 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-emerald-600 transition hover:bg-emerald-50">Go to checkout</a>`
: ""
}
${
offer.status === "processing" && offer.payment?.checkoutUrl
? `<a href="${offer.payment.checkoutUrl}" class="rounded-full border border-sky-300 px-5 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-sky-700 transition hover:bg-sky-50">Resume payment</a>`
: ""
}
</div>
`;
return card;
}

function renderOffers() {
if (!auth.currentUser || auth.currentUser.isAnonymous) {
offerList.innerHTML = "";
emptyMessage.classList.remove("hidden");
return;
}
const filtered = activeStatus === "all" ? cachedOffers : cachedOffers.filter((offer) => offer.status === activeStatus);
offerList.innerHTML = "";
filtered.forEach((offer) => {
offerList.appendChild(renderOfferCard(offer));
});
emptyMessage.classList.toggle("hidden", filtered.length > 0);
}

function renderCompleted() {
if (!auth.currentUser || auth.currentUser.isAnonymous) {
completedList.innerHTML = "";
emptyCompleted.classList.remove("hidden");
return;
}
const completed = cachedOffers.filter((offer) => offer.status === "completed");
completedList.innerHTML = "";
completed.forEach((offer) => {
const card = document.createElement("article");
const { units, total } = summarizeOffer(offer);
card.className = "rounded-3xl border border-slate-200 bg-white p-6 text-sm text-slate-600 shadow-sm";
card.innerHTML = `
<div class="flex flex-col gap-2">
<p class="text-xs uppercase tracking-[0.3em] text-slate-400">Order ID</p>
<p class="text-sm font-semibold text-slate-900">${offer.id}</p>
<p>Completed: <span class="font-semibold text-slate-900">${offer.completedAt ? new Date(offer.completedAt).toLocaleString() : "Pending"}</span></p>
<p>Units: <span class="font-semibold text-slate-900">${units}</span></p>
<p>Final value: <span class="font-semibold text-slate-900">${formatCurrency(total)}</span></p>
</div>
<a href="/buy/checkout.html?offer=${offer.id}" class="mt-4 inline-flex items-center gap-2 rounded-full border border-slate-300 px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-slate-600 transition hover:border-emerald-300 hover:text-emerald-600">
View checkout confirmation
</a>
`;
completedList.appendChild(card);
});
emptyCompleted.classList.toggle("hidden", completed.length > 0);
}

function renderImeis() {
if (!auth.currentUser || auth.currentUser.isAnonymous) {
imeiList.innerHTML = "";
emptyImeis.classList.remove("hidden");
return;
}
const eligibleOffers = cachedOffers.filter((offer) =>
["completed", "accepted", "processing"].includes(offer.status)
);
imeiList.innerHTML = "";
eligibleOffers.forEach((offer) => {
const card = document.createElement("article");
const statusLabel =
offer.status === "completed"
? "Ready"
: offer.status === "processing"
? "Awaiting payment"
: "Pending";
card.className = "rounded-3xl border border-slate-200 bg-white p-6 text-sm text-slate-600 shadow-sm";
card.innerHTML = `
<p class="text-sm font-semibold text-slate-900">${offer.id}</p>
<p class="mt-2 text-xs uppercase tracking-[0.3em] text-slate-400">${statusLabel} IMEI manifest</p>
<button class="mt-4 rounded-full border border-slate-300 px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-slate-600 transition hover:border-emerald-300 hover:text-emerald-600" data-download-imei="${offer.id}">
Download CSV
</button>
`;
imeiList.appendChild(card);
});
emptyImeis.classList.toggle("hidden", eligibleOffers.length > 0);
}

function renderHistory() {
if (!auth.currentUser || auth.currentUser.isAnonymous) {
historyList.innerHTML = "";
emptyHistory.classList.remove("hidden");
return;
}
historyList.innerHTML = "";
cachedOffers.forEach((offer) => {
const entry = document.createElement("article");
const { units, total } = summarizeOffer(offer);
entry.className = "rounded-3xl border border-slate-200 bg-white p-6 text-sm text-slate-600 shadow-sm";
entry.innerHTML = `
<div class="flex flex-wrap items-center justify-between gap-3">
<div>
<p class="text-xs uppercase tracking-[0.3em] text-slate-400">${offer.status}</p>
<p class="text-sm font-semibold text-slate-900">${offer.id}</p>
</div>
<p class="text-sm font-semibold text-slate-900">${formatCurrency(total)}</p>
</div>
<p class="mt-2 text-xs text-slate-500">Submitted ${offer.createdAt ? new Date(offer.createdAt).toLocaleDateString() : ""}</p>
`;
historyList.appendChild(entry);
});
emptyHistory.classList.toggle("hidden", cachedOffers.length > 0);
}

function renderAllSections() {
renderStatusFilters();
renderOffers();
renderCompleted();
renderImeis();
renderHistory();
}

// --- Event Listeners ---

statusFilters.addEventListener("click", (event) => {
const button = event.target.closest("button[data-status-filter]");
if (!button) return;
activeStatus = button.dataset.statusFilter;
renderStatusFilters();
renderOffers();
});

offerList.addEventListener("click", async (event) => {
const acceptButton = event.target.closest("button[data-accept-counter]");
if (acceptButton) {
if (!auth.currentUser || auth.currentUser.isAnonymous) {
showToast("Sign in to accept the counter.", "rose");
return;
}
const offerDocId = acceptButton.dataset.acceptCounter;

try {
const offersRef = getOffersCollectionRef();
if (!offersRef) throw new Error("Offers reference failed. No user ID.");

const offerRef = doc(offersRef, offerDocId);
const acceptedAt = new Date().toISOString();

const existingOffer = cachedOffers.find((o) => o.docId === offerDocId);
const historyBase = Array.isArray(existingOffer?.history) ? [...existingOffer.history] : [];
if (existingOffer && historyBase.length === 0) {
historyBase.push({ status: existingOffer.status, at: existingOffer.createdAt });
}
historyBase.push({ status: "accepted", at: acceptedAt });

const itemsWithCounter = Array.isArray(existingOffer?.items)
? existingOffer.items.map((item) => {
const counterPrice = existingOffer?.counter?.items?.[item.lineId];
return counterPrice ? { ...item, counterPrice } : item;
})
: [];

const updatePayload = {
status: "accepted",
updatedAt: acceptedAt,
acceptedAt: existingOffer?.acceptedAt || acceptedAt,
history: historyBase,
counter: null,
counterAcceptedAt: acceptedAt,
};

if (itemsWithCounter.length > 0) {
updatePayload.items = itemsWithCounter;
}

await updateDoc(offerRef, updatePayload);

showToast("Counter accepted. Proceeding to checkout.");

// Re-fetch all offers to update UI after update
cachedOffers = await fetchOffers(auth.currentUser.uid);
renderAllSections();

setTimeout(() => {
const redirectId = existingOffer?.id || offerDocId;
window.location.href = `/buy/checkout.html?offer=${redirectId}`;
}, 1200);

} catch (error) {
console.error("Error accepting counter:", error);
showToast("Failed to accept counter. Please try again.", "rose");
}
return;
}

const declineButton = event.target.closest("button[data-decline-counter]");
if (declineButton) {
if (!auth.currentUser || auth.currentUser.isAnonymous) {
showToast("Sign in to respond to the counter.", "rose");
return;
}

const offerDocId = declineButton.dataset.declineCounter;

try {
const offersRef = getOffersCollectionRef();
if (!offersRef) throw new Error("Offers reference failed. No user ID.");

const offerRef = doc(offersRef, offerDocId);
const declinedAt = new Date().toISOString();

const existingOffer = cachedOffers.find((o) => o.docId === offerDocId);
const historyBase = Array.isArray(existingOffer?.history) ? [...existingOffer.history] : [];
if (existingOffer && historyBase.length === 0) {
historyBase.push({ status: existingOffer.status, at: existingOffer.createdAt });
}
historyBase.push({ status: "declined", at: declinedAt });

await updateDoc(offerRef, {
status: "declined",
updatedAt: declinedAt,
declinedAt,
history: historyBase,
});

showToast("Counter declined. We'll let the admin know.", "amber");

cachedOffers = await fetchOffers(auth.currentUser.uid);
renderAllSections();
} catch (error) {
console.error("Error declining counter:", error);
showToast("Failed to decline counter. Please try again.", "rose");
}
}
});

imeiList.addEventListener("click", (event) => {
const downloadButton = event.target.closest("button[data-download-imei]");
if (!downloadButton) return;
const offerId = downloadButton.dataset.downloadImei;
showToast(`Preparing IMEI export for ${offerId}. (Simulated download)`, "amber");
});

document.getElementById('cartButton').addEventListener('click', () => {
document.getElementById('cartPreview').classList.toggle('hidden');
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
if (!user) {
// Force anonymous login to get a UID for header display, but keep the offers disabled
try {
const anonUser = await signInAnonymously(auth);
user = anonUser.user;
} catch (e) {
console.error("Failed to sign in anonymously:", e);
return;
}
}

userId = user.uid; // Ensure userId is set before calling fetchOffers
updateAccountUI(user);

if (user && !user.isAnonymous) {
signinPrompt.classList.add("hidden");
// Fetch and render data for authenticated user
cachedOffers = await fetchOffers(user.uid);
} else {
signinPrompt.classList.remove("hidden");
cachedOffers = [];
}

renderAllSections();
});
