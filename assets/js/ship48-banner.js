(() => {
  const PROMO_CODE = 'SHIP48';
  const PROMO_STORAGE_KEY = 'shcSelectedPromoCode';
  const PROMO_DISMISS_KEY = 'shcShip48BannerDismissed';
  const SHIP48_START_KEY = 'shcShip48StartFlow';
  const API_BASE = ((window.SHC_API_BASE_URL || 'https://us-central1-buyback-a0f05.cloudfunctions.net/api').replace(/\/$/, ''));

  const MARQUEE_TEXT = 'PROMO CODE SHIP48 · USE CODE SHIP48 · SHIP WITHIN 48 HOURS FOR +$10';

  const safeStorage = {
    get(key) {
      try {
        return window.localStorage ? window.localStorage.getItem(key) : null;
      } catch (error) {
        console.warn('Storage get failed:', error);
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
        console.warn('Storage set failed:', error);
      }
    },
  };

  function initNavToggle() {
    const toggle = document.querySelector('[data-site-nav-toggle]');
    const nav = document.getElementById('siteNav');
    if (!toggle || !nav) return;

    toggle.addEventListener('click', () => {
      const isOpen = nav.classList.toggle('is-open');
      toggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    });

    document.addEventListener('click', (event) => {
      if (!nav.contains(event.target) && !toggle.contains(event.target) && nav.classList.contains('is-open')) {
        nav.classList.remove('is-open');
        toggle.setAttribute('aria-expanded', 'false');
      }
    });
  }

  function setStatusText(target, message, tone) {
    if (!target) return;
    target.textContent = message || '';
    target.classList.remove('ship48-status--success', 'ship48-status--error');
    if (tone === 'success') {
      target.classList.add('ship48-status--success');
    } else if (tone === 'error') {
      target.classList.add('ship48-status--error');
    }
  }

  function ensureTicker(banner) {
    if (!banner) return;
    if (banner.querySelector('.ship48-banner__ticker')) return;
    const inner = banner.querySelector('.ship48-banner__inner');
    if (!inner) return;
    const ticker = document.createElement('div');
    ticker.className = 'ship48-banner__ticker';
    const track = document.createElement('div');
    track.className = 'ship48-banner__ticker-track';
    const marqueeChunk = `<span>${MARQUEE_TEXT}</span>`;
    track.innerHTML = `${marqueeChunk}${marqueeChunk}${marqueeChunk}`;
    ticker.appendChild(track);
    inner.insertAdjacentElement('afterbegin', ticker);
  }

  function enhanceBannerCopy(banner) {
    if (!banner) return;
    const messageEl = banner.querySelector('.ship48-banner__message');
    if (!messageEl) return;
    const counterEl = banner.querySelector('[data-ship48-counter]');
    const statusEl = banner.querySelector('[data-ship48-status]');
    if (counterEl) counterEl.remove();
    if (statusEl) statusEl.remove();
    messageEl.innerHTML = `
      <span class="ship48-banner__eyebrow">USE CODE</span>
      <span class="ship48-banner__headline">PROMO CODE ${PROMO_CODE}</span>
      <span class="ship48-banner__subhead">Ship within 48 hours with Email Label &amp; we add +$10 automatically.</span>
    `;
    const metaRow = document.createElement('div');
    metaRow.className = 'ship48-banner__meta';
    if (counterEl) metaRow.appendChild(counterEl);
    if (statusEl) metaRow.appendChild(statusEl);
    if (metaRow.childElementCount) {
      messageEl.appendChild(metaRow);
    }
    ensureTicker(banner);
    const startBtn = banner.querySelector('[data-ship48-start]');
    if (startBtn) {
      startBtn.textContent = 'Start my quote now';
    }
  }

  function hydrateCounts(counterEl, statusEl, startBtn) {
    fetch(`${API_BASE}/promo-codes/${PROMO_CODE}`)
      .then((response) => {
        if (!response.ok) throw new Error('Failed to load promo stats');
        return response.json();
      })
      .then((data) => {
        const usesLeftRaw = Number(data.usesLeft ?? data.uses_left ?? 0);
        const maxUsesRaw = Number(data.maxUses ?? data.max_uses ?? 100);
        const bonusRaw = Number(data.bonusAmount ?? data.bonus_amount ?? 10);
        const usesLeft = Number.isFinite(usesLeftRaw) ? usesLeftRaw : null;
        const maxUses = Number.isFinite(maxUsesRaw) && maxUsesRaw > 0 ? maxUsesRaw : 100;
        const bonusAmount = Number.isFinite(bonusRaw) && bonusRaw > 0 ? bonusRaw : 10;

        if (counterEl) {
          if (usesLeft === null) {
            counterEl.textContent = `Limited to the first ${maxUses} Ship48 bonuses.`;
          } else if (usesLeft > 0) {
            counterEl.textContent = `${usesLeft} of ${maxUses} Ship48 bonuses remain (+$${bonusAmount}).`;
          } else {
            counterEl.textContent = 'All Ship48 bonuses claimed for now.';
          }
        }

        if (startBtn && usesLeft === 0) {
          startBtn.disabled = true;
          startBtn.textContent = 'All bonuses claimed';
        }
      })
      .catch((error) => {
        console.warn('Ship48 stats failed:', error);
        if (counterEl && !counterEl.textContent) {
          counterEl.textContent = 'Limited Ship48 bonuses remain. Act fast!';
        }
        setStatusText(statusEl, 'SHIP48 adds +$10 when you select Email Label (limited).', 'error');
      });
  }

  function startShip48Flow(options = {}) {
    const { statusEl } = options;
    safeStorage.set(PROMO_STORAGE_KEY, PROMO_CODE);
    window.dispatchEvent(new CustomEvent('shc:promo-code-selected', { detail: { code: PROMO_CODE } }));
    const quoteModal = document.getElementById('quoteModal') || document.getElementById('pricingModal');
    if (quoteModal) {
      window.dispatchEvent(new CustomEvent('shc:ship48-start-order', { detail: { source: 'banner' } }));
      safeStorage.set(SHIP48_START_KEY, null);
      setStatusText(statusEl, `${PROMO_CODE} locked in — launching the quote wizard…`, 'success');
      return;
    }
    safeStorage.set(SHIP48_START_KEY, '1');
    const targetUrl = new URL('/sell-device.html', window.location.origin);
    targetUrl.searchParams.set('ship48Start', '1');
    window.location.href = targetUrl.toString();
  }

  function initBanner() {
    const banner = document.querySelector('[data-ship48-banner]');
    if (!banner) return;
    if (safeStorage.get(PROMO_DISMISS_KEY) === '1') return;

    enhanceBannerCopy(banner);
    banner.hidden = false;

    const startBtn = banner.querySelector('[data-ship48-start]');
    const dismissBtn = banner.querySelector('[data-ship48-dismiss]');
    const counterEl = banner.querySelector('[data-ship48-counter]');
    const statusEl = banner.querySelector('[data-ship48-status]');

    if (startBtn) {
      startBtn.addEventListener('click', () => {
        startShip48Flow({ statusEl });
      });
    }

    if (dismissBtn) {
      dismissBtn.addEventListener('click', () => {
        safeStorage.set(PROMO_DISMISS_KEY, '1');
        banner.remove();
      });
    }

    hydrateCounts(counterEl, statusEl, startBtn);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      initNavToggle();
      initBanner();
    });
  } else {
    initNavToggle();
    initBanner();
  }
})();
