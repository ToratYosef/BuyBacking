import { app, db } from "../firebase-config.js";
import { gatherOrderLabelUrls, serialiseQueueOrder } from "/assets/js/pdf/order-labels.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { apiRaw } from "/public/js/apiClient.js";

const auth = getAuth(app);

const PRINT_QUEUE_STATUSES = ["shipping_kit_requested", "kit_needs_printing", "needs_printing"];

const ICON_PRINTER = '<svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M7.5 8.25V4.5h9v3.75M6 12h12a2.25 2.25 0 0 1 2.25 2.25v4.5A2.25 2.25 0 0 1 18 21H6a2.25 2.25 0 0 1-2.25-2.25v-4.5A2.25 2.25 0 0 1 6 12zm1.5 4.5h3m3 0h3" /></svg>';
const ICON_SPINNER = '<svg class="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle class="opacity-30" cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.5"></circle><path class="opacity-80" d="M21 12a9 9 0 0 1-9 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"></path></svg>';

const PRINT_BUTTON_BUSY = `${ICON_SPINNER} Preparing PDF`;

const queuedCountEl = document.getElementById("queued-count");
const labelCountEl = document.getElementById("label-count");
const selectedCountEl = document.getElementById("selected-count");
const lastSyncEl = document.getElementById("last-sync");
const queueStatusEl = document.getElementById("queue-status");
const tableBody = document.getElementById("print-queue-table");
const emptyStateEl = document.getElementById("empty-state");
const printAllBtn = document.getElementById("print-all-btn");
const resetLabelGeneratedBtn = document.getElementById("reset-label-generated-btn");
const selectAllCheckbox = document.getElementById("select-all-checkbox");
const logoutBtn = document.getElementById("logout-btn");
const displayUserIdEl = document.getElementById("display-user-id");
const loadingOverlay = document.getElementById("auth-loading-screen");
const printFrame = document.getElementById("print-preview-frame");

let queueOrders = [];
let isLoadingQueue = false;
let isPrinting = false;
let isRepairing = false;
const selectedOrderIds = new Set();

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

  lastSyncEl.textContent = new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  updateSelectionUi();
}

function updateSelectionUi() {
  const selectedTotal = selectedOrderIds.size;

  if (selectedCountEl) {
    selectedCountEl.textContent = selectedTotal;
  }

  updateSelectAllState();
  updatePrintButtonState();

  if (isPrinting) {
    return;
  }

  if (!queueOrders.length && !isLoadingQueue) {
    queueStatusEl.textContent = "All caught up — no pending labels.";
    return;
  }

  if (selectedTotal) {
    queueStatusEl.textContent = `Ready to batch ${selectedTotal} selected order${selectedTotal === 1 ? "" : "s"}.`;
  } else if (queueOrders.length) {
    queueStatusEl.textContent = "Select orders to include in the next bulk print.";
  }
}

function updateSelectAllState() {
  if (!selectAllCheckbox) {
    return;
  }

  const total = queueOrders.length;
  const selectedTotal = selectedOrderIds.size;

  if (!total) {
    selectAllCheckbox.checked = false;
    selectAllCheckbox.indeterminate = false;
    selectAllCheckbox.disabled = true;
    return;
  }

  selectAllCheckbox.disabled = false;
  selectAllCheckbox.checked = selectedTotal === total;
  selectAllCheckbox.indeterminate = selectedTotal > 0 && selectedTotal < total;
}

function reconcileSelectedOrderIds() {
  const validIds = new Set(queueOrders.map((order) => order.id));
  let changed = false;

  Array.from(selectedOrderIds).forEach((id) => {
    if (!validIds.has(id)) {
      selectedOrderIds.delete(id);
      changed = true;
    }
  });

  return changed;
}

function setOrderSelection(orderId, selected) {
  if (!orderId) {
    return;
  }

  const normalisedId = String(orderId).trim();
  if (!normalisedId) {
    return;
  }

  if (selected) {
    selectedOrderIds.add(normalisedId);
  } else {
    selectedOrderIds.delete(normalisedId);
  }

  updateSelectionUi();
}

function buildPrintButtonIdleLabel() {
  const count = selectedOrderIds.size;
  if (count > 0) {
    const noun = count === 1 ? "Order" : "Orders";
    return `${ICON_PRINTER} Print ${count} ${noun}`;
  }
  return `${ICON_PRINTER} Print Selected`;
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
    const rawOrderId = String(order.id ?? "");
    const isSelected = rawOrderId && selectedOrderIds.has(rawOrderId);
    const deviceSummary = [order.device, order.storage].filter(Boolean).join(" · ") || "—";
    const payout = order.estimatedQuote != null && !Number.isNaN(Number(order.estimatedQuote))
      ? `$${Number(order.estimatedQuote).toFixed(2)}`
      : "—";
    const labelCount = Array.isArray(order.labelUrls) ? order.labelUrls.length : 0;
    const customer = order.shippingInfo || {};
    const email = customer.email ? `<span class="block text-xs text-slate-300/60">${escapeHtml(normaliseEmail(customer.email))}</span>` : "";
    const location = formatLocation(customer);
    const orderId = escapeHtml(rawOrderId);
    const rowClasses = isSelected ? "bg-slate-900/40" : "";

    return `
      <tr data-order-id="${orderId}" data-selected="${isSelected ? "true" : "false"}" class="${rowClasses}">
        <td class="px-4 py-4 align-top">
          <input
            type="checkbox"
            class="order-select-checkbox h-4 w-4 rounded border-slate-600/60 bg-slate-900/40 text-emerald-400 focus:ring-emerald-400"
            data-order-id="${orderId}"
            aria-label="Select order ${orderId || ""}"
            ${isSelected ? "checked" : ""}
          />
        </td>
        <td class="px-6 py-4 align-top">
          <div class="font-semibold text-white">${orderId || "—"}</div>
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
  updatePrintButtonState();
  updateRepairButtonState();
  if (!state) {
    updateSelectionUi();
  }
}

function updatePrintButtonState() {
  if (!printAllBtn) return;
  const disabled = isLoadingQueue || isPrinting || !selectedOrderIds.size;
  printAllBtn.disabled = disabled;
  printAllBtn.innerHTML = isPrinting ? PRINT_BUTTON_BUSY : buildPrintButtonIdleLabel();
}

function updateRepairButtonState() {
  if (!resetLabelGeneratedBtn) return;
  const disabled = isLoadingQueue || isPrinting || isRepairing;
  resetLabelGeneratedBtn.disabled = disabled;
  resetLabelGeneratedBtn.innerHTML = isRepairing
    ? `${ICON_SPINNER} Resetting`
    : `${ICON_PRINTER} Fix Unprinted Labels`;
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
  queueStatusEl.textContent = "Loading queue…";
  try {
    const orders = await fetchQueueOrders();
    queueOrders = orders.map((order) => ({
      ...order,
      labelUrls: gatherOrderLabelUrls(order),
    }));
    reconcileSelectedOrderIds();
    renderTable();
    updateStats();
    if (!queueOrders.length) {
      queueStatusEl.textContent = "All caught up — no pending labels.";
    }
  } catch (error) {
    console.error("Failed to load print queue:", error);
    queueStatusEl.textContent = "Unable to load the print queue. Please try again.";
  } finally {
    setQueueLoading(false);
  }
}

function parseHeaderJson(value) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.warn("Unable to parse header JSON:", value, error);
    return [];
  }
}

async function authorisedFetch(path, options = {}) {
  try {
    return await apiRaw(path, {
      method: options.method || "GET",
      headers: options.headers || {},
      body: options.body,
      authRequired: true,
    });
  } catch (error) {
    console.error("Network request failed:", { path, error });
    throw error;
  }
}

async function fetchPrintBundleFromEndpoint(path, options = {}) {
  const response = await authorisedFetch(path, options);

  if (!response.ok) {
    let detail = "";
    const contentType = response.headers.get("content-type") || "";
    try {
      if (contentType.includes("application/json")) {
        const payload = await response.json();
        detail = payload?.error || JSON.stringify(payload);
      } else {
        detail = await response.text();
      }
    } catch (error) {
      console.warn("Failed to parse error response from print bundle request:", error);
    }

    const error = new Error(`Print bundle request failed (${response.status})`);
    error.status = response.status;
    error.detail = detail;
    error.endpoint = path;
    throw error;
  }

  const buffer = await response.arrayBuffer();
  const printedIds = parseHeaderJson(response.headers.get("x-printed-order-ids"));
  const updatedIds = parseHeaderJson(response.headers.get("x-kit-sent-order-ids"));
  const bulkFolder = response.headers.get("x-bulk-print-folder");
  const bulkJobId = response.headers.get("x-bulk-print-job-id");

  return {
    bytes: new Uint8Array(buffer),
    printedIds,
    updatedIds,
    bulkFolder: bulkFolder || null,
    bulkJobId: bulkJobId || null,
  };
}

async function requestPrintBundle(orderIds) {
  if (!Array.isArray(orderIds) || !orderIds.length) {
    throw new Error("No order IDs provided for print bundle request.");
  }

  const encodedIds = orderIds.map((id) => encodeURIComponent(String(id))).join(",");
  const primaryPath = `/merge-print/${encodedIds}`;

  try {
    return await fetchPrintBundleFromEndpoint(primaryPath);
  } catch (primaryError) {
    console.warn("Primary merge-print GET request failed, attempting POST fallback:", primaryError);

    try {
      return await fetchPrintBundleFromEndpoint("/merge-print", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ orderIds }),
      });
    } catch (postError) {
      console.warn("POST merge-print request failed, attempting legacy bundle endpoint:", postError);

      try {
      return await fetchPrintBundleFromEndpoint("/orders/needs-printing/bundle", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ orderIds }),
      });
      } catch (legacyError) {
        legacyError.previous = postError;
        legacyError.initial = primaryError;
        throw legacyError;
      }
    }
  }
}

async function markOrdersKitSent(orderIds) {
  if (!orderIds.length) {
    return [];
  }

  const results = await Promise.all(
    orderIds.map(async (orderId) => {
      try {
        const response = await authorisedFetch(`/orders/${encodeURIComponent(orderId)}/mark-kit-sent`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({}),
        });

        if (!response.ok) {
          const text = await response.text();
          throw new Error(`Status ${response.status}: ${text}`);
        }

        return orderId;
      } catch (error) {
        console.error(`Failed to mark order ${orderId} as kit sent:`, error);
        return null;
      }
    })
  );

  return results.filter(Boolean);
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

function openPdfInTabAndPrint(bytes, { orderId } = {}) {
  const blob = new Blob([bytes], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const tab = window.open("", "_blank");

  if (!tab) {
    URL.revokeObjectURL(url);
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    const cleanup = () => {
      URL.revokeObjectURL(url);
      resolve();
    };

    const closeAndResolve = () => {
      try {
        tab.close();
      } catch (_) {}
      cleanup();
    };

    tab.document.write(
      `<!DOCTYPE html><html><head><title>Order ${orderId || ""} Label</title></head><body style="margin:0;padding:0;">
        <embed src="${url}" type="application/pdf" style="width:100%;height:100vh;" />
      </body></html>`
    );
    tab.document.close();

    const triggerPrint = () => {
      try {
        tab.focus();
        tab.print();
      } catch (error) {
        console.warn("Unable to trigger print dialog automatically:", error);
        closeAndResolve();
      }
    };

    const handleAfterPrint = () => closeAndResolve();

    try {
      tab.onafterprint = handleAfterPrint;
      tab.addEventListener("afterprint", handleAfterPrint);
    } catch (_) {}

    if (tab.document.readyState === "complete") {
      triggerPrint();
    } else {
      tab.onload = triggerPrint;
    }

    setTimeout(handleAfterPrint, 120000);
  });
}

async function handleBatchPrint() {
  if (isPrinting) {
    return;
  }

  if (!selectedOrderIds.size) {
    queueStatusEl.textContent = "Select at least one order to print.";
    return;
  }

  isPrinting = true;
  updatePrintButtonState();
  queueStatusEl.textContent = "Preparing PDFs and opening print dialogs…";

  try {
    const orderIds = Array.from(selectedOrderIds).filter(Boolean);
    if (!orderIds.length) {
      queueStatusEl.textContent = "No orders available to print.";
      return;
    }

    const printed = new Set();
    const updated = new Set();

    for (let index = 0; index < orderIds.length; index += 1) {
      const orderId = orderIds[index];
      const positionLabel = `${index + 1} of ${orderIds.length}`;
      queueStatusEl.textContent = `Generating PDF for order ${orderId} (${positionLabel})…`;

      const { bytes, printedIds, updatedIds } = await requestPrintBundle([orderId]);

      printedIds.forEach((id) => printed.add(id));
      updatedIds.forEach((id) => updated.add(id));

      const missingKitSent = printedIds.filter((id) => !updatedIds.includes(id));
      if (missingKitSent.length) {
        const fallbackUpdates = await markOrdersKitSent(missingKitSent);
        fallbackUpdates.forEach((id) => updated.add(id));
      }

      await openPdfInTabAndPrint(bytes, { orderId });
      queueStatusEl.textContent = `Opened print dialog for order ${orderId}. Proceeding to next…`;
    }

    const printedTotal = printed.size || orderIds.length;
    queueStatusEl.textContent = `Prepared ${printedTotal} PDF${printedTotal === 1 ? '' : 's'} and opened print dialogs. Marked ${
      updated.size
    } as Kit Sent.`;

    selectedOrderIds.clear();
    updateSelectionUi();
    await loadQueue();
  } catch (error) {
    console.error("Failed to prepare print bundle:", error);
    const detail = error?.detail ? ` Details: ${error.detail}` : "";
    queueStatusEl.textContent = `Failed to open print jobs. Please try again.${detail}`;
  } finally {
    isPrinting = false;
    updatePrintButtonState();
  }
}

async function repairStuckLabelGeneratedOrders() {
  if (isRepairing) {
    return;
  }

  console.info("Repairing label_generated kit orders...");
  isRepairing = true;
  updateRepairButtonState();
  queueStatusEl.textContent = "Scanning label generated orders for unprinted kits…";

  try {
    const response = await authorisedFetch("/repair-label-generated", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`Repair request failed (${response.status}): ${detail || "no response body"}`);
    }

    const payload = await response.json();
    const processed = payload?.processedCount ?? 0;
    const updated = payload?.updatedCount ?? 0;

    queueStatusEl.textContent = `Reviewed ${processed} label-generated order${processed === 1 ? "" : "s"} and reset ${updated} to Needs Printing.`;
    console.info("Repair complete", { processed, updated });
    await loadQueue();
  } catch (error) {
    console.error("Failed to repair label-generated orders:", error);
    const detail = error?.message || "Unknown error";
    queueStatusEl.textContent = `Unable to reset label-generated orders: ${detail}`;
  } finally {
    isRepairing = false;
    updateRepairButtonState();
  }
}

function attachEventListeners() {
  if (logoutBtn) {
    logoutBtn.addEventListener("click", async () => {
      await signOut(auth);
    });
  }

  if (printAllBtn) {
    printAllBtn.addEventListener("click", handleBatchPrint);
    updatePrintButtonState();
  }

  if (resetLabelGeneratedBtn) {
    resetLabelGeneratedBtn.addEventListener("click", repairStuckLabelGeneratedOrders);
    updateRepairButtonState();
  }

  if (tableBody) {
    tableBody.addEventListener("change", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement)) {
        return;
      }
      if (!target.classList.contains("order-select-checkbox")) {
        return;
      }

      const { orderId } = target.dataset;
      setOrderSelection(orderId || "", target.checked);

      const row = target.closest("tr");
      if (row) {
        row.dataset.selected = target.checked ? "true" : "false";
        row.classList.toggle("bg-slate-900/40", target.checked);
      }
    });
  }

  if (selectAllCheckbox) {
    selectAllCheckbox.addEventListener("change", () => {
      if (!queueOrders.length) {
        selectAllCheckbox.checked = false;
        selectAllCheckbox.indeterminate = false;
        return;
      }

      if (selectAllCheckbox.checked) {
        queueOrders.forEach((order) => {
          if (order?.id) {
            selectedOrderIds.add(String(order.id));
          }
        });
      } else {
        queueOrders.forEach((order) => {
          if (order?.id) {
            selectedOrderIds.delete(String(order.id));
          }
        });
      }

      renderTable();
      updateSelectionUi();
    });
  }
}

function initialise() {
  attachEventListeners();
  updateSelectionUi();

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
