(function () {
  'use strict';

  const API_BASE =
    (typeof window !== 'undefined' &&
      (window.SHC_API_BASE_URL || window.API_BASE_URL || window.API_BASE)) ||
    '';

  const COLLECT_ENDPOINT = `${String(API_BASE).replace(/\/+$/, '')}/analytics/collect`;
  const HEARTBEAT_ENDPOINT = `${String(API_BASE).replace(/\/+$/, '')}/analytics/heartbeat`;
  const SESSION_COOKIE = 'shc_aid';
  const HEARTBEAT_MS = 20000;
  const MAX_BATCH_SIZE = 10;

  if (navigator.doNotTrack === '1') return;
  if (window.__analyticsConsent === false) return;

  let sessionId = getOrCreateSessionId();
  let queue = [];
  let flushTimer = null;
  let lastUrl = location.href;
  let conversionSent = false;

  function randomHex(bytes) {
    const arr = new Uint8Array(bytes);
    crypto.getRandomValues(arr);
    return Array.from(arr, (b) => b.toString(16).padStart(2, '0')).join('');
  }

  function getCookie(name) {
    const all = document.cookie ? document.cookie.split('; ') : [];
    for (let i = 0; i < all.length; i += 1) {
      const part = all[i];
      const idx = part.indexOf('=');
      const key = idx > -1 ? decodeURIComponent(part.slice(0, idx)) : decodeURIComponent(part);
      if (key === name) {
        return idx > -1 ? decodeURIComponent(part.slice(idx + 1)) : '';
      }
    }
    return '';
  }

  function setCookie(name, value) {
    let cookie = `${encodeURIComponent(name)}=${encodeURIComponent(value)}; Path=/; SameSite=Lax`;
    if (location.protocol === 'https:') cookie += '; Secure';
    document.cookie = cookie;
  }

  function getOrCreateSessionId() {
    const existing = getCookie(SESSION_COOKIE);
    if (existing) return existing;
    const created = randomHex(16);
    setCookie(SESSION_COOKIE, created);
    return created;
  }

  function sendPayload(url, payload) {
    const body = JSON.stringify(payload);
    if (navigator.sendBeacon) {
      const blob = new Blob([body], { type: 'application/json' });
      navigator.sendBeacon(url, blob);
      return;
    }

    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
      credentials: 'same-origin',
    }).catch(function () {});
  }

  function enqueue(event) {
    queue.push(event);
    if (queue.length >= MAX_BATCH_SIZE) {
      flush();
      return;
    }

    if (!flushTimer) {
      flushTimer = setTimeout(flush, 2000);
    }
  }

  function flush() {
    if (flushTimer) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }

    if (!queue.length) return;

    while (queue.length) {
      const batch = queue.splice(0, MAX_BATCH_SIZE);
      sendPayload(COLLECT_ENDPOINT, { session_id: sessionId, events: batch });
    }
  }

  function pageview(url) {
    enqueue({
      type: 'pageview',
      ts: Date.now(),
      url,
      referrer: document.referrer || '',
      path: location.pathname,
      title: document.title || '',
    });
  }

  function clickEvent(target) {
    if (!target) return;
    const className = typeof target.className === 'string' ? target.className : '';
    enqueue({
      type: 'click',
      ts: Date.now(),
      url: location.href,
      element: {
        tagName: target.tagName || '',
        id: target.id || '',
        classes: className,
        label: target.getAttribute('data-analytics-label') || '',
      },
    });
  }

  function maybeTrackConversion() {
    if (conversionSent) return;
    if (location.pathname.endsWith('/order-submittedpage.html')) {
      conversionSent = true;
      enqueue({
        type: 'conversion',
        ts: Date.now(),
        url: location.href,
      });
    }
  }

  function heartbeat() {
    if (document.visibilityState !== 'visible') return;
    sendPayload(HEARTBEAT_ENDPOINT, {
      session_id: sessionId,
      ts: Date.now(),
      url: location.href,
    });
  }

  function onUrlChanged() {
    const current = location.href;
    if (current === lastUrl) return;
    lastUrl = current;
    pageview(current);
    maybeTrackConversion();
  }

  function patchHistory() {
    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;

    history.pushState = function () {
      originalPushState.apply(this, arguments);
      onUrlChanged();
    };

    history.replaceState = function () {
      originalReplaceState.apply(this, arguments);
      onUrlChanged();
    };

    window.addEventListener('popstate', onUrlChanged);
  }

  document.addEventListener(
    'click',
    function (event) {
      const el = event.target && event.target.closest
        ? event.target.closest('[data-analytics="click"], #continue, [class*="continue"]')
        : null;
      if (!el) return;
      clickEvent(el);
    },
    true
  );

  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') {
      flush();
    }
  });
  window.addEventListener('beforeunload', flush);
  window.addEventListener('pagehide', flush);

  patchHistory();
  pageview(location.href);
  maybeTrackConversion();
  setInterval(heartbeat, HEARTBEAT_MS);
})();
