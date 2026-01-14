(() => {
  const PROMO_CODE = 'SHIP48';
  const PROMO_DISMISS_KEY = 'shcShip48BannerDismissed';
  
  const safeStorage = {
    get(key) { try { return window.localStorage ? window.localStorage.getItem(key) : null; } catch (e) { return null; } },
    set(key, val) { try { if(window.localStorage) window.localStorage.setItem(key, val); } catch (e) {} }
  };

  // 1. Handle Mobile Navigation Toggle
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

  // 2. Handle Banner Rendering & Logic
  function initBanner() {
    // Ensure we have the container in HTML. 
    // You can look for class .ship48-banner OR attribute data-ship48-banner
    const banner = document.querySelector('.ship48-banner') || document.querySelector('[data-ship48-banner]');
    
    if (!banner) return;
    if (safeStorage.get(PROMO_DISMISS_KEY) === '1') {
      banner.style.display = 'none';
      return;
    }

    // Clear old content and ensure visibility
    banner.innerHTML = '';
    banner.classList.remove('hidden');
    banner.removeAttribute('hidden');

    // Build the HTML structure
    const inner = document.createElement('div');
    inner.className = 'ship48-banner__inner';

    const contentDiv = document.createElement('div');
    contentDiv.className = 'ship48-banner__content';
    contentDiv.innerHTML = `
      <span class="ship48-text">Ship within 48 hours for a <strong>+$10 Bonus</strong></span>
      <div class="ship48-code-pill">
        ${PROMO_CODE}
        <button class="ship48-btn-copy" id="ship48CopyBtn">Copy</button>
      </div>
    `;

    const startLink = document.createElement('a');
    startLink.href = 'sell/';
    startLink.className = 'ship48-btn-start';
    startLink.textContent = 'Sell Your Device →';

    const dismissBtn = document.createElement('button');
    dismissBtn.className = 'ship48-dismiss';
    dismissBtn.innerHTML = '&times;';
    dismissBtn.ariaLabel = 'Close banner';

    // Assemble
    inner.appendChild(contentDiv);
    inner.appendChild(startLink);
    banner.appendChild(inner);
    banner.appendChild(dismissBtn);

    // Add Events
    const copyBtn = contentDiv.querySelector('#ship48CopyBtn');
    if (copyBtn) {
      copyBtn.addEventListener('click', (e) => {
        e.preventDefault();
        navigator.clipboard.writeText(PROMO_CODE).then(() => {
          const originalText = copyBtn.textContent;
          copyBtn.textContent = 'Copied!';
          setTimeout(() => copyBtn.textContent = originalText, 2000);
        }).catch(err => console.error('Copy failed', err));
      });
    }

    dismissBtn.addEventListener('click', () => {
      safeStorage.set(PROMO_DISMISS_KEY, '1');
      banner.remove();
    });
  }

  // Initialize everything on load
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