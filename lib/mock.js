// Salesforce 未接続時のデモデータ（画面確認用）
const { ymd, addYears } = require('./fiscal');

let seed = 20261113;
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const pick = (a) => a[Math.floor(rand() * a.length)];

const vendors = [
  ['V-0001', '東都印刷株式会社', '印刷', true, 9],
  ['V-0002', '株式会社サンライズ内装', '内装施工', true, 6],
  ['V-0003', '有限会社ミナト木工', '什器製作', true, 5],
  ['V-0004', '関東アートロジスティクス株式会社', '運送・設営', true, 8],
  ['V-0005', 'スタジオ・ルミエール', '映像制作', true, 3],
  ['V-0006', '株式会社グラフィカ', 'デザイン', true, 7],
  ['V-0007', '北斗サイン工業株式会社', '印刷', true, 4],
  ['V-0008', '株式会社アクリルワークス', '什器製作', true, 0], // 今期の利用なし
  ['V-0009', '光彩照明株式会社', '内装施工', false, 0],
  ['V-0010', '株式会社みらい展装', '運送・設営', true, 5],
].map(([code, name, family, isActive, intensity], i) => ({
  id: `01tMOCK00000000${String(i + 1).padStart(3, '0')}`, name, productCode: code, family, isActive, intensity,
  description: `${family}の協力会社`, url: null,
}));

const accounts = ['青葉美術館', '港区文化センター', '株式会社ノース商事', '県立歴史博物館', 'みなとギャラリー', '株式会社イースト不動産'];
const projects = ['企画展 設営', '常設展 リニューアル', '巡回展 搬入出', 'ショールーム 改装', '周年記念イベント', '展示パネル製作'];
const owners = ['山田', '佐藤', '鈴木', '高橋'];
const stages = ['請求', '入金待ち', '完了'];

const lines = [];
const today = new Date();
let oppNo = 1;
for (const v of vendors) {
  for (let back = 0; back < 5 * 365; back += 1) {
    // 古い年ほど少し少なく、今期分は intensity で調整
    const rate = (v.intensity || (back > 230 ? 3 : 0)) / 365;
    if (rand() > rate) continue;
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - back);
    const oppId = `006MOCK0000${String(oppNo++).padStart(5, '0')}`;
    const n = rand() < 0.2 ? 2 : 1;
    const acc = pick(accounts), proj = pick(projects), stage = pick(stages), owner = pick(owners);
    for (let k = 0; k < n; k++) {
      lines.push({
        lineId: `00kMOCK${oppId.slice(-8)}${k}`, vendorId: v.id, opportunityId: oppId,
        opportunityName: `${acc} ${proj}`, accountName: acc,
        stage, owner, quantity: 1 + Math.floor(rand() * 3),
        usageDate: ymd(d), cost: Math.round((50 + rand() * 950) * 1000), url: null,
      });
    }
  }
}
lines.sort((a, b) => (a.usageDate < b.usageDate ? 1 : -1));

const strip = ({ intensity, ...v }) => v;

module.exports = {
  name: 'mock',
  async listVendors(conn, { keyword, family, activeOnly }) {
    const kw = (keyword || '').toLowerCase();
    return vendors
      .filter((v) => !kw || v.name.toLowerCase().includes(kw) || v.productCode.toLowerCase().includes(kw))
      .filter((v) => !family || v.family === family)
      .filter((v) => !activeOnly || v.isActive)
      .map(strip);
  },
  async getVendor(conn, id) { const v = vendors.find((x) => x.id === id); return v ? strip(v) : null; },
  async getUsageLines(conn, ids, fromYmd, toYmd) {
    const set = new Set(ids);
    return lines.filter((l) => set.has(l.vendorId) && l.usageDate >= fromYmd && l.usageDate < toYmd);
  },
  async getFamilies(conn) { return [...new Set(vendors.map((v) => v.family))].map((f) => ({ value: f, label: f })); },
  _addYears: addYears,
};
