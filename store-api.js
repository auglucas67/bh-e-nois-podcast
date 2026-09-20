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

function shippingEnabled(env) {
  return !!env.MELHOR_ENVIO_TOKEN && /^\d{8}$/.test(String(env.SHIPPING_ORIGIN_POSTAL_CODE || '').replace(/\D/g, ''));
}

function product(row) {
  return {
    id: row.id, name: row.name, description: row.description, priceCents: row.price_cents,
    stock: row.stock, active: !!row.active, deliveryType: row.delivery_type,
    shippingCents: row.shipping_cents, weightKg: row.weight_kg, widthCm: row.width_cm,
    heightCm: row.height_cm, lengthCm: row.length_cm,
    imageUrls: Array.from({ length: Number(row.image_count || 0) }, (_, position) => `/api/products/${row.id}/images/${position}?v=${encodeURIComponent(row.updated_at)}`),
  };
}

async function products(env, admin) {
  const condition = admin ? '' : 'WHERE p.active=1 AND p.stock>0';
  const { results } = await env.DB.prepare(`SELECT p.*, (SELECT COUNT(*) FROM product_gallery g WHERE g.product_id=p.id) AS image_count FROM products p ${condition} ORDER BY p.created_at DESC`).all();
  return respond({ products: (results || []).map(product), paymentsEnabled: isProduction(env), shippingEnabled: shippingEnabled(env) });
}

async function saveProduct(request, env) {
  const value = await request.json();
  const id = value.id && /^[a-f0-9-]{36}$/.test(value.id) ? value.id : crypto.randomUUID();
  const name = String(value.name || '').trim();
  const description = String(value.description || '').trim();
  const price = Number(value.priceCents);
  const stock = Number(value.stock);
  const delivery = value.deliveryType === 'shipping' ? 'shipping' : 'pickup';
  const shipping = 0;
  const weight = Number(value.weightKg), width = Number(value.widthCm), height = Number(value.heightCm), length = Number(value.lengthCm);
  if (!name || name.length > 70 || !description || description.length > 4000 || !Number.isSafeInteger(price) || price < 100 || price > 10_000_000 || !Number.isSafeInteger(stock) || stock < 0 || stock > 100_000 || (delivery === 'shipping' && (![weight, width, height, length].every(Number.isFinite) || weight <= 0 || weight > 100 || width < 1 || height < 1 || length < 1 || width > 200 || height > 200 || length > 200))) return error('Revise os dados do produto.');
  const rawImages = Array.isArray(value.imagesData) ? value.imagesData : [];
  if (rawImages.length > 10) return error('Envie no máximo 10 fotos.');
  const images = rawImages.map((data) => /^data:(image\/(?:jpeg|png|webp));base64,([a-zA-Z0-9+/=]+)$/.exec(data));
  if (images.some((match) => !match || match[2].length > 700_000)) return error('Cada foto deve ter até 500 KB.');
  await env.DB.prepare(`INSERT INTO products(id,name,description,price_cents,stock,active,delivery_type,shipping_cents,weight_kg,width_cm,height_cm,length_cm) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET name=excluded.name,description=excluded.description,price_cents=excluded.price_cents,stock=excluded.stock,
    active=excluded.active,delivery_type=excluded.delivery_type,shipping_cents=excluded.shipping_cents,weight_kg=excluded.weight_kg,width_cm=excluded.width_cm,height_cm=excluded.height_cm,length_cm=excluded.length_cm,updated_at=CURRENT_TIMESTAMP`)
    .bind(id, name, description, price, stock, Number(!!value.active), delivery, shipping, delivery === 'shipping' ? weight : 0.3, delivery === 'shipping' ? width : 16, delivery === 'shipping' ? height : 4, delivery === 'shipping' ? length : 24).run();
  if (value.removeImages || images.length) {
    const operations = [env.DB.prepare('DELETE FROM product_gallery WHERE product_id=?').bind(id)];
    images.forEach((match, position) => operations.push(env.DB.prepare('INSERT INTO product_gallery(id,product_id,position,mime,data_base64) VALUES(?,?,?,?,?)').bind(crypto.randomUUID(), id, position, match[1], match[2])));
    await env.DB.batch(operations);
  }
  return respond({ id });
}

async function image(env, id, position) {
  const row = await env.DB.prepare('SELECT mime,data_base64 FROM product_gallery WHERE product_id=? AND position=?').bind(id, position).first();
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

async function shippingQuotes(env, item, postalCode) {
  if (!shippingEnabled(env)) throw new Error('Frete indisponível');
  const destination = String(postalCode || '').replace(/\D/g, '');
  if (!/^\d{8}$/.test(destination)) throw new Error('CEP inválido');
  const response = await fetch('https://www.melhorenvio.com.br/api/v2/me/shipment/calculate', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.MELHOR_ENVIO_TOKEN}`,
      'Content-Type': 'application/json',
      'User-Agent': env.SHIPPING_USER_AGENT || 'BH E NOIS Podcast (podcastbhenois@gmail.com)',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      from: { postal_code: String(env.SHIPPING_ORIGIN_POSTAL_CODE).replace(/\D/g, '') },
      to: { postal_code: destination },
      products: [{ id: item.id, width: Number(item.width_cm), height: Number(item.height_cm), length: Number(item.length_cm), weight: Number(item.weight_kg), insurance_value: item.price_cents / 100, quantity: 1 }],
      options: { receipt: false, own_hand: false },
    }),
  });
  const data = await response.json().catch(() => []);
  if (!response.ok || !Array.isArray(data)) throw new Error('Falha ao consultar transportadoras');
  return data.filter((entry) => !entry.error && Number(entry.custom_price ?? entry.price) > 0).map((entry) => ({
    id: String(entry.id),
    name: String(entry.name || 'Entrega'),
    company: String(entry.company?.name || 'Transportadora'),
    priceCents: Math.round(Number(entry.custom_price ?? entry.price) * 100),
    deliveryDays: Number(entry.custom_delivery_time ?? entry.delivery_time) || null,
  })).filter((entry) => entry.priceCents > 0).sort((a, b) => a.priceCents - b.priceCents).slice(0, 8);
}

async function quote(request, env) {
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  await env.DB.prepare("DELETE FROM shipping_attempts WHERE created_at<datetime('now','-2 days')").run();
  const attempts = await env.DB.prepare("SELECT COUNT(*) AS total FROM shipping_attempts WHERE ip=? AND created_at>datetime('now','-1 hour')").bind(ip).first();
  if (Number(attempts?.total || 0) >= 30) return error('Muitas cotações. Tente novamente mais tarde.', 429);
  await env.DB.prepare('INSERT INTO shipping_attempts(ip) VALUES(?)').bind(ip).run();
  const input = await request.json();
  const item = await env.DB.prepare("SELECT * FROM products WHERE id=? AND active=1 AND stock>0 AND delivery_type='shipping'").bind(String(input.productId || '')).first();
  if (!item) return error('Produto indisponível para envio.', 409);
  try {
    const quotes = await shippingQuotes(env, item, input.postalCode);
    if (!quotes.length) return error('Nenhuma transportadora disponível para este CEP.', 422);
    return respond({ quotes });
  } catch (cause) {
    console.error('Falha na cotação', String(cause));
    return error('Não foi possível calcular o frete agora.', 503);
  }
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
  let shippingQuote = null;
  if (item.delivery_type === 'shipping') {
    try {
      const quotes = await shippingQuotes(env, item, address.postalCode);
      shippingQuote = quotes.find((entry) => entry.id === String(input.shippingServiceId || ''));
    } catch (cause) { console.error('Falha ao validar frete', String(cause)); }
    if (!shippingQuote) return error('Escolha novamente uma opção de frete.', 409);
  }
  const orderId = crypto.randomUUID();
  const viewToken = crypto.randomUUID() + crypto.randomUUID();
  const shippingCents = shippingQuote?.priceCents || 0;
  const amount = item.price_cents + shippingCents;
  const deliveryData = item.delivery_type === 'shipping' ? { ...address, shipping: shippingQuote } : null;
  await env.DB.prepare('INSERT INTO orders(id,product_id,product_name,amount_cents,payment_method,buyer_name,buyer_email,buyer_phone,address_json,view_token_hash) VALUES(?,?,?,?,?,?,?,?,?,?)')
    .bind(orderId, item.id, item.name, amount, method, name, email, phone, deliveryData ? JSON.stringify(deliveryData) : null, await hash(viewToken)).run();
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
    const imageRoute = /^\/api\/products\/([a-f0-9-]{36})\/images\/([0-9])$/.exec(url.pathname);
    if (imageRoute && request.method === 'GET') return image(env, imageRoute[1], Number(imageRoute[2]));
    const orderRoute = /^\/api\/orders\/([a-f0-9-]{36})$/.exec(url.pathname);
    if (orderRoute && request.method === 'GET') return order(request, env, orderRoute[1]);
    if (request.method !== 'GET' && request.headers.get('Origin') !== SITE) return error('Origem não autorizada.', 403);
    if (url.pathname === '/api/shipping/quote' && request.method === 'POST') return quote(request, env);
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
