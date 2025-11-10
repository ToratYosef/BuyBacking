import { firebaseApp } from "/assets/js/firebase-app.js";
import { createOrderInfoLabelPdf, createBagLabelPdf, gatherOrderLabelUrls, serialiseQueueOrder } from "/assets/js/pdf/order-labels.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, collection, query, where, getDocs } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

const auth = getAuth(firebaseApp);
const db = getFirestore(firebaseApp);

const PRINT_QUEUE_STATUSES = ["shipping_kit_requested", "kit_needs_printing", "needs_printing"];

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

async function fetchQueueOrders() {
  const results = new Map();

  await Promise.all(
    PRINT_QUEUE_STATUSES.map(async (status) => {
      try {
        const snapshot = await getDocs(query(collection(db, "orders"), where("status", "==", status)));
        snapshot.docs.forEach((doc) => {
          const payload = serialiseQueueOrder(doc);
          if (!payload) return;
          payload.createdAtMillis = resolveCreatedAtMillis(payload);
          results.set(payload.id, payload);
        });
      } catch (error) {
        console.error(`Failed to load ${status} orders for print queue:`, error);
      }
    })
  );

  const orders = Array.from(results.values());
  orders.sort((a, b) => {
    const aMillis = a.createdAtMillis ?? Number.MAX_SAFE_INTEGER;
    const bMillis = b.createdAtMillis ?? Number.MAX_SAFE_INTEGER;
    return aMillis - bMillis;
  });
  return orders;
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

async function fetchPdfBytes(url) {
  const response = await fetch(url, { mode: "cors" });
  if (!response.ok) {
    throw new Error(`Failed to download PDF (${response.status})`);
  }
  const buffer = await response.arrayBuffer();
  return new Uint8Array(buffer);
}

async function appendPdfPages(targetDoc, sourceBytes) {
  if (!sourceBytes) return;
  const pdf = await PDFLib.PDFDocument.load(sourceBytes);
  const copied = await targetDoc.copyPages(pdf, pdf.getPageIndices());
  copied.forEach((page) => targetDoc.addPage(page));
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

async function handleBatchPrint() {
  if (!queueOrders.length || isPrinting) {
    return;
  }

  isPrinting = true;
  updatePrintButtonState();
  queueStatusEl.textContent = "Preparing merged PDF bundle…";

  try {
    const mergedPdf = await PDFLib.PDFDocument.create();
    const printableOrders = [];

    for (const order of queueOrders) {
      const labelUrls = gatherOrderLabelUrls(order);
      if (!labelUrls.length) {
        console.warn(`No label URLs found for order ${order.id}`);
        continue;
      }

      const labelBuffers = await Promise.all(
        labelUrls.map(async (url) => {
          try {
            return await fetchPdfBytes(url);
          } catch (error) {
            console.error(`Failed to fetch label ${url} for order ${order.id}:`, error);
            return null;
          }
        })
      );

      const validBuffers = labelBuffers.filter(Boolean);
      if (!validBuffers.length) {
        continue;
      }

      for (const bytes of validBuffers) {
        await appendPdfPages(mergedPdf, bytes);
      }

      try {
        const infoLabel = await createOrderInfoLabelPdf(order);
        await appendPdfPages(mergedPdf, infoLabel);
      } catch (error) {
        console.error(`Failed to build order info label for ${order.id}:`, error);
      }

      try {
        const bagLabel = await createBagLabelPdf(order);
        await appendPdfPages(mergedPdf, bagLabel);
      } catch (error) {
        console.error(`Failed to build bag label for ${order.id}:`, error);
      }

      printableOrders.push(order.id);
    }

    if (!printableOrders.length) {
      queueStatusEl.textContent = "No printable documents were generated. Please verify label URLs.";
      return;
    }

    const mergedBytes = await mergedPdf.save();
    openPrintPreview(mergedBytes);
    queueStatusEl.textContent = `Merged ${printableOrders.length} order${printableOrders.length === 1 ? "" : "s"} into a single PDF.`;
  } catch (error) {
    console.error("Failed to merge labels:", error);
    queueStatusEl.textContent = "Failed to merge labels. Please try again.";
  } finally {
    isPrinting = false;
    updatePrintButtonState();
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
