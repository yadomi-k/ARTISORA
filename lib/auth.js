// Salesforce ログイン（OAuth 2.0 Web サーバーフロー + PKCE）とセッション管理
const crypto = require('crypto');
const config = require('./config');

const sf = config.sf;
const COOKIE = 'vs_sid';
const IDLE_MS = 8 * 60 * 60 * 1000; // 8時間操作が無ければログアウト
const sessions = new Map(); // sid -> { conn, user, oauth, lastSeen }

const b64url = (buf) => buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const newId = () => b64url(crypto.randomBytes(32));

function parseCookies(req) {
  const out = {};
  for (const part of (req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function setCookie(res, sid) {
  const secure = config.baseUrl.startsWith('https://') ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${COOKIE}=${sid}; Path=/; HttpOnly; SameSite=Lax${secure}`);
}
function clearCookie(res) {
  res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}

function getSession(req) {
  const sid = parseCookies(req)[COOKIE];
  const s = sid && sessions.get(sid);
  if (!s) return null;
  if (Date.now() - s.lastSeen > IDLE_MS) { sessions.delete(sid); return null; }
  s.lastSeen = Date.now();
  return { sid, ...s, _ref: s };
}

// 古いセッションの掃除
setInterval(() => {
  const now = Date.now();
  for (const [sid, s] of sessions) if (now - s.lastSeen > IDLE_MS) sessions.delete(sid);
}, 30 * 60 * 1000).unref();

async function tokenRequest(params) {
  if (sf.clientSecret) params.client_secret = sf.clientSecret;
  const res = await fetch(`${sf.loginUrl}/services/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: sf.clientId, ...params }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error_description || body.error || `HTTP ${res.status}`);
  return body;
}

// アクセストークンの期限切れ時にリフレッシュトークンで更新
async function refresh(conn) {
  if (!conn.refreshToken) return false;
  try {
    const t = await tokenRequest({ grant_type: 'refresh_token', refresh_token: conn.refreshToken });
    conn.accessToken = t.access_token;
    if (t.instance_url) conn.instanceUrl = t.instance_url;
    return true;
  } catch (e) {
    console.warn('トークン更新に失敗:', e.message);
    return false;
  }
}

function login(req, res) {
  const state = newId();
  const verifier = b64url(crypto.randomBytes(48));
  const challenge = b64url(crypto.createHash('sha256').update(verifier).digest());
  const sid = newId();
  sessions.set(sid, { oauth: { state, verifier }, lastSeen: Date.now() });
  setCookie(res, sid);
  const q = new URLSearchParams({
    response_type: 'code', client_id: sf.clientId, redirect_uri: config.redirectUri,
    scope: 'api refresh_token id', state, code_challenge: challenge, code_challenge_method: 'S256', prompt: 'login',
  });
  res.redirect(`${sf.loginUrl}/services/oauth2/authorize?${q}`);
}

async function callback(req, res) {
  const s = getSession(req);
  const { code, state, error, error_description: desc } = req.query;
  const fail = (msg) => res.redirect('/?loginError=' + encodeURIComponent(msg));
  if (error) return fail(desc || error);
  if (!s || !s.oauth || !state || state !== s.oauth.state || !code) return fail('ログイン処理が無効です。もう一度お試しください。');
  try {
    const t = await tokenRequest({ grant_type: 'authorization_code', code, redirect_uri: config.redirectUri, code_verifier: s.oauth.verifier });
    const conn = { accessToken: t.access_token, refreshToken: t.refresh_token, instanceUrl: t.instance_url };
    const ui = await fetch(`${conn.instanceUrl}/services/oauth2/userinfo`, { headers: { Authorization: `Bearer ${conn.accessToken}` } });
    const info = await ui.json().catch(() => ({}));
    if (!ui.ok) throw new Error('ユーザー情報を取得できませんでした。');
    // セッション固定化対策として ID を振り直す
    sessions.delete(s.sid);
    const sid = newId();
    sessions.set(sid, { conn, user: { id: info.user_id, name: info.name, email: info.email }, lastSeen: Date.now() });
    setCookie(res, sid);
    res.redirect('/');
  } catch (e) {
    console.error('ログイン失敗:', e.message);
    fail('Salesforce へのログインに失敗しました: ' + e.message);
  }
}

async function logout(req, res) {
  const s = getSession(req);
  if (s) {
    sessions.delete(s.sid);
    const token = s.conn && (s.conn.refreshToken || s.conn.accessToken);
    if (token) {
      fetch(`${sf.loginUrl}/services/oauth2/revoke`, {
        method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ token }),
      }).catch(() => {});
    }
  }
  clearCookie(res);
  res.redirect('/');
}

// API 用: ログイン必須。req.ctx = { conn, user }
function requireLogin(req, res, next) {
  if (config.useMock) { req.ctx = { conn: null, user: { id: 'demo', name: 'デモユーザー' } }; return next(); }
  const s = getSession(req);
  if (!s || !s.conn) return res.status(401).json({ error: 'ログインしてください。', login: true });
  req.ctx = { conn: s._ref.conn, user: s.user };
  next();
}

module.exports = { login, callback, logout, requireLogin, refresh };
