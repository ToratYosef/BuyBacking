(function () {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return;
  }
  const collect = () => {
    try {
      const payload = {
        path: window.location.pathname || "/",
        title: document.title ? String(document.title).slice(0, 256) : "",
        url: window.location.href || "",
      };
      fetch("/api/simple-analytics/collect", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
        keepalive: true,
        credentials: "omit",
      }).catch((error) => {
        if (console && typeof console.warn === "function") {
          console.warn("page tracker failed", error);
        }
      });
    } catch (error) {
      if (console && typeof console.warn === "function") {
        console.warn("page tracker error", error);
      }
    }
  };

  const trigger = () => {
    if (document.visibilityState === "prerender") {
      const onVisible = () => {
        document.removeEventListener("visibilitychange", onVisible);
        collect();
      };
      document.addEventListener("visibilitychange", onVisible);
      return;
    }
    collect();
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", trigger, { once: true });
  } else {
    trigger();
  }
})();
