// Corrected to include the base path for Cloud Functions
const BACKEND_BASE_URL = 'https://us-central1-buyback-a0f05.cloudfunctions.net/api';
const FEED_PRICING_URL = '/feeds/feed.xml';
const AUTO_ACCEPT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const LABEL_NAME_OVERRIDES = {
primary: 'Primary Shipping Label',
inbounddevice: 'Inbound Device Label',
outboundkit: 'Outbound Shipping Kit Label',
return: 'Return Label',
};

import { firebaseApp } from "/assets/js/firebase-app.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, doc, onSnapshot, collection } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

let db;
let auth;
let currentUserId = 'anonymous_user';

const ordersTableBody = document.getElementById('orders-table-body');
const noOrdersMessage = document.getElementById('no-orders-message');
const searchInput = document.getElementById('search-orders');
const statusLinks = document.querySelectorAll('.status-link');
const displayUserId = document.getElementById('display-user-id');
const dashboardCards = document.querySelectorAll('.dashboard-card');
const paginationControls = document.getElementById('pagination-controls');
const paginationPrev = document.getElementById('pagination-prev');
const paginationNext = document.getElementById('pagination-next');
const paginationInfo = document.getElementById('pagination-info');

// Updated count elements
const orderPendingCount = document.getElementById('order-pending-count');
const shippingKitRequestedCount = document.getElementById('shipping-kit-requested-count');
const labelGeneratedCount = document.getElementById('label-generated-count');
const receivedCount = document.getElementById('received-count');
const completedCount = document.getElementById('completed-count');
const reofferedPendingCount = document.getElementById('re-offered-pending-count');
const reofferedAcceptedCount = document.getElementById('re-offered-accepted-count');
const reofferedDeclinedCount = document.getElementById('re-offered-declined-count');
const returnLabelGeneratedCount = document.getElementById('return-label-generated-count');

const orderDetailsModal = document.getElementById('order-details-modal');
const closeModalButton = document.getElementById('close-modal');
const modalOrderId = document.getElementById('modal-order-id');
const modalCustomerName = document.getElementById('modal-customer-name');
const modalCustomerEmail = document.getElementById('modal-customer-email');
const modalCustomerPhone = document.getElementById('modal-customer-phone'); // ADDED: Element for Phone Number
const modalItem = document.getElementById('modal-item');
const modalStorage = document.getElementById('modal-storage');
const modalCarrier = document.getElementById('modal-carrier');
const modalPrice = document.getElementById('modal-price');
const modalPaymentMethod = document.getElementById('modal-payment-method');
const modalVenmoUsernameRow = document.getElementById('modal-venmo-username-row');
const modalVenmoUsername = document.getElementById('modal-venmo-username');
const modalShippingAddress = document.getElementById('modal-shipping-address');
const modalConditionPowerOn = document.getElementById('modal-condition-power-on');
const modalConditionFunctional = document.getElementById('modal-condition-functional');
const modalConditionCracks = document.getElementById('modal-condition-cracks');
const modalConditionCosmetic = document.getElementById('modal-condition-cosmetic');
const modalStatus = document.getElementById('modal-status');
const modalOrderAge = document.getElementById('modal-order-age');

// NEW: Element for Last Reminder Date
const modalLastReminderDate = document.getElementById('modal-last-reminder-date');

// NEW: Reminder Button reference
const sendReminderBtn = document.getElementById('send-reminder-btn');

// New/Updated label elements in modal
const modalLabelRow = document.getElementById('modal-label-row');
const modalLabelDescription = document.getElementById('modal-label-description');
const modalLabelLink = document.getElementById('modal-label-link');
const modalTrackingNumber = document.getElementById('modal-tracking-number');

const modalSecondaryLabelRow = document.getElementById('modal-secondary-label-row');
const modalSecondaryLabelDescription = document.getElementById('modal-secondary-label-description');
const modalSecondaryLabelLink = document.getElementById('modal-secondary-label-link');
const modalSecondaryTrackingNumberDisplay = document.getElementById('modal-secondary-tracking-number-display');

const modalReturnLabelRow = document.getElementById('modal-return-label-row');
const modalReturnLabelDescription = document.getElementById('modal-return-label-description');
const modalReturnLabelLink = document.getElementById('modal-return-label-link');
const modalReturnTrackingNumberDisplay = document.getElementById('modal-return-tracking-number-display');
const modalLabelStatusRow = document.getElementById('modal-label-status-row');
const modalLabelStatus = document.getElementById('modal-label-status');

const modalActionButtons = document.getElementById('modal-action-buttons');
const modalLoadingMessage = document.getElementById('modal-loading-message');
const modalMessage = document.getElementById('modal-message');

const modalActivityLog = document.getElementById('modal-activity-log');
const modalActivityLogList = document.getElementById('modal-activity-log-list');

const reofferFormContainer = document.getElementById('reoffer-form-container');
const reofferNewPrice = document.getElementById('reoffer-new-price');
const reofferComments = document.getElementById('reoffer-comments');
const submitReofferBtn = document.getElementById('submit-reoffer-btn');
const cancelReofferBtn = document.getElementById('cancel-reoffer-btn');
const reofferPricingHelper = document.getElementById('reoffer-pricing-helper');
const reofferPricingValues = document.getElementById('reoffer-pricing-values');
const reofferPricingMessage = document.getElementById('reoffer-pricing-message');
const reofferPricingModel = document.getElementById('reoffer-pricing-model');

// New Manual Fulfillment Form Elements
const manualFulfillmentFormContainer = document.getElementById('manual-fulfillment-form-container');
const manualOutboundTracking = document.getElementById('manual-outbound-tracking');
const manualInboundTracking = document.getElementById('manual-inbound-tracking');
const manualLabelUrl = document.getElementById('manual-label-url');
const manualOutboundTrackingGroup = document.getElementById('manual-outbound-tracking-group');
const submitManualFulfillmentBtn = document.getElementById('submit-manual-fulfillment-btn');
const cancelManualFulfillmentBtn = document.getElementById('cancel-manual-fulfillment-btn');

const voidLabelFormContainer = document.getElementById('void-label-form-container');
const voidLabelOptionsContainer = document.getElementById('void-label-options');
const voidLabelMessage = document.getElementById('void-label-message');
const submitVoidLabelBtn = document.getElementById('submit-void-label-btn');
const cancelVoidLabelBtn = document.getElementById('cancel-void-label-btn');

// New Delete Confirmation Elements
const deleteConfirmationContainer = document.getElementById('delete-confirmation-container');
const confirmDeleteBtn = document.getElementById('confirm-delete-btn');
const cancelDeleteBtn = document.getElementById('cancel-delete-btn');

const reofferParentLink = document.querySelector('.reoffer-parent');
const reofferSubmenu = document.querySelector('.submenu-container');

let allOrders = [];
let currentFilteredOrders = [];
let currentPage = 1;
const ORDERS_PER_PAGE = 10;
let currentActiveStatus = 'all';
let refreshInterval = null;
let currentOrderDetails = null;
let feedPricingDataCache = null;
let feedPricingDataPromise = null;

orderDetailsModal.addEventListener('click', (event) => {
if (event.target === orderDetailsModal) {
closeOrderDetailsModal();
}
});

const USPS_TRACKING_URL = 'https://tools.usps.com/go/TrackConfirmAction?qtc_tLabels1=';

/**
* Converts a Firestore Timestamp object or Date into a string formatted as "Month Day, Year".
* @param {Object|Date} timestamp - The Firestore Timestamp object, Date object, or timestamp string.
* @returns {string} Formatted date string (e.g., 'October 24, 2024').
*/
function formatDate(timestamp) {
if (!timestamp) return 'N/A';

let date;

// 1. Check for the native Firestore Timestamp object {_seconds, _nanoseconds}
if (typeof timestamp === 'object' && timestamp.seconds && typeof timestamp.seconds === 'number') {
// Use .seconds property (Firestore convention)
date = new Date(timestamp.seconds * 1000);
} else if (typeof timestamp === 'object' && timestamp._seconds && typeof timestamp._seconds === 'number') {
// Use ._seconds property (Common legacy or specific SDK behavior)
date = new Date(timestamp._seconds * 1000);
}
// 2. Assume it's already a Date object, or a parsable string/number
else {
date = new Date(timestamp);
}

// Check if parsing resulted in a valid date object
if (isNaN(date.getTime())) {
console.error("Invalid date object generated for timestamp:", timestamp);
return 'Invalid Date';
}

// Format to the desired long date string: "Month Day, Year"
return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

function toDateSafe(timestamp) {
if (!timestamp) return null;
if (timestamp instanceof Date) return timestamp;
if (typeof timestamp === 'number') {
return new Date(timestamp > 1e12 ? timestamp : timestamp * 1000);
}
if (typeof timestamp === 'string') {
const parsed = new Date(timestamp);
return isNaN(parsed.getTime()) ? null : parsed;
}
if (typeof timestamp === 'object') {
if (typeof timestamp.seconds === 'number') {
return new Date(timestamp.seconds * 1000);
}
if (typeof timestamp._seconds === 'number') {
return new Date(timestamp._seconds * 1000);
}
if (typeof timestamp.toDate === 'function') {
return timestamp.toDate();
}
}
return null;
}

function formatOrderAge(timestamp) {
const date = toDateSafe(timestamp);
if (!date) return 'N/A';
const diffMs = Date.now() - date.getTime();
if (diffMs <= 0) return '0.0 days old';
const days = diffMs / (24 * 60 * 60 * 1000);
return `${days.toFixed(1)} days old`;
}

function formatLabelAge(timestamp) {
const date = toDateSafe(timestamp);
if (!date) return 'Unknown age';
const diffMs = Date.now() - date.getTime();
if (diffMs <= 0) return 'Generated today';
const days = diffMs / (24 * 60 * 60 * 1000);
return `${days.toFixed(1)} days old`;
}

function formatDateTime(timestamp) {
const date = toDateSafe(timestamp);
if (!date) return 'Unknown';
return date.toLocaleString('en-US', {
month: 'short',
day: 'numeric',
year: 'numeric',
hour: 'numeric',
minute: '2-digit'
});
}

function formatLabelStatus(order) {
if (!order) return '';
const normalizedStatus = (order.status || '').toLowerCase();
if (!['label_generated', 'emailed'].includes(normalizedStatus)) {
return '';
}
let description = order.labelTrackingStatusDescription || order.labelTrackingStatus;
if (!description) return '';
description = description
.toString()
.replace(/[_-]+/g, ' ')
.replace(/\s+/g, ' ')
.trim()
.replace(/\b\w/g, c => c.toUpperCase());
return `Label: ${description}`;
}

function formatLabelDisplayNameKey(key) {
if (!key) return 'Shipping Label';
const normalizedKey = key.toString().toLowerCase();
if (LABEL_NAME_OVERRIDES[normalizedKey]) {
return LABEL_NAME_OVERRIDES[normalizedKey];
}
return key
.toString()
.replace(/([A-Z])/g, ' $1')
.replace(/[_-]+/g, ' ')
.trim()
.replace(/\b\w/g, char => char.toUpperCase());
}

function getLabelOptions(order) {
const options = [];
const labels = order.shipEngineLabels && typeof order.shipEngineLabels === 'object'
? order.shipEngineLabels
: {};

Object.entries(labels).forEach(([key, info]) => {
if (!info) return;
const labelId = info.id || info.labelId || info.shipEngineLabelId;
if (!labelId) return;
const status = (info.status || info.voidStatus || 'active').toLowerCase();
options.push({
key,
labelId,
displayName: info.displayName || formatLabelDisplayNameKey(key),
status,
trackingNumber: info.trackingNumber || info.tracking_number || null,
generatedAt: info.generatedAt || null,
message: info.message || info.voidMessage || null,
isVoidable: !['voided', 'void_denied'].includes(status),
});
});

if (!options.length && order.shipEngineLabelId) {
const topLevelStatus = (order.labelVoidStatus || 'active').toLowerCase();
options.push({
key: 'primary',
labelId: order.shipEngineLabelId,
displayName: 'Primary Shipping Label',
status: topLevelStatus,
trackingNumber: order.trackingNumber || null,
generatedAt: order.labelGeneratedAt || order.createdAt || null,
message: order.labelVoidMessage || null,
isVoidable: !['voided', 'void_denied'].includes(topLevelStatus),
});
}

return options;
}

function hasVoidableLabels(order) {
return getLabelOptions(order).some(option => option.isVoidable);
}

function normalizeFeedKey(value) {
if (!value && value !== 0) return '';
return value.toString().trim().toLowerCase().replace(/[^a-z0-9]+/g, '-');
}

function normalizeStorageKey(value) {
if (!value && value !== 0) return '';
return value.toString().trim().toUpperCase().replace(/\s+/g, '');
}

function getNodeText(parent, tagName) {
if (!parent) return '';
const node = parent.getElementsByTagName(tagName)[0];
return node && node.textContent ? node.textContent.trim() : '';
}

function formatCarrierLabel(carrierKey) {
if (!carrierKey) return 'Carrier';
const normalized = carrierKey.toLowerCase();
if (normalized === 'att') return 'AT&T';
if (normalized === 'tmobile') return 'T-Mobile';
if (normalized === 'nopreference') return 'No Preference';
return carrierKey.replace(/-/g, ' ').replace(/\b\w/g, char => char.toUpperCase());
}

function formatConditionLabel(conditionKey) {
if (!conditionKey) return '';
const normalized = conditionKey.toLowerCase();
if (normalized === 'nopower') return 'No Power';
return normalized.replace(/[-_]/g, ' ').replace(/\b\w/g, char => char.toUpperCase());
}

function deriveCarrierKey(carrierValue) {
if (!carrierValue) return 'unlocked';
const normalized = carrierValue.toString().trim().toLowerCase();
if (!normalized) return 'unlocked';
if (normalized.includes('unlock') || normalized.includes('sim-free')) {
return 'unlocked';
}
if (normalized.includes('locked')) {
return 'locked';
}
if (normalized.includes('att') || normalized.includes('at&t')) return 'locked';
if (normalized.includes('tmobile') || normalized.includes('t-mobile')) return 'locked';
if (normalized.includes('verizon')) return 'locked';
if (normalized.includes('sprint')) return 'locked';
if (normalized.includes('other')) return 'locked';
return normalized.replace(/\s+/g, '-');
}

function extractTimestampMillis(timestamp) {
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
}

function getAutoAcceptDeadline(order) {
if (!order || order.status !== 're-offered-pending' || !order.reOffer) return null;
const explicit = extractTimestampMillis(order.reOffer.autoAcceptDate);
if (explicit) return explicit;
const created = extractTimestampMillis(order.reOffer.createdAt);
return created ? created + AUTO_ACCEPT_WINDOW_MS : null;
}

function formatAutoAcceptTimer(order) {
const deadline = getAutoAcceptDeadline(order);
if (!deadline) return '';
const timeLeft = deadline - Date.now();
if (timeLeft <= 0) {
return `<span class="status-bubble-subtext text-red-500">Auto-accept overdue</span>`;
}

const totalSeconds = Math.ceil(timeLeft / 1000);
const days = Math.floor(totalSeconds / 86400);
const hours = Math.floor((totalSeconds % 86400) / 3600);
const minutes = Math.floor((totalSeconds % 3600) / 60);

const parts = [];
if (days > 0) {
parts.push(`${days} day${days !== 1 ? 's' : ''}`);
if (hours > 0) {
parts.push(`${hours} hr${hours !== 1 ? 's' : ''}`);
}
} else if (hours > 0) {
parts.push(`${hours} hr${hours !== 1 ? 's' : ''}`);
if (minutes > 0) {
parts.push(`${minutes} min${minutes !== 1 ? 's' : ''}`);
}
} else if (minutes > 0) {
parts.push(`${minutes} min${minutes !== 1 ? 's' : ''}`);
}

if (parts.length === 0) {
parts.push('less than a minute');
}

return `<span class="status-bubble-subtext text-gray-500">Auto-accept in ${parts.join(' ')}</span>`;
}

async function loadFeedPricingData() {
if (feedPricingDataCache) {
return feedPricingDataCache;
}
if (feedPricingDataPromise) {
return feedPricingDataPromise;
}

feedPricingDataPromise = fetch(FEED_PRICING_URL)
.then(response => {
if (!response.ok) {
throw new Error(`Failed to fetch pricing feed: ${response.status}`);
}
return response.text();
})
.then(xmlText => {
const parser = new DOMParser();
const xmlDoc = parser.parseFromString(xmlText, 'application/xml');
if (xmlDoc.querySelector('parsererror')) {
throw new Error('Invalid XML structure in pricing feed.');
}

const lookup = {};
const models = Array.from(xmlDoc.getElementsByTagName('model'));
models.forEach(modelNode => {
const brand = getNodeText(modelNode, 'brand') || getNodeText(modelNode, 'parentDevice');
const slug = getNodeText(modelNode, 'slug') || getNodeText(modelNode, 'modelID');
const modelId = getNodeText(modelNode, 'modelID');
const name = getNodeText(modelNode, 'name');

const storageMap = {};
const priceGroups = Array.from(modelNode.getElementsByTagName('prices'));
priceGroups.forEach(priceGroup => {
const storageSize = getNodeText(priceGroup, 'storageSize');
const normalizedStorage = normalizeStorageKey(storageSize);
if (!normalizedStorage) return;

const priceValueNode = priceGroup.getElementsByTagName('priceValue')[0];
if (!priceValueNode) return;

const carriers = {};
Array.from(priceValueNode.children).forEach(carrierNode => {
const carrierKey = carrierNode.tagName.toLowerCase();
const conditionMap = {};
Array.from(carrierNode.children).forEach(conditionNode => {
const value = parseFloat(conditionNode.textContent);
if (!Number.isNaN(value)) {
conditionMap[conditionNode.tagName.toLowerCase()] = value;
}
});
if (Object.keys(conditionMap).length > 0) {
carriers[carrierKey] = conditionMap;
}
});

if (Object.keys(carriers).length > 0) {
storageMap[normalizedStorage] = {
label: storageSize ? storageSize.trim() : '',
carriers
};
}
});

if (Object.keys(storageMap).length === 0) {
return;
}

const entry = {
modelName: name || slug || modelId || 'Unknown Model',
brand: brand || '',
storageMap
};

const rawKeys = [
slug,
modelId,
name,
`${brand}-${modelId}`,
`${brand}-${slug}`,
`${brand}-${name}`,
`${brand} ${modelId}`,
`${brand} ${slug}`,
`${brand} ${name}`
];

rawKeys.forEach(rawKey => {
const normalizedKey = normalizeFeedKey(rawKey);
if (normalizedKey) {
lookup[normalizedKey] = entry;
}
});
});

feedPricingDataCache = lookup;
return lookup;
})
.catch(error => {
console.error('Failed to load feed pricing data:', error);
feedPricingDataCache = {};
return {};
})
.finally(() => {
feedPricingDataPromise = null;
});

return feedPricingDataPromise;
}

function getPricingEntryForOrder(pricingData, order) {
if (!order) return null;

const candidates = new Set();
const pushCandidate = (value) => {
const key = normalizeFeedKey(value);
if (key) {
candidates.add(key);
}
};

pushCandidate(order.modelSlug);
pushCandidate(order.modelId);
pushCandidate(order.slug);
pushCandidate(order.device);
pushCandidate(order.model?.slug);
pushCandidate(order.model?.id);

if (order.brand) {
pushCandidate(`${order.brand}-${order.modelSlug}`);
pushCandidate(`${order.brand}-${order.device}`);
pushCandidate(`${order.brand} ${order.modelSlug}`);
pushCandidate(`${order.brand} ${order.device}`);
}

if (order.parentDevice) {
pushCandidate(`${order.parentDevice}-${order.modelSlug}`);
pushCandidate(`${order.parentDevice}-${order.device}`);
}

for (const key of candidates) {
if (pricingData[key]) {
return pricingData[key];
}
}

return null;
}

async function populateReofferPricing(order) {
if (!reofferPricingHelper || !reofferPricingValues || !reofferPricingMessage || !reofferPricingModel) {
return;
}

reofferPricingValues.innerHTML = '';
reofferPricingMessage.textContent = '';
reofferPricingMessage.classList.add('hidden');

const modelLabelParts = [];
if (order?.device) {
modelLabelParts.push(order.device);
} else if (order?.modelSlug) {
modelLabelParts.push(order.modelSlug);
}
if (order?.storage) {
modelLabelParts.push(order.storage);
}
reofferPricingModel.textContent = modelLabelParts.join(' • ').toUpperCase();

if (!order) {
reofferPricingHelper.classList.remove('hidden');
reofferPricingMessage.textContent = 'Device details unavailable for pricing lookup.';
reofferPricingMessage.classList.remove('hidden');
return;
}

try {
const pricingData = await loadFeedPricingData();
const entry = getPricingEntryForOrder(pricingData, order);

if (!entry) {
reofferPricingHelper.classList.remove('hidden');
reofferPricingMessage.textContent = 'No pricing found in the feed for this device.';
reofferPricingMessage.classList.remove('hidden');
return;
}

const storageCandidates = [];
if (order.storage) {
storageCandidates.push(normalizeStorageKey(order.storage));
const numericMatch = order.storage.match(/\d+/);
if (numericMatch) {
storageCandidates.push(normalizeStorageKey(`${numericMatch[0]}GB`));
}
}

let storageEntry = null;
for (const candidate of storageCandidates) {
if (candidate && entry.storageMap[candidate]) {
storageEntry = entry.storageMap[candidate];
break;
}
}

if (!storageEntry) {
reofferPricingHelper.classList.remove('hidden');
reofferPricingMessage.textContent = 'No pricing found in the feed for this storage capacity.';
reofferPricingMessage.classList.remove('hidden');
return;
}

const carriers = storageEntry.carriers;
if (!carriers || Object.keys(carriers).length === 0) {
reofferPricingHelper.classList.remove('hidden');
reofferPricingMessage.textContent = 'Carrier pricing is missing for this device in the feed.';
reofferPricingMessage.classList.remove('hidden');
return;
}

const preferredCarrier = deriveCarrierKey(order.carrier);
reofferPricingHelper.classList.remove('hidden');

Object.entries(carriers).forEach(([carrierKey, conditionMap]) => {
const carrierCard = document.createElement('div');
const highlight = carrierKey === preferredCarrier;
carrierCard.className = `rounded-md border p-3 text-sm bg-white shadow-sm ${highlight ? 'border-blue-400 ring-1 ring-blue-200' : 'border-slate-200'}`;

const header = document.createElement('div');
header.className = 'flex items-center justify-between mb-2';

const label = document.createElement('span');
label.className = 'font-semibold text-slate-700';
label.textContent = formatCarrierLabel(carrierKey);
header.appendChild(label);

if (highlight) {
const badge = document.createElement('span');
badge.className = 'text-xs uppercase tracking-wide text-blue-600';
badge.textContent = 'Order Carrier';
header.appendChild(badge);
}

carrierCard.appendChild(header);

const priceList = document.createElement('div');
priceList.className = 'space-y-2';

Object.entries(conditionMap).forEach(([conditionKey, value]) => {
const button = document.createElement('button');
button.type = 'button';
button.dataset.price = value;
button.className = 'w-full flex items-center justify-between px-3 py-2 border border-slate-200 rounded-md bg-white text-left hover:border-blue-400 hover:text-blue-600 transition';

const conditionLabel = document.createElement('span');
conditionLabel.textContent = formatConditionLabel(conditionKey);
const amount = document.createElement('span');
amount.className = 'font-semibold';
amount.textContent = `$${Number(value).toFixed(2)}`;

button.appendChild(conditionLabel);
button.appendChild(amount);

button.addEventListener('click', () => {
reofferNewPrice.value = Number(value).toFixed(2);
reofferPricingValues.querySelectorAll('button[data-price]').forEach(btn => {
btn.classList.remove('ring-2', 'ring-blue-400', 'bg-blue-50', 'text-blue-700');
});
button.classList.add('ring-2', 'ring-blue-400', 'bg-blue-50', 'text-blue-700');
});

priceList.appendChild(button);
});

carrierCard.appendChild(priceList);
reofferPricingValues.appendChild(carrierCard);
});

} catch (error) {
console.error('Error populating re-offer pricing:', error);
reofferPricingHelper.classList.remove('hidden');
reofferPricingMessage.textContent = 'Unable to load feed pricing at this time.';
reofferPricingMessage.classList.remove('hidden');
}
}

function updateDashboardCounts(ordersData) {
// Updated to 'order_pending'
orderPendingCount.textContent = ordersData.filter(o => o.status === 'order_pending').length;
shippingKitRequestedCount.textContent = ordersData.filter(o => o.status === 'shipping_kit_requested').length;
labelGeneratedCount.textContent = ordersData.filter(o => o.status === 'label_generated' || o.status === 'emailed').length;
receivedCount.textContent = ordersData.filter(o => o.status === 'received').length;
completedCount.textContent = ordersData.filter(o => o.status === 'completed').length;
reofferedPendingCount.textContent = ordersData.filter(o => o.status === 're-offered-pending').length;
reofferedAcceptedCount.textContent = ordersData.filter(o => o.status === 're-offered-accepted' || o.status === 'requote_accepted').length;
reofferedDeclinedCount.textContent = ordersData.filter(o => o.status === 're-offered-declined').length;
returnLabelGeneratedCount.textContent = ordersData.filter(o => o.status === 'return-label-generated').length;
}

function renderOrders() {
ordersTableBody.innerHTML = '';
const source = currentFilteredOrders;
const total = source.length;

if (total === 0) {
noOrdersMessage.classList.remove('hidden');
ordersTableBody.innerHTML = `<tr><td colspan="8" class="text-center text-gray-500 py-8">No orders found for this status.</td></tr>`;
if (paginationControls) {
paginationControls.classList.add('hidden');
}
return;
}
noOrdersMessage.classList.add('hidden');

const startIndex = (currentPage - 1) * ORDERS_PER_PAGE;
const endIndex = startIndex + ORDERS_PER_PAGE;
const ordersToDisplay = source.slice(startIndex, endIndex);

ordersToDisplay.forEach(order => {
const row = document.createElement('tr');
row.className = 'hover:bg-gray-50';
const customerName = order.shippingInfo ? order.shippingInfo.fullName : 'N/A';
const itemDescription = `${order.device} ${order.storage}`;
const displayId = order.id;
const orderDate = formatDate(order.createdAt); // NEW: Get formatted date
const orderAge = formatOrderAge(order.createdAt);
const lastUpdatedDate = formatDate(order.lastStatusUpdateAt || order.updatedAt || order.createdAt);
const labelStatus = formatLabelStatus(order);

const reofferTimer = formatAutoAcceptTimer(order);
// Pass the entire order object to formatStatus for conditional logic
let statusText = formatStatus(order);

// --- START: MODIFIED TRACKING NUMBER LOGIC FOR MAIN LIST ---
const trackingNumber = order.trackingNumber;
let trackingCellContent;

if (trackingNumber) {
// Make the tracking number a clickable hyperlink
trackingCellContent = `<a href="${USPS_TRACKING_URL}${trackingNumber}" target="_blank" class="text-blue-600 hover:text-blue-800 underline">${trackingNumber}</a>`;
} else {
trackingCellContent = 'N/A';
}
// --- END: MODIFIED TRACKING NUMBER LOGIC FOR MAIN LIST ---

row.innerHTML = `
<td class="px-3 py-4 whitespace-normal text-sm font-medium text-gray-900">${displayId}</td>
<!-- ADDED ORDER DATE CELL -->
<td class="px-3 py-4 whitespace-normal text-sm text-gray-500">
<div>${orderDate}</div>
<div class="text-xs text-gray-400">${orderAge}</div>
</td>
<td class="px-3 py-4 whitespace-normal text-sm text-gray-500">${lastUpdatedDate}</td>
<td class="px-3 py-4 whitespace-normal text-sm text-gray-500">${customerName}</td>
<td class="px-3 py-4 whitespace-normal text-sm text-gray-500">${itemDescription}</td>
<td class="px-3 py-4 whitespace-normal text-sm">
<span class="${getStatusClass(order.status)}">
<span class="status-bubble-text">${statusText}</span>
${labelStatus ? `<span class="status-bubble-subtext">${labelStatus}</span>` : ''}
${reofferTimer}
</span>
</td>
<td class="px-3 py-4 whitespace-normal text-sm text-gray-500">${trackingCellContent}</td>
<td class="px-3 py-4 whitespace-normal text-sm font-medium">
<button data-order-id="${order.id}" class="view-details-btn text-blue-600 hover:text-blue-900 rounded-md py-1 px-3 border border-blue-600 hover:border-blue-900 transition-colors duration-200">View Details</button>
</td>
`;
ordersTableBody.appendChild(row);
});

document.querySelectorAll('.view-details-btn').forEach(button => {
button.addEventListener('click', (event) => {
const orderId = event.target.dataset.orderId;
openOrderDetailsModal(orderId);
});
});
}

function renderPagination() {
const source = currentFilteredOrders.length ? currentFilteredOrders : allOrders;
const total = source.length;
const totalPages = Math.max(1, Math.ceil(total / ORDERS_PER_PAGE));

if (!paginationControls) return;

if (totalPages <= 1) {
paginationControls.classList.add('hidden');
return;
}

paginationControls.classList.remove('hidden');
if (currentPage > totalPages) {
currentPage = totalPages;
}
paginationPrev.disabled = currentPage <= 1;
paginationNext.disabled = currentPage >= totalPages;
paginationInfo.textContent = `Page ${currentPage} of ${totalPages}`;
}

function renderActivityLog(order) {
if (!modalActivityLog || !modalActivityLogList) return;
const entries = Array.isArray(order.activityLog) ? [...order.activityLog] : [];

if (!entries.length) {
modalActivityLog.classList.add('hidden');
modalActivityLogList.innerHTML = '';
return;
}

entries.sort((a, b) => {
const aDate = toDateSafe(a.at) || new Date(0);
const bDate = toDateSafe(b.at) || new Date(0);
return bDate.getTime() - aDate.getTime();
});

modalActivityLogList.innerHTML = '';
entries.forEach(entry => {
const li = document.createElement('li');
li.className = 'flex items-start justify-between gap-4 border border-gray-100 rounded-md px-3 py-2 bg-gray-50';

const message = document.createElement('div');
message.className = 'text-sm text-gray-700';
message.textContent = entry.message || (entry.type ? entry.type.replace(/[_-]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : 'Update');

const timestamp = document.createElement('span');
timestamp.className = 'text-xs text-gray-400 whitespace-nowrap';
timestamp.textContent = formatDateTime(entry.at);

li.appendChild(message);
li.appendChild(timestamp);
modalActivityLogList.appendChild(li);
});

modalActivityLog.classList.remove('hidden');
}

/**
* Formats the order status text for display in the dashboard.
* @param {Object} order - The order object.
*/
function formatStatus(order) {
const status = order.status;
const preference = order.shippingPreference;

if (status === 'order_pending') {
return 'Order Pending';
}
if (status === 'shipping_kit_requested') {
return 'Shipping Kit Requested';
}
if (status === 'label_generated') {
// If the user requested an emailed label, display "Label Generated"
if (preference === 'Email Label Requested') {
return 'Label Generated';
}
// Otherwise (for Shipping Kit Requested), display "Shipping Kit on the Way"
return 'Shipping Kit on the Way';
}
if (status === 'emailed') {
return 'Emailed';
}
// Fallback for other statuses
return status.replace(/_/g, ' ').split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
}

function formatCondition(condition) {
return condition.charAt(0).toUpperCase() + condition.slice(1);
}

function getStatusClass(status) {
switch (status) {
case 'order_pending': return 'bg-blue-100 text-blue-800 status-bubble';
case 'shipping_kit_requested': return 'bg-indigo-100 text-indigo-800 status-bubble';
case 'label_generated': return 'bg-yellow-100 text-yellow-800 status-bubble';
case 'emailed': return 'bg-yellow-100 text-yellow-800 status-bubble';
case 'received': return 'bg-green-100 text-green-800 status-bubble';
case 'completed': return 'bg-purple-100 text-purple-800 status-bubble';
case 're-offered-pending': return 'bg-orange-100 text-orange-800 status-bubble';
case 're-offered-accepted': return 'bg-teal-100 text-teal-800 status-bubble';
case 'requote_accepted': return 'bg-teal-100 text-teal-800 status-bubble';
case 're-offered-declined': return 'bg-red-100 text-red-800 status-bubble';
case 'return-label-generated': return 'bg-gray-400 text-gray-800 status-bubble';
case 'cancelled': return 'bg-gray-200 text-gray-700 status-bubble';
default: return 'bg-gray-100 text-gray-800 status-bubble';
}
}

async function openOrderDetailsModal(orderId) {
// Hide all action/form containers
modalActionButtons.innerHTML = '';
modalLoadingMessage.classList.add('hidden');
modalMessage.classList.add('hidden');
modalMessage.textContent = '';
modalVenmoUsernameRow.classList.add('hidden');
reofferFormContainer.classList.add('hidden');
manualFulfillmentFormContainer.classList.add('hidden');
deleteConfirmationContainer.classList.add('hidden');
voidLabelFormContainer.classList.add('hidden');
voidLabelMessage.classList.add('hidden');
voidLabelMessage.textContent = '';
if (modalActivityLog) {
modalActivityLog.classList.add('hidden');
modalActivityLogList.innerHTML = '';
}
modalLabelStatusRow.classList.add('hidden');
modalLabelStatus.textContent = 'N/A';

// Hide all label rows initially
modalLabelRow.classList.add('hidden');
modalSecondaryLabelRow.classList.add('hidden');
modalReturnLabelRow.classList.add('hidden');

// NEW: Hide reminder button by default
sendReminderBtn.classList.add('hidden');

orderDetailsModal.classList.remove('hidden');

try {
modalLoadingMessage.classList.remove('hidden');
const url = `${BACKEND_BASE_URL}/orders/${orderId}`;
console.log("Fetching order details from:", url);
const response = await fetch(url);

if (!response.ok) {
const errorText = await response.text();
console.error("Backend error response:", response.status, errorText);
throw new Error(`Failed to fetch order details: ${response.status} - ${errorText.substring(0, 100)}`);
}
const order = await response.json();
currentOrderDetails = order;

modalOrderId.textContent = order.id;
modalCustomerName.textContent = order.shippingInfo ? order.shippingInfo.fullName : 'N/A';
modalCustomerEmail.textContent = order.shippingInfo ? order.shippingInfo.email : 'N/A';
modalCustomerPhone.textContent = order.shippingInfo ? order.shippingInfo.phone : 'N/A'; // Populating Phone
modalItem.textContent = order.device;
modalStorage.textContent = order.storage;
modalCarrier.textContent = order.carrier;
modalPrice.textContent = order.estimatedQuote ? order.estimatedQuote.toFixed(2) : '0.00';
modalOrderAge.textContent = formatOrderAge(order.createdAt);

modalPaymentMethod.textContent = order.paymentMethod ? formatCondition(order.paymentMethod) : 'N/A';
if (order.paymentMethod === 'venmo' && order.paymentDetails && order.paymentDetails.venmoUsername) {
modalVenmoUsername.textContent = order.paymentDetails.venmoUsername;
modalVenmoUsernameRow.classList.remove('hidden');
}

const shippingInfo = order.shippingInfo;
if (shippingInfo) {
modalShippingAddress.textContent = `${shippingInfo.streetAddress}, ${shippingInfo.city}, ${shippingInfo.state}, ${shippingInfo.zipCode}`;
} else {
modalShippingAddress.textContent = 'N/A';
}

modalConditionPowerOn.textContent = order.condition_power_on ? formatCondition(order.condition_power_on) : 'N/A';
modalConditionFunctional.textContent = order.condition_functional ? formatCondition(order.condition_functional) : 'N/A';
modalConditionCracks.textContent = order.condition_cracks ? formatCondition(order.condition_cracks) : 'N/A';
modalConditionCosmetic.textContent = order.condition_cosmetic ? formatCondition(order.condition_cosmetic) : 'N/A';

// Pass the order object to formatStatus here as well
modalStatus.textContent = formatStatus(order);
modalStatus.className = `font-semibold px-2 py-1 rounded-full text-xs ${getStatusClass(order.status)}`;

// Display Last Reminder Sent date
modalLastReminderDate.textContent = order.lastReminderSentAt ? formatDate(order.lastReminderSentAt) : 'N/A';

// NEW: Handle Reminder Button visibility and click
if (['order_pending', 'shipping_kit_requested', 'label_generated', 'emailed'].includes(order.status)) {
sendReminderBtn.classList.remove('hidden');
sendReminderBtn.onclick = () => handleAction(order.id, 'sendReminderEmail');
} else {
sendReminderBtn.classList.add('hidden');
}

// --- START: UPDATED LABEL LOGIC FOR USPS HYPERLINKING IN MODAL ---

// 1. Outbound Kit (if requested)
if (order.shippingPreference === 'Shipping Kit Requested') {

// Outbound Label (Kit)
if (order.outboundTrackingNumber) {
modalLabelLink.href = USPS_TRACKING_URL + order.outboundTrackingNumber;
modalTrackingNumber.textContent = order.outboundTrackingNumber;
modalLabelDescription.textContent = 'Outbound Kit Tracking';
modalLabelRow.classList.remove('hidden');
} else if (order.outboundLabelUrl) {
// Fallback: if no tracking number, but PDF link exists
modalLabelLink.href = order.outboundLabelUrl;
modalTrackingNumber.textContent = 'N/A';
modalLabelDescription.textContent = 'Outbound Kit Label (PDF)';
modalLabelRow.classList.remove('hidden');
}

// Inbound Label (Device)
if (order.inboundTrackingNumber) {
modalSecondaryLabelLink.href = USPS_TRACKING_URL + order.inboundTrackingNumber;
modalSecondaryTrackingNumberDisplay.textContent = order.inboundTrackingNumber;
modalSecondaryLabelDescription.textContent = 'Inbound Device Tracking';
modalSecondaryLabelRow.classList.remove('hidden');
} else if (order.inboundLabelUrl) {
// Fallback: if no tracking number, but PDF link exists
modalSecondaryLabelLink.href = order.inboundLabelUrl;
modalSecondaryTrackingNumberDisplay.textContent = 'N/A';
modalSecondaryLabelDescription.textContent = 'Inbound Device Label (PDF)';
modalSecondaryLabelRow.classList.remove('hidden');
}

}

// 2. Email Label Requested (single USPS label/inbound label)
else if (order.shippingPreference === 'Email Label Requested') {
if (order.trackingNumber) {
modalLabelLink.href = USPS_TRACKING_URL + order.trackingNumber;
modalTrackingNumber.textContent = order.trackingNumber;
modalLabelDescription.textContent = 'Shipping Label Tracking';
modalLabelRow.classList.remove('hidden');
} else if (order.uspsLabelUrl) {
// Fallback: if no tracking number, but PDF link exists
modalLabelLink.href = order.uspsLabelUrl;
modalTrackingNumber.textContent = 'N/A';
modalLabelDescription.textContent = 'Shipping Label (PDF)';
modalLabelRow.classList.remove('hidden');
}
}

// 3. Return Label (For re-offer declines)
if (order.returnTrackingNumber) {
modalReturnLabelLink.href = USPS_TRACKING_URL + order.returnTrackingNumber;
modalReturnTrackingNumberDisplay.textContent = order.returnTrackingNumber;
modalReturnLabelDescription.textContent = 'Return Label Tracking';
modalReturnLabelRow.classList.remove('hidden');
} else if (order.returnLabelUrl) {
// Fallback to raw PDF link
modalReturnLabelLink.href = order.returnLabelUrl;
modalReturnTrackingNumberDisplay.textContent = 'N/A';
modalReturnLabelDescription.textContent = 'Return Label (PDF)';
modalReturnLabelRow.classList.remove('hidden');
}

// --- END: UPDATED LABEL LOGIC ---

const hasLabelStatus = Boolean(order.labelTrackingStatusDescription || order.labelTrackingStatus);
if (hasLabelStatus) {
const parts = [];
if (order.labelTrackingStatusDescription) {
parts.push(order.labelTrackingStatusDescription);
} else if (order.labelTrackingStatus) {
parts.push(order.labelTrackingStatus);
}
if (order.labelTrackingEstimatedDelivery) {
parts.push(`ETA ${formatDate(order.labelTrackingEstimatedDelivery)}`);
}
modalLabelStatus.textContent = parts.join(' • ');
modalLabelStatusRow.classList.remove('hidden');
} else {
modalLabelStatus.textContent = 'N/A';
modalLabelStatusRow.classList.add('hidden');
}

renderActivityLog(order);

renderActionButtons(order);
modalActionButtons.classList.remove('hidden');
modalLoadingMessage.classList.add('hidden');

} catch (error) {
console.error('Error fetching order details:', error);
displayModalMessage(`Error fetching order details: ${error.message}. Please try again.`, 'error');
modalLoadingMessage.classList.add('hidden');
}
}

function renderActionButtons(order) {
modalActionButtons.innerHTML = '';
const createButton = (text, onClick, className = 'bg-blue-600 hover:bg-blue-700') => {
const button = document.createElement('button');
button.textContent = text;
button.className = `${className} text-white font-bold py-2 px-4 rounded-md transition-colors duration-200 shadow`;
button.onclick = onClick;
return button;
};

const currentStatus = order.status;
const labelOptions = getLabelOptions(order);
switch (currentStatus) {
case 'order_pending':
case 'shipping_kit_requested':
case 'kit_needs_printing':
case 'needs_printing':
modalActionButtons.appendChild(createButton('Generate USPS Label', () => handleAction(order.id, 'generateLabel')));
modalActionButtons.appendChild(createButton('Order Manually Fulfilled', () => showManualFulfillmentForm(order), 'bg-gray-600 hover:bg-gray-700'));
// Reminder button is now handled by sendReminderBtn at the top
break;
case 'label_generated':
case 'emailed':
if (order.shippingPreference === 'Shipping Kit Requested') {
modalActionButtons.appendChild(createButton('Mark I Sent', () => handleAction(order.id, 'markKitSent'), 'bg-orange-600 hover:bg-orange-700'));
}
modalActionButtons.appendChild(createButton('Mark as Received', () => handleAction(order.id, 'markReceived')));
// Reminder button is now handled by sendReminderBtn at the top
break;
case 'received':
modalActionButtons.appendChild(createButton('Mark as Completed', () => handleAction(order.id, 'markCompleted', 'bg-gray-600 hover:bg-gray-700')));
modalActionButtons.appendChild(createButton('Propose Re-offer', () => showReofferForm(order.id), 'bg-orange-600 hover:bg-orange-700'));
break;
case 're-offered-pending':
if (order.reOffer && order.reOffer.newPrice) {
const reOfferDiv = document.createElement('div');
reOfferDiv.className = 'p-3 bg-gray-100 rounded-md';
reOfferDiv.innerHTML = `<p><strong>Proposed New Price:</strong> $${order.reOffer.newPrice.toFixed(2)}</p><p><strong>Reasons:</strong> ${order.reOffer.reasons.join(', ')}</p><p><strong>Comments:</strong> ${order.reOffer.comments}</p>`;
modalActionButtons.appendChild(reOfferDiv);
}
break;
case 're-offered-accepted':
case 'requote_accepted':
modalActionButtons.appendChild(createButton('Pay Now', () => handleAction(order.id, 'payNow', 'bg-teal-600 hover:bg-teal-700')));
break;
case 're-offered-declined':
modalActionButtons.appendChild(createButton('Send Return Label', () => handleAction(order.id, 'sendReturnLabel', 'bg-red-600 hover:bg-red-700')));
break;
case 'return-label-generated':
case 'completed':
break;
}

if (labelOptions.length > 0 && currentStatus !== 'cancelled') {
modalActionButtons.appendChild(
createButton('Void Shipping Labels', () => showVoidLabelForm(order), 'bg-red-600 hover:bg-red-700')
);
}

if (currentStatus !== 'cancelled') {
modalActionButtons.appendChild(
createButton('Cancel Order', () => handleAction(order.id, 'cancelOrder'), 'bg-rose-500 hover:bg-rose-600')
);
}

// Always add Delete Button, visually separated
modalActionButtons.appendChild(createButton('Delete Order', () => showDeleteConfirmation(order.id), 'bg-red-500 hover:bg-red-600'));
}

function showVoidLabelForm(order) {
const options = getLabelOptions(order);
if (!options.length) {
displayModalMessage('No shipping label information is available for this order.', 'error');
return;
}

voidLabelOptionsContainer.innerHTML = '';
voidLabelMessage.classList.add('hidden');
voidLabelMessage.textContent = '';

options.forEach(option => {
const optionId = `void-label-${option.key}`;
const isDisabled = !option.isVoidable;
const labelAge = formatLabelAge(option.generatedAt);
const statusText = option.status ? option.status.replace(/_/g, ' ') : 'active';
const statusClass = isDisabled ? 'text-red-600' : 'text-green-600';
const trackingText = option.trackingNumber ? `Tracking: ${option.trackingNumber}` : 'Tracking: N/A';

const wrapper = document.createElement('label');
wrapper.className = `flex items-start gap-3 p-3 border rounded-md ${isDisabled ? 'bg-gray-100 border-gray-200 opacity-70 cursor-not-allowed' : 'bg-white border-gray-200 hover:border-red-300 transition-colors duration-150'}`;

const checkbox = document.createElement('input');
checkbox.type = 'checkbox';
checkbox.className = 'mt-1 h-4 w-4 text-red-600 focus:ring-red-500 border-gray-300 rounded void-label-checkbox';
checkbox.dataset.labelKey = option.key;
checkbox.dataset.labelId = option.labelId;
checkbox.id = optionId;
checkbox.disabled = isDisabled;

const content = document.createElement('div');
content.className = 'flex-1';
content.innerHTML = `
<div class="flex items-center justify-between gap-2">
<span class="font-semibold text-sm text-gray-800">${option.displayName || formatLabelDisplayNameKey(option.key)}</span>
<span class="text-xs font-semibold uppercase tracking-wide ${statusClass}">${statusText}</span>
</div>
<div class="text-xs text-gray-500 mt-1">${trackingText}</div>
<div class="text-xs text-gray-500">${labelAge}</div>
${option.message ? `<div class="text-xs text-red-500 mt-1">${option.message}</div>` : ''}
`;

wrapper.appendChild(checkbox);
wrapper.appendChild(content);
voidLabelOptionsContainer.appendChild(wrapper);
});

modalActionButtons.classList.add('hidden');
reofferFormContainer.classList.add('hidden');
manualFulfillmentFormContainer.classList.add('hidden');
deleteConfirmationContainer.classList.add('hidden');
voidLabelFormContainer.classList.remove('hidden');

submitVoidLabelBtn.onclick = () => handleVoidLabelSubmit(order.id);
cancelVoidLabelBtn.onclick = () => {
voidLabelFormContainer.classList.add('hidden');
modalActionButtons.classList.remove('hidden');
voidLabelMessage.classList.add('hidden');
voidLabelMessage.textContent = '';
openOrderDetailsModal(order.id);
};
}

async function handleVoidLabelSubmit(orderId) {
const selected = Array.from(document.querySelectorAll('.void-label-checkbox:checked')).map(checkbox => ({
key: checkbox.dataset.labelKey,
id: checkbox.dataset.labelId,
}));

if (!selected.length) {
voidLabelMessage.textContent = 'Please select at least one label to void.';
voidLabelMessage.className = 'mt-3 text-sm text-red-600';
voidLabelMessage.classList.remove('hidden');
return;
}

modalLoadingMessage.classList.remove('hidden');
voidLabelFormContainer.classList.add('hidden');

try {
const response = await fetch(`${BACKEND_BASE_URL}/orders/${orderId}/void-label`, {
method: 'POST',
headers: { 'Content-Type': 'application/json' },
body: JSON.stringify({ labels: selected }),
});

if (!response.ok) {
const errorText = await response.text();
throw new Error(errorText || `Failed to void labels: ${response.status}`);
}

const result = await response.json();
const approvedCount = (result.results || []).filter(item => item.approved).length;
const deniedCount = (result.results || []).filter(item => !item.approved).length;

let summaryMessage = '';
if (approvedCount > 0) {
summaryMessage += `${approvedCount} label${approvedCount > 1 ? 's' : ''} voided successfully.`;
}
if (deniedCount > 0) {
summaryMessage += ` ${deniedCount} label${deniedCount > 1 ? 's' : ''} could not be voided.`;
}
if (!summaryMessage.trim()) {
summaryMessage = 'Void request processed.';
}

displayModalMessage(summaryMessage.trim(), approvedCount > 0 ? 'success' : 'error');
openOrderDetailsModal(orderId);
} catch (error) {
console.error('Error voiding labels:', error);
displayModalMessage(`Error: ${error.message}`, 'error');
modalActionButtons.classList.remove('hidden');
} finally {
modalLoadingMessage.classList.add('hidden');
}
}

function showReofferForm(orderId) {
modalActionButtons.classList.add('hidden');
reofferFormContainer.classList.remove('hidden');
sendReminderBtn.classList.add('hidden'); // Hide reminder button when form is open
reofferNewPrice.value = '';
reofferComments.value = '';
if (reofferPricingHelper) {
reofferPricingHelper.classList.add('hidden');
}
if (reofferPricingValues) {
reofferPricingValues.innerHTML = '';
}
if (reofferPricingMessage) {
reofferPricingMessage.textContent = '';
reofferPricingMessage.classList.add('hidden');
}
document.querySelectorAll('input[name="reoffer-reasons"]').forEach(cb => {
cb.checked = false;
});

submitReofferBtn.onclick = () => submitReOfferFromForm(orderId);
cancelReofferBtn.onclick = () => {
reofferFormContainer.classList.add('hidden');
modalActionButtons.classList.remove('hidden');
// Re-evaluate visibility when form closes (by re-opening modal implicitly)
openOrderDetailsModal(orderId);
};

const orderForPricing = (currentOrderDetails && currentOrderDetails.id === orderId)
? currentOrderDetails
: allOrders.find(o => o.id === orderId);

populateReofferPricing(orderForPricing).catch(error => {
console.error('Unable to populate re-offer pricing from feed:', error);
if (reofferPricingHelper && reofferPricingMessage) {
reofferPricingHelper.classList.remove('hidden');
reofferPricingMessage.textContent = 'Unable to load feed pricing at this time.';
reofferPricingMessage.classList.remove('hidden');
}
});
}

/**
* Shows the form for manual tracking number input.
* @param {Object} order The current order object.
*/
function showManualFulfillmentForm(order) {
modalActionButtons.classList.add('hidden');
manualFulfillmentFormContainer.classList.remove('hidden');
sendReminderBtn.classList.add('hidden'); // Hide reminder button when form is open
manualOutboundTracking.value = '';
manualInboundTracking.value = '';
manualLabelUrl.value = '';

const isKitOrder = order.shippingPreference === 'Shipping Kit Requested';

if (isKitOrder) {
manualOutboundTrackingGroup.classList.remove('hidden');
manualOutboundTracking.required = true;
document.querySelector('#manual-outbound-tracking-group label').textContent = 'Outbound Kit Tracking # (Required)';
document.querySelector('#manual-inbound-tracking-group label').textContent = 'Inbound Device Tracking # (Required)';
} else {
manualOutboundTrackingGroup.classList.add('hidden');
manualOutboundTracking.required = false;
document.querySelector('#manual-inbound-tracking-group label').textContent = 'Shipping Label Tracking # (Required)';
}

submitManualFulfillmentBtn.onclick = () => handleManualFulfillment(order.id, isKitOrder);
cancelManualFulfillmentBtn.onclick = () => {
manualFulfillmentFormContainer.classList.add('hidden');
modalActionButtons.classList.remove('hidden');
// Re-evaluate visibility when form closes (by re-opening modal implicitly)
openOrderDetailsModal(order.id);
};
}

async function handleManualFulfillment(orderId, isKitOrder) {
const outboundTracking = manualOutboundTracking.value.trim();
const inboundTracking = manualInboundTracking.value.trim();
const labelUrl = manualLabelUrl.value.trim();

if (isKitOrder && !outboundTracking) {
displayModalMessage('Outbound Kit Tracking Number is required for Shipping Kit orders.', 'error');
return;
}
if (!inboundTracking) {
displayModalMessage('Inbound Device Tracking Number is required.', 'error');
return;
}

modalLoadingMessage.classList.remove('hidden');
manualFulfillmentFormContainer.classList.add('hidden');
modalMessage.classList.add('hidden');
sendReminderBtn.classList.add('hidden'); // Hide reminder button during processing

try {
const url = `${BACKEND_BASE_URL}/manual-fulfill/${orderId}`;
console.log("Submitting manual fulfillment to:", url);
const response = await fetch(url, {
method: 'POST',
headers: { 'Content-Type': 'application/json' },
body: JSON.stringify({
outboundTrackingNumber: isKitOrder ? outboundTracking : null,
inboundTrackingNumber: inboundTracking,
// Provide a placeholder URL if not given, as the backend needs a value
inboundLabelUrl: labelUrl || 'https://placehold.co/1x1/ffffff/fff?text=N/A',
})
});

if (!response.ok) {
const errorText = await response.text();
console.error("Backend error response for manual fulfillment:", response.status, errorText);
throw new Error(errorText || `Failed to manually fulfill order: ${response.status} - ${errorText.substring(0, 100)}`);
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

function showDeleteConfirmation(orderId) {
modalActionButtons.classList.add('hidden');
deleteConfirmationContainer.classList.remove('hidden');
sendReminderBtn.classList.add('hidden'); // Hide reminder button when delete confirmation is open

confirmDeleteBtn.onclick = () => handleAction(orderId, 'deleteOrder');
cancelDeleteBtn.onclick = () => {
deleteConfirmationContainer.classList.add('hidden');
modalActionButtons.classList.remove('hidden');
// Re-evaluate visibility when form closes (by re-opening modal implicitly)
openOrderDetailsModal(orderId);
};
}

async function submitReOfferFromForm(orderId) {
const newPrice = reofferNewPrice.value;
const comments = reofferComments.value;
const reasons = Array.from(document.querySelectorAll('input[name="reoffer-reasons"]:checked')).map(cb => cb.value);

if (!newPrice || isNaN(parseFloat(newPrice)) || reasons.length === 0) {
displayModalMessage('Please enter a valid price and select at least one reason.', 'error');
return;
}

modalLoadingMessage.classList.remove('hidden');
reofferFormContainer.classList.add('hidden');
modalMessage.classList.add('hidden');
sendReminderBtn.classList.add('hidden'); // Hide reminder button during processing

try {
const url = `${BACKEND_BASE_URL}/orders/${orderId}/re-offer`;
console.log("Submitting re-offer to:", url);
const response = await fetch(url, {
method: 'POST',
headers: { 'Content-Type': 'application/json' },
body: JSON.stringify({ newPrice: parseFloat(newPrice), reasons, comments })
});

if (!response.ok) {
const errorText = await response.text();
console.error("Backend error response for re-offer:", response.status, errorText);
throw new Error(errorText || `Failed to send re-offer: ${response.status} - ${errorText.substring(0, 100)}`);
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

async function handleAction(orderId, actionType) {
// Hide all special sections before starting action
modalLoadingMessage.classList.remove('hidden');
modalActionButtons.classList.add('hidden');
reofferFormContainer.classList.add('hidden');
manualFulfillmentFormContainer.classList.add('hidden');
deleteConfirmationContainer.classList.add('hidden');
voidLabelFormContainer.classList.add('hidden');
modalMessage.classList.add('hidden');
modalMessage.textContent = '';
sendReminderBtn.classList.add('hidden'); // Hide reminder button during processing

try {
let url;
let method = 'PUT';
let body = {};

switch(actionType) {
case 'generateLabel':
url = `${BACKEND_BASE_URL}/generate-label/${orderId}`;
method = 'POST';
break;
case 'markReceived':
url = `${BACKEND_BASE_URL}/orders/${orderId}/status`;
body = { status: 'received' };
break;
case 'markCompleted':
url = `${BACKEND_BASE_URL}/orders/${orderId}/status`;
body = { status: 'completed' };
break;
case 'sendReminderEmail': // NEW Case: Send Reminder Email
url = `${BACKEND_BASE_URL}/send-reminder-email/${orderId}`;
method = 'POST';
break;
case 'payNow':
const order = allOrders.find(o => o.id === orderId);
if (!order) {
throw new Error('Order data not found locally.');
}
const paymentLink = generatePaymentLink(order);
if (paymentLink) {
window.open(paymentLink, '_blank');
displayModalMessage('Payment link generated and opened in a new tab.', 'success');
await handleAction(orderId, 'markCompleted');
} else {
throw new Error('Could not generate payment link.');
}
modalLoadingMessage.classList.add('hidden');
modalActionButtons.classList.remove('hidden');
return;
case 'sendReturnLabel':
url = `${BACKEND_BASE_URL}/orders/${orderId}/return-label`;
method = 'POST';
break;
case 'markKitSent':
url = `${BACKEND_BASE_URL}/orders/${orderId}/mark-kit-sent`;
method = 'POST';
break;
case 'cancelOrder':
url = `${BACKEND_BASE_URL}/orders/${orderId}/cancel`;
method = 'POST';
break;
case 'deleteOrder': // NEW: Delete Order Logic
url = `${BACKEND_BASE_URL}/orders/${orderId}`;
method = 'DELETE';
break;
default:
throw new Error('Unknown action.');
}

console.log(`Performing action ${actionType} to:`, url);
const response = await fetch(url, {
method: method,
headers: { 'Content-Type': 'application/json' },
body: Object.keys(body).length > 0 ? JSON.stringify(body) : null
});

if (!response.ok) {
const errorText = await response.text();
console.error("Backend error response for action:", response.status, errorText);
throw new Error(errorText || `Failed to perform action: ${response.status} - ${errorText.substring(0, 100)}`);
}
const result = await response.json();

displayModalMessage(result.message, 'success');

if (actionType === 'deleteOrder') {
// Close the modal and rely on the snapshot listener to refresh the list
closeOrderDetailsModal();
} else {
// For all other actions, re-open the modal to show the new status/data (like lastReminderSentAt)
openOrderDetailsModal(orderId);
}

} catch (error) {
console.error("Action error:", error);
displayModalMessage(`Error: ${error.message}`, 'error');
} finally {
modalLoadingMessage.classList.add('hidden');
modalActionButtons.classList.remove('hidden');
}
}

function generatePaymentLink(order) {
const amount = order.reOffer?.newPrice
? order.reOffer.newPrice.toFixed(2)
: (order.estimatedQuote ? order.estimatedQuote.toFixed(2) : '0.00');
const customerName = order.shippingInfo ? order.shippingInfo.fullName : 'Customer';
const venmoUsername = order.paymentDetails?.venmoUsername;

if (order.paymentMethod === 'venmo' && venmoUsername) {
const note = `Payment for ${order.device} - Order ${order.id}`;
return `https://venmo.com/?txn=pay&aud_id=${venmoUsername}&amount=${amount}&note=${encodeURIComponent(note)}`;
}
return null;
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

function closeOrderDetailsModal() {
orderDetailsModal.classList.add('hidden');
}

reofferParentLink.addEventListener('click', (event) => {
event.preventDefault();
reofferSubmenu.classList.toggle('open');
});

statusLinks.forEach(link => {
link.addEventListener('click', (event) => {
event.preventDefault();
currentActiveStatus = link.dataset.status;
statusLinks.forEach(l => l.classList.remove('active'));
link.classList.add('active');
filterAndRenderOrders(currentActiveStatus, searchInput.value);
});
});

dashboardCards.forEach(card => {
card.addEventListener('click', () => {
const statusToFilter = card.dataset.status;
const targetLink = document.querySelector(`.status-link[data-status="${statusToFilter}"]`);
if (targetLink) {
targetLink.click();
}
});
});

searchInput.addEventListener('input', () => {
filterAndRenderOrders(currentActiveStatus, searchInput.value);
});

closeModalButton.addEventListener('click', closeOrderDetailsModal);

if (paginationPrev && paginationNext) {
paginationPrev.addEventListener('click', () => {
if (currentPage > 1) {
currentPage--;
renderOrders();
renderPagination();
}
});

paginationNext.addEventListener('click', () => {
const source = currentFilteredOrders.length ? currentFilteredOrders : allOrders;
const totalPages = Math.max(1, Math.ceil(source.length / ORDERS_PER_PAGE));
if (currentPage < totalPages) {
currentPage++;
renderOrders();
renderPagination();
}
});
}

document.addEventListener('DOMContentLoaded', async () => {
try {
const app = firebaseApp;
db = getFirestore(app);
auth = getAuth(app);
// Using signInAnonymously for public/non-admin access to see the dashboard structure
await signInAnonymously(auth);
// Note: For a real admin dashboard, you would use signInWithEmailAndPassword here
// and rely on Firestore Security Rules to limit access.
currentUserId = auth.currentUser.uid;
displayUserId.textContent = currentUserId;
fetchAndRenderOrders();
} catch (error) {
console.error("Error initializing Firebase:", error);
ordersTableBody.innerHTML = `<tr><td colspan="7" class="text-center text-red-500 py-4">Failed to load orders.</td></tr>`;
}
});

async function fetchAndRenderOrders() {
try {
const ordersCollectionRef = collection(db, "orders");
onSnapshot(ordersCollectionRef, (snapshot) => {
allOrders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
updateDashboardCounts(allOrders);
filterAndRenderOrders(currentActiveStatus, searchInput.value);
});
} catch (error) {
console.error('Error fetching real-time orders:', error);
ordersTableBody.innerHTML = `<tr><td colspan="7" class="text-center text-red-500 py-4">Failed to load orders.</td></tr>`;
}
}

function filterAndRenderOrders(status, searchTerm) {
let filtered = allOrders;

if (status !== 'all') {
if (status === 'label_generated') {
filtered = filtered.filter(order => order.status === 'label_generated' || order.status === 'emailed');
} else {
filtered = filtered.filter(order => order.status === status);
}
}

if (searchTerm) {
const lowerCaseSearchTerm = searchTerm.toLowerCase();
filtered = filtered.filter(order =>
order.id.toLowerCase().includes(lowerCaseSearchTerm) ||
(order.shippingInfo && order.shippingInfo.fullName.toLowerCase().includes(lowerCaseSearchTerm)) ||
(order.device && order.device.toLowerCase().includes(lowerCaseSearchTerm)) ||
(order.storage && order.storage.toLowerCase().includes(lowerCaseSearchTerm)) ||
(order.trackingNumber && order.trackingNumber.toLowerCase().includes(lowerCaseSearchTerm))
);
}
filtered.sort((a, b) => {
const aDate = toDateSafe(a.createdAt) || new Date(0);
const bDate = toDateSafe(b.createdAt) || new Date(0);
return bDate.getTime() - aDate.getTime();
});

currentFilteredOrders = filtered;
currentPage = 1;
renderOrders();
renderPagination();
}
