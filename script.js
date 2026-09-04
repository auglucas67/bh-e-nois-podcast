const menu = document.querySelector('.menu-toggle');
const nav = document.querySelector('nav');
menu.addEventListener('click', () => {
  const open = nav.classList.toggle('open');
  menu.setAttribute('aria-expanded', open);
  menu.textContent = open ? '×' : '☰';
});
document.querySelectorAll('nav a').forEach((link) => link.addEventListener('click', () => {
  nav.classList.remove('open'); menu.setAttribute('aria-expanded', 'false'); menu.textContent = '☰';
}));
document.getElementById('year').textContent = new Date().getFullYear();

const episodeGrid = document.querySelector('.episode-grid');
function formatDate(date) { return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(date)); }
function escapeHtml(value) { const element = document.createElement('span'); element.textContent = value; return element.innerHTML; }
function episodeCard(episode) {
  const card = document.createElement('a');
  card.className = 'episode real-episode'; card.href = episode.url; card.target = '_blank'; card.rel = 'noreferrer';
  const title = escapeHtml(episode.title);
  card.innerHTML = `<img src="${episode.thumbnail}" alt="Capa: ${title}" /><span class="play">▶</span><div class="episode-info"><p>${formatDate(episode.published)}</p><h3>${title}</h3><span>ASSISTIR NO YOUTUBE ↗</span></div>`;
  return card;
}
fetch('/api/episodes').then((response) => response.ok ? response.json() : Promise.reject()).then(({ episodes }) => { if (episodes?.length) episodeGrid.replaceChildren(...episodes.slice(0, 3).map(episodeCard)); }).catch(() => {});

const supporterList = document.getElementById('supporter-list');
function supporterCard(supporter) {
  const card = document.createElement('article');
  card.className = 'supporter';
  card.innerHTML = `<p class="supporter-name">${escapeHtml(supporter.name)}</p><p class="supporter-source">${supporter.source === 'pix' ? 'PIX RECORRENTE' : 'APOIA.SE'}</p>`;
  return card;
}
fetch('/supporters.json').then((response) => response.ok ? response.json() : Promise.reject()).then(({ supporters }) => {
  if (supporters?.length) supporterList.replaceChildren(...supporters.map(supporterCard));
}).catch(() => {});

let dragging = false; let startX = 0; let initialScroll = 0;
supporterList.addEventListener('pointerdown', (event) => { dragging = true; startX = event.clientX; initialScroll = supporterList.scrollLeft; supporterList.setPointerCapture(event.pointerId); });
supporterList.addEventListener('pointermove', (event) => { if (dragging) supporterList.scrollLeft = initialScroll - (event.clientX - startX); });
supporterList.addEventListener('pointerup', () => { dragging = false; });
