(function () {
  'use strict';

  const API_BASE =
    (typeof window !== 'undefined' &&
      (window.SHC_API_BASE_URL || window.API_BASE_URL || window.API_BASE)) ||
    '';
  const TOKEN_KEY = 'analytics_admin_token';
  const PAGE_LIMIT = 100;
  const ALL_TIME_START = '2024-01-01';

  let offset = 0;
  let totalRows = 0;
  let sessionRows = [];
  let summaryData = null;

  const el = {
    tokenPrompt: document.getElementById('tokenPrompt'),
    appContent: document.getElementById('appContent'),
    tokenInput: document.getElementById('tokenInput'),
    saveTokenBtn: document.getElementById('saveTokenBtn'),
    fromDate: document.getElementById('fromDate'),
    toDate: document.getElementById('toDate'),
    sourceFilter: document.getElementById('sourceFilter'),
    pageFilter: document.getElementById('pageFilter'),
    convertedFilter: document.getElementById('convertedFilter'),
    searchFilter: document.getElementById('searchFilter'),
    refreshBtn: document.getElementById('refreshBtn'),
    statusText: document.getElementById('statusText'),
    kpiSessions: document.getElementById('kpiSessions'),
    kpiConversions: document.getElementById('kpiConversions'),
    kpiConversionRate: document.getElementById('kpiConversionRate'),
    kpiPageviews: document.getElementById('kpiPageviews'),
    topSourcesList: document.getElementById('topSourcesList'),
    topPagesList: document.getElementById('topPagesList'),
    topLocationsList: document.getElementById('topLocationsList'),
    sessionsBody: document.getElementById('sessionsBody'),
    resultCount: document.getElementById('resultCount'),
    pageLabel: document.getElementById('pageLabel'),
    prevPage: document.getElementById('prevPage'),
    nextPage: document.getElementById('nextPage'),
    drawer: document.getElementById('sessionDrawer'),
    drawerBackdrop: document.getElementById('drawerBackdrop'),
    closeDrawer: document.getElementById('closeDrawer'),
    drawerTitle: document.getElementById('drawerTitle'),
    detailLandingPath: document.getElementById('detailLandingPath'),
    detailLandingUrl: document.getElementById('detailLandingUrl'),
    detailSource: document.getElementById('detailSource'),
    detailReferrer: document.getElementById('detailReferrer'),
    detailLocation: document.getElementById('detailLocation'),
    detailIp: document.getElementById('detailIp'),
    detailVisitor: document.getElementById('detailVisitor'),
    detailTiming: document.getElementById('detailTiming'),
    detailNotes: document.getElementById('detailNotes'),
    detailEventCount: document.getElementById('detailEventCount'),
    timeline: document.getElementById('timeline'),
    rangeButtons: Array.from(document.querySelectorAll('[data-range]')),
  };

  function baseUrl(path) {
    return `${String(API_BASE).replace(/\/+$/, '')}${path.startsWith('/') ? path : `/${path}`}`;
  }

  function getToken() {
    return localStorage.getItem(TOKEN_KEY) || '';
  }

  function setToken(token) {
    localStorage.setItem(TOKEN_KEY, String(token || '').trim());
  }

  function setStatus(message, isError) {
    el.statusText.textContent = message;
    el.statusText.style.color = isError ? '#b42318' : '';
  }

  async function api(path, params) {
    const token = getToken();
    const url = new URL(baseUrl(path), window.location.origin);
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
          url.searchParams.set(key, String(value));
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

  function isoDate(value) {
    return new Date(value).toISOString().slice(0, 10);
  }

  function applyRange(rangeKey) {
    const now = new Date();
    const start = new Date(now);
    if (rangeKey === 'today') {
      el.fromDate.value = isoDate(now);
      el.toDate.value = isoDate(now);
      return;
    }
    if (rangeKey === '7d') {
      start.setDate(now.getDate() - 7);
      el.fromDate.value = isoDate(start);
      el.toDate.value = isoDate(now);
      return;
    }
    if (rangeKey === '30d') {
      start.setDate(now.getDate() - 30);
      el.fromDate.value = isoDate(start);
      el.toDate.value = isoDate(now);
      return;
    }
    el.fromDate.value = ALL_TIME_START;
    el.toDate.value = isoDate(now);
  }

  function defaultDates() {
    applyRange('30d');
  }

  function formatDateTime(value) {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '-';
    return date.toLocaleString();
  }

  function formatLocation(row) {
    return [row.city, row.region, row.country].filter(Boolean).join(', ') || 'Unknown location';
  }

  function formatVisitor(row) {
    const parts = [row.device_name || row.device_type, row.browser, row.os].filter(Boolean);
    return parts.join(' • ') || 'Unknown visitor';
  }

  function formatNotes(notes) {
    if (!Array.isArray(notes) || !notes.length) return 'No notes';
    return notes.join(' | ');
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function renderPillList(target, rows, labelKey) {
    if (!target) return;
    if (!Array.isArray(rows) || !rows.length) {
      target.innerHTML = '<div class="empty-state">No data in the selected range.</div>';
      return;
    }
    target.innerHTML = rows.map((row) => `
      <div class="pill-row">
        <strong>${escapeHtml(row[labelKey] || 'unknown')}</strong>
        <span>${Number(row.sessions || row.count || 0).toLocaleString()}</span>
      </div>
    `).join('');
  }

  function renderKpis(summary) {
    const totals = summary?.totals || {};
    const events = summary?.events || {};
    const sessions = Number(totals.sessions || 0);
    const conversions = Number(totals.conversions || 0);
    const conversionRate = sessions ? ((conversions / sessions) * 100) : 0;
    el.kpiSessions.textContent = sessions.toLocaleString();
    el.kpiConversions.textContent = conversions.toLocaleString();
    el.kpiConversionRate.textContent = `${conversionRate.toFixed(2)}%`;
    el.kpiPageviews.textContent = Number(events.pageviews || 0).toLocaleString();
    renderPillList(el.topSourcesList, summary?.top_sources || [], 'source');
    renderPillList(el.topPagesList, summary?.top_pages || [], 'page');
    renderPillList(el.topLocationsList, summary?.top_locations || [], 'location');
  }

  function updateSourceOptions(summary) {
    const currentValue = el.sourceFilter.value;
    const sources = Array.isArray(summary?.top_sources) ? summary.top_sources : [];
    const options = ['<option value="">All sources</option>'];
    sources.forEach((row) => {
      const value = String(row.source || '').trim();
      if (!value) return;
      options.push(`<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`);
    });
    el.sourceFilter.innerHTML = options.join('');
    if ([...el.sourceFilter.options].some((option) => option.value === currentValue)) {
      el.sourceFilter.value = currentValue;
    }
  }

  function rowSearchText(row) {
    return [
      row.id,
      row.session_id,
      row.landing_path,
      row.landing_url,
      row.source,
      row.referrer,
      row.country,
      row.region,
      row.city,
      row.ip_masked,
      row.ip_full,
      row.device_name,
      row.device_type,
      row.browser,
      row.os,
      row.screen,
      formatNotes(row.notes),
    ].filter(Boolean).join(' ').toLowerCase();
  }

  function filteredRows() {
    const query = String(el.searchFilter.value || '').trim().toLowerCase();
    if (!query) return sessionRows;
    return sessionRows.filter((row) => rowSearchText(row).includes(query));
  }

  function renderSessions() {
    const rows = filteredRows();
    if (!rows.length) {
      el.sessionsBody.innerHTML = '<tr><td colspan="9"><div class="empty-state">No sessions matched these filters.</div></td></tr>';
      return;
    }

    el.sessionsBody.innerHTML = rows.map((row) => {
      const badgeClass = row.converted ? 'status-badge status-badge--converted' : 'status-badge status-badge--active';
      const badgeText = row.converted ? 'Converted' : 'Tracked';
      return `
        <tr data-session-id="${escapeHtml(row.id)}">
          <td>
            <div class="cell-stack">
              <span class="cell-main">${escapeHtml(formatDateTime(row.first_seen))}</span>
              <span class="cell-sub">Last seen ${escapeHtml(formatDateTime(row.last_seen))}</span>
            </div>
          </td>
          <td>
            <div class="cell-stack">
              <span class="cell-main">${escapeHtml(row.landing_path || '-')}</span>
              <span class="cell-sub">${escapeHtml(row.landing_url || '-')}</span>
            </div>
          </td>
          <td>
            <div class="cell-stack">
              <span class="cell-main">${escapeHtml(row.source || 'direct')}</span>
              <span class="cell-sub">${escapeHtml(row.referrer || 'No referrer')}</span>
            </div>
          </td>
          <td>
            <div class="cell-stack">
              <span class="cell-main">${escapeHtml(formatLocation(row))}</span>
              <span class="cell-sub">${escapeHtml(row.timezone || '')}</span>
            </div>
          </td>
          <td>
            <div class="cell-stack">
              <span class="cell-main">${escapeHtml(row.device_name || row.device_type || 'Unknown')}</span>
              <span class="cell-sub">${escapeHtml([row.browser, row.os, row.screen].filter(Boolean).join(' • ') || 'Unknown browser / OS')}</span>
            </div>
          </td>
          <td>
            <div class="cell-stack">
              <span class="cell-main">${escapeHtml(row.ip_full || row.ip_masked || '-')}</span>
              <span class="cell-sub">${escapeHtml(row.ip_masked && row.ip_full ? `Masked: ${row.ip_masked}` : '')}</span>
            </div>
          </td>
          <td>
            <div class="cell-stack">
              <span class="cell-main">${Number(row.event_count || 0).toLocaleString()}</span>
              <span class="cell-sub">Events captured</span>
            </div>
          </td>
          <td><span class="${badgeClass}">${badgeText}</span></td>
          <td><div class="cell-sub">${escapeHtml(formatNotes(row.notes))}</div></td>
        </tr>
      `;
    }).join('');

    Array.from(el.sessionsBody.querySelectorAll('tr[data-session-id]')).forEach((rowEl) => {
      rowEl.addEventListener('click', () => {
        loadSessionDetail(rowEl.getAttribute('data-session-id'));
      });
    });
  }

  function renderResultMeta(payload) {
    totalRows = Number(payload?.total || 0);
    const currentPage = Math.floor(offset / PAGE_LIMIT) + 1;
    const pageCount = Math.max(1, Math.ceil(totalRows / PAGE_LIMIT));
    el.pageLabel.textContent = `Page ${currentPage} of ${pageCount}`;
    el.resultCount.textContent = `${totalRows.toLocaleString()} sessions`;
    el.prevPage.disabled = offset === 0;
    el.nextPage.disabled = offset + PAGE_LIMIT >= totalRows;
  }

  function rangeParams() {
    return {
      from: el.fromDate.value,
      to: el.toDate.value,
    };
  }

  async function loadSummary() {
    const summary = await api('/analytics/admin/summary', rangeParams());
    summaryData = summary;
    renderKpis(summary);
    updateSourceOptions(summary);
  }

  async function loadSessions() {
    const params = {
      ...rangeParams(),
      source: el.sourceFilter.value,
      page: el.pageFilter.value.trim(),
      converted: el.convertedFilter.value,
      limit: PAGE_LIMIT,
      offset,
    };
    const payload = await api('/analytics/admin/sessions', params);
    sessionRows = Array.isArray(payload?.sessions) ? payload.sessions : [];
    renderResultMeta(payload || {});
    renderSessions();
  }

  function openDrawer() {
    el.drawer.classList.remove('hidden');
    el.drawer.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  }

  function closeDrawer() {
    el.drawer.classList.add('hidden');
    el.drawer.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  }

  function renderDetailNotes(notes) {
    if (!Array.isArray(notes) || !notes.length) {
      el.detailNotes.className = 'notes-list empty-state';
      el.detailNotes.textContent = 'No notes saved for this session.';
      return;
    }
    el.detailNotes.className = 'notes-list';
    el.detailNotes.innerHTML = notes.map((note) => `<div class="note-row">${escapeHtml(note)}</div>`).join('');
  }

  function renderTimeline(events) {
    const rows = Array.isArray(events) ? events : [];
    el.detailEventCount.textContent = `${rows.length.toLocaleString()} events`;
    if (!rows.length) {
      el.timeline.innerHTML = '<div class="empty-state">No events were saved for this session.</div>';
      return;
    }

    el.timeline.innerHTML = rows.map((event) => {
      const client = event.extra && typeof event.extra === 'object' && event.extra.client && typeof event.extra.client === 'object'
        ? event.extra.client
        : {};
      const detailLines = [
        event.path || event.page_url,
        event.referrer ? `Referrer: ${event.referrer}` : '',
        client.browser || client.os || client.deviceType
          ? [client.deviceName || client.deviceType, client.browser, client.os].filter(Boolean).join(' • ')
          : '',
        Array.isArray(event.extra?.notes) && event.extra.notes.length
          ? `Notes: ${event.extra.notes.join(' | ')}`
          : '',
      ].filter(Boolean);

      return `
        <div class="timeline-item">
          <div class="timeline-item__head">
            <strong>${escapeHtml(event.event_type || 'event')}</strong>
            <span>${escapeHtml(formatDateTime(event.ts))}</span>
          </div>
          <div class="timeline-item__body">
            ${detailLines.map((line, index) => `
              <div class="line${index > 0 ? ' muted' : ''}">${escapeHtml(line)}</div>
            `).join('')}
          </div>
        </div>
      `;
    }).join('');
  }

  async function loadSessionDetail(id) {
    if (!id) return;
    setStatus('Loading session detail...');
    try {
      const payload = await api(`/analytics/admin/sessions/${encodeURIComponent(id)}`);
      const detail = payload?.session || {};
      const events = Array.isArray(payload?.events) ? payload.events : [];

      el.drawerTitle.textContent = detail.session_id || detail.id || 'Visitor session';
      el.detailLandingPath.textContent = detail.landing_path || '-';
      el.detailLandingUrl.textContent = detail.landing_url || '-';
      el.detailSource.textContent = detail.source || 'direct';
      el.detailReferrer.textContent = detail.referrer || 'No referrer';
      el.detailLocation.textContent = formatLocation(detail);
      el.detailIp.textContent = detail.ip_full || detail.ip_masked || '-';
      el.detailVisitor.textContent = formatVisitor(detail);
      el.detailTiming.textContent = `First seen ${formatDateTime(detail.first_seen)} • Last seen ${formatDateTime(detail.last_seen)}`;

      renderDetailNotes(detail.notes);
      renderTimeline(events);
      openDrawer();
      setStatus('Ready');
    } catch (error) {
      console.error(error);
      setStatus('Failed to load session detail.', true);
    }
  }

  async function refreshAll() {
    setStatus('Loading analytics...');
    el.refreshBtn.disabled = true;
    try {
      await Promise.all([loadSummary(), loadSessions()]);
      setStatus(`Loaded ${totalRows.toLocaleString()} sessions.`);
    } catch (error) {
      console.error(error);
      setStatus('Failed to load analytics data. Check token and API availability.', true);
      alert('Failed to load analytics data. Check token and API availability.');
    } finally {
      el.refreshBtn.disabled = false;
    }
  }

  function showTokenPrompt(show) {
    el.tokenPrompt.classList.toggle('hidden', !show);
    el.appContent.classList.toggle('hidden', show);
  }

  el.saveTokenBtn.addEventListener('click', () => {
    const token = String(el.tokenInput.value || '').trim();
    if (!token) return;
    setToken(token);
    showTokenPrompt(false);
    offset = 0;
    refreshAll();
  });

  el.refreshBtn.addEventListener('click', () => {
    offset = 0;
    refreshAll();
  });

  el.prevPage.addEventListener('click', () => {
    offset = Math.max(0, offset - PAGE_LIMIT);
    loadSessions();
  });

  el.nextPage.addEventListener('click', () => {
    if (offset + PAGE_LIMIT >= totalRows) return;
    offset += PAGE_LIMIT;
    loadSessions();
  });

  el.searchFilter.addEventListener('input', renderSessions);
  el.sourceFilter.addEventListener('change', () => {
    offset = 0;
    loadSessions();
  });
  el.pageFilter.addEventListener('keyup', (event) => {
    if (event.key !== 'Enter') return;
    offset = 0;
    loadSessions();
  });
  el.convertedFilter.addEventListener('change', () => {
    offset = 0;
    loadSessions();
  });

  el.closeDrawer.addEventListener('click', closeDrawer);
  el.drawerBackdrop.addEventListener('click', closeDrawer);

  el.rangeButtons.forEach((button) => {
    button.addEventListener('click', () => {
      applyRange(button.getAttribute('data-range'));
      offset = 0;
      refreshAll();
    });
  });

  defaultDates();

  if (!getToken()) {
    showTokenPrompt(true);
  } else {
    showTokenPrompt(false);
    refreshAll();
  }
})();
