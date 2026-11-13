(function () {
  const $ = (s, r = document) => r.querySelector(s);
  const h = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const yen = (n) => '¥' + Math.round(n || 0).toLocaleString('ja-JP');
  const compact = new Intl.NumberFormat('ja-JP', { notation: 'compact', maximumFractionDigits: 1 });
  const date = (s) => (s ? s.slice(0, 10).replace(/-/g, '/') : '');
  const stars = (r) => {
    if (r == null) return '<span class="muted">—</span>';
    const full = Math.round(r);
    return `<span class="stars" aria-label="評価 ${r}">${'★'.repeat(full)}<span class="off">${'★'.repeat(5 - full)}</span></span>`;
  };

  let meta = null;
  let selectedId = null;
  let currentDetail = null;

  async function api(url, options) {
    const res = await fetch(url, options);
    const body = await res.json().catch(() => ({}));
    if (res.status === 401) { showLogin(body.error); throw new Error(body.error || 'ログインしてください。'); }
    if (!res.ok) throw new Error(body.error || `通信エラー (${res.status})`);
    return body;
  }

  // ---------- tooltip / toast ----------
  const tooltip = $('#tooltip');
  window.showTooltip = (text, e) => {
    tooltip.textContent = text; tooltip.hidden = false;
    const r = tooltip.getBoundingClientRect();
    tooltip.style.left = Math.min(window.innerWidth - r.width - 8, e.clientX + 12) + 'px';
    tooltip.style.top = (e.clientY - r.height - 10) + 'px';
  };
  window.hideTooltip = () => { tooltip.hidden = true; };
  function toast(msg) {
    const t = $('#toast'); t.textContent = msg; t.hidden = false;
    clearTimeout(toast._t); toast._t = setTimeout(() => (t.hidden = true), 2500);
  }

  // ---------- ① 検索 ----------
  async function search() {
    const f = new FormData($('#searchForm'));
    const q = new URLSearchParams({
      keyword: f.get('keyword') || '', family: f.get('family') || '',
      minRating: f.get('minRating') || '', activeOnly: f.get('activeOnly') ? 'true' : 'false',
    });
    const body = $('#resultBody');
    body.innerHTML = '<tr><td colspan="6" class="loading">検索中…</td></tr>';
    try {
      const res = await api('/api/vendors?' + q);
      $('#resultCount').textContent = `検索結果 ${res.items.length}件${res.items.length >= 200 ? '（上限200件）' : ''}`;
      $('#fyNote').textContent = `今期：${res.fiscalYear}年度（${res.period}）`;
      if (!res.items.length) {
        body.innerHTML = '<tr><td colspan="6" class="empty">該当する発注先が見つかりませんでした</td></tr>';
        return;
      }
      body.innerHTML = res.items.map((v) => `
        <tr data-id="${h(v.id)}" tabindex="0" class="${v.id === selectedId ? 'selected' : ''}">
          <td><span class="name">${h(v.name)}</span>${v.isActive ? '' : '<span class="tag-inactive">無効</span>'}</td>
          <td class="nowrap">${h(v.productCode)}</td>
          <td>${h(v.family)}</td>
          <td>${stars(v.avgRating)} ${v.avgRating != null ? `<span class="muted">${v.avgRating.toFixed(1)}（${v.reviewCount}）</span>` : ''}</td>
          <td class="num">${v.fyUsageCount}回</td>
          <td class="num">${yen(v.fyUsageAmount)}</td>
        </tr>`).join('');
    } catch (e) {
      body.innerHTML = `<tr><td colspan="6"><div class="error-box">${h(e.message)}</div></td></tr>`;
    }
  }

  $('#searchForm').addEventListener('submit', (e) => { e.preventDefault(); search(); });
  $('#searchForm').addEventListener('change', (e) => { if (e.target.name !== 'keyword') search(); });
  $('#resultBody').addEventListener('click', (e) => {
    const tr = e.target.closest('tr[data-id]'); if (tr) selectVendor(tr.dataset.id);
  });
  $('#resultBody').addEventListener('keydown', (e) => {
    const tr = e.target.closest('tr[data-id]'); if (tr && e.key === 'Enter') selectVendor(tr.dataset.id);
  });

  // ---------- 詳細 ----------
  async function selectVendor(id, keepScroll) {
    selectedId = id;
    document.querySelectorAll('#resultBody tr').forEach((tr) => tr.classList.toggle('selected', tr.dataset.id === id));
    const panel = $('#detail');
    if (!keepScroll) panel.innerHTML = '<p class="loading">読み込み中…</p>';
    try {
      currentDetail = await api('/api/vendors/' + encodeURIComponent(id));
      renderDetail(currentDetail);
      if (!keepScroll && window.innerWidth <= 1100) panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (e) {
      panel.innerHTML = `<div class="error-box">${h(e.message)}</div>`;
    }
  }

  function renderDetail(d) {
    const v = d.vendor;
    const usageTotal = d.currentUsages.reduce((s, u) => s + u.cost, 0);
    $('#detail').innerHTML = `
      <div class="detail-head">
        <div>
          <h2>${v.url ? `<a href="${h(v.url)}" target="_blank" rel="noopener">${h(v.name)}</a>` : h(v.name)}</h2>
          <div class="detail-meta">
            <span>コード：${h(v.productCode || '—')}</span>
            <span>ファミリ：${h(v.family || '—')}</span>
            <span>${v.isActive ? '有効' : '無効'}</span>
          </div>
          ${v.description ? `<div class="muted" style="margin-top:4px">${h(v.description)}</div>` : ''}
        </div>
        <div class="rating-box">
          <div class="big">${d.avgRating != null ? d.avgRating.toFixed(1) : '—'}</div>
          <div>${stars(d.avgRating)}</div>
          <div class="muted" style="font-size:12px">口コミ ${d.reviewCount}件</div>
        </div>
      </div>

      <h3 class="section">年度別の利用状況<small>直近${d.yearlyStats.length}年度</small></h3>
      <div class="charts">
        <div class="chart-card">
          <h4>利用回数</h4><div class="sub">商談商品の件数（回）</div>
          <div class="chart" id="chartCount"></div>
        </div>
        <div class="chart-card">
          <h4>利用金額</h4><div class="sub">最終原価の合計（円）</div>
          <div class="chart" id="chartAmount"></div>
        </div>
      </div>
      <div class="legend"><span><i style="background:var(--bar-current)"></i>今期</span><span><i style="background:var(--bar)"></i>過去の年度</span></div>

      <h3 class="section">今期の利用一覧<small>${d.fiscalYear}年度（${h(d.period)}）・利用日の新しい順</small></h3>
      ${d.currentUsages.length ? `
        <div class="table-wrap">
          <table class="table">
            <thead><tr><th>利用日</th><th>商談名</th><th>取引先</th><th>ステージ</th><th>担当</th><th class="num">数量</th><th class="num">最終原価</th></tr></thead>
            <tbody>${d.currentUsages.map((u) => `
              <tr>
                <td class="num" style="text-align:left">${date(u.usageDate)}</td>
                <td>${u.url ? `<a href="${h(u.url)}" target="_blank" rel="noopener">${h(u.opportunityName)}</a>` : h(u.opportunityName)}</td>
                <td>${h(u.accountName || '—')}</td>
                <td>${h(u.stage)}</td>
                <td>${h(u.owner || '—')}</td>
                <td class="num">${u.quantity ?? ''}</td>
                <td class="num">${yen(u.cost)}</td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>
        <div class="usage-total">${d.currentUsages.length}件 ／ 合計 ${yen(usageTotal)}</div>`
        : '<div class="no-usage">直近の利用はありませんでした</div>'}

      <h3 class="section">口コミ<small>${d.reviewCount}件</small></h3>
      ${reviewFormHtml(d)}
      ${d.reviews.length ? `<ul class="review-list">${d.reviews.map((r) => `
        <li>
          <div class="top">${stars(r.rating)}${r.category ? `<span class="cat">${h(r.category)}</span>` : ''}
            <span>${h(r.author)}</span><span>${h(date(r.createdAt))}</span></div>
          <p>${h(r.comment)}</p>
          ${r.opportunityName ? `<div class="opp">関連商談：${h(r.opportunityName)}</div>` : ''}
        </li>`).join('')}</ul>`
        : '<p class="muted" style="margin-top:12px">まだ口コミはありません。最初の口コミを投稿してください。</p>'}
    `;

    const series = (key) => d.yearlyStats.map((y) => ({ label: y.label.replace('年度', ''), value: y[key], isCurrent: y.isCurrent }));
    renderBarChart($('#chartCount'), series('usageCount'), {
      title: '年度別 利用回数', integer: true, formatValue: (n) => `${n}回`, formatAxis: (n) => String(n),
    });
    renderBarChart($('#chartAmount'), series('usageAmount'), {
      title: '年度別 利用金額', formatValue: (n) => (n >= 1e4 ? compact.format(n) : n.toLocaleString('ja-JP')) + '円', formatAxis: (n) => compact.format(n),
    });
    bindReviewForm(d);
  }

  // ---------- ② 口コミ入力 ----------
  function reviewFormHtml(d) {
    return `
      <form class="review-form" id="reviewForm" novalidate>
        <div class="field full">
          <span>評価 <span style="color:var(--danger)">*</span></span>
          <div class="star-input" role="radiogroup" aria-label="評価">
            ${[1, 2, 3, 4, 5].map((n) => `<button type="button" data-v="${n}" role="radio" aria-checked="false" aria-label="★${n}">★</button>`).join('')}
          </div>
        </div>
        <label class="field"><span>観点</span>
          <select name="category"><option value="">選択なし</option>${meta.categories.map((c) => `<option>${h(c)}</option>`).join('')}</select>
        </label>
        <label class="field"><span>関連商談（任意）</span>
          <select name="opportunityId"><option value="">選択なし</option>
            ${d.relatedOpportunities.map((o) => `<option value="${h(o.id)}">${h(date(o.usageDate))} ${h(o.name)}</option>`).join('')}
          </select>
        </label>
        <label class="field full"><span>口コミ <span style="color:var(--danger)">*</span></span>
          <textarea name="comment" maxlength="2000" placeholder="品質・納期・対応など、次に依頼する人の参考になる内容を書いてください"></textarea>
        </label>
        <div class="form-actions full">
          <span class="form-error" id="reviewError"></span>
          <span class="posted-as">投稿者：${h(meta.user.name)}</span>
          <button type="submit" class="btn primary">口コミを投稿</button>
        </div>
      </form>`;
  }

  function bindReviewForm(d) {
    const form = $('#reviewForm');
    let rating = 0;
    const btns = form.querySelectorAll('.star-input button');
    const paint = (n) => btns.forEach((b) => { const on = Number(b.dataset.v) <= n; b.classList.toggle('on', on); b.setAttribute('aria-checked', String(Number(b.dataset.v) === rating)); });
    btns.forEach((b) => {
      b.addEventListener('click', () => { rating = Number(b.dataset.v); paint(rating); });
      b.addEventListener('mouseenter', () => paint(Number(b.dataset.v)));
      b.addEventListener('mouseleave', () => paint(rating));
    });
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = new FormData(form);
      const opp = d.relatedOpportunities.find((o) => o.id === f.get('opportunityId'));
      const payload = {
        rating, category: f.get('category'), comment: f.get('comment'),
        opportunityId: opp ? opp.id : null, opportunityName: opp ? opp.name : null,
      };
      const err = $('#reviewError');
      const btn = form.querySelector('button[type=submit]');
      err.textContent = ''; btn.disabled = true;
      try {
        await api(`/api/vendors/${encodeURIComponent(d.vendor.id)}/reviews`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
        });
        toast('口コミを投稿しました');
        await selectVendor(d.vendor.id, true);
        search();
      } catch (ex) {
        err.textContent = ex.message; btn.disabled = false;
      }
    });
  }

  // ---------- ログイン ----------
  function showLogin(message) {
    $('#appView').hidden = true; $('#userBox').hidden = true; $('#loginView').hidden = false;
    $('#loginError').textContent = message && message !== 'ログインしてください。' ? message : '';
  }

  // ---------- 初期化 ----------
  (async function init() {
    const params = new URLSearchParams(location.search);
    if (params.has('loginError')) {
      history.replaceState(null, '', '/');
      showLogin(params.get('loginError'));
      return;
    }
    try {
      meta = await api('/api/meta');
      $('#appView').hidden = false;
      $('#modeBadge').hidden = meta.mode !== 'mock';
      $('#userName').textContent = meta.user.name + ' さん';
      $('#userBox').hidden = false;
      $('#logoutForm').hidden = meta.mode === 'mock';
      const sel = $('#searchForm select[name=family]');
      meta.families.forEach((f) => sel.insertAdjacentHTML('beforeend', `<option value="${h(f.value)}">${h(f.label)}</option>`));
    } catch (e) {
      if ($('#loginView').hidden) {
        $('#appView').hidden = false;
        $('#resultBody').innerHTML = `<tr><td colspan="6"><div class="error-box">${h(e.message)}</div></td></tr>`;
      }
      return;
    }
    search();
  })();
})();
