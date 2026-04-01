(function () {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return;
  }

  const STYLE_ID = "shc-policy-modal-styles";
  const BIND_FLAG = "shcPolicyModalBound";

  const ensureStyle = () => {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      .shc-policy-modal { position: fixed; inset: 0; display: none; align-items: center; justify-content: center; padding: 16px; background: rgba(15,23,42,0.7); z-index: 2100; }
      .shc-policy-modal.is-visible { display: flex; }
      .shc-policy-card { width: min(840px, 100%); max-height: min(86vh, 760px); background: #fff; border-radius: 20px; padding: 26px; box-shadow: 0 30px 80px -45px rgba(15,23,42,0.75); overflow: hidden; position: relative; }
      .shc-policy-close { position: absolute; top: 12px; right: 12px; border: none; background: transparent; color: #94a3b8; font-size: 24px; line-height: 1; cursor: pointer; }
      .shc-policy-content { overflow-y: auto; max-height: calc(86vh - 72px); padding-right: 4px; color: #334155; }
      .shc-policy-content h2 { margin: 0 0 12px; color: #0f172a; font-size: 1.7rem; font-weight: 800; }
      .shc-policy-content h3 { margin: 20px 0 8px; color: #0f172a; font-size: 1.1rem; font-weight: 700; }
      .shc-policy-content p, .shc-policy-content li { line-height: 1.6; }
      .shc-policy-content ul { margin: 0 0 14px; padding-left: 20px; }
    `;
    document.head.appendChild(style);
  };

  const modalDefinitions = [
    {
      id: "aboutUsModal",
      heading: "About Us",
      content: `
        <p>SecondHandCell helps people turn used tech into fast, fair cash with transparent pricing and prepaid shipping.</p>
        <h3>What makes us different</h3>
        <ul>
          <li>Simple online quotes and a clear inspection process.</li>
          <li>Secure handling, certified data wiping, and legal compliance checks.</li>
          <li>Real customer support at <a href="mailto:sales@secondhandcell.com">sales@secondhandcell.com</a>.</li>
        </ul>
      `,
    },
    {
      id: "privacyPolicyModal",
      heading: "Privacy Policy",
      content: `
        <p><strong>Summary from our Privacy Policy:</strong> we collect contact details, device/transaction details, payout details, and technical data required to operate our service.</p>
        <h3>How we use information</h3>
        <ul>
          <li>Process quotes, orders, shipping labels, inspections, and payouts.</li>
          <li>Provide support, account access, fraud prevention, and compliance checks.</li>
          <li>Send optional marketing communications that can be unsubscribed from.</li>
        </ul>
        <p><a href="/privacy.html">Read the full Privacy Policy</a>.</p>
      `,
    },
    {
      id: "termsAndConditionsModal",
      heading: "Terms & Conditions",
      content: `
        <p><strong>Summary from our Terms:</strong> using our services means you confirm you are authorized to sell the submitted device.</p>
        <h3>Key points</h3>
        <ul>
          <li>Quotes are preliminary and finalized after inspection.</li>
          <li>Devices must not be lost, stolen, blacklisted, or financed.</li>
          <li>Risk of loss remains with the sender until carrier acceptance/scan.</li>
          <li>Continued use after updates means acceptance of revised terms.</li>
        </ul>
        <p><a href="/terms.html">Read the full Terms & Conditions</a>.</p>
      `,
    },
  ];

  const ensureModals = () => {
    modalDefinitions.forEach(({ id, heading, content }) => {
      if (document.getElementById(id)) return;
      const modal = document.createElement("div");
      modal.id = id;
      modal.className = "shc-policy-modal";
      modal.setAttribute("aria-hidden", "true");
      modal.innerHTML = `
        <div class="shc-policy-card" role="dialog" aria-modal="true" aria-label="${heading}">
          <button type="button" class="shc-policy-close" aria-label="Close ${heading}">&times;</button>
          <div class="shc-policy-content">
            <h2>${heading}</h2>
            ${content}
          </div>
        </div>
      `;
      document.body.appendChild(modal);
    });
  };

  const openModal = (modal) => {
    if (!modal) return;
    modal.style.display = "flex";
    modal.classList.add("is-visible");
    modal.setAttribute("aria-hidden", "false");
  };

  const closeModal = (modal) => {
    if (!modal) return;
    modal.classList.remove("is-visible");
    modal.style.display = "none";
    modal.setAttribute("aria-hidden", "true");
  };

  const bindModalClose = (modalId) => {
    const modal = document.getElementById(modalId);
    if (!modal || modal.dataset[BIND_FLAG] === "1") return;

    modal.dataset[BIND_FLAG] = "1";
    modal.querySelectorAll(".shc-policy-close, .close-modal-btn").forEach((button) => {
      button.addEventListener("click", () => closeModal(modal));
    });

    modal.addEventListener("click", (event) => {
      if (event.target === modal) {
        closeModal(modal);
      }
    });
  };

  const bindModalTrigger = (linkId, modalId) => {
    const link = document.getElementById(linkId);
    const modal = document.getElementById(modalId);
    if (!link || !modal || link.dataset[BIND_FLAG] === "1") return;

    link.dataset[BIND_FLAG] = "1";
    link.addEventListener("click", (event) => {
      event.preventDefault();
      openModal(modal);
    });
  };

  const bind = () => {
    ensureStyle();
    ensureModals();

    bindModalTrigger("aboutUsLink", "aboutUsModal");
    bindModalTrigger("privacyPolicyLink", "privacyPolicyModal");
    bindModalTrigger("termsAndConditionsLink", "termsAndConditionsModal");
    bindModalTrigger("termsAndConditionsLinkFooter", "termsAndConditionsModal");

    bindModalClose("aboutUsModal");
    bindModalClose("privacyPolicyModal");
    bindModalClose("termsAndConditionsModal");

    document.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
      ["aboutUsModal", "privacyPolicyModal", "termsAndConditionsModal"].forEach((id) => {
        const modal = document.getElementById(id);
        if (modal?.classList.contains("is-visible")) {
          closeModal(modal);
        }
      });
    });
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bind);
  } else {
    bind();
  }
})();
