const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const PORT = process.env.PORT || 3000;
const CHANNEL_ID = 'UCWZ83QknfPlj8dPKdx9NImw';
const ROOT = __dirname;
let cache = { expiresAt: 0, episodes: [] };
const contentTypes = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg' };
const decodeXml = (value) => value.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');

async function latestEpisodes() {
  if (cache.expiresAt > Date.now()) return cache.episodes;
  const response = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${CHANNEL_ID}`, { headers: { 'User-Agent': 'BH-E-Nois-Podcast/1.0' } });
  if (!response.ok) throw new Error(`YouTube respondeu ${response.status}`);
  const xml = await response.text();
  const episodes = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].slice(0, 3).map(([, entry]) => {
    const title = decodeXml(entry.match(/<title>([\s\S]*?)<\/title>/)?.[1]?.trim() || 'Novo episódio');
    const id = entry.match(/<yt:videoId>([^<]+)<\/yt:videoId>/)?.[1];
    const published = entry.match(/<published>([^<]+)<\/published>/)?.[1];
    return { title, published, url: `https://www.youtube.com/watch?v=${id}`, thumbnail: `https://i.ytimg.com/vi/${id}/hqdefault.jpg` };
  }).filter((episode) => episode.url && episode.published);
  cache = { episodes, expiresAt: Date.now() + 15 * 60 * 1000 };
  return episodes;
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname === '/api/episodes') {
    try { const episodes = await latestEpisodes(); res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=900' }); return res.end(JSON.stringify({ episodes })); }
    catch { res.writeHead(503, { 'Content-Type': 'application/json; charset=utf-8' }); return res.end(JSON.stringify({ error: 'Não foi possível atualizar os episódios agora.' })); }
  }
  const requested = url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname);
  const filePath = path.resolve(ROOT, `.${requested}`);
  if (!filePath.startsWith(ROOT) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) { res.writeHead(404); return res.end('Não encontrado'); }
  res.writeHead(200, { 'Content-Type': contentTypes[path.extname(filePath)] || 'application/octet-stream' });
  fs.createReadStream(filePath).pipe(res);
}).listen(PORT, () => console.log(`BH É NÓIS Podcast em http://localhost:${PORT}`));
