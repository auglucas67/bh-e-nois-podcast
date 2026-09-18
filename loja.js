const productList = document.getElementById('product-list');
const dialog = document.getElementById('purchase-dialog');
const money = (value) => Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
document.getElementById('year').textContent = new Date().getFullYear();

function emptyStore() {
  productList.innerHTML = '<article class="product-empty"><p>EM BREVE</p><h3>O próximo drop<br>está chegando.</h3><p>Entre no Instagram para não perder o lançamento.</p><a href="https://www.instagram.com/bhenois_podcast/" target="_blank" rel="noreferrer">ACOMPANHAR NO INSTAGRAM ↗</a></article>';
}

function openPurchase(product) {
  document.getElementById('purchase-title').textContent = product.name;
  document.getElementById('purchase-price').textContent = money(product.price);
  document.getElementById('purchase-description').textContent = product.description || 'Escolha uma forma de pagamento para este produto.';
  const actions = document.getElementById('purchase-actions');
  actions.replaceChildren();
  if (product.mercadoPagoUrl) {
    const mercadoPago = document.createElement('a'); mercadoPago.className = 'button primary'; mercadoPago.href = product.mercadoPagoUrl; mercadoPago.target = '_blank'; mercadoPago.rel = 'noreferrer'; mercadoPago.textContent = 'PAGAR COM MERCADO PAGO ↗'; actions.append(mercadoPago);
  }
  if (product.pixUrl) {
    const pix = document.createElement('a'); pix.className = 'button pix-button'; pix.href = product.pixUrl; pix.target = '_blank'; pix.rel = 'noreferrer'; pix.textContent = 'PAGAR VIA PIX ↗'; actions.append(pix);
  }
  if (!product.mercadoPagoUrl && !product.pixUrl) {
    const unavailable = document.createElement('p'); unavailable.className = 'payment-unavailable'; unavailable.textContent = 'Este produto estará disponível em breve.'; actions.append(unavailable);
  }
  dialog.showModal();
}

fetch('products.json').then((response) => response.ok ? response.json() : Promise.reject()).then(({ products }) => {
  const active = (products || []).filter((product) => product.active && Number(product.stock) !== 0);
  if (!active.length) return emptyStore();
  productList.replaceChildren(...active.map((product) => {
    const card = document.createElement('article'); card.className = 'product';
    if (product.image) { const image = document.createElement('img'); image.src = product.image; image.alt = product.name; image.loading = 'lazy'; card.append(image); }
    const content = document.createElement('div'); content.className = 'product-content';
    const price = document.createElement('p'); price.className = 'product-price'; price.textContent = money(product.price);
    const name = document.createElement('h3'); name.textContent = product.name;
    const description = document.createElement('p'); description.className = 'product-description'; description.textContent = product.description || 'Produto oficial BH É NÓIS.';
    const button = document.createElement('button'); button.className = 'button primary'; button.type = 'button'; button.textContent = 'COMPRAR ↗'; button.addEventListener('click', () => openPurchase(product));
    content.append(price, name, description, button); card.append(content); return card;
  }));
}).catch(emptyStore);

document.querySelector('.dialog-close').addEventListener('click', () => dialog.close());
dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); });
