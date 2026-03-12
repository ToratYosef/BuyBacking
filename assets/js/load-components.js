const componentCache = new Map();
let componentsPromise = null;
let sharedScriptsPromise = null;

async function fetchComponent(path) {
  if (!componentCache.has(path)) {
    componentCache.set(
      path,
      fetch(path, { credentials: "same-origin" }).then((response) => {
        if (!response.ok) {
          throw new Error(`Failed to load component: ${path}`);
        }
        return response.text();
      })
    );
  }
  return componentCache.get(path);
}

function dispatchChromeEvent(name) {
  document.dispatchEvent(new CustomEvent(name));
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

export async function initSiteChrome({
  headerTarget = "site-header",
  footerTarget = "site-footer",
  headerPath = "/components/header.html",
  footerPath = "/components/footer.html",
} = {}) {
  if (componentsPromise) {
    return componentsPromise;
  }

  componentsPromise = (async () => {
    const [headerHtml, footerHtml] = await Promise.all([
      fetchComponent(headerPath),
      fetchComponent(footerPath),
    ]);

    const headerSlot = document.getElementById(headerTarget);
    if (headerSlot) {
      headerSlot.innerHTML = headerHtml;
      headerSlot.setAttribute("data-loaded", "1");
      dispatchChromeEvent("shc:header-loaded");
    }

    const footerSlot = document.getElementById(footerTarget);
    if (footerSlot) {
      footerSlot.innerHTML = footerHtml;
      footerSlot.setAttribute("data-loaded", "1");
      dispatchChromeEvent("shc:footer-loaded");
    }

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
