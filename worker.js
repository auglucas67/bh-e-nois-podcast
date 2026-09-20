import { handleStoreApi } from './store-api.js';

const CHANNEL_ID = 'UCWZ83QknfPlj8dPKdx9NImw';
const SITE_URL = 'https://bhenoispodcast.com.br';
const CACHE_SECONDS = 15 * 60;
let episodeCache = { expiresAt: 0, episodes: [] };

function decodeXml(value = '') {
  return value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
}

function escapeHtml(value = '') {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function safeJson(value) {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

function xmlValue(entry, tag) {
  const escaped = tag.replace(':', '\\:');
  return decodeXml(entry.match(new RegExp(`<${escaped}>([\\s\\S]*?)<\\/${escaped}>`))?.[1]?.trim() || '');
}

function plainText(value = '') {
  return decodeXml(value).replace(/<[^>]*>/g, ' ').replace(/https?:\/\/\S+/g, ' ').replace(/\s+/g, ' ').trim();
}

export function parseEpisodes(xml) {
  return [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].slice(0, 15).map(([, entry]) => {
    const id = xmlValue(entry, 'yt:videoId');
    const title = xmlValue(entry, 'title') || 'Novo episódio';
    const published = xmlValue(entry, 'published');
    const description = plainText(xmlValue(entry, 'media:description')).slice(0, 6000);
    return {
      id,
      title,
      published,
      description,
      url: `/episodios/${encodeURIComponent(id)}`,
      youtubeUrl: `https://www.youtube.com/watch?v=${encodeURIComponent(id)}`,
      thumbnail: `https://i.ytimg.com/vi/${encodeURIComponent(id)}/hqdefault.jpg`,
    };
  }).filter((episode) => episode.id && episode.published);
}

async function latestEpisodes() {
  if (episodeCache.expiresAt > Date.now()) return episodeCache.episodes;
  const response = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${CHANNEL_ID}`, { headers: { 'User-Agent': 'BH-E-Nois-Podcast/1.0' } });
  if (!response.ok) throw new Error(`YouTube respondeu ${response.status}`);
  const episodes = parseEpisodes(await response.text());
  episodeCache = { episodes, expiresAt: Date.now() + CACHE_SECONDS * 1000 };
  return episodes;
}

function pageShell({ title, description, canonical, body, structuredData = null }) {
  return `<!doctype html>
<html lang="pt-BR"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="description" content="${escapeHtml(description)}"><meta name="robots" content="index,follow,max-image-preview:large">
<link rel="canonical" href="${escapeHtml(canonical)}"><meta property="og:locale" content="pt_BR"><meta property="og:type" content="article">
<meta property="og:site_name" content="BH É NÓIS Podcast"><meta property="og:title" content="${escapeHtml(title)}"><meta property="og:description" content="${escapeHtml(description)}">
<meta property="og:url" content="${escapeHtml(canonical)}"><meta property="og:image" content="${SITE_URL}/logo-bh-e-nois.png">
<title>${escapeHtml(title)}</title>${structuredData ? `<script type="application/ld+json">${safeJson(structuredData)}</script>` : ''}
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Oswald:wght@400;500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/episodes.css"></head><body>
<header><a class="brand" href="/"><b>BH</b> É NÓIS</a><nav><a href="/">INÍCIO</a><a href="/episodios">EPISÓDIOS</a><a href="/lojinha.html">LOJINHA</a><a href="/#apoie">APOIE</a></nav></header>
${body}
<footer><a class="brand" href="/"><b>BH</b> É NÓIS</a><p>© ${new Date().getFullYear()}, BH É NÓIS Podcast · Belo Horizonte, MG.</p></footer>
</body></html>`;
}

export function renderEpisodesIndex(episodes) {
  const cards = episodes.map((episode) => `<article class="episode-card"><a href="${episode.url}"><img src="${episode.thumbnail}" alt="Capa do episódio ${escapeHtml(episode.title)}" loading="lazy"><div><time datetime="${escapeHtml(episode.published)}">${new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(episode.published))}</time><h2>${escapeHtml(episode.title)}</h2><p>${escapeHtml(episode.description.slice(0, 180) || 'Assista a este episódio do BH É NÓIS Podcast.')}</p><span>VER EPISÓDIO →</span></div></a></article>`).join('');
  const canonical = `${SITE_URL}/episodios`;
  return pageShell({
    title: 'Episódios | BH É NÓIS Podcast',
    description: 'Episódios do BH É NÓIS Podcast: entrevistas, cultura e histórias de Belo Horizonte. Assista no site oficial.',
    canonical,
    structuredData: { '@context': 'https://schema.org', '@type': 'CollectionPage', name: 'Episódios do BH É NÓIS Podcast', url: canonical, isPartOf: { '@id': `${SITE_URL}/#website` } },
    body: `<main><section class="episodes-hero"><p>CONVERSAS QUE FICAM</p><h1>EPISÓDIOS<br><em>BH É NÓIS.</em></h1><div>Entrevistas, cultura e histórias direto de Belo Horizonte. As páginas são atualizadas automaticamente a cada lançamento no canal.</div></section><section class="episode-list" aria-label="Episódios mais recentes">${cards || '<p>Nenhum episódio disponível agora.</p>'}</section></main>`,
  });
}

export function renderEpisodePage(episode) {
  const canonical = `${SITE_URL}${episode.url}`;
  const description = episode.description.slice(0, 240) || `Assista a ${episode.title}, episódio do BH É NÓIS Podcast.`;
  const structuredData = {
    '@context': 'https://schema.org', '@type': 'PodcastEpisode', name: episode.title, url: canonical,
    datePublished: episode.published, description, image: episode.thumbnail,
    partOfSeries: { '@type': 'PodcastSeries', '@id': `${SITE_URL}/#podcast`, name: 'BH É NÓIS Podcast', url: SITE_URL },
    associatedMedia: { '@type': 'VideoObject', name: episode.title, thumbnailUrl: episode.thumbnail, uploadDate: episode.published, embedUrl: `https://www.youtube.com/embed/${episode.id}`, contentUrl: episode.youtubeUrl },
  };
  return pageShell({
    title: `${episode.title} | BH É NÓIS Podcast`, description, canonical, structuredData,
    body: `<main class="episode-page"><a class="back" href="/episodios">← TODOS OS EPISÓDIOS</a><p class="kicker">BH É NÓIS PODCAST · BELO HORIZONTE</p><h1>${escapeHtml(episode.title)}</h1><time datetime="${escapeHtml(episode.published)}">Publicado em ${new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(episode.published))}</time><div class="video"><iframe src="https://www.youtube-nocookie.com/embed/${episode.id}" title="${escapeHtml(episode.title)}" loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe></div><section class="episode-copy"><h2>SOBRE O EPISÓDIO</h2><p>${escapeHtml(episode.description || 'Mais uma conversa do BH É NÓIS Podcast, direto de Belo Horizonte.')}</p><a class="cta" href="${episode.youtubeUrl}" target="_blank" rel="noreferrer">ASSISTIR NO YOUTUBE ↗</a></section></main>`,
  });
}

export function renderSitemap(episodes) {
  const urls = [
    { loc: `${SITE_URL}/`, lastmod: '2026-09-20', priority: '1.0' },
    { loc: `${SITE_URL}/episodios`, lastmod: episodes[0]?.published?.slice(0, 10) || '2026-09-20', priority: '0.9' },
    { loc: `${SITE_URL}/lojinha.html`, lastmod: '2026-09-20', priority: '0.7' },
    ...episodes.map((episode) => ({ loc: `${SITE_URL}${episode.url}`, lastmod: episode.published.slice(0, 10), priority: '0.8' })),
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((item) => `  <url><loc>${escapeHtml(item.loc)}</loc><lastmod>${item.lastmod}</lastmod><changefreq>weekly</changefreq><priority>${item.priority}</priority></url>`).join('\n')}\n</urlset>`;
}

function htmlResponse(html, status = 200) {
  return new Response(html, { status, headers: { 'Content-Type': 'text/html; charset=UTF-8', 'Cache-Control': `public, max-age=${CACHE_SECONDS}`, 'X-Content-Type-Options': 'nosniff' } });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/episodes') {
      try { return Response.json({ episodes: (await latestEpisodes()).slice(0, 3) }, { headers: { 'Cache-Control': `public, max-age=${CACHE_SECONDS}` } }); }
      catch { return Response.json({ error: 'Não foi possível atualizar os episódios agora.' }, { status: 503 }); }
    }
    if (url.pathname.startsWith('/api/')) return handleStoreApi(request, env, url);
    if (url.pathname === '/episodios' || url.pathname === '/episodios/') {
      try { return htmlResponse(renderEpisodesIndex(await latestEpisodes())); }
      catch { return htmlResponse(pageShell({ title: 'Episódios | BH É NÓIS Podcast', description: 'Episódios do BH É NÓIS Podcast.', canonical: `${SITE_URL}/episodios`, body: '<main class="error"><h1>EPISÓDIOS INDISPONÍVEIS AGORA.</h1><a href="/">VOLTAR AO SITE</a></main>' }), 503); }
    }
    const episodeMatch = url.pathname.match(/^\/episodios\/([A-Za-z0-9_-]{6,20})\/?$/);
    if (episodeMatch) {
      try {
        const episode = (await latestEpisodes()).find((item) => item.id === episodeMatch[1]);
        if (!episode) return htmlResponse(pageShell({ title: 'Episódio não encontrado | BH É NÓIS', description: 'Este episódio não foi encontrado.', canonical: `${SITE_URL}/episodios`, body: '<main class="error"><h1>EPISÓDIO NÃO ENCONTRADO.</h1><a href="/episodios">VER TODOS</a></main>' }), 404);
        return htmlResponse(renderEpisodePage(episode));
      } catch { return htmlResponse('<h1>Conteúdo temporariamente indisponível.</h1>', 503); }
    }
    if (url.pathname === '/sitemap.xml') {
      try { return new Response(renderSitemap(await latestEpisodes()), { headers: { 'Content-Type': 'application/xml; charset=UTF-8', 'Cache-Control': `public, max-age=${CACHE_SECONDS}` } }); }
      catch { return env.ASSETS.fetch(request); }
    }
    return env.ASSETS.fetch(request);
  },
};
