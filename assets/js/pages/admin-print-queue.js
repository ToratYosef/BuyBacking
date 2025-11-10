(() => {
  const CLOUD_FN_BASE = "https://us-central1-buyback-a0f05.cloudfunctions.net/api";
  const originalFetch = window.fetch.bind(window);

  function shouldRewrite(url) {
    try {
      const parsed = new URL(url, window.location.href);
      const path = parsed.pathname.replace(/^\/+/, "/");
      return path === "/api" || path.startsWith("/api/") || path.startsWith("admin/api/");
    } catch (error) {
      return false;
    }
  }

  function rewriteUrl(url) {
    const parsed = new URL(url, window.location.href);
    let path = parsed.pathname.replace(/^\/+/, "/");
    if (path.startsWith("admin/api/")) {
      path = path.replace("admin/api/", "api/");
    }
    if (path === "admin/api") {
      path = "api";
    }
    const rewritten = new URL(path.replace(/^api/, ""), CLOUD_FN_BASE);
    rewritten.search = parsed.search;
    rewritten.hash = parsed.hash;
    return rewritten.toString();
  }

  window.fetch = (input, init) => {
    try {
      const url = typeof input === "string" ? input : input?.url;
      if (url && shouldRewrite(url)) {
        const rewritten = rewriteUrl(url);
        if (typeof input === "string") {
          return originalFetch(rewritten, init);
        }
        const request = new Request(rewritten, input);
        return originalFetch(request, init);
      }
    } catch (error) {
      console.warn("Print queue fetch shim failed to rewrite URL", error);
    }
    return originalFetch(input, init);
  };
})();

const API_BASE = "https://us-central1-buyback-a0f05.cloudfunctions.net/api";

import { firebaseApp } from "/assets/js/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";

const auth = getAuth(firebaseApp);

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

const REFRESH_BUTTON_IDLE = '<i class="fa-solid fa-rotate"></i> Refresh';
const REFRESH_BUTTON_BUSY = '<i class="fa-solid fa-rotate fa-spin"></i> Refreshing';
const PRINT_BUTTON_IDLE = '<i class="fa-solid fa-file-pdf"></i> Print All';
const PRINT_BUTTON_BUSY = '<i class="fa-solid fa-spinner fa-spin"></i> Preparing PDF';

let queueOrders = [];
let isLoadingQueue = false;
let isPrinting = false;
let currentPrintUrl = null;

const STATUS_LABELS = {
  shipping_kit_requested: "Shipping Kit Requested",
  kit_needs_printing: "Kit Needs Printing",
  needs_printing: "Needs Printing",
  kit_sent: "Kit Sent",
  label_generated: "Label Generated",
};

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
          <div class="font-semibold">${labelCount} shipping label${labelCount === 1 ? "" : "s"}</div>
          <span class="block text-xs text-slate-300/60">Includes packing + bag tags</span>
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

function setPrinting(state) {
  isPrinting = state;
  if (printAllBtn) {
    printAllBtn.disabled = state || !queueOrders.length;
    printAllBtn.innerHTML = state ? PRINT_BUTTON_BUSY : PRINT_BUTTON_IDLE;
  }
}

function updatePrintButtonState() {
  if (!printAllBtn) return;
  if (isPrinting) return;
  printAllBtn.disabled = isLoadingQueue || queueOrders.length === 0;
  printAllBtn.innerHTML = PRINT_BUTTON_IDLE;
}

async function fetchQueue() {
  setQueueLoading(true);
  try {
    queueStatusEl.textContent = "Loading queue…";
    const response = await fetch(`${API_BASE}/orders/needs-printing`);
    if (!response.ok) {
      throw new Error(`Request failed (${response.status})`);
    }
    const payload = await response.json();
    queueOrders = Array.isArray(payload?.orders) ? payload.orders : [];
    queueOrders.sort((a, b) => {
      const aMillis = typeof a?.createdAtMillis === "number" ? a.createdAtMillis : Number.MAX_SAFE_INTEGER;
      const bMillis = typeof b?.createdAtMillis === "number" ? b.createdAtMillis : Number.MAX_SAFE_INTEGER;
      return aMillis - bMillis;
    });
    renderTable();
    updateStats();
  } catch (error) {
    console.error("Failed to load print queue:", error);
    queueStatusEl.textContent = "Unable to load queue. Please try again.";
    queueOrders = [];
    renderTable();
    updateStats();
  } finally {
    setQueueLoading(false);
  }
}

function waitForFrameLoad(frame, url) {
  return new Promise((resolve, reject) => {
    const handleLoad = () => {
      cleanup();
      resolve(frame.contentWindow);
    };
    const handleError = () => {
      cleanup();
      reject(new Error("Failed to load merged PDF"));
    };
    const cleanup = () => {
      frame.removeEventListener("load", handleLoad);
      frame.removeEventListener("error", handleError);
    };
    frame.addEventListener("load", handleLoad);
    frame.addEventListener("error", handleError);
    frame.src = url;
  });
}

async function handleBatchPrint() {
  if (!queueOrders.length || isPrinting) {
    return;
  }

  setPrinting(true);
  queueStatusEl.textContent = "Preparing combined PDF…";

  try {
    const orderIds = queueOrders.map((order) => order.id);
    const response = await fetch(`${API_BASE}/orders/needs-printing/bundle`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderIds }),
    });

    if (!response.ok) {
      throw new Error(`Bundle request failed (${response.status})`);
    }

    const blob = await response.blob();
    if (currentPrintUrl) {
      URL.revokeObjectURL(currentPrintUrl);
    }
    currentPrintUrl = URL.createObjectURL(blob);
    const frameWindow = await waitForFrameLoad(printFrame, currentPrintUrl);
    printFrame.classList.remove("hidden");

    try {
      frameWindow?.focus();
      frameWindow?.print();
    } catch (error) {
      console.warn("Unable to open print dialog automatically:", error);
    }

    queueStatusEl.textContent = `Merged ${orderIds.length} order${orderIds.length === 1 ? "" : "s"} into a single PDF.`;
  } catch (error) {
    console.error("Failed to merge labels:", error);
    queueStatusEl.textContent = "Printing failed — please try again.";
    alert("Unable to prepare the merged PDF. Please try again.");
  } finally {
    setPrinting(false);
  }
}

if (refreshBtn) {
  refreshBtn.addEventListener("click", () => {
    if (!isLoadingQueue) {
      fetchQueue();
    }
  });
}

if (printAllBtn) {
  printAllBtn.addEventListener("click", handleBatchPrint);
}

if (logoutBtn) {
  logoutBtn.addEventListener("click", async () => {
    try {
      await signOut(auth);
      window.location.href = "/index.html";
    } catch (error) {
      console.error("Failed to sign out:", error);
    }
  });
}

window.addEventListener("beforeunload", () => {
  if (currentPrintUrl) {
    URL.revokeObjectURL(currentPrintUrl);
  }
});

onAuthStateChanged(auth, (user) => {
  if (!user || user.isAnonymous) {
    window.location.href = "/index.html";
    return;
  }

  if (displayUserIdEl) {
    displayUserIdEl.textContent = user.email || user.uid;
  }
  loadingOverlay?.classList.add("hidden");
  fetchQueue();
});
