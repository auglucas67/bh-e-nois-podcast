import test from 'node:test';
import assert from 'node:assert/strict';
import { parseEpisodes, renderEpisodePage, renderEpisodesIndex, renderSitemap } from '../worker.js';

const feed = `<?xml version="1.0"?><feed><entry>
  <yt:videoId>abcDEF_1234</yt:videoId>
  <title>Conversa &amp; Cultura &lt;BH&gt;</title>
  <published>2026-09-20T12:00:00+00:00</published>
  <media:description><![CDATA[Um papo sobre cultura de BH. https://example.com]]></media:description>
</entry></feed>`;

test('feed gera episódio interno e página indexável', () => {
  const episodes = parseEpisodes(feed);
  assert.equal(episodes.length, 1);
  assert.equal(episodes[0].url, '/episodios/abcDEF_1234');
  assert.equal(episodes[0].title, 'Conversa & Cultura <BH>');
  const html = renderEpisodePage(episodes[0]);
  assert.match(html, /PodcastEpisode/);
  assert.match(html, /rel="canonical" href="https:\/\/bhenoispodcast.com.br\/episodios\/abcDEF_1234"/);
  assert.doesNotMatch(html, /<BH>/);
});

test('índice e sitemap incluem URLs dos episódios', () => {
  const episodes = parseEpisodes(feed);
  assert.match(renderEpisodesIndex(episodes), /VER EPISÓDIO/);
  const sitemap = renderSitemap(episodes);
  assert.match(sitemap, /https:\/\/bhenoispodcast.com.br\/episodios\/abcDEF_1234/);
  assert.match(sitemap, /<lastmod>2026-09-20<\/lastmod>/);
});
