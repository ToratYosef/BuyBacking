(() => {
  const PROMO_CODE = 'SHIP48';
  const PROMO_STORAGE_KEY = 'shcSelectedPromoCode';
  const PROMO_DISMISS_KEY = 'shcShip48BannerDismissed';
  const SHIP48_START_KEY = 'shcShip48StartFlow';
  const API_BASE = ((window.SHC_API_BASE_URL || 'https://us-central1-buyback-a0f05.cloudfunctions.net/api').replace(/\/$/, ''));

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

  function hydrateCounts(counterEl, statusEl, applyBtn) {
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

        if (applyBtn && usesLeft === 0) {
          applyBtn.disabled = true;
          applyBtn.textContent = 'All bonuses claimed';
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

  function startShip48Flow() {
    safeStorage.set(PROMO_STORAGE_KEY, PROMO_CODE);
    safeStorage.set(SHIP48_START_KEY, '1');
    window.dispatchEvent(new CustomEvent('shc:promo-code-selected', { detail: { code: PROMO_CODE } }));
    const quoteModal = document.getElementById('quoteModal');
    if (quoteModal) {
      window.dispatchEvent(new CustomEvent('shc:ship48-start-order', { detail: { source: 'banner' } }));
      safeStorage.set(SHIP48_START_KEY, null);
    } else {
      const targetUrl = new URL('/sell/index.html', window.location.origin);
      targetUrl.searchParams.set('ship48Start', '1');
      window.location.href = targetUrl.toString();
    }
  }

  function initBanner() {
    const banner = document.querySelector('[data-ship48-banner]');
    if (!banner) return;
    if (safeStorage.get(PROMO_DISMISS_KEY) === '1') return;

    banner.hidden = false;

    const applyBtn = banner.querySelector('[data-ship48-apply]');
    const startBtn = banner.querySelector('[data-ship48-start]');
    const dismissBtn = banner.querySelector('[data-ship48-dismiss]');
    const counterEl = banner.querySelector('[data-ship48-counter]');
    const statusEl = banner.querySelector('[data-ship48-status]');

    if (applyBtn) {
      applyBtn.addEventListener('click', () => {
        safeStorage.set(PROMO_STORAGE_KEY, PROMO_CODE);
        window.dispatchEvent(new CustomEvent('shc:promo-code-selected', { detail: { code: PROMO_CODE } }));
        setStatusText(statusEl, `${PROMO_CODE} saved! Finish checkout with Email Label for +$10.`, 'success');
      });
    }

    if (startBtn) {
      startBtn.addEventListener('click', () => {
        startShip48Flow();
        setStatusText(statusEl, 'Ship48 flow started — check your quote builder.', 'success');
      });
    }

    if (dismissBtn) {
      dismissBtn.addEventListener('click', () => {
        safeStorage.set(PROMO_DISMISS_KEY, '1');
        banner.remove();
      });
    }

    hydrateCounts(counterEl, statusEl, applyBtn);
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
