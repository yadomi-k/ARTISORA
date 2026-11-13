// 検索・集計ロジック（Salesforce / デモ どちらのデータソースでも共通）
const config = require('./config');
const reviews = require('./reviews');
const { fiscalStart, fiscalYearOf, addYears, ymd, parseYmd } = require('./fiscal');

const ds = config.useMock ? require('./mock') : require('./salesforce');

async function fiscalContext() {
  const startMonth = (await ds.getFiscalStartMonth()) || 4;
  const curStart = fiscalStart(new Date(), startMonth);
  const curEnd = addYears(curStart, 1);
  return { startMonth, curStart, curEnd, curYear: curStart.getFullYear() };
}

const periodLabel = (s, e) => {
  const last = new Date(e.getFullYear(), e.getMonth(), e.getDate() - 1);
  return `${ymd(s).replace(/-/g, '/')}〜${ymd(last).replace(/-/g, '/')}`;
};

async function searchVendors({ keyword, family, activeOnly, minRating }) {
  const fc = await fiscalContext();
  const vendors = await ds.listVendors({ keyword: (keyword || '').trim(), family, activeOnly });
  const ids = vendors.map((v) => v.id);
  const lines = await ds.getUsageLines(ids, ymd(fc.curStart), ymd(fc.curEnd));
  const usage = new Map();
  for (const l of lines) {
    const u = usage.get(l.vendorId) || { opps: new Set(), amount: 0 };
    u.opps.add(l.opportunityId);
    u.amount += l.cost;
    usage.set(l.vendorId, u);
  }
  const stats = reviews.statsFor(ids);
  const min = Number(minRating) || 0;
  const items = vendors
    .map((v) => {
      const s = stats.get(v.id);
      const u = usage.get(v.id);
      return {
        ...v,
        avgRating: s ? Math.round(s.avg * 10) / 10 : null,
        reviewCount: s ? s.count : 0,
        fyUsageCount: u ? u.opps.size : 0,
        fyUsageAmount: u ? u.amount : 0,
      };
    })
    .filter((v) => !min || (v.avgRating !== null && v.avgRating >= min));
  return { fiscalYear: fc.curYear, period: periodLabel(fc.curStart, fc.curEnd), items };
}

async function getVendorDetail(id) {
  const vendor = await ds.getVendor(id);
  if (!vendor) return null;
  const fc = await fiscalContext();
  const from = addYears(fc.curStart, -(config.yearsToShow - 1));
  const lines = await ds.getUsageLines([id], ymd(from), ymd(fc.curEnd));

  const years = [];
  for (let i = 0; i < config.yearsToShow; i++) {
    years.push({ year: from.getFullYear() + i, label: `${from.getFullYear() + i}年度`, opps: new Set(), amount: 0 });
  }
  const byYear = new Map(years.map((y) => [y.year, y]));
  const currentUsages = [];
  const relatedOpps = new Map();
  for (const l of lines) {
    const y = byYear.get(fiscalYearOf(parseYmd(l.usageDate), fc.startMonth));
    if (y) { y.opps.add(l.opportunityId); y.amount += l.cost; }
    if (l.usageDate >= ymd(fc.curStart)) currentUsages.push(l);
    if (!relatedOpps.has(l.opportunityId)) relatedOpps.set(l.opportunityId, { id: l.opportunityId, name: l.opportunityName, usageDate: l.usageDate });
  }
  // 利用日の新しい順
  currentUsages.sort((a, b) => (a.usageDate === b.usageDate ? 0 : a.usageDate < b.usageDate ? 1 : -1));

  const rv = reviews.listByVendor(id);
  const avg = rv.length ? Math.round((rv.reduce((s, r) => s + r.rating, 0) / rv.length) * 10) / 10 : null;
  return {
    vendor,
    fiscalYear: fc.curYear,
    period: periodLabel(fc.curStart, fc.curEnd),
    yearlyStats: years.map((y) => ({ year: y.year, label: y.label, usageCount: y.opps.size, usageAmount: y.amount, isCurrent: y.year === fc.curYear })),
    currentUsages,
    relatedOpportunities: [...relatedOpps.values()].slice(0, 100),
    reviews: rv,
    avgRating: avg,
    reviewCount: rv.length,
  };
}

async function addReview(vendorId, body) {
  const vendor = await ds.getVendor(vendorId);
  if (!vendor) throw Object.assign(new Error('発注先が見つかりません。'), { status: 404 });
  const rating = Number(body.rating);
  const comment = String(body.comment || '').trim();
  const author = String(body.author || '').trim();
  const category = body.category ? String(body.category) : null;
  const errors = [];
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) errors.push('評価（★1〜5）を選択してください。');
  if (!comment) errors.push('口コミを入力してください。');
  if (comment.length > 2000) errors.push('口コミは2000文字以内で入力してください。');
  if (!author) errors.push('投稿者名を入力してください。');
  if (category && !reviews.CATEGORIES.includes(category)) errors.push('観点が不正です。');
  if (errors.length) throw Object.assign(new Error(errors.join('\n')), { status: 400 });
  return reviews.create({
    vendorId, rating, category, comment, author: author.slice(0, 50),
    opportunityId: body.opportunityId || null, opportunityName: body.opportunityName || null,
  });
}

async function getMeta() {
  const fc = await fiscalContext();
  return {
    mode: ds.name,
    families: await ds.getFamilies(),
    categories: reviews.CATEGORIES,
    fiscalYear: fc.curYear,
    period: periodLabel(fc.curStart, fc.curEnd),
  };
}

module.exports = { searchVendors, getVendorDetail, addReview, getMeta };
