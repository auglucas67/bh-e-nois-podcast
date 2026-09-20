const productList = document.getElementById('product-list');
const dialog = document.getElementById('purchase-dialog');
const checkoutForm = document.getElementById('checkout-form');
const checkoutStatus = document.getElementById('checkout-status');
const money = (cents) => (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
let selected = null;
let selectedShipping = null;
let paymentsEnabled = false;
let shippingEnabled = false;
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

function carousel(urls, alt, large = false) {
  const root = document.createElement('div'); root.className = large ? 'product-carousel large' : 'product-carousel';
  if (!urls.length) { root.classList.add('no-image'); root.textContent = 'BH É NÓIS'; return root; }
  const image = document.createElement('img'); image.src = urls[0]; image.alt = alt; image.loading = 'lazy';
  let index = 0;
  const label = document.createElement('span'); label.className = 'carousel-count';
  const update = () => { image.src = urls[index]; label.textContent = `${index + 1}/${urls.length}`; };
  root.append(image);
  if (urls.length > 1) {
    const previous = document.createElement('button'); previous.type = 'button'; previous.className = 'carousel-arrow previous'; previous.setAttribute('aria-label', 'Foto anterior'); previous.textContent = '‹';
    const next = document.createElement('button'); next.type = 'button'; next.className = 'carousel-arrow next'; next.setAttribute('aria-label', 'Próxima foto'); next.textContent = '›';
    previous.addEventListener('click', () => { index = (index - 1 + urls.length) % urls.length; update(); });
    next.addEventListener('click', () => { index = (index + 1) % urls.length; update(); });
    root.append(previous, next, label); update();
  }
  return root;
}

function updateTotal() {
  const total = selected ? selected.priceCents + (selectedShipping?.priceCents || 0) : 0;
  document.getElementById('checkout-total').textContent = selected ? `Total: ${money(total)}` : '';
}

function openPurchase(item) {
  selected = item; selectedShipping = null; checkoutForm.reset(); checkoutStatus.textContent = '';
  document.getElementById('shipping-options').replaceChildren();
  document.getElementById('purchase-gallery').replaceChildren(carousel(item.imageUrls, item.name, true));
  document.getElementById('purchase-title').textContent = item.name;
  document.getElementById('purchase-price').textContent = money(item.priceCents);
  document.getElementById('purchase-description').textContent = item.description;
  const shipping = item.deliveryType === 'shipping';
  document.getElementById('delivery-message').textContent = shipping ? 'Informe seu CEP para comparar transportadoras, preço e prazo.' : 'Retirada em Belo Horizonte. A produção combinará o local com você.';
  document.getElementById('shipping-fields').hidden = !shipping;
  document.querySelectorAll('#shipping-fields input').forEach((input) => { input.required = shipping && !['buyer-complement', 'buyer-district'].includes(input.id); });
  updateTotal(); dialog.showModal();
}

function renderProducts(items) {
  productList.replaceChildren();
  items.forEach((item) => {
    const card = document.createElement('article'); card.className = 'product';
    card.append(carousel(item.imageUrls, item.name));
    const content = document.createElement('div'); content.className = 'product-content';
    const price = document.createElement('p'); price.className = 'product-price'; price.textContent = money(item.priceCents);
    const name = document.createElement('h3'); name.textContent = item.name;
    const description = document.createElement('p'); description.className = 'product-description'; description.textContent = item.description;
    const button = document.createElement('button'); button.className = 'button primary'; button.type = 'button';
    const ready = paymentsEnabled && (item.deliveryType !== 'shipping' || shippingEnabled);
    button.textContent = ready ? 'VER DETALHES E COMPRAR ↗' : (!paymentsEnabled ? 'PAGAMENTO EM CONFIGURAÇÃO' : 'FRETE EM CONFIGURAÇÃO');
    button.disabled = !ready; button.addEventListener('click', () => openPurchase(item));
    content.append(price, name, description, button); card.append(content); productList.append(card);
  });
}

async function loadProducts() {
  try {
    const response = await fetch('/api/products', { cache: 'no-store' });
    if (!response.ok) throw new Error('Catálogo indisponível');
    const data = await response.json(); paymentsEnabled = data.paymentsEnabled; shippingEnabled = data.shippingEnabled;
    if (!data.products.length) emptyStore(); else renderProducts(data.products);
  } catch { emptyStore('Lojinha temporariamente indisponível.'); }
}

document.getElementById('quote-shipping').addEventListener('click', async () => {
  const postalCode = document.getElementById('buyer-postal').value.trim();
  const root = document.getElementById('shipping-options'); root.textContent = 'Consultando transportadoras…'; selectedShipping = null; updateTotal();
  try {
    const response = await fetch('/api/shipping/quote', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ productId: selected.id, postalCode }) });
    const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Não foi possível calcular o frete.');
    root.replaceChildren();
    data.quotes.forEach((quote, position) => {
      const label = document.createElement('label'); label.className = 'shipping-option';
      const radio = document.createElement('input'); radio.type = 'radio'; radio.name = 'shipping-service'; radio.value = quote.id;
      const text = document.createElement('span'); text.textContent = `${quote.company} · ${quote.name} — ${money(quote.priceCents)}${quote.deliveryDays ? ` · até ${quote.deliveryDays} dias úteis` : ''}`;
      radio.addEventListener('change', () => { selectedShipping = quote; updateTotal(); });
      label.append(radio, text); root.append(label); if (position === 0) radio.click();
    });
  } catch (cause) { root.textContent = cause.message; }
});

checkoutForm.addEventListener('submit', async (event) => {
  event.preventDefault(); if (!selected) return;
  if (selected.deliveryType === 'shipping' && !selectedShipping) { checkoutStatus.textContent = 'Calcule e escolha uma opção de frete.'; return; }
  const submit = document.getElementById('checkout-submit'); submit.disabled = true; checkoutStatus.textContent = 'Criando pedido no Asaas…';
  const get = (id) => document.getElementById(id).value.trim();
  const buyer = { name: get('buyer-name'), email: get('buyer-email'), phone: get('buyer-phone'), cpfCnpj: get('buyer-document') };
  if (selected.deliveryType === 'shipping') buyer.address = { postalCode: get('buyer-postal'), street: get('buyer-street'), number: get('buyer-number'), complement: get('buyer-complement'), district: get('buyer-district'), city: get('buyer-city'), state: get('buyer-state').toUpperCase() };
  try {
    const response = await fetch('/api/checkout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ productId: selected.id, shippingServiceId: selectedShipping?.id, paymentMethod: checkoutForm.elements['payment-method'].value, buyer }) });
    const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Não foi possível criar o pedido.');
    const saved = JSON.parse(localStorage.getItem('bh-orders') || '[]'); saved.unshift({ id: data.orderId, token: data.viewToken });
    localStorage.setItem('bh-orders', JSON.stringify(saved.slice(0, 20))); window.location.assign(data.checkoutUrl);
  } catch (cause) { checkoutStatus.textContent = cause.message; submit.disabled = false; }
});

document.querySelector('.dialog-close').addEventListener('click', () => dialog.close());
dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); });
loadProducts();
