(function () {
  const CMC_COOKIE_NAME = 'cmc_id';
  const CMC_COOKIE_MAX_AGE_SECONDS = 2592000; // 30 days
  const CMC_ENDPOINT = 'https://api.cashmycell.com/api/v1/public/order-complete';
  const DEBUG_FLAG_QUERY_PARAM = 'debugCashMyCell';

  function isDebugEnabled() {
    if (typeof window === 'undefined') return false;
    if (window.CASHMYCELL_DEBUG === true) return true;
    try {
      return new URLSearchParams(window.location.search).get(DEBUG_FLAG_QUERY_PARAM) === '1';
    } catch (_) {
      return false;
    }
  }

  function debugLog(level, message, payload) {
    if (!isDebugEnabled()) return;
    const fn = console[level] || console.log;
    if (payload !== undefined) {
      fn.call(console, `[CashMyCell] ${message}`, payload);
      return;
    }
    fn.call(console, `[CashMyCell] ${message}`);
  }

  function getCookie(name) {
    const target = `${name}=`;
    const cookies = String(document.cookie || '').split(';');
    for (let i = 0; i < cookies.length; i += 1) {
      const cookie = cookies[i].trim();
      if (cookie.indexOf(target) === 0) {
        return decodeURIComponent(cookie.substring(target.length));
      }
    }
    return '';
  }

  function setCookie(name, value, maxAgeSeconds) {
    document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${maxAgeSeconds}; SameSite=Lax`;
  }

  function setCmcIdFromUrl() {
    try {
      const params = new URLSearchParams(window.location.search || '');
      const cmcId = String(params.get(CMC_COOKIE_NAME) || '').trim();
      if (!cmcId) {
        debugLog('log', 'No cmc_id in URL. Capture skipped.');
        return '';
      }
      setCookie(CMC_COOKIE_NAME, cmcId, CMC_COOKIE_MAX_AGE_SECONDS);
      debugLog('log', 'Captured cmc_id from URL and stored cookie.', { cmcId });
      return cmcId;
    } catch (error) {
      debugLog('warn', 'Failed to capture cmc_id from URL.', error);
      return '';
    }
  }

  function buildSessionGuardKey(referenceId) {
    const normalizedReference = String(referenceId || '').trim();
    if (normalizedReference) {
      return `cashmycell:order-complete:${normalizedReference}`;
    }
    return 'cashmycell:order-complete:no-reference';
  }

  function trackCashMyCellOrderComplete(options) {
    const opts = options || {};
    const cmcId = String(getCookie(CMC_COOKIE_NAME) || '').trim();
    const numericOrderValue = Number(opts.orderValue);
    const referenceId = String(opts.referenceId || '').trim();
    const guardKey = buildSessionGuardKey(referenceId || opts.guardKey);

    debugLog('log', 'Cookie lookup on success page.', {
      hasCookie: !!cmcId,
      cmcId,
      guardKey,
    });

    if (!cmcId) {
      debugLog('warn', 'cmc_id cookie missing. Tracking call was not sent.');
      return { sent: false, reason: 'missing_cmc_id' };
    }

    if (!Number.isFinite(numericOrderValue) || numericOrderValue < 0) {
      debugLog('warn', 'orderValue is missing or invalid. Tracking call was not sent.', {
        orderValue: opts.orderValue,
      });
      return { sent: false, reason: 'invalid_order_value' };
    }

    try {
      if (sessionStorage.getItem(guardKey)) {
        debugLog('log', 'Duplicate guard blocked CashMyCell order-complete call.', { guardKey });
        return { sent: false, reason: 'duplicate_guard' };
      }
    } catch (error) {
      debugLog('warn', 'sessionStorage unavailable; duplicate guard check failed open.', error);
    }

    const params = new URLSearchParams();
    params.set('status', 'COMPLETED');
    params.set('order_value', String(numericOrderValue));
    params.set('cmc_id', cmcId);
    if (referenceId) {
      params.set('reference_id', referenceId);
    }
    params.set('ts', String(Date.now()));

    const trackingUrl = `${CMC_ENDPOINT}?${params.toString()}`;
    const beacon = new Image();
    beacon.src = trackingUrl;

    try {
      sessionStorage.setItem(guardKey, '1');
    } catch (error) {
      debugLog('warn', 'sessionStorage unavailable; duplicate guard set skipped.', error);
    }

    debugLog('log', 'CashMyCell tracking URL generated and fired.', { trackingUrl });
    return { sent: true, trackingUrl, guardKey };
  }

  window.CashMyCellTracking = {
    setCmcIdFromUrl,
    getCookie,
    trackCashMyCellOrderComplete,
  };
})();
