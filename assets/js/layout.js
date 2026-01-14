(() => {
  const styleId = "shc-shared-layout";
  if (!document.getElementById(styleId)) {
    const style = document.createElement("style");
    style.id = styleId;
    style.textContent = `
      :root {
        --shc-indigo: #5b21b6;
        --shc-navy: #0f172a;
        --shc-slate: #1f2937;
        --shc-ice: #f8fafc;
      }
      .shc-global-header {
        position: sticky;
        top: 0;
        z-index: 100;
        background: rgba(255,255,255,0.92);
        backdrop-filter: blur(12px);
        border-bottom: 1px solid #e5e7eb;
        box-shadow: 0 10px 30px -20px rgba(0,0,0,0.3);
      }
      .shc-header-inner {
        max-width: 1200px;
        margin: 0 auto;
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 14px 20px;
        gap: 16px;
      }
      .shc-brand {
        display: flex;
        align-items: center;
        gap: 10px;
        font-weight: 800;
        color: var(--shc-slate);
        text-decoration: none;
        letter-spacing: -0.02em;
      }
      .shc-brand img { height: 40px; width: 40px; object-fit: contain; }
      .shc-nav {
        display: flex;
        align-items: center;
        gap: 16px;
        flex-wrap: wrap;
      }
      .shc-nav a {
        color: #334155;
        text-decoration: none;
        font-weight: 600;
        padding: 8px 12px;
        border-radius: 10px;
        transition: all .2s ease;
      }
      .shc-nav a:hover { color: var(--shc-indigo); background: #ede9fe; }
      .shc-cta {
        display: inline-flex;
        align-items: center;
        gap: 10px;
        padding: 10px 18px;
        border-radius: 12px;
        background: linear-gradient(120deg,#7c3aed,#22d3ee);
        color: white !important;
        text-decoration: none;
        font-weight: 700;
        box-shadow: 0 10px 20px -12px rgba(124,58,237,0.6);
      }
      .shc-menu-toggle {
        display: none;
        background: #ede9fe;
        color: #4c1d95;
        border: 1px solid #c4b5fd;
        border-radius: 10px;
        padding: 8px 10px;
        font-weight: 700;
        gap: 8px;
        align-items: center;
        justify-content: center;
        cursor: pointer;
      }
      .shc-ship48-banner {
        display: none;
        position: relative;
        z-index: 95;
        border-top: 1px solid #fde68a;
        border-bottom: 1px solid #fde68a;
        background: radial-gradient(circle at top left,#fef9c3,#fef3c7);
        color: #92400e;
        padding: 10px 16px 12px;
        box-shadow: inset 0 1px 0 rgba(253,230,138,0.8);
      }
      .shc-ship48-banner.is-visible { display: block; }
      .shc-ship48-inner {
        max-width: 1200px;
        margin: 0 auto;
        display: flex;
        flex-direction: column;
        gap: 10px;
      }
      .shc-ship48-ticker {
        width: 100%;
        border-radius: 999px;
        border: 1px dashed rgba(234,88,12,0.45);
        overflow: hidden;
        background: rgba(255,255,255,0.85);
        padding: 2px 0;
      }
      .shc-ship48-ticker-track {
        display: inline-flex;
        gap: 16px;
        width: max-content;
        white-space: nowrap;
        animation: shcShipMarquee 16s linear infinite;
      }
      .shc-ship48-ticker-track span {
        font-weight: 700;
        letter-spacing: 0.28em;
        font-size: 0.7rem;
        color: #92400e;
      }
      .shc-ship48-text {
        flex: 1;
        min-width: 240px;
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      .shc-ship48-eyebrow {
        font-size: 0.65rem;
        letter-spacing: 0.32em;
        font-weight: 700;
        color: #b45309;
      }
      .shc-ship48-headline {
        font-size: clamp(1.1rem,3.2vw,1.8rem);
        font-weight: 800;
        letter-spacing: 0.06em;
        color: #78350f;
      }
      .shc-ship48-subtext {
        margin: 0;
        font-size: 0.92rem;
        font-weight: 600;
        color: #92400e;
      }
      .shc-ship48-meta {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        font-size: 0.78rem;
        font-weight: 600;
        color: #92400e;
      }
      .shc-ship48-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
      }
      .shc-ship48-cta {
        border-radius: 999px;
        border: none;
        background: linear-gradient(115deg,#f97316,#ea580c);
        color: #fff;
        font-weight: 800;
        letter-spacing: 0.05em;
        text-transform: uppercase;
        padding: 10px 22px;
        cursor: pointer;
        box-shadow: 0 25px 40px -30px rgba(185,28,28,0.6);
        transition: transform .2s ease, box-shadow .2s ease;
        width: 100%;
        font-size: 0.85rem;
      }
      .shc-ship48-cta:hover {
        transform: translateY(-2px);
        box-shadow: 0 25px 40px -24px rgba(185,28,28,0.55);
      }
      .shc-ship48-cta:disabled {
        opacity: 0.6;
        cursor: not-allowed;
        box-shadow: none;
      }
      .shc-ship48-dismiss {
        position: absolute;
        top: 8px;
        right: 12px;
        border: none;
        background: transparent;
        color: #b45309;
        font-size: 18px;
        cursor: pointer;
        padding: 6px;
        border-radius: 50%;
      }
      .shc-ship48-dismiss:hover { background: rgba(250,204,21,0.25); }
      .shc-ship48-status {
        font-size: 0.85rem;
        color: #92400e;
        font-weight: 600;
      }
      .shc-ship48-status.success { color: #166534; }
      .shc-ship48-status.error { color: #b91c1c; }
      @keyframes shcShipMarquee {
        0% { transform: translate3d(0,0,0); }
        100% { transform: translate3d(-50%,0,0); }
      }
      @media (min-width: 768px) {
        .shc-ship48-inner { flex-direction: row; align-items: center; justify-content: space-between; }
        .shc-ship48-cta { width: auto; min-width: 190px; }
      }
      @media (max-width: 640px) {
        .shc-ship48-inner { align-items: stretch; }
        .shc-ship48-banner { padding: 8px 12px; }
        .shc-ship48-headline { font-size: 1rem; }
        .shc-ship48-subtext { font-size: 0.85rem; }
      }
      .shc-global-footer {
        background: #0b1224;
        color: #e2e8f0;
        padding: 48px 20px 30px;
        margin-top: 64px;
      }
      .shc-footer-inner {
        max-width: 1200px;
        margin: 0 auto;
        display: grid;
        grid-template-columns: repeat(auto-fit,minmax(180px,1fr));
        gap: 28px;
      }
      .shc-footer-top {
        display: flex;
        flex-direction: column;
        gap: 12px;
      }
      .shc-footer-top p { color: #cbd5e1; line-height: 1.6; }
      .shc-footer-col h4 { font-size: 15px; text-transform: uppercase; letter-spacing: .06em; color: #94a3b8; margin-bottom: 12px; }
      .shc-footer-col ul { list-style: none; padding: 0; margin: 0; display: grid; gap: 8px; }
      .shc-footer-col a { color: #e2e8f0; text-decoration: none; font-weight: 600; }
      .shc-footer-col a:hover { color: #a5b4fc; }
      .shc-footer-bottom { max-width: 1200px; margin: 28px auto 0; padding-top: 18px; border-top: 1px solid #1f2937; display: flex; flex-wrap: wrap; gap: 10px; justify-content: space-between; align-items: center; color: #94a3b8; font-size: 14px; }
      @media (max-width: 900px) {
        .shc-header-inner { flex-wrap: wrap; gap: 12px; }
        .shc-menu-toggle { display: inline-flex; }
        .shc-nav {
          width: 100%;
          display: none;
          flex-direction: column;
          align-items: flex-start;
          padding: 6px 0 4px;
          background: rgba(255,255,255,0.9);
          border-radius: 10px;
          border: 1px solid #e2e8f0;
        }
        .shc-nav.is-open { display: flex; }
        .shc-nav a { width: 100%; }
        .shc-cta { width: 100%; justify-content: center; }
      }
    `;
    document.head.appendChild(style);
  }

  const headerHtml = `
    <header class="shc-global-header">
      <div class="shc-header-inner">
        <a class="shc-brand" href="/">
          <img src="/assets/logo.webp" alt="SecondHandCell logo" loading="lazy" />
          <div>
            <div>SecondHandCell</div>
            <small style="display:block;color:#6366f1;font-weight:700;">Sell • Upgrade • Protect</small>
          </div>
        </a>
        <button class="shc-menu-toggle" type="button" aria-label="Toggle navigation" aria-expanded="false">
          <span>Menu</span>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>
        <nav class="shc-nav" aria-label="Primary">
          <a href="/sell/">Sell Device</a>
          <a href="/popular-devices.html">Popular Devices</a>
          <a href="/iphone/">iPhone</a>
          <a href="/samsung/">Samsung</a>
          <a href="/ipad/">iPad</a>
          <a href="/login.html">My Account</a>
          <a class="shc-cta" href="/sell/">Get My Offer</a>
        </nav>
      </div>
    </header>
  `;

  const footerHtml = `
    <footer class="shc-global-footer">
      <div class="shc-footer-inner">
        <div class="shc-footer-top">
          <div style="display:flex;align-items:center;gap:10px;">
            <img src="/assets/logo.webp" alt="SecondHandCell" style="height:44px;width:44px;object-fit:contain;">
            <div>
              <div style="font-weight:800;font-size:18px;">SecondHandCell</div>
              <div style="color:#c7d2fe;font-weight:600;">Turn your old phone into cash</div>
            </div>
          </div>
          <p>Simple, safe, and fast device buybacks. Transparent pricing, prepaid shipping, and friendly support—every step of the way.</p>
        </div>
        <div class="shc-footer-col">
          <h4>Coverage</h4>
          <ul>
            <li><a href="/sell/">Sell Your Device</a></li>
            <li><a href="/popular-devices.html">Popular Devices</a></li>
            <li><a href="/ipad/">iPad Trade-Ins</a></li>
            <li><a href="/samsung/">Samsung Offers</a></li>
          </ul>
        </div>
        <div class="shc-footer-col">
          <h4>Support</h4>
          <ul>
            <li><a href="mailto:support@secondhandcell.com">Email Support</a></li>
            <li><a href="/login.html">Customer Portal</a></li>
            <li><a href="/privacy.html#faq">FAQ</a></li>
            <li><a href="/order-submitted.html">Track My Kit</a></li>
          </ul>
        </div>
        <div class="shc-footer-col">
          <h4>Company</h4>
          <ul>
            <li><a href="/privacy.html">Privacy Policy</a></li>
            <li><a href="/terms.html">Terms of Service</a></li>
            <li><a href="https://www.trustpilot.com/evaluate/secondhandcell.com" target="_blank" rel="noreferrer">Trustpilot Reviews</a></li>
            <li><a href="/unsubscribe/">Unsubscribe</a></li>
          </ul>
        </div>
      </div>
      <div class="shc-footer-bottom">
        <span>© ${new Date().getFullYear()} SecondHandCell. All rights reserved.</span>
        <div style="display:flex;gap:12px;flex-wrap:wrap;">
          <a href="/terms.html" style="color:#cbd5e1;">Terms</a>
          <a href="/privacy.html" style="color:#cbd5e1;">Privacy</a>
          <a href="/unsubscribe/" style="color:#cbd5e1;">Email Preferences</a>
        </div>
      </div>
    </footer>
  `;

  const removeLegacySections = () => {
    const candidates = [
      ...document.querySelectorAll('body > header'),
      ...document.querySelectorAll('body > footer'),
      ...document.querySelectorAll('header.site-header'),
      ...document.querySelectorAll('footer.site-footer'),
    ];

    candidates.forEach((el) => {
      if (!el.classList.contains('shc-global-header') && !el.classList.contains('shc-global-footer')) {
        el.remove();
      }
    });
  };

  const appendIfMissing = (selector, html, position = 'afterbegin') => {
    if (!document.querySelector(selector)) {
      const wrapper = document.createElement('div');
      wrapper.innerHTML = html.trim();
      const element = wrapper.firstElementChild;
      if (position === 'afterbegin') {
        document.body.insertBefore(element, document.body.firstChild);
      } else {
        document.body.appendChild(element);
      }
    }
  };

  const safeStorage = {
    get(key) {
      try {
        return window.localStorage ? window.localStorage.getItem(key) : null;
      } catch (error) {
        console.warn('Storage read blocked:', error?.message || error);
        return null;
      }
    },
    set(key, value) {
      try {
        if (!window.localStorage) return;
        if (value === null || typeof value === 'undefined') {
          window.localStorage.removeItem(key);
        } else {
          window.localStorage.setItem(key, value);
        }
      } catch (error) {
        console.warn('Storage write blocked:', error?.message || error);
      }
    },
  };

  const PROMO_CODE = 'SHIP48';
  const PROMO_STORAGE_KEY = 'shcSelectedPromoCode';
  const PROMO_DISMISS_KEY = 'shcShip48BannerDismissed';
  const SHIP48_START_KEY = 'shcShip48StartFlow';
  const PROMO_API_BASE =
    (typeof window !== 'undefined' && window.SHC_API_BASE_URL) ||
    'https://us-central1-buyback-a0f05.cloudfunctions.net/api';
  let layoutBootstrapped = false;

  function createShip48Banner() {
    const banner = document.createElement('section');
    banner.id = 'shc-ship48-banner';
    banner.className = 'shc-ship48-banner';
    banner.innerHTML = `
      <div class="shc-ship48-inner">
        <div class="shc-ship48-ticker" aria-hidden="true">
          <div class="shc-ship48-ticker-track">
            <span>USE CODE ${PROMO_CODE}</span>
            <span>PROMO CODE ${PROMO_CODE}</span>
            <span>SHIP IN 48 HOURS FOR +$10</span>
          </div>
        </div>
        <div class="shc-ship48-text">
          <span class="shc-ship48-eyebrow">USE CODE</span>
          <strong class="shc-ship48-headline">PROMO CODE ${PROMO_CODE}</strong>
          <p class="shc-ship48-subtext">Ship within 48 hours using Email Label to earn an instant +$10 bonus.</p>
          <div class="shc-ship48-meta">
            <span data-ship48-counter>Limited Ship48 bonuses remain.</span>
            <span class="shc-ship48-status" data-ship48-status></span>
          </div>
        </div>
        <div class="shc-ship48-actions">
          <button type="button" class="shc-ship48-cta" data-ship48-cta>Start my quote now</button>
        </div>
      </div>
      <button type="button" class="shc-ship48-dismiss" aria-label="Dismiss Ship48 promo" data-ship48-dismiss>&times;</button>
    `;
    return banner;
  }

  function updateShip48Status(statusEl, type, message) {
    if (!statusEl) return;
    statusEl.textContent = message || '';
    statusEl.classList.remove('success', 'error');
    if (type === 'success') {
      statusEl.classList.add('success');
    } else if (type === 'error') {
      statusEl.classList.add('error');
    }
  }

  function hydrateShip48Counts(banner) {
    if (!banner) return;
    const counterEl = banner.querySelector('[data-ship48-counter]');
    const statusEl = banner.querySelector('[data-ship48-status]');
    const ctaBtn = banner.querySelector('[data-ship48-cta]');

    fetch(`${PROMO_API_BASE.replace(/\/$/, '')}/promo-codes/${PROMO_CODE}`)
      .then((response) => {
        if (!response.ok) {
          throw new Error('Failed to load promo stats');
        }
        return response.json();
      })
      .then((data) => {
        const usesLeftRaw = Number(data.usesLeft ?? data.uses_left ?? 0);
        const maxUsesRaw = Number(data.maxUses ?? data.max_uses ?? 0);
        const bonusRaw = Number(data.bonusAmount ?? data.bonus_amount ?? 10);
        const usesLeft = Number.isFinite(usesLeftRaw) ? usesLeftRaw : null;
        const maxUses = Number.isFinite(maxUsesRaw) && maxUsesRaw > 0 ? maxUsesRaw : 100;
        const bonusText = Number.isFinite(bonusRaw) && bonusRaw > 0 ? bonusRaw : 10;

        if (counterEl) {
          if (usesLeft === null) {
            counterEl.textContent = `Limited to the first ${maxUses} Ship48 bonuses.`;
          } else if (usesLeft > 0) {
            counterEl.textContent = `${usesLeft} of ${maxUses} Ship48 bonuses remain (+$${bonusText}).`;
          } else {
            counterEl.textContent = 'All Ship48 bonuses have been claimed for now.';
          }
        }

        if (usesLeft !== null && usesLeft <= 0 && ctaBtn) {
          ctaBtn.disabled = true;
          ctaBtn.textContent = 'All bonuses claimed';
        }
      })
      .catch((error) => {
        console.warn('Ship48 promo lookup failed:', error);
        if (counterEl && !counterEl.textContent) {
          counterEl.textContent = 'Limited Ship48 bonuses available. Act fast!';
        }
        updateShip48Status(
          statusEl,
          'error',
          'Promo code SHIP48 adds $10 when you select Email Label (subject to availability).'
        );
      });
  }

  function startShip48FlowFromLayout(statusEl) {
    safeStorage.set(PROMO_STORAGE_KEY, PROMO_CODE);
    window.dispatchEvent(
      new CustomEvent('shc:promo-code-selected', {
        detail: { code: PROMO_CODE },
      })
    );
    const modal = document.getElementById('quoteModal') || document.getElementById('pricingModal');
    if (modal) {
      window.dispatchEvent(
        new CustomEvent('shc:ship48-start-order', { detail: { source: 'shared-layout' } })
      );
      safeStorage.set(SHIP48_START_KEY, null);
      updateShip48Status(statusEl, 'success', `${PROMO_CODE} locked in — launching the quote wizard…`);
      return;
    }
    safeStorage.set(SHIP48_START_KEY, '1');
    const targetUrl = new URL('/sell', window.location.origin);
    targetUrl.searchParams.set('ship48Start', '1');
    window.location.href = targetUrl.toString();
  }

  function initShip48Banner() {
    if (safeStorage.get(PROMO_DISMISS_KEY) === '1') {
      return;
    }
    if (document.getElementById('shc-ship48-banner')) {
      return;
    }

    const banner = createShip48Banner();
    const header = document.querySelector('.shc-global-header');

    if (header && header.parentNode) {
      header.insertAdjacentElement('afterend', banner);
    } else {
      document.body.insertBefore(banner, document.body.firstChild);
    }

    const ctaBtn = banner.querySelector('[data-ship48-cta]');
    const dismissBtn = banner.querySelector('[data-ship48-dismiss]');
    const statusEl = banner.querySelector('[data-ship48-status]');

    if (ctaBtn) {
      ctaBtn.addEventListener('click', (event) => {
        event.preventDefault();
        startShip48FlowFromLayout(statusEl);
      });
    }

    if (dismissBtn) {
      dismissBtn.addEventListener('click', () => {
        banner.classList.remove('is-visible');
        banner.remove();
        safeStorage.set(PROMO_DISMISS_KEY, '1');
      });
    }

    requestAnimationFrame(() => {
      banner.classList.add('is-visible');
      hydrateShip48Counts(banner);
    });
  }

  function bootstrapSharedLayout() {
    if (layoutBootstrapped) return;
    layoutBootstrapped = true;
    removeLegacySections();
    appendIfMissing('.shc-global-header', headerHtml, 'afterbegin');
    appendIfMissing('.shc-global-footer', footerHtml, 'beforeend');
    const nav = document.querySelector('.shc-nav');
    const toggle = document.querySelector('.shc-menu-toggle');
    if (nav && toggle) {
      toggle.addEventListener('click', () => {
        const isOpen = nav.classList.toggle('is-open');
        toggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
      });
    }
    initShip48Banner();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrapSharedLayout, { once: true });
  } else {
    bootstrapSharedLayout();
  }
})();
