#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const baseUrl = String(process.env.CLICKTOPAY_API_BASE_URL || '').trim().replace(/\/+$/, '');
const userName = String(process.env.CLICKTOPAY_USERNAME || '').trim();
const password = String(process.env.CLICKTOPAY_PASSWORD || '').trim();
const currency = String(process.env.CLICKTOPAY_CURRENCY || '788').trim();
const language = String(process.env.CLICKTOPAY_LANGUAGE || 'fr').trim();
const pageView = String(process.env.CLICKTOPAY_PAGE_VIEW || 'DESKTOP').trim().toUpperCase() || 'DESKTOP';

function normalizeClickToPayCheckoutUrl(rawUrl) {
  const value = String(rawUrl || '').trim();
  if (!value) return '';
  try {
    const target = new URL(value);
    target.pathname = target.pathname
      .replace(/^\/epg\/merchants\//i, '/payment/merchants/')
      .replace(/\/mobile_payment\.html$/i, '/payment.html');
    return target.toString();
  } catch {
    return value
      .replace('/epg/merchants/', '/payment/merchants/')
      .replace('/mobile_payment.html', '/payment.html');
  }
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

if (!baseUrl || !userName || !password) {
  fail('Missing ClickToPay env vars in .env: CLICKTOPAY_API_BASE_URL, CLICKTOPAY_USERNAME, CLICKTOPAY_PASSWORD');
}

const args = process.argv.slice(2);
const command = (args[0] || '').trim().toLowerCase();
const flags = new Map();

for (let i = 1; i < args.length; i += 1) {
  const current = args[i];
  if (!current.startsWith('--')) continue;
  const key = current.slice(2);
  const next = args[i + 1];
  if (!next || next.startsWith('--')) {
    flags.set(key, 'true');
  } else {
    flags.set(key, next);
    i += 1;
  }
}

function usage() {
  console.log(`
Usage:
  node scripts/clicktopay-manual-test.cjs ctp01 [--amount 10000] [--returnUrl https://example.com/success] [--failUrl https://example.com/fail] [--insecure]
  node scripts/clicktopay-manual-test.cjs ctp06 [--returnUrl ...] [--failUrl ...] [--insecure]
  node scripts/clicktopay-manual-test.cjs ctp07 [--orderNumber ORDER-DUP-TEST] [--insecure]
  node scripts/clicktopay-manual-test.cjs ctp08 [--orderId 00000000-0000-0000-0000-000000000000] [--insecure]
  node scripts/clicktopay-manual-test.cjs status --orderId <uuid> [--insecure]
  node scripts/clicktopay-manual-test.cjs register --orderNumber <text> --amount 10000 [--returnUrl ...] [--failUrl ...] [--insecure]

Notes:
  --insecure disables TLS certificate verification for sandbox testing only.
  Default returnUrl: https://example.com/success
  Default failUrl:   https://example.com/fail
`);
}

if (!command || command === 'help' || command === '--help' || command === '-h') {
  usage();
  process.exit(0);
}

function nowSuffix() {
  return Date.now().toString();
}

function getFlag(name, fallback = '') {
  return flags.has(name) ? String(flags.get(name) || '').trim() : fallback;
}

function hasFlag(name) {
  return flags.has(name);
}

if (hasFlag('insecure')) {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
}

async function postForm(endpoint, payload) {
  const body = new URLSearchParams(payload);
  const response = await fetch(`${baseUrl}/${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const text = await response.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return { status: response.status, text, json };
}

function output(result, extra = {}) {
  const payload = {
    httpStatus: result.status,
    ...extra,
    response: result.json ?? result.text,
  };
  console.log(JSON.stringify(payload, null, 2));
}

async function registerOrder(overrides = {}) {
  const orderNumber = overrides.orderNumber || getFlag('orderNumber', `ORDER-${nowSuffix()}`);
  const amount = overrides.amount || getFlag('amount', '10000');
  const returnUrl = overrides.returnUrl || getFlag('returnUrl', 'https://example.com/success');
  const failUrl = overrides.failUrl || getFlag('failUrl', 'https://example.com/fail');
  const description = overrides.description || getFlag('description', 'DWIRA IMMOBILIER - Manual ClickToPay test');

  const result = await postForm('register.do', {
    userName,
    password,
    orderNumber,
    amount,
    currency,
    returnUrl,
    failUrl,
    description,
    language,
    pageView,
  });

  if (result.json && typeof result.json === 'object' && result.json.formUrl) {
    result.json.formUrl = normalizeClickToPayCheckoutUrl(result.json.formUrl);
  }
  output(result, { orderNumber, amount, returnUrl, failUrl });
}

async function getStatus(orderIdOverride = '') {
  const orderId = orderIdOverride || getFlag('orderId');
  const orderNumber = getFlag('orderNumber');
  if (!orderId && !orderNumber) fail('Provide --orderId or --orderNumber for status');

  const payload = { userName, password };
  if (orderId) payload.orderId = orderId;
  if (orderNumber) payload.orderNumber = orderNumber;

  const result = await postForm('getOrderStatusExtended.do', payload);
  output(result, { orderId: orderId || undefined, orderNumber: orderNumber || undefined });
}

async function ctp06() {
  const orderNumber = getFlag('orderNumber', `ORDER-NO-AMOUNT-${nowSuffix()}`);
  const returnUrl = getFlag('returnUrl', 'https://example.com/success');
  const failUrl = getFlag('failUrl', 'https://example.com/fail');
  const result = await postForm('register.do', {
    userName,
    password,
    orderNumber,
    currency,
    returnUrl,
    failUrl,
    description: 'Missing amount test',
    language,
    pageView,
  });
  output(result, { orderNumber, missingField: 'amount', returnUrl, failUrl });
}

async function ctp07() {
  const orderNumber = getFlag('orderNumber', `ORDER-DUP-TEST-${nowSuffix()}`);
  const common = {
    userName,
    password,
    orderNumber,
    amount: getFlag('amount', '10000'),
    currency,
    returnUrl: getFlag('returnUrl', 'https://example.com/success'),
    failUrl: getFlag('failUrl', 'https://example.com/fail'),
    description: 'Duplicate order number test',
    language,
    pageView,
  };
  const first = await postForm('register.do', common);
  const second = await postForm('register.do', common);
  if (first.json && typeof first.json === 'object' && first.json.formUrl) {
    first.json.formUrl = normalizeClickToPayCheckoutUrl(first.json.formUrl);
  }
  if (second.json && typeof second.json === 'object' && second.json.formUrl) {
    second.json.formUrl = normalizeClickToPayCheckoutUrl(second.json.formUrl);
  }
  console.log(JSON.stringify({
    orderNumber,
    first: {
      httpStatus: first.status,
      response: first.json ?? first.text,
    },
    second: {
      httpStatus: second.status,
      response: second.json ?? second.text,
    },
  }, null, 2));
}

async function ctp08() {
  const orderId = getFlag('orderId', '00000000-0000-0000-0000-000000000000');
  await getStatus(orderId);
}

async function main() {
  switch (command) {
    case 'ctp01':
      await registerOrder({ description: 'DWIRA IMMOBILIER - CTP-01 valid order registration' });
      return;
    case 'ctp06':
      await ctp06();
      return;
    case 'ctp07':
      await ctp07();
      return;
    case 'ctp08':
      await ctp08();
      return;
    case 'status':
      await getStatus();
      return;
    case 'register':
      await registerOrder();
      return;
    default:
      usage();
      fail(`Unknown command: ${command}`);
  }
}

main().catch((error) => {
  const detail = error?.cause ? `${error.cause.code || ''} ${error.cause.message || ''}`.trim() : '';
  console.error(detail ? `${error.message}\n${detail}` : error.message);
  process.exit(1);
});
