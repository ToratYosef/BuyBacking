import { firebaseApp } from "/assets/js/firebase-app.js";
import { getAuth, signOut, onAuthStateChanged, updateProfile, signInWithPopup, GoogleAuthProvider, signInWithEmailAndPassword, createUserWithEmailAndPassword, sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc, collection, query, onSnapshot, where, addDoc, serverTimestamp, updateDoc, orderBy } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// Your Firebase configuration

// Initialize Firebase
const app = firebaseApp;
const auth = getAuth(app);
const db = getFirestore(app);

// Backend URL for Cloud Functions
const BACKEND_BASE_URL = 'https://us-central1-buyback-a0f05.cloudfunctions.net/api';

// Get elements
const loginNavBtn = document.getElementById('loginNavBtn');
const userMonogram = document.getElementById('userMonogram');
const authDropdown = document.getElementById('authDropdown');
const logoutButton = document.getElementById('logoutBtn');

const accountInfoTab = document.getElementById('accountInfoTab');
const orderHistoryTab = document.getElementById('orderHistoryTab');
const accountInfoSection = document.getElementById('accountInfoSection');
const orderHistorySection = document.getElementById('orderHistorySection');
const userName = document.getElementById('userName');
const userEmail = document.getElementById('userEmail');
const userPhoneInput = document.getElementById('userPhone');
const saveInfoBtn = document.getElementById('saveInfoBtn');
const messageDiv = document.getElementById('message');
const ordersTableBody = document.getElementById('ordersTableBody');
const noOrdersMessage = document.getElementById('noOrdersMessage');

// Modals and their buttons
const modals = document.querySelectorAll('.modal');
const loginModal = document.getElementById('loginModal');
const aboutUsModal = document.getElementById('aboutUsModal');
const privacyPolicyModal = document.getElementById('privacyPolicyModal');
const termsAndConditionsModal = document.getElementById('termsAndConditionsModal');

// Modal elements for Order Details
const orderDetailsModal = document.getElementById('orderDetailsModal');
const closeModalBtn = document.getElementById('closeModal');
const modalOrderId = document.getElementById('modalOrderId');
const modalCustomerName = document.getElementById('modalCustomerName');
const modalCustomerEmail = document.getElementById('modalCustomerEmail');
const modalItem = document.getElementById('modalItem');
const modalStorage = document.getElementById('modalStorage');
const modalCarrier = document.getElementById('modalCarrier');
const modalPrice = document.getElementById('modalPrice');
const modalPaymentMethod = document.getElementById('modalPaymentMethod');
const modalVenmoUsernameRow = document.getElementById('modalVenmoUsernameRow');
const modalVenmoUsername = document.getElementById('modalVenmoUsername');
const modalShippingAddress = document.getElementById('modalShippingAddress');
const modalConditionPowerOn = document.getElementById('modalConditionPowerOn');
const modalConditionFunctional = document.getElementById('modalConditionFunctional');
const modalConditionCracks = document.getElementById('modalConditionCracks');
const modalConditionCosmetic = document.getElementById('modalConditionCosmetic');
const modalStatus = document.getElementById('modalStatus');
const reOfferDetails = document.getElementById('reOfferDetails');
const reOfferNewPrice = document.getElementById('reOfferNewPrice');
const reOfferReasons = document.getElementById('reOfferReasons');
const reOfferCommentsRow = document.getElementById('reOfferCommentsRow');
const reOfferComments = document.getElementById('reOfferComments');
const reOfferAutoAcceptDateRow = document.getElementById('reOfferAutoAcceptDateRow');
const reOfferAutoAcceptDate = document.getElementById('reOfferAutoAcceptDate');
const labelInfoSection = document.getElementById('labelInfoSection');
const outboundLabelRow = document.getElementById('outboundLabelRow');
const outboundTrackingLink = document.getElementById('outboundTrackingLink');
const inboundLabelRow = document.getElementById('inboundLabelRow');
const inboundLabelLink = document.getElementById('inboundLabelLink');
const inboundTrackingNumber = document.getElementById('inboundTrackingNumber');
const uspsLabelRow = document.getElementById('uspsLabelRow');
const uspsLabelLink = document.getElementById('uspsLabelLink');
const uspsTrackingNumber = document.getElementById('uspsTrackingNumber');
const returnLabelRow = document.getElementById('returnLabelRow');
const returnLabelLink = document.getElementById('returnLabelLink');
const returnTrackingNumber = document.getElementById('returnTrackingNumber');
const orderProgressSection = document.getElementById('orderProgressSection');
const shippingTimeline = document.getElementById('shippingTimeline');
const payoutTimeline = document.getElementById('payoutTimeline');
const modalLoadingMessage = document.getElementById('modalLoadingMessage');
const modalActionButtons = document.getElementById('modalActionButtons');
const modalMessage = document.getElementById('modalMessage');

// Footer elements for signup form
const footerEmailSignupForm = document.getElementById('footerEmailSignupForm');
const footerSignupMessage = document.getElementById('footerSignupMessage');

// Login/Signup Modal specific elements
const loginTabBtn = document.getElementById('loginTabBtn');
const signupTabBtn = document.getElementById('signupTabBtn');
const loginForm = document.getElementById('loginForm');
const signupForm = document.getElementById('signupForm');
const forgotPasswordForm = document.getElementById('forgotPasswordForm');
const authMessage = document.getElementById('authMessage');
const googleLoginBtn = document.getElementById('googleLoginBtn');
const googleSignupBtn = document.getElementById('googleSignupBtn');
const emailLoginBtn = document.getElementById('emailLoginBtn');
const emailSignupBtn = document.getElementById('emailSignupBtn');
const forgotPasswordLink = document.getElementById('forgotPasswordLink');
const returnToLoginLink = document.getElementById('returnToLogin');
const switchToLoginLink = document.getElementById('switchToLogin');
const sendResetEmailBtn = document.getElementById('sendResetEmailBtn');

let currentUserId = null;
const initialTab = (() => {
const params = new URLSearchParams(window.location.search);
if (params.get('tab') === 'orders') return 'orderHistory';
const hash = window.location.hash.replace('#', '').toLowerCase();
if (hash === 'orders' || hash === 'orderhistory') return 'orderHistory';
return 'accountInfo';
})();

// --- Helper Functions ---

function showMessage(msg, type) {
messageDiv.textContent = msg;
messageDiv.className = `mb-6 p-3 rounded-md text-sm text-center ${type === 'success' ? 'bg-green-100 text-green-700' : type === 'error' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'}`;
messageDiv.classList.remove('hidden');
}

function clearMessage() {
messageDiv.classList.add('hidden');
messageDiv.textContent = '';
}

function getStatusBadgeClass(status) {
switch (status.toLowerCase()) {
case 'completed': return 'status-completed';
case 're-offered-accepted': return 'status-re-offered-accepted';
case 're-offered-auto-accepted': return 'status-re-offered-auto-accepted';
case 're-offered-pending': return 'status-re-offered-pending';
case 're-offered-declined': return 'status-re-offered-declined';
case 'order_pending': return 'status-order_pending';
case 'shipping_kit_requested': return 'status-shipping_kit_requested';
case 'label_generated': return 'status-label_generated';
case 'received': return 'status-received';
case 'return-label-generated': return 'status-return-label-generated';
default: return 'bg-gray-200 text-gray-800';
}
}

function formatStatus(status) {
if (status === 'order_pending') {
return 'Order Pending';
}
if (status === 'shipping_kit_requested') {
return 'Shipping Kit Requested';
}
if (status === 'label_generated') {
return 'Shipping Kit on the Way';
}
return status.replace(/_/g, ' ').split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
}

function formatDate(timestamp) {
if (!timestamp) return 'N/A';
const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp.seconds * 1000);
return date.toLocaleDateString();
}

function formatCondition(condition) {
return condition.charAt(0).toUpperCase() + condition.slice(1);
}

const STATUS_FLOW = [
'order_pending',
'shipping_kit_requested',
'needs_printing',
'label_generated',
'kit_sent',
'kit_in_transit',
'kit_delivered',
'received',
're-offered-pending',
're-offered-accepted',
're-offered-auto-accepted',
're-offered-declined',
'return-label-generated',
'completed'
];

function getStatusIndex(status) {
if (!status) return -1;
const index = STATUS_FLOW.indexOf(status);
return index === -1 ? STATUS_FLOW.length : index;
}

function resolvePath(object, path) {
if (!object || !path) return null;
return path.split('.').reduce((acc, key) => (acc && acc[key] !== undefined ? acc[key] : null), object);
}

function formatTimelineTimestamp(value) {
if (!value) return null;
let date = null;
if (value instanceof Date) {
date = value;
} else if (typeof value.toDate === 'function') {
date = value.toDate();
} else if (typeof value === 'object' && typeof value.seconds === 'number') {
date = new Date(value.seconds * 1000);
} else if (typeof value === 'string' || typeof value === 'number') {
const parsed = new Date(value);
if (!Number.isNaN(parsed)) {
date = parsed;
}
}
if (!date || Number.isNaN(date.getTime())) return null;
return date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function buildTimeline(definition, order) {
const currentStatus = order.status || 'order_pending';
const currentIndex = getStatusIndex(currentStatus);
let allPreviousComplete = true;

return definition.map((step) => {
let stepComplete = false;
if (typeof step.isComplete === 'function') {
stepComplete = step.isComplete(order, currentStatus, currentIndex);
} else if (step.completedFromStatus) {
stepComplete = currentIndex >= getStatusIndex(step.completedFromStatus);
}
if (!stepComplete && Array.isArray(step.extraCompleteStatuses)) {
stepComplete = step.extraCompleteStatuses.some(status => currentIndex >= getStatusIndex(status));
}

let state = 'pending';
if (stepComplete) {
state = 'complete';
} else if (allPreviousComplete) {
state = 'current';
}

allPreviousComplete = allPreviousComplete && stepComplete;

const timestamp = (() => {
if (typeof step.timestampResolver === 'function') {
return step.timestampResolver(order, currentStatus);
}
if (Array.isArray(step.timestampFields)) {
for (const field of step.timestampFields) {
const rawValue = resolvePath(order, field);
const formatted = formatTimelineTimestamp(rawValue);
if (formatted) {
return formatted;
}
}
}
return null;
})();

return {
id: step.id,
title: step.title,
description: step.description,
state,
timestamp
};
});
}

function renderTimeline(container, steps) {
if (!container) return;
container.innerHTML = '';
steps.forEach((step) => {
const item = document.createElement('li');
item.className = 'progress-step';
if (step.state === 'complete') {
item.classList.add('is-complete');
} else if (step.state === 'current') {
item.classList.add('is-current');
}

const titleRow = document.createElement('div');
titleRow.className = 'progress-step-title';

const titleText = document.createElement('span');
titleText.textContent = step.title;
titleRow.appendChild(titleText);

const meta = document.createElement('span');
meta.className = 'progress-meta';

if (step.state === 'complete') {
const badge = document.createElement('span');
badge.className = 'progress-state complete';
badge.textContent = 'Done';
meta.appendChild(badge);
} else if (step.state === 'current') {
const badge = document.createElement('span');
badge.className = 'progress-state current';
badge.textContent = 'In progress';
meta.appendChild(badge);
}

if (step.timestamp) {
const time = document.createElement('span');
time.className = 'progress-step-time';
time.textContent = step.timestamp;
meta.appendChild(time);
}

if (meta.childNodes.length) {
titleRow.appendChild(meta);
}

item.appendChild(titleRow);

if (step.description) {
const desc = document.createElement('p');
desc.className = 'progress-step-desc';
desc.textContent = step.description;
item.appendChild(desc);
}

container.appendChild(item);
});
}

const SHIPPING_TIMELINE_DEFINITION = [
{
id: 'order-placed',
title: 'Order placed',
description: 'We saved your device details and generated the initial quote.',
completedFromStatus: 'order_pending',
timestampFields: ['createdAt']
},
{
id: 'kit-prepared',
title: 'Kit or label prepared',
description: 'Your shipping kit or email label is ready to go.',
completedFromStatus: 'label_generated',
timestampFields: ['labelGeneratedAt', 'needsPrintingAt', 'kitSentAt']
},
{
id: 'in-transit',
title: 'On the way to us',
description: 'Track your package as it travels to our lab.',
completedFromStatus: 'kit_in_transit',
timestampFields: ['kitSentAt', 'kitTrackingStatus.lastUpdated', 'kitTrackingLastRefreshedAt']
},
{
id: 'device-received',
title: 'Device received',
description: 'Our technicians will inspect your device and follow up.',
completedFromStatus: 'received',
timestampFields: ['deviceReceivedAt', 'receivedAt', 'lastStatusUpdateAt']
}
];

const PAYOUT_TIMELINE_DEFINITION = [
{
id: 'inspection',
title: 'Inspection in progress',
description: 'We are verifying the condition details you provided.',
completedFromStatus: 'received',
timestampFields: ['receivedAt', 'lastStatusUpdateAt']
},
{
id: 'offer',
title: 'Offer decision',
description: 'Any adjustments are shared for your approval.',
completedFromStatus: 're-offered-accepted',
extraCompleteStatuses: ['re-offered-auto-accepted', 're-offered-declined', 'completed', 'return-label-generated'],
timestampFields: ['reOffer.updatedAt', 'reOffer.createdAt', 'reOffer.autoAcceptDate']
},
{
id: 'payout',
title: 'Payout or return arranged',
description: 'We send your payout or prepare a return label once everything is finalized.',
completedFromStatus: 'completed',
extraCompleteStatuses: ['return-label-generated'],
isComplete(order, status, currentIndex) {
if (order.returnLabelUrl) return true;
return currentIndex >= getStatusIndex('completed');
},
timestampFields: ['payoutReleasedAt', 'completedAt', 'returnLabelIssuedAt', 'lastStatusUpdateAt']
}
];

// --- Tab and UI Logic ---

function showTab(tabToShow) {
accountInfoSection.classList.add('hidden');
orderHistorySection.classList.add('hidden');
accountInfoTab.classList.remove('active');
orderHistoryTab.classList.remove('active');

if (tabToShow === 'accountInfo') {
accountInfoSection.classList.remove('hidden');
accountInfoTab.classList.add('active');
} else if (tabToShow === 'orderHistory') {
orderHistorySection.classList.remove('hidden');
orderHistoryTab.classList.add('active');
if (currentUserId) {
loadOrders(currentUserId);
}
}
clearMessage();
}

accountInfoTab.addEventListener('click', () => showTab('accountInfo'));
orderHistoryTab.addEventListener('click', () => showTab('orderHistory'));

// --- Firebase Functions ---

async function handleLogout() {
try {
await signOut(auth);
} catch (error) {
console.error("Logout error:", error);
showMessage('Failed to log out. Please try again.', 'error');
}
}

function loadOrders(userId) {
if (!userId) {
ordersTableBody.innerHTML = '';
noOrdersMessage.classList.remove('hidden');
return;
}

const ordersCollectionRef = collection(db, 'orders');
const userOrdersQuery = query(ordersCollectionRef, where('userId', '==', userId));

onSnapshot(userOrdersQuery, (snapshot) => {
ordersTableBody.innerHTML = '';
if (snapshot.empty) {
noOrdersMessage.classList.remove('hidden');
} else {
noOrdersMessage.classList.add('hidden');
snapshot.forEach(doc => {
const order = doc.data();

let displayQuote = order.estimatedQuote || 0;
if (order.status === 're-offered-accepted' || order.status === 're-offered-auto-accepted') {
displayQuote = order.reOffer?.newPrice || displayQuote;
}

const row = document.createElement('tr');
row.className = 'border-b border-slate-200 hover:bg-slate-50 cursor-pointer';
row.dataset.orderId = doc.id;

row.innerHTML = `
<td class="py-3 px-6 text-left" data-label="Order ID">${doc.id}</td>
<td class="py-3 px-6 text-left" data-label="Date">${formatDate(order.createdAt)}</td>
<td class="py-3 px-6 text-left" data-label="Device">${order.device || 'N/A'}</td>
<td class="py-3 px-6 text-left" data-label="Quote">$${displayQuote.toFixed(2)}</td>
<td class="py-3 px-6 text-center" data-label="Status">
<span class="status-badge ${getStatusBadgeClass(order.status)}">${formatStatus(order.status)}</span>
</td>
<td class="py-3 px-6 text-center" data-label="Actions">
<button data-order-id="${doc.id}" class="view-details-btn text-blue-600 hover:text-blue-800 font-medium text-xs px-2 py-1 rounded-md bg-blue-100 hover:bg-blue-200 transition duration-200">View Details</button>
</td>
`;
ordersTableBody.appendChild(row);
});
document.querySelectorAll('.view-details-btn').forEach(button => {
button.addEventListener('click', (event) => {
event.stopPropagation();
openOrderDetailsModal(event.target.dataset.orderId);
});
});
document.querySelectorAll('#ordersTableBody tr').forEach(row => {
row.addEventListener('click', (event) => {
if (!event.target.closest('.view-details-btn')) {
openOrderDetailsModal(row.dataset.orderId);
}
});
});
}
}, (error) => {
console.error("Error fetching orders:", error);
showMessage('Failed to load orders. Please try again.', 'error');
ordersTableBody.innerHTML = '';
noOrdersMessage.classList.remove('hidden');
});
}

async function saveAccountInfo(userId, newName, phoneNumber) {
if (!userId) {
showMessage('User not authenticated. Please log in.', 'error');
return;
}
saveInfoBtn.disabled = true;
saveInfoBtn.textContent = 'Saving...';
clearMessage();

try {
if (auth.currentUser && newName !== auth.currentUser.displayName) {
await updateProfile(auth.currentUser, { displayName: newName });
userName.textContent = newName;
}

const userDocRef = doc(db, `users/${userId}`);
await setDoc(userDocRef, { phoneNumber: phoneNumber }, { merge: true });

showMessage('Account information saved successfully!', 'success');
} catch (error) {
console.error("Error saving account info:", error);
showMessage('Failed to save account information. Please try again.', 'error');
} finally {
saveInfoBtn.disabled = false;
saveInfoBtn.textContent = 'Save Changes';
}
}

// --- General Modal Functions ---
const openModal = (modalElement) => {
modalElement.classList.add('is-visible');
};
const closeModal = (modalElement) => {
modalElement.classList.remove('is-visible');
};

document.querySelectorAll('.close-modal-btn').forEach(button => {
button.addEventListener('click', (e) => {
const modal = e.target.closest('.modal');
if (modal) {
closeModal(modal);
}
});
});

modals.forEach(modal => {
modal.addEventListener('click', (e) => {
if (e.target === modal) {
closeModal(modal);
}
});
});

// --- Specific Modal Triggers ---
loginNavBtn.addEventListener('click', (e) => { e.preventDefault(); openModal(loginModal); });
document.getElementById('aboutUsLink').addEventListener('click', (e) => { e.preventDefault(); openModal(aboutUsModal); });
document.getElementById('privacyPolicyLink').addEventListener('click', (e) => { e.preventDefault(); openModal(privacyPolicyModal); });
document.getElementById('termsAndConditionsLink').addEventListener('click', (e) => { e.preventDefault(); openModal(termsAndConditionsModal); });

// --- Order Details Modal Functions ---

async function openOrderDetailsModal(orderId) {
modalActionButtons.innerHTML = '';
modalLoadingMessage.classList.add('hidden');
modalMessage.classList.add('hidden');
modalMessage.textContent = '';
modalVenmoUsernameRow.classList.add('hidden');
reOfferDetails.classList.add('hidden');
labelInfoSection.classList.add('hidden');
outboundLabelRow.classList.add('hidden');
inboundLabelRow.classList.add('hidden');
uspsLabelRow.classList.add('hidden');
returnLabelRow.classList.add('hidden');
if (orderProgressSection) {
orderProgressSection.classList.add('hidden');
}
if (shippingTimeline) {
shippingTimeline.innerHTML = '';
}
if (payoutTimeline) {
payoutTimeline.innerHTML = '';
}

openModal(orderDetailsModal);
modalLoadingMessage.classList.remove('hidden');

try {
const response = await fetch(`${BACKEND_BASE_URL}/orders/${orderId}`);
if (!response.ok) {
const errorText = await response.text();
throw new Error(`Failed to fetch order details: ${response.status} - ${errorText.substring(0, 100)}`);
}
const order = await response.json();

modalOrderId.textContent = order.id;
modalCustomerName.textContent = order.shippingInfo?.fullName || 'N/A';
modalCustomerEmail.textContent = order.shippingInfo?.email || 'N/A';
modalItem.textContent = order.device || 'N/A';
modalStorage.textContent = order.storage || 'N/A';
modalCarrier.textContent = order.carrier || 'N/A';
modalPrice.textContent = order.estimatedQuote ? order.estimatedQuote.toFixed(2) : '0.00';
modalPaymentMethod.textContent = order.paymentMethod ? formatCondition(order.paymentMethod) : 'N/A';
if (order.paymentMethod === 'venmo' && order.paymentDetails?.venmoUsername) {
modalVenmoUsername.textContent = order.paymentDetails.venmoUsername;
modalVenmoUsernameRow.classList.remove('hidden');
}
modalShippingAddress.textContent = order.shippingInfo ? `${order.shippingInfo.streetAddress}, ${order.shippingInfo.city}, ${order.shippingInfo.state}, ${order.shippingInfo.zipCode}` : 'N/A';
modalConditionPowerOn.textContent = order.condition_power_on ? formatCondition(order.condition_power_on) : 'N/A';
modalConditionFunctional.textContent = order.condition_functional ? formatCondition(order.condition_functional) : 'N/A';
modalConditionCracks.textContent = order.condition_cracks ? formatCondition(order.condition_cracks) : 'N/A';
modalConditionCosmetic.textContent = order.condition_cosmetic ? formatCondition(order.condition_cosmetic) : 'N/A';

modalStatus.textContent = formatStatus(order.status);
modalStatus.className = `status-badge ${getStatusBadgeClass(order.status)}`;

if (order.reOffer && (order.status === 're-offered-pending' || order.status === 're-offered-accepted' || order.status === 're-offered-auto-accepted' || order.status === 're-offered-declined')) {
reOfferDetails.classList.remove('hidden');
reOfferNewPrice.textContent = order.reOffer.newPrice ? order.reOffer.newPrice.toFixed(2) : 'N/A';
reOfferReasons.textContent = order.reOffer.reasons?.join(', ') || 'N/A';
if (order.reOffer.comments) {
reOfferComments.textContent = order.reOffer.comments;
reOfferCommentsRow.classList.remove('hidden');
} else {
reOfferCommentsRow.classList.add('hidden');
}
if (order.reOffer.autoAcceptDate) {
reOfferAutoAcceptDate.textContent = formatDate(order.reOffer.autoAcceptDate);
reOfferAutoAcceptDateRow.classList.remove('hidden');
} else {
reOfferAutoAcceptDateRow.classList.add('hidden');
}
}

if (order.shippingPreference === 'Shipping Kit Requested') {
labelInfoSection.classList.remove('hidden');
if (order.outboundTrackingNumber) {
outboundTrackingLink.href = `https://tools.usps.com/go/TrackConfirmAction?qtc_tLabels1=${order.outboundTrackingNumber}`;
outboundTrackingLink.textContent = order.outboundTrackingNumber;
outboundLabelRow.classList.remove('hidden');
}
if (order.inboundLabelUrl) {
inboundLabelLink.href = order.inboundLabelUrl;
inboundTrackingNumber.textContent = order.inboundTrackingNumber || 'N/A';
inboundLabelRow.classList.remove('hidden');
}
} else if (order.shippingPreference === 'Email Label Requested' && order.uspsLabelUrl) {
labelInfoSection.classList.remove('hidden');
uspsLabelLink.href = order.uspsLabelUrl;
uspsTrackingNumber.textContent = order.trackingNumber || 'N/A';
uspsLabelRow.classList.remove('hidden');
}

if (order.returnLabelUrl) {
labelInfoSection.classList.remove('hidden');
returnLabelLink.href = order.returnLabelUrl;
returnTrackingNumber.textContent = order.returnTrackingNumber || 'N/A';
returnLabelRow.classList.remove('hidden');
}

if (orderProgressSection && shippingTimeline && payoutTimeline) {
const shippingSteps = buildTimeline(SHIPPING_TIMELINE_DEFINITION, order);
const payoutSteps = buildTimeline(PAYOUT_TIMELINE_DEFINITION, order);
renderTimeline(shippingTimeline, shippingSteps);
renderTimeline(payoutTimeline, payoutSteps);
orderProgressSection.classList.remove('hidden');
}

renderModalActionButtons(order);

} catch (error) {
console.error("Action error:", error);
displayModalMessage(`Error: ${error.message}`, 'error');
} finally {
modalLoadingMessage.classList.add('hidden');
}
}

function renderModalActionButtons(order) {
modalActionButtons.innerHTML = '';
const createButton = (text, onClick, className = 'bg-blue-600 hover:bg-blue-700') => {
const button = document.createElement('button');
button.textContent = text;
button.className = `${className} text-white font-bold py-2 px-4 rounded-md transition-colors duration-200 shadow`;
button.onclick = onClick;
return button;
};

if (order.status === 're-offered-pending') {
modalActionButtons.appendChild(createButton('Accept New Offer', () => handleModalAction(order.id, 'acceptOffer'), 'bg-green-600 hover:bg-green-700'));
modalActionButtons.appendChild(createButton('Return My Phone', () => handleModalAction(order.id, 'returnPhone'), 'bg-red-600 hover:bg-red-700'));
} else if (order.status === 'label_generated' && order.uspsLabelUrl) {
modalActionButtons.appendChild(createButton('Print Shipping Label', () => window.open(order.uspsLabelUrl, '_blank')));
} else if (order.status === 'shipping_kit_requested' && order.outboundTrackingNumber) {
modalActionButtons.appendChild(createButton('Track Shipping Kit', () => window.open(`https://tools.usps.com/go/TrackConfirmAction?qtc_tLabels1=${order.outboundTrackingNumber}`, '_blank')));
} else if (order.status === 're-offered-declined' && order.returnLabelUrl) {
modalActionButtons.appendChild(createButton('Print Return Label', () => window.open(order.returnLabelUrl, '_blank'), 'bg-red-600 hover:bg-red-700'));
}
}

async function handleModalAction(orderId, actionType) {
modalLoadingMessage.classList.remove('hidden');
modalActionButtons.classList.add('hidden');
modalMessage.classList.add('hidden');
modalMessage.textContent = '';

try {
let url;
let method = 'POST';
let body = { orderId: orderId };

switch(actionType) {
case 'acceptOffer':
url = `${BACKEND_BASE_URL}/accept-offer-action`;
break;
case 'returnPhone':
url = `${BACKEND_BASE_URL}/return-phone-action`;
break;
default:
throw new Error('Unknown action.');
}

const response = await fetch(url, {
method: method,
headers: { 'Content-Type': 'application/json' },
body: JSON.stringify(body)
});

if (!response.ok) {
const errorText = await response.text();
throw new Error(errorText || `Failed to perform action: ${response.status} - ${errorText.substring(0, 100)}`);
}
const result = await response.json();

displayModalMessage(result.message, 'success');
openOrderDetailsModal(orderId);

} catch (error) {
console.error("Action error:", error);
displayModalMessage(`Error: ${error.message}`, 'error');
} finally {
modalLoadingMessage.classList.add('hidden');
}
}

function displayModalMessage(message, type) {
modalMessage.textContent = message;
modalMessage.className = `mt-4 p-3 text-sm rounded-md`;
if (type === 'success') {
modalMessage.classList.add('bg-green-100', 'text-green-700');
} else if (type === 'error') {
modalMessage.classList.add('bg-red-100', 'text-red-700');
}
modalMessage.classList.remove('hidden');
}

// --- Event Listeners for Auth Modals ---
loginTabBtn.addEventListener('click', () => showAuthTab('login'));
signupTabBtn.addEventListener('click', () => showAuthTab('signup'));
forgotPasswordLink.addEventListener('click', (e) => { e.preventDefault(); showAuthTab('forgotPassword'); });
returnToLoginLink.addEventListener('click', (e) => { e.preventDefault(); showAuthTab('login'); });
switchToLoginLink.addEventListener('click', (e) => { e.preventDefault(); showAuthTab('login'); });

const googleProvider = new GoogleAuthProvider();
const signInWithGoogle = async () => {
try {
authMessage.classList.add('hidden');
await signInWithPopup(auth, googleProvider);
} catch (error) { showAuthMessage(`Google sign-in failed: ${error.message}`, 'error'); }
};
googleLoginBtn.addEventListener('click', signInWithGoogle);
googleSignupBtn.addEventListener('click', signInWithGoogle);

loginForm.addEventListener('submit', async (e) => {
e.preventDefault();
const email = document.getElementById('loginEmail').value;
const password = document.getElementById('loginPassword').value;
try {
showAuthMessage('Logging in...', 'info');
await signInWithEmailAndPassword(auth, email, password);
} catch (error) { showAuthMessage(`Login failed: ${error.message}`, 'error'); }
});

signupForm.addEventListener('submit', async (e) => {
e.preventDefault();
const name = document.getElementById('signupName').value;
const email = document.getElementById('signupEmail').value;
const password = document.getElementById('signupPassword').value;
if (password.length < 6) { showAuthMessage('Password must be at least 6 characters.', 'error'); return; }
try {
showAuthMessage('Creating account...', 'info');
const userCredential = await createUserWithEmailAndPassword(auth, email, password);
await updateProfile(userCredential.user, { displayName: name });
} catch (error) { showAuthMessage(`Sign up failed: ${error.message}`, 'error'); }
});

forgotPasswordForm.addEventListener('submit', async (e) => {
e.preventDefault();
const email = document.getElementById('forgotEmail').value;
try {
showAuthMessage('Sending reset email...', 'info');
await sendPasswordResetEmail(auth, email);
showAuthMessage('Password reset email sent! Check your inbox.', 'success');
} catch (error) { showAuthMessage(`Failed to send email: ${error.message}`, 'error'); }
});

const showAuthTab = (tabName) => {
authMessage.classList.add('hidden');
[loginForm, signupForm, forgotPasswordForm].forEach(form => form.classList.add('hidden'));
[loginTabBtn, signupTabBtn].forEach(btn => {
btn.classList.remove('border-blue-600', 'text-blue-600');
btn.classList.add('border-transparent', 'text-slate-500');
});
if (tabName === 'login') { loginForm.classList.remove('hidden'); loginTabBtn.classList.add('border-blue-600', 'text-blue-600'); }
else if (tabName === 'signup') { signupForm.classList.remove('hidden'); signupTabBtn.classList.add('border-blue-600', 'text-blue-600'); }
else if (tabName === 'forgotPassword') { forgotPasswordForm.classList.remove('hidden'); }
};

const showAuthMessage = (msg, type) => {
authMessage.textContent = msg;
authMessage.className = 'mt-4 p-3 rounded-lg text-sm text-center w-full';
if (type === 'error') authMessage.classList.add('bg-red-100', 'text-red-700');
else if (type === 'success') authMessage.classList.add('bg-green-100', 'text-green-700');
else authMessage.classList.add('bg-blue-100', 'text-blue-700');
authMessage.classList.remove('hidden');
};

// --- Event Listeners ---

userMonogram.addEventListener('click', (e) => {
e.stopPropagation();
authDropdown.classList.toggle('hidden');
});

document.addEventListener('click', (e) => {
const authStatusContainer = document.getElementById('authStatusContainer');
if (authStatusContainer && !authStatusContainer.contains(e.target)) {
authDropdown.classList.add('hidden');
}
});

logoutButton.addEventListener('click', handleLogout);

saveInfoBtn.addEventListener('click', () => {
if (currentUserId) {
const newName = userName.textContent;
saveAccountInfo(currentUserId, newName, userPhoneInput.value);
} else {
showMessage('Please log in to save your information.', 'error');
}
});

footerEmailSignupForm.addEventListener('submit', async (e) => {
e.preventDefault();
const email = document.getElementById('footerPromoEmail').value;
footerSignupMessage.textContent = 'Submitting...';
footerSignupMessage.className = 'mt-3 text-sm text-center text-blue-300';

try {
await addDoc(collection(db, "signed_up_emails"), {
email: email,
timestamp: new Date()
});
footerSignupMessage.textContent = 'Success! Thanks for signing up.';
footerSignupMessage.className = 'mt-3 text-sm text-center text-green-300';
footerEmailSignupForm.reset();
} catch (error) {
console.error("Error adding document: ", error);
footerSignupMessage.textContent = 'Error: Could not sign up.';
footerSignupMessage.className = 'mt-3 text-sm text-center text-red-300';
}
});

// --- Main Auth State Listener ---

onAuthStateChanged(auth, async (user) => {
if (user) {
currentUserId = user.uid;

loginNavBtn.classList.add('hidden');
userMonogram.classList.remove('hidden');

const name = user.displayName || user.email;
const initials = name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
userMonogram.textContent = initials;

userName.textContent = user.displayName || 'N/A';
userEmail.textContent = user.email || 'N/A';

const userDocRef = doc(db, `users/${currentUserId}`);
try {
const docSnap = await getDoc(userDocRef);
if (docSnap.exists() && docSnap.data().phoneNumber) {
userPhoneInput.value = docSnap.data().phoneNumber;
} else {
userPhoneInput.value = '';
}
} catch (error) {
console.error("Error fetching user profile:", error);
showMessage('Could not load phone number.', 'error');
}

showTab(initialTab);
closeModal(loginModal);

} else {
window.location.replace(window.location.origin + '/index.html');
}
});
