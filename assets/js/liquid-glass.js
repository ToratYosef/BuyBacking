(function () {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return;
  }

  const LIQUID_CLASS = "liquid-glass";
  const SURFACE_CLASS = "liquid-glass-surface";

  const SURFACE_SELECTORS = [
    "main",
    "section",
    "header",
    "footer",
    "nav",
    "article",
    "aside",
    ".container",
    ".site-container",
    ".card",
    ".card-container",
    ".glass-card",
    ".modal-content",
    ".form-wrapper",
    ".quote-form",
    ".pricing-card",
    ".faq-item",
    ".feature-card",
    ".hero",
    ".hero-section",
    ".cta-section",
    ".content-wrapper",
    ".info-card",
    ".panel",
    ".summary-card",
    ".step-card",
    ".stat-card"
  ];

  function applyLiquidGlass() {
    const body = document.body;
    if (!body || body.classList.contains(LIQUID_CLASS)) {
      return;
    }

    body.classList.add(LIQUID_CLASS);

    try {
      const selector = SURFACE_SELECTORS.join(",");
      const nodes = document.querySelectorAll(selector);

      nodes.forEach((node) => {
        if (!node || typeof node.classList === "undefined") {
          return;
        }

        if (node.closest(".no-liquid-glass")) {
          return;
        }

        node.classList.add(SURFACE_CLASS);
      });
    } catch (error) {
      console.warn("Liquid glass enhancement skipped", error);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", applyLiquidGlass, { once: true });
  } else {
    applyLiquidGlass();
  }
})();
