import { getFirebaseAuth } from "./firebaseClient";

async function authHeaders() {
  const auth = getFirebaseAuth();
  const current = auth.currentUser;
  if (!current) {
    throw new Error("not_authenticated");
  }
  const token = await current.getIdToken();
  return { Authorization: `Bearer ${token}` };
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = await authHeaders();
  const response = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...headers,
      ...(init?.headers || {}),
    },
  });
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }
  return (await response.json()) as T;
}

export function fetchSummary(params: { siteId: string; window: string; path?: string }) {
  const search = new URLSearchParams({ siteId: params.siteId, window: params.window });
  if (params.path) {
    search.set("path", params.path);
  }
  return request(`/api/analytics/summary?${search.toString()}`);
}

export function fetchTimeseries(params: { siteId: string; window: string; granularity?: string; path?: string }) {
  const search = new URLSearchParams({ siteId: params.siteId, window: params.window });
  if (params.path) {
    search.set("path", params.path);
  }
  if (params.granularity) {
    search.set("granularity", params.granularity);
  }
  return request(`/api/analytics/timeseries?${search.toString()}`);
}

export function fetchTop(params: { siteId: string; window: string; path?: string; limit?: number }) {
  const search = new URLSearchParams({ siteId: params.siteId, window: params.window });
  if (params.path) {
    search.set("path", params.path);
  }
  if (params.limit) {
    search.set("limit", String(params.limit));
  }
  return request(`/api/analytics/top?${search.toString()}`);
}

export function fetchLive(params: { siteId: string; window: string; path?: string }) {
  const search = new URLSearchParams({ siteId: params.siteId, window: params.window });
  if (params.path) {
    search.set("path", params.path);
  }
  return request(`/api/analytics/live?${search.toString()}`);
}
