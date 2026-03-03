(function () {
  'use strict';

  const API_BASE =
    (typeof window !== 'undefined' &&
      (window.SHC_API_BASE_URL || window.API_BASE_URL || window.API_BASE)) ||
    '';
  const TOKEN_KEY = 'analytics_admin_token';
  const PAGE_LIMIT = 25;
  let offset = 0;
  let hasMore = false;

  const charts = {};
  const el = {
    tokenPrompt: document.getElementById('tokenPrompt'),
    appContent: document.getElementById('appContent'),
    tokenInput: document.getElementById('tokenInput'),
    saveTokenBtn: document.getElementById('saveTokenBtn'),
    fromDate: document.getElementById('fromDate'),
    toDate: document.getElementById('toDate'),
    refreshBtn: document.getElementById('refreshBtn'),
    kpiSessions: document.getElementById('kpiSessions'),
    kpiConversions: document.getElementById('kpiConversions'),
    kpiConversionRate: document.getElementById('kpiConversionRate'),
    sessionsBody: document.getElementById('sessionsBody'),
    prevPage: document.getElementById('prevPage'),
    nextPage: document.getElementById('nextPage'),
    pageLabel: document.getElementById('pageLabel'),
    drawer: document.getElementById('sessionDrawer'),
    closeDrawer: document.getElementById('closeDrawer'),
    detailLandingUrl: document.getElementById('detailLandingUrl'),
    detailReferrer: document.getElementById('detailReferrer'),
    detailSource: document.getElementById('detailSource'),
    timeline: document.getElementById('timeline'),
  };

  function baseUrl(path) {
    return `${String(API_BASE).replace(/\/+$/, '')}${path.startsWith('/') ? path : `/${path}`}`;
  }

  function getToken() {
    return localStorage.getItem(TOKEN_KEY) || '';
  }

  function setToken(token) {
    localStorage.setItem(TOKEN_KEY, token.trim());
  }

  async function api(path, params) {
    const token = getToken();
    const url = new URL(baseUrl(path), window.location.origin);
    if (params) {
      Object.entries(params).forEach(([key, val]) => {
        if (val !== undefined && val !== null && val !== '') {
          url.searchParams.set(key, String(val));
        }
      });
    }

    const response = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return response.json();
  }

  function defaultDates() {
    const now = new Date();
    const weekAgo = new Date(now);
    weekAgo.setDate(now.getDate() - 7);
    const iso = (d) => d.toISOString().slice(0, 10);
    el.fromDate.value = iso(weekAgo);
    el.toDate.value = iso(now);
  }

  function formatDate(v) {
    if (!v) return '-';
    return new Date(v).toLocaleString();
  }

  function renderKpis(summary) {
    const sessions = Number(summary.sessions || 0);
    const conversions = Number(summary.conversions || 0);
    const rate = sessions ? (conversions / sessions) * 100 : 0;
    el.kpiSessions.textContent = sessions.toLocaleString();
    el.kpiConversions.textContent = conversions.toLocaleString();
    el.kpiConversionRate.textContent = `${rate.toFixed(2)}%`;
  }

  function upsertChart(name, config) {
    if (!window.Chart) return;
    if (charts[name]) {
      charts[name].data = config.data;
      charts[name].options = config.options || {};
      charts[name].update();
      return;
    }
    const ctx = document.getElementById(name);
    charts[name] = new window.Chart(ctx, config);
  }

  function pairsToArrays(input) {
    if (!input) return [[], []];
    if (Array.isArray(input)) {
      const labels = input.map((i) => i.label || i.key || i.name || i.page || i.source || i.hour || i.day || '-');
      const values = input.map((i) => Number(i.value || i.count || i.sessions || 0));
      return [labels, values];
    }
    const labels = Object.keys(input);
    const values = labels.map((k) => Number(input[k] || 0));
    return [labels, values];
  }

  function renderCharts(summary) {
    const [hourLabels, hourVals] = pairsToArrays(summary.sessions_per_hour || summary.sessionsPerHour);
    const [dayLabels, dayVals] = pairsToArrays(summary.sessions_per_day || summary.sessionsPerDay);
    const [pageLabels, pageVals] = pairsToArrays(summary.top_pages || summary.topPages);
    const [sourceLabels, sourceVals] = pairsToArrays(summary.top_sources || summary.topSources);

    upsertChart('sessionsPerHour', {
      type: 'line',
      data: { labels: hourLabels, datasets: [{ label: 'Sessions', data: hourVals, borderColor: '#3478f6' }] },
    });
    upsertChart('sessionsPerDay', {
      type: 'bar',
      data: { labels: dayLabels, datasets: [{ label: 'Sessions', data: dayVals, backgroundColor: '#34a853' }] },
    });
    upsertChart('topPages', {
      type: 'bar',
      data: { labels: pageLabels, datasets: [{ label: 'Views', data: pageVals, backgroundColor: '#fbbc04' }] },
      options: { indexAxis: 'y' },
    });
    upsertChart('topSources', {
      type: 'doughnut',
      data: { labels: sourceLabels, datasets: [{ label: 'Sources', data: sourceVals }] },
    });
  }

  function renderSessions(rows) {
    el.sessionsBody.innerHTML = '';
    rows.forEach((s) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${formatDate(s.first_seen)}</td>
        <td>${s.landing_path || '-'}</td>
        <td>${s.source || '-'}</td>
        <td>${s.country || '-'}</td>
        <td>${s.masked_ip || '-'}</td>
        <td>${s.converted ? 'Yes' : 'No'}</td>
      `;
      tr.addEventListener('click', () => loadSessionDetail(s.id));
      el.sessionsBody.appendChild(tr);
    });
  }

  function renderTimeline(detail) {
    el.detailLandingUrl.textContent = detail.landing_url || '-';
    el.detailReferrer.textContent = detail.referrer || '-';
    el.detailSource.textContent = detail.source || '-';
    el.timeline.innerHTML = '';

    const events = (detail.events || []).slice().sort((a, b) => new Date(a.ts || a.timestamp) - new Date(b.ts || b.timestamp));
    events.forEach((evt) => {
      const li = document.createElement('li');
      const ts = formatDate(evt.ts || evt.timestamp);
      const page = evt.url || evt.page || '';
      const label = evt.label || (evt.element && evt.element.label) || '';
      li.textContent = `${ts} · ${evt.type || 'event'} · ${page}${label ? ` · ${label}` : ''}`;
      el.timeline.appendChild(li);
    });

    el.drawer.classList.remove('hidden');
  }

  async function loadSessionDetail(id) {
    if (!id) return;
    const detail = await api(`/analytics/admin/sessions/${encodeURIComponent(id)}`);
    renderTimeline(detail);
  }

  function rangeParams() {
    return {
      from: el.fromDate.value,
      to: el.toDate.value,
    };
  }

  async function loadSummary() {
    const summary = await api('/analytics/admin/summary', rangeParams());
    renderKpis(summary);
    renderCharts(summary);
  }

  async function loadSessions() {
    const params = {
      ...rangeParams(),
      limit: PAGE_LIMIT,
      offset,
    };
    const payload = await api('/analytics/admin/sessions', params);
    const rows = Array.isArray(payload) ? payload : payload.sessions || [];
    hasMore = rows.length >= PAGE_LIMIT;
    renderSessions(rows);
    const page = Math.floor(offset / PAGE_LIMIT) + 1;
    el.pageLabel.textContent = `Page ${page}`;
    el.prevPage.disabled = offset === 0;
    el.nextPage.disabled = !hasMore;
  }

  async function refreshAll() {
    try {
      await Promise.all([loadSummary(), loadSessions()]);
    } catch (err) {
      console.error(err);
      alert('Failed to load analytics data. Check token and API availability.');
    }
  }

  function showTokenPrompt(show) {
    el.tokenPrompt.classList.toggle('hidden', !show);
    el.appContent.classList.toggle('hidden', show);
  }

  el.saveTokenBtn.addEventListener('click', function () {
    if (!el.tokenInput.value.trim()) return;
    setToken(el.tokenInput.value);
    showTokenPrompt(false);
    offset = 0;
    refreshAll();
  });

  el.refreshBtn.addEventListener('click', function () {
    offset = 0;
    refreshAll();
  });

  el.prevPage.addEventListener('click', function () {
    offset = Math.max(0, offset - PAGE_LIMIT);
    loadSessions();
  });

  el.nextPage.addEventListener('click', function () {
    if (!hasMore) return;
    offset += PAGE_LIMIT;
    loadSessions();
  });

  el.closeDrawer.addEventListener('click', function () {
    el.drawer.classList.add('hidden');
  });

  defaultDates();
  if (!getToken()) {
    showTokenPrompt(true);
  } else {
    showTokenPrompt(false);
    refreshAll();
  }
})();
