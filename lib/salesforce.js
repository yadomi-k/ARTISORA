// Salesforce REST API クライアント
// 各リクエストはログイン中ユーザーのトークン（conn）で実行するため、そのユーザーの権限・共有設定が適用されます。
const config = require('./config');
const auth = require('./auth');

const sf = config.sf;
let stageCache = null;
let familyCache = null;

const esc = (s) => String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
const escLike = (s) => esc(s).replace(/%/g, '\\%').replace(/_/g, '\\_');
const isId = (s) => /^[a-zA-Z0-9]{15,18}$/.test(s);
const unauthorized = () => Object.assign(new Error('ログインの有効期限が切れました。再度ログインしてください。'), { status: 401 });

async function request(conn, pathOrUrl, retry = true) {
  if (!conn || !conn.accessToken) throw unauthorized();
  const url = pathOrUrl.startsWith('http') ? pathOrUrl : conn.instanceUrl + pathOrUrl;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${conn.accessToken}` } });
  if (res.status === 401) {
    if (retry && (await auth.refresh(conn))) return request(conn, pathOrUrl, false);
    throw unauthorized();
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = Array.isArray(body) ? body.map((e) => e.message).join(' / ') : res.statusText;
    throw new Error(`Salesforce API エラー: ${msg}`);
  }
  return body;
}

async function query(conn, soql) {
  let body = await request(conn, `/services/data/v${sf.apiVersion}/query?q=${encodeURIComponent(soql)}`);
  const records = [...body.records];
  while (!body.done && body.nextRecordsUrl) {
    body = await request(conn, body.nextRecordsUrl);
    records.push(...body.records);
  }
  return records;
}

const readPath = (rec, p) => p.split('.').reduce((o, k) => (o == null ? null : o[k]), rec);

// 「請求」以降のステージ（並び順が請求以上、かつ失注以外）
async function eligibleStages(conn) {
  if (stageCache) return stageCache;
  const stages = await query(conn, 'SELECT ApiName, MasterLabel, SortOrder, IsClosed, IsWon FROM OpportunityStage WHERE IsActive = true ORDER BY SortOrder');
  const base = stages.find((s) => s.MasterLabel.includes(sf.minStage) || s.ApiName.includes(sf.minStage));
  if (!base) throw new Error(`商談ステージ「${sf.minStage}」が見つかりません。SF_MIN_STAGE を確認してください。`);
  stageCache = stages.filter((s) => s.SortOrder >= base.SortOrder && !(s.IsClosed && !s.IsWon)).map((s) => s.ApiName);
  return stageCache;
}

async function getFamilies(conn) {
  if (familyCache) return familyCache;
  const d = await request(conn, `/services/data/v${sf.apiVersion}/sobjects/Product2/describe`);
  const f = d.fields.find((x) => x.name === 'Family');
  familyCache = (f ? f.picklistValues : []).filter((v) => v.active).map((v) => ({ value: v.value, label: v.label }));
  return familyCache;
}

const mapProduct = (conn, p) => ({
  id: p.Id, name: p.Name, productCode: p.ProductCode, family: p.Family, isActive: p.IsActive, description: p.Description,
  url: `${conn.instanceUrl}/lightning/r/Product2/${p.Id}/view`,
});

async function listVendors(conn, { keyword, family, activeOnly }) {
  const where = [];
  if (keyword) where.push(`(Name LIKE '%${escLike(keyword)}%' OR ProductCode LIKE '%${escLike(keyword)}%')`);
  if (family) where.push(`Family = '${esc(family)}'`);
  if (activeOnly) where.push('IsActive = true');
  const soql = `SELECT Id, Name, ProductCode, Family, IsActive, Description FROM Product2${where.length ? ' WHERE ' + where.join(' AND ') : ''} ORDER BY Name LIMIT 200`;
  return (await query(conn, soql)).map((p) => mapProduct(conn, p));
}

async function getVendor(conn, id) {
  if (!isId(id)) return null;
  const [p] = await query(conn, `SELECT Id, Name, ProductCode, Family, IsActive, Description FROM Product2 WHERE Id = '${id}'`);
  return p ? mapProduct(conn, p) : null;
}

const dateLiteral = (ymd) => (sf.usageDateIsDatetime ? `${ymd}T00:00:00${config.tzOffset}` : ymd);

// 利用日（日時なら日本時間の日付に変換）
function toLocalYmd(v) {
  if (!v) return null;
  if (!sf.usageDateIsDatetime) return String(v).slice(0, 10);
  const [, sign, hh, mm] = config.tzOffset.match(/([+-])(\d{2}):(\d{2})/);
  const offsetMs = (sign === '-' ? -1 : 1) * (Number(hh) * 60 + Number(mm)) * 60000;
  return new Date(new Date(v).getTime() + offsetMs).toISOString().slice(0, 10);
}

// 商談商品（OpportunityLineItem）を発注先ごとの実績として取得
async function getUsageLines(conn, vendorIds, fromYmd, toYmd) {
  const ids = vendorIds.filter(isId);
  if (!ids.length) return [];
  const stageIn = (await eligibleStages(conn)).map((s) => `'${esc(s)}'`).join(',');
  const out = [];
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100).map((x) => `'${x}'`).join(',');
    const soql =
      `SELECT Id, Product2Id, OpportunityId, Opportunity.Name, Opportunity.Account.Name, Opportunity.StageName, ` +
      `Opportunity.Owner.Name, Quantity, ${sf.usageDateField}, ${sf.costField} ` +
      `FROM OpportunityLineItem WHERE Product2Id IN (${chunk}) ` +
      `AND ${sf.usageDateField} >= ${dateLiteral(fromYmd)} AND ${sf.usageDateField} < ${dateLiteral(toYmd)} ` +
      `AND Opportunity.StageName IN (${stageIn}) ORDER BY ${sf.usageDateField} DESC`;
    for (const r of await query(conn, soql)) {
      out.push({
        lineId: r.Id,
        vendorId: r.Product2Id,
        opportunityId: r.OpportunityId,
        opportunityName: readPath(r, 'Opportunity.Name'),
        accountName: readPath(r, 'Opportunity.Account.Name'),
        stage: readPath(r, 'Opportunity.StageName'),
        owner: readPath(r, 'Opportunity.Owner.Name'),
        quantity: r.Quantity,
        usageDate: toLocalYmd(readPath(r, sf.usageDateField)),
        cost: Number(readPath(r, sf.costField) || 0),
        url: `${conn.instanceUrl}/lightning/r/Opportunity/${r.OpportunityId}/view`,
      });
    }
  }
  return out;
}

module.exports = { name: 'salesforce', listVendors, getVendor, getUsageLines, getFamilies };
