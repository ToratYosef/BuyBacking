import { firebaseApp } from "/assets/js/firebase-app.js";
import { getAuth, onAuthStateChanged, signInAnonymously } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, doc, onSnapshot, setLogLevel, query, collection, where, updateDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// Assuming API_BASE is defined elsewhere or is a known constant for the backend
const API_BASE = "https://us-central1-buyback-a0f05.cloudfunctions.net/api/wholesale";

// --- Stripe Initialization ---
let stripePromise = null;
let stripePublishableKey = null;
let elements = null;
let clientSecret = null;

const getStripe = (key) => {
if (!key) return null;
if (!stripePromise || stripePublishableKey !== key) {
stripePublishableKey = key;
// @ts-ignore: Assuming Stripe is loaded globally via <script> tag
stripePromise = Stripe(key);
}
return stripePromise;
};

// --- Firebase Configuration and Setup (Self-contained) ---

let db, auth;
let userId = null;
let activeOffer = null;
let finalTotalAmount = 0; // Store calculated total here

try {
const app = firebaseApp;
db = getFirestore(app);
auth = getAuth(app);
setLogLevel('Debug');
console.log("Firebase initialized successfully.");
} catch (e) {
console.error("Firebase initialization failed:", e);
}

// --- DOM Elements ---
const mainContent = document.getElementById("mainContent");
const toastContent = document.getElementById("toastContent");
const signInMessage = document.getElementById("signInMessage");
const offerMessage = document.getElementById("offerMessage");
const checkoutStatus = document.getElementById("checkoutStatus");
const checkoutContent = document.getElementById("checkoutContent");
const offerIdLabel = document.getElementById("offerId");
const offerSubmitted = document.getElementById("offerSubmitted");
const offerAccepted = document.getElementById("offerAccepted");
const offerUnits = document.getElementById("offerUnits");
const offerValue = document.getElementById("offerValue");
const offerLines = document.getElementById("offerLines");
const checkoutNotes = document.getElementById("checkoutNotes");
const completeOrderButton = document.getElementById("completeOrder");
const shippingForm = document.getElementById("shippingForm");
const shippingContainer = document.getElementById("shippingContainer");
const paymentContainer = document.getElementById("paymentContainer");
const paymentElement = document.getElementById("payment-element");
const paymentMessage = document.getElementById("payment-message");
const finalTotalDisplay = document.getElementById("finalTotalDisplay"); // ADDED
const accountButton = document.getElementById("accountButton");
const accountDropdown = document.getElementById("accountDropdown");

const params = new URLSearchParams(window.location.search);
const offerIdParam = params.get("offer");

// --- Utility Functions ---

const formatCurrency = (amount) => {
return new Intl.NumberFormat("en-US", {
style: "currency",
currency: "USD",
minimumFractionDigits: 2,
maximumFractionDigits: 2
}).format(amount);
};

const summarizeOffer = (offer) => {
const units = offer.items.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);
const total = offer.items.reduce((sum, item) => {
// Use counterPrice if available, otherwise use original offerPrice
const price = item.counterPrice || item.offerPrice;
return sum + (Number(price) || 0) * (Number(item.quantity) || 0);
}, 0);
return { units, total };
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

function updateHeaderUI(user) {
const initial = getInitial(user?.email);
document.getElementById("accountInitial").textContent = initial;
document.getElementById("accountInitialClone").textContent = initial;
document.querySelector('[data-account-name]').textContent = user?.displayName || 'Wholesale Buyer';
document.querySelector('[data-account-email]').textContent = user?.email || 'Anonymous Session';

const initialEl = document.getElementById("accountInitial");
if (user?.isAnonymous) {
initialEl.classList.add('bg-slate-200', 'text-slate-500');
initialEl.classList.remove('bg-emerald-500', 'text-white');
} else {
initialEl.classList.add('bg-emerald-500', 'text-white');
initialEl.classList.remove('bg-slate-200', 'text-slate-500');
}
}

// --- Firestore References ---

function getOffersCollectionRef(uid) {
if (!db || !uid) return null;
return collection(db, 'wholesale', uid, 'offers');
}

function getOfferDocRef(uid, docId) {
if (!db || !uid || !docId) return null;
return doc(db, 'wholesale', uid, 'offers', docId);
}

// --- Payment Element Logic ---
async function mountPaymentElement(newClientSecret, pubKey, totalAmount) {
const stripe = await getStripe(pubKey);
if (!stripe) {
showToast("Stripe failed to initialize.", "rose");
return;
}
clientSecret = newClientSecret;
finalTotalDisplay.textContent = formatCurrency(totalAmount); // Display final total

// Configuration for the appearance of the Stripe elements
const appearance = {
theme: 'stripe',
variables: {
colorPrimary: '#10b981', // emerald-500
colorBackground: '#ffffff',
colorText: '#0f172a', // slate-900
colorDanger: '#f43f5e', // rose-500
fontFamily: '"Inter", system-ui, sans-serif',
spacingUnit: '4px',
borderRadius: '0.75rem', // rounded-3xl
}
};

elements = stripe.elements({ appearance, clientSecret });

const paymentElementInstance = elements.create('payment');
paymentElementInstance.mount('#payment-element');

paymentContainer.classList.remove("hidden");
shippingContainer.classList.add("hidden");
completeOrderButton.textContent = "Submit Payment";
completeOrderButton.onclick = handleSubmitPayment;
completeOrderButton.disabled = false;
}

function showPaymentMessage(message, isError = true) {
paymentMessage.textContent = message;
paymentMessage.classList.remove("hidden", isError ? "bg-emerald-50" : "bg-rose-50");
paymentMessage.classList.add(isError ? "bg-rose-50" : "bg-emerald-50");
}

async function handleSubmitPayment(event) {
event.preventDefault();
completeOrderButton.disabled = true;
completeOrderButton.textContent = "Processing payment...";
paymentMessage.classList.add("hidden");

const stripe = await stripePromise;

if (!stripe || !elements || !clientSecret) {
showPaymentMessage("Payment service error. Please refresh.", true);
completeOrderButton.textContent = "Submit Payment";
completeOrderButton.disabled = false;
return;
}

const { error } = await stripe.confirmPayment({
elements,
confirmParams: {
// Stripe will redirect here after successful payment confirmation
return_url: `${window.location.origin}/buy/order-submitted.html?offer=${activeOffer.id}`,
}
});

if (error) {
if (error.type === "card_error" || error.type === "validation_error") {
showPaymentMessage(error.message, true);
} else {
showPaymentMessage("An unexpected error occurred. Please try again.", true);
}
completeOrderButton.textContent = "Submit Payment";
completeOrderButton.disabled = false;
} else {
// Payment succeeded, Stripe will redirect to return_url
showPaymentMessage("Payment successful! Redirecting...", false);
}
}

// --- Main Offer Loading Logic ---

async function loadOfferForUser(user) {
console.log(`loadOfferForUser called. User UID: ${user.uid}, Offer ID Param: ${offerIdParam}`);

if (user.isAnonymous) {
offerMessage.textContent = "Please sign in with your permanent wholesale account to load your offer.";
offerMessage.classList.remove("hidden");
return;
}

if (!offerIdParam) {
offerMessage.textContent = "No offer ID provided. Go back to your account to choose an offer.";
offerMessage.classList.remove("hidden");
return;
}

const offersColRef = getOffersCollectionRef(user.uid);
if (!offersColRef) {
offerMessage.textContent = "Cannot load offer. Missing user ID.";
offerMessage.classList.remove("hidden");
return;
}

const offerQuery = query(offersColRef, where('id', '==', offerIdParam));
console.log(`Executing query for offer field 'id' == '${offerIdParam}' at path: wholesale/${user.uid}/offers`);

onSnapshot(offerQuery, (snapshot) => {
if (snapshot.empty) {
console.log(`Query returned empty snapshot for id: ${offerIdParam}`);
offerMessage.textContent = `Offer ID ${offerIdParam} not found for your account. Please check the URL or sign in with the correct buyer profile.`;
offerMessage.classList.remove("hidden");
checkoutContent.classList.add("hidden");
activeOffer = null;
return;
}

const docSnap = snapshot.docs[0];
const offer = { docId: docSnap.id, ...docSnap.data() };
console.log(`Offer found. Document ID: ${offer.docId}, Offer Status: ${offer.status}`);

if (!(["accepted", "processing", "completed"].includes(offer.status))) {
offerMessage.textContent = "This offer is not ready for checkout yet. Accept the counter or wait for approval.";
offerMessage.classList.remove("hidden");
checkoutContent.classList.add("hidden");
activeOffer = offer;
return;
}

offerMessage.classList.add("hidden");
activeOffer = offer;
renderOfferDetails(offer);

if (shippingForm && offer.shipping) {
const s = offer.shipping;
shippingForm.contactName.value = s.contact?.name || shippingForm.contactName.value;
shippingForm.contactEmail.value = s.contact?.email || shippingForm.contactEmail.value;
shippingForm.contactPhone.value = s.contact?.phone || shippingForm.contactPhone.value;
shippingForm.company.value = s.company || shippingForm.company.value;
shippingForm.address1.value = s.address?.line1 || shippingForm.address1.value;
shippingForm.address2.value = s.address?.line2 || "";
shippingForm.city.value = s.address?.city || shippingForm.city.value;
shippingForm.state.value = s.address?.state || shippingForm.state.value;
shippingForm.postalCode.value = s.address?.postalCode || shippingForm.postalCode.value;
shippingForm.country.value = s.address?.country || shippingForm.country.value;
shippingForm.preference.value = s.preference || shippingForm.preference.value;
shippingForm.boxCount.value = s.boxCount || shippingForm.boxCount.value;
shippingForm.weightPerBox.value = s.weightPerBox || shippingForm.weightPerBox.value;
shippingForm.length.value = s.dimensions?.length || shippingForm.dimensions?.length || 20;
shippingForm.width.value = s.dimensions?.width || shippingForm.dimensions?.width || 16;
shippingForm.height.value = s.dimensions?.height || shippingForm.dimensions?.height || 12;
shippingForm.notes.value = s.notes || "";
} else if (shippingForm && user) {
shippingForm.contactName.value = user.displayName || "";
shippingForm.contactEmail.value = user.email || "";
}

// If payment is pending, jump directly to mounting the element
if (offer.status === "processing" && offer.payment?.clientSecret && offer.payment?.publishableKey) {
finalTotalAmount = offer.payment.totalAmount || 0;
mountPaymentElement(offer.payment.clientSecret, offer.payment.publishableKey, finalTotalAmount);
} else {
shippingContainer.classList.remove("hidden");
paymentContainer.classList.add("hidden");
completeOrderButton.textContent = "Proceed to Payment";
completeOrderButton.onclick = handleSubmitShipping;
completeOrderButton.disabled = false;
}

}, (error) => {
console.error("Error listening to offer query:", error);
showToast("Failed to connect to offer data.", "rose");
});
}

function renderOfferDetails(offer) {
if (!offer) {
checkoutContent.classList.add("hidden");
return;
}
checkoutContent.classList.remove("hidden");
offerIdLabel.textContent = offer.id;
offerSubmitted.textContent = offer.createdAt ? new Date(offer.createdAt).toLocaleString() : "—";
offerAccepted.textContent = offer.acceptedAt ? new Date(offer.acceptedAt).toLocaleString() : "Awaiting acceptance";
const { units, total } = summarizeOffer(offer);
offerUnits.textContent = units;
offerValue.textContent = formatCurrency(total);

offerLines.innerHTML = offer.items
.map(
(item) => {
const acceptedPrice = item.counterPrice || item.offerPrice;
return `
<tr>
<td class="px-4 py-3">
<p class="font-semibold text-slate-900">${item.brand} ${item.model}</p>
<p class="text-xs uppercase tracking-[0.3em] text-slate-400">${item.storageVariant} · Grade ${item.grade}</p>
</td>
<td class="px-4 py-3 text-sm text-slate-600">${item.quantity}</td>
<td class="px-4 py-3 text-sm text-slate-600">${formatCurrency(acceptedPrice)}</td>
</tr>
`;}
)
.join("");
const noteText = offer.counter?.note || offer.note;
checkoutNotes.innerHTML = noteText ? `<p class="font-medium text-slate-900">Notes:</p><p class="mt-1">${noteText}</p>` : "";

if (offer.status === "completed") {
checkoutStatus.innerHTML = `<span class="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-900 px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-white">Completed</span>`;
completeOrderButton.textContent = "Order already completed";
completeOrderButton.disabled = true;
completeOrderButton.onclick = null;
} else if (offer.status === "processing") {
checkoutStatus.innerHTML = `<span class="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-sky-50 px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-sky-700">Payment pending</span>`;
} else {
checkoutStatus.innerHTML = `<span class="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-emerald-700">Ready for checkout</span>`;
}

const shippingAmount = offer.payment?.shippingEstimate?.shipping_amount?.amount;
if (shippingAmount) {
const boxes = offer.payment?.boxCount || offer.shipping?.boxCount || 1;
const perBox = shippingAmount / boxes;
checkoutStatus.innerHTML += `<div class="mt-2 text-xs text-slate-500">Estimated shipping: ${formatCurrency(shippingAmount)} (${formatCurrency(perBox)} per box)</div>`;
}

mainContent.classList.add('ready');
}

async function handleSubmitShipping() {
if (!auth.currentUser || auth.currentUser.isAnonymous) {
showToast("Please sign in to complete the order.", "rose");
return;
}
if (!activeOffer) {
showToast("No offer loaded.", "rose");
return;
}

// 2. Client-side form validation
const formData = new FormData(shippingForm);
const requiredFields = [
"contactName", "contactEmail", "contactPhone",
"address1", "city", "state", "postalCode", "country",
"preference", "boxCount", "weightPerBox"
];
const missing = requiredFields.some((field) => !(formData.get(field) || "").toString().trim());
if (missing) {
showToast("Please provide all required shipping details.", "rose");
return;
}

// 3. Prepare Payloads
const shippingPayload = {
preference: formData.get("preference"),
notes: formData.get("notes")?.toString().trim() || "",
boxCount: Number(formData.get("boxCount") || 1),
weightPerBox: Number(formData.get("weightPerBox") || 1),
dimensions: {
length: Number(formData.get("length") || 0),
width: Number(formData.get("width") || 0),
height: Number(formData.get("height") || 0)
},
company: formData.get("company")?.toString().trim() || "",
contact: {
name: formData.get("contactName")?.toString().trim() || "",
email: formData.get("contactEmail")?.toString().trim() || auth.currentUser.email || "",
phone: formData.get("contactPhone")?.toString().trim() || ""
},
address: {
line1: formData.get("address1")?.toString().trim() || "",
line2: formData.get("address2")?.toString().trim() || "",
city: formData.get("city")?.toString().trim() || "",
state: formData.get("state")?.toString().trim() || "",
postalCode: formData.get("postalCode")?.toString().trim() || "",
country: formData.get("country")?.toString().trim() || "US"
},
// Note: return_url is for Payment Intent confirmation success, not checkout session redirect
successUrl: `${window.location.origin}/buy/order-submitted.html?order={ORDER_ID}`,
cancelUrl: `${window.location.origin}/buy/checkout.html?offer=${activeOffer.id}`
};

const { units, total } = summarizeOffer(activeOffer);
const apiPayload = {
offerId: activeOffer.id,
items: activeOffer.items.map((item) => ({
...item,
acceptedPrice: item.counterPrice || item.offerPrice
})),
totals: { units, offerTotal: total },
shipping: shippingPayload,
buyer: {
uid: auth.currentUser.uid,
email: auth.currentUser.email,
name: auth.currentUser.displayName || shippingPayload.contact.name
},
saveOfferSnapshot: {
...activeOffer,
status: "processing",
shipping: shippingPayload,
paymentRequestedAt: new Date().toISOString()
}
};

try {
completeOrderButton.disabled = true;
completeOrderButton.textContent = "Calculating rate & initializing payment…";

// 4. Call Backend to create Stripe Payment Intent (This step assumes the backend API is updated)
const response = await fetch(`${API_BASE}/orders/checkout`, {
method: 'POST',
headers: {
'Content-Type': 'application/json',
'Authorization': `Bearer ${await auth.currentUser.getIdToken()}`
},
body: JSON.stringify(apiPayload)
});

if (!response.ok) {
const errorData = await response.json();
throw new Error(errorData.error || 'Failed to start checkout session.');
}
const data = await response.json();

console.log("Payment Intent created:", data);

// Assuming the backend returns clientSecret, publishableKey, and totalAmount
if (!data.clientSecret || !data.publishableKey || typeof data.totalAmount !== 'number') {
throw new Error("Server failed to return required payment credentials or total amount.");
}

finalTotalAmount = data.totalAmount; // Store the total amount from the server

// 5. Update Firestore (Optional/Backend responsibility)
const offerRef = getOfferDocRef(auth.currentUser.uid, activeOffer.docId);
await updateDoc(offerRef, {
status: "processing",
shipping: shippingPayload,
updatedAt: new Date().toISOString(),
payment: {
orderId: data.orderId,
clientSecret: data.clientSecret,
publishableKey: data.publishableKey,
shippingEstimate: data.shippingEstimate,
boxCount: shippingPayload.boxCount,
totalAmount: finalTotalAmount // Persist total
}
});

// 6. Mount the Stripe Payment Element
await mountPaymentElement(data.clientSecret, data.publishableKey, finalTotalAmount);

} catch (error) {
console.error("Wholesale checkout error", error);
completeOrderButton.disabled = false;
completeOrderButton.textContent = "Proceed to Payment";
showToast(`Unable to start payment: ${error.message || 'Server error.'}`, "rose");
}
}

// --- Header and Auth Listener ---

document.getElementById('accountButton').addEventListener('click', () => {
accountDropdown.classList.toggle('hidden');
});
document.querySelectorAll('[data-close-cart-preview]').forEach(btn => {
btn.addEventListener('click', () => {
document.getElementById('cartPreview').classList.add('hidden');
});
});
document.getElementById('cartButton').addEventListener('click', () => {
document.getElementById('cartPreview').classList.toggle('hidden');
});

document.querySelector('[data-sign-out]').addEventListener('click', () => {
window.location.reload();
});

// Set initial click handler
completeOrderButton.onclick = handleSubmitShipping;

onAuthStateChanged(auth, async (user) => {
console.log("Auth State Changed. User:", user ? user.uid : 'null', user ? user.isAnonymous : 'N/A');

if (user) {
userId = user.uid;
updateHeaderUI(user);
signInMessage.classList.add("hidden");

if (!user.isAnonymous && offerIdParam) {
loadOfferForUser(user);
} else if (!user.isAnonymous && !offerIdParam) {
offerMessage.textContent = "No accepted offer ID found in the URL. Please select an offer from My Account.";
offerMessage.classList.remove("hidden");
} else if (user.isAnonymous) {
signInMessage.classList.remove("hidden");
offerMessage.textContent = "Please sign in with your permanent wholesale account to load and finalize this offer.";
offerMessage.classList.remove("hidden");
}

} else {
try {
const anonUser = await signInAnonymously(auth);
console.log("Signed in anonymously:", anonUser.user.uid);
updateHeaderUI(anonUser.user);
signInMessage.classList.remove("hidden");
} catch(e) {
console.error("Failed to sign in anonymously:", e);
}
}

mainContent.classList.add('ready');
});
