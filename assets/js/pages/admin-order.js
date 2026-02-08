import { firebaseApp } from "/assets/js/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, doc, getDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { apiPost, apiPut } from "/public/js/apiClient.js";

const auth = getAuth(firebaseApp);
const db = getFirestore(firebaseApp);

const loginScreen = document.getElementById('admin-login-screen');
const loginForm = document.getElementById('admin-login-form');
const loginEmailInput = document.getElementById('admin-login-email');
const loginPasswordInput = document.getElementById('admin-login-password');
const loginError = document.getElementById('admin-login-error');
const logoutBtn = document.getElementById('logout-btn');

const orderTitle = document.getElementById('order-title');
const orderMeta = document.getElementById('order-meta');
const orderUpdated = document.getElementById('order-updated');
const orderSummary = document.getElementById('order-summary');
const statusSelect = document.getElementById('order-status-select');
const statusSubmit = document.getElementById('order-status-submit');
const labelBtn = document.getElementById('order-label-btn');
const packingSlipBtn = document.getElementById('order-packing-slip-btn');
const feedback = document.getElementById('order-action-feedback');

const STATUS_OPTIONS = [
  'order_pending',
  'shipping_kit_requested',
  'kit_needs_printing',
  'kit_sent',
  'kit_on_the_way_to_customer',
  'kit_delivered',
  'kit_on_the_way_to_us',
  'delivered_to_us',
  'label_generated',
  'emailed',
  'phone_on_the_way',
  'received',
  'completed',
  're-offered-pending',
  're-offered-accepted',
  're-offered-declined',
  'return-label-generated',
  'cancelled',
];

const params = new URLSearchParams(window.location.search);
const orderId = params.get('order');
const deviceIndex = Number(params.get('device') || 0);

const formatDateTime = (value) => {
  if (!value) return '—';
  const date = value.toDate ? value.toDate() : new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString();
};

const formatCurrency = (value) => {
  const number = Number(value);
  if (!Number.isFinite(number)) return '—';
  return `$${number.toFixed(2)}`;
};

const buildSummaryRow = (label, value) => `
  <div class="order-field">
    <span>${label}</span>
    <strong>${value}</strong>
  </div>
`;

const showFeedback = (message, tone = 'info') => {
  if (!feedback) return;
  feedback.textContent = message;
  feedback.classList.remove('text-red-300', 'text-green-300', 'text-slate-400');
  if (tone === 'error') feedback.classList.add('text-red-300');
  if (tone === 'success') feedback.classList.add('text-green-300');
  if (tone === 'info') feedback.classList.add('text-slate-400');
};

const renderSummary = (order) => {
  if (!orderSummary) return;
  const item = Array.isArray(order.items) ? order.items[deviceIndex] : null;
  const perDevicePrice = item?.perDevicePrice ?? item?.unitPrice ?? (item?.totalPayout && item?.qty ? item.totalPayout / item.qty : null);
  const shippingInfo = order.shippingInfo || {};
  const payout = perDevicePrice ?? order.totalPayout ?? order.estimatedQuote;
  orderSummary.innerHTML = `
    ${buildSummaryRow('Customer', shippingInfo.fullName || '—')}
    ${buildSummaryRow('Email', shippingInfo.email || '—')}
    ${buildSummaryRow('Phone', shippingInfo.phone || '—')}
    ${buildSummaryRow('Device', item?.modelName || order.modelName || order.device || '—')}
    ${buildSummaryRow('Storage', item?.storage || order.storage || '—')}
    ${buildSummaryRow('Carrier', item?.carrier || item?.lock || order.carrier || '—')}
    ${buildSummaryRow('Condition', item?.condition || order.condition || '—')}
    ${buildSummaryRow('Quantity', item?.qty || order.qty || '—')}
    ${buildSummaryRow('Per-device payout', formatCurrency(perDevicePrice))}
    ${buildSummaryRow('Order total', formatCurrency(order.totalPayout || order.estimatedQuote))}
    ${buildSummaryRow('Status', order.status || '—')}
    ${buildSummaryRow('Shipping preference', order.shippingPreference || '—')}
    ${buildSummaryRow('Payment method', order.paymentMethod || '—')}
    ${buildSummaryRow('Payout', formatCurrency(payout))}
  `;
};

const populateStatusOptions = (currentStatus) => {
  if (!statusSelect) return;
  statusSelect.innerHTML = '<option value="">Update status…</option>';
  STATUS_OPTIONS.forEach((status) => {
    const option = document.createElement('option');
    option.value = status;
    option.textContent = status.replace(/_/g, ' ');
    if (currentStatus === status) option.selected = true;
    statusSelect.appendChild(option);
  });
};

const loadOrder = async () => {
  if (!orderId) {
    if (orderTitle) orderTitle.textContent = 'Order not found';
    if (orderMeta) orderMeta.textContent = 'Missing order ID.';
    return;
  }
  const snapshot = await getDoc(doc(db, 'orders', orderId));
  if (!snapshot.exists()) {
    if (orderTitle) orderTitle.textContent = 'Order not found';
    if (orderMeta) orderMeta.textContent = `Order ${orderId} was not found.`;
    return;
  }
  const order = { id: snapshot.id, ...snapshot.data() };
  if (orderTitle) orderTitle.textContent = `Order ${order.id}`;
  if (orderMeta) orderMeta.textContent = `Device ${deviceIndex + 1} • ${order.shippingInfo?.fullName || 'Unknown customer'}`;
  if (orderUpdated) orderUpdated.textContent = formatDateTime(order.updatedAt || order.createdAt);
  populateStatusOptions(order.status);
  renderSummary(order);
};

if (loginForm) {
  loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (loginError) {
      loginError.textContent = '';
      loginError.classList.add('hidden');
    }
    const email = loginEmailInput?.value?.trim();
    const password = loginPasswordInput?.value || '';
    if (!email || !password) {
      if (loginError) {
        loginError.textContent = 'Enter your email and password to continue.';
        loginError.classList.remove('hidden');
      }
      return;
    }
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (error) {
      console.error('Admin login failed:', error);
      if (loginError) {
        loginError.textContent = 'Login failed. Check your credentials and try again.';
        loginError.classList.remove('hidden');
      }
    }
  });
}

if (logoutBtn) {
  logoutBtn.addEventListener('click', async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error('Error signing out:', error);
    }
  });
}

if (statusSubmit) {
  statusSubmit.addEventListener('click', async () => {
    if (!orderId || !statusSelect?.value) {
      showFeedback('Select a status before applying.', 'error');
      return;
    }
    showFeedback('Updating status…');
    try {
      await apiPut(`/orders/${orderId}/status`, { status: statusSelect.value }, { authRequired: true });
      showFeedback('Status updated.', 'success');
      await loadOrder();
    } catch (error) {
      console.error('Failed to update status:', error);
      showFeedback('Failed to update status.', 'error');
    }
  });
}

if (labelBtn) {
  labelBtn.addEventListener('click', async () => {
    if (!orderId) return;
    showFeedback('Generating label…');
    try {
      await apiPost(`/generate-label/${orderId}`, {}, { authRequired: true });
      showFeedback('Label generated. Refresh to see updates.', 'success');
    } catch (error) {
      console.error('Failed to generate label:', error);
      showFeedback('Failed to generate label.', 'error');
    }
  });
}

if (packingSlipBtn) {
  packingSlipBtn.addEventListener('click', async () => {
    if (!orderId) return;
    showFeedback('Preparing packing slip…');
    window.open(`/admin/print-queue/?order=${encodeURIComponent(orderId)}&device=${encodeURIComponent(deviceIndex)}`, '_blank');
  });
}

onAuthStateChanged(auth, (user) => {
  if (!user || user.isAnonymous) {
    if (loginScreen) loginScreen.classList.remove('hidden');
    return;
  }
  if (loginScreen) loginScreen.classList.add('hidden');
  loadOrder();
});
