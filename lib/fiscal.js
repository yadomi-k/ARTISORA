// 会計年度の計算（例: 開始月=4 → 2026/4/1〜2027/3/31 が「2026年度」）
function fiscalStart(date, startMonth) {
  const y = date.getMonth() + 1 >= startMonth ? date.getFullYear() : date.getFullYear() - 1;
  return new Date(y, startMonth - 1, 1);
}
function fiscalYearOf(date, startMonth) {
  return fiscalStart(date, startMonth).getFullYear();
}
function addYears(d, n) {
  return new Date(d.getFullYear() + n, d.getMonth(), d.getDate());
}
function ymd(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function parseYmd(s) {
  const [y, m, d] = s.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d);
}
module.exports = { fiscalStart, fiscalYearOf, addYears, ymd, parseYmd };
