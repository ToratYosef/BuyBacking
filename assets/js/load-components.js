const componentCache = new Map();
let componentsPromise = null;
let sharedScriptsPromise = null;
const COMPONENT_CACHE_PREFIX = "shc:component:v1:";

function getCachedComponent(path) {
  try {
    return sessionStorage.getItem(`${COMPONENT_CACHE_PREFIX}${path}`) || "";
  } catch (_) {
    return "";
  }
}

function setCachedComponent(path, html) {
  if (!html) return;
  try {
    sessionStorage.setItem(`${COMPONENT_CACHE_PREFIX}${path}`, html);
  } catch (_) {
    // Ignore storage quota/privacy mode failures.
  }
}

async function fetchComponent(path) {
  if (!componentCache.has(path)) {
    componentCache.set(
      path,
      fetch(path, { credentials: "same-origin" }).then((response) => {
        if (!response.ok) {
          throw new Error(`Failed to load component: ${path}`);
        }
        return response.text();
      }).then((html) => {
        setCachedComponent(path, html);
        return html;
      })
    );
  }
  return componentCache.get(path);
}

function dispatchChromeEvent(name) {
  document.dispatchEvent(new CustomEvent(name));
}

function applyOptimisticAuthUi() {
  const loginNavBtn = document.getElementById("loginNavBtn");
  const userMonogram = document.getElementById("userMonogram");
  const authDropdown = document.getElementById("authDropdown");

  let cachedUser = null;
  try {
    cachedUser = JSON.parse(localStorage.getItem("shcAuthUser") || "null");
  } catch (_) {
    cachedUser = null;
  }

  const hasCachedUser = Boolean(cachedUser?.uid || cachedUser?.email);
  if (!loginNavBtn || !userMonogram) return;

  if (!hasCachedUser) {
    loginNavBtn.classList.remove("hidden");
    userMonogram.classList.add("hidden");
    return;
  }

  const source = String(cachedUser?.name || cachedUser?.email || "U").trim();
  const parts = source.split(/\s+/).filter(Boolean);
  let initials = "U";
  if (parts.length > 1) {
    initials = `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
  } else if (parts.length === 1) {
    initials = parts[0].slice(0, 2).toUpperCase();
  }

  loginNavBtn.classList.add("hidden");
  userMonogram.textContent = initials;
  userMonogram.classList.remove("hidden");

  if (authDropdown) {
    authDropdown.classList.add("hidden");
    authDropdown.classList.remove("is-visible");
  }
}

function loadScriptTag(src, { type = "text/javascript", defer = true } = {}) {
  const existing = document.querySelector(`script[src="${src}"]`);
  if (existing) {
    return Promise.resolve(existing);
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.defer = defer;
    if (type === "module") {
      script.type = "module";
      script.defer = false;
    }
    script.onload = () => resolve(script);
    script.onerror = () => reject(new Error(`Failed to load script: ${src}`));
    document.body.appendChild(script);
  });
}

function injectComponent(targetId, html, eventName) {
  const slot = document.getElementById(targetId);
  if (!slot || !html) return false;
  if (slot.innerHTML === html) {
    slot.setAttribute("data-loaded", "1");
    if (targetId === "site-header") {
      applyOptimisticAuthUi();
    }
    return true;
  }
  slot.innerHTML = html;
  slot.setAttribute("data-loaded", "1");
  if (targetId === "site-header") {
    applyOptimisticAuthUi();
  }
  if (eventName) dispatchChromeEvent(eventName);
  return true;
}

export async function initSiteChrome({
  headerTarget = "site-header",
  footerTarget = "site-footer",
  headerPath = "/components/header.html",
  footerPath = "/components/footer.html",
} = {}) {
  if (componentsPromise) {
    return componentsPromise;
  }

  const cachedHeaderHtml = getCachedComponent(headerPath);
  const cachedFooterHtml = getCachedComponent(footerPath);

  injectComponent(headerTarget, cachedHeaderHtml, "shc:header-loaded");
  injectComponent(footerTarget, cachedFooterHtml, "shc:footer-loaded");

  componentsPromise = (async () => {
    const [headerHtml, footerHtml] = await Promise.all([
      fetchComponent(headerPath),
      fetchComponent(footerPath),
    ]);

    injectComponent(headerTarget, headerHtml, "shc:header-loaded");
    injectComponent(footerTarget, footerHtml, "shc:footer-loaded");

    dispatchChromeEvent("shc:components-loaded");
    return true;
  })();

  return componentsPromise;
}

export async function loadSharedSiteScripts({ includeAuth = true } = {}) {
  if (sharedScriptsPromise) {
    return sharedScriptsPromise;
  }

  sharedScriptsPromise = (async () => {
    await initSiteChrome();
    if (includeAuth) {
      await loadScriptTag("/assets/js/global-auth.js", { type: "module", defer: false });
    }
    await loadScriptTag("/assets/js/policy-modals.js");
    await loadScriptTag("/assets/js/page-tracker.js");
    return true;
  })();

  return sharedScriptsPromise;
}

if (typeof window !== "undefined") {
  window.shcComponentsReady = window.shcComponentsReady || initSiteChrome();
  window.shcLoadSharedSiteScripts = loadSharedSiteScripts;
}
