import { firebaseApp } from "/assets/js/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import {
  getFirestore,
  collection,
  doc,
  addDoc,
  setDoc,
  updateDoc,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp,
  getDoc,
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

const auth = getAuth(firebaseApp);
const db = getFirestore(firebaseApp);

const VISITOR_KEY = "shc_live_chat_visitor_id";
const SESSION_KEY = "shc_live_chat_session_id";
const WIDGET_STATE_KEY = "shc_live_chat_open";
const SUPPORT_REP_ICON = "/assets/img/chat-support-rep.webp";

const QUICK_ACTIONS = [
  { id: "track_order", label: "Track an order" },
  { id: "how_it_works", label: "How it works" },
  { id: "shipping_help", label: "Shipping / label help" },
  { id: "payment_help", label: "Payment question" },
  { id: "reoffer_help", label: "Re-offer question" },
  { id: "general_faq", label: "General FAQs" },
  { id: "human", label: "Talk to support" },
];

const BOT_RESPONSES = {
  greeting: {
    title: "Greeting",
    body:
      "Hi. Choose one of the options below and I’ll point you in the right direction, or press Talk to support if you want a team member.",
  },
  how_it_works: {
    title: "How it works",
    body:
      "Get a quote, accept the offer, submit your shipping details, send your device, and we inspect it after arrival. If everything matches, payment is issued. If something differs, we may send a revised offer or an issue email.",
  },
  shipping_help: {
    title: "Shipping and label help",
    body:
      "Regular shipping sends a prepaid label by email. Faster shipping deducts a small amount from payout for a faster label service. Shipping kit sends packaging materials and a return label. If you already submitted an order, include your order ID for help.",
  },
  payment_help: {
    title: "Payment help",
    body:
      "Payment is sent after inspection and final approval. Timing depends on device arrival, inspection, and whether there are any issues such as locks, unpaid balance, or a revised offer.",
  },
  reoffer_help: {
    title: "Re-offer help",
    body:
      "If your device arrives in a different condition than quoted, we may send a revised offer by email. You usually have 7 days to respond before the revised amount can auto-accept under your current policy.",
  },
  general_faq: {
    title: "General FAQs",
    body:
      "Common questions include shipping timing, payout timing, condition grades, carrier lock status, and how revised offers work. If you type your question, I will try to route it correctly.",
  },
};

const INTENT_PATTERNS = [
  { id: "greeting", patterns: [/^(hi|hello|hey|yo|good morning|good afternoon|good evening)\b/, /\bhello\b/, /\bhi\b/, /\bhey\b/] },
  { id: "track_order", patterns: [/\btrack\b/, /\border\b.*\bstatus\b/, /\bwhere\b.*\border\b/, /\bstatus\b.*\border\b/] },
  { id: "shipping_help", patterns: [/\bshipping\b/, /\blabel\b/, /\bbox\b/, /\bkit\b/, /\bups\b/, /\busps\b/] },
  { id: "payment_help", patterns: [/\bpay\b/, /\bpayout\b/, /\bpaid\b/, /\bcash app\b/, /\bzelle\b/, /\bpaypal\b/, /\bcheck\b/] },
  { id: "reoffer_help", patterns: [/\bre-?offer\b/, /\brequote\b/, /\brevised offer\b/] },
  { id: "how_it_works", patterns: [/\bhow\b.*\bwork/, /\bprocess\b/, /\bhow do i sell\b/, /\bhow it works\b/] },
  { id: "human", patterns: [/\bhuman\b/, /\bperson\b/, /\bagent\b/, /\bsupport\b/, /\brepresentative\b/, /\bhelp me\b/] },
];

const PAGE_LABELS = {
  "/": "home",
  "/sell/index.html": "sell_quote",
  "/sell/checkout.html": "sell_checkout",
  "/order-submitted.html": "order_submitted",
  "/reoffer-action.html": "reoffer",
  "/track-order.html": "track_order",
  "/support.html": "support",
  "/my-account.html": "my_account",
};

const TRACK_STATUS_DETAILS = {
  order_pending: "We have your order request and are getting it ready for shipping and intake.",
  shipping_kit_requested: "We received your request and are preparing your prepaid label.",
  needs_printing: "Your shipping label is being prepared right now.",
  kit_needs_printing: "Your shipping label is being prepared right now.",
  label_generated: "Your shipping label is ready. Send the device in when you are ready.",
  kit_sent: "Your shipping details are ready and have been sent to you.",
  kit_delivered_to_customer: "Your shipping details are ready. Once you pack the device and send it back, tracking will update here.",
  kit_in_transit: "Your return package is on the way to us.",
  phone_on_the_way: "Your package is on the way to us.",
  delivered_to_us: "Your package was delivered to our facility.",
  received: "Your device has been received and is waiting for inspection.",
  imei_checked: "Your device is in inspection and verification.",
  emailed: "We emailed you because we need a response before we can continue.",
  issue_resolved: "We received your update and your device is waiting for follow-up review.",
  re_offered_pending: "A revised offer is waiting for your response.",
  re_offered_accepted: "Your revised offer was accepted and payout is moving forward.",
  re_offered_auto_accepted: "Your revised offer auto-accepted after the response window.",
  re_offered_declined: "Your revised offer was declined and return processing can continue.",
  return_label_generated: "Your return label is ready.",
  return_in_transit: "Your return package is in transit.",
  completed: "Your order has been completed.",
  requote_accepted: "Your updated offer was accepted and payout is moving forward.",
};

const TRACK_STAGE_MAP = {
  order_pending: "order_received",
  shipping_kit_requested: "preparing_kit",
  needs_printing: "preparing_kit",
  kit_needs_printing: "preparing_kit",
  label_generated: "label_ready",
  kit_sent: "kit_sent",
  kit_delivered_to_customer: "kit_delivered",
  kit_in_transit: "in_transit",
  phone_on_the_way: "in_transit",
  delivered_to_us: "delivered",
  received: "received",
  imei_checked: "inspection",
  emailed: "inspection",
  issue_resolved: "inspection",
  re_offered_pending: "reoffer",
  re_offered_declined: "reoffer",
  re_offered_accepted: "done",
  re_offered_auto_accepted: "done",
  requote_accepted: "done",
  completed: "done",
  return_label_generated: "return_label",
  return_in_transit: "return_in_transit",
};

const TRACK_STAGE_LABELS = {
  order_received: "Order received",
  preparing_kit: "Preparing shipment",
  label_ready: "Label ready",
  kit_sent: "Kit sent",
  kit_delivered: "Kit delivered",
  in_transit: "In transit to us",
  delivered: "Delivered to us",
  received: "Device received",
  inspection: "Inspection in progress",
  reoffer: "Re-offer pending",
  return_label: "Return label ready",
  return_in_transit: "Return in transit",
  done: "Payout sent",
};

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function readStorage(key) {
  try {
    return window.localStorage.getItem(key);
  } catch (_) {
    return null;
  }
}

function writeStorage(key, value) {
  try {
    window.localStorage.setItem(key, value);
  } catch (_) {}
}

function getVisitorId() {
  const existing = readStorage(VISITOR_KEY);
  if (existing) return existing;
  const generated = `visitor_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  writeStorage(VISITOR_KEY, generated);
  return generated;
}

function getPageContext() {
  const path = window.location.pathname || "/";
  return PAGE_LABELS[path] || path;
}

function detectIntent(text) {
  const normalized = String(text || "").toLowerCase().trim();
  if (!normalized) return null;
  for (const entry of INTENT_PATTERNS) {
    if (entry.patterns.some((pattern) => pattern.test(normalized))) {
      return entry.id;
    }
  }
  return null;
}

function normalize(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeOrderIdInput(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const compact = raw.toUpperCase().replace(/\s+/g, "");
  const digitsOnly = compact.replace(/\D/g, "");
  if (digitsOnly) return `SHC-${digitsOnly}`;
  if (compact.startsWith("SHC-")) return compact;
  if (compact.startsWith("SHC")) return `SHC-${compact.slice(3)}`;
  return compact;
}

function toMillis(value) {
  if (!value) return null;
  if (typeof value === "number") return value;
  if (typeof value?.toMillis === "function") return value.toMillis();
  if (typeof value === "object") {
    const seconds = value._seconds ?? value.seconds ?? null;
    if (typeof seconds === "number") {
      const nanos = value._nanoseconds ?? value.nanoseconds ?? 0;
      return seconds * 1000 + Math.floor(nanos / 1e6);
    }
  }
  return null;
}

function resolveUpdatedAt(order = {}) {
  const candidates = [order.updatedAt, order.updated_at, order.statusUpdatedAt, order.status_updated_at, order.createdAt, order.created_at];
  for (const candidate of candidates) {
    const millis = toMillis(candidate);
    if (millis) return new Date(millis);
  }
  return null;
}

function resolveOrderEmail(order = {}) {
  return normalize(
    order?.shippingInfo?.email ||
    order?.email ||
    order?.contactEmail ||
    order?.customerEmail ||
    order?.userEmail
  );
}

async function fetchTrackedOrder(orderId, email) {
  const orderRef = doc(db, "orders", orderId);
  const snapshot = await getDoc(orderRef);
  if (!snapshot.exists()) {
    throw new Error("Unable to find that order.");
  }
  const order = { id: snapshot.id, ...snapshot.data() };
  const orderEmail = resolveOrderEmail(order);
  const enteredEmail = normalize(email);
  if (!orderEmail) {
    throw new Error("This order does not have an email on file. Please contact support.");
  }
  if (enteredEmail !== orderEmail) {
    throw new Error("The email you entered does not match the email on the order.");
  }
  return order;
}

function friendlyTrackStatus(status) {
  const normalized = normalize(String(status || "").replace(/-/g, "_"));
  if (!normalized) return "Unknown";
  const labels = {
    shipping_kit_requested: "Preparing shipping label",
    needs_printing: "Preparing label",
    kit_needs_printing: "Preparing shipping label",
    label_generated: "Label ready",
    kit_sent: "Label sent",
    kit_delivered_to_customer: "Label delivered",
    kit_in_transit: "Package on the way",
    phone_on_the_way: "Package on the way",
    delivered_to_us: "Delivered to us",
    imei_checked: "Inspection in progress",
    issue_resolved: "Update received",
    re_offered_pending: "Re-offer waiting",
    re_offered_accepted: "Re-offer accepted",
    re_offered_auto_accepted: "Re-offer accepted",
    re_offered_declined: "Re-offer declined",
    return_label_generated: "Return label ready",
    return_in_transit: "Return in transit",
    requote_accepted: "Offer accepted",
  };
  if (labels[normalized]) return labels[normalized];
  return normalized
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function getTrackStatusDetail(status) {
  const normalized = normalize(String(status || "").replace(/-/g, "_"));
  return TRACK_STATUS_DETAILS[normalized] || "We are still working on your order.";
}

function getTrackTimeline(status) {
  const normalized = normalize(String(status || "").replace(/-/g, "_"));
  const stage = TRACK_STAGE_MAP[normalized] || "order_received";
  const flows = {
    default: ["order_received", "label_ready", "in_transit", "delivered", "received", "inspection", "done"],
    reoffer: ["order_received", "label_ready", "in_transit", "delivered", "received", "inspection", "reoffer", "done"],
    declined: ["order_received", "label_ready", "in_transit", "delivered", "received", "inspection", "reoffer", "return_label", "return_in_transit"],
  };
  const flow = stage === "reoffer"
    ? flows.reoffer
    : (stage === "return_label" || stage === "return_in_transit" ? flows.declined : flows.default);
  const currentIndex = Math.max(0, flow.indexOf(stage));
  return flow.slice(0, currentIndex + 1);
}

function buildTrackResultCard(order = {}) {
  const statusKey = normalize(String(order.status || "").replace(/-/g, "_")) || "order_pending";
  const updatedAt = resolveUpdatedAt(order);
  const summary = [
    order?.device || order?.deviceName || null,
    order?.storage || null,
    order?.carrier || order?.shippingInfo?.carrier || null,
  ].filter(Boolean).join(" • ");
  const timeline = getTrackTimeline(statusKey);
  const currentStepLabel = friendlyTrackStatus(statusKey);
  const currentStepDetail = getTrackStatusDetail(statusKey);
  return `
    <div class="shc-live-chat__result-card">
      <div class="shc-live-chat__result-top">
        <div>
          <p class="shc-live-chat__result-eyebrow">Order lookup</p>
          <h4>#${escapeHtml(order.id || order.orderId || "Order")}</h4>
        </div>
        <span class="shc-live-chat__result-status">${escapeHtml(friendlyTrackStatus(statusKey))}</span>
      </div>
      <p class="shc-live-chat__result-copy">${escapeHtml(currentStepDetail)}</p>
      <div class="shc-live-chat__result-grid">
        <div><span>Current step</span><strong>${escapeHtml(currentStepLabel)}</strong></div>
        <div><span>Customer</span><strong>${escapeHtml(order?.shippingInfo?.fullName || order?.shippingInfo?.name || "—")}</strong></div>
        <div><span>Payout</span><strong>${escapeHtml(Number.isFinite(Number(order.totalPayout ?? order.estimatedQuote ?? order.originalQuote)) ? Number(order.totalPayout ?? order.estimatedQuote ?? order.originalQuote).toLocaleString("en-US", { style: "currency", currency: "USD" }) : "—")}</strong></div>
        <div><span>Device</span><strong>${escapeHtml(summary || "—")}</strong></div>
        <div><span>Updated</span><strong>${escapeHtml(updatedAt ? updatedAt.toLocaleString() : "—")}</strong></div>
      </div>
      <div class="shc-live-chat__timeline">
        ${timeline.map((stage) => `<span class="shc-live-chat__timeline-pill">${escapeHtml(TRACK_STAGE_LABELS[stage] || stage)}</span>`).join("")}
      </div>
    </div>
  `;
}

async function ensureChatSession(state, profileOverrides = null) {
  if (state.chatId) return state.chatId;

  const user = auth.currentUser;
  const visitorId = getVisitorId();
  const sourcePath = `${window.location.pathname}${window.location.search || ""}`;
  const sourcePage = getPageContext();
  const profile = profileOverrides || {};
  const chatRef = await addDoc(collection(db, "chats"), {
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    status: "open",
    sourcePath,
    sourcePage,
    assignedAdminUid: null,
    assignedAdminName: null,
    currentIntent: null,
    handoffRequested: false,
    humanJoinedAt: null,
    closedAt: null,
    unreadByAdmin: true,
    unreadByCustomer: false,
    lastMessagePreview: "",
    visitorId,
    customerUid: user?.uid || null,
    customerEmail: profile.email || user?.email || null,
    customerName: profile.name || user?.displayName || null,
    customerPhone: profile.phone || null,
  });

  state.chatId = chatRef.id;
  writeStorage(SESSION_KEY, chatRef.id);
  subscribeToMessages(state);
  return state.chatId;
}

async function saveCustomerContact(state, profile = {}) {
  const name = String(profile.name || "").trim();
  const email = String(profile.email || "").trim();
  const phone = String(profile.phone || "").trim();

  if (!state.chatId) {
    await ensureChatSession(state, { name, email, phone });
    return;
  }

  await updateDoc(doc(db, "chats", state.chatId), {
    customerName: name || null,
    customerEmail: email || null,
    customerPhone: phone || null,
    updatedAt: serverTimestamp(),
  });
}

async function addMessage(state, senderType, text, extra = {}) {
  const chatId = await ensureChatSession(state);
  const message = {
    text: String(text || "").trim(),
    senderType,
    createdAt: serverTimestamp(),
    ...extra,
  };

  await addDoc(collection(db, `chats/${chatId}/messages`), message);

  const preview = String(text || "").trim().slice(0, 140);
  const updates = {
    updatedAt: serverTimestamp(),
    lastMessagePreview: preview,
  };

  if (senderType === "user") {
    updates.unreadByAdmin = true;
  } else if (senderType === "admin" || senderType === "bot") {
    updates.unreadByCustomer = true;
  }

  if (extra.intent) {
    updates.currentIntent = extra.intent;
  }

  await updateDoc(doc(db, "chats", chatId), updates);
}

async function setHandoff(state, reason, initialMessage = "", options = {}) {
  const chatId = await ensureChatSession(state);
  await updateDoc(doc(db, "chats", chatId), {
    handoffRequested: true,
    handoffReason: reason,
    updatedAt: serverTimestamp(),
    status: "open",
    unreadByAdmin: true,
  });

  state.chatMeta = { ...(state.chatMeta || {}), handoffRequested: true, handoffReason: reason };
  updateComposerVisibility(state);

  if (!options?.silent) {
    await addMessage(
      state,
      "system",
      initialMessage || "Customer requested support.",
      { systemType: "handoff", handoffReason: reason }
    );
  }
}

function updateComposerVisibility(state) {
  const form = state.elements.form;
  if (!form) return;
  const isClosed = String(state.chatMeta?.status || "").trim().toLowerCase() === "closed";
  const shouldShow = !isClosed && Boolean(state.chatMeta?.handoffRequested || state.chatMeta?.assignedAdminUid);
  form.classList.toggle("hidden", !shouldShow);
  if (state.elements.input) {
    state.elements.input.disabled = isClosed;
  }
}

function buildWidgetMarkup() {
  return `
    <div id="shcLiveChatRoot" class="shc-live-chat">
      <button id="shcLiveChatToggle" class="shc-live-chat__toggle" type="button" aria-label="Open live chat">
        Support
      </button>
      <section id="shcLiveChatPanel" class="shc-live-chat__panel shc-live-chat__panel--closed hidden" aria-live="polite">
        <div class="shc-live-chat__header">
          <div>
            <p class="shc-live-chat__eyebrow">SecondHandCell Support</p>
            <h3>Chat with us</h3>
          </div>
          <button id="shcLiveChatClose" type="button" class="shc-live-chat__icon-btn" aria-label="Close chat">×</button>
        </div>
        <div class="shc-live-chat__body">
          <div id="shcLiveChatMessages" class="shc-live-chat__messages"></div>
          <div id="shcLiveChatTypingIndicator" class="shc-live-chat__typing hidden"></div>
          <div id="shcLiveChatFlowArea" class="shc-live-chat__flow-area"></div>
          <div id="shcLiveChatQuickActions" class="shc-live-chat__quick-actions"></div>
        </div>
        <form id="shcLiveChatForm" class="shc-live-chat__composer hidden">
          <input id="shcLiveChatInput" type="text" placeholder="Type your question..." autocomplete="off" />
          <button type="submit">Send</button>
        </form>
      </section>
    </div>
  `;
}

function injectStyles() {
  if (document.getElementById("shcLiveChatStyles")) return;
  const style = document.createElement("style");
  style.id = "shcLiveChatStyles";
  style.textContent = `
    .shc-live-chat { position: fixed; right: 18px; bottom: 18px; z-index: 9999; font-family: Poppins, Inter, sans-serif; width: auto !important; max-width: calc(100vw - 24px); }
    .shc-live-chat__toggle { display: inline-flex !important; align-items: center; justify-content: center; width: auto !important; min-width: 0 !important; max-width: none !important; border: 0; border-radius: 999px; padding: 14px 18px; background: linear-gradient(135deg, #0f8f44 0%, #24a84d 58%, #f1c40f 100%); color: #fff; font-weight: 700; box-shadow: 0 18px 40px rgba(15, 23, 42, 0.22); cursor: pointer; white-space: nowrap; }
    .shc-live-chat__toggle.hidden { display:none !important; opacity:0; pointer-events:none; }
    .shc-live-chat__panel { width: min(390px, calc(100vw - 20px)); max-height: min(76vh, 720px); display: flex; flex-direction: column; border: 1px solid #dbe4f0; border-radius: 22px; overflow: hidden; background: rgba(255,255,255,0.98); box-shadow: 0 24px 80px rgba(15, 23, 42, 0.2); margin-bottom: 12px; transform-origin: bottom right; transition: opacity 180ms ease, transform 220ms cubic-bezier(.22,1,.36,1), filter 220ms ease; }
    .shc-live-chat__panel.hidden { display: none; }
    .shc-live-chat__panel--closed { opacity:0; transform: translateY(18px) scale(.92); filter: blur(2px); pointer-events:none; }
    .shc-live-chat__panel--open { opacity:1; transform: translateY(0) scale(1); filter: blur(0); pointer-events:auto; }
    .shc-live-chat__header { display:flex; align-items:flex-start; justify-content:space-between; padding:16px 18px; background: linear-gradient(180deg, #f7fbff 0%, #eef5ff 100%); border-bottom:1px solid #dbe4f0; }
    .shc-live-chat__header h3 { margin:2px 0 0; font-size: 1.1rem; color:#0f172a; }
    .shc-live-chat__eyebrow { margin:0; font-size:.7rem; letter-spacing:.12em; text-transform:uppercase; color:#51739d; font-weight:700; }
    .shc-live-chat__icon-btn { border:0; background:transparent; font-size:24px; line-height:1; color:#475569; cursor:pointer; }
    .shc-live-chat__body { padding: 14px 14px 0; overflow-y: auto; overflow-x: hidden; display:flex; flex-direction:column; gap:12px; flex: 1 1 auto; min-height: 0; }
    .shc-live-chat__messages { overflow:visible; display:flex; flex-direction:column; gap:10px; max-height: none; padding-right: 4px; flex: 0 0 auto; }
    .shc-live-chat__flow-area { display:flex; flex-direction:column; gap:10px; }
    .shc-live-chat__message-row { display:flex; flex-direction:column; gap:4px; max-width:100%; }
    .shc-live-chat__message-row--user { align-items:flex-end; }
    .shc-live-chat__message-row--bot,
    .shc-live-chat__message-row--admin { align-items:flex-start; }
    .shc-live-chat__message-row--system { align-items:center; }
    .shc-live-chat__bubble { max-width: 88%; padding: 12px 14px; border-radius: 18px; font-size: .94rem; line-height: 1.5; white-space: pre-wrap; }
    .shc-live-chat__bubble--bot, .shc-live-chat__bubble--system { background:#f3f7fb; border:1px solid #d8e4f2; color:#1e293b; align-self:flex-start; }
    .shc-live-chat__bubble--user { background:#0f8f44; color:#fff; align-self:flex-end; }
    .shc-live-chat__bubble--admin { background:#e8f2ff; border:1px solid #b9d1ff; color:#0f274a; align-self:flex-start; }
    .shc-live-chat__meta { font-size:.68rem; text-transform:uppercase; letter-spacing:.12em; font-weight:800; color:#4f46e5; margin-bottom:6px; }
    .shc-live-chat__join-bubble { display:flex; align-items:center; gap:10px; max-width:92%; align-self:center; background:#f8fafc; border:1px solid #d8e4f2; border-radius:18px; padding:10px 12px; color:#0f172a; font-size:.9rem; font-weight:600; cursor:pointer; }
    .shc-live-chat__join-bubble img { width:28px; height:28px; border-radius:999px; object-fit:cover; flex-shrink:0; }
    .shc-live-chat__system-notice { display:flex; align-items:center; justify-content:center; gap:10px; max-width:92%; align-self:center; background:#f8fafc; border:1px solid #d8e4f2; border-radius:18px; padding:10px 14px; color:#0f172a; font-size:.9rem; font-weight:600; text-align:center; cursor:pointer; }
    .shc-live-chat__system-notice img { width:28px; height:28px; border-radius:999px; object-fit:cover; flex-shrink:0; }
    .shc-live-chat__timestamp { font-size:.74rem; color:#64748b; font-weight:600; opacity:.95; user-select:none; }
    .shc-live-chat__timestamp.hidden { display:none; }
    .shc-live-chat__timestamp--user { align-self:flex-end; padding-right:6px; }
    .shc-live-chat__timestamp--bot,
    .shc-live-chat__timestamp--admin { align-self:flex-start; padding-left:6px; }
    .shc-live-chat__timestamp--system { align-self:center; }
    .shc-live-chat__typing { display:flex; align-items:center; gap:8px; align-self:flex-start; background:#f8fafc; border:1px solid #d8e4f2; border-radius:999px; padding:8px 12px; color:#475569; font-size:.82rem; font-weight:600; }
    .shc-live-chat__typing.hidden { display:none; }
    .shc-live-chat__typing-dots { display:inline-flex; gap:4px; }
    .shc-live-chat__typing-dots span { width:6px; height:6px; border-radius:999px; background:#64748b; opacity:.45; animation: shcTypingBounce 1.2s infinite ease-in-out; }
    .shc-live-chat__typing-dots span:nth-child(2) { animation-delay:.16s; }
    .shc-live-chat__typing-dots span:nth-child(3) { animation-delay:.32s; }
    @keyframes shcTypingBounce { 0%, 80%, 100% { transform: translateY(0); opacity:.35; } 40% { transform: translateY(-3px); opacity:1; } }
    .shc-live-chat__quick-actions { display:flex; flex-wrap:wrap; gap:8px; padding-bottom: 8px; }
    .shc-live-chat__chip { border:1px solid #d7e3ef; background:#fff; color:#16324f; padding:9px 12px; border-radius:999px; font-size:.83rem; font-weight:600; cursor:pointer; }
    .shc-live-chat__flow-card { border:1px solid #d8e4f2; background:#f8fbff; border-radius:18px; padding:14px; }
    .shc-live-chat__flow-card h4 { margin:0 0 10px; font-size:.95rem; color:#0f172a; }
    .shc-live-chat__flow-grid { display:grid; grid-template-columns:1fr; gap:10px; }
    .shc-live-chat__flow-grid input { width:100%; min-width:0; border:1px solid #cfdbe8; border-radius:12px; padding:11px 12px; font-size:.92rem; background:#fff; }
    .shc-live-chat__flow-actions { display:flex; gap:8px; flex-wrap:wrap; margin-top:10px; }
    .shc-live-chat__flow-actions button { border:0; border-radius:12px; padding:10px 12px; font-weight:700; cursor:pointer; }
    .shc-live-chat__flow-submit { background:#0f172a; color:#fff; }
    .shc-live-chat__flow-reset { background:#fff; color:#16324f; border:1px solid #d7e3ef !important; }
    .shc-live-chat__flow-error { color:#b91c1c; font-size:.82rem; font-weight:600; margin-top:8px; }
    .shc-live-chat__result-card { border:1px solid #d8e4f2; background:#fff; border-radius:18px; padding:14px; }
    .shc-live-chat__result-top { display:flex; align-items:flex-start; justify-content:space-between; gap:10px; margin-bottom:10px; }
    .shc-live-chat__result-top h4 { margin:2px 0 0; color:#0f172a; font-size:1rem; }
    .shc-live-chat__result-eyebrow { margin:0; font-size:.68rem; letter-spacing:.12em; text-transform:uppercase; color:#51739d; font-weight:700; }
    .shc-live-chat__result-status { border:1px solid #bfdbfe; background:#eff6ff; color:#1d4ed8; border-radius:999px; padding:6px 10px; font-size:.72rem; font-weight:700; }
    .shc-live-chat__result-copy { margin:0 0 12px; font-size:.9rem; color:#334155; }
    .shc-live-chat__result-grid { display:grid; grid-template-columns:1fr 1fr; gap:10px; }
    .shc-live-chat__result-grid span { display:block; font-size:.7rem; text-transform:uppercase; letter-spacing:.08em; color:#64748b; font-weight:700; margin-bottom:3px; }
    .shc-live-chat__result-grid strong { color:#0f172a; font-size:.88rem; line-height:1.4; }
    .shc-live-chat__timeline { display:flex; flex-wrap:wrap; gap:6px; margin-top:12px; }
    .shc-live-chat__timeline-pill { border:1px solid #dbe4f0; background:#f8fafc; color:#334155; border-radius:999px; padding:6px 10px; font-size:.72rem; font-weight:700; }
    .shc-live-chat__composer { display:flex; gap:10px; padding:14px; border-top:1px solid #e2e8f0; background:#fff; }
    .shc-live-chat__composer.hidden { display:none; }
    .shc-live-chat__composer input { flex:1; min-width:0; border:1px solid #cfdbe8; border-radius:14px; padding:12px 14px; font-size:.95rem; }
    .shc-live-chat__composer button { border:0; border-radius:14px; padding:0 16px; background:#0f172a; color:#fff; font-weight:700; cursor:pointer; }
    @media (max-width: 640px) {
      .shc-live-chat { right: 12px !important; left: auto !important; bottom: 12px !important; width: auto !important; }
      .shc-live-chat__toggle { display: inline-flex !important; width: auto !important; min-width: 0 !important; padding: 11px 14px !important; font-size: .86rem; border-radius: 999px; box-shadow: 0 14px 28px rgba(15, 23, 42, 0.2); }
      .shc-live-chat__panel { width: min(360px, calc(100vw - 24px)); max-height: 72vh; margin-bottom: 10px; }
      .shc-live-chat__result-grid { grid-template-columns:1fr; }
    }
  `;
  document.head.appendChild(style);
}

function formatRelativeTimestamp(value) {
  const millis = toMillis(value);
  if (!Number.isFinite(millis)) return "";
  const diff = Math.max(0, Date.now() - millis);
  const seconds = Math.floor(diff / 1000);
  if (seconds < 45) return "Just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} day${days === 1 ? "" : "s"} ago`;
  return new Date(millis).toLocaleString();
}

function formatMessageHtml(text) {
  const escaped = escapeHtml(text || "");
  return escaped.replace(/(https?:\/\/[^\s<]+)/g, (url) => `<a href="${url}" target="_blank" rel="noopener noreferrer" style="color:inherit;text-decoration:underline;font-weight:700;">${url}</a>`);
}

function getMessageGroupKey(message = {}) {
  const senderType = String(message.senderType || "system");
  if (senderType === "system") {
    return `system:${String(message.systemType || "system")}`;
  }
  if (senderType === "admin") {
    return `admin:${String(message.senderName || message.senderUid || "admin")}`;
  }
  if (senderType === "bot") return "bot";
  if (senderType === "user") return "user";
  return senderType;
}

function buildMessageRow(message = {}, showTimestampByDefault = false) {
  const senderType = String(message.senderType || "system");
  const row = document.createElement("div");
  row.className = `shc-live-chat__message-row shc-live-chat__message-row--${senderType}`;

  let contentEl;
  if (senderType === "system") {
    contentEl = document.createElement("div");
    contentEl.className = message.systemType === "admin_joined" ? "shc-live-chat__join-bubble" : "shc-live-chat__system-notice";
    const shouldShowIcon = message.systemType === "admin_joined" || message.systemType === "admin_closed";
    contentEl.innerHTML = `
      ${shouldShowIcon ? `<img src="${escapeHtml(SUPPORT_REP_ICON)}" alt="Support representative" />` : ``}
      <span>${formatMessageHtml(message.text || "")}</span>
    `;
  } else {
    contentEl = document.createElement("div");
    contentEl.className = `shc-live-chat__bubble shc-live-chat__bubble--${senderType}`;
    const header = message.senderName && senderType === "admin"
      ? `<div class="shc-live-chat__meta">${escapeHtml(message.senderName)}</div>`
      : "";
    contentEl.innerHTML = `${header}${formatMessageHtml(message.text || "")}`;
  }
  row.appendChild(contentEl);

  const relativeTime = formatRelativeTimestamp(message.createdAt);
  if (relativeTime) {
    const timestamp = document.createElement("div");
    timestamp.className = `shc-live-chat__timestamp shc-live-chat__timestamp--${senderType}${showTimestampByDefault ? "" : " hidden"}`;
    timestamp.textContent = relativeTime;
    row.appendChild(timestamp);
    contentEl.addEventListener("click", () => {
      timestamp.classList.toggle("hidden");
    });
  }

  return row;
}

function renderMessages(messagesEl, messages = []) {
  messagesEl.innerHTML = "";
  messages.forEach((message, index) => {
    const nextMessage = messages[index + 1];
    const showTimestampByDefault = !nextMessage || getMessageGroupKey(nextMessage) !== getMessageGroupKey(message);
    messagesEl.appendChild(buildMessageRow(message, showTimestampByDefault));
  });
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function resetChatSession(state) {
  state.unsubscribeMessages?.();
  state.unsubscribeChatDoc?.();
  state.unsubscribeMessages = null;
  state.unsubscribeChatDoc = null;
  state.chatId = null;
  state.chatMeta = null;
  state.flow = { type: null };
  clearTimeout(state.typingStopTimer);
  writeStorage(SESSION_KEY, "");
  try {
    window.localStorage.removeItem(SESSION_KEY);
  } catch (_) {}
  state.elements.messages.innerHTML = "";
  state.elements.flowArea.innerHTML = "";
  state.elements.typingIndicator.innerHTML = "";
  state.elements.typingIndicator.classList.add("hidden");
  showQuickActions(state);
  updateComposerVisibility(state);
  appendInitialBotMessage(state);
}

function appendInitialBotMessage(state) {
  renderMessages(state.elements.messages, [
    { senderType: "bot", text: "Hi. Choose one of the options below or type your question." },
  ]);
}

function finishPanelClose(state) {
  state.elements.panel.classList.add("hidden");
  state.elements.panel.classList.remove("shc-live-chat__panel--open");
  state.elements.panel.classList.add("shc-live-chat__panel--closed");
  state.elements.toggle.classList.remove("hidden");
}

function renderTypingIndicator(state) {
  const indicator = state.elements.typingIndicator;
  if (!indicator) return;
  const chat = state.chatMeta || {};
  const typingAt = typeof chat.typingAdminAt?.toMillis === "function" ? chat.typingAdminAt.toMillis() : toMillis(chat.typingAdminAt);
  const isRecent = Number.isFinite(typingAt) && (Date.now() - typingAt) < 6000;
  const isTyping = Boolean(chat.typingAdmin);
  const typingName = String(chat.typingAdminName || chat.assignedAdminName || "Support").trim();
  if (!isTyping || !isRecent || !typingName) {
    indicator.classList.add("hidden");
    indicator.innerHTML = "";
    return;
  }
  indicator.classList.remove("hidden");
  indicator.innerHTML = `
    <img src="${escapeHtml(SUPPORT_REP_ICON)}" alt="Support representative" style="width:20px;height:20px;border-radius:999px;object-fit:cover;" />
    <span>${escapeHtml(typingName)} is typing</span>
    <span class="shc-live-chat__typing-dots"><span></span><span></span><span></span></span>
  `;
}

async function setCustomerTypingState(state, isTyping) {
  if (!state.chatId) return;
  try {
    await updateDoc(doc(db, "chats", state.chatId), {
      typingCustomer: Boolean(isTyping),
      typingCustomerAt: serverTimestamp(),
      typingCustomerName: auth.currentUser?.displayName || auth.currentUser?.email || "Customer",
      updatedAt: serverTimestamp(),
    });
  } catch (_) {}
}

function renderQuickActions(container, onPick) {
  container.innerHTML = QUICK_ACTIONS.map((action) => (
    `<button type="button" class="shc-live-chat__chip" data-chat-action="${escapeHtml(action.id)}">${escapeHtml(action.label)}</button>`
  )).join("");
  container.querySelectorAll("[data-chat-action]").forEach((button) => {
    button.addEventListener("click", () => onPick(button.getAttribute("data-chat-action")));
  });
}

function clearFlowArea(state) {
  state.flow = { type: null };
  if (state.elements.flowArea) {
    state.elements.flowArea.innerHTML = "";
  }
}

function clearResetButton(state) {
  state.elements.flowArea?.querySelectorAll("[data-chat-reset]").forEach((button) => {
    button.closest(".shc-live-chat__flow-actions")?.remove();
  });
}

function showQuickActions(state) {
  renderQuickActions(state.elements.quickActions, async (actionId) => {
    const quickAction = QUICK_ACTIONS.find((item) => item.id === actionId);
    await handleAutoResponse(state, quickAction?.label || actionId, actionId, { fromQuickAction: true });
  });
}

function hideQuickActions(state) {
  state.elements.quickActions.innerHTML = "";
}

function syncQuickActionsForChatState(state) {
  const chat = state.chatMeta || {};
  const isClosed = String(chat.status || "").trim().toLowerCase() === "closed";
  const inHumanSupport = Boolean(chat.handoffRequested || chat.assignedAdminUid);

  if (isClosed || inHumanSupport) {
    hideQuickActions(state);
    if (!isClosed && state.flow?.type !== "support_contact" && state.flow?.type !== "track_order") {
      clearFlowArea(state);
    }
    return;
  }

  if (!state.elements.quickActions.innerHTML.trim()) {
    showQuickActions(state);
  }
}

function renderResetButton(state) {
  if (!state.elements.flowArea) return;
  clearResetButton(state);
  const wrapper = document.createElement("div");
  wrapper.className = "shc-live-chat__flow-actions";
  wrapper.innerHTML = `<button type="button" class="shc-live-chat__flow-reset" data-chat-reset="1">Get help with something else</button>`;
  state.elements.flowArea.appendChild(wrapper);
  wrapper.querySelector("[data-chat-reset]")?.addEventListener("click", async () => {
    clearFlowArea(state);
    showQuickActions(state);
    await addMessage(state, "system", "Choose another option below.");
  });
}

function renderSupportContactFlow(state, config = {}) {
  const user = auth.currentUser;
  const existingName = state.chatMeta?.customerName || user?.displayName || "";
  const existingEmail = state.chatMeta?.customerEmail || user?.email || "";
  const existingPhone = state.chatMeta?.customerPhone || "";
  state.flow = {
    type: "support_contact",
    reason: config.reason || "customer_requested_human",
    initialMessage: config.initialMessage || "You asked for support. A team member will reply here as soon as possible.",
    silent: Boolean(config.silent),
    afterBotCopy: config.afterBotCopy || "I’ve sent this to support. A team member will reply here as soon as possible.",
  };
  state.elements.flowArea.innerHTML = `
    <div class="shc-live-chat__flow-card">
      <h4>Before we connect you</h4>
      <div class="shc-live-chat__flow-grid">
        <input id="shcChatSupportName" type="text" placeholder="Your name" autocomplete="name" value="${escapeHtml(existingName)}" />
        <input id="shcChatSupportEmail" type="email" placeholder="Your email" autocomplete="email" value="${escapeHtml(existingEmail)}" />
        <input id="shcChatSupportPhone" type="tel" placeholder="Phone number (optional)" autocomplete="tel" value="${escapeHtml(existingPhone)}" />
      </div>
      ${config.inlineError ? `<div class="shc-live-chat__flow-error">${escapeHtml(config.inlineError)}</div>` : ""}
      <div class="shc-live-chat__flow-actions">
        <button type="button" class="shc-live-chat__flow-submit" data-chat-support-submit="1">Contact support</button>
      </div>
    </div>
  `;
  state.elements.flowArea.querySelector("[data-chat-support-submit]")?.addEventListener("click", async () => {
    const name = String(state.elements.flowArea.querySelector("#shcChatSupportName")?.value || "").trim();
    const email = String(state.elements.flowArea.querySelector("#shcChatSupportEmail")?.value || "").trim();
    const phone = String(state.elements.flowArea.querySelector("#shcChatSupportPhone")?.value || "").trim();
    if (!name) {
      renderSupportContactFlow(state, { ...state.flow, inlineError: "Please enter your name." });
      return;
    }
    if (!email) {
      renderSupportContactFlow(state, { ...state.flow, inlineError: "Please enter your email." });
      return;
    }
    const flowConfig = { ...state.flow };
    await saveCustomerContact(state, { name, email, phone });
    clearFlowArea(state);
    await setHandoff(state, flowConfig.reason, flowConfig.initialMessage, { silent: flowConfig.silent });
    if (flowConfig.afterBotCopy) {
      await addMessage(state, "bot", flowConfig.afterBotCopy);
    }
  });
}

async function clearRequestedTrackOrderFlow(state) {
  if (!state.chatId) return;
  try {
    await updateDoc(doc(db, "chats", state.chatId), {
      requestedFlow: null,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    console.warn("Failed to clear requested track order flow:", error);
  }
}

function renderTrackOrderFlow(state, inlineError = "") {
  state.flow = { type: "track_order" };
  state.elements.flowArea.innerHTML = `
    <div class="shc-live-chat__flow-card">
      <h4>Track your order</h4>
      <div class="shc-live-chat__flow-grid">
        <input id="shcChatTrackOrderId" type="text" placeholder="Order number (e.g. SHC-12345 or 12345)" autocomplete="off" />
        <input id="shcChatTrackEmail" type="email" placeholder="Email used for the order" autocomplete="email" />
      </div>
      ${inlineError ? `<div class="shc-live-chat__flow-error">${escapeHtml(inlineError)}</div>` : ""}
      <div class="shc-live-chat__flow-actions">
        <button type="button" class="shc-live-chat__flow-submit" data-chat-track-submit="1">Check status</button>
      </div>
    </div>
  `;
  state.elements.flowArea.querySelector("[data-chat-track-submit]")?.addEventListener("click", async () => {
    const orderIdInput = state.elements.flowArea.querySelector("#shcChatTrackOrderId");
    const emailInput = state.elements.flowArea.querySelector("#shcChatTrackEmail");
    const normalizedOrderId = normalizeOrderIdInput(orderIdInput?.value || "");
    const email = String(emailInput?.value || "").trim();

    if (!normalizedOrderId) {
      renderTrackOrderFlow(state, "Please enter your order number.");
      return;
    }
    if (!email) {
      renderTrackOrderFlow(state, "Please enter the email used on the order.");
      return;
    }

    if (orderIdInput) orderIdInput.value = normalizedOrderId;

    try {
      const order = await fetchTrackedOrder(normalizedOrderId, email);
      await addMessage(state, "user", `Order lookup details\nOrder number: ${normalizedOrderId}\nEmail: ${email}`);
      await clearRequestedTrackOrderFlow(state);
      clearFlowArea(state);
      state.flow = null;
      await addMessage(state, "bot", `I found order ${normalizedOrderId}. Your current step is ${friendlyTrackStatus(normalize(String(order.status || "").replace(/-/g, "_")) || "order_pending").toLowerCase()}.`);
    } catch (error) {
      renderTrackOrderFlow(state, error?.message || "Unable to find your order. Please double-check the details.");
    }
  });
}

function subscribeToMessages(state) {
  if (!state.chatId || state.unsubscribeMessages) return;
  const messagesEl = state.elements.messages;
  const messagesQuery = query(collection(db, `chats/${state.chatId}/messages`), orderBy("createdAt", "asc"));
  state.unsubscribeMessages = onSnapshot(messagesQuery, (snapshot) => {
    const messages = snapshot.docs
      .map((messageDoc) => ({ id: messageDoc.id, ...(messageDoc.data() || {}) }))
      .filter((message) => !message.internalOnly);
    renderMessages(messagesEl, messages);
  });

  state.unsubscribeChatDoc = onSnapshot(doc(db, "chats", state.chatId), (chatSnap) => {
    if (!chatSnap.exists()) return;
    state.chatMeta = chatSnap.data() || {};
    const isClosed = String(state.chatMeta.status || "").trim().toLowerCase() === "closed";
    const requestedFlow = state.chatMeta?.requestedFlow || null;
    syncQuickActionsForChatState(state);
    if (state.chatMeta.assignedAdminUid || state.chatMeta.handoffRequested) {
      clearResetButton(state);
    }
    if (!isClosed && requestedFlow?.type === "track_order" && state.flow?.requestKey !== requestedFlow.requestKey) {
      hideQuickActions(state);
      renderTrackOrderFlow(state);
      state.flow = { ...(state.flow || {}), type: "track_order", requestKey: requestedFlow.requestKey };
    }
    if (isClosed) {
      state.elements.quickActions.innerHTML = "";
      state.elements.flowArea.innerHTML = `
        <div class="shc-live-chat__flow-card">
          <h4>Chat closed</h4>
          <p>This conversation has been closed by support. If you still need help, you can start a new chat below.</p>
          <div class="shc-live-chat__flow-actions">
            <button type="button" class="shc-live-chat__flow-submit" data-chat-start-new="1">Start new chat</button>
          </div>
        </div>
      `;
      state.elements.flowArea.querySelector("[data-chat-start-new]")?.addEventListener("click", () => {
        resetChatSession(state);
      });
    }
    updateComposerVisibility(state);
    renderTypingIndicator(state);
  });
}

async function handleAutoResponse(state, rawText, explicitIntent = null, options = {}) {
  const text = String(rawText || "").trim();
  if (!text) return;

  const intent = explicitIntent || detectIntent(text);
  await addMessage(state, "user", text, { intent: intent || "unknown" });

  if (options?.fromQuickAction) {
    hideQuickActions(state);
  }

  if (intent === "track_order") {
    await addMessage(state, "bot", "Enter your order number and the email used on the order below.");
    renderTrackOrderFlow(state);
    return;
  }

  if (intent === "human") {
    clearResetButton(state);
    hideQuickActions(state);
    await addMessage(state, "bot", "I can connect you with a team member. First, I need your name and email.");
    renderSupportContactFlow(state, {
      reason: "customer_requested_human",
      initialMessage: "You asked for support. A team member will reply here as soon as possible.",
      afterBotCopy: "I’ve sent this to support. A team member will reply here as soon as possible.",
    });
    return;
  }

  if (intent && BOT_RESPONSES[intent]) {
    const response = BOT_RESPONSES[intent].body;
    await addMessage(state, "bot", response, { intent });
    if (intent === "track_order" || intent === "shipping_help" || intent === "reoffer_help") {
      await addMessage(state, "system", "If you want a person to review your exact case, type your order ID or press Talk to support.");
    }
    renderResetButton(state);
    return;
  }

  const normalized = text.toLowerCase();
  if (/\b(shc-\d+)\b/i.test(normalized)) {
    clearResetButton(state);
    hideQuickActions(state);
    await addMessage(state, "bot", "Thanks. I see you included an order ID. A support team member should review that directly. First, I need your name and email.");
    renderSupportContactFlow(state, {
      reason: "order_specific_question",
      initialMessage: `Customer shared an order reference: ${text}`,
      afterBotCopy: "I’ve sent this to support so a team member can review your order details here.",
    });
    return;
  }

  clearResetButton(state);
  hideQuickActions(state);
  await addMessage(state, "bot", "I’m not fully confident on that one. I can send this to support, but first I need your name and email.");
  renderSupportContactFlow(state, {
    reason: "low_confidence",
    initialMessage: "",
    silent: true,
    afterBotCopy: "I’ve sent this to support so a team member can reply here.",
  });
}

async function bootWidget() {
  injectStyles();

  const state = {
    chatId: readStorage(SESSION_KEY),
    unsubscribeMessages: null,
    unsubscribeChatDoc: null,
    chatMeta: null,
    typingStopTimer: null,
    flow: { type: null },
    elements: {},
  };

  const mount = document.createElement("div");
  mount.innerHTML = buildWidgetMarkup();
  document.body.appendChild(mount.firstElementChild);

  state.elements.root = document.getElementById("shcLiveChatRoot");
  state.elements.toggle = document.getElementById("shcLiveChatToggle");
  state.elements.panel = document.getElementById("shcLiveChatPanel");
  state.elements.close = document.getElementById("shcLiveChatClose");
  state.elements.messages = document.getElementById("shcLiveChatMessages");
  state.elements.typingIndicator = document.getElementById("shcLiveChatTypingIndicator");
  state.elements.flowArea = document.getElementById("shcLiveChatFlowArea");
  state.elements.quickActions = document.getElementById("shcLiveChatQuickActions");
  state.elements.form = document.getElementById("shcLiveChatForm");
  state.elements.input = document.getElementById("shcLiveChatInput");

  const openWidget = () => {
    state.elements.toggle.classList.add("hidden");
    state.elements.panel.classList.remove("hidden");
    window.requestAnimationFrame(() => {
      state.elements.panel.classList.remove("shc-live-chat__panel--closed");
      state.elements.panel.classList.add("shc-live-chat__panel--open");
    });
    writeStorage(WIDGET_STATE_KEY, "1");
    if (!state.chatId) {
      appendInitialBotMessage(state);
    } else {
      subscribeToMessages(state);
    }
    updateComposerVisibility(state);
  };

  const closeWidget = () => {
    state.elements.panel.classList.remove("shc-live-chat__panel--open");
    state.elements.panel.classList.add("shc-live-chat__panel--closed");
    window.setTimeout(() => {
      if (readStorage(WIDGET_STATE_KEY) === "0") {
        finishPanelClose(state);
      }
    }, 220);
    writeStorage(WIDGET_STATE_KEY, "0");
  };

  state.elements.toggle.addEventListener("click", openWidget);
  state.elements.close.addEventListener("click", closeWidget);
  state.elements.form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (String(state.chatMeta?.status || "").trim().toLowerCase() === "closed") return;
    const value = state.elements.input.value.trim();
    if (!value) return;
    state.elements.input.value = "";
    clearTimeout(state.typingStopTimer);
    void setCustomerTypingState(state, false);
    if (state.chatMeta?.handoffRequested || state.chatMeta?.assignedAdminUid) {
      await addMessage(state, "user", value, { intent: "human_followup" });
      return;
    }
    await handleAutoResponse(state, value, null);
  });

  state.elements.input.addEventListener("input", async () => {
    if (String(state.chatMeta?.status || "").trim().toLowerCase() === "closed") return;
    const value = state.elements.input.value.trim();
    if (!state.chatId && !value) return;
    if (!value) {
      clearTimeout(state.typingStopTimer);
      void setCustomerTypingState(state, false);
      return;
    }
    await ensureChatSession(state);
    void setCustomerTypingState(state, true);
    clearTimeout(state.typingStopTimer);
    state.typingStopTimer = window.setTimeout(() => {
      void setCustomerTypingState(state, false);
    }, 1800);
  });

  if (state.chatId) {
    subscribeToMessages(state);
  } else {
    showQuickActions(state);
  }
  syncQuickActionsForChatState(state);
  updateComposerVisibility(state);

  if (readStorage(WIDGET_STATE_KEY) === "1") {
    openWidget();
  }
}

if (typeof window !== "undefined" && typeof document !== "undefined") {
  window.addEventListener("DOMContentLoaded", () => {
    void bootWidget();
  });
}
