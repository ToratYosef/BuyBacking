import { apiGet } from '/public/js/apiClient.js';

const resultsEl = document.getElementById('results');
const summaryEl = document.getElementById('summary');
const refreshBtn = document.getElementById('refresh-btn');
const limitInput = document.getElementById('scan-limit');
const debugConsoleEl = document.getElementById('debug-console');
const clearDebugBtn = document.getElementById('clear-debug-btn');

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatErrorDetails(error) {
  if (!error) return 'Unknown error';
  if (typeof error === 'string') return error;
  return JSON.stringify(
    {
      message: error.message || null,
      status: error.status || null,
      payload: error.payload || null,
      stack: error.stack || null,
      name: error.name || null,
    },
    null,
    2
  );
}

function logDebug(message, details = null, level = 'info') {
  const now = new Date().toISOString();
  const prefix = `[${now}] [${level.toUpperCase()}] ${message}`;
  const detailsText =
    details === null || typeof details === 'undefined'
      ? ''
      : `\n${typeof details === 'string' ? details : JSON.stringify(details, null, 2)}`;
  const line = `${prefix}${detailsText}\n`;
  if (debugConsoleEl) {
    debugConsoleEl.textContent += line;
    debugConsoleEl.scrollTop = debugConsoleEl.scrollHeight;
  }
  if (level === 'error') {
    console.error(message, details);
  } else if (level === 'warn') {
    console.warn(message, details);
  } else {
    console.log(message, details);
  }
}

function renderConflicts(conflicts = []) {
  if (!conflicts.length) {
    resultsEl.innerHTML = '<div class="bg-white rounded-xl shadow p-4 text-sm text-slate-600">No IP/name conflicts found in scanned orders.</div>';
    return;
  }

  resultsEl.innerHTML = conflicts.map((conflict) => {
    const ordersRows = (conflict.orders || []).map((order) => `
      <tr class="border-t">
        <td class="px-2 py-2 font-mono text-xs">${escapeHtml(order.orderId || '')}</td>
        <td class="px-2 py-2 text-sm">${escapeHtml(order.name || '')}</td>
        <td class="px-2 py-2 text-sm">${escapeHtml(order.email || '')}</td>
        <td class="px-2 py-2 text-xs">${escapeHtml(order.submitterDeviceId || '')}</td>
        <td class="px-2 py-2 text-xs">${escapeHtml(order.browser || '')}</td>
        <td class="px-2 py-2 text-xs">${escapeHtml(order.os || '')}</td>
      </tr>
    `).join('');

    return `
      <article class="bg-white rounded-xl shadow p-4">
        <h2 class="font-semibold">IP: <span class="font-mono">${escapeHtml(conflict.ipAddress)}</span></h2>
        <p class="text-sm text-slate-600 mt-1">${conflict.orderCount} order(s), ${conflict.uniqueNameCount} unique customer names</p>
        <div class="overflow-auto mt-3">
          <table class="min-w-full text-left border rounded">
            <thead class="bg-slate-50">
              <tr>
                <th class="px-2 py-2 text-xs font-semibold">Order ID</th>
                <th class="px-2 py-2 text-xs font-semibold">Name</th>
                <th class="px-2 py-2 text-xs font-semibold">Email</th>
                <th class="px-2 py-2 text-xs font-semibold">Device ID</th>
                <th class="px-2 py-2 text-xs font-semibold">Browser</th>
                <th class="px-2 py-2 text-xs font-semibold">OS</th>
              </tr>
            </thead>
            <tbody>${ordersRows}</tbody>
          </table>
        </div>
      </article>
    `;
  }).join('');
}

async function loadConflicts() {
  const limit = Number(limitInput.value) || 500;
  logDebug('Starting conflict load.', { limit });
  refreshBtn.disabled = true;
  refreshBtn.textContent = 'Loading...';
  try {
    const payload = await apiGet(`/orders/ip-conflicts?limit=${encodeURIComponent(limit)}`, { authRequired: true });
    logDebug('API response received for /orders/ip-conflicts.', payload);
    summaryEl.textContent = `Scanned ${payload.scannedOrders || 0} order(s). Found ${payload.conflictCount || 0} conflicting IP(s).`;
    renderConflicts(Array.isArray(payload.conflicts) ? payload.conflicts : []);
  } catch (error) {
    const status = error?.status ? ` (HTTP ${error.status})` : '';
    const safeMessage = error?.message || 'Unknown error';
    const payloadCode = error?.payload?.code ? `Code: ${error.payload.code}` : '';
    const requestId = error?.payload?.requestId ? `Request ID: ${error.payload.requestId}` : '';
    const authHint = /auth|401|403|token|sign in/i.test(safeMessage)
      ? 'Make sure you are signed in with an admin account so the API token is sent.'
      : '';
    logDebug('Failed to load conflicts.', formatErrorDetails(error), 'error');
    summaryEl.textContent = `Failed to load IP conflicts${status}.`;
    resultsEl.innerHTML = `
      <div class="bg-red-50 border border-red-200 text-red-700 rounded-xl p-4 text-sm space-y-2">
        <div><strong>Error:</strong> ${escapeHtml(safeMessage)}</div>
        ${payloadCode ? `<div><strong>${escapeHtml(payloadCode)}</strong></div>` : ''}
        ${requestId ? `<div><strong>${escapeHtml(requestId)}</strong></div>` : ''}
        ${authHint ? `<div>${escapeHtml(authHint)}</div>` : ''}
      </div>
    `;
  } finally {
    logDebug('Conflict load finished.');
    refreshBtn.disabled = false;
    refreshBtn.textContent = 'Refresh';
  }
}

window.addEventListener('error', (event) => {
  logDebug('Unhandled window error captured.', {
    message: event.message,
    source: event.filename,
    line: event.lineno,
    column: event.colno,
    stack: event.error?.stack || null,
  }, 'error');
});

window.addEventListener('unhandledrejection', (event) => {
  logDebug('Unhandled promise rejection captured.', formatErrorDetails(event.reason), 'error');
});

clearDebugBtn?.addEventListener('click', () => {
  if (debugConsoleEl) {
    debugConsoleEl.textContent = '';
  }
  logDebug('Debug console cleared by user.');
});

refreshBtn.addEventListener('click', loadConflicts);
logDebug('Admin IP conflict page initialized.');
loadConflicts();
