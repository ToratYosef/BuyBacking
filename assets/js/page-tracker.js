(function () {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return;
  }

  const STORAGE_KEY = "PAGE_TRACKER_LOGS";
  const IP_CACHE_KEY = "PAGE_TRACKER_IP_CACHE";
  const IP_CACHE_TTL = 6 * 60 * 60 * 1000; // 6 hours

  const SOURCE_FALLBACK = "Direct";
  const DEFAULT_CONVERSION_LABEL = "default";

  const INITIAL_STORE = {
    pages: {},
    visitors: {},
    conversions: [],
    conversionIndex: {},
    lastUpdated: null,
  };

  let latestContext = {
    ip: null,
    path: null,
    source: null,
    type: "init",
    timestamp: null,
  };

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

  const ensureStoreShape = (store) => {
    if (!store || typeof store !== "object") {
      return { ...INITIAL_STORE };
    }
    if (!store.pages || typeof store.pages !== "object") {
      store.pages = {};
    }
    if (!store.visitors || typeof store.visitors !== "object") {
      store.visitors = {};
    }
    if (!Array.isArray(store.conversions)) {
      store.conversions = [];
    }
    if (!store.conversionIndex || typeof store.conversionIndex !== "object") {
      store.conversionIndex = {};
    }
    if (!("lastUpdated" in store)) {
      store.lastUpdated = null;
    }
    return store;
  };

  const readStore = () => {
    const raw = safeGet(STORAGE_KEY);
    const parsed = safeParse(raw, { ...INITIAL_STORE });
    return ensureStoreShape(parsed);
  };

  const writeStore = (data) => {
    const payload = JSON.stringify(data);
    safeSet(STORAGE_KEY, payload);
  };

  const buildConversionKey = (ip, path, label) => {
    const safeIp = ip && typeof ip === "string" ? ip.trim() : "unknown";
    const safePath = path && typeof path === "string" ? path : "/";
    const safeLabel = label && typeof label === "string" ? label : DEFAULT_CONVERSION_LABEL;
    return `${safeIp}|${safePath}|${safeLabel}`;
  };

  const normalisePath = (value) => {
    if (!value || typeof value !== "string") {
      return "/";
    }
    const trimmed = value.trim();
    if (!trimmed) {
      return "/";
    }
    return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  };

  const dispatchUpdate = (data, context) => {
    try {
      const detail = {
        data,
        context: {
          type: context && context.type ? context.type : "view",
          ...context,
        },
      };
      window.dispatchEvent(new CustomEvent("page-tracker:updated", { detail }));
    } catch (error) {
      // ignore
    }
  };

  const dispatchReady = (data) => {
    try {
      window.dispatchEvent(
        new CustomEvent("page-tracker:ready", {
          detail: {
            data,
            context: { type: "init" },
          },
        })
      );
    } catch (error) {
      // ignore readiness errors
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

  const updateVisitorRecord = (
    store,
    ipAddress,
    path,
    title,
    url,
    referrer,
    sourceLabel,
    visitedAt
  ) => {
    if (!store.visitors || typeof store.visitors !== "object") {
      store.visitors = {};
    }
    const visitors = store.visitors;
    const refUrl = (referrer && referrer.url) || "";
    let visitor = visitors[ipAddress];
    if (!visitor || typeof visitor !== "object") {
      visitor = {
        ip: ipAddress,
        firstSeen: visitedAt,
        lastSeen: visitedAt,
        firstPage: path,
        lastPage: path,
        firstTitle: title,
        lastTitle: title,
        firstSource: sourceLabel || SOURCE_FALLBACK,
        lastSource: sourceLabel || SOURCE_FALLBACK,
        firstReferrer: refUrl,
        lastReferrer: refUrl,
        firstUrl: url || "",
        lastUrl: url || "",
        visitedPaths: {},
        visitCount: 0,
        conversionCount: 0,
      };
    } else {
      if (!visitor.visitedPaths || typeof visitor.visitedPaths !== "object") {
        visitor.visitedPaths = {};
      }
      if (!visitor.firstSeen) {
        visitor.firstSeen = visitedAt;
      }
      if (!visitor.firstPage) {
        visitor.firstPage = path;
      }
      if (!visitor.firstTitle) {
        visitor.firstTitle = title;
      }
      if (!visitor.firstSource) {
        visitor.firstSource = sourceLabel || SOURCE_FALLBACK;
      }
      if (!visitor.firstReferrer && refUrl) {
        visitor.firstReferrer = refUrl;
      }
      if (!visitor.firstUrl && url) {
        visitor.firstUrl = url;
      }
      if (!Number.isFinite(visitor.conversionCount)) {
        visitor.conversionCount = 0;
      }
    }

    if (!visitor.visitedPaths) {
      visitor.visitedPaths = {};
    }
    const existingPath = visitor.visitedPaths[path];
    if (!existingPath || typeof existingPath !== "object") {
      visitor.visitedPaths[path] = {
        firstSeen: visitedAt,
        lastSeen: visitedAt,
        views: 1,
      };
      visitor.visitCount = (visitor.visitCount || 0) + 1;
    } else {
      if (!existingPath.firstSeen) {
        existingPath.firstSeen = visitedAt;
      }
      existingPath.lastSeen = visitedAt;
      if (!Number.isFinite(existingPath.views)) {
        existingPath.views = 1;
      }
    }

    visitor.lastSeen = visitedAt;
    visitor.lastPage = path;
    visitor.lastTitle = title;
    visitor.lastSource = sourceLabel || visitor.lastSource || visitor.firstSource || SOURCE_FALLBACK;
    if (refUrl) {
      visitor.lastReferrer = refUrl;
    }
    if (url) {
      visitor.lastUrl = url;
    }

    visitors[ipAddress] = visitor;
    return visitor;
  };

  const recordView = (ipAddress) => {
    if (!ipAddress) {
      ipAddress = "unknown";
    }

    const store = ensureStoreShape(readStore());
    if (!store.pages || typeof store.pages !== "object") {
      store.pages = {};
    }

    const path = normalisePath(window.location.pathname || "/");
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

    const visitor = updateVisitorRecord(
      store,
      ipAddress,
      path,
      title,
      url,
      referrer,
      sourceLabel,
      visitedAt
    );

    store.lastUpdated = visitedAt;

    writeStore(store);
    latestContext = {
      ip: ipAddress,
      path,
      source: sourceLabel || SOURCE_FALLBACK,
      type: "view",
      timestamp: visitedAt,
    };

    dispatchUpdate(store, {
      type: "view",
      path,
      ip: ipAddress,
      visitedAt,
      source: sourceLabel || SOURCE_FALLBACK,
      visitor,
    });
  };

  const recordConversion = (input) => {
    const store = ensureStoreShape(readStore());
    const occurredAt =
      input && typeof input.occurredAt === "string" && input.occurredAt.trim()
        ? input.occurredAt.trim()
        : nowIso();

    const suppliedIp = input && typeof input.ip === "string" ? input.ip.trim() : "";
    const ip = suppliedIp || latestContext.ip || "unknown";
    const path = normalisePath(
      input && typeof input.path === "string" && input.path ? input.path : window.location.pathname || "/"
    );
    const label = input && typeof input.label === "string" && input.label.trim()
      ? input.label.trim()
      : DEFAULT_CONVERSION_LABEL;

    const visitor = store.visitors && store.visitors[ip] ? store.visitors[ip] : null;
    const key = buildConversionKey(ip, path, label);
    if (store.conversionIndex[key]) {
      latestContext = {
        ip,
        path,
        source: normaliseSourceLabel(
          input && input.source ? input.source : (visitor && (visitor.firstSource || visitor.lastSource)) || SOURCE_FALLBACK
        ),
        type: "conversion",
        timestamp: store.conversionIndex[key],
      };
      return true;
    }

    const visitorSource = visitor
      ? visitor.firstSource || visitor.lastSource || latestContext.source
      : latestContext.source;
    const source = normaliseSourceLabel(
      input && input.source ? input.source : visitorSource || SOURCE_FALLBACK
    );
    const referrer =
      (input && input.referrer) || (visitor && (visitor.firstReferrer || visitor.lastReferrer)) || "";

    const conversion = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      ip,
      path,
      label,
      occurredAt,
      source,
      referrer,
      title:
        (input && typeof input.title === "string" && input.title.trim()
          ? input.title.trim()
          : document.title || "") || "",
      firstPage: (input && input.firstPage) || (visitor && visitor.firstPage) || "",
      landingPage:
        (input && input.landingPage) || (visitor && visitor.firstPage) || window.location.pathname || "",
      metadata:
        input && input.metadata && typeof input.metadata === "object"
          ? input.metadata
          : undefined,
    };

    if (conversion.metadata === undefined) {
      delete conversion.metadata;
    }

    store.conversionIndex[key] = occurredAt;
    store.conversions.push(conversion);

    if (visitor) {
      if (!visitor.conversionCount || !Number.isFinite(visitor.conversionCount)) {
        visitor.conversionCount = 0;
      }
      visitor.conversionCount += 1;
      visitor.lastConversionAt = occurredAt;
      if (!visitor.firstConversionAt) {
        visitor.firstConversionAt = occurredAt;
      }
      if (!visitor.conversionPaths || typeof visitor.conversionPaths !== "object") {
        visitor.conversionPaths = {};
      }
      visitor.conversionPaths[path] = occurredAt;
      store.visitors[ip] = visitor;
    }

    const MAX_CONVERSIONS = 500;
    if (store.conversions.length > MAX_CONVERSIONS) {
      store.conversions = store.conversions.slice(-MAX_CONVERSIONS);
      const newIndex = {};
      store.conversions.forEach((entry) => {
        const entryKey = buildConversionKey(
          entry && entry.ip ? entry.ip : "unknown",
          entry && entry.path ? entry.path : "/",
          entry && entry.label ? entry.label : DEFAULT_CONVERSION_LABEL
        );
        newIndex[entryKey] = entry && entry.occurredAt ? entry.occurredAt : occurredAt;
      });
      store.conversionIndex = newIndex;
    }

    store.lastUpdated = occurredAt;
    writeStore(store);

    latestContext = {
      ip,
      path,
      source: source || SOURCE_FALLBACK,
      type: "conversion",
      timestamp: occurredAt,
    };

    dispatchUpdate(store, {
      type: "conversion",
      ip,
      path,
      occurredAt,
      source: source || SOURCE_FALLBACK,
      label,
      conversion,
    });

    return true;
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

  const exposeTracker = () => {
    if (typeof window === "undefined") {
      return;
    }
    const api = window.PageTracker && typeof window.PageTracker === "object" ? window.PageTracker : {};
    api.getStore = () => ensureStoreShape(readStore());
    api.recordConversion = recordConversion;
    api.getLatestContext = () => ({ ...latestContext });
    api.resolveIp = resolveIp;
    window.PageTracker = api;
  };

  exposeTracker();
  dispatchReady(ensureStoreShape(readStore()));

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      start();
    });
  } else {
    start();
  }
})();
