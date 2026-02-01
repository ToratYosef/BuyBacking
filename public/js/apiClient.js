import { firebaseApp } from "/assets/js/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";

const auth = getAuth(firebaseApp);

let apiBase =
  (typeof window !== "undefined" &&
    (window.SHC_API_BASE_URL || window.API_BASE_URL || window.API_BASE)) ||
  "/api";

export function setApiBase(nextBase) {
  if (nextBase) {
    apiBase = nextBase;
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

async function apiRequest(method, path, data, options = {}) {
  const { authRequired = false, headers = {}, ...fetchOptions } = options;
  const token = await getIdToken({ forceRefresh: true });

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

  const response = await fetch(resolveUrl(path), {
    method,
    headers: requestHeaders,
    body: data ? JSON.stringify(data) : undefined,
    ...fetchOptions,
  });

  const contentType = response.headers.get("content-type") || "";
  const payload = contentType.includes("application/json")
    ? await response.json()
    : await response.text();

  if (!response.ok) {
    const message = payload?.error || payload?.message || response.statusText;
    const error = new Error(message || "API request failed.");
    error.status = response.status;
    error.payload = payload;
    throw error;
  }

  return payload;
}

export async function apiRaw(path, options = {}) {
  const { authRequired = false, headers = {}, body, method = "GET", ...fetchOptions } = options;
  const token = await getIdToken({ forceRefresh: true });

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
