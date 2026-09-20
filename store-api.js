const SITE = 'https://bhenoispodcast.com.br';
const ADMINS = new Set(['podcastbhenois@gmail.com', 'auglucas@gmail.com', 'reginaldosilvaproduc@gmail.com']);
let cachedKeys = { until: 0, keys: [] };
const respond = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
const error = (message, status = 400) => respond({ error: message }, status);
const bytes = (base64) => Uint8Array.from(atob(base64.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

async function adminEmail(request, env) {
  const token = request.headers.get('Cf-Access-Jwt-Assertion') || request.headers.get('Cookie')?.match(/(?:^|;\s*)CF_Authorization=([^;]+)/)?.[1];
  if (!token || !env.ACCESS_AUD || !env.ACCESS_TEAM_DOMAIN) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const head = JSON.parse(new TextDecoder().decode(bytes(parts[0])));
    const data = JSON.parse(new TextDecoder().decode(bytes(parts[1])));
    const now = Math.floor(Date.now() / 1000);
    if (head.alg !== 'RS256' || data.iss !== `https://${env.ACCESS_TEAM_DOMAIN}` || ![].concat(data.aud || []).includes(env.ACCESS_AUD) || data.exp <= now || data.nbf > now) return null;
    if (cachedKeys.until < Date.now()) {
      const response = await fetch(`https://${env.ACCESS_TEAM_DOMAIN}/cdn-cgi/access/certs`);
      if (!response.ok) return null;
      cachedKeys = { keys: (await response.json()).keys || [], until: Date.now() + 300_000 };
    }
    const jwk = cachedKeys.keys.find((key) => key.kid === head.kid);
    if (!jwk) return null;
    const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    const valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, bytes(parts[2]), new TextEncoder().encode(`${parts[0]}.${parts[1]}`));
    const email = String(data.email || '').toLowerCase();
    return valid && ADMINS.has(email) ? email : null;
  } catch { return null; }
}

function isProduction(env) {
  return env.ASAAS_MODE === 'production' && String(env.ASAAS_API_KEY || '').startsWith('$aact_prod_');
}

function product(row) {
  return {
    id: row.id, name: row.name, description: row.description, priceCents: row.price_cents,
    stock: row.stock, active: !!row.active, deliveryType: row.delivery_type,
    shippingCents: row.shipping_cents,
    imageUrl: row.has_image ? `/api/products/${row.id}/image?v=${encodeURIComponent(row.updated_at)}` : '',
  };
}

async function products(env, admin) {
  const condition = admin ? '' : 'WHERE p.active=1 AND p.stock>0';
  const { results } = await env.DB.prepare(`SELECT p.*, CASE WHEN i.product_id IS NULL THEN 0 ELSE 1 END AS has_image FROM products p LEFT JOIN product_images i ON i.product_id=p.id ${condition} ORDER BY p.created_at DESC`).all();
  return respond({ products: (results || []).map(product), paymentsEnabled: isProduction(env) });
}

async function saveProduct(request, env) {
  const value = await request.json();
  const id = value.id && /^[a-f0-9-]{36}$/.test(value.id) ? value.id : crypto.randomUUID();
  const name = String(value.name || '').trim();
  const description = String(value.description || '').trim();
  const price = Number(value.priceCents);
  const stock = Number(value.stock);
  const delivery = value.deliveryType === 'shipping' ? 'shipping' : 'pickup';
  const shipping = delivery === 'shipping' ? Number(value.shippingCents) : 0;
  if (!name || name.length > 70 || !description || description.length > 500 || !Number.isSafeInteger(price) || price < 100 || price > 10_000_000 || !Number.isSafeInteger(stock) || stock < 0 || stock > 100_000 || !Number.isSafeInteger(shipping) || shipping < 0 || shipping > 1_000_000) return error('Revise os dados do produto.');
  const match = value.imageData ? /^data:(image\/(?:jpeg|png|webp));base64,([a-zA-Z0-9+/=]+)$/.exec(value.imageData) : null;
  if (value.imageData && (!match || match[2].length > 700_000)) return error('A foto deve ter até 500 KB.');
  await env.DB.prepare(`INSERT INTO products(id,name,description,price_cents,stock,active,delivery_type,shipping_cents) VALUES(?,?,?,?,?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET name=excluded.name,description=excluded.description,price_cents=excluded.price_cents,stock=excluded.stock,
    active=excluded.active,delivery_type=excluded.delivery_type,shipping_cents=excluded.shipping_cents,updated_at=CURRENT_TIMESTAMP`)
    .bind(id, name, description, price, stock, Number(!!value.active), delivery, shipping).run();
  if (match) await env.DB.prepare('INSERT INTO product_images(product_id,mime,data_base64) VALUES(?,?,?) ON CONFLICT(product_id) DO UPDATE SET mime=excluded.mime,data_base64=excluded.data_base64')
    .bind(id, match[1], match[2]).run();
  if (value.removeImage) await env.DB.prepare('DELETE FROM product_images WHERE product_id=?').bind(id).run();
  return respond({ id });
}

async function image(env, id) {
  const row = await env.DB.prepare('SELECT mime,data_base64 FROM product_images WHERE product_id=?').bind(id).first();
  if (!row) return new Response('Imagem não encontrada', { status: 404 });
  return new Response(bytes(row.data_base64), { headers: { 'Content-Type': row.mime, 'Cache-Control': 'public, max-age=300', 'X-Content-Type-Options': 'nosniff' } });
}

async function hash(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function callAsaas(env, route, body) {
  const response = await fetch(`https://api.asaas.com/v3${route}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'User-Agent': 'BHENoisPodcast/1.0', access_token: env.ASAAS_API_KEY }, body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`Asaas HTTP ${response.status}`);
  return data;
}

async function checkout(request, env) {
  if (!isProduction(env)) return error('O pagamento ainda não está disponível.', 503);
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  await env.DB.prepare("DELETE FROM checkout_attempts WHERE created_at<datetime('now','-7 days')").run();
  const attempts = await env.DB.prepare("SELECT COUNT(*) AS total FROM checkout_attempts WHERE ip=? AND created_at>datetime('now','-1 hour')").bind(ip).first();
  if (Number(attempts?.total || 0) >= 5) return error('Muitas tentativas. Tente novamente mais tarde.', 429);
  await env.DB.prepare('INSERT INTO checkout_attempts(ip) VALUES(?)').bind(ip).run();
  const input = await request.json();
  const buyer = input.buyer || {};
  const name = String(buyer.name || '').trim();
  const email = String(buyer.email || '').trim().toLowerCase();
  const phone = String(buyer.phone || '').replace(/\D/g, '');
  const cpfCnpj = String(buyer.cpfCnpj || '').replace(/\D/g, '');
  const method = input.paymentMethod;
  if (!['PIX', 'CREDIT_CARD'].includes(method) || !name || name.length > 100 || !/^\S+@\S+\.\S+$/.test(email) || ![10, 11].includes(phone.length) || ![11, 14].includes(cpfCnpj.length)) return error('Confira os dados do comprador.');
  const item = await env.DB.prepare('SELECT * FROM products WHERE id=? AND active=1 AND stock>0').bind(String(input.productId || '')).first();
  if (!item) return error('Produto indisponível.', 409);
  const address = buyer.address || {};
  if (item.delivery_type === 'shipping' && (!/^\d{8}$/.test(String(address.postalCode || '').replace(/\D/g, '')) || !String(address.street || '').trim() || !String(address.number || '').trim() || !String(address.city || '').trim() || !/^[A-Za-z]{2}$/.test(String(address.state || '')))) return error('Preencha o endereço de entrega.');
  const orderId = crypto.randomUUID();
  const viewToken = crypto.randomUUID() + crypto.randomUUID();
  const amount = item.price_cents + item.shipping_cents;
  await env.DB.prepare('INSERT INTO orders(id,product_id,product_name,amount_cents,payment_method,buyer_name,buyer_email,buyer_phone,address_json,view_token_hash) VALUES(?,?,?,?,?,?,?,?,?,?)')
    .bind(orderId, item.id, item.name, amount, method, name, email, phone, item.delivery_type === 'shipping' ? JSON.stringify(address) : null, await hash(viewToken)).run();
  const reserved = await env.DB.prepare('UPDATE products SET stock=stock-1,updated_at=CURRENT_TIMESTAMP WHERE id=? AND active=1 AND stock>0').bind(item.id).run();
  if (!reserved.meta?.changes) {
    await env.DB.prepare("UPDATE orders SET status='CANCELLED',updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(orderId).run();
    return error('Produto esgotado.', 409);
  }
  await env.DB.prepare('UPDATE orders SET stock_counted=1 WHERE id=?').bind(orderId).run();
  let paymentCreated = false;
  try {
    const customer = await callAsaas(env, '/customers', {
      name, email, mobilePhone: phone, cpfCnpj, externalReference: orderId,
      ...(item.delivery_type === 'shipping' ? { postalCode: String(address.postalCode).replace(/\D/g, ''), address: String(address.street).trim(), addressNumber: String(address.number).trim(), complement: String(address.complement || '').trim(), province: String(address.district || '').trim() } : {}),
    });
    if (!customer.id) throw new Error('Cliente sem ID');
    await env.DB.prepare('UPDATE orders SET asaas_customer_id=? WHERE id=?').bind(customer.id, orderId).run();
    const dueDate = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10);
    const payment = await callAsaas(env, '/payments', {
      customer: customer.id, billingType: method, value: amount / 100, dueDate,
      description: `BH É NÓIS - ${item.name} - pedido ${orderId.slice(0, 8)}`,
      externalReference: orderId,
      callback: { successUrl: `${SITE}/pedido.html?id=${orderId}`, autoRedirect: false },
    });
    paymentCreated = !!payment.id;
    if (!payment.id || !/^https:\/\//.test(payment.invoiceUrl || '')) throw new Error('Cobrança sem link');
    await env.DB.prepare("UPDATE orders SET asaas_payment_id=?,invoice_url=?,status='PENDING',updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(payment.id, payment.invoiceUrl, orderId).run();
    return respond({ orderId, viewToken, checkoutUrl: payment.invoiceUrl });
  } catch (cause) {
    console.error('Falha no checkout Asaas', String(cause));
    if (!paymentCreated) await env.DB.batch([
      env.DB.prepare('UPDATE products SET stock=stock+1,updated_at=CURRENT_TIMESTAMP WHERE id=? AND EXISTS(SELECT 1 FROM orders WHERE id=? AND stock_counted=1)').bind(item.id, orderId),
      env.DB.prepare("UPDATE orders SET stock_counted=0,status='ERROR',updated_at=CURRENT_TIMESTAMP WHERE id=? AND stock_counted=1").bind(orderId),
    ]);
    else await env.DB.prepare("UPDATE orders SET status='ERROR',updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(orderId).run();
    return error('Não foi possível iniciar o pagamento.', 502);
  }
}

async function order(request, env, id) {
  const token = new URL(request.url).searchParams.get('token');
  if (!token || token.length > 100) return error('Acesso negado.', 403);
  const row = await env.DB.prepare('SELECT id,product_name,amount_cents,payment_method,status,invoice_url,created_at,view_token_hash FROM orders WHERE id=?').bind(id).first();
  if (!row || await hash(token) !== row.view_token_hash) return error('Pedido não encontrado.', 404);
  return respond({ id: row.id, productName: row.product_name, amountCents: row.amount_cents, paymentMethod: row.payment_method, status: row.status, checkoutUrl: row.invoice_url, createdAt: row.created_at });
}

async function webhook(request, env) {
  const provided = request.headers.get('asaas-access-token');
  const expected = env.ASAAS_WEBHOOK_TOKEN;
  if (!provided || !expected || provided.length !== expected.length) return error('Não autorizado.', 401);
  let difference = 0;
  for (let i = 0; i < expected.length; i++) difference |= expected.charCodeAt(i) ^ provided.charCodeAt(i);
  if (difference) return error('Não autorizado.', 401);
  const event = await request.json();
  const payment = event.payment || {};
  if (!payment.id || !payment.externalReference) return respond({ ok: true });
  const row = await env.DB.prepare('SELECT * FROM orders WHERE id=? AND asaas_payment_id=?').bind(payment.externalReference, payment.id).first();
  if (!row || Math.round(Number(payment.value) * 100) !== row.amount_cents) return respond({ ok: true });
  const status = { PAYMENT_CONFIRMED: 'CONFIRMED', PAYMENT_RECEIVED: 'RECEIVED', PAYMENT_OVERDUE: 'OVERDUE', PAYMENT_DELETED: 'CANCELLED', PAYMENT_REFUNDED: 'REFUNDED', PAYMENT_CREDIT_CARD_CAPTURE_REFUSED: 'FAILED' }[event.event];
  if (!status) return respond({ ok: true });
  if (['CONFIRMED', 'RECEIVED'].includes(status) && ['REFUNDED', 'CANCELLED'].includes(row.status)) return respond({ ok: true });
  if (['REFUNDED', 'CANCELLED', 'FAILED'].includes(status) && row.stock_counted) await env.DB.batch([
    env.DB.prepare('UPDATE products SET stock=stock+1,updated_at=CURRENT_TIMESTAMP WHERE id=? AND EXISTS(SELECT 1 FROM orders WHERE id=? AND stock_counted=1)').bind(row.product_id, row.id),
    env.DB.prepare('UPDATE orders SET stock_counted=0 WHERE id=? AND stock_counted=1').bind(row.id),
  ]);
  if (row.status === 'RECEIVED' && status === 'CONFIRMED') return respond({ ok: true });
  await env.DB.prepare('UPDATE orders SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(status, row.id).run();
  return respond({ ok: true });
}

export async function handleStoreApi(request, env, url) {
  try {
    if (url.pathname === '/api/webhooks/asaas' && request.method === 'POST') return webhook(request, env);
    if (!env.DB) return error('Lojinha indisponível no momento.', 503);
    if (url.pathname === '/api/products' && request.method === 'GET') return products(env, false);
    const imageRoute = /^\/api\/products\/([a-f0-9-]{36})\/image$/.exec(url.pathname);
    if (imageRoute && request.method === 'GET') return image(env, imageRoute[1]);
    const orderRoute = /^\/api\/orders\/([a-f0-9-]{36})$/.exec(url.pathname);
    if (orderRoute && request.method === 'GET') return order(request, env, orderRoute[1]);
    if (request.method !== 'GET' && request.headers.get('Origin') !== SITE) return error('Origem não autorizada.', 403);
    if (url.pathname === '/api/checkout' && request.method === 'POST') return checkout(request, env);
    if (url.pathname.startsWith('/api/admin/')) {
      if (!await adminEmail(request, env)) return error('Acesso administrativo não autorizado.', 401);
      if (url.pathname === '/api/admin/products' && request.method === 'GET') return products(env, true);
      if (url.pathname === '/api/admin/products' && request.method === 'POST') return saveProduct(request, env);
      if (url.pathname === '/api/admin/orders' && request.method === 'GET') {
        const { results } = await env.DB.prepare('SELECT id,product_name,amount_cents,payment_method,buyer_name,buyer_email,buyer_phone,address_json,status,created_at FROM orders ORDER BY created_at DESC LIMIT 100').all();
        return respond({ orders: results || [] });
      }
    }
    return error('Rota não encontrada.', 404);
  } catch (cause) {
    console.error('Falha na lojinha', String(cause));
    return error('Não foi possível concluir a solicitação.', 500);
  }
}
