/*
 * Small, dependency-free chart primitives (SVG + HTML).
 * Colors are passed as CSS custom property names (e.g. 'var(--s1)') so charts
 * follow the light/dark theme without re-rendering.
 */
(function () {
  'use strict';
  const SVG = 'http://www.w3.org/2000/svg';

  function svgEl(tag, attrs, parent) {
    const node = document.createElementNS(SVG, tag);
    for (const k in attrs) node.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(node);
    return node;
  }

  function niceMax(v) {
    if (v <= 0) return 1;
    const pow = Math.pow(10, Math.floor(Math.log10(v)));
    for (const m of [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (m * pow >= v) return m * pow;
    return 10 * pow;
  }

  // ---- Shared tooltip -------------------------------------------------------
  // Content is built with textContent so labels can never inject markup.
  let tipNode = null;
  function tipEl() {
    if (!tipNode) {
      tipNode = document.createElement('div');
      tipNode.className = 'tooltip';
      tipNode.setAttribute('role', 'tooltip');
      document.body.appendChild(tipNode);
    }
    return tipNode;
  }
  /** content: { title, rows: [{ value, label, color?, shape? }], note? } */
  function showTip(content, x, y) {
    const t = tipEl();
    t.replaceChildren();
    if (content.title) {
      const h = document.createElement('div');
      h.className = 'tt-title';
      h.textContent = content.title;
      t.appendChild(h);
    }
    (content.rows || []).forEach((r) => {
      const row = document.createElement('div');
      row.className = 'tt-row';
      if (r.color) {
        const key = document.createElement('span');
        key.className = 'tt-key ' + (r.shape || 'line');
        key.style.background = r.color;
        row.appendChild(key);
      }
      const v = document.createElement('strong');
      v.textContent = r.value;
      const l = document.createElement('span');
      l.textContent = r.label;
      row.append(v, l);
      t.appendChild(row);
    });
    if (content.note) {
      const n = document.createElement('div');
      n.className = 'tt-note';
      n.textContent = content.note;
      t.appendChild(n);
    }
    t.classList.add('show');
    const r = t.getBoundingClientRect();
    let left = x + 14, top = y + 14;
    if (left + r.width > innerWidth - 8) left = x - r.width - 14;
    if (top + r.height > innerHeight - 8) top = y - r.height - 14;
    t.style.left = Math.max(8, left) + 'px';
    t.style.top = Math.max(8, top) + 'px';
  }
  function hideTip() { if (tipNode) tipNode.classList.remove('show'); }

  /** Delegated hover + focus tooltips for any descendant matching `selector`. */
  function delegateTips(host, selector, contentFor) {
    if (host._tipsBound) { host._tipContent = contentFor; return; }
    host._tipsBound = true;
    host._tipContent = contentFor;
    host.addEventListener('pointermove', (e) => {
      const target = e.target.closest(selector);
      if (!target || !host.contains(target)) return hideTip();
      showTip(host._tipContent(target), e.clientX, e.clientY);
    });
    host.addEventListener('pointerleave', hideTip);
    host.addEventListener('focusin', (e) => {
      const target = e.target.closest(selector);
      if (!target) return;
      const b = target.getBoundingClientRect();
      showTip(host._tipContent(target), b.left + b.width / 2, b.bottom);
    });
    host.addEventListener('focusout', hideTip);
  }

  // ---- Time axis formatting ---------------------------------------------
  const fmtClock = (t) => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const fmtDay = (t) => new Date(t).toLocaleDateString([], { month: 'short', day: 'numeric' });
  const fmtFull = (t) => new Date(t).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

  /**
   * Line chart with crosshair tooltip and direct end labels.
   * opts: { times, series: [{ name, color, values }], height, yMax, format, area, label }
   */
  function lineChart(host, opts) {
    const W = Math.max(280, Math.floor(host.clientWidth));
    const H = opts.height || 260;
    const multi = opts.series.length > 1;
    const m = { l: 46, r: multi ? 86 : 18, t: 14, b: 28 };
    const iw = W - m.l - m.r, ih = H - m.t - m.b;
    const n = opts.times.length;
    const fmt = opts.format || ((v) => v.toFixed(0));
    const peak = Math.max(...opts.series.flatMap((s) => s.values));
    const yMax = opts.yMax || niceMax(peak * 1.12);
    const x = (i) => m.l + (n < 2 ? 0 : (i / (n - 1)) * iw);
    const y = (v) => m.t + ih - (v / yMax) * ih;

    const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, class: 'chart-svg', role: 'img', 'aria-label': opts.label || '' });

    // Recessive grid and y ticks
    for (let k = 0; k <= 4; k++) {
      const v = (yMax * k) / 4, yy = y(v);
      svgEl('line', { x1: m.l, x2: m.l + iw, y1: yy, y2: yy, class: k === 0 ? 'axis-base' : 'grid' }, svg);
      svgEl('text', { x: m.l - 8, y: yy + 4, 'text-anchor': 'end', class: 'tick' }, svg).textContent = fmt(v);
    }
    // X ticks
    const span = opts.times[n - 1] - opts.times[0];
    const fmtX = span <= 36 * 3600e3 ? fmtClock : fmtDay;
    const count = Math.max(2, Math.floor(iw / 110));
    for (let k = 0; k <= count; k++) {
      const i = Math.round((k * (n - 1)) / count);
      const anchor = k === 0 ? 'start' : k === count ? 'end' : 'middle';
      svgEl('text', { x: x(i), y: H - 8, 'text-anchor': anchor, class: 'tick' }, svg).textContent = fmtX(opts.times[i]);
    }

    // Marks
    opts.series.forEach((s) => {
      const d = s.values.map((v, i) => (i ? 'L' : 'M') + x(i).toFixed(1) + ',' + y(v).toFixed(1)).join('');
      if (opts.area) {
        svgEl('path', { d: d + `L${x(n - 1)},${y(0)}L${x(0)},${y(0)}Z`, class: 'area', style: `fill:${s.color}` }, svg);
      }
      svgEl('path', { d, class: 'line', style: `stroke:${s.color}` }, svg);
    });

    // Direct labels at the line ends, nudged apart to avoid collisions
    if (multi) {
      const labels = opts.series.map((s) => ({ s, y: y(s.values[n - 1]) })).sort((a, b) => a.y - b.y);
      for (let i = 1; i < labels.length; i++) if (labels[i].y - labels[i - 1].y < 15) labels[i].y = labels[i - 1].y + 15;
      labels.forEach(({ s, y: ly }) => {
        svgEl('circle', { cx: x(n - 1), cy: y(s.values[n - 1]), r: 3.5, class: 'end-dot', style: `fill:${s.color}` }, svg);
        const t = svgEl('text', { x: x(n - 1) + 10, y: ly + 4, class: 'end-label' }, svg);
        t.textContent = s.name;
      });
    }

    // Hover layer: crosshair snaps to nearest sample; one tooltip lists every series
    const cross = svgEl('line', { y1: m.t, y2: m.t + ih, class: 'crosshair', visibility: 'hidden' }, svg);
    const dots = opts.series.map((s) => svgEl('circle', { r: 4.5, class: 'hover-dot', style: `fill:${s.color}`, visibility: 'hidden' }, svg));
    const hit = svgEl('rect', { x: m.l, y: m.t, width: iw, height: ih, class: 'hit' }, svg);
    hit.addEventListener('pointermove', (e) => {
      const box = svg.getBoundingClientRect();
      const px = ((e.clientX - box.left) / box.width) * W;
      const i = Math.max(0, Math.min(n - 1, Math.round(((px - m.l) / iw) * (n - 1))));
      cross.setAttribute('x1', x(i)); cross.setAttribute('x2', x(i));
      cross.setAttribute('visibility', 'visible');
      dots.forEach((dot, k) => {
        dot.setAttribute('cx', x(i)); dot.setAttribute('cy', y(opts.series[k].values[i]));
        dot.setAttribute('visibility', 'visible');
      });
      const rows = opts.series
        .map((s) => ({ value: fmt(s.values[i]) + (opts.unit || ''), label: s.name, color: s.color, raw: s.values[i] }))
        .sort((a, b) => b.raw - a.raw);
      showTip({ title: fmtFull(opts.times[i]), rows }, e.clientX, e.clientY);
    });
    hit.addEventListener('pointerleave', () => {
      cross.setAttribute('visibility', 'hidden');
      dots.forEach((d) => d.setAttribute('visibility', 'hidden'));
      hideTip();
    });

    host.replaceChildren(svg);
  }

  /** Tiny trend line for stat tiles. Returns an SVG element. */
  function sparkline(values, color) {
    const W = 120, H = 34, n = values.length;
    const lo = Math.min(...values), hi = Math.max(...values);
    const pad = (hi - lo) * 0.15 || 1;
    const y = (v) => H - 2 - ((v - lo + pad) / (hi - lo + 2 * pad)) * (H - 4);
    const d = values.map((v, i) => (i ? 'L' : 'M') + ((i / (n - 1)) * W).toFixed(1) + ',' + y(v).toFixed(1)).join('');
    const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: 'none', class: 'spark', 'aria-hidden': 'true' });
    svgEl('path', { d: d + `L${W},${H}L0,${H}Z`, class: 'spark-area', style: `fill:${color}` }, svg);
    svgEl('path', { d, class: 'spark-line', style: `stroke:${color}` }, svg);
    return svg;
  }

  window.RCM = window.RCM || {};
  window.RCM.charts = { lineChart, sparkline, niceMax, showTip, hideTip, delegateTips, fmtFull, fmtDay, fmtClock };
})();
