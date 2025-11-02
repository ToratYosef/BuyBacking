(function () {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return;
  }

  const STORAGE_KEY = "PAGE_TRACKER_LOGS";
  const IP_CACHE_KEY = "PAGE_TRACKER_IP_CACHE";
  const IP_CACHE_TTL = 6 * 60 * 60 * 1000; // 6 hours

  const nowIso = () => new Date().toISOString();

  const safeGet = (key) => {
    try {
      return window.localStorage.getItem(key);
    } catch (error) {
      return null;
    }
  };

  const safeSet = (key, value) => {
    try {
      window.localStorage.setItem(key, value);
    } catch (error) {
      // Ignore storage errors (e.g. in private mode)
    }
  };

  const safeParse = (value, fallback) => {
    if (!value) return fallback;
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === "object" ? parsed : fallback;
    } catch (error) {
      return fallback;
    }
  };

  const readStore = () => {
    const initial = { pages: {}, lastUpdated: null };
    const raw = safeGet(STORAGE_KEY);
    return safeParse(raw, initial);
  };

  const writeStore = (data) => {
    const payload = JSON.stringify(data);
    safeSet(STORAGE_KEY, payload);
  };

  const dispatchUpdate = (data, context) => {
    try {
      const detail = { data, context };
      window.dispatchEvent(new CustomEvent("page-tracker:updated", { detail }));
    } catch (error) {
      // ignore
    }
  };

  const loadCachedIp = () => {
    const raw = safeGet(IP_CACHE_KEY);
    const cached = safeParse(raw, null);
    if (!cached || !cached.value) {
      return null;
    }
    if (typeof cached.timestamp !== "number") {
      return cached.value;
    }
    if (Date.now() - cached.timestamp > IP_CACHE_TTL) {
      return null;
    }
    return cached.value;
  };

  const storeCachedIp = (ip) => {
    const payload = {
      value: ip,
      timestamp: Date.now(),
    };
    safeSet(IP_CACHE_KEY, JSON.stringify(payload));
  };

  const fetchPublicIp = async () => {
    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timeout = controller
      ? setTimeout(() => {
          try {
            controller.abort();
          } catch (error) {}
        }, 4000)
      : null;

    try {
      const response = await fetch("https://api.ipify.org?format=json", {
        method: "GET",
        signal: controller ? controller.signal : undefined,
      });
      if (!response.ok) {
        throw new Error("Failed to resolve IP");
      }
      const payload = await response.json();
      if (payload && typeof payload.ip === "string" && payload.ip.trim()) {
        return payload.ip.trim();
      }
    } catch (error) {
      // ignore fetch failures
    } finally {
      if (timeout) {
        clearTimeout(timeout);
      }
    }
    return "unknown";
  };

  const resolveIp = async () => {
    const cached = loadCachedIp();
    if (cached) {
      return cached;
    }
    const ip = await fetchPublicIp();
    storeCachedIp(ip);
    return ip;
  };

  const recordView = (ipAddress) => {
    if (!ipAddress) {
      ipAddress = "unknown";
    }

    const store = readStore();
    if (!store.pages || typeof store.pages !== "object") {
      store.pages = {};
    }

    const path = window.location.pathname || "/";
    const title = document.title ? String(document.title).slice(0, 256) : "";
    const url = window.location.href || "";
    const visitedAt = nowIso();

    if (!store.pages[path] || typeof store.pages[path] !== "object") {
      store.pages[path] = {
        totalViews: 0,
        uniqueIpCount: 0,
        lastViewedAt: null,
        lastTitle: title,
        lastUrl: url,
        ipStats: {},
      };
    }

    const page = store.pages[path];
    if (!page.ipStats || typeof page.ipStats !== "object") {
      page.ipStats = {};
    }

    let entry = page.ipStats[ipAddress];
    if (!entry) {
      entry = {
        ip: ipAddress,
        firstSeen: visitedAt,
        lastSeen: visitedAt,
        lastUrl: url,
        lastTitle: title,
      };
      page.ipStats[ipAddress] = entry;
      page.totalViews = (page.totalViews || 0) + 1;
    } else {
      entry.lastSeen = visitedAt;
      entry.lastUrl = url;
      entry.lastTitle = title;
    }

    entry.lastTitle = title;
    entry.lastUrl = url;

    page.uniqueIpCount = Object.keys(page.ipStats).length;
    if (!page.totalViews || page.totalViews < page.uniqueIpCount) {
      page.totalViews = page.uniqueIpCount;
    }
    page.lastViewedAt = visitedAt;
    page.lastTitle = title;
    page.lastUrl = url;

    store.lastUpdated = visitedAt;

    writeStore(store);
    dispatchUpdate(store, { path, ip: ipAddress });
  };

  const start = async () => {
    if (document.visibilityState === "prerender") {
      const onVisible = () => {
        document.removeEventListener("visibilitychange", onVisible);
        resolveIp().then(recordView);
      };
      document.addEventListener("visibilitychange", onVisible);
      return;
    }
    const ip = await resolveIp();
    recordView(ip);
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      start();
    });
  } else {
    start();
  }
})();
