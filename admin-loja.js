const form = document.getElementById('product-form');
const status = document.getElementById('admin-status');
const list = document.getElementById('admin-products');
const ordersRoot = document.getElementById('admin-orders');
const fields = {
  id: document.getElementById('product-id'), name: document.getElementById('product-name'),
  price: document.getElementById('product-price'), description: document.getElementById('product-description'),
  image: document.getElementById('product-image'), removeImage: document.getElementById('remove-image'),
  stock: document.getElementById('product-stock'), delivery: document.getElementById('product-delivery'),
  weight: document.getElementById('product-weight'), width: document.getElementById('product-width'),
  height: document.getElementById('product-height'), length: document.getElementById('product-length'),
  active: document.getElementById('product-active'),
};
let products = [];
const money = (cents) => (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const notice = (message, failed = false) => { status.textContent = message; status.classList.toggle('error', failed); };

async function api(path, options = {}) {
  const response = await fetch(path, { credentials: 'same-origin', cache: 'no-store', ...options });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Erro ${response.status}`);
  return data;
}

function deliveryFields() {
  document.getElementById('shipping-label').hidden = fields.delivery.value !== 'shipping';
}

function resetForm() {
  form.reset(); fields.id.value = ''; fields.stock.value = '1'; fields.active.checked = true;
  fields.weight.value = '0.30'; fields.width.value = '16'; fields.height.value = '4'; fields.length.value = '24';
  document.getElementById('image-current').textContent = ''; document.getElementById('description-count').textContent = '0/4000';
  document.getElementById('form-title').textContent = 'Novo produto'; deliveryFields();
}

function edit(item) {
  fields.id.value = item.id; fields.name.value = item.name;
  fields.price.value = (item.priceCents / 100).toFixed(2);
  fields.description.value = item.description; fields.stock.value = item.stock;
  fields.delivery.value = item.deliveryType; fields.weight.value = item.weightKg; fields.width.value = item.widthCm;
  fields.height.value = item.heightCm; fields.length.value = item.lengthCm;
  fields.active.checked = item.active; fields.image.value = ''; fields.removeImage.checked = false;
  document.getElementById('image-current').textContent = item.imageUrls.length ? `${item.imageUrls.length} foto(s) salva(s). Escolher novas fotos substitui o carrossel atual.` : 'Sem fotos cadastradas.';
  document.getElementById('description-count').textContent = `${item.description.length}/4000`;
  document.getElementById('form-title').textContent = 'Editar produto'; deliveryFields();
  form.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function render() {
  document.getElementById('catalog-count').textContent = `${products.length} ${products.length === 1 ? 'item' : 'itens'}`;
  list.replaceChildren();
  if (!products.length) { const empty = document.createElement('p'); empty.className = 'admin-empty'; empty.textContent = 'Nenhum produto cadastrado ainda.'; list.append(empty); return; }
  products.forEach((item) => {
    const row = document.createElement('article'); row.className = 'admin-product';
    const info = document.createElement('div');
    const price = document.createElement('p'); price.textContent = `${money(item.priceCents)} · ${item.stock} em estoque`;
    const name = document.createElement('h3'); name.textContent = item.name;
    const state = document.createElement('small'); state.textContent = item.active ? 'PUBLICADO' : 'RASCUNHO';
    info.append(price, name, state);
    const actions = document.createElement('div');
    const button = document.createElement('button'); button.type = 'button'; button.className = 'button outline'; button.textContent = 'EDITAR'; button.addEventListener('click', () => edit(item));
    actions.append(button); row.append(info, actions); list.append(row);
  });
}

async function loadCatalog() {
  try {
    const data = await api('/api/admin/products');
    products = data.products; render();
    document.getElementById('payment-state').textContent = data.paymentsEnabled ? 'Pix e cartão de crédito ativos no Asaas.' : 'Pagamentos aguardando a chave de produção do Asaas. Produtos podem ser cadastrados agora.';
    document.getElementById('shipping-state').textContent = data.shippingEnabled ? 'Cotação automática de frete ativa.' : 'Cotação aguardando o token da transportadora.';
    notice('Catálogo conectado. Salvar publica as alterações na hora.');
  } catch (cause) { notice(`${cause.message} Recarregue a página após entrar pelo acesso administrativo.`, true); }
}

async function imageData(file) {
  if (!file) return null;
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('Use uma foto JPEG, PNG ou WebP.');
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 960 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas'); canvas.width = Math.round(bitmap.width * scale); canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height); bitmap.close();
  let data = canvas.toDataURL('image/webp', 0.78);
  if (data.length > 700_000) data = canvas.toDataURL('image/webp', 0.55);
  if (data.length > 700_000) throw new Error('A foto ainda está grande. Use uma imagem menor.');
  return data;
}

async function imagesData(files) {
  const selected = [...files];
  if (selected.length > 10) throw new Error('Escolha no máximo 10 fotos.');
  return Promise.all(selected.map(imageData));
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = form.querySelector('[type="submit"]'); button.disabled = true; notice('Salvando produto…');
  try {
    const payload = {
      id: fields.id.value || undefined, name: fields.name.value.trim(), description: fields.description.value.trim(),
      priceCents: Math.round(Number(fields.price.value) * 100), stock: Number(fields.stock.value),
      deliveryType: fields.delivery.value, weightKg: Number(fields.weight.value), widthCm: Number(fields.width.value),
      heightCm: Number(fields.height.value), lengthCm: Number(fields.length.value),
      active: fields.active.checked, removeImages: fields.removeImage.checked,
      imagesData: await imagesData(fields.image.files),
    };
    await api('/api/admin/products', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    resetForm(); await loadCatalog(); notice('Produto salvo e atualizado na lojinha.');
  } catch (cause) { notice(cause.message, true); }
  finally { button.disabled = false; }
});

async function loadOrders() {
  try {
    const { orders } = await api('/api/admin/orders'); ordersRoot.replaceChildren();
    if (!orders.length) { const empty = document.createElement('p'); empty.className = 'admin-empty'; empty.textContent = 'Ainda não há pedidos.'; ordersRoot.append(empty); return; }
    orders.forEach((order) => {
      const row = document.createElement('article'); row.className = 'admin-product';
      const box = document.createElement('div');
      const amount = document.createElement('p'); amount.textContent = `${money(order.amount_cents)} · ${order.payment_method} · ${order.status}`;
      const name = document.createElement('h3'); name.textContent = order.product_name;
      const buyer = document.createElement('small'); buyer.textContent = `${order.buyer_name} · ${order.buyer_email} · ${order.buyer_phone}`;
      box.append(amount, name, buyer);
      if (order.address_json) { const address = document.createElement('p'); address.textContent = `Entrega: ${order.address_json}`; box.append(address); }
      row.append(box); ordersRoot.append(row);
    });
  } catch (cause) { ordersRoot.textContent = cause.message; }
}

fields.delivery.addEventListener('change', deliveryFields);
fields.description.addEventListener('input', () => { document.getElementById('description-count').textContent = `${fields.description.value.length}/4000`; });
document.getElementById('clear-form').addEventListener('click', resetForm);
document.getElementById('refresh-orders').addEventListener('click', loadOrders);
deliveryFields(); loadCatalog(); loadOrders();
