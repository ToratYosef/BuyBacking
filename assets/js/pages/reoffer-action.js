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
let focusedMultiOfferDeviceKey = null;
let lastLoadedReofferOrder = null;
let expiredOfferRefreshAttempted = false;

const normalizeReofferStatus = (value) => String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
const isPendingReofferStatus = (value) => normalizeReofferStatus(value) === 're_offered_pending';
const isAcceptedReofferStatus = (value) => ['re_offered_accepted', 're_offered_auto_accepted', 'requote_accepted'].includes(normalizeReofferStatus(value));
const isDeclinedReofferStatus = (value) => normalizeReofferStatus(value) === 're_offered_declined';


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
const deviceSummaryList = document.getElementById('deviceSummaryList');
const multiOfferSection = document.getElementById('multiOfferSection');
const multiOfferList = document.getElementById('multiOfferList');
const singleOfferSection = document.getElementById('singleOfferSection');

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

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => (
({
'&': '&amp;',
'<': '&lt;',
'>': '&gt;',
'"': '&quot;',
"'": '&#39;',
}[character])
));

const prettifyStatus = (value) => String(value || '')
.trim()
.replace(/[_-]+/g, ' ')
.replace(/\b\w/g, (letter) => letter.toUpperCase()) || 'Status On File';

const normalizeConditionLabel = (value) => {
const normalized = String(value || '').trim().toLowerCase();
if (!normalized) return 'Condition On File';
if (normalized === 'no_power' || normalized === 'no power' || normalized === 'no power / severely damaged') {
return 'No Power / Severely Damaged';
}
return normalized.replace(/[_-]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
};

const resolveOrderDeviceEntries = (order = {}) => {
const items = Array.isArray(order?.items) && order.items.length
? order.items
: [order];

return items.map((item, index) => {
const fallbackKey = `${order?.id || 'order'}::${index}`;
const deviceKey = String(item?.deviceKey || item?.id || fallbackKey).trim();
const offer = order?.reOfferByDevice?.[deviceKey] || order?.reofferByDevice?.[deviceKey] || null;
const deviceStatus = order?.deviceStatusByKey?.[deviceKey] || order?.status || '';
const modelName = item?.modelName || item?.model || item?.device || order?.device || `Device ${index + 1}`;
const metaParts = [
item?.brand || order?.brand || '',
item?.storage || order?.storage || '',
item?.carrier || item?.lock || order?.carrier || order?.lock || '',
].filter(Boolean);

return {
deviceKey,
index,
modelName,
condition: item?.condition || order?.condition || '',
metaLabel: metaParts.join(' • '),
offer,
deviceStatus,
};
});
};

const renderOrderDeviceSummary = (order, selectedDeviceKey) => {
if (!deviceSummaryList) return;

const entries = resolveOrderDeviceEntries(order);
if (!entries.length) {
deviceSummaryList.innerHTML = '';
return;
}

deviceSummaryList.innerHTML = entries.map((entry) => {
const hasReoffer = Boolean(entry.offer);
const isActiveReofferDevice = selectedDeviceKey
? String(entry.deviceKey) === String(selectedDeviceKey)
: hasReoffer;
const offerAmount = entry.offer?.newPrice;
const originalAmount = resolveOriginalOfferAmount(order, entry.offer, entry.deviceKey);
const statusLabel = prettifyStatus(entry.deviceStatus);
const jumpAttr = hasReoffer ? `data-reoffer-jump="${escapeHtml(entry.deviceKey)}"` : 'disabled';

return `
<button type="button" class="device-summary-card${hasReoffer ? ' device-summary-card--active' : ''}${isActiveReofferDevice ? ' device-summary-card--linked' : ''}" data-device-summary-key="${escapeHtml(entry.deviceKey)}" ${jumpAttr}>
<div class="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
<div class="min-w-0">
<p class="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">Device ${entry.index + 1}</p>
<h3 class="mt-2 text-lg font-extrabold text-slate-900">${escapeHtml(entry.modelName)}</h3>
<p class="device-summary-meta">${escapeHtml(entry.metaLabel || 'Specs on file')}</p>
<div class="device-summary-badges">
<span class="device-summary-badge ${hasReoffer ? 'device-summary-badge--active' : 'device-summary-badge--neutral'}">${hasReoffer ? 'This Device Was Re-Offered' : 'Not This Re-Offer'}</span>
<span class="device-summary-badge device-summary-badge--status">${escapeHtml(statusLabel)}</span>
<span class="device-summary-badge device-summary-badge--neutral">${escapeHtml(normalizeConditionLabel(entry.condition))}</span>
</div>
</div>
<div class="md:text-right">
<p class="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">${hasReoffer ? 'Re-Offered To' : 'Current Offer'}</p>
<p class="mt-2 text-2xl font-extrabold ${hasReoffer ? 'text-emerald-700' : 'text-slate-900'}">${formatMoney(hasReoffer ? offerAmount : originalAmount)}</p>
${hasReoffer ? `<p class="mt-2 text-sm text-slate-500">Originally ${escapeHtml(formatMoney(originalAmount))}</p>` : ''}
</div>
</div>
</button>
`;
}).join('');
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
const sourceOffer = deviceOffer || order?.reOffer || order?.reoffer || null;

if (!sourceOffer) return null;
const explicit = extractTimestampMillis(sourceOffer.autoAcceptDate);
if (explicit) return explicit;
const created = extractTimestampMillis(sourceOffer.createdAt);
return created ? created + AUTO_ACCEPT_WINDOW_MS : null;
};

const getPendingReofferEntries = (order = {}) => {
const byDeviceOffers = order?.reOfferByDevice || order?.reofferByDevice || {};
const orderDeviceEntries = resolveOrderDeviceEntries(order);
const deviceMetaByKey = new Map(orderDeviceEntries.map((entry) => [entry.deviceKey, entry]));

return Object.entries(byDeviceOffers)
.map(([deviceKey, offer]) => {
const status = order?.deviceStatusByKey?.[deviceKey] || order?.status || '';
if (!isPendingReofferStatus(status)) return null;
const deviceMeta = deviceMetaByKey.get(deviceKey) || null;
return {
deviceKey,
offer: offer || {},
status,
deviceMeta,
deadline: getAutoAcceptDeadline(order, deviceKey),
originalAmount: resolveOriginalOfferAmount(order, offer, deviceKey),
newAmount: firstValidAmount(offer?.newPrice),
};
})
.filter(Boolean);
};

const formatDeadlineLabel = (deadlineMs) => {
if (!deadlineMs) return 'Decision window unavailable';
const remaining = deadlineMs - Date.now();
if (remaining <= 0) return 'Decision window expired';
return `${formatTimeRemaining(remaining)} remaining`;
};

const renderMultiOfferState = (order, pendingEntries) => {
if (!multiOfferSection || !multiOfferList) return;

multiOfferSection.classList.remove('hidden');
multiOfferList.innerHTML = pendingEntries.map((entry, index) => {
const reasons = Array.isArray(entry.offer?.reasons) ? entry.offer.reasons.filter(Boolean).join(', ') : 'No reason provided.';
const comments = entry.offer?.comments || 'No additional notes provided by our team.';
const modelName = entry.deviceMeta?.modelName || `Device ${index + 1}`;
const metaBits = [
entry.deviceMeta?.metaLabel || '',
normalizeConditionLabel(entry.deviceMeta?.condition || ''),
].filter(Boolean).join(' • ');
const isFocused = focusedMultiOfferDeviceKey
? String(focusedMultiOfferDeviceKey) === String(entry.deviceKey)
: false;

return `
<div id="reoffer-card-${escapeHtml(entry.deviceKey)}" data-multi-offer-card="${escapeHtml(entry.deviceKey)}" class="multi-offer-card${isFocused ? ' multi-offer-card--focused' : ''}">
<div class="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
<div>
<p class="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">Re-Offer For Device ${Number((entry.deviceMeta?.index ?? index)) + 1}</p>
<h3 class="mt-2 text-xl font-extrabold text-slate-900">${escapeHtml(modelName)}</h3>
<p class="mt-2 text-sm text-slate-600">${escapeHtml(metaBits || 'Specs on file')}</p>
</div>
<div class="inline-flex items-center rounded-full bg-amber-100 px-3 py-1 text-xs font-bold uppercase tracking-[0.14em] text-amber-800">
${escapeHtml(formatDeadlineLabel(entry.deadline))}
</div>
</div>
<div class="multi-offer-price-grid">
<div class="multi-offer-price-box">
<p class="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">Original Quote</p>
<p class="mt-2 text-2xl font-extrabold text-slate-900">${formatMoney(entry.originalAmount)}</p>
</div>
<div class="multi-offer-price-box">
<p class="text-xs font-bold uppercase tracking-[0.16em] text-emerald-700">New Offer</p>
<p class="mt-2 text-2xl font-extrabold text-emerald-700">${formatMoney(entry.newAmount)}</p>
</div>
</div>
<div class="mt-4 grid gap-4 md:grid-cols-2">
<div class="card-panel">
<h4 class="section-heading">Reason For Re-Offer</h4>
<p class="section-body mt-3">${escapeHtml(reasons)}</p>
</div>
<div class="card-panel">
<h4 class="section-heading">Inspector Notes</h4>
<p class="section-body mt-3">${escapeHtml(comments)}</p>
</div>
</div>
<div class="multi-offer-actions">
<button type="button" class="action-btn w-full bg-emerald-600 px-6 py-4 text-white transition hover:bg-emerald-700" data-reoffer-action="accept-offer" data-device-key="${escapeHtml(entry.deviceKey)}">Accept Revised Offer</button>
<button type="button" class="action-btn w-full bg-rose-600 px-6 py-4 text-white transition hover:bg-rose-700" data-reoffer-action="return-phone" data-device-key="${escapeHtml(entry.deviceKey)}">Decline &amp; Return Device</button>
</div>
</div>
`;
}).join('');
};

const syncFocusedOfferUi = (deviceKey, { shouldScroll = true, updateUrl = true } = {}) => {
focusedMultiOfferDeviceKey = deviceKey ? String(deviceKey) : null;

if (deviceSummaryList) {
Array.from(deviceSummaryList.querySelectorAll('[data-device-summary-key]')).forEach((element) => {
const isFocused = focusedMultiOfferDeviceKey && element.getAttribute('data-device-summary-key') === focusedMultiOfferDeviceKey;
element.classList.toggle('device-summary-card--linked', Boolean(isFocused));
});
}

if (multiOfferList) {
Array.from(multiOfferList.querySelectorAll('[data-multi-offer-card]')).forEach((element) => {
const isFocused = focusedMultiOfferDeviceKey && element.getAttribute('data-multi-offer-card') === focusedMultiOfferDeviceKey;
element.classList.toggle('multi-offer-card--focused', Boolean(isFocused));
});
}

if (focusedMultiOfferDeviceKey && updateUrl) {
const url = new URL(window.location.href);
url.searchParams.set('deviceKey', focusedMultiOfferDeviceKey);
window.history.replaceState({}, '', url.toString());
}

if (!focusedMultiOfferDeviceKey || !shouldScroll) return;
const target = document.getElementById(`reoffer-card-${focusedMultiOfferDeviceKey}`);
if (!target) return;
requestAnimationFrame(() => {
target.scrollIntoView({ behavior: 'smooth', block: 'start' });
});
};

const focusMultiOfferCard = (deviceKey) => {
syncFocusedOfferUi(deviceKey, { shouldScroll: true, updateUrl: true });
};

const renderConfirmationState = (status, orderId) => {
offerDetailsState.classList.add('hidden');
loadingState.classList.add('hidden');
confirmationState.classList.remove('hidden');
confirmPrompt.classList.add('hidden');
actionButtonsDiv.classList.add('hidden');
clearInterval(countdownInterval);
countdownContainer.classList.add('hidden');
multiOfferSection?.classList.add('hidden');
singleOfferSection?.classList.add('hidden');

const accepted = isAcceptedReofferStatus(status);
const declined = isDeclinedReofferStatus(status);

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
multiOfferSection?.classList.add('hidden');
singleOfferSection?.classList.remove('hidden');

try {
const currentOrderData = await apiGet(`/orders/${orderId}`, { authRequired: false });
lastLoadedReofferOrder = currentOrderData;
const pendingEntries = getPendingReofferEntries(currentOrderData);
const hasMultiplePendingEntries = pendingEntries.length > 1;
const resolvedDeviceKey = hasMultiplePendingEntries
? ''
: (selectedDeviceKey || (pendingEntries.length === 1 ? pendingEntries[0].deviceKey : ''));
const effectiveSelectedDeviceKey = hasMultiplePendingEntries
? (selectedDeviceKey || pendingEntries[0]?.deviceKey || '')
: resolvedDeviceKey;
const deviceOffer = effectiveSelectedDeviceKey
? (currentOrderData?.reOfferByDevice?.[effectiveSelectedDeviceKey] || currentOrderData?.reofferByDevice?.[effectiveSelectedDeviceKey] || null)
: null;
const effectiveOffer = resolvedDeviceKey
? (currentOrderData?.reOfferByDevice?.[resolvedDeviceKey] || currentOrderData?.reofferByDevice?.[resolvedDeviceKey] || null)
: null;
const deviceStatus = resolvedDeviceKey
? (currentOrderData?.deviceStatusByKey?.[resolvedDeviceKey] || currentOrderData?.status)
: currentOrderData?.status;

orderIdDisplay.textContent = `#${orderId}`;
const offerToDisplay = effectiveOffer || currentOrderData.reOffer || null;
const newOfferAmount = firstValidAmount(offerToDisplay?.newPrice, currentOrderData?.estimatedQuote);
const originalAmount = resolveOriginalOfferAmount(currentOrderData, offerToDisplay, resolvedDeviceKey);

newOfferPrice.textContent = formatMoney(newOfferAmount);
oldOfferPrice.textContent = formatMoney(originalAmount);

const reasons = Array.isArray(offerToDisplay?.reasons) ? offerToDisplay.reasons.filter(Boolean) : [];
reofferReason.textContent = reasons.length ? reasons.join('\n') : 'No reason was provided.';
reofferReason.style.whiteSpace = 'pre-line';
reofferComments.textContent = offerToDisplay?.comments || 'No additional notes provided by our team.';
buyerNameSpan.textContent = currentOrderData.shippingInfo?.fullName || 'Customer';
renderOrderDeviceSummary(currentOrderData, effectiveSelectedDeviceKey);
buildSupportContactLinks({
orderId,
customerName: currentOrderData.shippingInfo?.fullName || 'Customer',
});

loadingState.classList.add('hidden');

const autoAcceptDeadline = getAutoAcceptDeadline(currentOrderData, resolvedDeviceKey);

if (hasMultiplePendingEntries) {
offerDetailsState.classList.remove('hidden');
replySection.classList.remove('hidden');
actionButtonsDiv.classList.add('hidden');
countdownContainer.classList.add('hidden');
multiOfferSection?.classList.remove('hidden');
singleOfferSection?.classList.add('hidden');
focusedMultiOfferDeviceKey = effectiveSelectedDeviceKey || null;
renderMultiOfferState(currentOrderData, pendingEntries);
if (focusedMultiOfferDeviceKey) {
syncFocusedOfferUi(focusedMultiOfferDeviceKey, { shouldScroll: true, updateUrl: false });
}
return;
}

multiOfferSection?.classList.add('hidden');
if (multiOfferList) multiOfferList.innerHTML = '';
singleOfferSection?.classList.remove('hidden');

if (isPendingReofferStatus(deviceStatus) && autoAcceptDeadline) {
offerDetailsState.classList.remove('hidden');
replySection.classList.remove('hidden');
actionButtonsDiv.classList.remove('hidden');
countdownContainer.classList.remove('hidden');

if (countdownInterval) clearInterval(countdownInterval);

const updateCountdown = () => {
const timeRemaining = autoAcceptDeadline - Date.now();
if (timeRemaining <= 0) {
clearInterval(countdownInterval);
countdownTimer.textContent = 'Decision window expired. We are refreshing your offer status.';
actionButtonsDiv.classList.add('hidden');
if (!expiredOfferRefreshAttempted) {
expiredOfferRefreshAttempted = true;
setTimeout(() => {
loadOfferDetails();
}, 1200);
}
} else {
countdownTimer.textContent = formatTimeRemaining(timeRemaining);
}
};

updateCountdown();
countdownInterval = setInterval(updateCountdown, 1000);
} else if (isPendingReofferStatus(deviceStatus)) {
expiredOfferRefreshAttempted = false;
offerDetailsState.classList.remove('hidden');
replySection.classList.remove('hidden');
actionButtonsDiv.classList.remove('hidden');
countdownContainer.classList.add('hidden');

} else if (isAcceptedReofferStatus(deviceStatus)) {
expiredOfferRefreshAttempted = false;
renderConfirmationState('re-offered-accepted', orderId);
} else if (isDeclinedReofferStatus(deviceStatus)) {
expiredOfferRefreshAttempted = false;
renderConfirmationState('re-offered-declined', orderId);
} else {
expiredOfferRefreshAttempted = false;
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

const handleAction = async (actionType, overrideDeviceKey = null) => {
loadingState.classList.remove('hidden');
offerDetailsState.classList.add('hidden');
confirmPrompt.classList.add('hidden');
errorMessage.classList.add('hidden');
clearInterval(countdownInterval);

try {
const urlParams = new URLSearchParams(window.location.search);
const orderId = urlParams.get('orderId');
const deviceKey = overrideDeviceKey || urlParams.get('deviceKey');
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
pendingAction = { type: 'accept-offer', deviceKey: null };
confirmMessage.textContent = 'Do you want to accept the new offer?';
confirmPrompt.classList.remove('hidden');
actionButtonsDiv.classList.add('hidden');
});

returnPhoneBtn?.addEventListener('click', () => {
pendingAction = { type: 'return-phone', deviceKey: null };
confirmMessage.textContent = 'Do you want to decline the offer and have your phone returned?';
confirmPrompt.classList.remove('hidden');
actionButtonsDiv.classList.add('hidden');
});

confirmYesBtn?.addEventListener('click', () => {
if (pendingAction) {
handleAction(pendingAction.type, pendingAction.deviceKey || null);
}
});

confirmCancelBtn?.addEventListener('click', () => {
confirmPrompt.classList.add('hidden');
if (singleOfferSection && !singleOfferSection.classList.contains('hidden')) {
actionButtonsDiv.classList.remove('hidden');
}
pendingAction = null;
});

multiOfferList?.addEventListener('click', (event) => {
const trigger = event.target.closest('[data-reoffer-action]');
if (!trigger) return;

const actionType = trigger.getAttribute('data-reoffer-action');
const deviceKey = trigger.getAttribute('data-device-key') || null;
if (!actionType || !deviceKey) return;

pendingAction = { type: actionType, deviceKey };
confirmMessage.textContent = actionType === 'accept-offer'
? 'Do you want to accept the new offer for this device?'
: 'Do you want to decline the offer for this device and have it returned?';
confirmPrompt.classList.remove('hidden');
actionButtonsDiv.classList.add('hidden');
});

deviceSummaryList?.addEventListener('click', (event) => {
const trigger = event.target.closest('[data-reoffer-jump]');
if (!trigger) return;
const deviceKey = trigger.getAttribute('data-reoffer-jump');
if (!deviceKey) return;
focusMultiOfferCard(deviceKey);
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
