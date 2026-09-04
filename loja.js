const productList = document.getElementById('product-list');
document.getElementById('year').textContent = new Date().getFullYear();
const escapeHtml = (value) => { const element = document.createElement('span'); element.textContent = value; return element.innerHTML; };
fetch('/products.json').then((response) => response.ok ? response.json() : Promise.reject()).then(({ products }) => {
  if (!products?.length) return;
  productList.replaceChildren(...products.filter((product) => product.active).map((product) => {
    const card = document.createElement('article'); card.className = 'product';
    card.innerHTML = `${product.image ? `<img src="${product.image}" alt="${escapeHtml(product.name)}" />` : ''}<p class="product-price">R$ ${Number(product.price).toFixed(2).replace('.', ',')}</p><h3>${escapeHtml(product.name)}</h3><a class="button primary" href="${product.checkout}" target="_blank" rel="noreferrer">COMPRAR ↗</a>`;
    return card;
  }));
}).catch(() => {});
