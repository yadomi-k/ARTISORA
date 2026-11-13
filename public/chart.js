// 依存ライブラリなしの SVG 棒グラフ（1グラフ1系列。回数と金額は別グラフ）
(function () {
  const W = 420, H = 230, L = 52, R = 8, T = 22, B = 28;
  const ns = 'http://www.w3.org/2000/svg';

  function niceStep(raw, integer) {
    if (raw <= 0) return 1;
    const exp = Math.pow(10, Math.floor(Math.log10(raw)));
    const f = raw / exp;
    const step = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * exp;
    return integer ? Math.max(1, Math.round(step)) : step;
  }
  function el(name, attrs, text) {
    const n = document.createElementNS(ns, name);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    if (text != null) n.textContent = text;
    return n;
  }
  // 上辺だけ角丸（4px）の棒
  function barPath(x, y, w, h) {
    if (h <= 0) return '';
    const r = Math.min(4, h, w / 2);
    return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
  }

  window.renderBarChart = function (container, data, opts) {
    const fmtValue = opts.formatValue, fmtAxis = opts.formatAxis || fmtValue;
    const max = Math.max(0, ...data.map((d) => d.value));
    const step = niceStep(max / 4, opts.integer);
    const top = step * 4;
    const pw = W - L - R, ph = H - T - B;
    const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': opts.title });

    for (let i = 0; i <= 4; i++) {
      const v = step * i, y = T + ph - (ph * v) / top;
      if (i > 0) svg.appendChild(el('line', { class: 'gridline', x1: L, x2: W - R, y1: y, y2: y }));
      svg.appendChild(el('text', { class: 'tick', x: L - 6, y: y + 4, 'text-anchor': 'end' }, fmtAxis(v)));
    }
    const slot = pw / data.length, bw = Math.min(40, slot * 0.56);
    data.forEach((d, i) => {
      const h = (ph * d.value) / top, x = L + slot * i + (slot - bw) / 2, y = T + ph - h;
      const g = el('g', { class: 'col' });
      g.appendChild(el('path', { class: 'bar' + (d.isCurrent ? ' current' : ''), d: barPath(x, y, bw, h) }));
      g.appendChild(el('text', { class: 'value', x: x + bw / 2, y: y - 5, 'text-anchor': 'middle' }, fmtValue(d.value)));
      g.appendChild(el('text', { class: 'xlabel' + (d.isCurrent ? ' current' : ''), x: x + bw / 2, y: H - 8, 'text-anchor': 'middle' }, d.label));
      const hit = el('rect', { class: 'hit', x: L + slot * i, y: T, width: slot, height: ph });
      const tip = `${d.label}${d.isCurrent ? '（今期）' : ''}：${fmtValue(d.value)}`;
      hit.addEventListener('mousemove', (e) => window.showTooltip(tip, e));
      hit.addEventListener('mouseleave', window.hideTooltip);
      g.appendChild(hit);
      svg.appendChild(g);
    });
    svg.appendChild(el('line', { class: 'baseline', x1: L, x2: W - R, y1: T + ph, y2: T + ph }));
    container.replaceChildren(svg);
  };
})();
