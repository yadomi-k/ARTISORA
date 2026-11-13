// 口コミの保存先（Salesforce には保存場所が無いため、アプリ側の SQLite に保存）
const path = require('path');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');

const dbPath = process.env.REVIEW_DB_PATH || path.join(__dirname, '..', 'data', 'reviews.db');
fs.mkdirSync(path.dirname(dbPath), { recursive: true });
const db = new DatabaseSync(dbPath);
db.exec(`
  CREATE TABLE IF NOT EXISTS reviews (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    vendor_id      TEXT    NOT NULL,          -- Salesforce 商品(Product2) Id
    rating         INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
    category       TEXT,
    comment        TEXT    NOT NULL,
    author         TEXT    NOT NULL,          -- 投稿者（Salesforce ユーザー名）
    author_id      TEXT,                      -- 投稿者の Salesforce ユーザー Id
    opportunity_id TEXT,                      -- 関連商談（任意）
    opportunity_name TEXT,
    created_at     TEXT    NOT NULL DEFAULT (datetime('now', 'localtime'))
  );
  CREATE INDEX IF NOT EXISTS idx_reviews_vendor ON reviews(vendor_id);
`);

const CATEGORIES = ['品質', '納期', '価格', '対応', 'その他'];

function listByVendor(vendorId) {
  return db.prepare(
    `SELECT id, vendor_id AS vendorId, rating, category, comment, author,
            opportunity_id AS opportunityId, opportunity_name AS opportunityName, created_at AS createdAt
       FROM reviews WHERE vendor_id = ? ORDER BY created_at DESC, id DESC`
  ).all(vendorId);
}

function statsFor(vendorIds) {
  const map = new Map();
  if (!vendorIds.length) return map;
  const rows = db.prepare(
    `SELECT vendor_id AS vendorId, AVG(rating) AS avg, COUNT(*) AS cnt
       FROM reviews WHERE vendor_id IN (${vendorIds.map(() => '?').join(',')}) GROUP BY vendor_id`
  ).all(...vendorIds);
  for (const r of rows) map.set(r.vendorId, { avg: r.avg, count: r.cnt });
  return map;
}

function create({ vendorId, rating, category, comment, author, authorId, opportunityId, opportunityName }) {
  const info = db.prepare(
    `INSERT INTO reviews (vendor_id, rating, category, comment, author, author_id, opportunity_id, opportunity_name)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(vendorId, rating, category || null, comment, author, authorId || null, opportunityId || null, opportunityName || null);
  return Number(info.lastInsertRowid);
}

module.exports = { listByVendor, statsFor, create, CATEGORIES };
