const form = document.getElementById('product-form');
const productsRoot = document.getElementById('admin-products');
let products = [];

const fields = {
  id: document.getElementById('product-id'), name: document.getElementById('product-name'), price: document.getElementById('product-price'),
  description: document.getElementById('product-description'), image: document.getElementById('product-image'), stock: document.getElementById('product-stock'),
  mercadoPagoUrl: document.getElementById('product-mercado-pago'), pixUrl: document.getElementById('product-pix'), active: document.getElementById('product-active')
};
const newId = () => `bh-${Date.now().toString(36)}`;
const clearForm = () => { form.reset(); fields.id.value = ''; fields.stock.value = '1'; fields.active.checked = true; document.getElementById('form-title').textContent = 'Novo produto'; };
const money = (value) => Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

function render() {
  document.getElementById('catalog-count').textContent = `${products.length} ${products.length === 1 ? 'item' : 'itens'}`;
  productsRoot.replaceChildren();
  if (!products.length) { productsRoot.innerHTML = '<p class="admin-empty">Nenhum produto cadastrado ainda.</p>'; return; }
  products.forEach((product) => {
    const row = document.createElement('article'); row.className = 'admin-product';
    const title = document.createElement('div'); title.innerHTML = `<p>${money(product.price)} · ${product.stock} em estoque</p><h3></h3><small></small>`;
    title.querySelector('h3').textContent = product.name;
    title.querySelector('small').textContent = product.active ? 'PUBLICADO' : 'RASCUNHO';
    const actions = document.createElement('div');
    const edit = document.createElement('button'); edit.type = 'button'; edit.className = 'button outline'; edit.textContent = 'EDITAR'; edit.addEventListener('click', () => editProduct(product.id));
    const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'admin-delete'; remove.textContent = 'REMOVER'; remove.addEventListener('click', () => { products = products.filter((item) => item.id !== product.id); render(); });
    actions.append(edit, remove); row.append(title, actions); productsRoot.append(row);
  });
}

function editProduct(id) {
  const product = products.find((item) => item.id === id); if (!product) return;
  Object.entries(fields).forEach(([key, input]) => { if (key === 'active') input.checked = Boolean(product.active); else input.value = product[key] ?? ''; });
  document.getElementById('form-title').textContent = 'Editar produto'; form.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  const product = { id: fields.id.value || newId(), name: fields.name.value.trim(), price: Number(fields.price.value), description: fields.description.value.trim(), image: fields.image.value.trim(), stock: Number(fields.stock.value), mercadoPagoUrl: fields.mercadoPagoUrl.value.trim(), pixUrl: fields.pixUrl.value.trim(), active: fields.active.checked };
  const index = products.findIndex((item) => item.id === product.id); if (index >= 0) products[index] = product; else products.push(product);
  clearForm(); render();
});

document.getElementById('clear-form').addEventListener('click', clearForm);
document.getElementById('download-catalog').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify({ products }, null, 2)], { type: 'application/json' });
  const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = 'products.json'; link.click(); URL.revokeObjectURL(link.href);
});

fetch('products.json').then((response) => response.ok ? response.json() : { products: [] }).then((catalog) => { products = Array.isArray(catalog.products) ? catalog.products : []; render(); }).catch(render);
