const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const admin = require('firebase-admin');

function loadEnv(file) {
  const out = {};
  const txt = fs.readFileSync(file, 'utf8');
  for (const line of txt.split(/\r?\n/)) {
    if (!line || line.trim().startsWith('#')) continue;
    const i = line.indexOf('='); if (i < 0) continue;
    const k = line.slice(0, i).trim();
    const v = line.slice(i + 1).trim().replace(/^"|"$/g, '');
    out[k] = v;
  }
  return out;
}

function resolveSvc(env){
  if (env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    try { return JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_JSON); } catch {}
  }
  if (env.FIREBASE_SERVICE_ACCOUNT_PATH) {
    const p = path.isAbsolute(env.FIREBASE_SERVICE_ACCOUNT_PATH)
      ? env.FIREBASE_SERVICE_ACCOUNT_PATH
      : path.join(process.cwd(), env.FIREBASE_SERVICE_ACCOUNT_PATH);
    if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8'));
  }
  return null;
}

(async () => {
  const env = loadEnv('.env');
  const svc = resolveSvc(env);
  if (!svc) throw new Error('No firebase service account in .env');

  const conn = await mysql.createConnection({
    host: env.DB_HOST || '127.0.0.1',
    port: Number(env.DB_PORT || 3306),
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    database: env.DB_NAME,
  });

  const [rows] = await conn.query(
    `SELECT token FROM owner_push_tokens WHERE owner_id = ? AND active = 1 ORDER BY updated_at DESC LIMIT 20`,
    ['p1774713613397']
  );
  await conn.end();

  const tokens = rows.map(r => String(r.token || '').trim()).filter(Boolean);
  console.log('active_tokens', tokens.length);
  if (!tokens.length) return;

  const app = admin.apps.find(a => a.name === 'dwira-owner-test')
    || admin.initializeApp({ credential: admin.credential.cert(svc) }, 'dwira-owner-test');
  const messaging = app.messaging();

  for (const token of tokens) {
    const msg = {
      token,
      notification: { title: 'Test FCM Dwira', body: 'Test background owner p1774713613397' },
      data: {
        title: 'Test FCM Dwira',
        body: 'Test background owner p1774713613397',
        kind: 'reservation_availability_request',
        demandId: `test_${Date.now()}`,
        ownerId: 'p1774713613397',
        bienId: 'test_bien',
      },
      android: {
        priority: 'high',
        ttl: '86400s',
        notification: {
          channelId: 'owner_notifications',
          sound: 'default',
          priority: 'high',
          defaultSound: true,
        },
      },
      apns: {
        headers: { 'apns-priority': '10' },
        payload: { aps: { sound: 'availability_request.wav', badge: 1 } },
      },
    };
    try {
      const id = await messaging.send(msg);
      console.log('sent', token.slice(0, 20), id);
    } catch (e) {
      console.log('fail', token.slice(0, 20), e.code || e.message);
    }
  }
})();
