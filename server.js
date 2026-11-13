const express = require('express');
const path = require('path');
const config = require('./lib/config');
const service = require('./lib/service');

const app = express();
app.use(express.json({ limit: '50kb' }));
app.use(express.static(path.join(__dirname, 'public')));

const wrap = (fn) => (req, res) => fn(req, res).catch((e) => {
  console.error(e);
  res.status(e.status || 500).json({ error: e.message || 'エラーが発生しました。' });
});

app.get('/api/meta', wrap(async (req, res) => res.json(await service.getMeta())));

app.get('/api/vendors', wrap(async (req, res) => {
  const { keyword, family, activeOnly, minRating } = req.query;
  res.json(await service.searchVendors({ keyword, family, activeOnly: activeOnly === 'true', minRating }));
}));

app.get('/api/vendors/:id', wrap(async (req, res) => {
  const d = await service.getVendorDetail(req.params.id);
  if (!d) return res.status(404).json({ error: '発注先が見つかりません。' });
  res.json(d);
}));

app.post('/api/vendors/:id/reviews', wrap(async (req, res) => {
  const id = await service.addReview(req.params.id, req.body || {});
  res.status(201).json({ id });
}));

app.listen(config.port, () => {
  console.log(`業者検索アプリ: http://localhost:${config.port}  (データ: ${config.useMock ? 'デモ' : 'Salesforce'})`);
});
