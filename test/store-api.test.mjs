import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { webcrypto } from 'node:crypto';
import { handleStoreApi } from '../store-api.js';

const origin = 'https://bhenoispodcast.com.br';
const database = new DatabaseSync(':memory:');
database.exec(readFileSync(new URL('../schema.sql', import.meta.url), 'utf8'));
const DB = {
  prepare(sql) {
    const statement = database.prepare(sql);
    const args = [];
    const wrapped = {
      bind(...values) { args.push(...values); return wrapped; },
      async first() { return statement.get(...args) || null; },
      async all() { return { results: statement.all(...args) }; },
      async run() { const result = statement.run(...args); return { meta: { changes: result.changes } }; },
    };
    return wrapped;
  },
  async batch(statements) { return Promise.all(statements.map((statement) => statement.run())); },
};
const env = {
  DB, ACCESS_TEAM_DOMAIN: 'example.cloudflareaccess.com', ACCESS_AUD: 'test-audience',
  ASAAS_MODE: 'production', ASAAS_API_KEY: '$aact_prod_test', ASAAS_WEBHOOK_TOKEN: 'a-very-long-webhook-token-for-testing',
};
const keys = await webcrypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
const jwk = await webcrypto.subtle.exportKey('jwk', keys.publicKey); jwk.kid = 'test-key';
const encode = (data) => Buffer.from(JSON.stringify(data)).toString('base64url');
const head = encode({ alg: 'RS256', kid: 'test-key' });
const body = encode({ iss: `https://${env.ACCESS_TEAM_DOMAIN}`, aud: [env.ACCESS_AUD], email: 'auglucas@gmail.com', exp: Math.floor(Date.now() / 1000) + 3600 });
const signature = await webcrypto.subtle.sign('RSASSA-PKCS1-v1_5', keys.privateKey, new TextEncoder().encode(`${head}.${body}`));
const adminToken = `${head}.${body}.${Buffer.from(signature).toString('base64url')}`;
const calls = [];
globalThis.fetch = async (url, options = {}) => {
  if (url.endsWith('/cdn-cgi/access/certs')) return Response.json({ keys: [jwk] });
  calls.push({ url, payload: JSON.parse(options.body) });
  if (url.endsWith('/customers')) return Response.json({ id: 'cus_test' });
  if (url.endsWith('/payments')) return Response.json({ id: 'pay_test', invoiceUrl: 'https://www.asaas.com/i/test' });
  throw new Error(`Unexpected URL ${url}`);
};

const invoke = (path, method = 'GET', payload, headers = {}) => {
  const request = new Request(`${origin}${path}`, {
    method,
    headers: { ...(method !== 'GET' ? { Origin: origin, 'Content-Type': 'application/json' } : {}), ...headers },
    ...(payload ? { body: JSON.stringify(payload) } : {}),
  });
  return handleStoreApi(request, env, new URL(request.url));
};

test('admin denied without a valid Access JWT', async () => {
  assert.equal((await invoke('/api/admin/products')).status, 401);
});

test('product, Asaas checkout, private order and webhook flow', async () => {
  const headers = { 'Cf-Access-Jwt-Assertion': adminToken };
  const imageData = `data:image/png;base64,${Buffer.from('small-image').toString('base64')}`;
  const saved = await (await invoke('/api/admin/products', 'POST', {
    name: 'Camiseta BH', description: 'Camiseta oficial', priceCents: 8000, stock: 2,
    active: true, deliveryType: 'pickup', shippingCents: 0, imageData,
  }, headers)).json();
  assert.match(saved.id, /^[a-f0-9-]{36}$/);
  const catalog = await (await invoke('/api/products')).json();
  assert.equal(catalog.products[0].priceCents, 8000);
  assert.equal(catalog.paymentsEnabled, true);
  assert.equal((await invoke(`/api/products/${saved.id}/image`)).status, 200);

  const checkout = await (await invoke('/api/checkout', 'POST', {
    productId: saved.id, paymentMethod: 'PIX', buyer: { name: 'Comprador Teste', email: 'teste@example.com', phone: '31999999999', cpfCnpj: '12345678909' },
  }, { 'CF-Connecting-IP': '203.0.113.10' })).json();
  assert.equal(checkout.checkoutUrl, 'https://www.asaas.com/i/test');
  assert.equal(calls.find((call) => call.url.endsWith('/payments')).payload.value, 80);
  assert.equal(calls.find((call) => call.url.endsWith('/payments')).payload.billingType, 'PIX');
  assert.equal((await invoke(`/api/orders/${checkout.orderId}`)).status, 403);
  const status = await (await invoke(`/api/orders/${checkout.orderId}?token=${checkout.viewToken}`)).json();
  assert.equal(status.status, 'PENDING');

  const event = { event: 'PAYMENT_CONFIRMED', payment: { id: 'pay_test', externalReference: checkout.orderId, value: 80 } };
  assert.equal((await invoke('/api/webhooks/asaas', 'POST', event)).status, 401);
  const webhookHeaders = { 'asaas-access-token': env.ASAAS_WEBHOOK_TOKEN };
  assert.equal((await invoke('/api/webhooks/asaas', 'POST', event, webhookHeaders)).status, 200);
  assert.equal((await invoke('/api/webhooks/asaas', 'POST', event, webhookHeaders)).status, 200);
  const updated = await (await invoke('/api/products')).json();
  assert.equal(updated.products[0].stock, 1);
  const orders = await (await invoke('/api/admin/orders', 'GET', undefined, headers)).json();
  assert.equal(orders.orders[0].status, 'CONFIRMED');
});
