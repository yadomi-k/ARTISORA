// 環境変数から設定を読み込む（.env.example 参照）
const fs = require('fs');
const path = require('path');

// .env を簡易読み込み（依存パッケージを増やさないため）
const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const env = process.env;
const fieldName = (v, def) => {
  const s = (v || def).trim();
  if (!/^[A-Za-z0-9_.]+$/.test(s)) throw new Error(`項目名が不正です: ${s}`);
  return s;
};

const config = {
  port: Number(env.PORT || 3000),
  // SF_CLIENT_ID が未設定ならデモデータ（ログインなし）で動作
  useMock: !env.SF_CLIENT_ID || env.USE_MOCK === 'true',
  baseUrl: (env.APP_BASE_URL || `http://localhost:${env.PORT || 3000}`).replace(/\/$/, ''),
  sf: {
    loginUrl: (env.SF_LOGIN_URL || 'https://login.salesforce.com').replace(/\/$/, ''),
    clientId: env.SF_CLIENT_ID,
    clientSecret: env.SF_CLIENT_SECRET,
    apiVersion: env.SF_API_VERSION || '62.0',
    costField: fieldName(env.SF_COST_FIELD, 'FinalCost__c'),
    usageDateField: fieldName(env.SF_USAGE_DATE_FIELD, 'CreatedDate'),
    usageDateIsDatetime: (env.SF_USAGE_DATE_IS_DATETIME || 'true') === 'true',
    minStage: env.SF_MIN_STAGE || '請求',
  },
  tzOffset: env.TZ_OFFSET || '+09:00',
  // 会計年度の開始月（1 = 1月〜12月）
  fiscalStartMonth: Number(env.FISCAL_YEAR_START_MONTH || 1),
  yearsToShow: Number(env.YEARS_TO_SHOW || 5),
};

config.redirectUri = env.SF_REDIRECT_URI || `${config.baseUrl}/oauth/callback`;

module.exports = config;
