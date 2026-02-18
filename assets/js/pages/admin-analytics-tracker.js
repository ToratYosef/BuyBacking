(() => {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return;
  }

  if (!document.body || document.body.getAttribute('data-admin-page') !== 'analytics') {
    return;
  }

  const STORAGE_KEY = 'PAGE_TRACKER_LOGS';
  const PRIMARY_SOURCES = ['google', 'sellcell'];

  const sourceAlias = Object.freeze({
    google: 'Google',
    sellcell: 'SellCell',
  });

  function normalizeSource(source = '') {
    const normalized = String(source || '').trim().toLowerCase();
    if (!normalized) return 'direct';
    if (normalized.includes('google')) return 'google';
    if (normalized.includes('sellcell')) return 'sellcell';
    if (normalized === 'internal') return 'internal';
    return normalized.replace(/^www\./, '');
  }

  function readStore() {
    const fallback = {
      pages: {},
      visitors: {},
      conversions: [],
      conversionIndex: {},
      lastUpdated: null,
    };

    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return fallback;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return fallback;
      return {
        ...fallback,
        ...parsed,
        pages: parsed.pages && typeof parsed.pages === 'object' ? parsed.pages : {},
        visitors: parsed.visitors && typeof parsed.visitors === 'object' ? parsed.visitors : {},
      };
    } catch (error) {
      return fallback;
    }
  }

  function createPanel() {
    const mount = document.querySelector('.liquid-main');
    if (!mount || document.getElementById('journey-analytics-panel')) {
      return;
    }

    const section = document.createElement('section');
    section.className = 'secondary-panels';
    section.innerHTML = `
      <div id="journey-analytics-panel" class="panel">
        <h3>Visitor journey tracker</h3>
        <p class="metric-subtext">Tracks page-by-page movement per IP, source, and referrer.</p>
        <div id="journey-source-focus" class="status-summary"></div>
        <div class="table-wrapper" style="margin-top:14px;">
          <table class="data-table">
            <thead>
              <tr>
                <th>Page</th>
                <th>Unique visitors</th>
                <th>Top source</th>
                <th>IP samples</th>
              </tr>
            </thead>
            <tbody id="journey-page-table"></tbody>
          </table>
        </div>
        <div style="margin-top:18px;">
          <h4 style="margin-bottom:8px;">IP page journeys</h4>
          <div id="journey-ip-list" class="status-summary"></div>
        </div>
      </div>
    `;

    const footer = mount.querySelector('footer.footer');
    if (footer) {
      mount.insertBefore(section, footer);
    } else {
      mount.appendChild(section);
    }
  }

  function byDate(a, b) {
    const timeA = Date.parse(a || '') || 0;
    const timeB = Date.parse(b || '') || 0;
    return timeA - timeB;
  }

  function computeViewModel(store) {
    const pageRows = [];
    const pageSourceCount = new Map();
    const sourceTotals = new Map(PRIMARY_SOURCES.map((key) => [key, 0]));
    const visitors = Object.values(store.visitors || {});

    const ipJourneys = visitors
      .map((visitor) => {
        const paths = Object.entries(visitor?.visitedPaths || {})
          .map(([path, info]) => ({
            path,
            firstSeen: info?.firstSeen || '',
            lastSeen: info?.lastSeen || '',
            views: Number.isFinite(info?.views) ? info.views : 1,
          }))
          .sort((a, b) => byDate(a.firstSeen, b.firstSeen));

        const source = normalizeSource(visitor?.firstSource || visitor?.lastSource || 'direct');
        if (sourceTotals.has(source)) {
          sourceTotals.set(source, sourceTotals.get(source) + 1);
        }

        return {
          ip: visitor?.ip || 'unknown',
          referrer: visitor?.firstReferrer || visitor?.lastReferrer || 'Direct',
          source,
          lastSeen: visitor?.lastSeen || visitor?.firstSeen || '',
          paths,
        };
      })
      .sort((a, b) => byDate(b.lastSeen, a.lastSeen));

    Object.entries(store.pages || {}).forEach(([path, page]) => {
      const ipStats = page?.ipStats || {};
      const ips = Object.keys(ipStats);
      const sources = {};

      ips.forEach((ip) => {
        const sample = ipStats[ip] || {};
        const source = normalizeSource(sample.lastSource || sample.firstSource || 'direct');
        sources[source] = (sources[source] || 0) + 1;
        const key = `${path}::${source}`;
        pageSourceCount.set(key, (pageSourceCount.get(key) || 0) + 1);
      });

      const topSource = Object.entries(sources).sort((a, b) => b[1] - a[1])[0];
      pageRows.push({
        path,
        uniqueVisitors: ips.length,
        topSource: topSource ? sourceAlias[topSource[0]] || topSource[0] : 'Direct',
        ips: ips.slice(0, 5),
      });
    });

    pageRows.sort((a, b) => b.uniqueVisitors - a.uniqueVisitors);

    return {
      pageRows,
      ipJourneys,
      sourceTotals,
      pageSourceCount,
    };
  }

  function render() {
    createPanel();
    const sourceFocus = document.getElementById('journey-source-focus');
    const pageTable = document.getElementById('journey-page-table');
    const ipList = document.getElementById('journey-ip-list');

    if (!sourceFocus || !pageTable || !ipList) {
      return;
    }

    const model = computeViewModel(readStore());

    sourceFocus.innerHTML = '';
    PRIMARY_SOURCES.forEach((source) => {
      const count = model.sourceTotals.get(source) || 0;
      const badge = document.createElement('span');
      badge.className = 'badge-pill';
      badge.textContent = `${sourceAlias[source]} visitors: ${count}`;
      sourceFocus.appendChild(badge);
    });

    pageTable.innerHTML = '';
    if (!model.pageRows.length) {
      const row = document.createElement('tr');
      row.innerHTML = '<td colspan="4" class="analytics-empty-state">No page visits tracked yet.</td>';
      pageTable.appendChild(row);
    } else {
      model.pageRows.forEach((rowData) => {
        const row = document.createElement('tr');
        row.innerHTML = `
          <td>${rowData.path}</td>
          <td>${rowData.uniqueVisitors}</td>
          <td>${rowData.topSource}</td>
          <td>${rowData.ips.join(', ') || '—'}</td>
        `;
        pageTable.appendChild(row);
      });
    }

    ipList.innerHTML = '';
    if (!model.ipJourneys.length) {
      const empty = document.createElement('div');
      empty.className = 'analytics-empty-state';
      empty.textContent = 'No visitor journeys yet.';
      ipList.appendChild(empty);
      return;
    }

    model.ipJourneys.slice(0, 100).forEach((journey) => {
      const card = document.createElement('div');
      card.className = 'analytics-live-item';
      card.style.flexDirection = 'column';
      card.style.alignItems = 'flex-start';

      const title = document.createElement('strong');
      title.textContent = `${journey.ip} • ${sourceAlias[journey.source] || journey.source}`;
      card.appendChild(title);

      const ref = document.createElement('span');
      ref.textContent = `Referrer: ${journey.referrer || 'Direct'}`;
      card.appendChild(ref);

      const chain = document.createElement('span');
      const pathLabel = journey.paths.length
        ? journey.paths.map((p) => `${p.path} (${p.views})`).join(' → ')
        : 'No page path data';
      chain.textContent = `Path: ${pathLabel}`;
      card.appendChild(chain);

      ipList.appendChild(card);
    });
  }

  window.addEventListener('storage', (event) => {
    if (event.key === STORAGE_KEY) {
      render();
    }
  });

  window.addEventListener('page-tracker:updated', render);
  document.addEventListener('DOMContentLoaded', render);
  render();
})();
