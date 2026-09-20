const productList = document.getElementById('product-list');
const dialog = document.getElementById('purchase-dialog');
const checkoutForm = document.getElementById('checkout-form');
const checkoutStatus = document.getElementById('checkout-status');
const money = (cents) => (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
let selected = null;
let paymentsEnabled = false;
document.getElementById('year').textContent = new Date().getFullYear();

function emptyStore(message = 'O próximo drop está chegando.') {
  productList.replaceChildren();
  const card = document.createElement('article'); card.className = 'product-empty';
  const eyebrow = document.createElement('p'); eyebrow.textContent = 'EM BREVE';
  const heading = document.createElement('h3'); heading.textContent = message;
  const detail = document.createElement('p'); detail.textContent = 'Entre no Instagram para não perder o lançamento.';
  const link = document.createElement('a'); link.href = 'https://www.instagram.com/bhenois_podcast/'; link.target = '_blank'; link.rel = 'noreferrer'; link.textContent = 'ACOMPANHAR NO INSTAGRAM ↗';
  card.append(eyebrow, heading, detail, link); productList.append(card);
}

function openPurchase(item) {
  selected = item; checkoutForm.reset(); checkoutStatus.textContent = '';
  document.getElementById('purchase-title').textContent = item.name;
  document.getElementById('purchase-price').textContent = money(item.priceCents + item.shippingCents);
  document.getElementById('purchase-description').textContent = item.description;
  document.getElementById('delivery-message').textContent = item.deliveryType === 'shipping' ? `Inclui frete de ${money(item.shippingCents)}.` : 'Retirada em Belo Horizonte. A produção combinará o local com você.';
  const shipping = item.deliveryType === 'shipping';
  document.getElementById('shipping-fields').hidden = !shipping;
  document.querySelectorAll('#shipping-fields input').forEach((input) => { input.required = shipping && !['buyer-complement', 'buyer-district'].includes(input.id); });
  dialog.showModal();
}

function renderProducts(items) {
  productList.replaceChildren();
  items.forEach((item) => {
    const card = document.createElement('article'); card.className = 'product';
    if (item.imageUrl) { const image = document.createElement('img'); image.src = item.imageUrl; image.alt = item.name; image.loading = 'lazy'; card.append(image); }
    const content = document.createElement('div'); content.className = 'product-content';
    const price = document.createElement('p'); price.className = 'product-price'; price.textContent = money(item.priceCents);
    const name = document.createElement('h3'); name.textContent = item.name;
    const description = document.createElement('p'); description.className = 'product-description'; description.textContent = item.description;
    const button = document.createElement('button'); button.className = 'button primary'; button.type = 'button';
    button.textContent = paymentsEnabled ? 'COMPRAR ↗' : 'PAGAMENTO EM BREVE'; button.disabled = !paymentsEnabled;
    button.addEventListener('click', () => openPurchase(item));
    content.append(price, name, description, button); card.append(content); productList.append(card);
  });
}

async function loadProducts() {
  try {
    const response = await fetch('/api/products', { cache: 'no-store' });
    if (!response.ok) throw new Error('Catálogo indisponível');
    const data = await response.json(); paymentsEnabled = data.paymentsEnabled;
    if (!data.products.length) emptyStore(); else renderProducts(data.products);
  } catch { emptyStore('Lojinha temporariamente indisponível.'); }
}

checkoutForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!selected) return;
  const submit = document.getElementById('checkout-submit'); submit.disabled = true;
  checkoutStatus.textContent = 'Criando pedido no Asaas…';
  const get = (id) => document.getElementById(id).value.trim();
  const buyer = { name: get('buyer-name'), email: get('buyer-email'), phone: get('buyer-phone'), cpfCnpj: get('buyer-document') };
  if (selected.deliveryType === 'shipping') buyer.address = { postalCode: get('buyer-postal'), street: get('buyer-street'), number: get('buyer-number'), complement: get('buyer-complement'), district: get('buyer-district'), city: get('buyer-city'), state: get('buyer-state').toUpperCase() };
  try {
    const response = await fetch('/api/checkout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ productId: selected.id, paymentMethod: checkoutForm.elements['payment-method'].value, buyer }) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Não foi possível criar o pedido.');
    const saved = JSON.parse(localStorage.getItem('bh-orders') || '[]');
    saved.unshift({ id: data.orderId, token: data.viewToken });
    localStorage.setItem('bh-orders', JSON.stringify(saved.slice(0, 20)));
    window.location.assign(data.checkoutUrl);
  } catch (cause) { checkoutStatus.textContent = cause.message; submit.disabled = false; }
});

document.querySelector('.dialog-close').addEventListener('click', () => dialog.close());
dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); });
loadProducts();
