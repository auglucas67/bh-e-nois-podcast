import { handleStoreApi } from './store-api.js';

const CHANNEL_ID = 'UCWZ83QknfPlj8dPKdx9NImw';
const CACHE_SECONDS = 15 * 60;
let episodeCache = { expiresAt: 0, episodes: [] };

function decodeXml(value) {
  return value.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
}

async function latestEpisodes() {
  if (episodeCache.expiresAt > Date.now()) return episodeCache.episodes;
  const response = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${CHANNEL_ID}`, { headers: { 'User-Agent': 'BH-E-Nois-Podcast/1.0' } });
  if (!response.ok) throw new Error(`YouTube respondeu ${response.status}`);
  const xml = await response.text();
  const episodes = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].slice(0, 3).map(([, entry]) => {
    const title = decodeXml(entry.match(/<title>([\s\S]*?)<\/title>/)?.[1]?.trim() || 'Novo episódio');
    const id = entry.match(/<yt:videoId>([^<]+)<\/yt:videoId>/)?.[1];
    const published = entry.match(/<published>([^<]+)<\/published>/)?.[1];
    return { title, published, url: `https://www.youtube.com/watch?v=${id}`, thumbnail: `https://i.ytimg.com/vi/${id}/hqdefault.jpg` };
  }).filter((episode) => episode.url && episode.published);
  episodeCache = { episodes, expiresAt: Date.now() + CACHE_SECONDS * 1000 };
  return episodes;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/episodes') {
      try {
        const episodes = await latestEpisodes();
        return Response.json({ episodes }, { headers: { 'Cache-Control': `public, max-age=${CACHE_SECONDS}` } });
      } catch {
        return Response.json({ error: 'Não foi possível atualizar os episódios agora.' }, { status: 503 });
      }
    }
    if (url.pathname.startsWith('/api/')) return handleStoreApi(request, env, url);
    return env.ASSETS.fetch(request);
  },
};
