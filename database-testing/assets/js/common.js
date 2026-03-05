(function () {
  const API_BASE = '/database-testing/api';

  async function apiFetch(path, options = {}) {
    const response = await fetch(`${API_BASE}${path}`, {
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
      ...options,
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.error || `Request failed: ${response.status}`);
    }
    return payload.data;
  }

  window.DatabaseTestingApi = {
    apiFetch,
    listOrders: () => apiFetch('/orders'),
    getOrder: (orderId) => apiFetch(`/orders/${encodeURIComponent(orderId)}`),
    createOrder: (body) => apiFetch('/orders', { method: 'POST', body: JSON.stringify(body) }),
    listUsers: () => apiFetch('/users'),
    listAdminOrders: (token) => apiFetch(`/admin/orders?token=${encodeURIComponent(token)}`),
  };
})();
