import { apiGet } from '/public/js/apiClient.js';

const resultsEl = document.getElementById('results');
const summaryEl = document.getElementById('summary');
const refreshBtn = document.getElementById('refresh-btn');
const limitInput = document.getElementById('scan-limit');

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
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
  refreshBtn.disabled = true;
  refreshBtn.textContent = 'Loading...';
  try {
    const payload = await apiGet(`/orders/ip-conflicts?limit=${encodeURIComponent(limit)}`, { authRequired: false });
    summaryEl.textContent = `Scanned ${payload.scannedOrders || 0} order(s). Found ${payload.conflictCount || 0} conflicting IP(s).`;
    renderConflicts(Array.isArray(payload.conflicts) ? payload.conflicts : []);
  } catch (error) {
    summaryEl.textContent = 'Failed to load IP conflicts.';
    resultsEl.innerHTML = `<div class="bg-red-50 border border-red-200 text-red-700 rounded-xl p-4 text-sm">${escapeHtml(error.message || 'Unknown error')}</div>`;
  } finally {
    refreshBtn.disabled = false;
    refreshBtn.textContent = 'Refresh';
  }
}

refreshBtn.addEventListener('click', loadConflicts);
loadConflicts();
