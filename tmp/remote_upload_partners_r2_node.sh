set -e
APP=/var/www/dwiraimmobilier.com/public
cat > /tmp/upload_partners_r2.mjs <<'JS'
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import https from 'https';

const envRaw = fs.readFileSync('/var/www/dwiraimmobilier.com/public/.env', 'utf8');
const env = {};
for (const line of envRaw.split(/\r?\n/)) {
  if (!line || line.trim().startsWith('#') || !line.includes('=')) continue;
  const i = line.indexOf('=');
  const k = line.slice(0, i).trim();
  let v = line.slice(i + 1).trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  env[k] = v;
}

const accountId = env.R2_ACCOUNT_ID;
const bucket = env.R2_BUCKET_NAME;
const accessKeyId = env.R2_ACCESS_KEY_ID;
const secretAccessKey = env.R2_SECRET_ACCESS_KEY;
const publicBase = (env.R2_PUBLIC_BASE_URL || '').replace(/\/+$/, '');

if (!accountId || !bucket || !accessKeyId || !secretAccessKey || !publicBase) {
  throw new Error('Missing R2 env vars');
}

const endpointHost = `${accountId}.r2.cloudflarestorage.com`;
const localDir = '/var/www/dwiraimmobilier.com/public/public/partners';
const files = fs.readdirSync(localDir).filter((f) => f.toLowerCase().endsWith('.png'));

function hmac(key, data) { return crypto.createHmac('sha256', key).update(data).digest(); }
function sha256Hex(data) { return crypto.createHash('sha256').update(data).digest('hex'); }

function requestPromise(opts, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(opts, (res) => {
      const chunks = [];
      res.on('data', (d) => chunks.push(d));
      res.on('end', () => resolve({ statusCode: res.statusCode || 0, body: Buffer.concat(chunks).toString('utf8') }));
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function putObject(key, body) {
  const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);
  const region = 'auto';
  const service = 's3';
  const method = 'PUT';
  const canonicalUri = `/${bucket}/${encodeURI(key).replace(/%2F/g, '/')}`;
  const canonicalQueryString = '';
  const payloadHash = sha256Hex(body);
  const canonicalHeaders = `host:${endpointHost}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`;
  const signedHeaders = 'host;x-amz-content-sha256;x-amz-date';
  const canonicalRequest = [method, canonicalUri, canonicalQueryString, canonicalHeaders, signedHeaders, payloadHash].join('\n');

  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = `AWS4-HMAC-SHA256\n${amzDate}\n${credentialScope}\n${sha256Hex(canonicalRequest)}`;

  const kDate = hmac(`AWS4${secretAccessKey}`, dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, service);
  const kSigning = hmac(kService, 'aws4_request');
  const signature = crypto.createHmac('sha256', kSigning).update(stringToSign).digest('hex');

  const authorization = `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const res = await requestPromise({
    host: endpointHost,
    method,
    path: canonicalUri,
    headers: {
      Host: endpointHost,
      'x-amz-content-sha256': payloadHash,
      'x-amz-date': amzDate,
      Authorization: authorization,
      'Content-Type': 'image/png',
      'Content-Length': body.length,
    },
  }, body);

  if (res.statusCode < 200 || res.statusCode >= 300) {
    throw new Error(`Upload failed for ${key}: HTTP ${res.statusCode} ${res.body}`);
  }
}

for (const file of files) {
  const body = fs.readFileSync(path.join(localDir, file));
  await putObject(`partners/${file}`, body);
  console.log(`uploaded: ${file}`);
}

for (const file of files) {
  const res = await fetch(`${publicBase}/partners/${file}`, { method: 'GET' });
  console.log(`${file} -> HTTP ${res.status}`);
  if (res.status !== 200) throw new Error(`Public check failed for ${file}`);
}

console.log('All partner logos uploaded and reachable on R2 public URL');
JS

node /tmp/upload_partners_r2.mjs
