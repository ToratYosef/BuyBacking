(function () {
  'use strict';

  const state = {
    rows: [],
    groups: [],
    filteredGroups: [],
    selectedIp: '',
    selectedGroup: null,
    selectedDetail: null,
  };
  const TOKEN_KEY = 'analytics_admin_token';

  const el = {
    backendDataForm: document.getElementById('backendDataForm'),
    apiBase: document.getElementById('apiBase'),
    adminToken: document.getElementById('adminToken'),
    reloadBackendData: document.getElementById('reloadBackendData'),
    searchInput: document.getElementById('searchInput'),
    locationFilter: document.getElementById('locationFilter'),
    sourceFilter: document.getElementById('sourceFilter'),
    sortSelect: document.getElementById('sortSelect'),
    loadSelectedSession: document.getElementById('loadSelectedSession'),
    clearLoadedData: document.getElementById('clearLoadedData'),
    statusBar: document.getElementById('statusBar'),
    kpiSessions: document.getElementById('kpiSessions'),
    kpiIps: document.getElementById('kpiIps'),
    kpiLocations: document.getElementById('kpiLocations'),
    kpiSources: document.getElementById('kpiSources'),
    resultCount: document.getElementById('resultCount'),
    sessionsBody: document.getElementById('sessionsBody'),
    detailTitle: document.getElementById('detailTitle'),
    detailSubtitle: document.getElementById('detailSubtitle'),
    detailStatus: document.getElementById('detailStatus'),
    detailMeta: document.getElementById('detailMeta'),
    detailNotes: document.getElementById('detailNotes'),
    detailEventCount: document.getElementById('detailEventCount'),
    timeline: document.getElementById('timeline'),
  };

  const CSV_HEADER = [
    'timestamp',
    'session_id',
    'ip_address',
    'country',
    'region',
    'city',
    'location',
    'source',
    'landing_path',
    'browser',
    'os',
    'device_type',
    'device_name',
    'language',
    'timezone',
    'screen',
    'viewport',
    'user_agent',
    'notes',
  ];

  function setStatus(message, tone = 'neutral') {
    if (!el.statusBar) return;
    el.statusBar.textContent = message;
    el.statusBar.className = `mt-4 text-sm font-semibold ${tone === 'error' ? 'text-rose-600' : tone === 'success' ? 'text-emerald-700' : 'text-slate-600'}`;
  }

  function getStoredToken() {
    return localStorage.getItem(TOKEN_KEY) || '';
  }

  function setStoredToken(token) {
    localStorage.setItem(TOKEN_KEY, String(token || '').trim());
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatDateTime(value) {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return 'Unknown';
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
    }).format(date);
  }

  function normalizeSource(value) {
    if (!value) return 'Unknown';
    return String(value)
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (ch) => ch.toUpperCase());
  }

  function parseNotes(rawNotes) {
    const text = String(rawNotes || '').trim();
    if (!text) return [];
    return text.split(/\s+\|\s+/).map((entry) => entry.trim()).filter(Boolean);
  }

  function summarizeTimelineNote(note) {
    const text = String(note || '').trim();
    if (!text) return '';
    return text
      .replace(/^Clicked button:\s*/i, 'Click: ')
      .replace(/^Clicked a:\s*/i, 'Link: ')
      .replace(/^Completed\s+/i, 'Completed ')
      .replace(/^Page params:\s*/i, 'Params: ')
      .replace(/^Left page after\s*/i, 'Leave after ');
  }

  function parseCsv(text) {
    const rows = [];
    let current = '';
    let row = [];
    let inQuotes = false;

    const pushField = () => {
      row.push(current);
      current = '';
    };
    const pushRow = () => {
      if (row.length === 1 && row[0] === '') {
        row = [];
        return;
      }
      rows.push(row);
      row = [];
    };

    for (let i = 0; i < text.length; i += 1) {
      const char = text[i];
      const next = text[i + 1];

      if (char === '"') {
        if (inQuotes && next === '"') {
          current += '"';
          i += 1;
        } else {
          inQuotes = !inQuotes;
        }
        continue;
      }

      if (char === ',' && !inQuotes) {
        pushField();
        continue;
      }

      if ((char === '\n' || char === '\r') && !inQuotes) {
        if (char === '\r' && next === '\n') i += 1;
        pushField();
        pushRow();
        continue;
      }

      current += char;
    }

    if (current.length || row.length) {
      pushField();
      pushRow();
    }

    if (!rows.length) return [];
    const header = rows[0].map((value) => String(value || '').trim());
    return rows.slice(1).map((values) => {
      const mapped = {};
      header.forEach((key, index) => {
        mapped[key] = values[index] ?? '';
      });
      return mapped;
    });
  }

  function normalizeCsvRow(row, fileName) {
    const timestamp = new Date(row.timestamp || '');
    const notes = parseNotes(row.notes);
    return {
      fileName,
      timestamp,
      sessionId: String(row.session_id || '').trim(),
      ip: String(row.ip_address || '').trim() || 'Unknown',
      country: String(row.country || '').trim(),
      region: String(row.region || '').trim(),
      city: String(row.city || '').trim(),
      location: String(row.location || '').trim() || [row.city, row.region, row.country].filter(Boolean).join(', '),
      source: String(row.source || '').trim() || 'Unknown',
      landingPath: String(row.landing_path || '').trim(),
      browser: String(row.browser || '').trim(),
      os: String(row.os || '').trim(),
      deviceType: String(row.device_type || '').trim(),
      deviceName: String(row.device_name || '').trim(),
      language: String(row.language || '').trim(),
      timezone: String(row.timezone || '').trim(),
      screen: String(row.screen || '').trim(),
      viewport: String(row.viewport || '').trim(),
      userAgent: String(row.user_agent || '').trim(),
      notes,
      raw: row,
    };
  }

  function buildGroups(rows) {
    const groups = new Map();
    rows.forEach((row) => {
      const key = row.ip || 'Unknown';
      if (!groups.has(key)) {
        groups.set(key, {
          ip: key,
          rows: [],
          sessionIds: new Set(),
          paths: new Set(),
          sources: new Set(),
          notes: [],
          noteCount: 0,
          locations: new Map(),
        });
      }
      const group = groups.get(key);
      group.rows.push(row);
      if (row.sessionId) group.sessionIds.add(row.sessionId);
      if (row.landingPath) group.paths.add(row.landingPath);
      if (row.source) group.sources.add(row.source);
      if (row.location) {
        group.locations.set(row.location, (group.locations.get(row.location) || 0) + 1);
      }
      row.notes.forEach((note) => {
        group.notes.push({
          timestamp: row.timestamp,
          sessionId: row.sessionId,
          path: row.landingPath,
          note,
        });
      });
      group.noteCount += row.notes.length;
    });

    return Array.from(groups.values()).map((group) => {
      group.rows.sort((a, b) => (b.timestamp?.getTime() || 0) - (a.timestamp?.getTime() || 0));
      group.notes.sort((a, b) => (b.timestamp?.getTime() || 0) - (a.timestamp?.getTime() || 0));
      const latest = group.rows[0] || null;
      const earliest = group.rows[group.rows.length - 1] || null;
      const topLocation = Array.from(group.locations.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] || latest?.location || 'Unknown location';
      return {
        ip: group.ip,
        latest,
        earliest,
        rows: group.rows,
        notes: group.notes,
        noteCount: group.noteCount,
        sessionIds: Array.from(group.sessionIds),
        sessionCount: group.sessionIds.size,
        pageCount: group.rows.length,
        location: topLocation,
        sources: Array.from(group.sources),
        paths: Array.from(group.paths),
      };
    });
  }

  async function fetchBackendCsvRows() {
    const token = el.adminToken.value.trim();
    if (!token) {
      throw new Error('Admin token is required to load backend visitor CSV data.');
    }
    const base = String(el.apiBase.value || '').replace(/\/+$/, '');
    const url = `${base}/analytics/admin/visitor-csvs?include_rows=true`;
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    if (!response.ok) {
      throw new Error(`Failed to load backend CSV files (${response.status})`);
    }
    return response.json();
  }

  function renderKpis(groups) {
    const uniqueIps = new Set(groups.map((group) => group.ip));
    const uniqueLocations = new Set(groups.map((group) => group.location).filter(Boolean));
    const uniqueSources = new Set(groups.flatMap((group) => group.sources).filter(Boolean));
    const totalSessions = groups.reduce((sum, group) => sum + group.sessionCount, 0);
    if (el.kpiSessions) el.kpiSessions.textContent = totalSessions.toLocaleString();
    if (el.kpiIps) el.kpiIps.textContent = uniqueIps.size.toLocaleString();
    if (el.kpiLocations) el.kpiLocations.textContent = uniqueLocations.size.toLocaleString();
    if (el.kpiSources) el.kpiSources.textContent = uniqueSources.size.toLocaleString();
  }

  function buildSessionSearchText(group) {
    return [
      group.ip,
      group.location,
      group.sources.join(' '),
      group.paths.join(' '),
      group.sessionIds.join(' '),
      group.rows.map((row) => [row.browser, row.os, row.deviceName, row.userAgent].join(' ')).join(' '),
      group.notes.map((item) => item.note).join(' '),
    ].join(' ').toLowerCase();
  }

  function sortRows(groups, sortKey) {
    const sorted = [...groups];
    sorted.sort((a, b) => {
      if (sortKey === 'earliest') return (a.earliest?.timestamp?.getTime() || 0) - (b.earliest?.timestamp?.getTime() || 0);
      if (sortKey === 'location') return String(a.location || '').localeCompare(String(b.location || ''));
      if (sortKey === 'source') return String(a.sources[0] || '').localeCompare(String(b.sources[0] || ''));
      if (sortKey === 'events') return b.noteCount - a.noteCount || (b.latest?.timestamp?.getTime() || 0) - (a.latest?.timestamp?.getTime() || 0);
      return (b.latest?.timestamp?.getTime() || 0) - (a.latest?.timestamp?.getTime() || 0);
    });
    return sorted;
  }

  function filterRows() {
    const search = el.searchInput.value.trim().toLowerCase();
    const locationFilter = el.locationFilter.value.trim().toLowerCase();
    const sourceFilter = el.sourceFilter.value.trim().toLowerCase();
    let groups = state.groups.filter((group) => {
      if (search && !buildSessionSearchText(group).includes(search)) return false;
      if (locationFilter && !String(group.location || '').toLowerCase().includes(locationFilter)) return false;
      if (sourceFilter && !group.sources.some((source) => String(source || '').toLowerCase().includes(sourceFilter))) return false;
      return true;
    });
    groups = sortRows(groups, el.sortSelect.value);
    state.filteredGroups = groups;
    renderKpis(groups);
    renderSessionsTable(groups);
  }

  function renderSessionsTable(groups) {
    if (el.resultCount) el.resultCount.textContent = groups.length.toLocaleString();
    if (!el.sessionsBody) return;
    if (!groups.length) {
      el.sessionsBody.innerHTML = `<tr><td colspan="6" class="px-4 py-10 text-center text-sm text-slate-500">No visitor IP groups match the current filters.</td></tr>`;
      return;
    }

    el.sessionsBody.innerHTML = groups.map((group) => {
      const selected = group.ip && group.ip === state.selectedIp;
      const notesPreview = group.notes.length
        ? group.notes.slice(0, 2).map((item) => escapeHtml(summarizeTimelineNote(item.note))).join(' | ')
        : 'No notes saved';
      const latest = group.latest;
      const timeWindow = group.earliest && latest
        ? `${formatDateTime(group.earliest.timestamp)} -> ${formatDateTime(latest.timestamp)}`
        : 'Unknown';
      return `
        <tr class="session-row border-t border-slate-100 ${selected ? 'bg-blue-50' : 'bg-white'}" data-ip="${escapeHtml(group.ip)}">
          <td class="px-4 py-4 align-top">
            <div class="font-bold text-slate-900">${escapeHtml(group.ip)}</div>
            <div class="mt-1 text-xs text-slate-500">${escapeHtml(group.location || 'Unknown location')}</div>
            <div class="mt-2 text-xs text-slate-500">${group.sessionCount} sessions · ${group.pageCount} CSV rows</div>
          </td>
          <td class="px-4 py-4 align-top">
            <div class="font-semibold text-slate-900">${escapeHtml(formatDateTime(latest?.timestamp))}</div>
            <div class="mt-1 text-xs text-slate-500">${escapeHtml(timeWindow)}</div>
          </td>
          <td class="px-4 py-4 align-top">
            <div class="font-semibold text-slate-900">${escapeHtml(group.sources.map(normalizeSource).join(', ') || 'Unknown')}</div>
            <div class="mt-1 text-xs text-slate-500">${escapeHtml(group.sessionIds.slice(0, 2).join(', '))}${group.sessionIds.length > 2 ? '...' : ''}</div>
          </td>
          <td class="px-4 py-4 align-top">
            <div class="font-semibold text-slate-900 break-all">${escapeHtml(group.paths[0] || 'Unknown')}</div>
            <div class="mt-1 text-xs text-slate-500 break-all">${escapeHtml(group.paths.slice(1, 3).join(' | '))}</div>
          </td>
          <td class="px-4 py-4 align-top">
            <div class="font-semibold text-slate-900">${escapeHtml(latest?.deviceName || latest?.deviceType || 'Unknown')}</div>
            <div class="mt-1 text-xs text-slate-500">${escapeHtml([latest?.browser, latest?.os, latest?.screen].filter(Boolean).join(' · '))}</div>
          </td>
          <td class="px-4 py-4 align-top text-xs text-slate-600">${notesPreview}</td>
        </tr>
      `;
    }).join('');

    Array.from(el.sessionsBody.querySelectorAll('.session-row')).forEach((rowEl) => {
      rowEl.addEventListener('click', () => {
        const ip = rowEl.getAttribute('data-ip') || '';
        const group = state.filteredGroups.find((item) => item.ip === ip);
        selectSession(group || null);
      });
    });
  }

  function renderDetailMeta(group, detail) {
    const latest = group?.latest;
    const detailSources = detail?.sessions?.map((session) => session.source).filter(Boolean) || [];
    const metaItems = [
      ['IP', group?.ip || '-'],
      ['Location', group?.location || '-'],
      ['Sources', (detailSources.length ? detailSources : group?.sources || []).map(normalizeSource).join(', ') || '-'],
      ['Pages viewed', String(group?.pageCount || 0)],
      ['Sessions', String(group?.sessionCount || 0)],
      ['Paths', (group?.paths || []).join(' | ') || '-'],
      ['Latest referrer', detail?.sessions?.[0]?.referrer || 'Unknown / direct'],
      ['Browser / OS', [latest?.browser, latest?.os].filter(Boolean).join(' · ') || '-'],
      ['Device', [latest?.deviceName, latest?.deviceType].filter(Boolean).join(' · ') || '-'],
      ['Timezone', latest?.timezone || '-'],
      ['Screen', latest?.screen || '-'],
      ['Viewport', latest?.viewport || '-'],
      ['User agent', latest?.userAgent || '-'],
    ];
    if (!el.detailMeta) return;
    el.detailMeta.innerHTML = metaItems.map(([label, value]) => `
      <div class="rounded-2xl border border-slate-200 bg-white px-4 py-3">
        <div class="text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">${escapeHtml(label)}</div>
        <div class="mt-2 text-sm leading-6 text-slate-900 break-all">${escapeHtml(value)}</div>
      </div>
    `).join('');
  }

  function renderNotes(groupNotes) {
    if (!groupNotes.length) {
      if (!el.detailNotes) return;
      el.detailNotes.className = 'mt-3 empty-state';
      el.detailNotes.innerHTML = 'No notes captured for this IP in the CSV export.';
      return;
    }
    if (!el.detailNotes) return;
    el.detailNotes.className = 'mt-3 space-y-2';
    el.detailNotes.innerHTML = groupNotes.map((item) => `
      <div class="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm leading-6 text-slate-700">
        <div class="text-[11px] font-black uppercase tracking-[0.12em] text-slate-500">${escapeHtml(formatDateTime(item.timestamp))}${item.path ? ` · ${escapeHtml(item.path)}` : ''}</div>
        <div class="mt-2">${escapeHtml(item.note)}</div>
      </div>
    `).join('');
  }

  function eventTypeClass(type) {
    return `event-pill event-${String(type || '').toLowerCase() || 'heartbeat'}`;
  }

  function renderTimeline(events, group) {
    if (events && events.length) {
      if (el.detailEventCount) el.detailEventCount.textContent = `${events.length} events`;
      if (!el.timeline) return;
      el.timeline.innerHTML = events.map((event) => {
        const notes = Array.isArray(event?.extra?.notes) ? event.extra.notes : [];
        const page = event.page_url || event.path || '-';
        const referrer = event.referrer || '';
        const extra = [];
        if (event.path) extra.push(`Path: ${event.path}`);
        if (page && page !== event.path) extra.push(`Page: ${page}`);
        if (referrer) extra.push(`Referrer: ${referrer}`);
        if (event.extra?.source) extra.push(`Source: ${event.extra.source}`);
        const detailLines = [...extra, ...notes];
        return `
          <article class="timeline-item px-4 py-4">
            <div class="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div class="flex flex-wrap items-center gap-2">
                <span class="${eventTypeClass(event.event_type)}">${escapeHtml(event.event_type || 'event')}</span>
                <span class="text-sm font-semibold text-slate-900">${escapeHtml(formatDateTime(event.ts))}</span>
              </div>
              <div class="text-xs font-semibold text-slate-500">Seq ${Number(event.seq || 0)}</div>
            </div>
            ${detailLines.length ? `<div class="mt-3 space-y-2 text-sm leading-6 text-slate-700">${detailLines.map((line) => `<div>${escapeHtml(line)}</div>`).join('')}</div>` : '<div class="mt-3 text-sm text-slate-500">No extra event detail.</div>'}
          </article>
        `;
      }).join('');
      return;
    }

    const fallbackRows = Array.isArray(group?.rows) ? [...group.rows].sort((a, b) => (a.timestamp?.getTime() || 0) - (b.timestamp?.getTime() || 0)) : [];
    if (el.detailEventCount) el.detailEventCount.textContent = `${fallbackRows.length} CSV rows`;
    if (!el.timeline) return;
    if (!fallbackRows.length) {
      el.timeline.innerHTML = `<div class="empty-state m-4">No live event timeline loaded. Add an admin token and select Refresh Selected Detail to hydrate this IP from the analytics store.</div>`;
      return;
    }
    el.timeline.innerHTML = fallbackRows.map((row, index) => `
      <article class="timeline-item px-4 py-4">
        <div class="flex items-center gap-2">
          <span class="${eventTypeClass('pageview')}">csv</span>
          <span class="text-sm font-semibold text-slate-900">${escapeHtml(formatDateTime(row.timestamp))}</span>
        </div>
        <div class="mt-3 space-y-2 text-sm leading-6 text-slate-700">
          <div><strong>Path:</strong> ${escapeHtml(row.landingPath || 'Unknown')}</div>
          <div><strong>Session:</strong> ${escapeHtml(row.sessionId || 'Unknown')}</div>
          <div><strong>Source:</strong> ${escapeHtml(normalizeSource(row.source || 'Unknown'))}</div>
          ${row.notes.length ? row.notes.map((note) => `<div>${escapeHtml(summarizeTimelineNote(note))}</div>`).join('') : '<div>No CSV notes on this pageview.</div>'}
        </div>
      </article>
    `).join('');
  }

  async function fetchSessionDetail(sessionId) {
    const token = el.adminToken.value.trim();
    if (!token || !sessionId) return null;

    const base = String(el.apiBase.value || '').replace(/\/+$/, '');
    const url = `${base}/analytics/admin/sessions/${encodeURIComponent(sessionId)}`;
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    if (!response.ok) {
      throw new Error(`Session detail request failed (${response.status})`);
    }
    return response.json();
  }

  async function fetchGroupDetail(sessionIds) {
    const details = await Promise.all(sessionIds.map((sessionId) => fetchSessionDetail(sessionId).catch(() => null)));
    const validDetails = details.filter(Boolean);
    const sessions = validDetails.map((detail) => detail.session).filter(Boolean);
    const events = validDetails
      .flatMap((detail) => Array.isArray(detail.events) ? detail.events : [])
      .sort((a, b) => new Date(a.ts || 0).getTime() - new Date(b.ts || 0).getTime());
    return { sessions, events };
  }

  async function selectSession(group, { refresh = false } = {}) {
    state.selectedGroup = group;
    state.selectedIp = group?.ip || '';
    state.selectedDetail = refresh ? null : state.selectedDetail;
    renderSessionsTable(state.filteredGroups);

    if (!group) {
      if (el.detailTitle) el.detailTitle.textContent = 'No IP selected';
      if (el.detailSubtitle) el.detailSubtitle.textContent = 'Choose an IP row to inspect its combined timeline, notes, and event trail.';
      if (el.detailStatus) el.detailStatus.textContent = 'CSV only';
      if (el.detailMeta) el.detailMeta.innerHTML = '';
      renderNotes([]);
      renderTimeline([], null);
      return;
    }

    if (el.detailTitle) el.detailTitle.textContent = group.ip;
    if (el.detailSubtitle) el.detailSubtitle.textContent = `${formatDateTime(group.earliest?.timestamp)} -> ${formatDateTime(group.latest?.timestamp)} · ${group.location || 'Unknown location'} · ${group.sessionCount} sessions`;
    if (el.detailStatus) el.detailStatus.textContent = 'Loading detail';
    renderDetailMeta(group, state.selectedDetail);
    renderNotes(group.notes);
    renderTimeline([], group);

    if (!group.sessionIds.length || !el.adminToken.value.trim()) {
      if (el.detailStatus) el.detailStatus.textContent = group.sessionIds.length ? 'CSV + token optional' : 'CSV only';
      renderDetailMeta(group, null);
      return;
    }

    try {
      const detail = await fetchGroupDetail(group.sessionIds);
      state.selectedDetail = detail;
      renderDetailMeta(group, detail);
      renderNotes(group.notes);
      renderTimeline(Array.isArray(detail.events) ? detail.events : [], group);
      if (el.detailStatus) el.detailStatus.textContent = 'Live detail loaded';
    } catch (error) {
      if (el.detailStatus) el.detailStatus.textContent = 'CSV only';
      setStatus(error.message, 'error');
    }
  }

  function hydrateRows(loadedRows) {
    state.rows = loadedRows
      .filter((row) => row.sessionId || row.ip !== 'Unknown')
      .sort((a, b) => (b.timestamp?.getTime() || 0) - (a.timestamp?.getTime() || 0));
    state.groups = buildGroups(state.rows);
    state.selectedIp = '';
    state.selectedGroup = null;
    state.selectedDetail = null;
    filterRows();
    selectSession(null);
  }

  async function loadBackendData() {
    setStatus('Loading visitor CSV exports from backend...', 'neutral');
    const payload = await fetchBackendCsvRows();
    const rows = Array.isArray(payload.rows) ? payload.rows : [];
    const normalized = rows.map((row) => normalizeCsvRow(row, row.__file || 'backend'));
    hydrateRows(normalized);
    setStatus(`Loaded ${state.rows.length.toLocaleString()} CSV rows across ${state.groups.length.toLocaleString()} IPs from ${Array.isArray(payload.files) ? payload.files.length : 0} backend CSV file${Array.isArray(payload.files) && payload.files.length === 1 ? '' : 's'}.`, 'success');
  }

  [el.searchInput, el.locationFilter, el.sourceFilter].forEach((input) => {
    input?.addEventListener('input', filterRows);
  });
  el.sortSelect?.addEventListener('change', filterRows);
  el.clearLoadedData?.addEventListener('click', () => {
    state.rows = [];
    state.groups = [];
    state.filteredGroups = [];
    state.selectedIp = '';
    state.selectedGroup = null;
    state.selectedDetail = null;
    filterRows();
    selectSession(null);
    setStatus('Cleared loaded visitor data.');
  });
  el.backendDataForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      setStoredToken(el.adminToken.value);
      await loadBackendData();
    } catch (error) {
      console.error(error);
      setStatus(error.message, 'error');
    }
  });
  el.loadSelectedSession?.addEventListener('click', () => {
    if (!state.selectedGroup) {
      setStatus('Select an IP first.', 'error');
      return;
    }
    selectSession(state.selectedGroup, { refresh: true });
  });

  if (el.adminToken) {
    el.adminToken.value = getStoredToken();
  }
  filterRows();
  selectSession(null);
  if (el.adminToken?.value.trim()) {
    loadBackendData().catch((error) => {
      console.error(error);
      setStatus(error.message, 'error');
    });
  }
})();
