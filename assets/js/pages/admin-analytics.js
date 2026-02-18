(() => {
  const STORAGE_KEY = 'PAGE_TRACKER_LOGS';
  const CONVERSION_PATH_MATCH = 'order-submitted';
  const FALLBACK_SOURCE = 'Direct';

  let referrerChart;
  let volumeChart;

  function readStore() {
    const fallback = { visitors: {}, pages: {} };
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return fallback;
      const parsed = JSON.parse(raw);
      return {
        visitors: parsed?.visitors && typeof parsed.visitors === 'object' ? parsed.visitors : {},
        pages: parsed?.pages && typeof parsed.pages === 'object' ? parsed.pages : {},
      };
    } catch (error) {
      return fallback;
    }
  }

  function toSource(value) {
    const raw = String(value || '').trim().toLowerCase();
    if (!raw) return FALLBACK_SOURCE;
    if (raw.includes('google')) return 'Google';
    if (raw.includes('sellcell')) return 'SellCell';
    if (raw === 'internal') return 'Internal';
    return raw.charAt(0).toUpperCase() + raw.slice(1);
  }

  function isConversionVisitor(visitor) {
    const visited = visitor?.visitedPaths && typeof visitor.visitedPaths === 'object'
      ? Object.keys(visitor.visitedPaths)
      : [];
    return visited.some((path) => String(path || '').toLowerCase().includes(CONVERSION_PATH_MATCH));
  }

  function buildAnalyticsModel(store) {
    const visitors = Object.values(store.visitors || {});
    const bySource = new Map();

    visitors.forEach((visitor) => {
      const source = toSource(visitor?.firstSource || visitor?.lastSource || FALLBACK_SOURCE);
      if (!bySource.has(source)) {
        bySource.set(source, { source, visitors: 0, converted: 0 });
      }
      const bucket = bySource.get(source);
      bucket.visitors += 1;
      if (isConversionVisitor(visitor)) {
        bucket.converted += 1;
      }
    });

    const sources = Array.from(bySource.values())
      .map((entry) => ({
        ...entry,
        conversionRate: entry.visitors ? (entry.converted / entry.visitors) * 100 : 0,
      }))
      .sort((a, b) => b.conversionRate - a.conversionRate);

    const totalVisitors = visitors.length;
    const convertedVisitors = visitors.filter(isConversionVisitor).length;

    return {
      visitors,
      sources,
      totalVisitors,
      convertedVisitors,
      conversionRate: totalVisitors ? (convertedVisitors / totalVisitors) * 100 : 0,
    };
  }

  function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  }

  function renderTable(sources) {
    const body = document.getElementById('referrer-table');
    if (!body) return;

    body.innerHTML = '';
    if (!sources.length) {
      body.innerHTML = '<tr><td colspan="4" class="py-3 text-slate-500">No tracker data yet.</td></tr>';
      return;
    }

    sources.forEach((row) => {
      const tr = document.createElement('tr');
      tr.className = 'border-b border-slate-100';
      tr.innerHTML = `
        <td class="py-2 pr-3">${row.source}</td>
        <td class="py-2 pr-3">${row.visitors}</td>
        <td class="py-2 pr-3">${row.converted}</td>
        <td class="py-2 pr-3">${row.conversionRate.toFixed(1)}%</td>
      `;
      body.appendChild(tr);
    });
  }

  function renderCharts(sources) {
    if (typeof window.Chart === 'undefined') {
      return;
    }

    const labels = sources.map((s) => s.source);

    if (referrerChart) referrerChart.destroy();
    if (volumeChart) volumeChart.destroy();

    const refCtx = document.getElementById('referrer-chart');
    const volCtx = document.getElementById('volume-chart');
    if (!refCtx || !volCtx) return;

    referrerChart = new Chart(refCtx, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'Conversion %',
          data: sources.map((s) => Number(s.conversionRate.toFixed(2))),
          backgroundColor: '#3b82f6',
          borderRadius: 6,
        }],
      },
      options: {
        responsive: true,
        plugins: { legend: { display: false } },
        scales: { y: { beginAtZero: true, max: 100 } },
      },
    });

    volumeChart = new Chart(volCtx, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'Visitors',
            data: sources.map((s) => s.visitors),
            borderColor: '#0ea5e9',
            backgroundColor: 'rgba(14,165,233,0.2)',
            tension: 0.35,
          },
          {
            label: 'Converted',
            data: sources.map((s) => s.converted),
            borderColor: '#22c55e',
            backgroundColor: 'rgba(34,197,94,0.2)',
            tension: 0.35,
          },
        ],
      },
      options: { responsive: true },
    });
  }

  function renderJourneys(visitors) {
    const container = document.getElementById('journey-list');
    if (!container) return;
    container.innerHTML = '';

    if (!visitors.length) {
      container.innerHTML = '<div class="text-sm text-slate-500">No IP journeys yet.</div>';
      return;
    }

    visitors
      .sort((a, b) => Date.parse(b?.lastSeen || '') - Date.parse(a?.lastSeen || ''))
      .slice(0, 150)
      .forEach((visitor) => {
        const paths = Object.entries(visitor?.visitedPaths || {})
          .sort(([, a], [, b]) => Date.parse(a?.firstSeen || '') - Date.parse(b?.firstSeen || ''))
          .map(([path, details]) => `${path} (${Number(details?.views || 1)})`)
          .join(' → ');

        const item = document.createElement('div');
        item.className = 'journey-line';
        item.innerHTML = `
          <div class="font-semibold">${visitor?.ip || 'unknown'} · ${toSource(visitor?.firstSource || visitor?.lastSource)}</div>
          <div class="text-sm text-slate-600">Referrer: ${visitor?.firstReferrer || visitor?.lastReferrer || 'Direct'}</div>
          <div class="text-sm mt-1">${paths || 'No path records.'}</div>
        `;
        container.appendChild(item);
      });
  }

  function render() {
    const model = buildAnalyticsModel(readStore());
    setText('kpi-visitors', String(model.totalVisitors));
    setText('kpi-converted', String(model.convertedVisitors));
    setText('kpi-cvr', `${model.conversionRate.toFixed(1)}%`);
    setText('kpi-top-source', model.sources[0]?.source || FALLBACK_SOURCE);

    renderTable(model.sources);
    renderCharts(model.sources);
    renderJourneys(model.visitors);
  }

  document.getElementById('refresh-analytics')?.addEventListener('click', render);
  window.addEventListener('page-tracker:updated', render);
  window.addEventListener('storage', (event) => {
    if (event.key === STORAGE_KEY) render();
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', render);
  } else {
    render();
  }
})();
