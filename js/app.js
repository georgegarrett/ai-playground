/*
 * Dashboard controller: renders every panel from RCM.data and wires up
 * time range, live updates, theme, filters, sorting and tooltips.
 */
(function () {
  'use strict';
  const D = window.RCM.data;
  const C = window.RCM.charts;
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  // ---- Formatting -----------------------------------------------------------
  const nf = new Intl.NumberFormat();
  const int = (v) => nf.format(Math.round(v));
  const pct = (v, d = 0) => v.toFixed(d) + '%';
  const tb = (v) => (v >= 1000 ? (v / 1000).toFixed(v >= 10000 ? 1 : 2) + ' PB' : (v >= 10 ? Math.round(v) : v.toFixed(1)) + ' TB');
  function dur(min) {
    if (min < 1) return Math.round(min * 60) + 's';
    if (min < 60) return Math.round(min) + 'm';
    if (min < 1440) { const h = Math.floor(min / 60), m = Math.round(min % 60); return m ? `${h}h ${m}m` : `${h}h`; }
    const d = Math.floor(min / 1440), h = Math.round((min % 1440) / 60);
    return h ? `${d}d ${h}h` : `${d}d`;
  }
  function ago(t) {
    const diff = (Date.now() - t) / 60000;
    if (diff < 0) return 'in ' + dur(-diff);
    if (diff < 1) return 'just now';
    return dur(diff) + ' ago';
  }
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const STATUS = {
    good: { label: 'Operational', icon: '✓' },
    warning: { label: 'Degraded', icon: '!' },
    serious: { label: 'Partial outage', icon: '!' },
    critical: { label: 'Major outage', icon: '✕' },
    maintenance: { label: 'Maintenance', icon: '⚙' },
    info: { label: 'Info', icon: 'i' },
  };
  const badge = (status, label) => `<span class="status ${status}"><span class="status-icon" aria-hidden="true">${STATUS[status].icon}</span>${esc(label || STATUS[status].label)}</span>`;

  // ---- State ----------------------------------------------------------------
  const RANGES = {
    '24h': { points: 48, every: 1, label: 'last 24 hours', prev: 'prior 24h' },
    '7d': { points: 336, every: 2, label: 'last 7 days', prev: 'prior 7d' },
    '30d': { points: 1440, every: 4, label: 'last 30 days', prev: 'prior 30d' },
  };
  const state = {
    range: '7d', live: true, gpuModel: 'all', alertFilter: 'open',
    sort: { key: 'id', dir: -1 }, query: '', jobState: 'all', jobCluster: 'all',
    tables: { alloc: false, io: false },
  };
  try {
    const saved = JSON.parse(localStorage.getItem('rcm-prefs') || '{}');
    if (RANGES[saved.range]) state.range = saved.range;
    if (typeof saved.live === 'boolean') state.live = saved.live;
  } catch (e) { /* storage unavailable: use defaults */ }
  function savePrefs() {
    try { localStorage.setItem('rcm-prefs', JSON.stringify({ range: state.range, live: state.live })); } catch (e) { /* ignore */ }
  }

  // ---- Range helpers ------------------------------------------------------
  function bucket(values, every) {
    if (every === 1) return values.slice();
    const out = [];
    for (let i = 0; i < values.length; i += every) {
      const chunk = values.slice(i, i + every);
      out.push(chunk.reduce((a, b) => a + b, 0) / chunk.length);
    }
    return out;
  }
  /** Values for the selected range; offset=1 gives the previous period. */
  function windowed(values, offset = 0) {
    const R = RANGES[state.range];
    const end = values.length - offset * R.points;
    return bucket(values.slice(end - R.points, end), R.every);
  }
  function windowTimes() {
    const R = RANGES[state.range];
    const slice = D.times.slice(-R.points);
    const out = [];
    for (let i = 0; i < slice.length; i += R.every) out.push(slice[Math.min(i + R.every - 1, slice.length - 1)]);
    return out;
  }
  const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
  const last = (a) => a[a.length - 1];

  // ---- Derived metrics ---------------------------------------------------
  function metrics() {
    const gpus = D.allGpus();
    const inService = gpus.filter((g) => g.state !== 'down');
    const allocatedGpus = gpus.filter((g) => g.job).length;
    const [orion, nova, helix] = D.clusters;
    const coreAlloc = (last(D.ts.orion) * orion.cores + last(D.ts.helix) * helix.cores) / (orion.cores + helix.cores);
    const capTotal = D.storage.reduce((s, v) => s + v.cap, 0);
    const usedTotal = D.storage.reduce((s, v) => s + v.used, 0);
    const pending = last(D.ts.pending);
    const running = D.clusters.reduce((s, c) => s + c.running, 0);
    const availability = mean(D.services.map((s) => s.uptime));
    return {
      gpus, inService, allocatedGpus, coreAlloc, capTotal, usedTotal, pending, running, availability,
      gpuUtil: last(D.ts.nova),
      busyUtil: mean(gpus.filter((g) => g.job).map((g) => g.util)),
      powerKw: gpus.reduce((s, g) => s + g.power, 0) / 1000,
      memUsed: gpus.reduce((s, g) => s + g.memUsed, 0),
      memTotal: inService.reduce((s, g) => s + g.mem, 0),
    };
  }

  function coreSeries() {
    const [orion, , helix] = D.clusters;
    const total = orion.cores + helix.cores;
    return D.ts.orion.map((v, i) => (v * orion.cores + D.ts.helix[i] * helix.cores) / total);
  }

  // ---- Status banner ----------------------------------------------------
  function renderBanner(M) {
    const worst = ['critical', 'serious', 'warning', 'maintenance', 'good'];
    const svc = D.services.reduce((w, s) => (worst.indexOf(s.status) < worst.indexOf(w) ? s.status : w), 'good');
    const openCritical = D.alerts.filter((a) => !a.acked && a.severity === 'critical').length;
    const degraded = D.services.filter((s) => s.status !== 'good');
    const level = openCritical ? 'serious' : svc === 'maintenance' ? 'good' : svc;
    const headline = level === 'good' ? 'All systems operational'
      : level === 'warning' ? 'Operational with degraded services'
        : 'Service disruption in progress';
    const bits = degraded.map((s) => `${esc(s.name)} — ${esc(s.label || STATUS[s.status].label).toLowerCase()}`);
    if (openCritical) bits.unshift(`${openCritical} critical alert${openCritical > 1 ? 's' : ''} open`);
    $('#status-banner').className = 'status-banner ' + level;
    $('#status-banner').innerHTML = `
      <span class="banner-icon" aria-hidden="true">${STATUS[level].icon}</span>
      <div><strong>${headline}</strong><span>${bits.join(' · ') || 'No open incidents'}</span></div>
      <span class="banner-meta">${int(M.running)} jobs running · ${int(M.pending)} queued</span>`;
  }

  // ---- KPI tiles ----------------------------------------------------------
  function delta(cur, prev, unit, decimals = 1) {
    const d = cur - prev;
    const arrow = Math.abs(d) < Math.pow(10, -decimals) ? '→' : d > 0 ? '▲' : '▼';
    return `<span class="delta">${arrow} ${Math.abs(d).toFixed(decimals)}${unit}</span> vs ${RANGES[state.range].prev}`;
  }
  function renderKpis(M) {
    const R = RANGES[state.range];
    const cores = coreSeries();
    const [orion, , helix] = D.clusters;
    const totalCores = orion.cores + helix.cores;
    const tiles = [
      {
        label: 'CPU core allocation', value: pct(M.coreAlloc, 1),
        detail: `${int((M.coreAlloc / 100) * totalCores)} of ${int(totalCores)} cores`,
        foot: delta(mean(windowed(cores)), mean(windowed(cores, 1)), ' pts'), spark: windowed(cores), color: 'var(--s1)',
      },
      {
        label: 'GPU utilization', value: pct(M.gpuUtil, 1),
        detail: `${M.allocatedGpus} of ${M.gpus.length} GPUs allocated`,
        foot: delta(mean(windowed(D.ts.nova)), mean(windowed(D.ts.nova, 1)), ' pts'), spark: windowed(D.ts.nova), color: 'var(--s2)',
      },
      {
        label: 'Queued jobs', value: int(M.pending),
        detail: `${int(M.running)} running now`,
        foot: delta(mean(windowed(D.ts.pending)), mean(windowed(D.ts.pending, 1)), '', 0), spark: windowed(D.ts.pending), color: 'var(--s1)',
      },
      {
        label: 'Storage used', value: tb(M.usedTotal),
        detail: `of ${tb(M.capTotal)} across ${D.storage.length} tiers`,
        meter: (M.usedTotal / M.capTotal) * 100,
        foot: `<span class="delta">▲ ${tb(D.storage.reduce((s, v) => s + v.weekly, 0))}</span> per week`,
      },
      {
        label: 'Service availability', value: pct(M.availability, 2),
        detail: 'Last 30 days · target 99.90%',
        foot: M.availability >= 99.9 ? `<span class="good-text">✓ Meeting target</span>` : `<span class="bad-text">✕ Below target</span>`,
        meter: null,
      },
      {
        label: 'Active researchers', value: int(D.people.researchers),
        detail: `${D.people.groups} research groups · last 7 days`,
        foot: `<span class="delta">▲ ${D.people.researchers - D.people.researchersPrev}</span> vs prior 7d · ${int(D.people.completed7d)} jobs completed`,
      },
    ];
    const host = $('#kpis');
    host.replaceChildren(...tiles.map((t) => {
      const el = document.createElement('article');
      el.className = 'kpi';
      el.innerHTML = `
        <div class="kpi-label">${t.label}</div>
        <div class="kpi-value">${t.value}</div>
        <div class="kpi-detail">${t.detail}</div>
        <div class="kpi-viz"></div>
        <div class="kpi-foot">${t.foot}</div>`;
      const viz = el.querySelector('.kpi-viz');
      if (t.spark) {
        viz.appendChild(C.sparkline(t.spark, t.color));
        viz.title = `Trend, ${R.label}`;
      } else if (t.meter != null) {
        viz.innerHTML = `<div class="meter" role="img" aria-label="${t.meter.toFixed(0)} percent used"><span style="width:${t.meter}%"></span></div>`;
      } else {
        viz.classList.add('empty');
      }
      return el;
    }));
  }

  // ---- Allocation & IO charts -------------------------------------------
  function tableView(host, times, series, unit, fmt) {
    // Show at most ~24 rows so the table stays readable.
    const step = Math.max(1, Math.ceil(times.length / 24));
    const rows = [];
    for (let i = times.length - 1; i >= 0; i -= step) rows.push(i);
    host.innerHTML = `<div class="table-wrap small-table"><table><thead><tr><th>Time</th>${series.map((s) => `<th class="num">${esc(s.name)}</th>`).join('')}</tr></thead><tbody>${
      rows.map((i) => `<tr><td>${C.fmtFull(times[i])}</td>${series.map((s) => `<td class="num">${fmt(s.values[i])}${unit}</td>`).join('')}</tr>`).join('')
    }</tbody></table></div>`;
  }
  function legend(host, series) {
    host.innerHTML = series.map((s) => `<span><i class="sw line" style="background:${s.color}"></i>${esc(s.name)}</span>`).join('');
  }

  function renderAlloc() {
    const times = windowTimes();
    const series = D.clusters.map((c) => ({ name: `${c.name} (${c.id === 'nova' ? 'GPU' : 'CPU'})`, color: `var(--s${c.series})`, values: windowed(D.ts[c.id]) }));
    const fmt = (v) => v.toFixed(0);
    if (state.tables.alloc) tableView($('#alloc-table'), times, series, '%', (v) => v.toFixed(1));
    else C.lineChart($('#alloc-chart'), { times, series, yMax: 100, format: (v) => fmt(v) + '%', label: 'Cluster allocation over time' });
    legend($('#alloc-legend'), series);
  }

  function renderIO() {
    const times = windowTimes();
    const series = [
      { name: 'Read', color: 'var(--s1)', values: windowed(D.ts.ioRead) },
      { name: 'Write', color: 'var(--s2)', values: windowed(D.ts.ioWrite) },
    ];
    if (state.tables.io) tableView($('#io-table'), times, series, ' GB/s', (v) => v.toFixed(0));
    else C.lineChart($('#io-chart'), { times, series, height: 240, format: (v) => v.toFixed(0), unit: ' GB/s', label: 'Scratch read and write throughput' });
    legend($('#io-legend'), series);
  }

  // ---- Services -------------------------------------------------------------
  function renderServices() {
    const ok = D.services.filter((s) => s.status === 'good').length;
    $('#svc-summary').textContent = `${ok}/${D.services.length} operational`;
    $('#services').innerHTML = D.services.map((s) => `
      <li>
        <div class="svc-name"><strong>${esc(s.name)}</strong><small>${esc(s.detail)}</small></div>
        <div class="svc-state">${badge(s.status, s.label)}<small>${esc(s.metric)}</small></div>
      </li>`).join('');
  }

  // ---- Clusters ---------------------------------------------------------
  function nodeStates(c) {
    if (c.id === 'nova') {
      const nodes = D.gpuNodes;
      const down = nodes.filter((n) => n.gpus.every((g) => g.state === 'down')).length;
      const alloc = nodes.filter((n) => n.gpus.every((g) => g.job)).length;
      const idle = nodes.filter((n) => n.gpus.every((g) => g.state === 'idle')).length;
      return { alloc, mixed: nodes.length - down - alloc - idle, idle, drain: 0, down };
    }
    const util = last(D.ts[c.id]) / 100;
    const drain = c.id === 'orion' ? 5 : 2, down = c.id === 'orion' ? 2 : 0;
    const avail = c.nodes - drain - down;
    const alloc = Math.round(avail * util * 0.9);
    const mixed = Math.min(avail - alloc, Math.round(avail * util * 0.14));
    return { alloc, mixed, idle: avail - alloc - mixed, drain, down };
  }

  const NODE_STATE_LABELS = { alloc: 'Allocated', mixed: 'Mixed', idle: 'Idle', drain: 'Draining', down: 'Down' };

  function renderClusters() {
    const host = $('#cluster-cards');
    host.innerHTML = D.clusters.map((c) => {
      const ns = nodeStates(c);
      const util = last(D.ts[c.id]);
      const pendingShare = { orion: 0.62, nova: 0.28, helix: 0.1 }[c.id];
      const capacity = c.gpus ? `${c.gpus - D.allGpus().filter((g) => g.state === 'down').length} / ${c.gpus} GPUs up` : `${int(c.cores)} cores`;
      const stack = Object.keys(NODE_STATE_LABELS).filter((k) => ns[k] > 0)
        .map((k) => `<span class="seg st-${k}" style="flex-grow:${ns[k]}" tabindex="0" data-cluster="${c.id}" data-state="${k}" data-count="${ns[k]}" aria-label="${NODE_STATE_LABELS[k]}: ${ns[k]} nodes"></span>`).join('');
      return `
      <article class="card span-4 cluster">
        <div class="cluster-head">
          <span class="cluster-key" style="background:var(--s${c.series})" aria-hidden="true"></span>
          <div><h3>${c.name} <span class="role">${c.role}</span></h3><p>${c.description}</p></div>
        </div>
        <div class="cluster-figure"><strong>${pct(util, 1)}</strong><span>${c.gpus ? 'GPU utilization' : 'cores allocated'}</span></div>
        <div class="stack" role="group" aria-label="${c.name} node states">${stack}</div>
        <div class="stack-caption"><span>${c.nodes} nodes</span><span>${ns.alloc + ns.mixed} busy · ${ns.idle} idle${ns.drain + ns.down ? ` · ${ns.drain + ns.down} unavailable` : ''}</span></div>
        <dl class="facts">
          <div><dt>Running jobs</dt><dd>${int(c.running)}</dd></div>
          <div><dt>Queued</dt><dd>${int(last(D.ts.pending) * pendingShare)}</dd></div>
          <div><dt>Median wait</dt><dd>${dur(c.waitMin)}</dd></div>
          <div><dt>Capacity</dt><dd>${capacity}</dd></div>
        </dl>
        <p class="hardware">${c.hardware}</p>
        <div class="partitions">${c.partitions.map((p) => `<span>${p}</span>`).join('')}</div>
      </article>`;
    }).join('');
    C.delegateTips(host, '.seg', (seg) => {
      const total = D.clusters.find((c) => c.id === seg.dataset.cluster).nodes;
      const count = +seg.dataset.count;
      return { title: NODE_STATE_LABELS[seg.dataset.state] + ' nodes', rows: [{ value: String(count), label: `${pct((count / total) * 100, 1)} of ${total}` }] };
    });
  }

  // ---- GPU wall ---------------------------------------------------------
  const step = (u) => Math.min(6, Math.floor(u / (100 / 7)));
  function renderGpus(M) {
    const nodes = D.gpuNodes.filter((n) => state.gpuModel === 'all' || n.model === state.gpuModel);
    const gpus = nodes.flatMap((n) => n.gpus);
    const live = gpus.filter((g) => g.state !== 'down');
    const busy = gpus.filter((g) => g.job);
    const idle = gpus.filter((g) => g.state === 'idle');
    const avg = mean(gpus.map((g) => g.util));
    const stats = [
      ['Average utilization', pct(avg, 1)],
      ['Allocated', `${busy.length} / ${gpus.length}`],
      ['Idle', String(idle.length)],
      ['Memory in use', tb(live.reduce((s, g) => s + g.memUsed, 0) / 1000)],
      ['Power draw', (gpus.reduce((s, g) => s + g.power, 0) / 1000).toFixed(1) + ' kW'],
    ];
    $('#gpu-stats').innerHTML = stats.map(([k, v]) => `<div><span>${k}</span><strong>${v}</strong></div>`).join('');

    const groups = D.gpuModels.filter((m) => state.gpuModel === 'all' || m.model === state.gpuModel);
    const wall = $('#gpu-wall');
    wall.innerHTML = groups.map((spec) => {
      const list = nodes.filter((n) => n.model === spec.model);
      return `<div class="gpu-group">
        <div class="gpu-group-head"><strong>${spec.label}</strong><span>${list.length} nodes × ${spec.perNode}</span></div>
        <div class="gpu-nodes per-${spec.perNode}">${list.map((n) => `
          <div class="gpu-node${n.gpus[0].state === 'down' ? ' is-down' : ''}">
            <div class="gpu-cells">${n.gpus.map((g) => {
              const cls = g.state === 'down' ? 'down' : 's' + step(g.util);
              return `<span class="cell ${cls}" tabindex="0" data-node="${n.name}" data-i="${g.index}" aria-label="${n.name} GPU ${g.index}: ${g.state === 'down' ? 'out of service' : Math.round(g.util) + '%'}"></span>`;
            }).join('')}</div>
            <span class="gpu-node-name">${n.name.replace('nova-', '')}</span>
          </div>`).join('')}
        </div></div>`;
    }).join('');

    C.delegateTips(wall, '.cell', (cell) => {
      const node = D.gpuNodes.find((n) => n.name === cell.dataset.node);
      const g = node.gpus[+cell.dataset.i];
      if (g.state === 'down') return { title: `${node.name} · GPU ${g.index}`, rows: [{ value: 'Out of service', label: g.reason }], note: node.label };
      const rows = [
        { value: pct(g.util, 0), label: 'utilization' },
        { value: `${g.memUsed.toFixed(1)} / ${g.mem} GB`, label: 'memory' },
        { value: `${g.power} W`, label: `of ${g.tdp} W` },
        { value: `${g.temp} °C`, label: 'temperature' },
      ];
      const note = g.job ? `Job ${g.job.id} · ${g.job.name} · ${g.job.user} (${g.job.account})` : 'Idle — available for scheduling';
      return { title: `${node.name} · GPU ${g.index} · ${node.model}`, rows, note };
    });
  }

  function renderDept() {
    const items = D.deptGpuHours;
    const max = C.niceMax(items[0].hours);
    const total = items.reduce((s, d) => s + d.hours, 0);
    const host = $('#dept-bars');
    host.innerHTML = items.map((d, i) => `
      <div class="bar-row" tabindex="0" data-i="${i}">
        <span class="bar-label">${esc(d.dept)}</span>
        <span class="bar-track"><span class="bar-fill" style="width:${(d.hours / max) * 100}%"></span></span>
        <span class="bar-value">${(d.hours / 1000).toFixed(1)}k</span>
      </div>`).join('');
    C.delegateTips(host, '.bar-row', (row) => {
      const d = items[+row.dataset.i];
      return { title: d.dept, rows: [{ value: int(d.hours), label: 'GPU-hours' }, { value: pct((d.hours / total) * 100, 1), label: 'of allocated total' }] };
    });
    const capacity = 256 * 24 * 30;
    $('#dept-foot').textContent = `${int(total)} GPU-hours allocated · ${pct((total / capacity) * 100, 0)} of 30-day capacity (${int(capacity)} h)`;
  }

  // ---- Storage ----------------------------------------------------------
  function renderStorage() {
    $('#storage-list').innerHTML = D.storage.map((s) => {
      const p = (s.used / s.cap) * 100;
      const status = p >= 90 ? 'critical' : p >= 85 ? 'serious' : p >= 80 ? 'warning' : null;
      const toNinety = (0.9 * s.cap - s.used) / (s.weekly / 7);
      const forecast = toNinety <= 0 ? 'Above 90% now' : toNinety > 365 ? '90% in > 1 year' : `90% in ~${Math.round(toNinety)} days`;
      return `
      <div class="storage-row">
        <div class="storage-top">
          <div><strong>${s.name}</strong> <code>${s.mount}</code><small>${s.fs}</small></div>
          <div class="storage-pct"><strong>${pct(p, 0)}</strong>${status ? badge(status, p >= 90 ? 'Critical' : 'High usage') : ''}</div>
        </div>
        <div class="capacity" role="img" aria-label="${s.name}: ${p.toFixed(0)} percent used">
          <span class="fill${status ? ' ' + status : ''}" style="width:${p}%"></span>
          <span class="mark" style="left:80%" title="80% threshold"></span><span class="mark" style="left:90%" title="90% threshold"></span>
        </div>
        <div class="storage-meta">
          <span>${tb(s.used)} of ${tb(s.cap)}</span>
          <span>+${tb(s.weekly)}/week</span>
          <span>${forecast}</span>
          <span>Inodes ${s.inodes}%</span>
          <span class="muted">${s.policy}</span>
        </div>
      </div>`;
    }).join('');
  }

  // ---- Availability ------------------------------------------------------
  function renderUptime(M) {
    $('#avail-overall').innerHTML = `<strong>${pct(M.availability, 2)}</strong> fleet average`;
    const host = $('#uptime');
    host.innerHTML = D.services.map((s, si) => `
      <div class="uptime-row">
        <span class="uptime-name">${esc(s.name)}</span>
        <span class="uptime-bars">${s.history.map((d, di) => `<span class="day st-${d.status}" tabindex="-1" data-s="${si}" data-d="${di}"></span>`).join('')}</span>
        <span class="uptime-pct">${s.uptime >= 99.995 ? '100%' : pct(s.uptime, 2)}</span>
      </div>`).join('') + `<div class="uptime-axis"><span></span><span><span>30 days ago</span><span>Today</span></span><span></span></div>`;
    C.delegateTips(host, '.day', (el) => {
      const s = D.services[+el.dataset.s];
      const d = s.history[+el.dataset.d];
      const rows = [{ value: STATUS[d.status].label, label: d.down ? `· ${dur(d.down)} downtime` : '' }];
      return { title: `${s.name} · ${C.fmtDay(d.date)}`, rows, note: d.note || 'No incidents recorded' };
    });
  }

  // ---- Alerts -------------------------------------------------------------
  const SEVERITIES = ['critical', 'serious', 'warning', 'info'];
  const SEV_LABEL = { critical: 'Critical', serious: 'Serious', warning: 'Warning', info: 'Info' };
  function renderAlerts() {
    const open = D.alerts.filter((a) => !a.acked);
    const filters = [['open', `Open ${open.length}`], ...SEVERITIES.map((s) => [s, `${SEV_LABEL[s]} ${open.filter((a) => a.severity === s).length}`]), ['all', 'All']];
    $('#alert-filter').innerHTML = filters.map(([k, label]) => `<button type="button" data-filter="${k}" aria-pressed="${state.alertFilter === k}">${label}</button>`).join('');
    const list = D.alerts.filter((a) => state.alertFilter === 'all' ? true : state.alertFilter === 'open' ? !a.acked : a.severity === state.alertFilter && !a.acked);
    $('#alert-sub').textContent = `${open.length} open · ${D.alerts.length - open.length} acknowledged`;
    $('#alerts').innerHTML = list.length ? list.map((a) => `
      <li class="alert ${a.acked ? 'acked' : ''}${a.fresh ? ' fresh' : ''}">
        ${badge(a.severity, SEV_LABEL[a.severity])}
        <div class="alert-body"><strong>${esc(a.title)}</strong><small>${esc(a.source)} · ${ago(a.time)}</small></div>
        ${a.acked ? '<span class="acked-label">Acknowledged</span>' : `<button type="button" class="btn small" data-ack="${a.id}">Acknowledge</button>`}
      </li>`).join('') : '<li class="empty">No alerts match this filter.</li>';
    D.alerts.forEach((a) => (a.fresh = false));
  }

  // ---- Jobs -------------------------------------------------------------------
  function renderJobs() {
    const q = state.query.trim().toLowerCase();
    let list = D.jobs.filter((j) =>
      (state.jobState === 'all' || j.state === state.jobState) &&
      (state.jobCluster === 'all' || j.cluster === state.jobCluster) &&
      (!q || [j.id, j.name, j.user, j.account, j.partition, D.deptOf[j.account]].join(' ').toLowerCase().includes(q)));
    const { key, dir } = state.sort;
    list = list.slice().sort((a, b) => {
      const va = a[key] ?? -1, vb = b[key] ?? -1;
      return (va > vb ? 1 : va < vb ? -1 : 0) * dir;
    });
    $('#job-rows').innerHTML = list.length ? list.map((j) => {
      const progress = j.state === 'RUNNING' ? Math.min(100, (j.elapsed / j.limit) * 100) : 0;
      const stateCls = { RUNNING: 'running', PENDING: 'pending', COMPLETED: 'completed', FAILED: 'failed' }[j.state];
      const timeCell = j.state === 'PENDING'
        ? `<span class="muted">waiting ${dur(j.waited)}</span>`
        : `<div class="walltime"><span>${dur(j.elapsed)} <span class="muted">/ ${dur(j.limit)}</span></span>${j.state === 'RUNNING' ? `<span class="mini-bar"><span style="width:${progress}%"></span></span>` : ''}</div>`;
      return `<tr>
        <td><strong>${esc(j.name)}</strong><small>#${j.id} · ${esc(j.nodeList)}</small></td>
        <td>${esc(j.user)}<small>${esc(j.account)}</small></td>
        <td><span class="job-state ${stateCls}">${j.state.charAt(0) + j.state.slice(1).toLowerCase()}</span>${j.reason ? `<small>${esc(j.reason)}</small>` : ''}</td>
        <td>${esc(j.partition)}<small>${j.cluster.charAt(0).toUpperCase() + j.cluster.slice(1)}</small></td>
        <td class="num">${int(j.cpus)}</td>
        <td class="num">${j.gpus || '<span class="muted">—</span>'}</td>
        <td>${timeCell}</td>
        <td class="num">${j.eff == null ? '<span class="muted">—</span>' : pct(j.eff)}</td>
      </tr>`;
    }).join('') : '<tr><td colspan="8" class="empty">No jobs match these filters.</td></tr>';
    $('#job-count').textContent = `Showing ${list.length} of ${D.jobs.length} sampled jobs · cluster-wide ${int(D.clusters.reduce((s, c) => s + c.running, 0))} running`;
    $$('.jobs th').forEach((th) => th.setAttribute('aria-sort', th.dataset.sort === key ? (dir > 0 ? 'ascending' : 'descending') : 'none'));
  }

  function renderWait() {
    const items = D.queueWait;
    const max = C.niceMax(Math.max(...items.map((w) => w.p90)));
    const host = $('#wait-bars');
    host.innerHTML = items.map((w, i) => `
      <div class="bar-row" tabindex="0" data-i="${i}">
        <span class="bar-label"><code>${w.partition}</code></span>
        <span class="bar-track"><span class="bar-fill" style="width:${(w.median / max) * 100}%"></span><span class="bar-marker" style="left:${(w.p90 / max) * 100}%"></span></span>
        <span class="bar-value">${dur(w.median)}</span>
      </div>`).join('');
    C.delegateTips(host, '.bar-row', (row) => {
      const w = items[+row.dataset.i];
      return { title: w.partition, rows: [{ value: dur(w.median), label: 'median wait' }, { value: dur(w.p90), label: '90th percentile' }] };
    });
  }

  function renderTimeline() {
    $('#timeline').innerHTML = D.events.slice().sort((a, b) => b.time - a.time).map((e) => `
      <li class="${e.upcoming ? 'upcoming' : ''}">
        <span class="tl-dot type-${e.type.toLowerCase()}" aria-hidden="true"></span>
        <div>
          <div class="tl-meta"><span class="tag type-${e.type.toLowerCase()}">${e.upcoming ? 'Scheduled · ' : ''}${e.type}</span><time datetime="${new Date(e.time).toISOString()}">${C.fmtFull(e.time)}</time></div>
          <strong>${esc(e.title)}</strong>
          <p>${esc(e.text)}</p>
        </div>
      </li>`).join('');
  }

  // ---- Render orchestration -----------------------------------------------
  function renderLive() {
    const M = metrics();
    renderBanner(M);
    renderKpis(M);
    renderAlloc();
    renderClusters();
    renderGpus(M);
    renderIO();
    renderUptime(M);
    renderAlerts();
    renderJobs();
    $('#updated').textContent = `Updated ${new Date().toLocaleTimeString()}.`;
  }
  function renderAll() {
    renderServices();
    renderDept();
    renderStorage();
    renderWait();
    renderTimeline();
    renderLive();
  }

  // ---- Interactions -----------------------------------------------------
  function syncRangeButtons() {
    $$('[data-range]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.range === state.range)));
  }
  $$('[data-range]').forEach((b) => b.addEventListener('click', () => {
    state.range = b.dataset.range;
    syncRangeButtons();
    savePrefs();
    renderKpis(metrics());
    renderAlloc();
    renderIO();
  }));

  let timer = null;
  function setLive(on) {
    state.live = on;
    $('#live').setAttribute('aria-pressed', String(on));
    $('#live-label').textContent = on ? 'Live' : 'Paused';
    clearInterval(timer);
    if (on) timer = setInterval(() => {
      const { newAlert } = D.tick();
      if (newAlert) newAlert.fresh = true;
      renderLive();
    }, 5000);
    savePrefs();
  }
  $('#live').addEventListener('click', () => setLive(!state.live));

  $('#theme').addEventListener('click', () => {
    const root = document.documentElement;
    const current = root.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    const next = current === 'dark' ? 'light' : 'dark';
    root.dataset.theme = next;
    try { localStorage.setItem('rcm-theme', next); } catch (e) { /* ignore */ }
  });

  $('#gpu-filter').addEventListener('click', (e) => {
    const b = e.target.closest('[data-model]');
    if (!b) return;
    state.gpuModel = b.dataset.model;
    $$('#gpu-filter [data-model]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    renderGpus(metrics());
  });

  $('#alert-filter').addEventListener('click', (e) => {
    const b = e.target.closest('[data-filter]');
    if (!b) return;
    state.alertFilter = b.dataset.filter;
    renderAlerts();
  });
  $('#alerts').addEventListener('click', (e) => {
    const b = e.target.closest('[data-ack]');
    if (!b) return;
    const a = D.alerts.find((x) => x.id === +b.dataset.ack);
    if (a) a.acked = true;
    renderAlerts();
    renderBanner(metrics());
  });

  $$('[data-table-toggle]').forEach((b) => b.addEventListener('click', () => {
    const key = b.dataset.tableToggle;
    state.tables[key] = !state.tables[key];
    $(`#${key}-chart`).hidden = state.tables[key];
    $(`#${key}-table`).hidden = !state.tables[key];
    b.textContent = state.tables[key] ? 'Chart view' : 'Table view';
    b.setAttribute('aria-pressed', String(state.tables[key]));
    key === 'alloc' ? renderAlloc() : renderIO();
  }));

  $('#job-search').addEventListener('input', (e) => { state.query = e.target.value; renderJobs(); });
  $('#job-state').addEventListener('change', (e) => { state.jobState = e.target.value; renderJobs(); });
  $('#job-cluster').addEventListener('change', (e) => { state.jobCluster = e.target.value; renderJobs(); });
  $$('.jobs th[data-sort] button').forEach((b) => b.addEventListener('click', () => {
    const key = b.parentElement.dataset.sort;
    state.sort = { key, dir: state.sort.key === key ? -state.sort.dir : (key === 'user' || key === 'partition' || key === 'state' ? 1 : -1) };
    renderJobs();
  }));

  // Scroll-spy for the sidebar
  const links = $$('.sidebar nav a');
  const spy = new IntersectionObserver((entries) => {
    entries.forEach((en) => {
      if (en.isIntersecting) links.forEach((l) => l.classList.toggle('active', l.getAttribute('href') === '#' + en.target.id));
    });
  }, { rootMargin: '-35% 0px -60% 0px' });
  $$('main .section').forEach((s) => spy.observe(s));

  // Re-render width-dependent charts on resize
  let resizeFrame = 0, lastWidth = innerWidth;
  addEventListener('resize', () => {
    if (innerWidth === lastWidth) return;
    lastWidth = innerWidth;
    cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(() => { renderAlloc(); renderIO(); });
  });

  syncRangeButtons();
  renderAll();
  setLive(state.live);
})();
