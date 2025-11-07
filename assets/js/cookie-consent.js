(function () {
  const STORAGE_KEY = 'shcCookieConsent';

  function getStoredChoice() {
    try {
      return window.localStorage.getItem(STORAGE_KEY);
    } catch (error) {
      console.warn('Cookie consent localStorage unavailable:', error);
      return null;
    }
  }

  function storeChoice(value) {
    try {
      window.localStorage.setItem(STORAGE_KEY, value);
    } catch (error) {
      console.warn('Unable to persist cookie consent choice:', error);
    }
  }

  function createBanner() {
    const banner = document.createElement('div');
    banner.className = 'cookie-consent-banner';
    banner.setAttribute('role', 'region');
    banner.setAttribute('aria-label', 'Cookie consent message');
    banner.innerHTML = `
      <div class="cookie-consent__inner">
        <div class="cookie-consent__copy">
          <p>
            We use cookies and similar technologies to keep our site reliable and secure, and to remember your preferences.
            By clicking <strong>Accept</strong> you agree to this use. You can decline and continue with essential cookies only.
          </p>
        </div>
        <div class="cookie-consent__actions">
          <button type="button" class="cookie-consent__button cookie-consent__button--primary">Accept</button>
          <button type="button" class="cookie-consent__button cookie-consent__button--secondary">Decline</button>
        </div>
      </div>
    `;

    const [acceptButton, declineButton] = banner.querySelectorAll('.cookie-consent__button');

    function dismiss(choice) {
      banner.classList.add('cookie-consent--hiding');
      storeChoice(choice);
      window.setTimeout(() => {
        banner.remove();
      }, 300);
    }

    acceptButton.addEventListener('click', () => dismiss('accepted'));
    declineButton.addEventListener('click', () => dismiss('declined'));

    document.body.appendChild(banner);
  }

  function injectStyles() {
    if (document.getElementById('cookie-consent-styles')) {
      return;
    }

    const style = document.createElement('style');
    style.id = 'cookie-consent-styles';
    style.textContent = `
      .cookie-consent-banner {
        position: fixed;
        inset: auto 1.5rem 1.5rem 1.5rem;
        z-index: 9999;
        background: #0f172a;
        color: #f8fafc;
        padding: 1.5rem;
        border-radius: 1rem;
        box-shadow: 0 20px 45px rgba(15, 23, 42, 0.35);
        max-width: 640px;
        margin: 0 auto;
        left: 50%;
        transform: translateX(-50%);
        transition: opacity 0.3s ease, transform 0.3s ease;
      }

      .cookie-consent--hiding {
        opacity: 0;
        transform: translate(-50%, 20px);
      }

      .cookie-consent__inner {
        display: flex;
        flex-direction: column;
        gap: 1rem;
      }

      .cookie-consent__copy {
        font-size: 0.95rem;
        line-height: 1.6;
      }

      .cookie-consent__copy p {
        margin: 0;
      }

      .cookie-consent__actions {
        display: flex;
        flex-wrap: wrap;
        gap: 0.75rem;
      }

      .cookie-consent__button {
        flex: 1 0 120px;
        border-radius: 9999px;
        padding: 0.65rem 1.5rem;
        font-size: 0.95rem;
        font-weight: 600;
        cursor: pointer;
        border: none;
        transition: transform 0.2s ease, box-shadow 0.2s ease;
      }

      .cookie-consent__button:focus-visible {
        outline: 3px solid #facc15;
        outline-offset: 2px;
      }

      .cookie-consent__button--primary {
        background: #22c55e;
        color: #0f172a;
        box-shadow: 0 10px 25px rgba(34, 197, 94, 0.35);
      }

      .cookie-consent__button--secondary {
        background: transparent;
        color: #f8fafc;
        border: 1px solid rgba(248, 250, 252, 0.45);
      }

      .cookie-consent__button:hover {
        transform: translateY(-1px);
      }

      @media (max-width: 640px) {
        .cookie-consent-banner {
          inset: auto 1rem 1rem 1rem;
          padding: 1.25rem;
        }

        .cookie-consent__actions {
          flex-direction: column;
        }
      }
    `;

    document.head.appendChild(style);
  }

  function init() {
    const stored = getStoredChoice();
    if (stored === 'accepted' || stored === 'declined') {
      return;
    }

    injectStyles();
    createBanner();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
