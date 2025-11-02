(function () {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return;
  }

  const STORAGE_KEY = "PAGE_TRACKER_LOGS";
  const IP_CACHE_KEY = "PAGE_TRACKER_IP_CACHE";
  const IP_CACHE_TTL = 6 * 60 * 60 * 1000; // 6 hours

  const SOURCE_FALLBACK = "Direct";

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

  const titleCase = (value) => {
    if (!value) {
      return SOURCE_FALLBACK;
    }
    return value
      .split(/\s+/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
      .join(" ");
  };

  const normaliseSourceLabel = (value) => {
    if (!value || typeof value !== "string") {
      return SOURCE_FALLBACK;
    }
    const trimmed = value.trim();
    if (!trimmed) {
      return SOURCE_FALLBACK;
    }
    const lower = trimmed.toLowerCase();
    const preset = {
      direct: SOURCE_FALLBACK,
      internal: "Internal",
      google: "Google",
      sellcell: "SellCell",
      "sellcell.com": "SellCell",
      facebook: "Facebook",
      instagram: "Instagram",
      twitter: "Twitter",
      x: "X",
      linkedin: "LinkedIn",
      bing: "Bing",
      yahoo: "Yahoo",
      duckduckgo: "DuckDuckGo",
    };
    if (preset[lower]) {
      return preset[lower];
    }
    const cleaned = trimmed.replace(/^www\./i, "").replace(/[-_]/g, " ");
    return titleCase(cleaned);
  };

  const inferSourceFromUrl = (refUrl) => {
    if (!refUrl || typeof refUrl !== "string") {
      return SOURCE_FALLBACK;
    }
    try {
      const parsed = new URL(refUrl);
      const sameHost = parsed.hostname && parsed.hostname === window.location.hostname;
      if (sameHost) {
        return "Internal";
      }
      const params = parsed.searchParams;
      const utm = params.get("utm_source") || params.get("source") || params.get("ref");
      if (utm && utm.trim()) {
        return normaliseSourceLabel(utm);
      }
      if (parsed.hostname) {
        const host = parsed.hostname.toLowerCase();
        if (host.includes("google")) return "Google";
        if (host.includes("sellcell")) return "SellCell";
        if (host.includes("facebook")) return "Facebook";
        if (host.includes("instagram")) return "Instagram";
        if (host.includes("twitter") || host === "x.com") return "Twitter";
        if (host.includes("linkedin")) return "LinkedIn";
        if (host.includes("bing")) return "Bing";
        if (host.includes("yahoo")) return "Yahoo";
        if (host.includes("duckduckgo")) return "DuckDuckGo";
        return normaliseSourceLabel(host);
      }
    } catch (error) {
      // ignore
    }
    return SOURCE_FALLBACK;
  };

  const resolveReferrer = () => {
    const raw = document.referrer || "";
    if (!raw) {
      return {
        url: "",
        source: SOURCE_FALLBACK,
      };
    }
    const source = inferSourceFromUrl(raw);
    return {
      url: raw,
      source,
    };
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
        referrerStats: {},
      };
    }

    const page = store.pages[path];
    if (!page.ipStats || typeof page.ipStats !== "object") {
      page.ipStats = {};
    }
    if (!page.referrerStats || typeof page.referrerStats !== "object") {
      page.referrerStats = {};
    }

    const referrer = resolveReferrer();
    const sourceLabel = normaliseSourceLabel(referrer.source);
    const referrerKey = sourceLabel.toLowerCase();

    let entry = page.ipStats[ipAddress];
    const previousSourceLabel = entry
      ? normaliseSourceLabel(entry.lastSource || entry.firstSource || SOURCE_FALLBACK)
      : null;
    const previousSourceKey = previousSourceLabel ? previousSourceLabel.toLowerCase() : null;
    if (!entry) {
      entry = {
        ip: ipAddress,
        firstSeen: visitedAt,
        lastSeen: visitedAt,
        lastUrl: url,
        lastTitle: title,
        firstReferrer: referrer.url || "",
        lastReferrer: referrer.url || "",
        firstSource: sourceLabel,
        lastSource: sourceLabel,
      };
      page.ipStats[ipAddress] = entry;
      page.totalViews = (page.totalViews || 0) + 1;
    } else {
      entry.lastSeen = visitedAt;
      entry.lastUrl = url;
      entry.lastTitle = title;
      entry.lastReferrer = referrer.url || entry.lastReferrer || "";
      entry.lastSource = sourceLabel || entry.lastSource || entry.firstSource || SOURCE_FALLBACK;
      if (!entry.firstReferrer && referrer.url) {
        entry.firstReferrer = referrer.url;
      }
      if (!entry.firstSource) {
        entry.firstSource = sourceLabel || SOURCE_FALLBACK;
      }
    }

    entry.lastTitle = title;
    entry.lastUrl = url;
    if (!entry.firstSource) {
      entry.firstSource = sourceLabel || SOURCE_FALLBACK;
    }
    if (!entry.lastSource) {
      entry.lastSource = sourceLabel || entry.firstSource || SOURCE_FALLBACK;
    }
    if (!entry.firstReferrer && referrer.url) {
      entry.firstReferrer = referrer.url;
    }
    if (!entry.lastReferrer) {
      entry.lastReferrer = referrer.url || "";
    }

    page.uniqueIpCount = Object.keys(page.ipStats).length;
    if (!page.totalViews || page.totalViews < page.uniqueIpCount) {
      page.totalViews = page.uniqueIpCount;
    }
    page.lastViewedAt = visitedAt;
    page.lastTitle = title;
    page.lastUrl = url;
    page.lastReferrer = referrer.url || page.lastReferrer || "";
    page.lastReferrerSource = sourceLabel || page.lastReferrerSource || SOURCE_FALLBACK;

    if (
      previousSourceKey &&
      previousSourceKey !== referrerKey &&
      page.referrerStats[previousSourceKey] &&
      page.referrerStats[previousSourceKey].ips &&
      typeof page.referrerStats[previousSourceKey].ips === "object"
    ) {
      const prevStats = page.referrerStats[previousSourceKey];
      if (prevStats.ips[ipAddress]) {
        delete prevStats.ips[ipAddress];
        const remaining = Object.keys(prevStats.ips).length;
        prevStats.count = remaining;
        if (remaining === 0) {
          delete page.referrerStats[previousSourceKey];
        }
      }
    }

    const stats = page.referrerStats[referrerKey] || {
      source: sourceLabel,
      count: 0,
      lastSeen: null,
      lastReferrer: "",
      sampleUrl: "",
      ips: {},
    };
    if (!page.referrerStats[referrerKey]) {
      page.referrerStats[referrerKey] = stats;
    }
    if (!stats.ips || typeof stats.ips !== "object") {
      stats.ips = {};
    }
    if (!stats.firstSeen) {
      stats.firstSeen = visitedAt;
    }
    stats.ips[ipAddress] = true;
    stats.count = Object.keys(stats.ips).length;
    stats.lastSeen = visitedAt;
    stats.source = sourceLabel || stats.source || SOURCE_FALLBACK;
    if (referrer.url) {
      stats.lastReferrer = referrer.url;
      if (!stats.sampleUrl) {
        stats.sampleUrl = referrer.url;
      }
    }

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
