// === FETCH_SHIM_BEGIN ===
(() => {
  // Cloud Functions base for API
  const CLOUD_FN_BASE = "https://us-central1-buyback-a0f05.cloudfunctions.net/api";

  // Keep a ref to the original fetch
  const _fetch = window.fetch.bind(window);

  function needsRewrite(u) {
    try {
      const url = new URL(u, window.location.href);
      // Path might be: /api/..., /admin/api/..., or api/... (resolved to /admin/api/...)
      const path = url.pathname.replace(/^\/+/, "/"); // collapse to leading single slash
      return path === "/api" || path.startsWith("/api/") || path.startsWith("/admin/api/");
    } catch {
      return false;
    }
  }

  function rewrite(u) {
    const url = new URL(u, window.location.href);
    // Strip any leading /admin in front of /api
    let path = url.pathname.replace(/^\/+/, "/");
    if (path.startsWith("/admin/api/")) path = path.replace("/admin/api/", "/api/");
    if (path === "/admin/api") path = "/api";

    // Build new URL against Cloud Functions base
    const rest = path.replace(/^\/api/, "");
    const rewritten = new URL(CLOUD_FN_BASE + rest, CLOUD_FN_BASE);
    rewritten.search = url.search; // preserve query
    rewritten.hash = url.hash;

    return rewritten.toString();
  }

  window.fetch = (input, init) => {
    try {
      const u = typeof input === "string" ? input : (input && input.url) ? input.url : String(input);
      if (needsRewrite(u)) {
        const rewritten = rewrite(u);
        // console.debug("[fetch shim] →", u, "⇒", rewritten);
        if (typeof input === "string") return _fetch(rewritten, init);
        // If Request object, clone with new URL
        return _fetch(new Request(rewritten, input), init);
      }
    } catch (_) {}
    return _fetch(input, init);
  };
})();
// === FETCH_SHIM_END ===

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

const TREND_LOOKBACK_DAYS = 14;
const STATUS_CHART_CONFIG = [
{ key: 'order_pending', label: 'Order Pending', color: '#6366f1' },
{ key: 'kit_needs_printing', label: 'Needs Printing', color: '#8b5cf6' },
{ key: 'kit_sent', label: 'Kit Sent', color: '#f97316' },
{ key: 'kit_delivered', label: 'Kit Delivered', color: '#10b981' },
{ key: 'label_generated', label: 'Label Generated', color: '#f59e0b' },
{ key: 'emailed', label: 'Emailed', color: '#38bdf8' },
{ key: 'received', label: 'Received', color: '#0ea5e9' },
{ key: 'completed', label: 'Completed', color: '#22c55e' },
{ key: 're-offered-pending', label: 'Reoffer Pending', color: '#facc15' },
{ key: 're-offered-accepted', label: 'Reoffer Accepted', color: '#14b8a6' },
{ key: 're-offered-declined', label: 'Reoffer Declined', color: '#ef4444' },
{ key: 'return-label-generated', label: 'Return Label', color: '#64748b' },
];

const TRUSTPILOT_REVIEW_LINK = "https://www.trustpilot.com/evaluate/secondhandcell.com";
const TRUSTPILOT_STARS_IMAGE_URL = "https://cdn.trustpilot.net/brand-assets/4.1.0/stars/stars-5.png";

// Custom logo URL for the packing slip header - UPDATED LOGO URL
const LOGO_URL = "https://raw.githubusercontent.com/ToratYosef/BuyBacking/refs/heads/main/assets/logo.png";

import { firebaseApp } from "/assets/js/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, doc, onSnapshot, collection, query, where, orderBy, limit } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-functions.js";
/* --- API BASE URL FIX: Redirect /api/* to Cloud Functions base --- */
(function () {
  try {
    const BASE =
      (typeof window !== "undefined" && window.API_BASE) ||
      (typeof BACKEND_BASE_URL !== "undefined" && BACKEND_BASE_URL) ||
      "https://us-central1-buyback-a0f05.cloudfunctions.net/api";
    const ORIG_FETCH = window.fetch.bind(window);
    window.fetch = function (input, init) {
      const url = typeof input === "string" ? input : (input && input.url) || "";
      if (
        url &&
        (url.startsWith("/api") || /:\/\/buyback-a0f05\.web\.app\/api\b/i.test(url))
      ) {
        const rewritten = url
          .replace(/^https?:\/\/[^/]+\/api/i, BASE)
          .replace(/^\/api\b/i, BASE);
        if (typeof input === "string") return ORIG_FETCH(rewritten, init);
        const req = new Request(rewritten, input);
        return ORIG_FETCH(req, init);
      }
      return ORIG_FETCH(input, init);
    };
  } catch (e) {
    console.warn("API base shim failed", e);
  }
})();
/* --- END API BASE URL FIX --- */


let db;
let auth;
let functions;
let currentUserId = 'anonymous_user';

const ADMIN_PAGE = document.body?.dataset?.adminPage || 'orders';
const IS_ORDERS_PAGE = ADMIN_PAGE === 'orders';
const IS_ANALYTICS_PAGE = ADMIN_PAGE === 'analytics';
const IS_AGING_PAGE = ADMIN_PAGE === 'aging';
const IS_BULK_PRINT_PAGE = ADMIN_PAGE === 'bulk-print';

const ordersTableBody = document.getElementById('orders-table-body');
const noOrdersMessage = document.getElementById('no-orders-message');
const paginationControls = document.getElementById('pagination-controls');
const paginationFirst = document.getElementById('pagination-first');
const paginationPrev = document.getElementById('pagination-prev');
const paginationNext = document.getElementById('pagination-next');
const paginationLast = document.getElementById('pagination-last');
const paginationPages = document.getElementById('pagination-pages');
const paginationInfo = document.getElementById('pagination-info');
const searchInput = document.getElementById('search-orders');
const mobileSearchInput = document.getElementById('mobile-search-orders');
const statusFilterButtons = document.querySelectorAll('#status-filter-bar .filter-chip');
const liveOrdersCount = document.getElementById('live-orders-count');
const averagePayoutAmount = document.getElementById('average-payout-amount');
const mobileLiveOrdersCount = document.getElementById('mobile-live-orders-count');
const mobileAveragePayoutAmount = document.getElementById('mobile-average-payout-amount');
const compactDensityToggle = document.getElementById('compact-density-toggle');
const refreshOrdersBtn = document.getElementById('refresh-orders-btn');
const lastRefreshAt = document.getElementById('last-refresh-at');
const ordersSelectAllCheckbox = document.getElementById('orders-select-all');
const massPrintBtn = document.getElementById('mass-print-btn');
const ordersToolbarFeedback = document.getElementById('orders-toolbar-feedback');
const MASS_PRINT_DEFAULT_LABEL = '<i class="fas fa-print"></i> Print selected kits';
const selectedOrderIds = new Set();
let lastRenderedOrderIds = [];
let ordersFeedbackTimeout = null;
if (lastRefreshAt) {
lastRefreshAt.textContent = 'Listening for updates…';
}
/* REMOVED STATUS LINKS REFERENCE */
const displayUserId = document.getElementById('display-user-id');

// Insight metric elements
const ordersTodayCount = document.getElementById('orders-today-count');
const totalPayoutAmount = document.getElementById('total-payout-amount');
const conversionRate = document.getElementById('conversion-rate');
const receivedDevicesCount = document.getElementById('received-devices-count');

// Updated count elements
const orderPendingCount = document.getElementById('order-pending-count');
const kitNeedsPrintingCount = document.getElementById('kit-needs-printing-count');
const kitSentCount = document.getElementById('kit-sent-count');
const kitDeliveredCount = document.getElementById('kit-delivered-count');
const labelGeneratedCount = document.getElementById('label-generated-count');
const emailedCount = document.getElementById('emailed-count');
const receivedCount = document.getElementById('received-count');
const completedCount = document.getElementById('completed-count');
const reofferedPendingCount = document.getElementById('re-offered-pending-count');
const reofferedAcceptedCount = document.getElementById('re-offered-accepted-count');
const reofferedDeclinedCount = document.getElementById('re-offered-declined-count');
const returnLabelGeneratedCount = document.getElementById('return-label-generated-count');
const statusCountAll = document.getElementById('status-count-all');

// Analytics elements
const ordersTrendCanvas = document.getElementById('orders-trend-chart');
const ordersTrendDelta = document.getElementById('orders-trend-delta');
const ordersStatusCanvas = document.getElementById('orders-status-chart');
const statusBreakdownList = document.getElementById('status-breakdown-list');
const statusBreakdownItems = statusBreakdownList ? Array.from(statusBreakdownList.querySelectorAll('.status-breakdown-item')) : [];
const agingWatchlist = document.getElementById('aging-watchlist');
const trustpilotHighlightLink = document.getElementById('trustpilot-highlight-link');
const trustpilotHighlightImage = document.getElementById('trustpilot-highlight-image');
const trustpilotFooterLink = document.getElementById('trustpilot-footer-link');
const trustpilotFooterImage = document.getElementById('trustpilot-footer-image');
const adminFooterYear = document.getElementById('admin-footer-year');

let currentSearchTerm = '';
if (searchInput && searchInput.value) {
currentSearchTerm = searchInput.value;
} else if (mobileSearchInput && mobileSearchInput.value) {
currentSearchTerm = mobileSearchInput.value;
}
syncSearchInputs(currentSearchTerm);

if (trustpilotHighlightLink) {
trustpilotHighlightLink.href = TRUSTPILOT_REVIEW_LINK;
}
if (trustpilotHighlightImage) {
trustpilotHighlightImage.src = TRUSTPILOT_STARS_IMAGE_URL;
trustpilotHighlightImage.alt = 'See our Trustpilot reviews';
}
if (trustpilotFooterLink) {
trustpilotFooterLink.href = TRUSTPILOT_REVIEW_LINK;
}
if (trustpilotFooterImage) {
trustpilotFooterImage.src = TRUSTPILOT_STARS_IMAGE_URL;
trustpilotFooterImage.alt = 'Trustpilot 5 star rating';
}
if (adminFooterYear) {
adminFooterYear.textContent = new Date().getFullYear();
}

const orderDetailsModal = document.getElementById('order-details-modal');
const closeModalButton = document.getElementById('close-modal');
const modalOrderId = document.getElementById('modal-order-id');
const modalCustomerName = document.getElementById('modal-customer-name');
const modalCustomerEmail = document.getElementById('modal-customer-email');
const modalCustomerPhone = document.getElementById('modal-customer-phone');
const modalItem = document.getElementById('modal-item');
const modalStorage = document.getElementById('modal-storage');
const modalCarrier = document.getElementById('modal-carrier');
const modalPrice = document.getElementById('modal-price');
const modalPaymentMethod = document.getElementById('modal-payment-method');

// Payment Detail Rows (Updated)
const modalVenmoUsernameRow = document.getElementById('modal-venmo-username-row');
const modalVenmoUsername = document.getElementById('modal-venmo-username');
const modalPaypalEmailRow = document.getElementById('modal-paypal-email-row');
const modalPaypalEmail = document.getElementById('modal-paypal-email');
const modalZelleDetailsRow = document.getElementById('modal-zelle-details-row');
const modalZelleDetails = document.getElementById('modal-zelle-details');

const modalShippingAddress = document.getElementById('modal-shipping-address');
const modalConditionPowerOn = document.getElementById('modal-condition-power-on');
const modalConditionFunctional = document.getElementById('modal-condition-functional');
const modalConditionCracks = document.getElementById('modal-condition-cracks');
const modalConditionCosmetic = document.getElementById('modal-condition-cosmetic');
const modalStatus = document.getElementById('modal-status');

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
const modalLastReminderDate = document.getElementById('modal-last-reminder-date');
const modalOrderAge = document.getElementById('modal-order-age');
const modalKitTrackingRow = document.getElementById('modal-kit-tracking-row');
const modalKitTrackingStatus = document.getElementById('modal-kit-tracking-status');
const modalKitTrackingUpdated = document.getElementById('modal-kit-tracking-updated');

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

// New Delete Confirmation Elements
const deleteConfirmationContainer = document.getElementById('delete-confirmation-container');
const confirmDeleteBtn = document.getElementById('confirm-delete-btn');
const cancelDeleteBtn = document.getElementById('cancel-delete-btn');

// Reminder Email Button
const sendReminderBtn = document.getElementById('send-reminder-btn');
const sendExpiringReminderBtn = document.getElementById('send-expiring-reminder-btn');
const sendKitReminderBtn = document.getElementById('send-kit-reminder-btn');

const voidLabelFormContainer = document.getElementById('void-label-form-container');
const voidLabelOptionsContainer = document.getElementById('void-label-options');
const voidLabelMessage = document.getElementById('void-label-message');
const submitVoidLabelBtn = document.getElementById('submit-void-label-btn');
const cancelVoidLabelBtn = document.getElementById('cancel-void-label-btn');

const cancelOrderFormContainer = document.getElementById('cancel-order-form-container');
const cancelOrderVoidOptionsContainer = document.getElementById('cancel-order-void-options');
const cancelOrderMessage = document.getElementById('cancel-order-message');
const cancelOrderError = document.getElementById('cancel-order-error');
const cancelCancelOrderBtn = document.getElementById('cancel-cancel-order-btn');
const confirmCancelOrderBtn = document.getElementById('confirm-cancel-order-btn');

/* REMOVED SUBMENU REFERENCES */
/* const reofferParentLink = document.querySelector('.reoffer-parent'); */
/* const reofferSubmenu = document.querySelector('.submenu-container'); */

let allOrders = [];
let currentFilteredOrders = [];
let currentPage = 1;
let lastKnownTotalPages = 1;
const ORDERS_PER_PAGE = 10;
let currentActiveStatus = IS_BULK_PRINT_PAGE ? 'kit_needs_printing' : 'all';
let refreshInterval = null;
let currentOrderDetails = null;
let feedPricingDataCache = null;
let feedPricingDataPromise = null;
const autoRefreshedTracking = new Set();

let ordersTrendChart = null;
let ordersStatusChart = null;

const analyticsSection = document.getElementById('site-analytics');
const analyticsWindowSelect = document.getElementById('analytics-window-select');
const analyticsGranularitySelect = document.getElementById('analytics-granularity-select');
const analyticsPathInput = document.getElementById('analytics-path-input');
const analyticsAutoRefreshToggle = document.getElementById('analytics-autorefresh-toggle');
const analyticsRefreshButton = document.getElementById('analytics-refresh-button');
const analyticsStatus = document.getElementById('analytics-status');
const analyticsTimeseriesCanvas = document.getElementById('analytics-timeseries-chart');
const analyticsTimeseriesSubtitle = document.getElementById('analytics-timeseries-subtitle');
const analyticsKpiPageviews = document.getElementById('analytics-kpi-pageviews');
const analyticsKpiUniques = document.getElementById('analytics-kpi-uniques');
const analyticsKpiActive = document.getElementById('analytics-kpi-active');
const analyticsKpiAvgviews = document.getElementById('analytics-kpi-avgviews');
const analyticsTopTableBody = document.getElementById('analytics-top-table');
const analyticsReferrerTableBody = document.getElementById('analytics-referrer-table');
const analyticsConversionTotal = document.getElementById('analytics-conversion-total');
const analyticsConversionTableBody = document.getElementById('analytics-conversion-table');
const analyticsConversionRecent = document.getElementById('analytics-conversion-recent');
const analyticsLiveList = document.getElementById('analytics-live-list');

const analyticsState = {
window: '24h',
granularity: 'auto',
path: '',
autoRefresh: false,
timer: null,
initialized: false,
loading: false,
};
let analyticsTimeseriesChart = null;

function syncSearchInputs(term = '') {
if (searchInput && searchInput.value !== term) {
searchInput.value = term;
}
if (mobileSearchInput && mobileSearchInput.value !== term) {
mobileSearchInput.value = term;
}
}

function applySearchTerm(term = '') {
currentSearchTerm = term || '';
syncSearchInputs(currentSearchTerm);
filterAndRenderOrders(currentActiveStatus, currentSearchTerm);
}

const KIT_PRINT_PENDING_STATUSES = ['shipping_kit_requested', 'kit_needs_printing', 'needs_printing'];
const REMINDER_ELIGIBLE_STATUSES = ['label_generated', 'emailed'];
const EXPIRING_REMINDER_STATUSES = ['order_pending', ...KIT_PRINT_PENDING_STATUSES, 'label_generated', 'emailed'];
const KIT_REMINDER_STATUSES = ['kit_sent', 'kit_delivered'];
const AGING_EXCLUDED_STATUSES = new Set([
  'completed',
  'return-label-generated',
  'return_label_generated',
  'cancelled',
  'canceled',
  'order_cancelled',
  're-offered-declined',
]);
const MIN_AGING_MS = 15 * 24 * 60 * 60 * 1000;

window.addEventListener('message', (event) => {
if (!event.data || event.data.type !== 'kit-print-complete') {
return;
}
const printedOrderId = event.data.orderId;
if (!printedOrderId) {
return;
}
markKitAsPrinted(printedOrderId);
});

window.addEventListener('beforeunload', () => {
if (analyticsState.timer) {
clearInterval(analyticsState.timer);
}
});

window.addEventListener('page-tracker:updated', () => {
if (!analyticsState.initialized) {
return;
}
refreshAnalyticsData({ silent: true });
});

window.addEventListener('storage', (event) => {
if (event.key !== LOCAL_TRACKER_STORAGE_KEY) {
return;
}
if (!analyticsState.initialized) {
return;
}
refreshAnalyticsData({ silent: true });
});

if (orderDetailsModal) {
  orderDetailsModal.addEventListener('click', (event) => {
    if (event.target === orderDetailsModal) {
      closeOrderDetailsModal();
    }
  });
}





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

function coerceTimestampToDate(timestamp) {
if (!timestamp) return null;
if (timestamp instanceof Date) return timestamp;
if (typeof timestamp === 'number') {
return new Date(timestamp > 1e12 ? timestamp : timestamp * 1000);
}
if (typeof timestamp === 'string') {
const parsed = new Date(timestamp);
return Number.isNaN(parsed.getTime()) ? null : parsed;
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
const date = coerceTimestampToDate(timestamp);
if (!date) return 'N/A';
const diffMs = Date.now() - date.getTime();
if (diffMs <= 0) return '0.0 days old';
const days = diffMs / (24 * 60 * 60 * 1000);
return `${days.toFixed(1)} days old`;
}

function formatLabelAge(timestamp) {
const date = coerceTimestampToDate(timestamp);
if (!date) return 'Unknown age';
const diffMs = Date.now() - date.getTime();
if (diffMs <= 0) return 'Generated today';
const days = diffMs / (24 * 60 * 60 * 1000);
return `${days.toFixed(1)} days old`;
}

function formatDateTime(timestamp) {
const date = coerceTimestampToDate(timestamp);
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
const parts = [description];
if (order.labelTrackingEstimatedDelivery) {
parts.push(`ETA ${formatDate(order.labelTrackingEstimatedDelivery)}`);
}
return parts.join(' • ');
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
const labels = order && typeof order.shipEngineLabels === 'object'
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

if (!options.length && order && order.shipEngineLabelId) {
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

function createLabelOptionElement(option, { prefix = 'void-label', checked = false, checkboxClass = 'void-label-checkbox', disableCheckbox = false } = {}) {
const optionId = `${prefix}-${option.key}`;
const isDisabled = !option.isVoidable;
const shouldDisable = disableCheckbox || isDisabled;
const labelAge = formatLabelAge(option.generatedAt);
const statusText = option.status ? option.status.replace(/_/g, ' ') : 'active';
const statusClass = isDisabled ? 'text-red-600' : 'text-green-600';
const trackingText = option.trackingNumber ? `Tracking: ${option.trackingNumber}` : 'Tracking: N/A';

const wrapper = document.createElement('label');
wrapper.className = `flex items-start gap-3 p-3 border rounded-md ${isDisabled ? 'bg-gray-100 border-gray-200 opacity-70 cursor-not-allowed' : 'bg-white border-gray-200 hover:border-red-300 transition-colors duration-150'}`;

const checkbox = document.createElement('input');
checkbox.type = 'checkbox';
checkbox.className = `mt-1 h-4 w-4 text-red-600 focus:ring-red-500 border-gray-300 rounded ${checkboxClass}`;
checkbox.dataset.labelKey = option.key;
checkbox.dataset.labelId = option.labelId;
checkbox.id = optionId;
checkbox.disabled = shouldDisable;
if ((checked && !isDisabled) || shouldDisable) {
checkbox.checked = true;
}

if (disableCheckbox && !isDisabled) {
checkbox.classList.add('cursor-not-allowed', 'opacity-80');
}

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
return wrapper;
}

async function requestVoidLabels(orderId, selections) {
const response = await fetch(`${BACKEND_BASE_URL}/orders/${orderId}/void-label`, {
method: 'POST',
headers: { 'Content-Type': 'application/json' },
body: JSON.stringify({ labels: selections }),
});

if (!response.ok) {
const errorText = await response.text();
throw new Error(errorText || `Failed to void labels: ${response.status}`);
}

return response.json();
}

function summarizeVoidResults(result) {
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

return { summaryMessage: summaryMessage.trim(), approvedCount, deniedCount };
}

function coerceCurrencyValue(value) {
const numeric = Number(value);
return Number.isFinite(numeric) ? numeric : null;
}

function getOrderPayout(order) {
if (!order || typeof order !== 'object') {
return 0;
}

const candidates = [
order.finalPayoutAmount,
order.finalPayout,
order.finalOfferAmount,
order.finalOffer,
order.payoutAmount,
order.payout,
order.reOffer?.newPrice,
order.reOffer?.amount,
order.reOffer,
order.reoffer,
order.estimatedQuote,
order.price,
];

for (const candidate of candidates) {
if (candidate === undefined || candidate === null) {
continue;
}
const numeric = coerceCurrencyValue(candidate);
if (numeric !== null) {
return numeric;
}
}

return 0;
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

function getAnalyticsWindowMs(value) {
if (typeof value !== 'string') {
return 24 * 60 * 60 * 1000;
}
const match = value.trim().match(/^(\d+)([mhd])$/i);
if (!match) {
return 24 * 60 * 60 * 1000;
}
const amount = parseInt(match[1], 10);
if (!Number.isFinite(amount) || amount <= 0) {
return 24 * 60 * 60 * 1000;
}
const unit = match[2].toLowerCase();
if (unit === 'm') {
return amount * 60 * 1000;
}
if (unit === 'h') {
return amount * 60 * 60 * 1000;
}
return amount * 24 * 60 * 60 * 1000;
}

function formatAnalyticsNumber(value) {
if (!Number.isFinite(value)) {
return '0';
}
if (value >= 1_000_000) {
return (value / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
}
if (value >= 1_000) {
return (value / 1_000).toFixed(1).replace(/\.0$/, '') + 'k';
}
return Math.round(value).toLocaleString();
}

function formatAnalyticsTimeLabel(isoString, granularity = 'minute') {
const date = new Date(isoString);
if (Number.isNaN(date.getTime())) {
return '--';
}
if (granularity === 'day') {
return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
if (granularity === 'hour') {
return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}
return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

const LOCAL_TRACKER_STORAGE_KEY = 'PAGE_TRACKER_LOGS';
const SOURCE_FALLBACK = 'Direct';

function titleCase(value) {
if (!value) {
return SOURCE_FALLBACK;
}
return value
.split(/\s+/)
.filter(Boolean)
.map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
.join(' ');
}

function normaliseReferrerSource(value) {
if (!value || typeof value !== 'string') {
return SOURCE_FALLBACK;
}
const trimmed = value.trim();
if (!trimmed) {
return SOURCE_FALLBACK;
}
const lower = trimmed.toLowerCase();
const preset = {
direct: SOURCE_FALLBACK,
internal: 'Internal',
google: 'Google',
sellcell: 'SellCell',
'sellcell.com': 'SellCell',
facebook: 'Facebook',
instagram: 'Instagram',
twitter: 'Twitter',
linkedin: 'LinkedIn',
bing: 'Bing',
yahoo: 'Yahoo',
duckduckgo: 'DuckDuckGo',
x: 'X',
};
if (preset[lower]) {
return preset[lower];
}
const cleaned = trimmed.replace(/^www\./i, '').replace(/[-_]/g, ' ');
return titleCase(cleaned);
}

function inferSourceFromReferrerUrl(refUrl) {
if (!refUrl || typeof refUrl !== 'string') {
return SOURCE_FALLBACK;
}
try {
const parsed = new URL(refUrl);
if (parsed.hostname && parsed.hostname === window.location.hostname) {
return 'Internal';
}
const params = parsed.searchParams;
const utm = params.get('utm_source') || params.get('source') || params.get('ref');
if (utm && utm.trim()) {
return normaliseReferrerSource(utm);
}
if (parsed.hostname) {
const host = parsed.hostname.toLowerCase();
if (host.includes('google')) return 'Google';
if (host.includes('sellcell')) return 'SellCell';
if (host.includes('facebook')) return 'Facebook';
if (host.includes('instagram')) return 'Instagram';
if (host.includes('twitter') || host === 'x.com') return 'Twitter';
if (host.includes('linkedin')) return 'LinkedIn';
if (host.includes('bing')) return 'Bing';
if (host.includes('yahoo')) return 'Yahoo';
if (host.includes('duckduckgo')) return 'DuckDuckGo';
return normaliseReferrerSource(host);
}
} catch (error) {
// ignore
}
return SOURCE_FALLBACK;
}

function normalizeAnalyticsPath(path) {
if (!path) {
return '';
}
const trimmed = path.trim();
if (!trimmed) {
return '';
}
return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
}

function readLocalTrackerStore() {
const fallback = { pages: {}, visitors: {}, conversions: [], conversionIndex: {}, lastUpdated: null };
try {
const raw = window.localStorage.getItem(LOCAL_TRACKER_STORAGE_KEY);
if (!raw) {
return fallback;
}
const parsed = JSON.parse(raw);
if (!parsed || typeof parsed !== 'object') {
return fallback;
}
if (!parsed.pages || typeof parsed.pages !== 'object') {
parsed.pages = {};
}
if (!parsed.visitors || typeof parsed.visitors !== 'object') {
parsed.visitors = {};
}
if (!Array.isArray(parsed.conversions)) {
parsed.conversions = [];
}
if (!parsed.conversionIndex || typeof parsed.conversionIndex !== 'object') {
parsed.conversionIndex = {};
}
if (!('lastUpdated' in parsed)) {
parsed.lastUpdated = null;
}
return parsed;
} catch (error) {
return { ...fallback, error: true };
}
}

function flattenTrackerEntries(store) {
const entries = [];
if (!store || !store.pages || typeof store.pages !== 'object') {
return entries;
}
Object.entries(store.pages).forEach(([pathKey, info]) => {
if (!info || typeof info !== 'object') {
return;
}
const ipStats = info.ipStats;
if (!ipStats || typeof ipStats !== 'object') {
return;
}
const safePath = typeof pathKey === 'string' && pathKey ? pathKey : '/';
Object.entries(ipStats).forEach(([ipKey, details]) => {
const ip = typeof ipKey === 'string' && ipKey.trim() ? ipKey.trim() : 'unknown';
const firstSeen = details && details.firstSeen ? details.firstSeen : (info.lastViewedAt || store.lastUpdated || null);
const lastSeen = details && details.lastSeen ? details.lastSeen : firstSeen;
const firstSeenMs = firstSeen ? Date.parse(firstSeen) : NaN;
const lastSeenMs = lastSeen ? Date.parse(lastSeen) : NaN;
const firstReferrer = details && typeof details.firstReferrer === 'string' ? details.firstReferrer : '';
const lastReferrer = details && typeof details.lastReferrer === 'string' ? details.lastReferrer : (firstReferrer || '');
const firstSource = normaliseReferrerSource((details && details.firstSource) || inferSourceFromReferrerUrl(firstReferrer));
const lastSource = normaliseReferrerSource((details && details.lastSource) || inferSourceFromReferrerUrl(lastReferrer) || firstSource);
entries.push({
path: safePath,
ip,
firstSeen,
lastSeen,
firstSeenMs: Number.isNaN(firstSeenMs) ? null : firstSeenMs,
lastSeenMs: Number.isNaN(lastSeenMs) ? null : lastSeenMs,
firstReferrer,
lastReferrer,
firstSource,
lastSource,
});
});
});
return entries;
}

function aggregateTopPaths(entries) {
const totals = new Map();
entries.forEach((entry) => {
const key = entry.path || '/';
if (!totals.has(key)) {
totals.set(key, { path: key, views: 0, uniqueIps: new Set() });
}
const record = totals.get(key);
record.views += 1;
if (entry.ip) {
record.uniqueIps.add(entry.ip);
}
});
return Array.from(totals.values())
.map((record) => ({
path: record.path,
views: record.views,
uniques: record.uniqueIps.size,
}))
.sort((a, b) => {
if (b.views !== a.views) {
return b.views - a.views;
}
return a.path.localeCompare(b.path);
});
}

function aggregateTopReferrers(entries) {
const totals = new Map();
entries.forEach((entry) => {
const sourceLabel = normaliseReferrerSource(entry.lastSource || entry.firstSource || SOURCE_FALLBACK);
const key = sourceLabel.toLowerCase();
if (!totals.has(key)) {
totals.set(key, {
source: sourceLabel,
views: 0,
uniqueIps: new Set(),
sampleReferrer: entry.lastReferrer || entry.firstReferrer || '',
});
}
const record = totals.get(key);
record.source = sourceLabel || record.source;
record.views += 1;
if (entry.ip) {
record.uniqueIps.add(entry.ip);
}
if (!record.sampleReferrer && (entry.lastReferrer || entry.firstReferrer)) {
record.sampleReferrer = entry.lastReferrer || entry.firstReferrer || '';
}
});
return Array.from(totals.values())
.map((record) => ({
source: record.source,
views: record.views,
uniques: record.uniqueIps.size,
sampleReferrer: record.sampleReferrer,
}))
.sort((a, b) => {
if (b.views !== a.views) {
return b.views - a.views;
}
return a.source.localeCompare(b.source);
});
}

function extractConversionEntries(store) {
const conversions = Array.isArray(store?.conversions) ? store.conversions : [];
return conversions.map((entry) => {
const occurredAtIso = entry && entry.occurredAt ? entry.occurredAt : null;
const occurredAtMs = occurredAtIso ? Date.parse(occurredAtIso) : NaN;
return {
ip: entry && entry.ip ? entry.ip : 'unknown',
path: entry && entry.path ? entry.path : '/',
source: normaliseReferrerSource(entry && entry.source ? entry.source : SOURCE_FALLBACK),
referrer: entry && entry.referrer ? entry.referrer : '',
occurredAt: occurredAtIso,
occurredAtMs: Number.isNaN(occurredAtMs) ? null : occurredAtMs,
title: entry && entry.title ? entry.title : '',
firstPage: entry && entry.firstPage ? entry.firstPage : '',
landingPage: entry && entry.landingPage ? entry.landingPage : '',
};
});
}

function aggregateConversionSources(entries) {
const totals = new Map();
entries.forEach((entry) => {
const sourceKey = entry && entry.source ? entry.source : SOURCE_FALLBACK;
if (!totals.has(sourceKey)) {
totals.set(sourceKey, { source: sourceKey, conversions: 0, uniqueIps: new Set() });
}
const record = totals.get(sourceKey);
record.conversions += 1;
if (entry && entry.ip) {
record.uniqueIps.add(entry.ip);
}
});
return Array.from(totals.values())
.map((record) => ({
source: record.source,
conversions: record.conversions,
uniques: record.uniqueIps.size,
}))
.sort((a, b) => {
if (b.conversions !== a.conversions) {
return b.conversions - a.conversions;
}
return a.source.localeCompare(b.source);
});
}

function buildRecentConversions(entries, limit = 6) {
return entries
.slice()
.sort((a, b) => {
const aTime = a && a.occurredAtMs !== null && a.occurredAtMs !== undefined ? a.occurredAtMs : 0;
const bTime = b && b.occurredAtMs !== null && b.occurredAtMs !== undefined ? b.occurredAtMs : 0;
return bTime - aTime;
})
.slice(0, limit);
}

function determineAutoGranularity(windowMs) {
if (windowMs <= 2 * 60 * 60 * 1000) {
return 'minute';
}
if (windowMs <= 48 * 60 * 60 * 1000) {
return 'hour';
}
return 'day';
}

function buildLocalTimeseries(entries, windowMs, granularity, now) {
const bucketSize = granularity === 'day'
? 24 * 60 * 60 * 1000
: granularity === 'hour'
? 60 * 60 * 1000
: 60 * 1000;
const end = now;
const start = Math.max(0, end - windowMs);
const startAligned = Math.floor(start / bucketSize) * bucketSize;
const bucketCount = Math.max(1, Math.ceil((end - startAligned) / bucketSize));
const buckets = [];
const bucketData = [];
for (let index = 0; index < bucketCount; index += 1) {
const bucketStart = startAligned + index * bucketSize;
buckets.push(bucketStart);
bucketData.push({ views: 0, uniques: new Set() });
}
entries.forEach((entry) => {
if (!entry || entry.lastSeenMs === null || entry.lastSeenMs === undefined) {
return;
}
if (entry.lastSeenMs < startAligned) {
return;
}
let bucketIndex = Math.floor((entry.lastSeenMs - startAligned) / bucketSize);
if (bucketIndex < 0) {
return;
}
if (bucketIndex >= bucketData.length) {
bucketIndex = bucketData.length - 1;
}
bucketData[bucketIndex].views += 1;
if (entry.ip) {
bucketData[bucketIndex].uniques.add(entry.ip);
}
});
return {
granularity,
buckets: buckets.map((bucketStart, index) => ({
t: new Date(bucketStart).toISOString(),
views: bucketData[index].views,
uniques: bucketData[index].uniques.size,
})),
};
}

function computeAnalyticsSummary(entries, now) {
const pageviews = entries.length;
const uniqueIps = new Set();
const activeCutoff = now - 5 * 60 * 1000;
const activeIps = new Set();
entries.forEach((entry) => {
const ip = entry.ip || 'unknown';
uniqueIps.add(ip);
if (entry.lastSeenMs !== null && entry.lastSeenMs !== undefined && entry.lastSeenMs >= activeCutoff) {
activeIps.add(ip);
}
});
const uniqueCount = uniqueIps.size;
return {
pageviews,
unique_users: uniqueCount,
active_users_now: activeIps.size,
average_views_per_user: uniqueCount > 0 ? pageviews / uniqueCount : 0,
};
}

function setAnalyticsStatus(message, state = 'idle') {
if (!analyticsStatus) {
return;
}
analyticsStatus.textContent = message;
analyticsStatus.classList.remove('analytics-status--error', 'analytics-status--loading');
if (state === 'error') {
analyticsStatus.classList.add('analytics-status--error');
} else if (state === 'loading') {
analyticsStatus.classList.add('analytics-status--loading');
}
}

function renderAnalyticsSummary(summary) {
if (!summary) {
analyticsKpiPageviews.textContent = '0';
analyticsKpiUniques.textContent = '0';
analyticsKpiActive.textContent = '0';
analyticsKpiAvgviews.textContent = '0.00';
return;
}
const pageviews = Number(summary.pageviews) || 0;
const uniqueUsers = Number(summary.unique_users) || 0;
const activeNow = Number(summary.active_users_now) || 0;
const averageViews = Number.isFinite(summary.average_views_per_user)
? Number(summary.average_views_per_user)
: (uniqueUsers > 0 ? pageviews / uniqueUsers : 0);

analyticsKpiPageviews.textContent = formatAnalyticsNumber(pageviews);
analyticsKpiUniques.textContent = formatAnalyticsNumber(uniqueUsers);
analyticsKpiActive.textContent = formatAnalyticsNumber(activeNow);
analyticsKpiAvgviews.textContent = averageViews.toFixed(2);
}

function renderAnalyticsTimeseries(timeseries) {
if (!analyticsTimeseriesCanvas) {
return;
}
const buckets = Array.isArray(timeseries?.buckets) ? timeseries.buckets : [];
const granularity = timeseries?.granularity || 'minute';
const labels = buckets.map(bucket => formatAnalyticsTimeLabel(bucket.t, granularity));
const viewsData = buckets.map(bucket => Number(bucket.views) || 0);
const uniquesData = buckets.map(bucket => Number(bucket.uniques) || 0);

if (!analyticsTimeseriesChart) {
const ctx = analyticsTimeseriesCanvas.getContext('2d');
analyticsTimeseriesChart = new Chart(ctx, {
type: 'line',
data: {
labels,
datasets: [
{
label: 'Pageviews',
data: viewsData,
borderColor: 'rgba(59, 130, 246, 1)',
backgroundColor: 'rgba(59, 130, 246, 0.2)',
tension: 0.35,
fill: true,
borderWidth: 2,
pointRadius: 0,
},
{
label: 'Unique users',
data: uniquesData,
borderColor: 'rgba(14, 165, 233, 1)',
backgroundColor: 'rgba(14, 165, 233, 0.18)',
tension: 0.35,
fill: true,
borderWidth: 2,
pointRadius: 0,
},
],
},
options: {
responsive: true,
maintainAspectRatio: false,
interaction: {
intersect: false,
mode: 'index',
},
plugins: {
legend: {
labels: {
color: '#0f172a',
},
},
tooltip: {
callbacks: {
label: context => `${context.dataset.label}: ${Math.round(context.parsed.y).toLocaleString()}`,
},
},
},
scales: {
x: {
ticks: {
color: '#475569',
autoSkip: true,
maxTicksLimit: 8,
},
grid: {
display: false,
},
},
y: {
beginAtZero: true,
ticks: {
color: '#0f172a',
},
grid: {
color: 'rgba(148, 163, 184, 0.2)',
},
},
},
},
});
}

analyticsTimeseriesChart.data.labels = labels;
analyticsTimeseriesChart.data.datasets[0].data = viewsData;
analyticsTimeseriesChart.data.datasets[1].data = uniquesData;
analyticsTimeseriesChart.update();

if (analyticsTimeseriesSubtitle) {
if (granularity === 'day') {
analyticsTimeseriesSubtitle.textContent = 'Daily totals';
} else if (granularity === 'hour') {
analyticsTimeseriesSubtitle.textContent = 'Hourly activity';
} else {
analyticsTimeseriesSubtitle.textContent = 'Per-minute activity';
}
}
}

function renderAnalyticsTop(top) {
if (!analyticsTopTableBody) {
return;
}
const rows = Array.isArray(top?.top_paths) ? top.top_paths : [];
analyticsTopTableBody.innerHTML = '';
if (!rows.length) {
const emptyRow = document.createElement('tr');
const emptyCell = document.createElement('td');
emptyCell.colSpan = 4;
emptyCell.className = 'analytics-empty-state';
emptyCell.textContent = 'No pageviews recorded for this window.';
emptyRow.appendChild(emptyCell);
analyticsTopTableBody.appendChild(emptyRow);
return;
}

const totalViews = rows.reduce((sum, row) => sum + (Number(row.views) || 0), 0);

rows.forEach((row) => {
const tr = document.createElement('tr');

const pathCell = document.createElement('td');
pathCell.textContent = row.path || '/';

const viewsCell = document.createElement('td');
viewsCell.textContent = formatAnalyticsNumber(Number(row.views) || 0);

const uniquesCell = document.createElement('td');
uniquesCell.textContent = formatAnalyticsNumber(Number(row.uniques) || 0);

const shareCell = document.createElement('td');
const shareBar = document.createElement('div');
shareBar.className = 'progress-bar';
const barFill = document.createElement('span');
const sharePercent = totalViews > 0 ? Math.min((Number(row.views) || 0) / totalViews * 100, 100) : 0;
barFill.style.width = `${sharePercent.toFixed(1)}%`;
shareBar.appendChild(barFill);
const shareLabel = document.createElement('div');
shareLabel.className = 'analytics-share-label';
shareLabel.textContent = `${sharePercent.toFixed(1)}%`;
shareCell.appendChild(shareBar);
shareCell.appendChild(shareLabel);

tr.appendChild(pathCell);
tr.appendChild(viewsCell);
tr.appendChild(uniquesCell);
tr.appendChild(shareCell);

analyticsTopTableBody.appendChild(tr);
});
}

function renderAnalyticsReferrers(data) {
if (!analyticsReferrerTableBody) {
return;
}
const rows = Array.isArray(data?.top_referrers) ? data.top_referrers : [];
analyticsReferrerTableBody.innerHTML = '';
if (!rows.length) {
const emptyRow = document.createElement('tr');
const emptyCell = document.createElement('td');
emptyCell.colSpan = 4;
emptyCell.className = 'analytics-empty-state';
emptyCell.textContent = 'No referral sources recorded for this window.';
emptyRow.appendChild(emptyCell);
analyticsReferrerTableBody.appendChild(emptyRow);
return;
}

rows.forEach((row) => {
const tr = document.createElement('tr');

const sourceCell = document.createElement('td');
sourceCell.textContent = row.source || SOURCE_FALLBACK;

const viewsCell = document.createElement('td');
viewsCell.textContent = formatAnalyticsNumber(Number(row.views) || 0);

const uniquesCell = document.createElement('td');
uniquesCell.textContent = formatAnalyticsNumber(Number(row.uniques) || 0);

const sampleCell = document.createElement('td');
sampleCell.textContent = row.sampleReferrer || '—';

tr.appendChild(sourceCell);
tr.appendChild(viewsCell);
tr.appendChild(uniquesCell);
tr.appendChild(sampleCell);

analyticsReferrerTableBody.appendChild(tr);
});
}

function renderAnalyticsConversions(data) {
if (!analyticsConversionTotal || !analyticsConversionTableBody || !analyticsConversionRecent) {
return;
}

const totalValue = data && Number.isFinite(data.total) ? data.total : 0;
analyticsConversionTotal.textContent = formatAnalyticsNumber(totalValue);

const sources = Array.isArray(data?.sources) ? data.sources : [];
analyticsConversionTableBody.innerHTML = '';
if (!sources.length) {
const emptyRow = document.createElement('tr');
const emptyCell = document.createElement('td');
emptyCell.colSpan = 3;
emptyCell.className = 'analytics-empty-state';
emptyCell.textContent = 'No conversions recorded for this window.';
emptyRow.appendChild(emptyCell);
analyticsConversionTableBody.appendChild(emptyRow);
} else {
sources.forEach((row) => {
const tr = document.createElement('tr');
const sourceCell = document.createElement('td');
sourceCell.textContent = row && row.source ? row.source : SOURCE_FALLBACK;
const conversionsCell = document.createElement('td');
conversionsCell.textContent = formatAnalyticsNumber(Number(row?.conversions) || 0);
const uniqueCell = document.createElement('td');
uniqueCell.textContent = formatAnalyticsNumber(Number(row?.uniques) || 0);
tr.appendChild(sourceCell);
tr.appendChild(conversionsCell);
tr.appendChild(uniqueCell);
analyticsConversionTableBody.appendChild(tr);
});
}

const recent = Array.isArray(data?.recent) ? data.recent : [];
analyticsConversionRecent.innerHTML = '';
if (!recent.length) {
const empty = document.createElement('div');
empty.className = 'analytics-empty-state';
empty.textContent = 'No conversions recorded yet.';
analyticsConversionRecent.appendChild(empty);
return;
}

recent.forEach((entry) => {
const card = document.createElement('div');
card.className = 'analytics-conversion-item';

const heading = document.createElement('h4');
const sourceLabel = entry && entry.source ? entry.source : SOURCE_FALLBACK;
const pathLabel = entry && entry.path ? entry.path : '/';
heading.textContent = `${sourceLabel} • ${pathLabel}`;
card.appendChild(heading);

const timestamp = document.createElement('time');
if (entry && entry.occurredAt) {
timestamp.dateTime = entry.occurredAt;
const parsed = new Date(entry.occurredAt);
timestamp.textContent = Number.isNaN(parsed.getTime())
? '—'
: parsed.toLocaleString();
} else {
timestamp.textContent = '—';
}
card.appendChild(timestamp);

const ipLine = document.createElement('span');
ipLine.textContent = `IP: ${entry && entry.ip ? entry.ip : 'unknown'}`;
card.appendChild(ipLine);

if (entry && entry.firstPage) {
const firstPageLine = document.createElement('span');
firstPageLine.textContent = `First page: ${entry.firstPage}`;
card.appendChild(firstPageLine);
}

if (entry && entry.referrer) {
const refLine = document.createElement('span');
refLine.textContent = `Referrer: ${entry.referrer}`;
card.appendChild(refLine);
}

analyticsConversionRecent.appendChild(card);
});
}

function renderAnalyticsLive(live) {
if (!analyticsLiveList) {
return;
}
analyticsLiveList.innerHTML = '';
if (!live) {
const info = document.createElement('div');
info.className = 'analytics-empty-state';
info.textContent = 'Live view is available for windows of 30 minutes or less.';
analyticsLiveList.appendChild(info);
return;
}
const buckets = Array.isArray(live?.buckets) ? live.buckets : [];
if (!buckets.length) {
const empty = document.createElement('div');
empty.className = 'analytics-empty-state';
empty.textContent = 'No recent traffic yet.';
analyticsLiveList.appendChild(empty);
return;
}
buckets.slice(-15).forEach((bucket) => {
const item = document.createElement('div');
item.className = 'analytics-live-item';
const time = document.createElement('span');
time.textContent = formatAnalyticsTimeLabel(bucket.t, 'minute');
const stats = document.createElement('strong');
stats.textContent = `${formatAnalyticsNumber(Number(bucket.views) || 0)} views · ${formatAnalyticsNumber(Number(bucket.uniques) || 0)} uniques`;
item.appendChild(time);
item.appendChild(stats);
analyticsLiveList.appendChild(item);
});
}

function handleAnalyticsError() {
setAnalyticsStatus('Analytics unavailable (check local storage access)', 'error');
analyticsKpiPageviews.textContent = '--';
analyticsKpiUniques.textContent = '--';
analyticsKpiActive.textContent = '--';
analyticsKpiAvgviews.textContent = '--';
if (analyticsTopTableBody && !analyticsTopTableBody.children.length) {
const row = document.createElement('tr');
const cell = document.createElement('td');
cell.colSpan = 4;
cell.className = 'analytics-empty-state';
cell.textContent = 'Analytics temporarily unavailable.';
row.appendChild(cell);
analyticsTopTableBody.appendChild(row);
}
if (analyticsReferrerTableBody && !analyticsReferrerTableBody.children.length) {
const row = document.createElement('tr');
const cell = document.createElement('td');
cell.colSpan = 4;
cell.className = 'analytics-empty-state';
cell.textContent = 'Analytics temporarily unavailable.';
row.appendChild(cell);
analyticsReferrerTableBody.appendChild(row);
}
if (analyticsLiveList && !analyticsLiveList.children.length) {
const empty = document.createElement('div');
empty.className = 'analytics-empty-state';
empty.textContent = 'Analytics temporarily unavailable.';
analyticsLiveList.appendChild(empty);
}
}

async function refreshAnalyticsData(options = {}) {
if (!analyticsSection) {
return;
}
if (analyticsState.loading) {
return;
}
const silent = Boolean(options.silent);
analyticsState.loading = true;
if (!silent) {
setAnalyticsStatus('Refreshing…', 'loading');
}
if (analyticsRefreshButton) {
analyticsRefreshButton.disabled = true;
analyticsRefreshButton.classList.add('is-loading');
}
if (analyticsPathInput) {
analyticsPathInput.value = analyticsState.path;
}
try {
const windowValue = analyticsState.window;
const windowMs = getAnalyticsWindowMs(windowValue);
const normalizedPath = normalizeAnalyticsPath(analyticsState.path);
const targetGranularity = analyticsState.granularity === 'auto'
? determineAutoGranularity(windowMs)
: analyticsState.granularity;

const store = readLocalTrackerStore();
if (store.error) {
throw new Error('local-storage-unavailable');
}

const entries = flattenTrackerEntries(store);
const now = Date.now();
const cutoff = now - windowMs;
const filteredEntries = entries.filter((entry) => {
if (entry.lastSeenMs === null || entry.lastSeenMs === undefined) {
return false;
}
if (entry.lastSeenMs < cutoff) {
return false;
}
if (normalizedPath && entry.path !== normalizedPath) {
return false;
}
return true;
});

const summary = computeAnalyticsSummary(filteredEntries, now);
renderAnalyticsSummary(summary);

const timeseries = buildLocalTimeseries(filteredEntries, windowMs, targetGranularity, now);
renderAnalyticsTimeseries(timeseries);

const topPaths = aggregateTopPaths(filteredEntries).slice(0, 20);
renderAnalyticsTop({ top_paths: topPaths });

const topReferrers = aggregateTopReferrers(filteredEntries).slice(0, 20);
renderAnalyticsReferrers({ top_referrers: topReferrers });

if (windowMs <= 30 * 60 * 1000) {
const liveWindowMs = Math.max(60 * 1000, windowMs);
const liveEntries = entries.filter((entry) => {
if (entry.lastSeenMs === null || entry.lastSeenMs === undefined) {
return false;
}
if (entry.lastSeenMs < now - liveWindowMs) {
return false;
}
if (normalizedPath && entry.path !== normalizedPath) {
return false;
}
return true;
});
const live = buildLocalTimeseries(liveEntries, liveWindowMs, 'minute', now);
renderAnalyticsLive(live);
} else {
renderAnalyticsLive(null);
}

const allConversions = extractConversionEntries(store);
const filteredConversions = allConversions.filter((entry) => {
if (entry.occurredAtMs === null || entry.occurredAtMs === undefined) {
return false;
}
if (entry.occurredAtMs < cutoff) {
return false;
}
if (normalizedPath && entry.path !== normalizedPath) {
return false;
}
return true;
});
const conversionSummary = {
total: filteredConversions.length,
sources: aggregateConversionSources(filteredConversions).slice(0, 10),
recent: buildRecentConversions(filteredConversions, 6),
};
renderAnalyticsConversions(conversionSummary);

if (filteredEntries.length) {
setAnalyticsStatus(`Updated ${new Date().toLocaleTimeString()}`);
} else if (store.lastUpdated) {
setAnalyticsStatus('No pageviews in this window yet.');
} else {
setAnalyticsStatus('Waiting for first page view…');
}
} catch (error) {
console.error('Failed to refresh analytics', error);
handleAnalyticsError();
} finally {
analyticsState.loading = false;
if (analyticsRefreshButton) {
analyticsRefreshButton.disabled = false;
analyticsRefreshButton.classList.remove('is-loading');
}
}
}

function updateAnalyticsAutoRefresh() {
if (analyticsState.timer) {
clearInterval(analyticsState.timer);
analyticsState.timer = null;
}
if (!analyticsState.autoRefresh || !analyticsState.initialized) {
return;
}
const windowMs = getAnalyticsWindowMs(analyticsState.window);
const interval = windowMs <= 30 * 60 * 1000 ? 10_000 : 60_000;
analyticsState.timer = setInterval(() => {
refreshAnalyticsData({ silent: true });
}, interval);
}

function initializeAnalyticsDashboard() {
if (!analyticsSection || analyticsState.initialized) {
return;
}
analyticsState.initialized = true;

if (analyticsWindowSelect) {
analyticsWindowSelect.value = analyticsState.window;
analyticsWindowSelect.addEventListener('change', () => {
analyticsState.window = analyticsWindowSelect.value;
refreshAnalyticsData();
updateAnalyticsAutoRefresh();
});
}

if (analyticsGranularitySelect) {
analyticsGranularitySelect.value = analyticsState.granularity;
analyticsGranularitySelect.addEventListener('change', () => {
analyticsState.granularity = analyticsGranularitySelect.value;
refreshAnalyticsData();
});
}

if (analyticsPathInput) {
analyticsPathInput.value = analyticsState.path;
analyticsPathInput.addEventListener('keyup', (event) => {
if (event.key === 'Enter') {
analyticsState.path = analyticsPathInput.value.trim();
refreshAnalyticsData();
}
});
analyticsPathInput.addEventListener('blur', () => {
analyticsState.path = analyticsPathInput.value.trim();
});
}

if (analyticsRefreshButton) {
analyticsRefreshButton.addEventListener('click', (event) => {
event.preventDefault();
refreshAnalyticsData();
});
}

if (analyticsAutoRefreshToggle) {
analyticsAutoRefreshToggle.checked = analyticsState.autoRefresh;
analyticsAutoRefreshToggle.addEventListener('change', () => {
analyticsState.autoRefresh = analyticsAutoRefreshToggle.checked;
updateAnalyticsAutoRefresh();
if (analyticsState.autoRefresh) {
setAnalyticsStatus('Auto-refresh enabled', 'loading');
refreshAnalyticsData({ silent: true });
} else {
setAnalyticsStatus('Auto-refresh paused');
}
});
}

refreshAnalyticsData();
updateAnalyticsAutoRefresh();
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

return `<span class="status-bubble-subtext text-slate-500">Auto-accept in ${parts.join(' ')}</span>`;
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

/**
* Generates and merges the custom packing slip with the ShipEngine labels.
* This function now uses the backend proxy to fetch PDF data.
* @param {Object} order - The full order object.
*/
async function generateAndMergeShippingDocument(order) {
const isKitOrder = order.shippingPreference === 'Shipping Kit Requested';
const rawLabelUrls = [];

if (isKitOrder) {
rawLabelUrls.push(order.outboundLabelUrl, order.inboundLabelUrl);
} else {
rawLabelUrls.push(order.uspsLabelUrl || order.outboundLabelUrl || order.inboundLabelUrl);
}

const labelUrls = Array.from(new Set(rawLabelUrls.filter(Boolean)));

if (!labelUrls.length) {
displayModalMessage('No shipping labels are available yet. Generate the label before printing.', 'error');
return;
}

if (isKitOrder && labelUrls.length < 2) {
displayModalMessage('Kit orders require both outbound and inbound labels before printing.', 'error');
return;
}

modalLoadingMessage.classList.remove('hidden');
modalActionButtons.classList.add('hidden');
displayModalMessage('Fetching labels and generating packing slip...', 'info');

try {
// --- FETCH PDFs via Proxy ---
// Function to fetch PDF data as ArrayBuffer via the Cloud Function proxy
const fetchPdfProxy = async (url) => {
if (!url) throw new Error("URL is null or empty.");

const response = await fetch(`${BACKEND_BASE_URL}/fetch-pdf`, {
method: 'POST',
headers: { 'Content-Type': 'application/json' },
body: JSON.stringify({ url: url })
});

if (!response.ok) {
const errorData = await response.json();
throw new Error(errorData.error || `Failed to fetch PDF from proxy. Status: ${response.status}`);
}

const result = await response.json();
// Decode Base64 back to ArrayBuffer
const binaryString = atob(result.base64);
const bytes = new Uint8Array(binaryString.length);
for (let i = 0; i < binaryString.length; i++) {
bytes[i] = binaryString.charCodeAt(i);
}
return bytes.buffer;
};

// 1. Fetch ShipEngine labels using the proxy
const labelPdfBuffers = await Promise.all(labelUrls.map((url) => fetchPdfProxy(url)));

// 2. Fetch Logo (optional)
let logoImage = null;
let logoDims = { width: 0, height: 0 };
try {
// This logo retrieval is done client-side since it's a generic public URL
const logoResponse = await fetch(LOGO_URL);
if (!logoResponse.ok) throw new Error("Logo fetch failed");

const logoArrayBuffer = await logoResponse.arrayBuffer();

// Embed image in a new PDFDocument temporarily to get the image object
const tempPdf = await PDFLib.PDFDocument.create();
const mimeType = LOGO_URL.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';

logoImage = mimeType === 'image/png'
? await tempPdf.embedPng(logoArrayBuffer)
: await tempPdf.embedJpg(logoArrayBuffer);

logoDims = logoImage.scale(0.3); // Scale factor
} catch (e) {
console.warn("Could not load logo image:", e);
}

const { PDFDocument, StandardFonts, rgb } = PDFLib;
const pageWidth = 288; // 4 in
const pageHeight = 432; // 6 in
const margin = 18;

const wrapTextLines = (text, font, size, maxWidth) => {
if (!text) {
return [''];
}
const words = String(text).split(/\s+/);
const lines = [];
let currentLine = '';

words.forEach((word) => {
const candidate = currentLine ? `${currentLine} ${word}` : word;
if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
currentLine = candidate;
} else {
if (currentLine) {
lines.push(currentLine);
}
currentLine = word;
}
});

if (currentLine) {
lines.push(currentLine);
}

return lines.length ? lines : [''];
};

const createBagLabelPdf = async () => {
const bagDoc = await PDFDocument.create();
const bagPage = bagDoc.addPage([pageWidth, pageHeight]);
const bagFont = await bagDoc.embedFont(StandardFonts.Helvetica);
const bagBold = await bagDoc.embedFont(StandardFonts.HelveticaBold);
let bagY = pageHeight - margin;
const maxWidth = pageWidth - margin * 2;

const formatDisplayValue = (value) => {
const normalized = normalizeConditionInput(value);

if (normalized === null || normalized === undefined) {
return null;
}

if (typeof normalized === 'boolean') {
return normalized ? 'Yes' : 'No';
}

if (typeof normalized === 'number') {
return String(normalized);
}

const cleaned = String(normalized)
.replace(/[_-]+/g, ' ')
.replace(/\s+/g, ' ')
.trim();

if (!cleaned) {
return null;
}

const lower = cleaned.toLowerCase();
if (lower === 'na' || lower === 'n/a') {
return 'N/A';
}

return cleaned
.split(' ')
.filter(Boolean)
.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
.join(' ');
};

const drawBlock = (text, options = {}) => {
const { font = bagFont, size = 11, color = rgb(0, 0, 0), spacing = 12 } = options;
wrapTextLines(text, font, size, maxWidth).forEach((line) => {
bagPage.drawText(line, { x: margin, y: bagY, size, font, color });
bagY -= spacing;
});
};

if (logoImage) {
const scaledLogo = logoImage.scale(0.18);
bagPage.drawImage(logoImage, {
x: margin,
y: bagY - scaledLogo.height,
width: scaledLogo.width,
height: scaledLogo.height,
});
bagY -= scaledLogo.height + 12;
}

drawBlock('SecondHandCell Bag Label', { font: bagBold, size: 14, color: rgb(0.1, 0.1, 0.1) });
drawBlock(`Order #${order.id}`, { font: bagBold, size: 22, color: rgb(0.1, 0.1, 0.4), spacing: 18 });

const deviceParts = [];
if (order.brand) {
deviceParts.push(order.brand);
}
if (order.device) {
deviceParts.push(order.device);
}
if (deviceParts.length) {
drawBlock(`Device: ${deviceParts.join(' • ')}`);
}

if (order.storage) {
drawBlock(`Storage: ${order.storage}`);
}

if (order.carrier) {
drawBlock(`Carrier: ${formatDisplayValue(order.carrier)}`);
}

const conditionSegments = [];
if (order.condition_power_on) {
conditionSegments.push(`Powers On: ${formatDisplayValue(order.condition_power_on)}`);
}
if (order.condition_functional) {
conditionSegments.push(`Functional: ${formatDisplayValue(order.condition_functional)}`);
}
if (order.condition_cosmetic) {
conditionSegments.push(`Cosmetic: ${formatDisplayValue(order.condition_cosmetic)}`);
}
if (conditionSegments.length) {
drawBlock(`Condition: ${conditionSegments.join(' • ')}`);
}

const payoutAmount = getOrderPayout(order).toFixed(2);
drawBlock(`Quoted Price: $${payoutAmount}`, { font: bagBold, size: 13, color: rgb(0.1, 0.45, 0.2), spacing: 16 });

drawBlock('Attach this label to the device bag before shipping.', { size: 10, color: rgb(0.35, 0.35, 0.35), spacing: 16 });

return bagDoc.save();
};

const bagLabelBytes = await createBagLabelPdf();

// Merge shipping labels followed by the bag label
const mergedPdf = await PDFLib.PDFDocument.create();

for (const bytes of labelPdfBuffers) {
const pdf = await PDFLib.PDFDocument.load(bytes);
const copied = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
copied.forEach(p => mergedPdf.addPage(p));
}

const bagLabelPdf = await PDFLib.PDFDocument.load(bagLabelBytes);
const copiedBag = await mergedPdf.copyPages(bagLabelPdf, bagLabelPdf.getPageIndices());
copiedBag.forEach(p => mergedPdf.addPage(p));

// 5. Display merged PDF in a dedicated print window
const mergedBytes = await mergedPdf.save();
const blob = new Blob([mergedBytes], { type: "application/pdf" });
const url = URL.createObjectURL(blob);

// OPEN PRINT WINDOW AND WRITE MERGED PDF VIEW
const printWindow = window.open('', `print-${order.id}`, 'width=420,height=640');
if (printWindow) {
  try { printWindow.focus(); } catch (e) { console.warn('Unable to focus print window:', e); }

  // Important: open with a back-tick and CLOSE it before the );
  printWindow.document.write(`<!DOCTYPE html>
<html>
<head>
  <title>Print Kit ${order.id}</title>
  <style>html,body{margin:0;height:100%;background:#0f172a;color:#fff;font-family:Arial, sans-serif;}iframe{width:100%;height:100%;border:0;}</style>
</head>
<body>
  <iframe id="print-frame"></iframe>
  <script>
    const pdfUrl = ${JSON.stringify(url)};
    const shouldNotify = ${order.shippingPreference === 'Shipping Kit Requested'};
    const orderId = ${JSON.stringify(order.id)};
    const frame = document.getElementById('print-frame');

    frame.addEventListener('load', () => {
      const w = frame.contentWindow;
      if (!w) return;
      w.focus();
      w.print();
    });

    frame.src = pdfUrl;

    window.onafterprint = () => {
      if (shouldNotify && window.opener) {
window.opener.postMessage({ type: 'kit-print-complete', orderId }, '*');
      }
      setTimeout(() => window.close(), 300);
    };
  <\/script>
</body>
</html>`);
  printWindow.document.close();
} else {
  displayModalMessage('Pop-up blocked. Allow pop-ups for this site to print shipping kits automatically.', 'error');
  window.open(url, '_blank');
}

setTimeout(() => URL.revokeObjectURL(url), 60000);

const baseSuccessMessage = 'Merged document (Labels + Slip) generated. Printing window opened.';
if (isKitOrder) {
const marked = await markKitAsPrinted(order.id);
if (marked) {
displayModalMessage('Merged document (Labels + Slip) generated and kit status updated to sent.', 'success');
updateReminderButtons(order);
} else {
renderActionButtons(order);
modalActionButtons.classList.remove('hidden');
updateReminderButtons(order);
}
} else {
displayModalMessage(baseSuccessMessage, 'success');
renderActionButtons(order);
modalActionButtons.classList.remove('hidden');
updateReminderButtons(order);
}

} catch (error) {
console.error("Error during PDF generation and merging:", error);
displayModalMessage(`Failed to generate PDF document: ${error.message}`, 'error');
} finally {
modalLoadingMessage.classList.add('hidden');
}
}

function updateDashboardCounts(ordersData) {
const statusCounts = {
'order_pending': ordersData.filter(o => o.status === 'order_pending').length,
'kit_needs_printing': ordersData.filter(o => KIT_PRINT_PENDING_STATUSES.includes(o.status)).length,
'kit_sent': ordersData.filter(o => o.status === 'kit_sent').length,
'kit_delivered': ordersData.filter(o => o.status === 'kit_delivered').length,
'label_generated': ordersData.filter(o => o.status === 'label_generated').length,
'emailed': ordersData.filter(o => o.status === 'emailed').length,
'received': ordersData.filter(o => o.status === 'received').length,
'completed': ordersData.filter(o => o.status === 'completed').length,
're-offered-pending': ordersData.filter(o => o.status === 're-offered-pending').length,
're-offered-accepted': ordersData.filter(o => o.status === 're-offered-accepted').length,
're-offered-declined': ordersData.filter(o => o.status === 're-offered-declined').length,
'return-label-generated': ordersData.filter(o => o.status === 'return-label-generated').length,
};

if (orderPendingCount) {
orderPendingCount.textContent = statusCounts['order_pending'];
}
if (kitNeedsPrintingCount) {
kitNeedsPrintingCount.textContent = statusCounts['kit_needs_printing'];
}
if (kitSentCount) {
kitSentCount.textContent = statusCounts['kit_sent'];
}
if (kitDeliveredCount) {
kitDeliveredCount.textContent = statusCounts['kit_delivered'];
}
if (labelGeneratedCount) {
labelGeneratedCount.textContent = statusCounts['label_generated'];
}
if (emailedCount) {
emailedCount.textContent = statusCounts['emailed'];
}
if (receivedCount) {
receivedCount.textContent = statusCounts['received'];
}
if (completedCount) {
completedCount.textContent = statusCounts['completed'];
}
if (reofferedPendingCount) {
reofferedPendingCount.textContent = statusCounts['re-offered-pending'];
}
if (reofferedAcceptedCount) {
reofferedAcceptedCount.textContent = statusCounts['re-offered-accepted'];
}
if (reofferedDeclinedCount) {
reofferedDeclinedCount.textContent = statusCounts['re-offered-declined'];
}
if (returnLabelGeneratedCount) {
returnLabelGeneratedCount.textContent = statusCounts['return-label-generated'];
}
if (statusCountAll) {
statusCountAll.textContent = ordersData.length;
}

updateGlassMetrics(ordersData);

const liveOrders = ordersData.filter(o => !['completed', 'return-label-generated'].includes(o.status)).length;
if (liveOrdersCount) {
liveOrdersCount.textContent = liveOrders;
}
if (mobileLiveOrdersCount) {
mobileLiveOrdersCount.textContent = liveOrders;
}

updateNotificationBadge(ordersData);
updateAnalytics(ordersData, statusCounts);
updateOperationsHighlights(ordersData);
}

/**
* Calculates and updates the custom glass metrics.
* @param {Array<Object>} orders - The full list of order objects.
*/
function updateGlassMetrics(orders) {
const today = new Date();
today.setHours(0, 0, 0, 0);

let initialOrderCount = 0; // The total number of quotes initiated
let completedOrdersCount = 0; // Orders in 'completed' or 're-offered-accepted'
let totalPayout = 0;
let ordersToday = 0;
let receivedDevicesCountVal = 0;

orders.forEach(order => {
const orderDate = order.createdAt?.seconds ? new Date(order.createdAt.seconds * 1000) : null;
const finalPayout = getOrderPayout(order);

// Orders Today
if (orderDate && orderDate.getTime() >= today.getTime()) {
ordersToday++;
}

// Initial Order Count: Count all orders that were initially quoted
if (order.estimatedQuote > 0) {
initialOrderCount++;
}

// Completed Payout & Completion Rate numerator
if (order.status === 'completed' || order.status === 're-offered-accepted') {
completedOrdersCount++;
totalPayout += finalPayout;
}

// Devices Received
if (order.status === 'received') {
receivedDevicesCountVal++;
}
});

// Conversion Rate calculation
const conversionRateVal = initialOrderCount > 0
? ((completedOrdersCount / initialOrderCount) * 100).toFixed(1)
: '0.0';

if (ordersTodayCount) {
ordersTodayCount.textContent = ordersToday;
}
if (totalPayoutAmount) {
totalPayoutAmount.textContent = `$${totalPayout.toFixed(2)}`;
}
if (conversionRate) {
conversionRate.textContent = `${conversionRateVal}%`;
}
if (receivedDevicesCount) {
receivedDevicesCount.textContent = receivedDevicesCountVal;
}
if (averagePayoutAmount) {
averagePayoutAmount.textContent = completedOrdersCount > 0
? `$${(totalPayout / completedOrdersCount).toFixed(2)}`
: '$0.00';
}
if (mobileAveragePayoutAmount) {
mobileAveragePayoutAmount.textContent = completedOrdersCount > 0
? `$${(totalPayout / completedOrdersCount).toFixed(2)}`
: '$0.00';
}
}

function updateAnalytics(orders, statusCounts) {
if (typeof Chart === "undefined") {
return;
}

updateTrendChart(orders);
updateStatusChart(statusCounts);
}

function updateOperationsHighlights(orders = []) {
if (!IS_AGING_PAGE || !agingWatchlist) {
return;
}

const now = Date.now();

const ranked = orders
.map(order => {
const createdAtMs = extractTimestampMillis(order.createdAt);
if (!createdAtMs) {
return null;
}
const status = (order.status || '').toString().toLowerCase();
if (AGING_EXCLUDED_STATUSES.has(status)) {
return null;
}
const ageMs = now - createdAtMs;
return {
order,
ageMs,
createdAtMs
};
})
.filter(entry => entry && entry.ageMs >= MIN_AGING_MS)
.sort((a, b) => b.ageMs - a.ageMs);

if (!ranked.length) {
agingWatchlist.innerHTML = '<li class="empty">All caught up — no aging orders.</li>';
return;
}

const html = ranked.map(({ order }) => {
const statusText = formatStatus(order);
const orderAge = formatOrderAge(order.createdAt);
return `
<li>
<div class="watchlist-meta">
<span class="watchlist-order-id">#${order.id}</span>
<span class="watchlist-status">${statusText}</span>
<span class="watchlist-age">${orderAge}</span>
</div>
<button class="watchlist-view-btn" data-order-id="${order.id}">
<i class="fas fa-eye"></i>
View
</button>
</li>
`;
}).join('');

agingWatchlist.innerHTML = html;

agingWatchlist.querySelectorAll('.watchlist-view-btn').forEach(button => {
button.addEventListener('click', () => {
const orderId = button.dataset.orderId;
if (orderId) {
openOrderDetailsModal(orderId);
}
});
});
}

function updateTrendChart(orders) {
if (!ordersTrendCanvas || typeof Chart === "undefined") {
return;
}

const today = new Date();
today.setHours(0, 0, 0, 0);

const labels = [];
const dataPoints = [];

for (let i = TREND_LOOKBACK_DAYS - 1; i >= 0; i--) {
const dayStart = new Date(today);
dayStart.setDate(today.getDate() - i);
const startTimestamp = dayStart.getTime();
const endTimestamp = startTimestamp + 24 * 60 * 60 * 1000;
const count = orders.reduce((total, order) => {
const createdAt = extractTimestampMillis(order.createdAt);
return createdAt && createdAt >= startTimestamp && createdAt < endTimestamp
? total + 1
: total;
}, 0);

labels.push(dayStart.toLocaleDateString('en-US', { month: "short", day: "numeric" }));
dataPoints.push(count);
}

const midpoint = Math.floor(TREND_LOOKBACK_DAYS / 2);
const previousWindow = dataPoints.slice(0, midpoint).reduce((sum, value) => sum + value, 0);
const recentWindow = dataPoints.slice(midpoint).reduce((sum, value) => sum + value, 0);
updateTrendDeltaBadge(recentWindow, previousWindow);

if (!ordersTrendChart) {
ordersTrendChart = new Chart(ordersTrendCanvas, {
type: "line",
data: {
labels,
datasets: [{
label: "Orders",
data: dataPoints,
fill: true,
tension: 0.35,
borderColor: "#2563eb",
backgroundColor: "rgba(37, 99, 235, 0.18)",
pointRadius: 3,
pointHoverRadius: 5
}]
},
options: {
responsive: true,
maintainAspectRatio: false,
plugins: {
legend: { display: false },
tooltip: {
callbacks: {
label: context => `${context.parsed.y} orders`
}
}
},
scales: {
x: {
title: {
display: true,
text: "Date",
color: "#1e293b",
font: { weight: "600" }
},
ticks: {
color: "#475569",
maxTicksLimit: 4,
maxRotation: 0,
minRotation: 0
},
grid: {
color: "rgba(148, 163, 184, 0.25)",
drawBorder: true
}
},
y: {
title: {
display: true,
text: "Orders",
color: "#1e293b",
font: { weight: "600" }
},
beginAtZero: true,
ticks: {
color: "#475569",
precision: 0,
maxTicksLimit: 4
},
grid: {
color: "rgba(148, 163, 184, 0.25)",
drawBorder: true
}
}
}
}
});
} else {
ordersTrendChart.data.labels = labels;
ordersTrendChart.data.datasets[0].data = dataPoints;
ordersTrendChart.update();
}
}

function updateTrendDeltaBadge(recentWindow, previousWindow) {
if (!ordersTrendDelta) {
return;
}

ordersTrendDelta.classList.remove('trend-up', 'trend-down', 'trend-neutral');

let deltaPercentage = 0;
if (previousWindow === 0) {
deltaPercentage = recentWindow === 0 ? 0 : 100;
} else {
deltaPercentage = ((recentWindow - previousWindow) / previousWindow) * 100;
}

const rounded = Math.round(deltaPercentage);
const formatted = `${rounded > 0 ? '+' : ""}${rounded}%`;
ordersTrendDelta.textContent = formatted;

if (rounded > 0) {
ordersTrendDelta.classList.add('trend-up');
} else if (rounded < 0) {
ordersTrendDelta.classList.add('trend-down');
} else {
ordersTrendDelta.classList.add('trend-neutral');
}
}

function updateStatusChart(statusCounts = {}) {
if (!ordersStatusCanvas || typeof Chart === "undefined") {
return;
}

const labels = [];
const values = [];
const colors = [];

STATUS_CHART_CONFIG.forEach(entry => {
labels.push(entry.label);
values.push(statusCounts[entry.key] || 0);
colors.push(entry.color);
});

if (!ordersStatusChart) {
ordersStatusChart = new Chart(ordersStatusCanvas, {
type: "doughnut",
data: {
labels,
datasets: [{
data: values,
backgroundColor: colors,
borderWidth: 0
}]
},
options: {
responsive: true,
maintainAspectRatio: false,
cutout: "55%",
plugins: {
legend: {
position: "bottom",
labels: {
color: "#0f172a",
boxWidth: 12,
padding: 16
}
}
}
}
});
} else {
const dataset = ordersStatusChart.data.datasets[0];
ordersStatusChart.data.labels = labels;
dataset.data = values;
dataset.backgroundColor = colors;
ordersStatusChart.update();
}
}

function hideOrdersFeedback() {
if (!ordersToolbarFeedback) return;
ordersToolbarFeedback.classList.add('hidden');
ordersToolbarFeedback.classList.remove('success', 'error');
ordersToolbarFeedback.textContent = '';
if (ordersFeedbackTimeout) {
clearTimeout(ordersFeedbackTimeout);
ordersFeedbackTimeout = null;
}
}

function showOrdersFeedback(message, type = 'info', duration = 6000) {
if (!ordersToolbarFeedback) return;
if (ordersFeedbackTimeout) {
clearTimeout(ordersFeedbackTimeout);
ordersFeedbackTimeout = null;
}
ordersToolbarFeedback.textContent = message;
ordersToolbarFeedback.classList.remove('hidden', 'success', 'error');
if (type === 'success') {
ordersToolbarFeedback.classList.add('success');
} else if (type === 'error') {
ordersToolbarFeedback.classList.add('error');
}
ordersFeedbackTimeout = window.setTimeout(() => {
hideOrdersFeedback();
}, duration);
}

function updateMassPrintButtonLabel({ force } = {}) {
if (!massPrintBtn) return;
const isLoading = massPrintBtn.dataset.loading === 'true';
const count = selectedOrderIds.size;
massPrintBtn.disabled = isLoading || count === 0;
if (isLoading && !force) {
return;
}
const label =
count > 0
? `<i class="fas fa-print"></i> Print ${count} kit${count === 1 ? '' : 's'}`
: MASS_PRINT_DEFAULT_LABEL;
massPrintBtn.innerHTML = label;
}

const SKIP_REASON_LABELS = {
  not_found: 'order not found',
  not_kit_order: 'not a kit order',
  missing_labels: 'missing shipping labels',
  label_download_failed: 'label download failed',
  processing_error: 'processing error',
};

function normalizeSkippedEntries(raw = []) {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw
    .map((entry) => {
      if (!entry) return null;
      if (typeof entry === 'string') {
        return { id: entry, reason: null };
      }

      const idValue = typeof entry.id === 'string' ? entry.id : String(entry.id || '').trim();
      if (!idValue) {
        return null;
      }

      return {
        id: idValue,
        reason: entry.reason || null,
      };
    })
    .filter(Boolean);
}

function formatSkippedReason(reason) {
  if (!reason) return '';
  return SKIP_REASON_LABELS[reason] || reason;
}

function setSelectAllState(displayedIds = lastRenderedOrderIds) {
  if (!ordersSelectAllCheckbox) return;
  const ids = Array.isArray(displayedIds) ? displayedIds : [];
  if (!ids.length) {
    ordersSelectAllCheckbox.checked = false;
    ordersSelectAllCheckbox.indeterminate = false;
    return;
  }
  const selectedCount = ids.filter((id) => selectedOrderIds.has(id)).length;
  ordersSelectAllCheckbox.checked = selectedCount === ids.length;
  ordersSelectAllCheckbox.indeterminate = selectedCount > 0 && selectedCount < ids.length;
}

function clearSelectedOrderCheckboxes() {
  if (!ordersTableBody) return;
  const checkboxes = ordersTableBody.querySelectorAll('.order-select-checkbox');
  checkboxes.forEach((checkbox) => {
    if (checkbox && typeof checkbox === 'object' && 'checked' in checkbox) {
      checkbox.checked = false;
    }
  });
}

function cleanupSelectedOrderIds() {
  if (!selectedOrderIds.size) {
    return;
  }
  const knownIds = new Set(allOrders.map((order) => order.id));
selectedOrderIds.forEach((id) => {
if (!knownIds.has(id)) {
selectedOrderIds.delete(id);
}
});
}

function isKitOrder(order = {}) {
  const preference = (order.shippingPreference || order.shipping_preference || '')
    .toString()
    .toLowerCase();
  if (!preference) {
    return false;
  }
  if (preference === 'shipping kit requested' || preference === 'ship_kit') {
    return true;
  }
  return preference.includes('kit');
}

function isAgingCandidate(order = {}) {
  if (!order) {
    return false;
  }
  const status = (order.status || '').toString().toLowerCase();
  if (AGING_EXCLUDED_STATUSES.has(status)) {
    return false;
  }
  const createdAtMs = extractTimestampMillis(order.createdAt);
  if (!createdAtMs) {
    return false;
  }
  return Date.now() - createdAtMs >= MIN_AGING_MS;
}

function updateReminderButtons(order) {
const orderId = order?.id || null;
const status = (order?.status || '').toString();

if (sendReminderBtn) {
if (orderId && REMINDER_ELIGIBLE_STATUSES.includes(status)) {
sendReminderBtn.classList.remove('hidden');
sendReminderBtn.onclick = () => handleSendReminder(orderId);
} else {
sendReminderBtn.classList.add('hidden');
sendReminderBtn.onclick = null;
}
}

if (sendExpiringReminderBtn) {
if (orderId && EXPIRING_REMINDER_STATUSES.includes(status)) {
sendExpiringReminderBtn.classList.remove('hidden');
sendExpiringReminderBtn.onclick = () => handleSendExpiringReminder(orderId);
} else {
sendExpiringReminderBtn.classList.add('hidden');
sendExpiringReminderBtn.onclick = null;
}
}

if (sendKitReminderBtn) {
if (orderId && KIT_REMINDER_STATUSES.includes(status) && isKitOrder(order)) {
sendKitReminderBtn.classList.remove('hidden');
sendKitReminderBtn.onclick = () => handleSendKitReminder(orderId);
} else {
sendKitReminderBtn.classList.add('hidden');
sendKitReminderBtn.onclick = null;
}
}
}

function renderOrders() {
cleanupSelectedOrderIds();
if (!ordersTableBody) {
return;
}
const source = currentFilteredOrders.length ? currentFilteredOrders : allOrders;
const total = source.length;
ordersTableBody.innerHTML = '';

if (!total) {
if (noOrdersMessage) {
noOrdersMessage.classList.remove('hidden');
}
ordersTableBody.innerHTML = `<tr><td colspan="9" class="py-8 text-center text-slate-500">No orders found for this status.</td></tr>`;
lastRenderedOrderIds = [];
setSelectAllState([]);
updateMassPrintButtonLabel();
if (paginationControls) {
paginationControls.classList.add('hidden');
}
return;
}

if (noOrdersMessage) {
noOrdersMessage.classList.add('hidden');
}

const totalPages = Math.max(1, Math.ceil(total / ORDERS_PER_PAGE));
if (currentPage > totalPages) {
currentPage = totalPages;
}

const startIndex = (currentPage - 1) * ORDERS_PER_PAGE;
const endIndex = startIndex + ORDERS_PER_PAGE;
const ordersToDisplay = source.slice(startIndex, endIndex);
const displayedIds = [];

ordersToDisplay.forEach(order => {
displayedIds.push(order.id);
const row = document.createElement('tr');
row.className = 'transition-colors duration-200';
const customerName = order.shippingInfo ? order.shippingInfo.fullName : 'N/A';
const itemDescription = `${order.device || 'Device'} ${order.storage || ''}`.trim();
const orderDate = formatDate(order.createdAt);
const orderAge = formatOrderAge(order.createdAt);
const lastUpdatedRaw = order.lastStatusUpdateAt || order.updatedAt || order.updated_at || order.statusUpdatedAt || order.lastUpdatedAt;
const lastUpdatedDate = formatDateTime(lastUpdatedRaw);
const reofferTimer = formatAutoAcceptTimer(order);
const statusText = formatStatus(order);
const labelStatus = formatLabelStatus(order);
const isSelected = selectedOrderIds.has(order.id);

const trackingNumber = order.trackingNumber;
const trackingCellContent = trackingNumber
? `<a href="${USPS_TRACKING_URL}${trackingNumber}" target="_blank" class="text-blue-600 hover:text-blue-800 underline">${trackingNumber}</a>`
: 'N/A';

row.innerHTML = `
<td class="px-3 py-4 text-center align-top">
  <input type="checkbox" class="order-select-checkbox" data-order-id="${order.id}" ${isSelected ? 'checked' : ''}>
</td>
<td class="px-3 py-4 whitespace-normal text-sm font-medium text-slate-900">${order.id}</td>
<td class="px-3 py-4 whitespace-normal text-sm text-slate-600">
  <div>${orderDate}</div>
  <div class="text-xs text-slate-400">${orderAge}</div>
</td>
<td class="px-3 py-4 whitespace-normal text-sm text-slate-500">${lastUpdatedDate}</td>
<td class="px-3 py-4 whitespace-normal text-sm text-slate-600">${customerName}</td>
<td class="px-3 py-4 whitespace-normal text-sm text-slate-600">${itemDescription}</td>
<td class="px-3 py-4 whitespace-normal text-sm">
  <span class="${getStatusClass(order.status)}">
    <span class="status-bubble-text">${statusText}</span>
    ${labelStatus ? `<span class="status-bubble-subtext">${labelStatus}</span>` : ''}
    ${reofferTimer}
  </span>
</td>
<td class="px-3 py-4 whitespace-normal text-sm text-slate-600">${trackingCellContent}</td>
<td class="px-3 py-4 whitespace-normal text-sm font-medium flex flex-wrap items-center gap-2">
  <button data-order-id="${order.id}" class="view-details-btn text-blue-600 hover:text-blue-900 rounded-md py-1 px-3 border border-blue-600 hover:border-blue-900 transition-colors duration-200">
    View Details
  </button>
</td>
`;

ordersTableBody.appendChild(row);

const checkbox = row.querySelector('.order-select-checkbox');
if (checkbox) {
checkbox.addEventListener('change', (event) => {
if (event.target.checked) {
selectedOrderIds.add(order.id);
} else {
selectedOrderIds.delete(order.id);
}
updateMassPrintButtonLabel();
setSelectAllState(displayedIds);
});
}

const detailsButton = row.querySelector('.view-details-btn');
if (detailsButton) {
detailsButton.addEventListener('click', (event) => {
event.preventDefault();
openOrderDetailsModal(order.id);
});
}
});

lastRenderedOrderIds = displayedIds;
setSelectAllState(displayedIds);
updateMassPrintButtonLabel();
}

function buildPageSequence(totalPages, currentPage) {
const pages = new Set([1, totalPages]);
const windowSize = 2;

for (let index = currentPage - windowSize; index <= currentPage + windowSize; index++) {
if (index > 1 && index < totalPages) {
pages.add(index);
}
}

return Array.from(pages).sort((a, b) => a - b);
}

function renderPagination() {
if (!paginationControls) {
return;
}

const source = currentFilteredOrders.length ? currentFilteredOrders : allOrders;
const total = source.length;
const totalPages = Math.max(1, Math.ceil(Math.max(total, 0) / ORDERS_PER_PAGE));
lastKnownTotalPages = totalPages;

if (totalPages <= 1) {
paginationControls.classList.add('hidden');
currentPage = 1;
if (paginationPages) {
paginationPages.innerHTML = '';
}
if (paginationPrev) {
paginationPrev.disabled = true;
}
if (paginationNext) {
paginationNext.disabled = true;
}
if (paginationFirst) {
paginationFirst.disabled = true;
}
if (paginationLast) {
paginationLast.disabled = true;
}
if (paginationInfo) {
paginationInfo.textContent = 'Page 1 of 1';
}
return;
}

paginationControls.classList.remove('hidden');
if (currentPage > totalPages) {
currentPage = totalPages;
}

if (paginationPrev) {
paginationPrev.disabled = currentPage <= 1;
}
if (paginationNext) {
paginationNext.disabled = currentPage >= totalPages;
}
if (paginationFirst) {
paginationFirst.disabled = currentPage <= 1;
}
if (paginationLast) {
paginationLast.disabled = currentPage >= totalPages;
}
if (paginationInfo) {
paginationInfo.textContent = `Page ${currentPage} of ${totalPages}`;
}

if (paginationPages) {
paginationPages.innerHTML = '';
const sequence = buildPageSequence(totalPages, currentPage);
let lastRendered = 0;
sequence.forEach((pageNumber) => {
if (lastRendered && pageNumber - lastRendered > 1) {
const ellipsis = document.createElement('span');
ellipsis.className = 'pagination-ellipsis';
ellipsis.textContent = '…';
paginationPages.appendChild(ellipsis);
}

const button = document.createElement('button');
button.type = 'button';
button.textContent = pageNumber;
button.className = 'pagination-page-button';
if (pageNumber === currentPage) {
button.classList.add('active');
button.disabled = true;
}
button.addEventListener('click', () => {
currentPage = pageNumber;
renderOrders();
renderPagination();
});

paginationPages.appendChild(button);
lastRendered = pageNumber;
});
}
}

function renderActivityLog(order) {
if (!modalActivityLog || !modalActivityLogList) return;
const entries = Array.isArray(order?.activityLog) ? [...order.activityLog] : [];

if (!entries.length) {
modalActivityLog.classList.add('hidden');
modalActivityLogList.innerHTML = '';
return;
}

entries.sort((a, b) => {
const aDate = coerceTimestampToDate(a.at) || new Date(0);
const bDate = coerceTimestampToDate(b.at) || new Date(0);
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
if (KIT_PRINT_PENDING_STATUSES.includes(status)) {
return 'Needs Printing';
}
if (status === 'kit_sent') {
return 'Kit Sent';
}
if (status === 'kit_delivered') {
return 'Kit Delivered';
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
function setSelectValue(selectElement, value) {
if (!selectElement) {
return;
}
if (value) {
selectElement.value = value;
if (selectElement.value !== value) {
selectElement.selectedIndex = 0;
}
return;
}
selectElement.selectedIndex = 0;
}



async function updateOrderStatusInline(orderId, status) {
try {
const response = await fetch(`${BACKEND_BASE_URL}/orders/${orderId}/status`, {
method: 'PUT',
headers: { 'Content-Type': 'application/json' },
body: JSON.stringify({ status })
});

if (!response.ok) {
const errorText = await response.text();
throw new Error(errorText || `Failed to update order status to ${status}.`);
}

return true;
} catch (error) {
console.error(`Failed to update status for order ${orderId}:`, error);
alert('Unable to update the order status. Please open the order and try again.');
return false;
}
}

const COSMETIC_CONDITION_KEYS = [
'cosmetic',
'cosmeticCondition',
'cosmetic_condition',
'cosmeticGrade',
'cosmetic_grade',
'condition_cosmetic',
'conditionCosmetic',
'grade',
'quality',
'overall',
'overallCondition',
'summary',
'condition',
'label',
'value',
'name',
'display',
'displayName',
'text',
'title',
'status',
'description'
];

function normalizeConditionInput(condition, preferredKeys, visited) {
if (condition === null || condition === undefined) {
return null;
}

if (typeof condition === 'string') {
const trimmed = condition.trim();
return trimmed ? trimmed : null;
}

if (typeof condition === 'number' || typeof condition === 'boolean') {
return condition;
}

if (Array.isArray(condition)) {
for (const entry of condition) {
const normalizedEntry = normalizeConditionInput(entry, preferredKeys, visited);
if (normalizedEntry !== null && normalizedEntry !== undefined) {
return normalizedEntry;
}
}
return null;
}

if (typeof condition === 'object') {
const seen = visited || new Set();
if (seen.has(condition)) {
return null;
}
seen.add(condition);

const prioritizedKeys = Array.isArray(preferredKeys) && preferredKeys.length ? preferredKeys : [];
for (const key of prioritizedKeys) {
if (Object.prototype.hasOwnProperty.call(condition, key)) {
const normalizedValue = normalizeConditionInput(condition[key], preferredKeys, seen);
if (normalizedValue !== null && normalizedValue !== undefined) {
return normalizedValue;
}
}
}

const fallbackKeys = ['label', 'name', 'display', 'displayName', 'text', 'title', 'value', 'grade', 'quality', 'condition', 'status', 'description'];
for (const key of fallbackKeys) {
if (Object.prototype.hasOwnProperty.call(condition, key)) {
const normalizedValue = normalizeConditionInput(condition[key], preferredKeys, seen);
if (normalizedValue !== null && normalizedValue !== undefined) {
return normalizedValue;
}
}
}

for (const key of Object.keys(condition)) {
if (prioritizedKeys.includes(key)) {
continue;
}
const normalizedValue = normalizeConditionInput(condition[key], preferredKeys, seen);
if (normalizedValue !== null && normalizedValue !== undefined) {
return normalizedValue;
}
}

return null;
}

return null;
}

function formatCondition(condition) {
const normalizedValue = normalizeConditionInput(condition);

if (normalizedValue === null || normalizedValue === undefined) {
return '';
}

if (typeof normalizedValue === 'boolean') {
return normalizedValue ? 'Yes' : 'No';
}

if (typeof normalizedValue === 'number') {
return String(normalizedValue);
}

const cleaned = String(normalizedValue)
.replace(/[_-]+/g, ' ')
.replace(/\s+/g, ' ')
.trim();

if (!cleaned) {
return '';
}

const lower = cleaned.toLowerCase();
if (lower === 'na' || lower === 'n/a') {
return 'N/A';
}

return cleaned
.split(' ')
.filter(Boolean)
.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
.join(' ');
}

function resolveCosmeticCondition(order) {
if (!order || typeof order !== 'object') {
return normalizeConditionInput(order, COSMETIC_CONDITION_KEYS);
}

const directFields = [
'condition_cosmetic',
'conditionCosmetic',
'condition_grade',
'conditionGrade',
'cosmetic_condition',
'cosmeticCondition',
'cosmetic_grade',
'cosmeticGrade',
'receivedCondition',
'receivedDeviceCondition',
'quality',
'grade',
'deviceCondition',
'condition'
];

for (const field of directFields) {
if (Object.prototype.hasOwnProperty.call(order, field)) {
const resolved = normalizeConditionInput(order[field], COSMETIC_CONDITION_KEYS);
if (resolved !== null && resolved !== undefined) {
return resolved;
}
}
}

const nestedFields = [
'conditions',
'conditionDetails',
'conditionSummary',
'orderConditions',
'conditionAssessment',
'assessment',
'deviceAssessment',
'deviceDetails',
'receivedInspection',
'receivedAssessment',
'attributes'
];

for (const field of nestedFields) {
if (!Object.prototype.hasOwnProperty.call(order, field)) {
continue;
}

const resolved = normalizeConditionInput(order[field], COSMETIC_CONDITION_KEYS);
if (resolved !== null && resolved !== undefined) {
return resolved;
}
}

return null;
}

function getStatusClass(status) {
switch (status) {
case 'order_pending': return 'bg-blue-100 text-blue-800 status-bubble';
case 'shipping_kit_requested':
case 'kit_needs_printing':
case 'needs_printing':
return 'bg-indigo-100 text-indigo-800 status-bubble';
case 'kit_sent':
return 'bg-orange-100 text-orange-800 status-bubble';
case 'kit_delivered':
return 'bg-emerald-100 text-emerald-800 status-bubble';
case 'label_generated': return 'bg-yellow-100 text-yellow-800 status-bubble';
case 'emailed': return 'bg-yellow-100 text-yellow-800 status-bubble';
case 'received': return 'bg-green-100 text-green-800 status-bubble';
case 'completed': return 'bg-purple-100 text-purple-800 status-bubble';
case 're-offered-pending': return 'bg-orange-100 text-orange-800 status-bubble';
case 're-offered-accepted': return 'bg-teal-100 text-teal-800 status-bubble';
case 'requote_accepted': return 'bg-teal-100 text-teal-800 status-bubble';
case 're-offered-declined': return 'bg-red-100 text-red-800 status-bubble';
case 'return-label-generated': return 'bg-slate-200 text-slate-800 status-bubble';
case 'cancelled': return 'bg-gray-200 text-gray-700 status-bubble';
default: return 'bg-slate-100 text-slate-700 status-bubble';
}
}

async function openOrderDetailsModal(orderId) {
if (!orderDetailsModal) {
return;
}
// Hide all action/form containers
modalActionButtons.innerHTML = '';
modalLoadingMessage.classList.add('hidden');
modalMessage.classList.add('hidden');
modalMessage.textContent = '';

// Hide all payment detail rows initially
modalVenmoUsernameRow.classList.add('hidden');
modalPaypalEmailRow.classList.add('hidden');
modalZelleDetailsRow.classList.add('hidden');

reofferFormContainer.classList.add('hidden');
manualFulfillmentFormContainer.classList.add('hidden');
deleteConfirmationContainer.classList.add('hidden');
updateReminderButtons(null);

// Hide all label rows initially
modalLabelRow.classList.add('hidden');
modalSecondaryLabelRow.classList.add('hidden');
modalReturnLabelRow.classList.add('hidden');
modalKitTrackingRow.classList.add('hidden');
if (modalLabelStatusRow) {
modalLabelStatusRow.classList.add('hidden');
}
if (modalActivityLog) {
modalActivityLog.classList.add('hidden');
}
if (modalActivityLogList) {
modalActivityLogList.innerHTML = '';
}
if (voidLabelFormContainer) {
voidLabelFormContainer.classList.add('hidden');
}
if (voidLabelMessage) {
voidLabelMessage.classList.add('hidden');
voidLabelMessage.textContent = '';
}
if (modalLastReminderDate) {
modalLastReminderDate.textContent = 'N/A';
}
if (modalOrderAge) {
modalOrderAge.textContent = 'Calculating…';
}

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
modalCustomerPhone.textContent = order.shippingInfo ? order.shippingInfo.phone : 'N/A';
modalItem.textContent = order.device;
modalStorage.textContent = order.storage;
modalCarrier.textContent = order.carrier;
const payoutAmount = getOrderPayout(order);
modalPrice.textContent = payoutAmount.toFixed(2);

// START: UPDATED PAYMENT DETAILS LOGIC
const paymentMethod = order.paymentMethod ? formatCondition(order.paymentMethod) : 'N/A';
modalPaymentMethod.textContent = paymentMethod;

const paymentDetails = order.paymentDetails;
if (paymentDetails) {
if (order.paymentMethod === 'venmo' && paymentDetails.venmoUsername) {
modalVenmoUsername.textContent = paymentDetails.venmoUsername;
modalVenmoUsernameRow.classList.remove('hidden');
}
if (order.paymentMethod === 'paypal' && paymentDetails.paypalEmail) {
modalPaypalEmail.textContent = paymentDetails.paypalEmail;
modalPaypalEmailRow.classList.remove('hidden');
}
if (order.paymentMethod === 'zelle') {
const zelleInfo = paymentDetails.zelleIdentifier
|| paymentDetails.zelleEmail
|| paymentDetails.zellePhone
|| 'N/A';
modalZelleDetails.textContent = zelleInfo;
modalZelleDetailsRow.classList.remove('hidden');
}
}
// END: UPDATED PAYMENT DETAILS LOGIC

const shippingInfo = order.shippingInfo;
if (shippingInfo) {
modalShippingAddress.textContent = `${shippingInfo.streetAddress}, ${shippingInfo.city}, ${shippingInfo.state}, ${shippingInfo.zipCode}`;
} else {
modalShippingAddress.textContent = 'N/A';
}

if (modalLastReminderDate) {
const lastReminder = order.lastReminderSentAt || order.reminderSentAt || order.reminderEmailSentAt || order.lastReminderAt;
modalLastReminderDate.textContent = lastReminder ? formatDateTime(lastReminder) : 'Never';
}
if (modalOrderAge) {
modalOrderAge.textContent = formatOrderAge(order.createdAt);
}

modalConditionPowerOn.textContent = order.condition_power_on ? formatCondition(order.condition_power_on) : 'N/A';
modalConditionFunctional.textContent = order.condition_functional ? formatCondition(order.condition_functional) : 'N/A';
modalConditionCracks.textContent = order.condition_cracks ? formatCondition(order.condition_cracks) : 'N/A';
const cosmeticCondition = resolveCosmeticCondition(order);
const cosmeticDisplay = cosmeticCondition !== null && cosmeticCondition !== undefined
? formatCondition(cosmeticCondition)
: '';
modalConditionCosmetic.textContent = cosmeticDisplay || 'N/A';
// Pass the order object to formatStatus here as well
modalStatus.textContent = formatStatus(order);
modalStatus.className = `font-semibold px-2 py-1 rounded-full text-xs ${getStatusClass(order.status)}`;

// --- START: UPDATED LABEL LOGIC FOR USPS HYPERLINKING IN MODAL ---

// 1. Outbound Kit (if requested)
if (order.shippingPreference === 'Shipping Kit Requested') {

// Outbound Label (Kit)
if (order.outboundTrackingNumber) {
modalLabelLink.href = order.outboundLabelUrl || '#'; // PDF link
modalTrackingNumber.innerHTML = `<a href="${USPS_TRACKING_URL}${order.outboundTrackingNumber}" target="_blank" class="text-blue-600 hover:text-blue-800 underline">${order.outboundTrackingNumber}</a>`;
modalLabelDescription.textContent = 'Outbound Kit Label';
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
modalSecondaryLabelLink.href = order.inboundLabelUrl || '#'; // PDF link
modalSecondaryTrackingNumberDisplay.innerHTML = `<a href="${USPS_TRACKING_URL}${order.inboundTrackingNumber}" target="_blank" class="text-blue-600 hover:text-blue-800 underline">${order.inboundTrackingNumber}</a>`;
modalSecondaryLabelDescription.textContent = 'Inbound Device Label';
modalSecondaryLabelRow.classList.remove('hidden');
} else if (order.inboundLabelUrl) {
// Fallback: if no tracking number, but PDF link exists
modalSecondaryLabelLink.href = order.inboundLabelUrl;
modalSecondaryTrackingNumberDisplay.textContent = 'N/A';
modalSecondaryLabelDescription.textContent = 'Inbound Device Label (PDF)';
modalSecondaryLabelRow.classList.remove('hidden');
}

const kitTrackingStatus = order.kitTrackingStatus;
if (kitTrackingStatus && (kitTrackingStatus.statusDescription || kitTrackingStatus.statusCode)) {
modalKitTrackingStatus.textContent = kitTrackingStatus.statusDescription || kitTrackingStatus.statusCode;
modalKitTrackingUpdated.textContent = kitTrackingStatus.lastUpdated ? `Last update: ${formatDate(kitTrackingStatus.lastUpdated)}` : '';
modalKitTrackingRow.classList.remove('hidden');
} else if (order.outboundTrackingNumber) {
modalKitTrackingStatus.textContent = 'Kit tracking available. Refresh to see the latest scans.';
modalKitTrackingUpdated.textContent = '';
modalKitTrackingRow.classList.remove('hidden');
}

}

// 2. Email Label Requested (single USPS label/inbound label)
else if (order.shippingPreference === 'Email Label Requested') {
if (order.trackingNumber) {
modalLabelLink.href = order.uspsLabelUrl || '#'; // PDF link
modalTrackingNumber.innerHTML = `<a href="${USPS_TRACKING_URL}${order.trackingNumber}" target="_blank" class="text-blue-600 hover:text-blue-800 underline">${order.trackingNumber}</a>`;
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
modalReturnLabelLink.href = order.returnLabelUrl || '#'; // PDF link
modalReturnTrackingNumberDisplay.innerHTML = `<a href="${USPS_TRACKING_URL}${order.returnTrackingNumber}" target="_blank" class="text-red-600 hover:text-red-800 underline">${order.returnTrackingNumber}</a>`;
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

// Reset label click handlers before reassigning for the current order context
if (modalLabelLink) {
modalLabelLink.onclick = null;
}
if (modalSecondaryLabelLink) {
modalSecondaryLabelLink.onclick = null;
}

if (order.shippingPreference === 'Shipping Kit Requested') {
const labelClickHandler = (event) => {
maybeMarkKitSentOnLabelClick(event, order);
};

if (modalLabelRow && !modalLabelRow.classList.contains('hidden') && modalLabelLink) {
modalLabelLink.onclick = labelClickHandler;
}

if (modalSecondaryLabelRow && !modalSecondaryLabelRow.classList.contains('hidden') && modalSecondaryLabelLink) {
modalSecondaryLabelLink.onclick = labelClickHandler;
}
}

const labelStatusText = formatLabelStatus(order);
if (modalLabelStatusRow) {
if (labelStatusText) {
modalLabelStatus.textContent = labelStatusText;
modalLabelStatusRow.classList.remove('hidden');
} else {
modalLabelStatusRow.classList.add('hidden');
}
}

renderActivityLog(order);

renderActionButtons(order);
modalActionButtons.classList.remove('hidden');

if (
order.status === 'kit_sent' &&
order.shippingPreference === 'Shipping Kit Requested' &&
order.outboundTrackingNumber &&
!autoRefreshedTracking.has(order.id) &&
(!order.kitTrackingStatus || !order.kitTrackingStatus.statusDescription)
) {
autoRefreshedTracking.add(order.id);
setTimeout(() => handleAction(order.id, 'refreshKitTracking'), 150);
}

updateReminderButtons(order);

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
const hasGeneratedLabels = labelOptions.length > 0 || Boolean(
order.uspsLabelUrl ||
order.outboundLabelUrl ||
order.inboundLabelUrl ||
order.shipEngineLabelId
);
switch (currentStatus) {
case 'order_pending':
case 'shipping_kit_requested':
case 'kit_needs_printing':
case 'needs_printing':
if (!hasGeneratedLabels) {
modalActionButtons.appendChild(createButton('Generate USPS Label', () => handleAction(order.id, 'generateLabel')));
}
modalActionButtons.appendChild(createButton('Order Manually Fulfilled', () => showManualFulfillmentForm(order), 'bg-gray-600 hover:bg-gray-700'));
break;
case 'kit_sent':
modalActionButtons.appendChild(createButton('Refresh Kit Tracking', () => handleAction(order.id, 'refreshKitTracking'), 'bg-orange-600 hover:bg-orange-700'));
break;
case 'kit_delivered':
modalActionButtons.appendChild(createButton('Refresh Kit Tracking', () => handleAction(order.id, 'refreshKitTracking'), 'bg-emerald-600 hover:bg-emerald-700'));
modalActionButtons.appendChild(createButton('Mark as Received', () => handleAction(order.id, 'markReceived')));
break;
case 'label_generated':
if (order.shippingPreference === 'Shipping Kit Requested') {
modalActionButtons.appendChild(
createButton('Mark I Sent', () => handleAction(order.id, 'markKitSent'), 'bg-orange-600 hover:bg-orange-700')
);
}
modalActionButtons.appendChild(createButton('Mark as Received', () => handleAction(order.id, 'markReceived')));
break;
case 'received':
[
{ label: 'Email Outstanding Balance Notice', reason: 'outstanding_balance', className: 'bg-amber-600 hover:bg-amber-700' },
{ label: 'Email Password Lock Notice', reason: 'password_locked', className: 'bg-slate-700 hover:bg-slate-800' },
{ label: 'Email Lost/Stolen Notice', reason: 'stolen', className: 'bg-rose-600 hover:bg-rose-700' },
{ label: 'Email FMI / Activation Lock Notice', reason: 'fmi_active', className: 'bg-indigo-600 hover:bg-indigo-700' },
].forEach(({ label, reason, className }) => {
modalActionButtons.appendChild(
createButton(label, () => sendConditionEmail(order.id, reason, label), className)
);
});
modalActionButtons.appendChild(createButton('Mark as Completed', () => handleAction(order.id, 'markCompleted', 'bg-gray-600 hover:bg-gray-700')));
modalActionButtons.appendChild(createButton('Propose Re-offer', () => showReofferForm(order.id), 'bg-orange-600 hover:bg-orange-700'));
break;
case 're-offered-pending':
if (order.reOffer && order.reOffer.newPrice) {
const reOfferDiv = document.createElement('div');
reOfferDiv.className = 'p-3 bg-gray-100 rounded-md w-full';
reOfferDiv.innerHTML = `<p class="text-sm"><strong>Proposed New Price:</strong> $${order.reOffer.newPrice.toFixed(2)}</p><p class="text-sm"><strong>Reasons:</strong> ${order.reOffer.reasons.join(', ')}</p><p class="text-sm"><strong>Comments:</strong> ${order.reOffer.comments}</p>`;
modalActionButtons.appendChild(reOfferDiv);
}
break;
case 're-offered-accepted':
if (order.paymentMethod === 'zelle') {
modalActionButtons.appendChild(
createButton('Mark Paid', () => handleAction(order.id, 'markCompleted'), 'bg-emerald-600 hover:bg-emerald-700')
);
} else {
modalActionButtons.appendChild(
createButton('Pay Now', () => handleAction(order.id, 'payNow', 'bg-teal-600 hover:bg-teal-700'))
);
}
break;
case 're-offered-declined':
modalActionButtons.appendChild(createButton('Send Return Label', () => handleAction(order.id, 'sendReturnLabel', 'bg-red-600 hover:bg-red-700')));
break;
case 'return-label-generated':
break;
case 'requote_accepted':
case 'completed':
modalActionButtons.appendChild(createButton('Send Review Request Email', () => handleAction(order.id, 'sendReviewRequest'), 'bg-amber-600 hover:bg-amber-700'));
break;
}

// --- NEW: PDF Merging Button Logic ---
const outboundLabelUrl = order.outboundLabelUrl || (order.shippingPreference === 'Email Label Requested' ? order.uspsLabelUrl : null);
const inboundLabelUrl = order.inboundLabelUrl || (order.shippingPreference === 'Email Label Requested' ? order.uspsLabelUrl : null);

// Only show if we have the necessary components
const printEligibleStatuses = ['label_generated', 'shipping_kit_requested', 'kit_needs_printing', 'needs_printing', 'kit_sent'];
if (printEligibleStatuses.includes(order.status) && outboundLabelUrl && inboundLabelUrl) {
const slipButtonText = order.shippingPreference === 'Shipping Kit Requested'
? 'Print Kit Docs (Labels + Bag Label)'
: 'Print Document (Label + Bag Label)';

// Create the button and insert it at the beginning of the action list
const mergeButton = createButton(slipButtonText, () => generateAndMergeShippingDocument(order), 'bg-fuchsia-600 hover:bg-fuchsia-700');

// Get existing buttons, if any
const existingButtons = Array.from(modalActionButtons.children);
modalActionButtons.innerHTML = '';
modalActionButtons.appendChild(mergeButton);
existingButtons.forEach(btn => modalActionButtons.appendChild(btn));
}
// --- END: PDF Merging Button Logic ---

if (labelOptions.length > 0 && currentStatus !== 'cancelled') {
modalActionButtons.appendChild(
createButton('Void Shipping Labels', () => showVoidLabelForm(order), 'bg-red-600 hover:bg-red-700')
);
}

if (currentStatus !== 'cancelled') {
if (hasVoidableLabels(order)) {
modalActionButtons.appendChild(
createButton('Cancel Order & Void Labels', () => showCancelOrderForm(order), 'bg-rose-500 hover:bg-rose-600')
);
} else {
modalActionButtons.appendChild(
createButton('Cancel Order', () => handleAction(order.id, 'cancelOrder'), 'bg-rose-500 hover:bg-rose-600')
);
}
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
if (voidLabelMessage) {
voidLabelMessage.classList.add('hidden');
voidLabelMessage.textContent = '';
}

options.forEach(option => {
const optionElement = createLabelOptionElement(option, {
prefix: 'void-label',
checkboxClass: 'void-label-checkbox'
});
voidLabelOptionsContainer.appendChild(optionElement);
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
if (voidLabelMessage) {
voidLabelMessage.classList.add('hidden');
voidLabelMessage.textContent = '';
}
openOrderDetailsModal(order.id);
};
}

function showCancelOrderForm(order) {
if (!cancelOrderFormContainer || !cancelOrderVoidOptionsContainer) {
handleAction(order.id, 'cancelOrder');
return;
}

const options = getLabelOptions(order);
const voidableOptions = options.filter(option => option.isVoidable);

if (!voidableOptions.length) {
handleAction(order.id, 'cancelOrder');
return;
}

cancelOrderVoidOptionsContainer.innerHTML = '';
voidableOptions.forEach(option => {
const optionElement = createLabelOptionElement(option, {
prefix: 'cancel-label',
checkboxClass: 'cancel-void-checkbox',
checked: true,
disableCheckbox: true,
});
cancelOrderVoidOptionsContainer.appendChild(optionElement);
});

if (cancelOrderMessage) {
cancelOrderMessage.textContent = 'These shipping labels will be voided automatically when you cancel this order.';
}
if (cancelOrderError) {
cancelOrderError.classList.add('hidden');
cancelOrderError.textContent = '';
}

modalActionButtons.classList.add('hidden');
reofferFormContainer.classList.add('hidden');
manualFulfillmentFormContainer.classList.add('hidden');
voidLabelFormContainer.classList.add('hidden');
deleteConfirmationContainer.classList.add('hidden');
cancelOrderFormContainer.classList.remove('hidden');

if (cancelCancelOrderBtn) {
cancelCancelOrderBtn.onclick = () => {
cancelOrderFormContainer.classList.add('hidden');
modalActionButtons.classList.remove('hidden');
if (cancelOrderError) {
cancelOrderError.classList.add('hidden');
cancelOrderError.textContent = '';
}
};
}

if (confirmCancelOrderBtn) {
confirmCancelOrderBtn.onclick = () => handleCancelOrder(order);
}
}

async function handleCancelOrder(order) {
if (!order || !order.id) {
return;
}

const labelOptions = getLabelOptions(order);
const voidableOptions = labelOptions.filter(option => option.isVoidable);
let preCancelVoidSummary = null;

if (cancelOrderError) {
cancelOrderError.classList.add('hidden');
cancelOrderError.textContent = '';
}

if (cancelOrderFormContainer) {
cancelOrderFormContainer.classList.add('hidden');
}

if (voidableOptions.length) {
try {
modalLoadingMessage.classList.remove('hidden');
const selections = voidableOptions.map(option => ({
key: option.key,
id: option.labelId,
}));
const result = await requestVoidLabels(order.id, selections);
const { summaryMessage } = summarizeVoidResults(result);
preCancelVoidSummary = summaryMessage;
} catch (error) {
console.error('Pre-cancel label void failed:', error);
preCancelVoidSummary = `Warning: ${error.message}`;
} finally {
modalLoadingMessage.classList.add('hidden');
}
}

await handleAction(order.id, 'cancelOrder', { body: { voidLabels: true } });

if (preCancelVoidSummary) {
const normalized = preCancelVoidSummary.toLowerCase();
if (normalized.includes('warning') || normalized.includes('could not')) {
displayModalMessage(preCancelVoidSummary, 'error');
}
}
}

async function handleVoidLabelSubmit(orderId) {
const selected = Array.from(document.querySelectorAll('.void-label-checkbox:checked')).map(checkbox => ({
key: checkbox.dataset.labelKey,
id: checkbox.dataset.labelId,
}));

if (!selected.length) {
if (voidLabelMessage) {
voidLabelMessage.textContent = 'Please select at least one label to void.';
voidLabelMessage.className = 'mt-3 text-sm text-red-600';
voidLabelMessage.classList.remove('hidden');
}
return;
}

modalLoadingMessage.classList.remove('hidden');
voidLabelFormContainer.classList.add('hidden');

try {
const result = await requestVoidLabels(orderId, selected);
const { summaryMessage, approvedCount } = summarizeVoidResults(result);

displayModalMessage(summaryMessage, approvedCount > 0 ? 'success' : 'error');
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

confirmDeleteBtn.onclick = () => handleAction(orderId, 'deleteOrder');
cancelDeleteBtn.onclick = () => {
deleteConfirmationContainer.classList.add('hidden');
modalActionButtons.classList.remove('hidden');
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

async function sendConditionEmail(orderId, reasonKey, labelText) {
if (!orderId || !reasonKey) {
return;
}

const confirmMessage = `Send the "${labelText}" email to the customer?`;
const confirmed = window.confirm(confirmMessage);
if (!confirmed) {
return;
}

let additionalNotes = '';
try {
additionalNotes = window.prompt('Optional notes to include in the email (leave blank to skip):', '') || '';
} catch (promptError) {
additionalNotes = '';
}

modalMessage.classList.add('hidden');
modalLoadingMessage.classList.remove('hidden');

try {
const response = await fetch(`${BACKEND_BASE_URL}/orders/${orderId}/send-condition-email`, {
method: 'POST',
headers: { 'Content-Type': 'application/json' },
body: JSON.stringify({
reason: reasonKey,
notes: additionalNotes.trim() ? additionalNotes.trim() : undefined,
}),
});

if (!response.ok) {
const errorData = await response.json().catch(() => null);
const errorMessage = errorData?.error || `Failed to send email (${response.status}).`;
throw new Error(errorMessage);
}

const result = await response.json().catch(() => ({}));
displayModalMessage(result.message || 'Email sent successfully.', 'success');
} catch (error) {
console.error('Condition email error:', error);
displayModalMessage(error.message || 'Failed to send email.', 'error');
} finally {
modalLoadingMessage.classList.add('hidden');
}
}

async function handleAction(orderId, actionType, options = {}) {
// Hide all special sections before starting action
modalLoadingMessage.classList.remove('hidden');
modalActionButtons.classList.add('hidden');
reofferFormContainer.classList.add('hidden');
manualFulfillmentFormContainer.classList.add('hidden');
deleteConfirmationContainer.classList.add('hidden');
voidLabelFormContainer.classList.add('hidden');
cancelOrderFormContainer.classList.add('hidden');
updateReminderButtons(null); // Hide reminder buttons during action
modalMessage.classList.add('hidden');
modalMessage.textContent = '';
if (voidLabelMessage) {
voidLabelMessage.classList.add('hidden');
voidLabelMessage.textContent = '';
}

try {
let url;
let method = 'PUT';
let body = options.body && typeof options.body === 'object' ? { ...options.body } : null;

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
updateReminderButtons(order);
return;
case 'sendReturnLabel':
url = `${BACKEND_BASE_URL}/orders/${orderId}/return-label`;
method = 'POST';
break;
case 'markKitSent':
url = `${BACKEND_BASE_URL}/orders/${orderId}/mark-kit-sent`;
method = 'POST';
break;
case 'sendReviewRequest':
url = `${BACKEND_BASE_URL}/orders/${orderId}/send-review-request`;
method = 'POST';
break;
case 'refreshKitTracking':
url = `${BACKEND_BASE_URL}/orders/${orderId}/refresh-kit-tracking`;
method = 'POST';
break;
case 'cancelOrder':
url = `${BACKEND_BASE_URL}/orders/${orderId}/cancel`;
method = 'POST';
if (body === null) {
body = {};
}
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
body: method === 'GET' || method === 'HEAD' ? null : (body ? JSON.stringify(body) : null)
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
// For all other actions, re-open the modal to show the new status/data
openOrderDetailsModal(orderId);
}

} catch (error) {
console.error("Action error:", error);
displayModalMessage(`Error: ${error.message}`, 'error');
} finally {
modalLoadingMessage.classList.add('hidden');
// Re-enable action buttons based on the new (or old) state
// We rely on openOrderDetailsModal (if not deleted) to re-render buttons correctly.
if (actionType !== 'deleteOrder') {
const orderToReRender = allOrders.find(o => o.id === orderId);
if (orderToReRender) {
renderActionButtons(orderToReRender);
modalActionButtons.classList.remove('hidden');
updateReminderButtons(orderToReRender);
}
}
}
}

function maybeMarkKitSentOnLabelClick(event, order) {
if (!order || order.shippingPreference !== 'Shipping Kit Requested') {
return;
}

const link = event?.currentTarget;
if (!link) {
return;
}

const href = link.getAttribute('href') || '';
if (!href || href === '#') {
return;
}

const currentStatus = (order.status || '').toLowerCase();
if (currentStatus === 'kit_sent') {
return;
}

markKitAsPrinted(order.id).then((marked) => {
if (!marked) {
return;
}

order.status = 'kit_sent';

if (currentOrderDetails && currentOrderDetails.id === order.id) {
currentOrderDetails.status = 'kit_sent';
}
updateReminderButtons(order);
});
}

async function markKitAsPrinted(orderId) {
const endpoints = [
{
url: `${BACKEND_BASE_URL}/orders/${orderId}/mark-kit-printed`,
fallbackMessage: 'Order marked as kit sent after printing.'
},
{
url: `${BACKEND_BASE_URL}/orders/${orderId}/mark-kit-sent`,
fallbackMessage: 'Order marked as kit sent.'
}
];

let lastError = null;

for (let index = 0; index < endpoints.length; index++) {
const { url, fallbackMessage } = endpoints[index];

try {
const response = await fetch(url, {
method: 'POST'
});

const rawBody = await response.text();
let result = {};

if (rawBody) {
try {
result = JSON.parse(rawBody);
} catch (parseError) {
result = { message: rawBody };
}
}

if (!response.ok) {
const errorMessage = result.error || result.message || 'Failed to update kit status';

if (response.status === 404 && index < endpoints.length - 1) {
lastError = new Error(errorMessage);
continue;
}

throw new Error(errorMessage);
}

const successMessage = result.message || fallbackMessage;

if (!orderDetailsModal.classList.contains('hidden') && modalOrderId.textContent === orderId) {
displayModalMessage(successMessage, 'success');
openOrderDetailsModal(orderId);
}

return true;
} catch (error) {
lastError = error;
console.error('Failed to mark kit as printed via', url, error);
}
}

if (!orderDetailsModal.classList.contains('hidden') && modalOrderId.textContent === orderId) {
const message = lastError?.message || 'Failed to update kit status';
displayModalMessage(`Error: ${message}`, 'error');
}

return false;
}

function generatePaymentLink(order) {
const amount = getOrderPayout(order).toFixed(2);
const customerName = order.shippingInfo ? order.shippingInfo.fullName : 'Customer';

// Only Venmo has a direct, reliable deep-link structure for payments
if (order.paymentMethod === 'venmo' && order.paymentDetails?.venmoUsername) {
const venmoUsername = order.paymentDetails.venmoUsername;
const note = `Payment for ${order.device} - Order ${order.id}`;
return `https://venmo.com/?txn=pay&aud_id=${venmoUsername}&amount=${amount}&note=${encodeURIComponent(note)}`;
}
// For PayPal and Zelle, payment must be completed manually in their respective apps,
// but we can offer a general payment status view or simply rely on the system to notify staff.
return null;
}

async function handleSendReminder(orderId) {
if (!sendReminderBtn) {
return;
}
try {
sendReminderBtn.disabled = true;
sendReminderBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i><span>Sending...</span>';
modalMessage.classList.add('hidden');

const sendReminderEmail = httpsCallable(functions, 'sendReminderEmail');
const result = await sendReminderEmail({ orderId });

displayModalMessage('Reminder email sent successfully!', 'success');
sendReminderBtn.innerHTML = '<i class="fas fa-check"></i><span>Email Sent!</span>';

setTimeout(() => {
sendReminderBtn.disabled = false;
sendReminderBtn.innerHTML = '<i class="fas fa-envelope"></i><span>Send Reminder Email</span>';
}, 3000);
} catch (error) {
console.error('Error sending reminder:', error);
displayModalMessage(`Failed to send reminder: ${error.message}`, 'error');
sendReminderBtn.disabled = false;
sendReminderBtn.innerHTML = '<i class="fas fa-envelope"></i><span>Send Reminder Email</span>';
}
}

async function handleSendExpiringReminder(orderId) {
if (!sendExpiringReminderBtn) {
return;
}
try {
sendExpiringReminderBtn.disabled = true;
sendExpiringReminderBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i><span>Sending...</span>';
modalMessage.classList.add('hidden');

const sendExpiringReminderEmail = httpsCallable(functions, 'sendExpiringReminderEmail');
await sendExpiringReminderEmail({ orderId });

displayModalMessage('Expiration reminder email sent successfully!', 'success');
sendExpiringReminderBtn.innerHTML = '<i class="fas fa-check"></i><span>Email Sent!</span>';

setTimeout(() => {
sendExpiringReminderBtn.disabled = false;
sendExpiringReminderBtn.innerHTML = '<i class="fas fa-hourglass-half"></i><span>Send Expiration Reminder</span>';
}, 3000);
} catch (error) {
console.error('Error sending expiration reminder:', error);
displayModalMessage(`Failed to send expiration reminder: ${error.message}`, 'error');
sendExpiringReminderBtn.disabled = false;
sendExpiringReminderBtn.innerHTML = '<i class="fas fa-hourglass-half"></i><span>Send Expiration Reminder</span>';
}
}

async function handleSendKitReminder(orderId) {
if (!sendKitReminderBtn) {
return;
}
try {
sendKitReminderBtn.disabled = true;
sendKitReminderBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i><span>Sending...</span>';
modalMessage.classList.add('hidden');

const sendKitReminderEmail = httpsCallable(functions, 'sendKitReminderEmail');
await sendKitReminderEmail({ orderId });

displayModalMessage('Kit follow-up email sent successfully!', 'success');
sendKitReminderBtn.innerHTML = '<i class="fas fa-check"></i><span>Email Sent!</span>';

setTimeout(() => {
sendKitReminderBtn.disabled = false;
sendKitReminderBtn.innerHTML = '<i class="fas fa-truck"></i><span>Send Kit Follow-up</span>';
}, 3000);
} catch (error) {
console.error('Error sending kit reminder:', error);
displayModalMessage(`Failed to send kit reminder: ${error.message}`, 'error');
sendKitReminderBtn.disabled = false;
sendKitReminderBtn.innerHTML = '<i class="fas fa-truck"></i><span>Send Kit Follow-up</span>';
}
}

function displayModalMessage(message, type) {
modalMessage.textContent = message;
modalMessage.className = `mt-4 p-3 text-sm rounded-md`;
if (type === 'success') {
modalMessage.classList.add('bg-green-100', 'text-green-700');
} else if (type === 'error') {
modalMessage.classList.add('bg-red-100', 'text-red-700');
} else if (type === 'info') { // New color for info messages
modalMessage.classList.add('bg-blue-100', 'text-blue-700');
}
modalMessage.classList.remove('hidden');
}

function closeOrderDetailsModal() {
if (!orderDetailsModal) {
return;
}
orderDetailsModal.classList.add('hidden');
if (cancelOrderFormContainer) {
cancelOrderFormContainer.classList.add('hidden');
}
if (voidLabelFormContainer) {
voidLabelFormContainer.classList.add('hidden');
}
if (manualFulfillmentFormContainer) {
manualFulfillmentFormContainer.classList.add('hidden');
}
if (reofferFormContainer) {
reofferFormContainer.classList.add('hidden');
}
updateReminderButtons(null);
}

function updateStatusFilterHighlight(status) {
statusFilterButtons.forEach(button => {
button.classList.toggle('active', button.dataset.statusFilter === status);
});

statusBreakdownItems.forEach(item => {
const itemStatus = item.dataset.status;
const isActive = status === 'all' ? itemStatus === 'all' : itemStatus === status;
item.classList.toggle('active', isActive);
});
}

statusFilterButtons.forEach(button => {
button.addEventListener('click', () => {
currentActiveStatus = button.dataset.statusFilter;
updateStatusFilterHighlight(currentActiveStatus);
filterAndRenderOrders(currentActiveStatus, currentSearchTerm);
});
});

updateStatusFilterHighlight(currentActiveStatus);

if (paginationFirst) {
paginationFirst.addEventListener('click', () => {
if (currentPage !== 1) {
currentPage = 1;
renderOrders();
renderPagination();
}
});
}

if (paginationPrev) {
paginationPrev.addEventListener('click', () => {
if (currentPage > 1) {
currentPage--;
renderOrders();
renderPagination();
}
});
}

if (paginationNext) {
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

if (paginationLast) {
paginationLast.addEventListener('click', () => {
const source = currentFilteredOrders.length ? currentFilteredOrders : allOrders;
const totalPages = Math.max(1, Math.ceil(source.length / ORDERS_PER_PAGE));
if (currentPage !== totalPages) {
currentPage = totalPages;
renderOrders();
renderPagination();
}
});
}

statusBreakdownItems.forEach(item => {
item.addEventListener('click', () => {
const statusToFilter = item.dataset.status || 'all';
currentActiveStatus = statusToFilter;
updateStatusFilterHighlight(currentActiveStatus);
filterAndRenderOrders(currentActiveStatus, currentSearchTerm);
});

item.addEventListener('keydown', (event) => {
if (event.key === 'Enter' || event.key === ' ') {
event.preventDefault();
item.click();
}
});
});

if (searchInput) {
searchInput.addEventListener('input', () => {
applySearchTerm(searchInput.value);
});
}

if (mobileSearchInput) {
mobileSearchInput.addEventListener('input', () => {
applySearchTerm(mobileSearchInput.value);
});
}

if (compactDensityToggle) {
compactDensityToggle.addEventListener('change', () => {
if (!ordersTableBody) {
return;
}
ordersTableBody.classList.toggle('density-compact', compactDensityToggle.checked);
});
}

function updateLastRefreshTimestamp() {
if (!lastRefreshAt) return;
const now = new Date();
lastRefreshAt.textContent = `Updated ${now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
}

if (refreshOrdersBtn) {
refreshOrdersBtn.addEventListener('click', () => {
if (refreshOrdersBtn.disabled) return;
const originalLabel = refreshOrdersBtn.innerHTML;
refreshOrdersBtn.disabled = true;
refreshOrdersBtn.innerHTML = '<i class="fas fa-rotate fa-spin"></i> Refreshing';
filterAndRenderOrders(currentActiveStatus, currentSearchTerm);
updateLastRefreshTimestamp();
setTimeout(() => {
refreshOrdersBtn.disabled = false;
refreshOrdersBtn.innerHTML = originalLabel;
}, 900);
});
}


if (massPrintBtn) {
  massPrintBtn.dataset.loading = 'false';
  updateMassPrintButtonLabel({ force: true });
  massPrintBtn.addEventListener('click', async () => {
    if (massPrintBtn.disabled || massPrintBtn.dataset.loading === 'true') {
      return;
    }

    hideOrdersFeedback();
    const selectedIds = Array.from(selectedOrderIds);
    if (!selectedIds.length) {
      return;
    }

    const selectedOrders = allOrders.filter((order) => selectedOrderIds.has(order.id));
    const kitOrders = selectedOrders.filter((order) => isKitOrder(order));
    const nonKitOrders = selectedOrders
      .filter((order) => !isKitOrder(order))
      .map((order) => order.id);

    if (!kitOrders.length) {
      showOrdersFeedback('Select at least one kit order to mass print shipping labels.', 'error');
      return;
    }

    massPrintBtn.dataset.loading = 'true';
    massPrintBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Preparing…';
    massPrintBtn.disabled = true;

    try {
      const response = await fetch(`${BACKEND_BASE_URL}/print-bundle/bulk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderIds: kitOrders.map((order) => order.id) }),
      });

      if (!response.ok) {
        const errorPayload = await response.json().catch(() => ({}));
        const message = errorPayload?.error || `Mass print failed with status ${response.status}`;
        const errorDetails = new Error(message);
        if (errorPayload && errorPayload.skipped) {
          errorDetails.skipped = errorPayload.skipped;
        }
        throw errorDetails;
      }

      const result = await response.json();
      const base64 = result?.base64;
      const skippedEntries = normalizeSkippedEntries(result?.skipped);
      const printedIds = Array.isArray(result?.printed)
        ? result.printed
        : kitOrders.map((order) => order.id);

      if (!base64) {
        throw new Error('The bulk print response did not include printable data.');
      }

      const binaryString = atob(base64);
      const buffer = new Uint8Array(binaryString.length);
      for (let index = 0; index < binaryString.length; index += 1) {
        buffer[index] = binaryString.charCodeAt(index);
      }

      const blob = new Blob([buffer], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);

      let printWindow = null;
      try {
        printWindow = window.open(url, '_blank', 'noopener');
      } catch (error) {
        printWindow = null;
      }

      if (printWindow && printWindow.focus) {
        try {
          printWindow.focus();
        } catch (focusError) {
          console.warn('Unable to focus mass print window:', focusError);
        }
      } else {
        const downloadLink = document.createElement('a');
        downloadLink.href = url;
        downloadLink.download = 'mass-print-bundle.pdf';
        downloadLink.rel = 'noopener';
        document.body.appendChild(downloadLink);
        downloadLink.click();
        document.body.removeChild(downloadLink);
        showOrdersFeedback('Pop-up blocked. The combined label PDF was downloaded instead.', 'error');
      }

      setTimeout(() => URL.revokeObjectURL(url), 60000);

      const summaryParts = [];
      summaryParts.push(`Prepared ${printedIds.length} kit${printedIds.length === 1 ? '' : 's'} for printing.`);
      if (nonKitOrders.length) {
        summaryParts.push(`Ignored non-kit orders: ${nonKitOrders.join(', ')}`);
      }
      if (skippedEntries.length) {
        const skippedSummary = skippedEntries
          .map((entry) => {
            const reasonText = formatSkippedReason(entry.reason);
            return reasonText ? `${entry.id} (${reasonText})` : entry.id;
          })
          .join(', ');
        summaryParts.push(`Skipped ${skippedEntries.length} order${skippedEntries.length === 1 ? '' : 's'}: ${skippedSummary}`);
      }

      const feedbackType = skippedEntries.length ? 'error' : 'success';
      showOrdersFeedback(summaryParts.join(' '), feedbackType);
      selectedOrderIds.clear();
      clearSelectedOrderCheckboxes();
      updateMassPrintButtonLabel({ force: true });
      setSelectAllState([]);
    } catch (error) {
      console.error('Mass print failed:', error);
      const skippedEntries = normalizeSkippedEntries(error.skipped);
      let message = error.message || 'Failed to prepare mass print bundle.';
      if (skippedEntries.length) {
        const skippedSummary = skippedEntries
          .map((entry) => {
            const reasonText = formatSkippedReason(entry.reason);
            return reasonText ? `${entry.id} (${reasonText})` : entry.id;
          })
          .join(', ');
        message = `${message} Skipped: ${skippedSummary}.`;
      }
      showOrdersFeedback(message, 'error');
    } finally {
      massPrintBtn.dataset.loading = 'false';
      updateMassPrintButtonLabel({ force: true });
    }
  });
} else {
  updateMassPrintButtonLabel({ force: true });
}
if (ordersSelectAllCheckbox) {
ordersSelectAllCheckbox.addEventListener('change', (event) => {
const displayed = Array.from(lastRenderedOrderIds);
if (event.target.checked) {
displayed.forEach((id) => selectedOrderIds.add(id));
} else {
displayed.forEach((id) => selectedOrderIds.delete(id));
}
ordersSelectAllCheckbox.indeterminate = false;
updateMassPrintButtonLabel();
setSelectAllState(displayed);
});
}

if (closeModalButton) {
closeModalButton.addEventListener('click', closeOrderDetailsModal);
}

document.addEventListener('DOMContentLoaded', async () => {
try {
// IMPORTANT: Firebase initialization
const app = firebaseApp;
db = getFirestore(app);
auth = getAuth(app);
functions = getFunctions(app);

const authLoadingScreen = document.getElementById('auth-loading-screen');

// Logout functionality - added AFTER auth is initialized
const logoutBtn = document.getElementById('logout-btn');
if (logoutBtn) {
logoutBtn.addEventListener('click', async () => {
try {
await signOut(auth);
console.log('User signed out successfully');
// Redirect to the login page (assuming index.html is the login page)
window.location.href = '/index.html';
} catch (error) {
console.error('Error signing out:', error);
// Using console.error instead of alert()
console.error('Failed to logout. Please try again.');
}
});
}

// Notification bell dropdown functionality - added AFTER auth is initialized
const notificationBellContainer = document.getElementById('notification-bell-container');
const notificationDropdown = document.getElementById('notification-dropdown');

if (notificationBellContainer && notificationDropdown) {
notificationBellContainer.addEventListener('click', (e) => {
e.stopPropagation();
notificationDropdown.classList.toggle('show');
});

// Close dropdown when clicking outside
document.addEventListener('click', (e) => {
if (!notificationBellContainer.contains(e.target)) {
notificationDropdown.classList.remove('show');
}
});
}

onAuthStateChanged(auth, (user) => {
if (!user || user.isAnonymous) {
console.log('Auth state changed: No authenticated user or anonymous user detected, redirecting...');
// Redirect to the login page (assuming index.html is the login page)
window.location.href = '/index.html';
return;
}

console.log('Auth state changed: User logged in, UID:', user.uid);
authLoadingScreen?.classList.add('hidden');

currentUserId = user.uid;
/* REMOVED SIDEBAR USER ID DISPLAY, NOW JUST LOGGED IN */
// displayUserId.textContent = user.email || user.uid;

fetchAndRenderOrders();
/* REMOVED NOTIFICATION LIST UPDATES - ONLY BADGE REMAINS FOR PERFORMANCE */
/* updateNotifications(); */
updateActiveChatsCount(); // <-- Moved here for safety
if (IS_ANALYTICS_PAGE) {
initializeAnalyticsDashboard();
}
});

} catch (error) {
console.error("Error initializing Firebase:", error);
if (ordersTableBody) {
ordersTableBody.innerHTML = `<tr><td colspan="9" class="text-center text-red-500 py-4">Failed to load orders.</td></tr>`;
}
document.getElementById('auth-loading-screen')?.classList.add('hidden');
}
});

async function fetchAndRenderOrders() {
try {
const ordersCollectionRef = collection(db, "orders");
// IMPORTANT: Removed orderBy() to avoid index requirement errors, sorting will happen client-side if needed.
onSnapshot(ordersCollectionRef, (snapshot) => {
allOrders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

// Client-side sort: newest first
allOrders.sort((a, b) => {
const dateA = extractTimestampMillis(a.createdAt) || 0;
const dateB = extractTimestampMillis(b.createdAt) || 0;
return dateB - dateA;
});

updateDashboardCounts(allOrders);
filterAndRenderOrders(currentActiveStatus, currentSearchTerm, { preservePage: true });
updateLastRefreshTimestamp();
});
} catch (error) {
console.error('Error fetching real-time orders:', error);
if (ordersTableBody) {
ordersTableBody.innerHTML = `<tr><td colspan="9" class="text-center text-red-500 py-4">Failed to load orders.</td></tr>`;
}
}
}

function filterAndRenderOrders(status, searchTerm = currentSearchTerm, options = {}) {
currentSearchTerm = typeof searchTerm === 'string' ? searchTerm : '';
syncSearchInputs(currentSearchTerm);

const preservePage = options.preservePage === true;
const previousPage = currentPage;

let filtered = allOrders;

if (status !== 'all') {
if (status === 'kit_needs_printing') {
filtered = filtered.filter(order => KIT_PRINT_PENDING_STATUSES.includes(order.status));
} else if (status === 'label_generated') {
filtered = filtered.filter(order => order.status === 'label_generated' || order.status === 'emailed');
} else {
filtered = filtered.filter(order => order.status === status);
}
}

if (currentSearchTerm) {
const lowerCaseSearchTerm = currentSearchTerm.toLowerCase();
filtered = filtered.filter(order =>
order.id.toLowerCase().includes(lowerCaseSearchTerm) ||
(order.shippingInfo && order.shippingInfo.fullName.toLowerCase().includes(lowerCaseSearchTerm)) ||
(order.device && order.device.toLowerCase().includes(lowerCaseSearchTerm)) ||
(order.storage && order.storage.toLowerCase().includes(lowerCaseSearchTerm)) ||
(order.trackingNumber && order.trackingNumber.toLowerCase().includes(lowerCaseSearchTerm))
);
}

if (IS_AGING_PAGE) {
filtered = filtered.filter(isAgingCandidate);
}

if (IS_BULK_PRINT_PAGE) {
filtered = filtered.filter(isKitOrder);
}

filtered.sort((a, b) => {
const dateA = extractTimestampMillis(a.createdAt) || 0;
const dateB = extractTimestampMillis(b.createdAt) || 0;
return dateB - dateA;
});

currentFilteredOrders = filtered;
const totalPages = Math.max(1, Math.ceil(filtered.length / ORDERS_PER_PAGE));
if (preservePage) {
currentPage = Math.min(Math.max(previousPage, 1), totalPages);
} else {
currentPage = 1;
}
renderOrders();
renderPagination();
}

// Update current time and date display
function updateTimeDate() {
const now = new Date();
const options = {
weekday: 'short',
year: 'numeric',
month: 'short',
day: 'numeric',
hour: '2-digit',
minute: '2-digit'
};
const timeDate = now.toLocaleDateString('en-US', options);
const timeDisplay = document.getElementById('current-time-date');
if (timeDisplay) {
timeDisplay.textContent = timeDate;
}
}

// Update time every minute
updateTimeDate();
setInterval(updateTimeDate, 60000);

// Simulate fetching active chats count (in real implementation, fetch from Firebase)
async function updateActiveChatsCount() {
// Check if db is defined before trying to access collection
if (!db) {
console.warn('Firestore database not yet initialized for chat count.');
return;
}

try {
const chatsCollectionRef = collection(db, "chats");
const q = query(chatsCollectionRef, where("status", "==", "active"));
onSnapshot(q, (snapshot) => {
const count = snapshot.size;
const activeChatsEl = document.getElementById('active-chats-count');
if (activeChatsEl) {
activeChatsEl.textContent = count;
}

// Update floating button badge
const floatingBadge = document.getElementById('floating-chat-badge');
if (count > 0) {
if (floatingBadge) {
floatingBadge.textContent = count;
floatingBadge.style.display = 'block';
}
} else {
if (floatingBadge) {
floatingBadge.style.display = 'none';
}
}
});
} catch (error) {
console.log('Chats collection not available or error fetching:', error);
const activeChatsEl = document.getElementById('active-chats-count');
if (activeChatsEl) {
activeChatsEl.textContent = '0';
}
}
}

// Update notification badge for new orders
function updateNotificationBadge(orders) {
const newOrders = orders.filter(order =>
order.status === 'order_pending' || KIT_PRINT_PENDING_STATUSES.includes(order.status)
).length;

const notificationBadge = document.getElementById('notification-badge');
if (!notificationBadge) {
return;
}
if (newOrders > 0) {
notificationBadge.textContent = newOrders;
notificationBadge.style.display = 'block';
} else {
notificationBadge.style.display = 'none';
}
}
document.addEventListener('DOMContentLoaded', () => {
    const refreshAllTrackingBtn = document.getElementById('refresh-all-tracking-btn');
    const refreshOrdersBtn = document.getElementById('refresh-orders-btn');

    if (refreshAllTrackingBtn) {
        refreshAllTrackingBtn.addEventListener('click', async () => {
            refreshAllTrackingBtn.disabled = true;
            refreshAllTrackingBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Refreshing...';
            try {
                // Fetch all orders (replace with your Firestore or API call)
                const orders = await fetch('/api/orders').then(r => r.json());

                // Filter only ones with kits sent or delivered
                const kitOrders = orders.filter(o =>
                    ['kit_sent', 'kit_delivered'].includes(o.status)
                );

                for (const order of kitOrders) {
                    try {
                        await fetch(`/api/track-kit/${order.id}`, { method: 'POST' });
                        console.log(`Refreshed tracking for ${order.id}`);
                    } catch (err) {
                        console.warn(`Failed to refresh ${order.id}`, err);
                    }
                }

                alert(`✅ Refreshed ${kitOrders.length} kit tracking updates.`);
                // Optionally reload order list
                if (refreshOrdersBtn) {
                    refreshOrdersBtn.click();
                }
            } catch (err) {
                alert('⚠️ Failed to refresh kit tracking data. Check console for details.');
                console.error(err);
            } finally {
                refreshAllTrackingBtn.disabled = false;
                refreshAllTrackingBtn.innerHTML = '<i class="fas fa-sync-alt"></i> Refresh All Kit Tracking';
            }
        });
    }
});

/* --- BATCH KIT REFRESH (auto UI + logic) --- */
(function () {
  try {
    if (window.__BATCH_KIT_REFRESH_INSTALLED__) return;
    window.__BATCH_KIT_REFRESH_INSTALLED__ = true;

    const API_BASE =
      (typeof window !== "undefined" && (window.API_BASE || window.BACKEND_BASE_URL)) ||
      (typeof BACKEND_BASE_URL !== "undefined" && BACKEND_BASE_URL) ||
      "https://us-central1-buyback-a0f05.cloudfunctions.net/api";

    const ordersTbody = document.getElementById("orders-table-body");
    const refreshBtn = document.getElementById("refresh-orders-btn");
    const lastRefreshAt = document.getElementById("last-refresh-at");

    function setStatus(text) {
      if (lastRefreshAt) lastRefreshAt.textContent = text;
    }

    function toggleBtnState(btn, on, label) {
      if (!btn) return;
      btn.disabled = on;
      btn.classList.toggle("is-loading", on);
      if (label) {
        const span = btn.querySelector("span.status");
        if (span) span.textContent = label;
      }
    }

    function collectOrderIdsFromTable() {
      if (!ordersTbody) return [];
      const ids = new Set();
      for (const tr of ordersTbody.querySelectorAll("tr")) {
        const idAttr = tr.getAttribute("data-order-id") || (tr.dataset && tr.dataset.orderId);
        if (idAttr) {
          ids.add(idAttr);
          continue;
        }
        const firstCell = tr.querySelector("td");
        if (!firstCell) continue;
        const text = (firstCell.textContent || "").trim();
        const m = text.match(/SHC-\d+|[A-Z]{2,}-\d+/);
        if (m) ids.add(m[0]);
      }
      return Array.from(ids);
    }

    async function refreshKitTrackingForOrder(orderId) {
      const url = `${API_BASE}/orders/${encodeURIComponent(orderId)}/refresh-kit-tracking`;
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      try { return await res.json(); } catch { return {}; }
    }

    async function runBatchRefresh({ concurrency = 4 } = {}) {
      const ids = collectOrderIdsFromTable();
      if (!ids.length) {
        console.log("No order rows found to refresh.");
        return { ok: 0, fail: 0, total: 0 };
      }

      const allBtn = document.getElementById("refresh-all-kits-btn");
      toggleBtnState(refreshBtn, true);
      toggleBtnState(allBtn, true);
      setStatus(`Refreshing ${ids.length} kits…`);

      let i = 0;
      const results = { ok: 0, fail: 0, total: ids.length };
      const queue = ids.slice();

      async function worker() {
        while (queue.length) {
          const id = queue.shift();
          try {
            await refreshKitTrackingForOrder(id);
            results.ok++;
          } catch (e) {
            console.warn("Kit refresh failed", id, e);
            results.fail++;
          } finally {
            i++;
            setStatus(`Refreshing kits… ${i}/${ids.length}`);
          }
        }
      }

      const N = Math.min(concurrency, ids.length);
      await Promise.all(Array.from({ length: N }, worker));

      toggleBtnState(refreshBtn, false);
      toggleBtnState(allBtn, false);
      setStatus(`Batch refresh complete: ${results.ok} ok, ${results.fail} failed`);
      return results;
    }

    // Create and insert the "Refresh all kit tracking" button if not present
    (function insertButton() {
      if (document.getElementById("refresh-all-kits-btn")) return;
      const toolbar = document.querySelector(".orders-toolbar");
      if (!toolbar) return;

      const btn = document.createElement("button");
      btn.id = "refresh-all-kits-btn";
      btn.className = "refresh-btn";
      btn.innerHTML = '<i class="fas fa-truck-fast"></i><span>Refresh all kit tracking</span>';
      btn.addEventListener("click", () => runBatchRefresh({ concurrency: 4 }));
      // Place it next to the existing Refresh data button
      const actions = toolbar.querySelector(".refresh-btn")?.parentElement || toolbar;
      actions.appendChild(btn);
    })();

    // Make the existing "Refresh data" also run batch kit refresh first (toggleable)
    const DO_BATCH_BEFORE_REFRESH = true;
    if (refreshBtn && !refreshBtn.__batchPatched) {
      refreshBtn.__batchPatched = true;
      const clone = refreshBtn.cloneNode(true);
      refreshBtn.parentNode.replaceChild(clone, refreshBtn);
      clone.addEventListener("click", async (ev) => {
        if (!DO_BATCH_BEFORE_REFRESH) return; // fall through to the original handler
        ev.preventDefault();
        try {
          await runBatchRefresh({ concurrency: 4 });
        } catch (e) {
          console.warn("Batch refresh error", e);
        }
        // Trigger a real data refresh by dispatching a click again (bubbles to other listeners)
        setTimeout(() => clone.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: false })), 0);
      }, { capture: true });
    }
  } catch (e) {
    console.warn("Batch kit refresh bootstrap failed", e);
  }
})();
/* --- END BATCH KIT REFRESH --- */
