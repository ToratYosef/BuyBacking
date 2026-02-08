import { firebaseApp } from "/assets/js/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";

const auth = getAuth(firebaseApp);

const defaultApiBase = "/api";

let apiBase =
  (typeof window !== "undefined" &&
    (window.SHC_API_BASE_URL || window.API_BASE_URL || window.API_BASE)) ||
  defaultApiBase;

const RAILWAY_API_ORIGIN = "https://api.secondhandcell.com";

function normalizeApiBase(base) {
  if (typeof base !== "string") {
    return base;
  }

  const trimmed = base.trim().replace(/\/$/, "");
  if (trimmed === RAILWAY_API_ORIGIN) {
    return `${trimmed}/server`;
  }

  return trimmed;
}

apiBase = normalizeApiBase(apiBase);

export function setApiBase(nextBase) {
  if (nextBase) {
    apiBase = normalizeApiBase(nextBase);
  }
}

function resolveUrl(path) {
  const cleanedBase = apiBase.replace(/\/$/, "");
  const cleanedPath = path.startsWith("/") ? path : `/${path}`;
  return new URL(`${cleanedBase}${cleanedPath}`, window.location.origin).toString();
}

async function getIdToken({ forceRefresh = false } = {}) {
  const user = auth.currentUser;
  if (!user) {
    return null;
  }
  return user.getIdToken(forceRefresh);
}

async function requestWithAuth(method, path, data, options = {}, { forceRefresh = false } = {}) {
  const { authRequired = false, headers = {}, ...fetchOptions } = options;
  const token = await getIdToken({ forceRefresh });

  if (authRequired && !token) {
    throw new Error("Authentication required. Please sign in and try again.");
  }

  const requestHeaders = {
    "Content-Type": "application/json",
    ...headers,
  };

  if (token) {
    requestHeaders.Authorization = `Bearer ${token}`;
  }

  return fetch(resolveUrl(path), {
    method,
    headers: requestHeaders,
    body: data ? JSON.stringify(data) : undefined,
    ...fetchOptions,
  });
}

async function apiRequest(method, path, data, options = {}) {
  let response = await requestWithAuth(method, path, data, options, { forceRefresh: false });

  if (response.status === 401) {
    response = await requestWithAuth(method, path, data, options, { forceRefresh: true });
  }

  const contentType = response.headers.get("content-type") || "";
  const payload = contentType.includes("application/json")
    ? await response.json()
    : await response.text();

  if (!response.ok) {
    const message =
      (typeof payload === "string" && payload.trim() ? payload.trim() : null) ||
      payload?.error ||
      payload?.message ||
      response.statusText;
    const error = new Error(message || "API request failed.");
    error.status = response.status;
    error.payload = payload;
    throw error;
  }

  return payload;
}

export async function apiRaw(path, options = {}) {
  const { authRequired = false, headers = {}, body, method = "GET", ...fetchOptions } = options;
  const makeRequest = async (forceRefresh = false) => {
    const token = await getIdToken({ forceRefresh });

    if (authRequired && !token) {
      throw new Error("Authentication required. Please sign in and try again.");
    }

    const requestHeaders = { ...headers };
    if (token) {
      requestHeaders.Authorization = `Bearer ${token}`;
    }

    return fetch(resolveUrl(path), {
      method,
      headers: requestHeaders,
      body,
      ...fetchOptions,
    });
  };

  let response = await makeRequest(false);
  if (response.status === 401) {
    response = await makeRequest(true);
  }
  return response;
}

export function apiGet(path, options) {
  return apiRequest("GET", path, undefined, options);
}

export function apiPost(path, data, options) {
  return apiRequest("POST", path, data, options);
}

export function apiPut(path, data, options) {
  return apiRequest("PUT", path, data, options);
}

export function apiDelete(path, data, options) {
  return apiRequest("DELETE", path, data, options);
}

export function apiFetch(path, options = {}) {
  return apiRequest(options.method || "GET", path, options.body, options);
}
