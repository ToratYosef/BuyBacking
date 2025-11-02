import { firebaseApp } from "/assets/js/firebase-app.js";
import { getAuth, onAuthStateChanged, signInAnonymously } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, onSnapshot, setLogLevel, query, collection, where, limit } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// --- Firebase Configuration and Setup ---

let db, auth;
let userId = null;

try {
const app = firebaseApp;
db = getFirestore(app);
auth = getAuth(app);
setLogLevel('Debug');
} catch (e) {
console.error("Firebase initialization failed:", e);
}

// --- DOM Elements ---
const mainContent = document.getElementById("mainContent");
const loadingState = document.getElementById("loadingState");
const successState = document.getElementById("successState");
const failureState = document.getElementById("failureState");
const failureMessage = document.getElementById("failureMessage"); // Added
const orderIdDisplay = document.getElementById("orderIdDisplay");
const totalPaidDisplay = document.getElementById("totalPaidDisplay");
const paymentIntentDisplay = document.getElementById("paymentIntentDisplay");
const retryLink = document.getElementById("retryLink");

// --- Utility Functions ---
const formatCurrency = (amount) => {
return new Intl.NumberFormat("en-US", {
style: "currency",
currency: "USD",
minimumFractionDigits: 2,
maximumFractionDigits: 2
}).format(amount);
};

function getOffersCollectionRef(uid) {
if (!db || !uid) return null;
return collection(db, 'wholesale', uid, 'offers');
}

// --- Main Logic ---

function handlePaymentConfirmation(user) {
const params = new URLSearchParams(window.location.search);
const offerId = params.get("offer");
const paymentIntent = params.get("payment_intent");
const redirectStatus = params.get("redirect_status");

loadingState.classList.remove("hidden");
successState.classList.add("hidden");
failureState.classList.add("hidden");

if (redirectStatus === "succeeded" && offerId && paymentIntent) {
// Payment succeeded on Stripe side, now wait for Firestore/Webhook confirmation

// Set initial URL parameters for display/retry
retryLink.href = `/buy/checkout.html?offer=${offerId}`;
paymentIntentDisplay.textContent = paymentIntent;

const offersColRef = getOffersCollectionRef(user.uid);
if (!offersColRef) {
displayFailure("Cannot load order data. Authentication failed.");
return;
}

// Querying by 'id' field requires a separate query or using doc(offersColRef, offerId)
// Assuming offerId is the document ID for simplicity and performance.
const offerQuery = query(offersColRef, where('id', '==', offerId), limit(1));

// Listen for real-time status change (webhook will eventually update status to 'completed')
const unsubscribe = onSnapshot(offerQuery, (snapshot) => {
if (snapshot.empty) {
console.log(`Waiting for offer ${offerId} to sync…`);
return;
}

const docSnap = snapshot.docs[0];
const offer = docSnap.data();
const orderId = offer.payment?.orderId || "N/A";
const totalPaid = offer.payment?.totalAmount;

orderIdDisplay.textContent = orderId;

if (offer.status === "completed") {
// SUCCESS STATE
totalPaidDisplay.textContent = totalPaid ? formatCurrency(totalPaid) : "N/A";
loadingState.classList.add("hidden");
successState.classList.remove("hidden");
failureState.classList.add("hidden");
unsubscribe(); // Stop listening once completed
console.log("Payment confirmed by Firestore update (webhook success).");
} else if (offer.status === "declined") {
// FAILURE STATE: Explicitly declined
displayFailure("This offer was declined or rejected. Please contact support.");
unsubscribe();
} else if (offer.status === "payment_failed") {
// FAILURE STATE: If a webhook sets this status (not currently implemented, but good for future proofing)
displayFailure("The payment failed. Please return to checkout to try again.");
unsubscribe();
} else {
// KEEP WAITING: Status is still pending, accepted, counter, etc.
console.log(`Waiting for completion. Current status: ${offer.status}`);
return;
}
}, (error) => {
console.error("Firestore Listener Error:", error);
displayFailure("Failed to connect to order status updates.");
unsubscribe();
});

} else {
// Payment failed or was cancelled (redirect_status is not 'succeeded')
displayFailure("Payment failed or was cancelled. Please return to checkout to retry.");
}
}

function displayFailure(message) {
console.error("Order Submission Failure:", message);
loadingState.classList.add("hidden");
successState.classList.add("hidden");
failureState.classList.remove("hidden");
failureMessage.textContent = message; // Display the specific error message

// Extract offerId from URL to populate retry link if available
const params = new URLSearchParams(window.location.search);
const offerId = params.get("offer");
if (offerId) {
retryLink.href = `/buy/checkout.html?offer=${offerId}`;
}
}

// --- Authentication Check ---
onAuthStateChanged(auth, async (user) => {
if (user) {
if (user.isAnonymous) {
// Anonymous users shouldn't be completing wholesale orders
loadingState.classList.add("hidden");
displayFailure("You must be signed in with a wholesale account to view this page.");
} else {
handlePaymentConfirmation(user);
}
} else {
// Attempt anonymous sign-in just to get a UID for Firestore path
try {
// Attempt to sign in anonymously to keep the app running, but still fail the process
await signInAnonymously(auth);
displayFailure("You must sign in with your permanent wholesale account to view this order.");
} catch(e) {
displayFailure("Authentication failed. Cannot access order details.");
console.error("Failed to sign in anonymously:", e);
}
}

mainContent.classList.add('ready');
});
