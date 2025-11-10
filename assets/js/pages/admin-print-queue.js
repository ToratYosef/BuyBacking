import { firebaseApp } from "/assets/js/firebase-app.js";
import { gatherOrderLabelUrls } from "/assets/js/pdf/order-labels.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";

const auth = getAuth(firebaseApp);

const API_BASE =
  (typeof window !== "undefined" && (window.API_BASE || window.CLOUD_FUNCTIONS_BASE)) ||
  "https://us-central1-buyback-a0f05.cloudfunctions.net/api";

const ICON_REFRESH = '<svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12a7.5 7.5 0 0 1 12.73-5.303L19.5 9M19.5 9V4.5M19.5 9h-4.5m-3 10.5A7.5 7.5 0 0 1 4.5 12l2.27-2.303M4.5 12H9m0 0v4.5" /></svg>';
const ICON_PRINTER = '<svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M7.5 8.25V4.5h9v3.75M6 12h12a2.25 2.25 0 0 1 2.25 2.25v4.5A2.25 2.25 0 0 1 18 21H6a2.25 2.25 0 0 1-2.25-2.25v-4.5A2.25 2.25 0 0 1 6 12zm1.5 4.5h3m3 0h3" /></svg>';
const ICON_SPINNER = '<svg class="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle class="opacity-30" cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.5"></circle><path class="opacity-80" d="M21 12a9 9 0 0 1-9 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"></path></svg>';

const REFRESH_BUTTON_IDLE = `${ICON_REFRESH} Refresh`;
const REFRESH_BUTTON_BUSY = `${ICON_SPINNER} Refreshing`;
const PRINT_BUTTON_IDLE = `${ICON_PRINTER} Print All`;
const PRINT_BUTTON_BUSY = `${ICON_SPINNER} Preparing PDF`;

const queuedCountEl = document.getElementById("queued-count");
const labelCountEl = document.getElementById("label-count");
const lastSyncEl = document.getElementById("last-sync");
const queueStatusEl = document.getElementById("queue-status");
const tableBody = document.getElementById("print-queue-table");
const emptyStateEl = document.getElementById("empty-state");
const refreshBtn = document.getElementById("refresh-btn");
const printAllBtn = document.getElementById("print-all-btn");
const logoutBtn = document.getElementById("logout-btn");
const displayUserIdEl = document.getElementById("display-user-id");
const loadingOverlay = document.getElementById("auth-loading-screen");
const printFrame = document.getElementById("print-preview-frame");

let queueOrders = [];
let isLoadingQueue = false;
let isPrinting = false;

const STATUS_LABELS = {
  shipping_kit_requested: "Shipping Kit Requested",
  kit_needs_printing: "Kit Needs Printing",
  needs_printing: "Needs Printing",
  kit_sent: "Kit Sent",
  label_generated: "Label Generated",
};

function toMillis(value) {
  if (!value) return null;
  if (typeof value === "number") return value;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (typeof value === "object") {
    const seconds = value._seconds ?? value.seconds ?? null;
    if (typeof seconds === "number") {
      const nanos = value._nanoseconds ?? value.nanoseconds ?? 0;
      return seconds * 1000 + Math.floor(nanos / 1e6);
    }
  }
  return null;
}

function resolveCreatedAtMillis(order = {}) {
  const candidates = [
    order.createdAt,
    order.created_at,
    order.createdAtMillis,
    order.createdAtMs,
    order.created_at_ms,
    order.created_at_millis,
  ];

  for (const candidate of candidates) {
    const millis = toMillis(candidate);
    if (millis) return millis;
  }

  if (typeof order.createdAtSeconds === "number") {
    return order.createdAtSeconds * 1000;
  }

  return null;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatStatus(status) {
  if (!status) return "—";
  const normalised = STATUS_LABELS[status];
  if (normalised) return normalised;
  return status
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatDate(millis) {
  if (!millis) return "—";
  try {
    const date = new Date(millis);
    if (Number.isNaN(date.getTime())) return "—";
    return date.toLocaleString([], { hour: "numeric", minute: "2-digit", month: "short", day: "numeric" });
  } catch (error) {
    return "—";
  }
}

function normaliseEmail(value) {
  if (!value) return "—";
  return value.toLowerCase();
}

function formatLocation(info = {}) {
  const parts = [info.city, info.state].filter(Boolean);
  return parts.length ? parts.join(", ") : "—";
}

function updateStats() {
  const queuedTotal = queueOrders.length;
  const labelTotal = queueOrders.reduce((sum, order) => sum + (Array.isArray(order.labelUrls) ? order.labelUrls.length : 0), 0);

  queuedCountEl.textContent = queuedTotal;
  labelCountEl.textContent = labelTotal;

  if (queuedTotal) {
    queueStatusEl.textContent = `Ready to batch ${queuedTotal} order${queuedTotal === 1 ? "" : "s"}.`;
  } else if (!isLoadingQueue) {
    queueStatusEl.textContent = "All caught up — no pending labels.";
  }

  lastSyncEl.textContent = new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  updatePrintButtonState();
}

function renderTable() {
  if (!tableBody) return;
  if (!queueOrders.length) {
    tableBody.innerHTML = "";
    emptyStateEl?.classList.remove("hidden");
    return;
  }

  emptyStateEl?.classList.add("hidden");

  const rows = queueOrders.map((order) => {
    const deviceSummary = [order.device, order.storage].filter(Boolean).join(" · ") || "—";
    const payout = order.estimatedQuote != null && !Number.isNaN(Number(order.estimatedQuote))
      ? `$${Number(order.estimatedQuote).toFixed(2)}`
      : "—";
    const labelCount = Array.isArray(order.labelUrls) ? order.labelUrls.length : 0;
    const customer = order.shippingInfo || {};
    const email = customer.email ? `<span class="block text-xs text-slate-300/60">${escapeHtml(normaliseEmail(customer.email))}</span>` : "";
    const location = formatLocation(customer);

    return `
      <tr>
        <td class="px-6 py-4 align-top">
          <div class="font-semibold text-white">${escapeHtml(order.id || "—")}</div>
          <div class="text-xs text-slate-300/60">${escapeHtml(order.shippingPreference || "")}</div>
        </td>
        <td class="px-6 py-4 align-top">
          <div class="font-semibold">${escapeHtml(customer.fullName || customer.name || "—")}</div>
          ${email}
          <span class="block text-xs text-slate-300/60">${escapeHtml(location)}</span>
        </td>
        <td class="px-6 py-4 align-top">
          <div>${escapeHtml(deviceSummary)}</div>
          <span class="block text-xs text-slate-300/60">${escapeHtml(payout)}</span>
        </td>
        <td class="px-6 py-4 align-top">
          <span class="status-pill">${escapeHtml(formatStatus(order.status))}</span>
        </td>
        <td class="px-6 py-4 align-top">
          <div class="font-semibold">${labelCount} label${labelCount === 1 ? "" : "s"}</div>
          <span class="block text-xs text-slate-300/60">Includes order info & bag labels</span>
        </td>
        <td class="px-6 py-4 align-top text-right text-slate-200/80">${escapeHtml(formatDate(order.createdAtMillis))}</td>
      </tr>
    `;
  });

  tableBody.innerHTML = rows.join("");
}

function setQueueLoading(state) {
  isLoadingQueue = state;
  if (refreshBtn) {
    refreshBtn.disabled = state;
    refreshBtn.innerHTML = state ? REFRESH_BUTTON_BUSY : REFRESH_BUTTON_IDLE;
  }
  updatePrintButtonState();
}

function updatePrintButtonState() {
  if (!printAllBtn) return;
  const disabled = isLoadingQueue || isPrinting || !queueOrders.length;
  printAllBtn.disabled = disabled;
  printAllBtn.innerHTML = isPrinting ? PRINT_BUTTON_BUSY : PRINT_BUTTON_IDLE;
}

function buildApiUrl(path = "") {
  if (/^https?:\/\//i.test(path)) {
    return path;
  }
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${API_BASE}${normalized}`;
}

async function fetchQueueOrders() {
  const response = await fetch(buildApiUrl("/orders/needs-printing"));
  if (!response.ok) {
    let details = '';
    try {
      const errorPayload = await response.json();
      details = errorPayload?.error || '';
    } catch (_) {
      details = '';
    }
    throw new Error(details || `Request failed with status ${response.status}`);
  }

  let payload;
  try {
    payload = await response.json();
  } catch (error) {
    throw new Error(`Unable to parse print queue response: ${error.message || error}`);
  }

  const orders = Array.isArray(payload?.orders) ? payload.orders : [];
  const normalised = orders.map((order) => {
    const entry = { ...order };
    entry.createdAtMillis = resolveCreatedAtMillis(entry);
    if (!Array.isArray(entry.labelUrls) || !entry.labelUrls.length) {
      entry.labelUrls = gatherOrderLabelUrls(entry);
    }
    return entry;
  });

  normalised.sort((a, b) => {
    const aMillis = a.createdAtMillis ?? Number.MAX_SAFE_INTEGER;
    const bMillis = b.createdAtMillis ?? Number.MAX_SAFE_INTEGER;
    return aMillis - bMillis;
  });

  return normalised;
}

async function loadQueue() {
  setQueueLoading(true);
  try {
    const orders = await fetchQueueOrders();
    queueOrders = orders.map((order) => ({
      ...order,
      labelUrls: gatherOrderLabelUrls(order),
    }));
    renderTable();
    updateStats();
    if (!queueOrders.length) {
      queueStatusEl.textContent = "All caught up — no pending labels.";
    }
  } catch (error) {
    console.error("Failed to load print queue:", error);
    queueStatusEl.textContent = "Unable to load the print queue. Please refresh.";
  } finally {
    setQueueLoading(false);
  }
}

function openPrintPreview(bytes) {
  const blob = new Blob([bytes], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const frame = printFrame;
  if (!frame) {
    window.open(url, "_blank");
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    return;
  }

  frame.classList.remove("hidden");
  frame.src = url;
  frame.onload = () => {
    try {
      frame.contentWindow?.focus();
      frame.contentWindow?.print();
    } catch (error) {
      console.warn("Unable to trigger print automatically:", error);
      window.open(url, "_blank");
    }
    setTimeout(() => {
      URL.revokeObjectURL(url);
      frame.classList.add("hidden");
    }, 60000);
  };
}

async function downloadPrintBundle(orderIds) {
  const response = await fetch(buildApiUrl("/orders/needs-printing/bundle"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ orderIds }),
  });

  if (!response.ok) {
    let details = "";
    try {
      const payload = await response.json();
      details = payload?.error || payload?.message || "";
    } catch (_) {
      details = "";
    }
    throw new Error(details || `Failed to prepare print bundle (${response.status})`);
  }

  const buffer = await response.arrayBuffer();
  let printedOrderIds = [];
  const headerValue = response.headers.get("X-Printed-Order-Ids");
  if (headerValue) {
    try {
      const parsed = JSON.parse(headerValue);
      if (Array.isArray(parsed)) {
        printedOrderIds = parsed;
      }
    } catch (error) {
      console.warn("Unable to parse X-Printed-Order-Ids header:", error);
    }
  }

  return { bytes: new Uint8Array(buffer), printedOrderIds };
}

async function handleBatchPrint() {
  if (!queueOrders.length || isPrinting) {
    return;
  }

  isPrinting = true;
  updatePrintButtonState();
  queueStatusEl.textContent = "Preparing merged PDF bundle…";

  let refreshAfterPrint = false;

  try {
    const orderIds = queueOrders.map((order) => order.id).filter(Boolean);
    if (!orderIds.length) {
      queueStatusEl.textContent = "No printable orders in the queue.";
      return;
    }

    const { bytes, printedOrderIds } = await downloadPrintBundle(orderIds);
    openPrintPreview(bytes);

    if (printedOrderIds.length) {
      queueStatusEl.textContent = `Merged ${printedOrderIds.length} order${printedOrderIds.length === 1 ? "" : "s"} into a single PDF.`;
    } else {
      queueStatusEl.textContent = "Merged print bundle generated.";
    }
    refreshAfterPrint = true;
  } catch (error) {
    console.error("Failed to merge labels:", error);
    queueStatusEl.textContent = "Failed to merge labels. Please try again.";
  } finally {
    isPrinting = false;
    updatePrintButtonState();
    if (refreshAfterPrint) {
      loadQueue();
    }
  }
}

function attachEventListeners() {
  if (logoutBtn) {
    logoutBtn.addEventListener("click", async () => {
      await signOut(auth);
    });
  }

  if (refreshBtn) {
    refreshBtn.addEventListener("click", () => {
      if (!isLoadingQueue) {
        loadQueue();
      }
    });
    refreshBtn.innerHTML = REFRESH_BUTTON_IDLE;
  }

  if (printAllBtn) {
    printAllBtn.addEventListener("click", handleBatchPrint);
    printAllBtn.innerHTML = PRINT_BUTTON_IDLE;
  }
}

function initialise() {
  attachEventListeners();

  onAuthStateChanged(auth, (user) => {
    if (!user) {
      window.location.href = "/login.html";
      return;
    }

    if (displayUserIdEl) {
      displayUserIdEl.textContent = user.email || user.uid || "Unknown user";
    }

    loadingOverlay?.classList.add("hidden");
    loadQueue();
  });
}

initialise();
