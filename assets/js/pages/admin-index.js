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
const REFRESH_TRACKING_FUNCTION_URL = 'https://us-central1-buyback-a0f05.cloudfunctions.net/refreshTracking';
const FEED_PRICING_URL = '/feeds/feed.xml';
const AUTO_ACCEPT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const AUTO_REQUOTE_WAIT_MS = 7 * 24 * 60 * 60 * 1000;
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
  { key: 'kit_on_the_way_to_customer', label: 'Kit On The Way To Customer', color: '#f59e0b' },
  { key: 'kit_delivered', label: 'Kit Delivered', color: '#10b981' },
  { key: 'kit_on_the_way_to_us', label: 'Kit On The Way To Us', color: '#0f766e' },
  { key: 'delivered_to_us', label: 'Delivered To Us', color: '#0d9488' },
  { key: 'label_generated', label: 'Label Generated', color: '#f59e0b' },
  { key: 'emailed', label: 'Balance Email Sent', color: '#38bdf8' },
  { key: 'phone_on_the_way', label: 'Phone On The Way', color: '#0ea5e9' },
  { key: 'phone_on_the_way_to_us', label: 'Phone On The Way To Us', color: '#0284c7' },
  { key: 'received', label: 'Received', color: '#0ea5e9' },
{ key: 'completed', label: 'Completed', color: '#22c55e' },
{ key: 're-offered-pending', label: 'Reoffer Pending', color: '#facc15' },
{ key: 're-offered-accepted', label: 'Reoffer Accepted', color: '#14b8a6' },
{ key: 're-offered-declined', label: 'Reoffer Declined', color: '#ef4444' },
{ key: 'return-label-generated', label: 'Return Label', color: '#64748b' },
];

const STATUS_DROPDOWN_OPTIONS = [
  'order_pending',
  'shipping_kit_requested',
  'kit_needs_printing',
  'needs_printing',
  'kit_sent',
  'kit_on_the_way_to_customer',
  'kit_delivered',
  'kit_on_the_way_to_us',
  'delivered_to_us',
  'label_generated',
  'emailed',
  'phone_on_the_way',
  'phone_on_the_way_to_us',
  'received',
  'completed',
  're-offered-pending',
  're-offered-accepted',
  're-offered-declined',
  're-offered-auto-accepted',
  'return-label-generated',
  'cancelled',
];

const STATUS_LABEL_OVERRIDES = Object.freeze({
  shipping_kit_requested: 'Shipping Kit Requested',
  needs_printing: 'Needs Printing',
  kit_in_transit: 'Kit On The Way To Customer',
  kit_on_the_way_to_customer: 'Kit On The Way To Customer',
  phone_on_the_way: 'Phone On The Way',
  phone_on_the_way_to_us: 'Phone On The Way To Us',
  're-offered-pending': 'Reoffer Pending',
  're-offered-accepted': 'Reoffer Accepted',
  're-offered-declined': 'Reoffer Declined',
  're-offered-auto-accepted': 'Reoffer Auto Accepted',
  'return-label-generated': 'Return Label Generated',
  emailed: 'Balance Email Sent',
});

const STATUS_BUTTON_BASE_CLASSES = 'inline-flex items-center gap-2 font-semibold text-xs px-3 py-1 rounded-full border border-transparent shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-400';

const TRUSTPILOT_REVIEW_LINK = "https://www.trustpilot.com/evaluate/secondhandcell.com";
const TRUSTPILOT_STARS_IMAGE_URL = "https://cdn.trustpilot.net/brand-assets/4.1.0/stars/stars-5.png";

const escapeHtml = (value) => {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
};

if (typeof window !== "undefined" && !window.escapeHtml) {
  window.escapeHtml = escapeHtml;
}

const formatShippingAddress = (shippingInfo = {}) => {
  if (!shippingInfo) {
    return "N/A";
  }

  const segments = [];
  if (shippingInfo.streetAddress) {
    segments.push(shippingInfo.streetAddress);
  }

  const cityState = [shippingInfo.city, shippingInfo.state]
    .filter((part) => part && String(part).trim().length)
    .join(", ");

  if (cityState) {
    const withZip = shippingInfo.zipCode
      ? `${cityState} ${shippingInfo.zipCode}`
      : cityState;
    segments.push(withZip);
  } else if (shippingInfo.zipCode) {
    segments.push(shippingInfo.zipCode);
  }

  return segments.length ? segments.join(", ") : "N/A";
};

if (typeof window !== "undefined" && !window.formatShippingAddress) {
  window.formatShippingAddress = formatShippingAddress;
}

function isBalanceEmailStatus(order = {}) {
  if (!order || typeof order !== 'object') {
    return false;
  }
  if ((order.status || '').toLowerCase() !== 'emailed') {
    return false;
  }
  if (order.balanceEmailSentAt) {
    return true;
  }
  const reason = (order.lastConditionEmailReason || order.conditionEmailReason || '')
    .toString()
    .toLowerCase();
  return reason === 'outstanding_balance';
}

function isLegacyEmailLabelStatus(order = {}) {
  return (order.status || '').toLowerCase() === 'emailed' && !isBalanceEmailStatus(order);
}

function isLabelGenerationStage(order = {}) {
  const normalized = (order.status || '').toLowerCase();
  if (!normalized) {
    return false;
  }
  if (normalized === 'label_generated') {
    return true;
  }
  if (normalized === 'emailed') {
    return isLegacyEmailLabelStatus(order);
  }
  return false;
}

function resolveReminderStatusKey(order = {}) {
  const normalized = (order?.status || '').toLowerCase();
  if (normalized === 'emailed' && isLegacyEmailLabelStatus(order)) {
    return 'label_generated';
  }
  return normalized;
}

import { firebaseApp } from "/assets/js/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, doc, onSnapshot, collection, query, where, orderBy, limit, setDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-functions.js";
import { createOrderInfoLabelPdf } from "/assets/js/pdf/order-labels.js";
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
let currentDeviceDocId = null;
let currentDeviceDocHasSnapshot = false;
let imeiUnsubscribe = null;
let isImeiChecking = false;
let pendingImeiOrder = null;

const ADMIN_PAGE = document.body?.dataset?.adminPage || 'orders';
const IS_ORDERS_PAGE = ADMIN_PAGE === 'orders';
const IS_ANALYTICS_PAGE = ADMIN_PAGE === 'analytics';
const IS_AGING_PAGE = ADMIN_PAGE === 'aging';

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
const lastRefreshAt = document.getElementById('last-refresh-at');
if (lastRefreshAt) {
lastRefreshAt.textContent = 'Listening for updates…';
}
/* REMOVED STATUS LINKS REFERENCE */
const displayUserId = document.getElementById('display-user-id');

const selectAllOrdersCheckbox = document.getElementById('select-all-orders');
const bulkStatusSelect = document.getElementById('bulk-status-select');
const bulkStatusApplyBtn = document.getElementById('bulk-status-apply');
const bulkSelectionCount = document.getElementById('bulk-selection-count');
const refreshAllKitTrackingBtn = document.getElementById('refresh-all-kit-tracking');
const refreshAllEmailTrackingBtn = document.getElementById('refresh-all-email-tracking');
const bulkGenerateLabelsBtn = document.getElementById('bulk-generate-labels');

const KIT_STATUS_HINTS = new Set([
  'shipping_kit_requested',
  'kit_needs_printing',
  'kit_sent',
  'kit_on_the_way_to_customer',
  'kit_delivered',
  'kit_on_the_way_to_us',
]);

const EMAIL_STATUS_HINTS = new Set([
  'email_label_requested',
  'label_generated',
  'phone_on_the_way',
  'phone_on_the_way_to_us',
  'delivered_to_us',
  'received',
  'completed',
]);

const TRACKING_POST_RECEIVED_STATUSES = new Set([
  'received',
  'device_received',
  'received_device',
  'completed',
  'complete',
  're-offered-pending',
  're-offered-accepted',
  're-offered-declined',
  're-offered-auto-accepted',
  're_offered_pending',
  're_offered_accepted',
  're_offered_declined',
  're_offered_auto_accepted',
  'reoffer pending',
  'reoffer accepted',
  'reoffer declined',
  'reoffer auto accepted',
  'reoffer_pending',
  'reoffer_accepted',
  'reoffer_declined',
  'reoffer_auto_accepted',
  'return-label-generated',
  'return_label_generated',
  'return label generated',
  'return-label-sent',
  'return_label_sent',
  'return label sent',
  'return-label-requested',
  'return_label_requested',
  'return label requested',
  'return-label-created',
  'return_label_created',
  'return label created',
  'cancelled',
  'canceled',
]);

const selectedOrderIds = new Set();
let lastRenderedOrderIds = [];
let isBulkLabelGenerationInProgress = false;

// Insight metric elements
const ordersTodayCount = document.getElementById('orders-today-count');
const totalPayoutAmount = document.getElementById('total-payout-amount');
const conversionRate = document.getElementById('conversion-rate');
const receivedDevicesCount = document.getElementById('received-devices-count');

// Updated count elements
const orderPendingCount = document.getElementById('order-pending-count');
const kitNeedsPrintingCount = document.getElementById('kit-needs-printing-count');
const kitSentCount = document.getElementById('kit-sent-count');
const kitOnTheWayToCustomerCount = document.getElementById('kit-on-the-way-to-customer-count');
const kitDeliveredCount = document.getElementById('kit-delivered-count');
const kitOnTheWayToUsCount = document.getElementById('kit-on-the-way-to-us-count');
const deliveredToUsCount = document.getElementById('delivered-to-us-count');
const labelGeneratedCount = document.getElementById('label-generated-count');
const emailedCount = document.getElementById('emailed-count');
const phoneOnTheWayCount = document.getElementById('phone-on-the-way-count');
const phoneOnTheWayToUsCount = document.getElementById('phone-on-the-way-to-us-count');
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
const shippingAddressDisplayRow = document.getElementById('shipping-address-display-row');
const shippingAddressEditTrigger = document.getElementById('shipping-address-edit-trigger');
const shippingAddressEditContainer = document.getElementById('shipping-address-edit-container');
const shippingAddressInput = document.getElementById('shipping-address-text');
const shippingAddressApplyButton = document.getElementById('shipping-address-apply');
const shippingAddressCancelButton = document.getElementById('shipping-address-cancel');
const shippingAddressFeedback = document.getElementById('shipping-address-edit-feedback');
const shippingAddressApplyButtonDefaultText = shippingAddressApplyButton
  ? shippingAddressApplyButton.textContent
  : 'Apply';
const modalConditionPowerOn = document.getElementById('modal-condition-power-on');
const modalConditionFunctional = document.getElementById('modal-condition-functional');
const modalConditionCracks = document.getElementById('modal-condition-cracks');
const modalConditionCosmetic = document.getElementById('modal-condition-cosmetic');
const modalStatus = document.getElementById('modal-status');
const modalStatusText = document.getElementById('modal-status-text');
const modalStatusWrapper = document.getElementById('modal-status-wrapper');
const modalStatusDropdown = document.getElementById('modal-status-dropdown');
const modalStatusCaret = document.getElementById('modal-status-caret');

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
const modalKitTrackingTitle = document.getElementById('modal-kit-tracking-title');
const modalKitTrackingStatus = document.getElementById('modal-kit-tracking-status');
const modalKitTrackingUpdated = document.getElementById('modal-kit-tracking-updated');

const modalImeiSection = document.getElementById('modal-imei-section');
const modalImeiStatus = document.getElementById('modal-imei-status');
const modalImeiMessage = document.getElementById('modal-imei-message');
const modalImeiForm = document.getElementById('modal-imei-form');
const modalImeiInput = document.getElementById('modal-imei-input');
const modalImeiButton = document.getElementById('modal-imei-button');
const modalImeiError = document.getElementById('modal-imei-error');
const modalImeiResult = document.getElementById('modal-imei-result');
const modalImeiResultList = document.getElementById('modal-imei-result-list');
const modalImeiDeviceId = document.getElementById('modal-imei-device-id');
const modalImeiCheckedAt = document.getElementById('modal-imei-checked-at');
const modalImeiRawDetails = document.getElementById('modal-imei-raw-details');
const modalImeiRaw = document.getElementById('modal-imei-raw');
const imeiButtonDefaultText = modalImeiButton ? modalImeiButton.textContent : 'Check IMEI';
const IMEI_NUMBER_REGEX = /^\d{15}$/;

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

const clearDataFormContainer = document.getElementById('clear-data-form-container');
const clearDataOptionsContainer = document.getElementById('clear-data-options');
const clearDataMessage = document.getElementById('clear-data-message');
const submitClearDataBtn = document.getElementById('submit-clear-data-btn');
const cancelClearDataBtn = document.getElementById('cancel-clear-data-btn');

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
let currentActiveStatus = 'all';
let currentOrderDetails = null;
let feedPricingDataCache = null;
let feedPricingDataPromise = null;

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

function getStatusLabelText(status) {
  if (!status) {
    return '';
  }
  const overrides =
    typeof STATUS_LABEL_OVERRIDES !== 'undefined' && STATUS_LABEL_OVERRIDES
      ? STATUS_LABEL_OVERRIDES
      : null;
  if (overrides && overrides[status]) {
    return overrides[status];
  }
  return status
    .replace(/_/g, ' ')
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function populateBulkStatusSelect() {
  if (!bulkStatusSelect || bulkStatusSelect.dataset.initialized === 'true') {
    return;
  }

  const fragment = document.createDocumentFragment();
  STATUS_DROPDOWN_OPTIONS.forEach((status) => {
    const option = document.createElement('option');
    option.value = status;
    option.textContent = getStatusLabelText(status);
    fragment.appendChild(option);
  });

  bulkStatusSelect.appendChild(fragment);
  bulkStatusSelect.dataset.initialized = 'true';
}

function syncRowSelectionCheckboxes() {
  if (!ordersTableBody) {
    return;
  }
  const checkboxes = ordersTableBody.querySelectorAll('.order-select-checkbox');
  checkboxes.forEach((checkbox) => {
    const orderId = checkbox.dataset.orderId;
    if (!orderId) {
      return;
    }
    checkbox.checked = selectedOrderIds.has(orderId);
  });
}

function updateBulkSelectionUI() {
  const selectedCount = selectedOrderIds.size;
  if (bulkSelectionCount) {
    bulkSelectionCount.textContent = selectedCount
      ? `${selectedCount} order${selectedCount === 1 ? '' : 's'} selected`
      : 'No orders selected';
  }

  if (bulkStatusApplyBtn) {
    const statusChosen = Boolean(bulkStatusSelect && bulkStatusSelect.value);
    bulkStatusApplyBtn.disabled = !(selectedCount > 0 && statusChosen);
  }

  if (bulkGenerateLabelsBtn) {
    const disabled = isBulkLabelGenerationInProgress || selectedCount === 0;
    bulkGenerateLabelsBtn.disabled = disabled;
    if (isBulkLabelGenerationInProgress) {
      bulkGenerateLabelsBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i><span>Generating Labels…</span>';
    } else {
      bulkGenerateLabelsBtn.innerHTML = '<i class="fas fa-tags"></i><span>Generate Labels For Selected</span>';
    }
  }

  if (selectAllOrdersCheckbox) {
    if (!lastRenderedOrderIds.length) {
      selectAllOrdersCheckbox.checked = false;
      selectAllOrdersCheckbox.indeterminate = false;
    } else {
      const selectedOnPage = lastRenderedOrderIds.filter((id) => selectedOrderIds.has(id)).length;
      const allOnPageSelected = selectedOnPage === lastRenderedOrderIds.length && lastRenderedOrderIds.length > 0;
      selectAllOrdersCheckbox.checked = allOnPageSelected;
      selectAllOrdersCheckbox.indeterminate = selectedOnPage > 0 && !allOnPageSelected;
    }
  }

  syncRowSelectionCheckboxes();
}

async function handleBulkStatusUpdate() {
  if (!bulkStatusSelect) {
    return;
  }

  const status = bulkStatusSelect.value;
  const orderIds = Array.from(selectedOrderIds);

  if (!status || !orderIds.length) {
    updateBulkSelectionUI();
    return;
  }

  if (bulkStatusApplyBtn) {
    bulkStatusApplyBtn.disabled = true;
  }

  let successCount = 0;
  const failed = [];

  for (const orderId of orderIds) {
    try {
      await updateOrderStatusInline(orderId, status, { notifyCustomer: false });
      successCount += 1;
    } catch (error) {
      console.error(`Bulk status update failed for ${orderId}:`, error);
      failed.push(orderId);
    }
  }

  if (failed.length) {
    alert(`⚠️ Updated ${successCount} order${successCount === 1 ? '' : 's'}. Failed: ${failed.join(', ')}. Check console for details.`);
    selectedOrderIds.clear();
    failed.forEach((id) => selectedOrderIds.add(id));
  } else {
    alert(`✅ Updated ${successCount} order${successCount === 1 ? '' : 's'} to ${getStatusLabelText(status)}.`);
    selectedOrderIds.clear();
    bulkStatusSelect.value = '';
  }

  updateBulkSelectionUI();
}

async function handleBulkLabelGeneration() {
  if (isBulkLabelGenerationInProgress) {
    return;
  }

  const orderIds = Array.from(selectedOrderIds);
  if (!orderIds.length) {
    updateBulkSelectionUI();
    return;
  }

  isBulkLabelGenerationInProgress = true;
  updateBulkSelectionUI();

  let successCount = 0;
  const failed = [];

  for (const orderId of orderIds) {
    try {
      const response = await fetch(`${BACKEND_BASE_URL}/generate-label/${orderId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || `Label generation failed (${response.status}).`);
      }

      successCount += 1;
    } catch (error) {
      console.error(`Bulk label generation failed for ${orderId}:`, error);
      failed.push(orderId);
    }
  }

  if (failed.length) {
    alert(`⚠️ Generated labels for ${successCount} order${successCount === 1 ? '' : 's'}. Failed: ${failed.join(', ')}.`);
    selectedOrderIds.clear();
    failed.forEach((id) => selectedOrderIds.add(id));
  } else {
    alert(`✅ Generated labels for ${successCount} order${successCount === 1 ? '' : 's'}.`);
    selectedOrderIds.clear();
  }

  isBulkLabelGenerationInProgress = false;
  updateBulkSelectionUI();
  renderOrders();
}

try {
  populateBulkStatusSelect();
} catch (error) {
  console.error('Failed to populate bulk status dropdown', error);
}
updateBulkSelectionUI();

if (bulkStatusSelect) {
  bulkStatusSelect.addEventListener('change', updateBulkSelectionUI);
}

if (bulkStatusApplyBtn) {
  bulkStatusApplyBtn.addEventListener('click', handleBulkStatusUpdate);
}

if (refreshAllKitTrackingBtn) {
  refreshAllKitTrackingBtn.addEventListener('click', () => {
    refreshTrackingForOrders('kit', refreshAllKitTrackingBtn);
  });
}

if (refreshAllEmailTrackingBtn) {
  refreshAllEmailTrackingBtn.addEventListener('click', () => {
    refreshTrackingForOrders('email', refreshAllEmailTrackingBtn);
  });
}

if (bulkGenerateLabelsBtn) {
  bulkGenerateLabelsBtn.addEventListener('click', handleBulkLabelGeneration);
}

if (selectAllOrdersCheckbox) {
  selectAllOrdersCheckbox.addEventListener('change', (event) => {
    if (!lastRenderedOrderIds.length) {
      selectAllOrdersCheckbox.checked = false;
      selectAllOrdersCheckbox.indeterminate = false;
      return;
    }

    if (event.target.checked) {
      lastRenderedOrderIds.forEach((id) => selectedOrderIds.add(id));
    } else {
      lastRenderedOrderIds.forEach((id) => selectedOrderIds.delete(id));
    }

    updateBulkSelectionUI();
  });
}

function applySearchTerm(term = '') {
currentSearchTerm = term || '';
syncSearchInputs(currentSearchTerm);
filterAndRenderOrders(currentActiveStatus, currentSearchTerm);
}

const KIT_PRINT_PENDING_STATUSES = ['shipping_kit_requested', 'kit_needs_printing', 'needs_printing'];
const REMINDER_ELIGIBLE_STATUSES = [
  'label_generated',
  'kit_on_the_way_to_us',
  'kit_on_the_way_to_customer',
  'phone_on_the_way',
  'phone_on_the_way_to_us',
];
const EXPIRING_REMINDER_STATUSES = [
  'order_pending',
  ...KIT_PRINT_PENDING_STATUSES,
  'label_generated',
  'kit_on_the_way_to_us',
  'kit_on_the_way_to_customer',
  'phone_on_the_way',
  'phone_on_the_way_to_us',
];
const KIT_REMINDER_STATUSES = ['kit_sent', 'kit_delivered', 'kit_on_the_way_to_us', 'kit_on_the_way_to_customer'];
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

if (shippingAddressEditTrigger) {
  shippingAddressEditTrigger.addEventListener('click', () => {
    if (!currentOrderDetails) {
      return;
    }

    if (isShippingAddressEditorVisible()) {
      toggleShippingAddressEditor(false);
      return;
    }

    populateShippingAddressEditor(currentOrderDetails.shippingInfo || {});
    clearShippingAddressFeedback();
    toggleShippingAddressEditor(true);
    setTimeout(() => {
      shippingAddressInput?.focus();
    }, 0);
  });
}

if (shippingAddressCancelButton) {
  shippingAddressCancelButton.addEventListener('click', () => {
    resetShippingAddressEditor({ restoreFromOrder: true });
  });
}

if (shippingAddressApplyButton) {
  shippingAddressApplyButton.addEventListener('click', () => {
    handleShippingAddressApply();
  });
}





const USPS_TRACKING_URL = 'https://tools.usps.com/go/TrackConfirmAction?qtc_tLabels1=';

const IMEI_RESULT_FIELDS = [
  { key: 'remarks', label: 'ESN Remarks' },
  { key: 'carrier', label: 'Carrier' },
  { key: 'blacklisted', label: 'Blacklisted' },
  { key: 'api', label: 'Phonecheck API Plan' },
  { key: 'deviceId', label: 'Reported Device ID' },
  { key: 'deviceName', label: 'Device Name' },
  { key: 'brand', label: 'Brand' },
  { key: 'model', label: 'Model' },
  { key: 'color', label: 'Color' },
  { key: 'storage', label: 'Storage' },
  { key: 'warrantyStatus', label: 'Warranty Status' },
  { key: 'carrierLock', label: 'Carrier Lock' },
  { key: 'lockedCarrier', label: 'Locked Carrier' }
];

const ORDER_RECEIVED_STATUSES = new Set(['received']);

function normalizeStatusValueLocal(value) {
  if (typeof value !== 'string') {
    return '';
  }
  return value.trim().toLowerCase();
}

function extractOrderImeiData(order) {
  if (!order || typeof order !== 'object') {
    return {
      imei: '',
      imeiChecked: false,
      imeiCheckResult: null,
      imeiCheckedAt: null,
    };
  }

  const imeiCandidates = [
    order.imei,
    order.device?.imei,
    order.fulfilledOrders?.imei,
    order.deviceInfo?.imei,
  ];

  let imei = '';
  for (const candidate of imeiCandidates) {
    if (typeof candidate === 'string' && candidate.trim()) {
      imei = candidate.trim();
      break;
    }
  }

  return {
    imei,
    imeiChecked: Boolean(order.imeiChecked),
    imeiCheckResult: order.imeiCheckResult || null,
    imeiCheckedAt: order.imeiCheckedAt || null,
  };
}

function resetImeiSection() {
  if (!modalImeiSection) {
    return;
  }
  modalImeiSection.classList.add('hidden');
  if (modalImeiStatus) {
    modalImeiStatus.textContent = '';
  }
  if (modalImeiMessage) {
    modalImeiMessage.textContent = 'Loading device record…';
  }
  if (modalImeiForm) {
    modalImeiForm.classList.add('hidden');
  }
  if (modalImeiInput) {
    modalImeiInput.value = '';
    modalImeiInput.disabled = true;
  }
  if (modalImeiButton) {
    modalImeiButton.disabled = true;
    modalImeiButton.textContent = imeiButtonDefaultText;
  }
  if (modalImeiError) {
    modalImeiError.classList.add('hidden');
    modalImeiError.textContent = '';
  }
  if (modalImeiResult) {
    modalImeiResult.classList.add('hidden');
  }
  if (modalImeiResultList) {
    modalImeiResultList.innerHTML = '';
  }
  if (modalImeiDeviceId) {
    modalImeiDeviceId.textContent = '';
  }
  if (modalImeiCheckedAt) {
    modalImeiCheckedAt.textContent = '';
  }
  if (modalImeiRawDetails) {
    modalImeiRawDetails.classList.add('hidden');
  }
  if (modalImeiRaw) {
    modalImeiRaw.textContent = '';
  }
  isImeiChecking = false;
}

function teardownImeiListener() {
  if (imeiUnsubscribe) {
    imeiUnsubscribe();
    imeiUnsubscribe = null;
  }
  currentDeviceDocId = null;
  currentDeviceDocHasSnapshot = false;
  isImeiChecking = false;
}

function resolveDeviceDocumentId(order) {
  if (!order) {
    return null;
  }
  const candidates = [
    order.deviceDocId,
    order.deviceDocID,
    order.deviceDocumentId,
    order.deviceDocumentID,
    order.deviceDocument,
    order.deviceDocumentPath,
    order.deviceDocPath,
    order.deviceRecordId,
    order.deviceRecordID,
    order.deviceRefId,
    order.deviceRefID,
    order.deviceFirestoreId,
    order.deviceFirestoreID,
    order.deviceFirestoreDocId,
    order.deviceFirestoreDocID,
    order.deviceInventoryId,
    order.deviceInventoryID,
    order.deviceId,
    order.deviceID,
    order.inventoryDeviceId,
    order.inventoryDeviceID,
    order.device?.id,
    order.device?.deviceId,
    order.deviceInfo?.id,
    order.deviceInfo?.deviceId,
    order.deviceStatus?.id,
    order.deviceStatus?.deviceId
  ];
  const sanitize = (value) => {
    if (typeof value !== 'string') {
      return null;
    }
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    const parts = trimmed.split('/');
    return parts[parts.length - 1] || null;
  };
  for (const candidate of candidates) {
    const sanitized = sanitize(candidate);
    if (sanitized) {
      return sanitized;
    }
  }
  return sanitize(order.id) || null;
}

function startImeiListener(order) {
  if (!modalImeiSection) {
    return;
  }
  resetImeiSection();
  teardownImeiListener();
  if (!order) {
    return;
  }
  const orderStatusValue = normalizeStatusValueLocal(order.status);
  const allowOrderEntry = ORDER_RECEIVED_STATUSES.has(orderStatusValue);
  const orderImeiMeta = extractOrderImeiData(order);

  modalImeiSection.classList.remove('hidden');
  if (modalImeiStatus) {
    modalImeiStatus.textContent = orderStatusValue || '';
  }
  if (orderImeiMeta.imeiCheckResult || orderImeiMeta.imeiCheckedAt) {
    renderImeiResult(orderImeiMeta.imeiCheckResult, orderImeiMeta.imeiCheckedAt);
  }
  if (modalImeiInput && orderImeiMeta.imei) {
    modalImeiInput.value = orderImeiMeta.imei;
  }
  if (!db) {
    pendingImeiOrder = order;
    return;
  }
  const deviceDocId = resolveDeviceDocumentId(order);
  if (!deviceDocId) {
    if (allowOrderEntry) {
      const allowInput = !orderImeiMeta.imeiChecked;
      if (modalImeiForm) {
        modalImeiForm.classList.toggle('hidden', !allowInput);
      }
      if (modalImeiMessage) {
        modalImeiMessage.textContent = orderImeiMeta.imeiChecked
          ? 'IMEI check completed.'
          : orderImeiMeta.imei
            ? 'IMEI saved on order. Run the check when ready.'
            : 'Enter the device IMEI to start the check.';
      }
      if (allowInput) {
        if (modalImeiInput && !isImeiChecking) {
          modalImeiInput.disabled = false;
          if (!modalImeiInput.value && orderImeiMeta.imei) {
            modalImeiInput.value = orderImeiMeta.imei;
          }
        }
        if (modalImeiButton && !isImeiChecking) {
          modalImeiButton.disabled = false;
          modalImeiButton.textContent = imeiButtonDefaultText;
        }
      } else {
        if (modalImeiInput) {
          modalImeiInput.disabled = true;
        }
        if (modalImeiButton) {
          modalImeiButton.disabled = true;
          modalImeiButton.textContent = imeiButtonDefaultText;
        }
      }
    } else {
      if (modalImeiMessage) {
        modalImeiMessage.textContent = 'No device record is linked to this order.';
      }
    }
    return;
  }
  currentDeviceDocId = deviceDocId;
  modalImeiSection.classList.remove('hidden');
  if (modalImeiDeviceId) {
    modalImeiDeviceId.textContent = deviceDocId;
  }
  if (modalImeiMessage) {
    modalImeiMessage.textContent = 'Listening for IMEI status…';
  }
  const deviceRef = doc(db, 'devices', deviceDocId);
  imeiUnsubscribe = onSnapshot(
    deviceRef,
    (snapshot) => {
      handleImeiSnapshot(snapshot);
    },
    (error) => {
      console.error('Failed to subscribe to device document', error);
      if (modalImeiMessage) {
        modalImeiMessage.textContent = 'Failed to load device record.';
      }
      if (modalImeiError) {
        modalImeiError.textContent = error?.message || 'Unexpected Firestore error.';
        modalImeiError.classList.remove('hidden');
      }
      if (modalImeiForm) {
        modalImeiForm.classList.add('hidden');
      }
      if (modalImeiButton) {
        modalImeiButton.disabled = true;
        modalImeiButton.textContent = imeiButtonDefaultText;
      }
    }
  );
}

function handleImeiSnapshot(snapshot) {
  if (!modalImeiSection) {
    return;
  }
  if (modalImeiError) {
    modalImeiError.classList.add('hidden');
    modalImeiError.textContent = '';
  }

  const order = currentOrderDetails;
  const orderStatusValue = normalizeStatusValueLocal(order?.status);
  const allowOrderEntry = ORDER_RECEIVED_STATUSES.has(orderStatusValue);
  const orderImeiMeta = extractOrderImeiData(order);

  const snapshotExists = snapshot.exists();
  currentDeviceDocHasSnapshot = snapshotExists;
  const data = snapshotExists ? snapshot.data() || {} : null;
  const deviceStatusValue = normalizeStatusValueLocal(data?.status);
  const allowByDevice = deviceStatusValue === 'received';
  const allowEntry = allowByDevice || allowOrderEntry;
  const imeiChecked = Boolean(data?.imeiChecked || orderImeiMeta.imeiChecked);
  const savedImei = (() => {
    if (typeof data?.imei === 'string' && data.imei.trim()) {
      return data.imei.trim();
    }
    return orderImeiMeta.imei;
  })();

  if (modalImeiStatus) {
    modalImeiStatus.textContent = deviceStatusValue || orderStatusValue || '';
  }

  if (!data) {
    if (allowEntry) {
      const allowInput = !orderImeiMeta.imeiChecked;
      if (modalImeiForm) {
        modalImeiForm.classList.toggle('hidden', !allowInput);
      }
      if (modalImeiMessage) {
        modalImeiMessage.textContent = orderImeiMeta.imeiChecked
          ? 'IMEI check completed.'
          : savedImei
            ? 'IMEI saved on order. Run the check when ready.'
            : 'Enter the device IMEI to start the check.';
      }
      if (allowInput) {
        if (modalImeiInput && !isImeiChecking) {
          modalImeiInput.disabled = false;
          if (!modalImeiInput.value && savedImei) {
            modalImeiInput.value = savedImei;
          }
        }
        if (modalImeiButton && !isImeiChecking) {
          modalImeiButton.disabled = false;
          modalImeiButton.textContent = imeiButtonDefaultText;
        }
      } else {
        if (modalImeiInput && !isImeiChecking) {
          modalImeiInput.disabled = true;
        }
        if (modalImeiButton && !isImeiChecking) {
          modalImeiButton.disabled = true;
          modalImeiButton.textContent = imeiButtonDefaultText;
        }
      }
    } else {
      if (modalImeiForm) {
        modalImeiForm.classList.add('hidden');
      }
      if (modalImeiButton) {
        modalImeiButton.disabled = true;
        modalImeiButton.textContent = imeiButtonDefaultText;
      }
      if (modalImeiInput) {
        modalImeiInput.disabled = true;
      }
      if (modalImeiMessage) {
        modalImeiMessage.textContent = 'No device record found for this order.';
      }
    }

    renderImeiResult(orderImeiMeta.imeiCheckResult || null, orderImeiMeta.imeiCheckedAt || null);
    return;
  }

  if (allowEntry && !imeiChecked) {
    if (modalImeiForm) {
      modalImeiForm.classList.remove('hidden');
    }
    if (modalImeiMessage) {
      modalImeiMessage.textContent = savedImei
        ? 'IMEI saved. Awaiting verification to complete.'
        : 'Enter the device IMEI to start the check.';
    }
    if (!isImeiChecking && modalImeiButton) {
      modalImeiButton.disabled = false;
      modalImeiButton.textContent = imeiButtonDefaultText;
    }
    if (modalImeiInput) {
      if (!isImeiChecking) {
        modalImeiInput.disabled = false;
      }
      if (!isImeiChecking && savedImei && modalImeiInput.value !== savedImei) {
        modalImeiInput.value = savedImei;
      }
    }
  } else {
    if (modalImeiForm) {
      modalImeiForm.classList.add('hidden');
    }
    if (modalImeiButton && !isImeiChecking) {
      modalImeiButton.disabled = true;
      modalImeiButton.textContent = imeiButtonDefaultText;
    }
    if (modalImeiInput && !isImeiChecking) {
      modalImeiInput.disabled = true;
    }
    if (modalImeiMessage) {
      if (!allowEntry) {
        modalImeiMessage.textContent = 'Device status must be “received” before running an IMEI check.';
      } else if (imeiChecked) {
        modalImeiMessage.textContent = 'IMEI check completed.';
      } else if (savedImei) {
        modalImeiMessage.textContent = 'IMEI saved. Awaiting backend verification.';
      } else {
        modalImeiMessage.textContent = 'IMEI entry unavailable for this device.';
      }
    }
  }

  const resultPayload = data.imeiCheckResult || orderImeiMeta.imeiCheckResult || null;
  const checkedAtPayload = data.imeiCheckedAt || orderImeiMeta.imeiCheckedAt || null;
  if (currentOrderDetails) {
    if (resultPayload) {
      currentOrderDetails.imeiCheckResult = resultPayload;
    }
    if (checkedAtPayload) {
      currentOrderDetails.imeiCheckedAt = checkedAtPayload;
    }
    if (typeof imeiChecked === 'boolean') {
      currentOrderDetails.imeiChecked = imeiChecked;
    }
  }
  renderImeiResult(resultPayload, checkedAtPayload);

  if (isImeiChecking && imeiChecked) {
    setImeiCheckingState(false);
  }
}

function renderImeiResult(result, checkedAt) {
  if (!modalImeiResult) {
    return;
  }
  if (!result) {
    modalImeiResult.classList.add('hidden');
    if (modalImeiResultList) {
      modalImeiResultList.innerHTML = '';
    }
    if (modalImeiCheckedAt) {
      modalImeiCheckedAt.textContent = '';
    }
    if (modalImeiRawDetails) {
      modalImeiRawDetails.classList.add('hidden');
    }
    if (modalImeiRaw) {
      modalImeiRaw.textContent = '';
    }
    return;
  }

  if (modalImeiResultList) {
    const rows = [];
    for (const field of IMEI_RESULT_FIELDS) {
      if (!(field.key in result)) {
        continue;
      }
      const value = result[field.key];
      if (value === undefined || value === null || value === '') {
        continue;
      }
      let displayValue = value;
      if (value === true) {
        displayValue = 'Yes';
      } else if (value === false) {
        displayValue = 'No';
      }
      rows.push(
        `<div class="flex items-center justify-between gap-3"><dt class="font-medium text-slate-600">${escapeHtml(field.label)}</dt><dd class="text-right text-slate-800">${escapeHtml(String(displayValue))}</dd></div>`
      );
    }
    modalImeiResultList.innerHTML = rows.length
      ? rows.join('')
      : '<p class="text-sm text-slate-600">No summarized IMEI data available.</p>';
  }

  if (modalImeiCheckedAt) {
    modalImeiCheckedAt.textContent = checkedAt ? formatDateTime(checkedAt) : '';
  }

  if (modalImeiRawDetails) {
    if ('raw' in result && result.raw !== undefined) {
      if (modalImeiRaw) {
        try {
          modalImeiRaw.textContent =
            typeof result.raw === 'string' ? result.raw : JSON.stringify(result.raw, null, 2);
        } catch (error) {
          modalImeiRaw.textContent = String(result.raw);
        }
      }
      modalImeiRawDetails.classList.remove('hidden');
    } else {
      modalImeiRawDetails.classList.add('hidden');
      if (modalImeiRaw) {
        modalImeiRaw.textContent = '';
      }
    }
  }

  modalImeiResult.classList.remove('hidden');
}

function setImeiCheckingState(isLoading) {
  isImeiChecking = isLoading;
  if (modalImeiButton) {
    if (isLoading) {
      modalImeiButton.disabled = true;
      modalImeiButton.textContent = 'Checking…';
    } else {
      const shouldDisable = !modalImeiForm || modalImeiForm.classList.contains('hidden');
      modalImeiButton.disabled = shouldDisable;
      modalImeiButton.textContent = imeiButtonDefaultText;
    }
  }
  if (modalImeiInput) {
    const shouldDisable = isLoading || !modalImeiForm || modalImeiForm.classList.contains('hidden');
    modalImeiInput.disabled = shouldDisable;
  }
}

async function handleImeiSubmit() {
  if (!modalImeiInput || !modalImeiButton) {
    return;
  }
  if (!db) {
    if (modalImeiError) {
      modalImeiError.textContent = 'Firestore is not initialized. Please retry in a moment.';
      modalImeiError.classList.remove('hidden');
    }
    return;
  }

  const imeiValue = (modalImeiInput.value || '').trim();
  if (!IMEI_NUMBER_REGEX.test(imeiValue)) {
    if (modalImeiError) {
      modalImeiError.textContent = 'Enter a valid 15-digit IMEI before checking.';
      modalImeiError.classList.remove('hidden');
    }
    return;
  }

  const orderId = currentOrderDetails?.id || currentOrderDetails?.orderId || null;
  if (!orderId && !currentDeviceDocId) {
    if (modalImeiError) {
      modalImeiError.textContent = 'Order or device record is unavailable for this IMEI check.';
      modalImeiError.classList.remove('hidden');
    }
    return;
  }

  if (modalImeiError) {
    modalImeiError.classList.add('hidden');
    modalImeiError.textContent = '';
  }

  let completed = false;

  try {
    setImeiCheckingState(true);
    if (modalImeiMessage) {
      modalImeiMessage.textContent = 'Checking IMEI…';
    }

    const pendingWrites = [];
    if (currentDeviceDocId && currentDeviceDocHasSnapshot) {
      const deviceRef = doc(db, 'devices', currentDeviceDocId);
      pendingWrites.push(
        setDoc(deviceRef, { imei: imeiValue, imeiChecked: false }, { merge: true }).catch((error) => {
          if (
            error &&
            (error.code === 'permission-denied' || /Missing or insufficient permissions/i.test(error.message || ''))
          ) {
            return setDoc(deviceRef, { imei: imeiValue }, { merge: true });
          }
          throw error;
        })
      );
    }

    if (orderId) {
      const orderRef = doc(db, 'orders', orderId);
      pendingWrites.push(
        setDoc(orderRef, { imei: imeiValue, imeiChecked: false }, { merge: true }).catch((error) => {
          if (
            error &&
            (error.code === 'permission-denied' || /Missing or insufficient permissions/i.test(error.message || ''))
          ) {
            return setDoc(orderRef, { imei: imeiValue }, { merge: true });
          }
          throw error;
        })
      );
    }

    await Promise.all(pendingWrites);

    if (currentOrderDetails) {
      currentOrderDetails.imei = imeiValue;
      currentOrderDetails.imeiChecked = false;
    }

    const payload = {
      imei: imeiValue,
      deviceId: currentDeviceDocHasSnapshot ? currentDeviceDocId : undefined,
      orderId: orderId || undefined,
      carrier:
        currentOrderDetails?.carrier ||
        currentOrderDetails?.device?.carrier ||
        currentOrderDetails?.deviceInfo?.carrier ||
        undefined,
      brand:
        currentOrderDetails?.brand ||
        currentOrderDetails?.device?.brand ||
        currentOrderDetails?.deviceInfo?.brand ||
        undefined,
      deviceType:
        currentOrderDetails?.deviceType ||
        currentOrderDetails?.category ||
        currentOrderDetails?.device?.deviceType ||
        undefined,
    };

    const response = await fetch('/api/checkImei', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      let message = `IMEI check failed with status ${response.status}.`;
      try {
        const errorBody = await response.json();
        if (errorBody && errorBody.error) {
          message = errorBody.error;
        }
      } catch (_) {}
      throw new Error(message);
    }


    completed = true;
    if (modalImeiMessage) {
      modalImeiMessage.textContent = 'IMEI check requested. Results will appear once the device record updates.';
    }
  } catch (error) {
    console.error('IMEI check failed', error);
    if (modalImeiError) {
      modalImeiError.textContent = error?.message || 'Failed to check IMEI. Please try again.';
      modalImeiError.classList.remove('hidden');
    }
    setImeiCheckingState(false);
  } finally {
    if (!completed) {
      setImeiCheckingState(false);
    }
  }
}

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
const isLabelStatus =
  normalizedStatus === 'kit_on_the_way_to_us' ||
  normalizedStatus === 'phone_on_the_way' ||
  normalizedStatus === 'kit_delivered' ||
  isLabelGenerationStage(order);
if (!isLabelStatus) {
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

function getClearDataOptions(order) {
const options = [];
if (!order || typeof order !== 'object') {
return options;
}

const labels = order.shipEngineLabels && typeof order.shipEngineLabels === 'object'
? order.shipEngineLabels
: {};
const seenLabelKeys = new Set();

Object.entries(labels).forEach(([key, info]) => {
if (!key) return;
const normalizedKey = key.toString().toLowerCase();
seenLabelKeys.add(normalizedKey);
const displayName = (info && (info.displayName || formatLabelDisplayNameKey(key))) || formatLabelDisplayNameKey(key);
const trackingValue = info?.trackingNumber || info?.tracking_number || null;
options.push({
id: `shipLabel:${normalizedKey}`,
label: `Remove ${displayName}`,
description: 'Deletes the saved ShipEngine label metadata and download link so a new label can be generated.',
detail: trackingValue ? `Tracking: ${trackingValue}` : null,
});
});

if (!seenLabelKeys.has('primary') && (order.shipEngineLabelId || order.uspsLabelUrl)) {
options.push({
id: 'shipLabel:primary',
label: 'Remove primary shipping label',
description: 'Clears the stored USPS label link and ShipEngine metadata for the primary label.',
detail: order.trackingNumber ? `Tracking: ${order.trackingNumber}` : null,
});
}

if (!seenLabelKeys.has('outboundkit') && order.outboundLabelUrl) {
const outboundLabelName = formatLabelDisplayNameKey('outboundkit');
options.push({
id: 'shipLabel:outboundkit',
label: outboundLabelName ? `Remove ${outboundLabelName}` : 'Remove outbound kit label',
description: 'Deletes the saved outbound kit label metadata and download link.',
detail: null,
});
}

if (!seenLabelKeys.has('inbounddevice') && order.inboundLabelUrl) {
const inboundLabelName = formatLabelDisplayNameKey('inbounddevice');
options.push({
id: 'shipLabel:inbounddevice',
label: inboundLabelName ? `Remove ${inboundLabelName}` : 'Remove inbound device label',
description: 'Deletes the saved inbound device label metadata and download link.',
detail: null,
});
}

if (order.trackingNumber) {
options.push({
id: 'tracking:primary',
label: 'Clear primary tracking number',
description: 'Removes the main tracking number stored on the order record.',
detail: `Tracking: ${order.trackingNumber}`,
});
}

if (order.outboundTrackingNumber) {
options.push({
id: 'tracking:outbound',
label: 'Clear outbound kit tracking number',
description: 'Removes the outbound shipping kit tracking number saved on this order.',
detail: `Tracking: ${order.outboundTrackingNumber}`,
});
}

if (order.inboundTrackingNumber) {
options.push({
id: 'tracking:inbound',
label: 'Clear inbound device tracking number',
description: 'Removes the inbound device tracking number saved on this order.',
detail: `Tracking: ${order.inboundTrackingNumber}`,
});
}

if (order.returnLabelUrl || order.returnTrackingNumber) {
options.push({
id: 'returnLabel',
label: 'Remove return label',
description: 'Deletes the return label download link and tracking number that were sent to the customer.',
detail: order.returnTrackingNumber ? `Tracking: ${order.returnTrackingNumber}` : null,
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

function createClearDataOptionElement(option) {
const wrapper = document.createElement('label');
wrapper.className = 'flex items-start gap-3 p-3 border rounded-md bg-white border-amber-200 hover:border-amber-300 transition-colors duration-150';

const checkbox = document.createElement('input');
checkbox.type = 'checkbox';
checkbox.className = 'mt-1 h-4 w-4 text-amber-600 focus:ring-amber-500 border-gray-300 rounded clear-data-checkbox';
checkbox.dataset.target = option.id;
checkbox.value = option.id;

const content = document.createElement('div');
content.className = 'flex-1';

const title = document.createElement('div');
title.className = 'font-semibold text-sm text-slate-800';
title.textContent = option.label;
content.appendChild(title);

if (option.detail) {
const detail = document.createElement('div');
detail.className = 'text-xs text-slate-500 mt-1';
detail.textContent = option.detail;
content.appendChild(detail);
}

if (option.description) {
const description = document.createElement('div');
description.className = option.detail ? 'text-xs text-slate-500 mt-1' : 'text-xs text-slate-500';
description.textContent = option.description;
content.appendChild(description);
}

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

async function requestClearOrderData(orderId, selections) {
const response = await fetch(`${BACKEND_BASE_URL}/orders/${orderId}/clear-data`, {
method: 'POST',
headers: { 'Content-Type': 'application/json' },
body: JSON.stringify({ selections }),
});

if (!response.ok) {
const errorText = await response.text();
throw new Error(errorText || `Failed to clear data: ${response.status}`);
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

function resetClearDataMessage() {
if (!clearDataMessage) return;
clearDataMessage.textContent = '';
clearDataMessage.className = 'mt-3 text-sm hidden';
}

function hideClearDataForm() {
if (clearDataFormContainer) {
clearDataFormContainer.classList.add('hidden');
}
if (clearDataOptionsContainer) {
clearDataOptionsContainer.innerHTML = '';
}
resetClearDataMessage();
}

function showClearDataForm(order) {
if (!clearDataFormContainer || !clearDataOptionsContainer) {
displayModalMessage('Clear data controls are not available on this page.', 'error');
return;
}

resetClearDataMessage();
clearDataOptionsContainer.innerHTML = '';

const options = getClearDataOptions(order);
if (!options.length) {
displayModalMessage('No saved shipping or tracking data is available to clear for this order.', 'info');
return;
}

if (cancelOrderFormContainer) {
cancelOrderFormContainer.classList.add('hidden');
}
if (voidLabelFormContainer) {
voidLabelFormContainer.classList.add('hidden');
}
if (manualFulfillmentFormContainer) {
manualFulfillmentFormContainer.classList.add('hidden');
}
if (deleteConfirmationContainer) {
deleteConfirmationContainer.classList.add('hidden');
}
if (reofferFormContainer) {
reofferFormContainer.classList.add('hidden');
}

options.forEach(option => {
clearDataOptionsContainer.appendChild(createClearDataOptionElement(option));
});

modalActionButtons.classList.add('hidden');
clearDataFormContainer.classList.remove('hidden');

if (submitClearDataBtn) {
submitClearDataBtn.onclick = () => handleClearDataSubmit(order.id);
}
if (cancelClearDataBtn) {
cancelClearDataBtn.onclick = () => {
hideClearDataForm();
modalActionButtons.classList.remove('hidden');
if (order && order.id) {
openOrderDetailsModal(order.id);
}
};
}
}

async function handleClearDataSubmit(orderId) {
const selectedTargets = Array.from(document.querySelectorAll('.clear-data-checkbox:checked'))
.map(checkbox => checkbox.dataset.target)
.filter(Boolean);

if (!selectedTargets.length) {
if (clearDataMessage) {
clearDataMessage.textContent = 'Please select at least one item to clear.';
clearDataMessage.className = 'mt-3 text-sm text-red-600';
}
return;
}

modalLoadingMessage.classList.remove('hidden');
if (clearDataFormContainer) {
clearDataFormContainer.classList.add('hidden');
}
resetClearDataMessage();

try {
const result = await requestClearOrderData(orderId, selectedTargets);
const summary = result?.message || 'Selected data cleared successfully.';
displayModalMessage(summary, 'success');
openOrderDetailsModal(orderId);
} catch (error) {
console.error('Error clearing stored data:', error);
displayModalMessage(`Error: ${error.message}`, 'error');
modalActionButtons.classList.remove('hidden');
} finally {
modalLoadingMessage.classList.add('hidden');
}
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

const AUTO_REQUOTE_INELIGIBLE_STATUSES = new Set([
'completed',
'cancelled',
'return-label-generated',
're-offered-accepted',
're-offered-declined',
're-offered-auto-accepted',
]);

function getLastCustomerEmailTimestamp(order = {}) {
if (!order || typeof order !== 'object') {
return null;
}

const timestampCandidates = [
order.lastCustomerEmailSentAt,
order.lastReminderSentAt,
order.expiringReminderSentAt,
order.kitReminderSentAt,
order.reminderSentAt,
order.reminderEmailSentAt,
order.lastReminderAt,
order.reviewRequestSentAt,
];

let latest = 0;
timestampCandidates.forEach((value) => {
const ms = extractTimestampMillis(value);
if (ms && ms > latest) {
latest = ms;
}
});

return latest > 0 ? latest : null;
}

function hasAutoRequoteCompleted(order = {}) {
const completedAt = order?.autoRequote?.completedAt;
return Boolean(extractTimestampMillis(completedAt));
}

function isEligibleForAutoRequote(order = {}) {
  if (!order || !order.id) {
    return false;
  }

  const status = (order.status || '').toString().toLowerCase();
  if (!status || AUTO_REQUOTE_INELIGIBLE_STATUSES.has(status)) {
    return false;
  }

  if (hasAutoRequoteCompleted(order)) {
    return false;
  }

  const payoutAmount = Number(getOrderPayout(order));
  if (!Number.isFinite(payoutAmount) || payoutAmount <= 0) {
    return false;
  }

  return true;
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

const columnHeader = document.createElement('div');
columnHeader.className = 'reoffer-pricing-columns';
const conditionHeading = document.createElement('span');
conditionHeading.textContent = 'Condition';
const priceHeading = document.createElement('span');
priceHeading.textContent = 'Price';
columnHeader.appendChild(conditionHeading);
columnHeader.appendChild(priceHeading);
priceList.appendChild(columnHeader);

Object.entries(conditionMap).forEach(([conditionKey, value]) => {
const button = document.createElement('button');
button.type = 'button';
button.dataset.price = value;
button.className = 'reoffer-price-button w-full flex items-center justify-between px-3 py-2 border border-slate-200 rounded-md bg-white text-left hover:border-blue-400 hover:text-blue-600 transition';

const conditionLabel = document.createElement('span');
conditionLabel.classList.add('reoffer-price-label');
conditionLabel.textContent = formatConditionLabel(conditionKey);
const amount = document.createElement('span');
amount.className = 'reoffer-price-amount font-semibold';
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

  // 2. Generate the custom info + bag labels client-side
  const orderInfoLabelBytes = await createOrderInfoLabelPdf(order);

  // Merge shipping labels followed by the info and bag labels
  const mergedPdf = await PDFLib.PDFDocument.create();

  for (const bytes of labelPdfBuffers) {
    const pdf = await PDFLib.PDFDocument.load(bytes);
    const copied = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
    copied.forEach(p => mergedPdf.addPage(p));
  }

  if (orderInfoLabelBytes) {
    const infoPdf = await PDFLib.PDFDocument.load(orderInfoLabelBytes);
    const copiedInfo = await mergedPdf.copyPages(infoPdf, infoPdf.getPageIndices());
    copiedInfo.forEach((page) => mergedPdf.addPage(page));
  }

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
  'kit_on_the_way_to_customer': ordersData.filter(o => o.status === 'kit_on_the_way_to_customer' || o.status === 'kit_in_transit').length,
  'kit_delivered': ordersData.filter(o => o.status === 'kit_delivered').length,
  'kit_on_the_way_to_us': ordersData.filter(o => o.status === 'kit_on_the_way_to_us').length,
  'delivered_to_us': ordersData.filter(o => o.status === 'delivered_to_us').length,
  'label_generated': ordersData.filter(order => isLabelGenerationStage(order)).length,
  'emailed': ordersData.filter(order => isBalanceEmailStatus(order)).length,
  'phone_on_the_way': ordersData.filter(o => o.status === 'phone_on_the_way').length,
  'phone_on_the_way_to_us': ordersData.filter(o => o.status === 'phone_on_the_way_to_us').length,
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
if (kitOnTheWayToCustomerCount) {
  kitOnTheWayToCustomerCount.textContent = statusCounts['kit_on_the_way_to_customer'];
}
if (kitDeliveredCount) {
  kitDeliveredCount.textContent = statusCounts['kit_delivered'];
}
if (kitOnTheWayToUsCount) {
  kitOnTheWayToUsCount.textContent = statusCounts['kit_on_the_way_to_us'];
}
if (deliveredToUsCount) {
  deliveredToUsCount.textContent = statusCounts['delivered_to_us'];
}
if (labelGeneratedCount) {
  labelGeneratedCount.textContent = statusCounts['label_generated'];
}
if (emailedCount) {
  emailedCount.textContent = statusCounts['emailed'];
}
if (phoneOnTheWayCount) {
  phoneOnTheWayCount.textContent = statusCounts['phone_on_the_way'];
}
if (phoneOnTheWayToUsCount) {
  phoneOnTheWayToUsCount.textContent = statusCounts['phone_on_the_way_to_us'];
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

function normalizeShippingPreference(order = {}) {
  return (order.shippingPreference || order.shipping_preference || order.shippingPreferenceValue || '')
    .toString()
    .trim()
    .toLowerCase();
}

function normalizeStatus(order = {}) {
  return (order.status || '')
    .toString()
    .trim()
    .toLowerCase();
}

function extractStatusCandidate(statusOrOrder = {}) {
  if (typeof statusOrOrder === 'string') {
    return statusOrOrder;
  }
  if (statusOrOrder && typeof statusOrOrder === 'object') {
    return (
      statusOrOrder.status ||
      statusOrOrder.currentStatus ||
      statusOrOrder.statusValue ||
      statusOrOrder.status_value ||
      ''
    );
  }
  return '';
}

function isStatusPastReceived(statusOrOrder = {}) {
  const rawStatus = extractStatusCandidate(statusOrOrder);
  const normalized = (rawStatus || '')
    .toString()
    .trim()
    .toLowerCase();

  if (!normalized) {
    return false;
  }

  if (normalized === 'emailed') {
    if (statusOrOrder && typeof statusOrOrder === 'object') {
      return isBalanceEmailStatus(statusOrOrder);
    }
    return false;
  }

  if (TRACKING_POST_RECEIVED_STATUSES.has(normalized)) {
    return true;
  }

  const underscored = normalized.replace(/[\s-]+/g, '_');
  if (TRACKING_POST_RECEIVED_STATUSES.has(underscored)) {
    return true;
  }

  const hyphenated = normalized.replace(/[\s_]+/g, '-');
  if (TRACKING_POST_RECEIVED_STATUSES.has(hyphenated)) {
    return true;
  }

  if (
    normalized.includes('reoffer') ||
    normalized.includes('re-offer') ||
    normalized.includes('re_offer')
  ) {
    return true;
  }

  if (
    normalized.includes('return label') ||
    normalized.includes('return-label') ||
    normalized.includes('return_label') ||
    normalized.includes('returnlabel')
  ) {
    return true;
  }

  if (
    normalized.includes('received') &&
    !normalized.includes('not_received') &&
    !normalized.includes('kit')
  ) {
    return true;
  }

  if (normalized.includes('completed')) {
    return true;
  }

  return false;
}

function matchesKitTrackingHints(order = {}) {
  const preference = normalizeShippingPreference(order);
  if (preference) {
    if (preference === 'shipping kit requested' || preference === 'ship_kit') {
      return true;
    }
    if (preference.includes('kit')) {
      return true;
    }
  }

  const status = normalizeStatus(order);
  if (KIT_STATUS_HINTS.has(status)) {
    return true;
  }

  return status.includes('kit');
}

function matchesEmailTrackingHints(order = {}) {
  const preference = normalizeShippingPreference(order);
  if (preference) {
    if (preference === 'email label requested' || preference === 'email_label') {
      return true;
    }
    if (preference.includes('email')) {
      return true;
    }
    if (preference.includes('label')) {
      return true;
    }
  }

  const status = normalizeStatus(order);
  if (status === 'emailed') {
    return isLegacyEmailLabelStatus(order);
  }
  if (EMAIL_STATUS_HINTS.has(status)) {
    return true;
  }

  if (status.includes('email') || status.includes('label')) {
    return !isBalanceEmailStatus(order);
  }

  return false;
}

function isBulkKitRefreshCandidate(order = {}) {
  if (isStatusPastReceived(order)) {
    return false;
  }
  return matchesKitTrackingHints(order);
}

function isBulkEmailLabelRefreshCandidate(order = {}) {
  if (isStatusPastReceived(order)) {
    return false;
  }
  return matchesEmailTrackingHints(order);
}

function hasTrackingValue(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function labelsContainTrackingNumber(labels) {
  if (!labels || typeof labels !== 'object') {
    return false;
  }
  return Object.values(labels).some((entry) => {
    if (!entry || typeof entry !== 'object') {
      return false;
    }
    return hasTrackingValue(entry.trackingNumber || entry.tracking_number);
  });
}

function hasKitTrackingNumbers(order = {}) {
  if (!order || typeof order !== 'object') {
    return false;
  }
  if (
    hasTrackingValue(order.outboundTrackingNumber) ||
    hasTrackingValue(order.inboundTrackingNumber) ||
    hasTrackingValue(order.trackingNumber)
  ) {
    return true;
  }
  if (
    order.kitTrackingStatus &&
    hasTrackingValue(order.kitTrackingStatus.trackingNumber || order.kitTrackingStatus.tracking_number)
  ) {
    return true;
  }
  if (labelsContainTrackingNumber(order.shipEngineLabels)) {
    return true;
  }
  return false;
}

function hasEmailTrackingNumbers(order = {}) {
  if (!order || typeof order !== 'object') {
    return false;
  }
  if (
    hasTrackingValue(order.trackingNumber) ||
    hasTrackingValue(order.inboundTrackingNumber) ||
    hasTrackingValue(order.labelTrackingNumber) ||
    hasTrackingValue(order.uspsTrackingNumber) ||
    hasTrackingValue(order.uspsLabelTrackingNumber)
  ) {
    return true;
  }
  if (
    order.labelTrackingStatus &&
    hasTrackingValue(order.labelTrackingStatus.trackingNumber || order.labelTrackingStatus.tracking_number)
  ) {
    return true;
  }
  if (labelsContainTrackingNumber(order.shipEngineLabels)) {
    return true;
  }
  return false;
}

const MAX_CONCURRENT_TRACKING_REQUESTS = 4;

async function refreshTrackingForOrders(type, button) {
  const typeLabel = type === 'kit' ? 'kit' : 'email label';
  const sourceOrders = currentFilteredOrders.length ? currentFilteredOrders : allOrders;

  if (!Array.isArray(sourceOrders) || sourceOrders.length === 0) {
    window.alert(`No ${typeLabel} orders are loaded yet. Try again once orders appear.`);
    return;
  }

  const hintMatcher = type === 'kit' ? matchesKitTrackingHints : matchesEmailTrackingHints;
  const candidateOrders = sourceOrders.filter(hintMatcher);

  if (!candidateOrders.length) {
    window.alert(`There are no ${typeLabel} orders available to refresh right now.`);
    return;
  }

  const relevantOrders = candidateOrders.filter(order => !isStatusPastReceived(order));
  const statusLockedCount = candidateOrders.length - relevantOrders.length;

  if (!relevantOrders.length) {
    window.alert(`All matching ${typeLabel} orders have already been marked as received/completed.`);
    return;
  }

  const trackingCheck = type === 'kit' ? hasKitTrackingNumbers : hasEmailTrackingNumbers;
  const eligibleOrders = relevantOrders.filter(trackingCheck);
  const missingTrackingCount = relevantOrders.length - eligibleOrders.length;

  if (!eligibleOrders.length) {
    window.alert(`None of the ${typeLabel} orders have tracking numbers on file yet.`);
    return;
  }

  const confirmMessage = `Refresh tracking for ${eligibleOrders.length} ${typeLabel} order${eligibleOrders.length === 1 ? '' : 's'}?`;
  const confirmed = window.confirm(confirmMessage);
  if (!confirmed) {
    return;
  }

  let originalHtml = '';
  if (button) {
    originalHtml = button.innerHTML;
    button.disabled = true;
  }

  let successCount = 0;
  let skippedCount = statusLockedCount + Math.max(0, missingTrackingCount);
  const skippedDetails = [];
  if (statusLockedCount > 0) {
    skippedDetails.push(`${statusLockedCount} order${statusLockedCount === 1 ? '' : 's'} skipped: already received or completed.`);
  }
  if (missingTrackingCount > 0) {
    skippedDetails.push(`${missingTrackingCount} order${missingTrackingCount === 1 ? '' : 's'} skipped: no tracking numbers on file.`);
  }
  let failureCount = 0;
  const failureDetails = [];

  console.groupCollapsed(`Bulk ${typeLabel} tracking refresh`);
  if (statusLockedCount > 0) {
    console.log(`${statusLockedCount} ${typeLabel} order(s) skipped because they were already received/completed.`);
  }
  console.log(`Found ${eligibleOrders.length} ${typeLabel} order(s) with tracking numbers.`);

  let processedCount = 0;

  const updateButtonProgress = () => {
    if (!button) {
      return;
    }
    button.innerHTML = `<i class="fas fa-spinner fa-spin"></i><span>Refreshing ${processedCount} of ${eligibleOrders.length}…</span>`;
  };

  const processOrder = async (order) => {
    if (!order || !order.id) {
      skippedCount += 1;
      skippedDetails.push('Skipped an order without an ID.');
      processedCount += 1;
      updateButtonProgress();
      return;
    }

    const logLabel = `order-${order.id}`;
    console.groupCollapsed(`Refreshing ${logLabel}`);
    console.log(`refreshing ${logLabel}`);

    try {
      const response = await fetch(REFRESH_TRACKING_FUNCTION_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: order.id, type }),
      });

      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(payload?.error || response.statusText || 'Request failed');
      }

      if (payload && payload.skipped) {
        skippedCount += 1;
        if (payload.reason) {
          skippedDetails.push(`${order.id}: ${payload.reason}`);
        }
        console.log(`Skipped ${logLabel}: ${payload.reason || 'No tracking available'}`);
        return;
      }

      successCount += 1;
      console.log(`Completed ${logLabel}`);
    } catch (error) {
      failureCount += 1;
      failureDetails.push(`${order.id}: ${error.message}`);
      console.error(`Failed to refresh ${typeLabel} tracking for order ${order.id}:`, error);
    } finally {
      console.log('Complete');
      console.groupEnd();
      processedCount += 1;
      updateButtonProgress();
    }
  };

  const workerCount = Math.min(MAX_CONCURRENT_TRACKING_REQUESTS, eligibleOrders.length);
  updateButtonProgress();

  let nextIndex = 0;
  const workers = Array.from({ length: workerCount }, () => (async function run() {
    while (nextIndex < eligibleOrders.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      await processOrder(eligibleOrders[currentIndex], currentIndex);
    }
  })());

  await Promise.all(workers);

  console.groupEnd();

  if (button) {
    button.disabled = false;
    button.innerHTML = originalHtml;
  }

  let summary = `Finished refreshing ${typeLabel} tracking for ${eligibleOrders.length} order${eligibleOrders.length === 1 ? '' : 's'}.`;
  summary += `\nSuccessful updates: ${successCount}`;
  summary += `\nSkipped: ${skippedCount}`;
  summary += `\nFailed: ${failureCount}`;

  if (skippedDetails.length) {
    const detailSample = skippedDetails.slice(0, 5).join('\n');
    summary += `\nSkipped details:\n${detailSample}`;
    if (skippedDetails.length > 5) {
      summary += `\n…and ${skippedDetails.length - 5} more.`;
    }
  }

  if (failureDetails.length) {
    const detailSample = failureDetails.slice(0, 5).join('\n');
    summary += `\nFailures:\n${detailSample}`;
    if (failureDetails.length > 5) {
      summary += `\n…and ${failureDetails.length - 5} more.`;
    }
  }

  window.alert(summary);
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
const statusKey = resolveReminderStatusKey(order);

if (sendReminderBtn) {
if (orderId && REMINDER_ELIGIBLE_STATUSES.includes(statusKey)) {
sendReminderBtn.classList.remove('hidden');
sendReminderBtn.onclick = () => handleSendReminder(orderId);
} else {
sendReminderBtn.classList.add('hidden');
sendReminderBtn.onclick = null;
}
}

if (sendExpiringReminderBtn) {
if (orderId && EXPIRING_REMINDER_STATUSES.includes(statusKey)) {
sendExpiringReminderBtn.classList.remove('hidden');
sendExpiringReminderBtn.onclick = () => handleSendExpiringReminder(orderId);
} else {
sendExpiringReminderBtn.classList.add('hidden');
sendExpiringReminderBtn.onclick = null;
}
}

if (sendKitReminderBtn) {
if (orderId && KIT_REMINDER_STATUSES.includes(status) && isBulkKitRefreshCandidate(order)) {
sendKitReminderBtn.classList.remove('hidden');
sendKitReminderBtn.onclick = () => handleSendKitReminder(orderId);
} else {
sendKitReminderBtn.classList.add('hidden');
sendKitReminderBtn.onclick = null;
}
}
}

function renderOrders() {
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
if (paginationControls) {
paginationControls.classList.add('hidden');
}
lastRenderedOrderIds = [];
updateBulkSelectionUI();
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

lastRenderedOrderIds = ordersToDisplay.map(order => order.id);

ordersToDisplay.forEach(order => {
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

const trackingNumber = order.trackingNumber;
const trackingCellContent = trackingNumber
? `<a href="${USPS_TRACKING_URL}${trackingNumber}" target="_blank" class="text-blue-600 hover:text-blue-800 underline">${trackingNumber}</a>`
: 'N/A';

const isSelected = selectedOrderIds.has(order.id);

row.innerHTML = `
<td class="select-column">
  <input type="checkbox" class="order-select-checkbox" data-order-id="${order.id}" aria-label="Select order ${order.id}" ${isSelected ? 'checked' : ''}>
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

const selectionCheckbox = row.querySelector('.order-select-checkbox');
if (selectionCheckbox) {
selectionCheckbox.addEventListener('change', (event) => {
if (event.target.checked) {
selectedOrderIds.add(order.id);
} else {
selectedOrderIds.delete(order.id);
}
updateBulkSelectionUI();
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

updateBulkSelectionUI();
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

const filteredEntries = entries.filter((entry) => {
const message = (entry?.message || '').toLowerCase();
return !message.startsWith('inbound label tracking synchronized');
});

if (!filteredEntries.length) {
modalActivityLog.classList.add('hidden');
modalActivityLogList.innerHTML = '';
return;
}

filteredEntries.sort((a, b) => {
const aDate = coerceTimestampToDate(a.at) || new Date(0);
const bDate = coerceTimestampToDate(b.at) || new Date(0);
return bDate.getTime() - aDate.getTime();
});

modalActivityLogList.innerHTML = '';
filteredEntries.forEach(entry => {
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
const normalizedStatus = (status || '').toLowerCase();
const normalizedPreference = (preference || '').toString().toLowerCase();

const trackingSummary = [
  order.labelTrackingStatusDescription,
  order.labelTrackingStatus,
  order.kitTrackingStatusDescription,
  order.kitTrackingStatus,
]
  .filter(Boolean)
  .map((value) => value.toString().toLowerCase())
  .join(' | ');

const hasEta = Boolean(order.labelTrackingEstimatedDelivery || order.kitTrackingEstimatedDelivery);
const isInTransit = /in transit|out for delivery|arriving/i.test(trackingSummary);
const acceptedWithoutEta = !isInTransit && !hasEta && /accepted/i.test(trackingSummary);

if (normalizedStatus === 'order_pending') {
return 'Order Pending';
}
if (normalizedStatus === 'shipping_kit_requested') {
return 'Shipping Kit Requested';
}
if (KIT_PRINT_PENDING_STATUSES.includes(normalizedStatus)) {
return 'Needs Printing';
}
if (normalizedStatus === 'kit_sent') {
return 'Kit Sent';
}
if (normalizedStatus === 'kit_on_the_way_to_customer' || normalizedStatus === 'kit_in_transit') {
return 'Kit On The Way To Customer';
}
if (normalizedStatus === 'kit_delivered') {
return 'Kit Delivered';
}
if (normalizedStatus === 'kit_on_the_way_to_us') {
return isInTransit || hasEta ? 'Pending Return To Us' : 'Kit Delivered';
}
if (normalizedStatus === 'delivered_to_us') {
return 'Delivered To Us';
}
const legacyEmailStatus = normalizedStatus === 'emailed' && isLegacyEmailLabelStatus(order);
if (normalizedStatus === 'label_generated' || legacyEmailStatus) {
const isEmailPreference = normalizedPreference === 'email label requested';
if (isEmailPreference) {
  if (acceptedWithoutEta) {
    return 'Label Generated';
  }
  return isInTransit || hasEta ? 'Phone On The Way To Us' : 'Label Generated';
}
return 'Kit Sent';
}
if (normalizedStatus === 'emailed') {
return 'Balance Email Sent';
}
if (normalizedStatus === 'phone_on_the_way' || normalizedStatus === 'phone_on_the_way_to_us') {
if (acceptedWithoutEta) {
  return 'Label Generated';
}
return isInTransit || hasEta ? 'Phone On The Way To Us' : 'Label Generated';
}
// Fallback for other statuses
return normalizedStatus.replace(/_/g, ' ').split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
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



async function updateOrderStatusInline(orderId, status, options = {}) {
  try {
    const payload = { status };
    if (options.notifyCustomer === false) {
      payload.notifyCustomer = false;
    }
    if (options.body && typeof options.body === 'object') {
      Object.assign(payload, options.body);
    }

    const response = await fetch(`${BACKEND_BASE_URL}/orders/${orderId}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const rawBody = await response.text();
    let data = {};
    if (rawBody) {
      try {
        data = JSON.parse(rawBody);
      } catch {
        data = { message: rawBody };
      }
    }

    if (!response.ok) {
      const errorMessage = data.error || data.message || `Failed to update order status to ${status}.`;
      throw new Error(errorMessage);
    }

    return data;
  } catch (error) {
    console.error(`Failed to update status for order ${orderId}:`, error);
    throw error;
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
case 'kit_in_transit':
case 'kit_on_the_way_to_customer':
return 'bg-orange-100 text-orange-800 status-bubble';
case 'kit_delivered':
return 'bg-emerald-100 text-emerald-800 status-bubble';
case 'kit_on_the_way_to_us':
return 'bg-teal-100 text-teal-800 status-bubble';
case 'label_generated': return 'bg-yellow-100 text-yellow-800 status-bubble';
case 'emailed': return 'bg-yellow-100 text-yellow-800 status-bubble';
case 'phone_on_the_way':
case 'phone_on_the_way_to_us':
  return 'bg-sky-100 text-sky-800 status-bubble';
case 'received': return 'bg-green-100 text-green-800 status-bubble';
case 'completed': return 'bg-purple-100 text-purple-800 status-bubble';
case 're-offered-pending': return 'bg-orange-100 text-orange-800 status-bubble';
case 're-offered-accepted': return 'bg-teal-100 text-teal-800 status-bubble';
case 're-offered-auto-accepted': return 'bg-teal-100 text-teal-800 status-bubble';
case 'requote_accepted': return 'bg-teal-100 text-teal-800 status-bubble';
case 're-offered-declined': return 'bg-red-100 text-red-800 status-bubble';
case 'return-label-generated': return 'bg-slate-200 text-slate-800 status-bubble';
case 'cancelled': return 'bg-gray-200 text-gray-700 status-bubble';
default: return 'bg-slate-100 text-slate-700 status-bubble';
}
}

function getStatusToneClasses(status) {
  const toneClass = getStatusClass(status);
  if (!toneClass) {
    return 'bg-slate-100 text-slate-700';
  }

  return toneClass
    .split(' ')
    .filter((cls) => cls && cls !== 'status-bubble')
    .join(' ');
}

function getStatusDisplayLabel(status, order) {
  if (STATUS_LABEL_OVERRIDES[status]) {
    return STATUS_LABEL_OVERRIDES[status];
  }
  const display = formatStatus({ status, shippingPreference: order?.shippingPreference });
  if (display && typeof display === 'string') {
    return display;
  }
  return status
    .replace(/[_-]+/g, ' ')
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

let isStatusDropdownOpen = false;

function closeStatusDropdown() {
  if (!modalStatusDropdown) {
    return;
  }
  modalStatusDropdown.classList.add('hidden');
  if (modalStatusCaret) {
    modalStatusCaret.classList.remove('rotate-180');
  }
  isStatusDropdownOpen = false;
}

function openStatusDropdown() {
  if (!modalStatusDropdown) {
    return;
  }
  modalStatusDropdown.classList.remove('hidden');
  if (modalStatusCaret) {
    modalStatusCaret.classList.add('rotate-180');
  }
  isStatusDropdownOpen = true;
}

function toggleStatusDropdown(forceState) {
  if (!modalStatusDropdown) {
    return;
  }
  const shouldOpen =
    typeof forceState === 'boolean' ? forceState : modalStatusDropdown.classList.contains('hidden');
  if (shouldOpen) {
    openStatusDropdown();
  } else {
    closeStatusDropdown();
  }
}

function renderStatusDropdown(order) {
  if (!modalStatusDropdown) {
    return;
  }

  modalStatusDropdown.innerHTML = '';

  STATUS_DROPDOWN_OPTIONS.forEach((statusKey) => {
    const optionLabel = getStatusDisplayLabel(statusKey, order);
    const optionButton = document.createElement('button');
    optionButton.type = 'button';
    optionButton.className = 'flex w-full items-center justify-between gap-3 px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 transition-colors';

    const badge = document.createElement('span');
    badge.className = `inline-flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-full ${getStatusToneClasses(statusKey)}`;
    badge.textContent = optionLabel;

    optionButton.appendChild(badge);

    if (statusKey === order.status) {
      optionButton.classList.add('bg-slate-100', 'cursor-default');
      const currentLabel = document.createElement('span');
      currentLabel.className = 'text-xs text-slate-400';
      currentLabel.textContent = 'Current';
      optionButton.appendChild(currentLabel);
      optionButton.disabled = true;
    } else {
      optionButton.addEventListener('click', () => handleStatusDropdownSelection(statusKey));
    }

    modalStatusDropdown.appendChild(optionButton);
  });
}

async function handleStatusDropdownSelection(newStatus) {
  if (!currentOrderDetails) {
    closeStatusDropdown();
    return;
  }

  if (newStatus === currentOrderDetails.status) {
    closeStatusDropdown();
    return;
  }

  try {
    if (modalLoadingMessage) {
      modalLoadingMessage.classList.remove('hidden');
    }
    if (modalActionButtons) {
      modalActionButtons.classList.add('hidden');
    }

    await updateOrderStatusInline(currentOrderDetails.id, newStatus, { notifyCustomer: false });

    await openOrderDetailsModal(currentOrderDetails.id);

    const statusLabel = currentOrderDetails
      ? getStatusDisplayLabel(newStatus, currentOrderDetails)
      : getStatusDisplayLabel(newStatus);

    displayModalMessage(`Status updated to ${statusLabel} without emailing the customer.`, 'success');
  } catch (error) {
    console.error('Silent status update failed:', error);
    displayModalMessage(error.message || 'Failed to update the order status.', 'error');
  } finally {
    closeStatusDropdown();
    if (modalLoadingMessage) {
      modalLoadingMessage.classList.add('hidden');
    }
    if (modalActionButtons) {
      modalActionButtons.classList.remove('hidden');
    }
  }
}

function isShippingAddressEditorVisible() {
  return !!(
    shippingAddressEditContainer &&
    !shippingAddressEditContainer.classList.contains('hidden')
  );
}

function toggleShippingAddressEditor(forceState) {
  if (!shippingAddressEditContainer) {
    return;
  }

  const shouldShow = typeof forceState === 'boolean'
    ? forceState
    : !isShippingAddressEditorVisible();

  shippingAddressEditContainer.classList.toggle('hidden', !shouldShow);
  if (shippingAddressDisplayRow) {
    shippingAddressDisplayRow.classList.toggle('hidden', shouldShow);
  }
  if (!shouldShow) {
    clearShippingAddressFeedback();
  }
}

function populateShippingAddressEditor(shippingInfo = {}) {
  if (shippingAddressInput) {
    shippingAddressInput.value = formatShippingAddressForEditor(shippingInfo);
  }
}

function resetShippingAddressEditor({ restoreFromOrder = false } = {}) {
  toggleShippingAddressEditor(false);
  if (shippingAddressInput) {
    if (restoreFromOrder && currentOrderDetails?.shippingInfo) {
      shippingAddressInput.value = formatShippingAddressForEditor(currentOrderDetails.shippingInfo);
    } else {
      shippingAddressInput.value = '';
    }
  }
}

function clearShippingAddressFeedback() {
  if (!shippingAddressFeedback) {
    return;
  }
  shippingAddressFeedback.textContent = '';
  shippingAddressFeedback.classList.add('hidden');
  shippingAddressFeedback.classList.remove('text-emerald-600', 'text-rose-600');
}

function setShippingAddressFeedback(message, tone = 'info') {
  if (!shippingAddressFeedback) {
    return;
  }
  shippingAddressFeedback.textContent = message;
  shippingAddressFeedback.classList.remove('hidden');
  shippingAddressFeedback.classList.remove('text-emerald-600', 'text-rose-600');
  const toneClass = tone === 'error' ? 'text-rose-600' : 'text-emerald-600';
  shippingAddressFeedback.classList.add(toneClass);
}

function setShippingAddressSavingState(isSaving) {
  if (!shippingAddressApplyButton) {
    return;
  }
  shippingAddressApplyButton.disabled = !!isSaving;
  shippingAddressApplyButton.textContent = isSaving
    ? 'Applying…'
    : shippingAddressApplyButtonDefaultText;
}

function updateShippingAddressDisplay(shippingInfo) {
  if (!modalShippingAddress) {
    return;
  }
  modalShippingAddress.textContent = formatShippingAddress(shippingInfo);
}

function formatShippingAddressForEditor(shippingInfo = {}) {
  if (!shippingInfo) {
    return '';
  }

  const streetLine = shippingInfo.streetAddress?.trim();
  const cityPart = shippingInfo.city?.trim();
  const statePart = shippingInfo.state ? shippingInfo.state.toString().toUpperCase().trim() : '';
  const zipPart = shippingInfo.zipCode ? String(shippingInfo.zipCode).trim() : '';

  const segments = [];
  if (streetLine) {
    segments.push(streetLine);
  }

  let cityStateZip = '';
  if (cityPart) {
    cityStateZip += cityPart;
  }
  if (statePart) {
    cityStateZip += cityStateZip ? `, ${statePart}` : statePart;
  }
  if (zipPart) {
    cityStateZip += cityStateZip ? ` ${zipPart}` : zipPart;
  }

  if (cityStateZip.trim()) {
    segments.push(cityStateZip.trim());
  }

  return segments.join(', ');
}

function parseShippingAddressEditorValue(rawValue = '') {
  const normalized = rawValue.replace(/\r/g, ' ').replace(/\n/g, ' ').trim();
  if (!normalized) {
    throw new Error('Enter the full shipping address before applying.');
  }

  const stateZipMatch = normalized.match(/([A-Za-z]{2})\s+(\d{5}(?:-\d{4})?)$/);
  if (!stateZipMatch) {
    throw new Error('End the address with a state abbreviation and ZIP (e.g., "NY 11230").');
  }

  const state = stateZipMatch[1].toUpperCase();
  const zipCode = stateZipMatch[2];
  const beforeStateZip = normalized.slice(0, stateZipMatch.index).replace(/,\s*$/, '').trim();

  const lastCommaIndex = beforeStateZip.lastIndexOf(',');
  if (lastCommaIndex === -1) {
    throw new Error('Separate the street and city with commas (e.g., "123 Main St, Brooklyn, NY 11230").');
  }

  const city = beforeStateZip.slice(lastCommaIndex + 1).trim();
  const streetAddress = beforeStateZip.slice(0, lastCommaIndex).trim();

  if (!streetAddress) {
    throw new Error('Add the street address before the city.');
  }
  if (!city) {
    throw new Error('Include the city name before the state.');
  }

  return { streetAddress, city, state, zipCode };
}

async function handleShippingAddressApply() {
  if (!currentOrderDetails || !currentOrderDetails.id) {
    setShippingAddressFeedback('Load an order before editing the address.', 'error');
    return;
  }

  let payload;
  try {
    payload = parseShippingAddressEditorValue(shippingAddressInput?.value || '');
  } catch (parseError) {
    setShippingAddressFeedback(parseError.message || 'Please check the address format.', 'error');
    return;
  }
  clearShippingAddressFeedback();
  setShippingAddressSavingState(true);

  try {
    const response = await fetch(`${BACKEND_BASE_URL}/orders/${currentOrderDetails.id}/shipping-info`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    let responseData = null;
    try {
      responseData = await response.json();
    } catch (parseError) {
      responseData = null;
    }

    if (!response.ok) {
      const message = responseData?.error || 'Failed to update the shipping address.';
      throw new Error(message);
    }

    const updatedShippingInfo = responseData?.shippingInfo
      ? responseData.shippingInfo
      : { ...currentOrderDetails.shippingInfo, ...payload };

    if (currentOrderDetails) {
      currentOrderDetails.shippingInfo = {
        ...currentOrderDetails.shippingInfo,
        ...updatedShippingInfo,
      };
    }

    updateShippingAddressDisplay(currentOrderDetails.shippingInfo);
    setShippingAddressFeedback('Shipping address updated.', 'success');
    populateShippingAddressEditor(currentOrderDetails.shippingInfo || {});

    setTimeout(() => {
      toggleShippingAddressEditor(false);
    }, 800);
  } catch (error) {
    setShippingAddressFeedback(error.message || 'Failed to update the shipping address.', 'error');
  } finally {
    setShippingAddressSavingState(false);
  }
}

async function openOrderDetailsModal(orderId) {
  if (!orderDetailsModal) {
    return;
  }
  resetImeiSection();
  teardownImeiListener();
  resetShippingAddressEditor({ restoreFromOrder: false });
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
hideClearDataForm();
updateReminderButtons(null);

// Hide all label rows initially
modalLabelRow.classList.add('hidden');
modalSecondaryLabelRow.classList.add('hidden');
modalReturnLabelRow.classList.add('hidden');
modalKitTrackingRow.classList.add('hidden');
if (modalKitTrackingTitle) {
modalKitTrackingTitle.textContent = 'Kit Delivery Status';
}
if (modalKitTrackingStatus) {
modalKitTrackingStatus.textContent = '';
}
if (modalKitTrackingUpdated) {
modalKitTrackingUpdated.textContent = '';
}
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
    resetShippingAddressEditor({ restoreFromOrder: true });
    startImeiListener(order);

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
updateShippingAddressDisplay(shippingInfo);
} else if (modalShippingAddress) {
modalShippingAddress.textContent = 'N/A';
}

if (modalLastReminderDate) {
const lastEmailTimestamp = getLastCustomerEmailTimestamp(order);
modalLastReminderDate.textContent = lastEmailTimestamp ? formatDateTime(lastEmailTimestamp) : 'Never';
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
const statusLabel = formatStatus(order);
if (modalStatusText) {
  modalStatusText.textContent = statusLabel;
}
if (modalStatus) {
  modalStatus.className = `${STATUS_BUTTON_BASE_CLASSES} ${getStatusToneClasses(order.status)}`.trim();
}
renderStatusDropdown(order);
closeStatusDropdown();

// --- START: UPDATED LABEL LOGIC FOR USPS HYPERLINKING IN MODAL ---

// 1. Outbound Kit (if requested)
if (order.shippingPreference === 'Shipping Kit Requested') {

if (modalKitTrackingTitle) {
modalKitTrackingTitle.textContent = 'Kit Delivery Status';
}

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

const labelStatusText = formatLabelStatus(order) || order.labelTrackingStatusDescription || order.labelTrackingStatus || '';

if (labelStatusText) {
if (modalKitTrackingTitle) {
modalKitTrackingTitle.textContent = 'Label Delivery Status';
}
if (modalKitTrackingStatus) {
modalKitTrackingStatus.textContent = labelStatusText;
}
if (modalKitTrackingUpdated) {
modalKitTrackingUpdated.textContent = order.labelTrackingLastSyncedAt ? `Last update: ${formatDate(order.labelTrackingLastSyncedAt)}` : '';
}
modalKitTrackingRow.classList.remove('hidden');
} else if (order.trackingNumber || order.inboundTrackingNumber) {
if (modalKitTrackingTitle) {
modalKitTrackingTitle.textContent = 'Label Delivery Status';
}
if (modalKitTrackingStatus) {
modalKitTrackingStatus.textContent = 'Label tracking available. Refresh to see the latest scans.';
}
if (modalKitTrackingUpdated) {
modalKitTrackingUpdated.textContent = '';
}
modalKitTrackingRow.classList.remove('hidden');
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
const clearDataOptions = getClearDataOptions(order);
const hasGeneratedLabels = labelOptions.length > 0 || Boolean(
order.uspsLabelUrl ||
order.outboundLabelUrl ||
order.inboundLabelUrl ||
order.shipEngineLabelId
);

const appendLabelGenerationActions = () => {
  if (order.shippingPreference === 'Shipping Kit Requested') {
    modalActionButtons.appendChild(
      createButton('Mark I Sent', () => handleAction(order.id, 'markKitSent'), 'bg-orange-600 hover:bg-orange-700')
    );
  }
  modalActionButtons.appendChild(createButton('Mark as Received', () => handleAction(order.id, 'markReceived')));
};

const appendPostReceivedActions = () => {
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
  modalActionButtons.appendChild(
    createButton('Mark as Completed', () => handleAction(order.id, 'markCompleted', 'bg-gray-600 hover:bg-gray-700'))
  );
  modalActionButtons.appendChild(
    createButton('Propose Re-offer', () => showReofferForm(order.id), 'bg-orange-600 hover:bg-orange-700')
  );
};

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
  case 'kit_on_the_way_to_us':
    modalActionButtons.appendChild(createButton('Mark as Received', () => handleAction(order.id, 'markReceived')));
    break;
  case 'kit_delivered':
    modalActionButtons.appendChild(createButton('Mark as Received', () => handleAction(order.id, 'markReceived')));
    break;
  case 'label_generated':
    appendLabelGenerationActions();
    break;
  case 'emailed':
    if (isBalanceEmailStatus(order)) {
      appendPostReceivedActions();
    } else {
      appendLabelGenerationActions();
    }
    break;
  case 'phone_on_the_way':
  case 'phone_on_the_way_to_us':
  case 'delivered_to_us':
    modalActionButtons.appendChild(createButton('Mark as Received', () => handleAction(order.id, 'markReceived')));
    break;
  case 'received':
    appendPostReceivedActions();
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

  if (isEligibleForAutoRequote(order)) {
    modalActionButtons.appendChild(
      createButton('Finalize 75% Reduced Payout', () => handleAction(order.id, 'autoRequote'), 'bg-rose-700 hover:bg-rose-800')
    );
  }

  const hasKitTracking = order.shippingPreference === 'Shipping Kit Requested' && (
    order.outboundTrackingNumber ||
    order.inboundTrackingNumber ||
    order.trackingNumber
  );
  if (hasKitTracking) {
    modalActionButtons.appendChild(
      createButton('Refresh Kit Tracking', () => handleAction(order.id, 'refreshKitTracking'), 'bg-sky-600 hover:bg-sky-700')
    );
  }

  const hasEmailTracking = order.shippingPreference === 'Email Label Requested' && (
    order.trackingNumber ||
    order.inboundTrackingNumber
  );
  if (hasEmailTracking) {
    modalActionButtons.appendChild(
      createButton('Refresh Email Label Tracking', () => handleAction(order.id, 'refreshEmailTracking'), 'bg-indigo-600 hover:bg-indigo-700')
    );
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

if (clearDataOptions.length > 0) {
modalActionButtons.appendChild(
createButton('Clear Saved Shipping Data', () => showClearDataForm(order), 'bg-amber-600 hover:bg-amber-700')
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

hideClearDataForm();

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

hideClearDataForm();

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
hideClearDataForm();
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
const modalContent = orderDetailsModal?.querySelector('.space-y-4');
const modalShell = orderDetailsModal?.querySelector('.relative');
[orderDetailsModal, modalShell, modalContent].forEach((node) => {
  if (!node) return;
  if (typeof node.scrollTo === 'function') {
    node.scrollTo({ top: 0, behavior: 'smooth' });
  } else if (typeof node.scrollTop === 'number') {
    node.scrollTop = 0;
  }
});
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
hideClearDataForm();
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
hideClearDataForm();
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
label: labelText,
}),
});

if (!response.ok) {
const errorData = await response.json().catch(() => null);
const errorMessage = errorData?.error || `Failed to send email (${response.status}).`;
throw new Error(errorMessage);
}

const result = await response.json().catch(() => ({}));
displayModalMessage(result.message || 'Email sent successfully.', 'success');
openOrderDetailsModal(orderId);
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
hideClearDataForm();
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
 const targetOrder = allOrders.find(o => o.id === orderId) || null;

 if (
 targetOrder &&
 (actionType === 'refreshKitTracking' || actionType === 'refreshEmailTracking') &&
 isStatusPastReceived(targetOrder)
 ) {
 modalLoadingMessage.classList.add('hidden');
 modalActionButtons.classList.remove('hidden');
 updateReminderButtons(targetOrder);
 displayModalMessage('Tracking refresh skipped because this order is already received/completed.', 'info');
 return;
 }

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
if (!targetOrder) {
throw new Error('Order data not found locally.');
}
const paymentLink = generatePaymentLink(targetOrder);
if (paymentLink) {
window.open(paymentLink, '_blank');
displayModalMessage('Payment link generated and opened in a new tab.', 'success');
await handleAction(orderId, 'markCompleted');
} else {
throw new Error('Could not generate payment link.');
}
modalLoadingMessage.classList.add('hidden');
modalActionButtons.classList.remove('hidden');
updateReminderButtons(targetOrder);
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
case 'autoRequote':
url = `${BACKEND_BASE_URL}/orders/${orderId}/auto-requote`;
method = 'POST';
if (body === null) {
body = {};
}
break;
  case 'refreshKitTracking':
    url = REFRESH_TRACKING_FUNCTION_URL;
    method = 'POST';
    body = { orderId, type: 'kit' };
    break;
  case 'refreshEmailTracking':
    url = REFRESH_TRACKING_FUNCTION_URL;
    method = 'POST';
    body = { orderId, type: 'email' };
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
teardownImeiListener();
resetImeiSection();
closeStatusDropdown();
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
hideClearDataForm();
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

if (modalStatus) {
  modalStatus.addEventListener('click', (event) => {
    event.stopPropagation();
    if (!currentOrderDetails) {
      return;
    }
    renderStatusDropdown(currentOrderDetails);
    toggleStatusDropdown();
  });
}

document.addEventListener('click', (event) => {
  if (!isStatusDropdownOpen) {
    return;
  }
  if (modalStatusWrapper && !modalStatusWrapper.contains(event.target)) {
    closeStatusDropdown();
  }
});

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

if (closeModalButton) {
closeModalButton.addEventListener('click', closeOrderDetailsModal);
}

if (modalImeiButton) {
  modalImeiButton.addEventListener('click', handleImeiSubmit);
}

if (modalImeiInput) {
  modalImeiInput.addEventListener('input', () => {
    const digitsOnly = modalImeiInput.value.replace(/[^0-9]/g, '');
    if (digitsOnly !== modalImeiInput.value) {
      modalImeiInput.value = digitsOnly;
    }
  });
  modalImeiInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      if (modalImeiButton && !modalImeiButton.disabled) {
        handleImeiSubmit();
      }
    }
  });
}

document.addEventListener('DOMContentLoaded', async () => {
try {
// IMPORTANT: Firebase initialization
const app = firebaseApp;
db = getFirestore(app);
auth = getAuth(app);
functions = getFunctions(app);
if (pendingImeiOrder) {
  const orderNeedingImeiListener = pendingImeiOrder;
  pendingImeiOrder = null;
  startImeiListener(orderNeedingImeiListener);
}

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

const validIds = new Set(allOrders.map(order => order.id));
Array.from(selectedOrderIds).forEach((id) => {
if (!validIds.has(id)) {
selectedOrderIds.delete(id);
}
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
  filtered = filtered.filter(order => isLabelGenerationStage(order));
  } else if (status === 'emailed') {
  filtered = filtered.filter(order => isBalanceEmailStatus(order));
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

