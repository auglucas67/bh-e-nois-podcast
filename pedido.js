const root = document.getElementById('my-orders');
const money = (cents) => (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const labels = { CREATING: 'Preparando pagamento', PENDING: 'Aguardando pagamento', CONFIRMED: 'Pagamento confirmado', RECEIVED: 'Pagamento recebido', OVERDUE: 'Pagamento vencido', CANCELLED: 'Cancelado', REFUNDED: 'Reembolsado', FAILED: 'Pagamento recusado', ERROR: 'Falha ao criar pagamento' };

async function showOrders() {
  root.textContent = 'Atualizando pedidos…';
  const saved = JSON.parse(localStorage.getItem('bh-orders') || '[]');
  root.replaceChildren();
  if (!saved.length) { const empty = document.createElement('p'); empty.textContent = 'Nenhum pedido foi feito neste navegador.'; root.append(empty); return; }
  const selected = new URLSearchParams(location.search).get('id');
  if (selected) saved.sort((a, b) => Number(b.id === selected) - Number(a.id === selected));
  for (const entry of saved) {
    const card = document.createElement('article'); card.className = 'my-order';
    try {
      const response = await fetch(`/api/orders/${encodeURIComponent(entry.id)}?token=${encodeURIComponent(entry.token)}`, { cache: 'no-store' });
      if (!response.ok) throw new Error('Pedido indisponível');
      const order = await response.json();
      const title = document.createElement('h2'); title.textContent = order.productName;
      const details = document.createElement('p'); details.textContent = `${money(order.amountCents)} · ${order.paymentMethod === 'PIX' ? 'Pix' : 'Cartão de crédito'} · ${labels[order.status] || order.status}`;
      card.append(title, details);
      if (order.status === 'PENDING' && order.checkoutUrl) { const link = document.createElement('a'); link.className = 'button primary'; link.href = order.checkoutUrl; link.target = '_blank'; link.rel = 'noreferrer'; link.textContent = 'CONTINUAR PAGAMENTO ↗'; card.append(link); }
    } catch { card.textContent = 'Não foi possível consultar um pedido agora.'; }
    root.append(card);
  }
}

document.getElementById('refresh-my-orders').addEventListener('click', showOrders);
showOrders();
