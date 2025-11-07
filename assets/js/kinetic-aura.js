(() => {
  const body = document.body;
  if (!body) return;

  const applyAura = (enable) => {
    body.classList.toggle("kinetic-aura", enable);
    body.classList.toggle("kinetic-aura-static", !enable);
  };

  const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  applyAura(!motionQuery.matches);
  motionQuery.addEventListener("change", (event) => {
    applyAura(!event.matches);
  });

  // Magnetic button interaction
  const magneticButtons = new Set();
  const registerButtons = () => {
    document.querySelectorAll(".btn-magnetic").forEach((btn) => magneticButtons.add(btn));
  };
  registerButtons();

  const pointerState = {
    frame: null,
    x: 0,
    y: 0,
  };

  const updateButtons = (x, y) => {
    magneticButtons.forEach((btn) => {
      const rect = btn.getBoundingClientRect();
      const relativeX = x - (rect.left + rect.width / 2);
      const relativeY = y - (rect.top + rect.height / 2);
      btn.style.setProperty("--hover-x", `${relativeX * 0.35}px`);
      btn.style.setProperty("--hover-y", `${relativeY * 0.35}px`);
    });
  };

  const handlePointerMove = (event) => {
    pointerState.x = event.clientX;
    pointerState.y = event.clientY;
    if (!pointerState.frame) {
      pointerState.frame = requestAnimationFrame(() => {
        updateButtons(pointerState.x, pointerState.y);
        document.documentElement.style.setProperty("--orb-x", `${(pointerState.x / window.innerWidth) * 100}%`);
        document.documentElement.style.setProperty("--orb-y", `${(pointerState.y / window.innerHeight) * 100}%`);
        pointerState.frame = null;
      });
    }
  };

  const resetButton = (btn) => {
    btn.style.setProperty("--hover-x", "0px");
    btn.style.setProperty("--hover-y", "0px");
  };

  magneticButtons.forEach((btn) => {
    btn.addEventListener("pointerleave", () => resetButton(btn));
  });

  document.addEventListener("pointermove", handlePointerMove, { passive: true });

  // Anchor positioning helper: ensure hover cards stay visible for keyboard users
  const anchorTriggers = document.querySelectorAll("[data-anchor-trigger]");
  anchorTriggers.forEach((trigger) => {
    const targetSelector = trigger.getAttribute("data-anchor-target") || trigger.getAttribute("data-target") || trigger.getAttribute("aria-controls");
    if (!targetSelector) return;
    const card = document.querySelector(targetSelector.startsWith("#") ? targetSelector : `#${targetSelector}`);
    if (!card || !card.matches("[data-anchor-card]")) return;

    const setExpanded = (expanded) => {
      trigger.setAttribute("aria-expanded", String(expanded));
    };

    const show = () => {
      card.dataset.open = "true";
      setExpanded(true);
    };
    const hide = () => {
      card.dataset.open = "false";
      setExpanded(false);
    };

    trigger.addEventListener("focus", show);
    trigger.addEventListener("blur", hide);
    trigger.addEventListener("pointerenter", show);
    trigger.addEventListener("pointerleave", hide);
    card.addEventListener("pointerenter", show);
    card.addEventListener("pointerleave", hide);
    card.addEventListener("keyup", (event) => {
      if (event.key === "Escape") {
        hide();
        trigger.focus();
      }
    });

    setExpanded(false);
  });

  // Watch for dynamically added magnetic buttons (Sell flow uses dynamic panels)
  const observer = new MutationObserver((mutations) => {
    let found = false;
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (!(node instanceof HTMLElement)) return;
        if (node.matches && node.matches(".btn-magnetic")) {
          magneticButtons.add(node);
          node.addEventListener("pointerleave", () => resetButton(node));
          found = true;
        }
        node.querySelectorAll?.(".btn-magnetic").forEach((btn) => {
          magneticButtons.add(btn);
          btn.addEventListener("pointerleave", () => resetButton(btn));
          found = true;
        });
      });
    });
    if (found && pointerState.frame === null) {
      updateButtons(pointerState.x, pointerState.y);
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });
})();
