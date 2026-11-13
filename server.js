const express = require('express');
const path = require('path');
const config = require('./lib/config');
const auth = require('./lib/auth');
const service = require('./lib/service');

const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(express.json({ limit: '50kb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ---- Salesforce ログイン ----
app.get('/auth/login', auth.login);
app.get('/oauth/callback', auth.callback);
app.post('/auth/logout', auth.logout);

// ---- API（ログイン必須） ----
const wrap = (fn) => (req, res) => fn(req, res).catch((e) => {
  if (e.status !== 401) console.error(e);
  res.status(e.status || 500).json({ error: e.message || 'エラーが発生しました。', login: e.status === 401 || undefined });
});
// 他サイトからの書き込みを防ぐ（JSON 以外の POST を拒否）
const jsonOnly = (req, res, next) => (req.is('application/json') ? next() : res.status(415).json({ error: '不正なリクエストです。' }));

app.use('/api', auth.requireLogin);

app.get('/api/meta', wrap(async (req, res) => res.json(await service.getMeta(req.ctx))));

app.get('/api/vendors', wrap(async (req, res) => {
  const { keyword, family, activeOnly, minRating } = req.query;
  res.json(await service.searchVendors(req.ctx, { keyword, family, activeOnly: activeOnly === 'true', minRating }));
}));

app.get('/api/vendors/:id', wrap(async (req, res) => {
  const d = await service.getVendorDetail(req.ctx, req.params.id);
  if (!d) return res.status(404).json({ error: '発注先が見つかりません。' });
  res.json(d);
}));

app.post('/api/vendors/:id/reviews', jsonOnly, wrap(async (req, res) => {
  const id = await service.addReview(req.ctx, req.params.id, req.body || {});
  res.status(201).json({ id });
}));

app.listen(config.port, () => {
  console.log(`業者検索アプリ: ${config.baseUrl}  (データ: ${config.useMock ? 'デモ（ログインなし）' : 'Salesforce'})`);
  if (!config.useMock) console.log(`コールバック URL: ${config.redirectUri}`);
});
