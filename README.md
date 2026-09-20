# BH É NÓIS Podcast

Site oficial do BH É NÓIS Podcast. Os episódios são atualizados automaticamente pelo feed público do YouTube e a lojinha usa Cloudflare Workers/D1, checkout hospedado pelo Asaas e cotação de frete pelo Melhor Envio.

## Episódios e SEO

- `/episodios` lista automaticamente os vídeos mais recentes do canal.
- Cada vídeo recebe uma página indexável em `/episodios/{videoId}`, com canonical, metadados sociais e dados estruturados `PodcastEpisode`/`VideoObject`.
- O Worker gera `/sitemap.xml` dinamicamente, incluindo os episódios mais recentes e suas datas de publicação.
- Os cards da página inicial apontam primeiro para as páginas do próprio domínio; nelas, o visitante pode assistir ao vídeo incorporado ou abrir o YouTube.

## Publicação no Cloudflare

1. O Worker usa `worker.js` e os arquivos estáticos gerados em `dist/`.
2. Rode `npm run build` para atualizar `dist/`.
3. A vinculação D1 `DB` deve apontar para o banco definido em `wrangler.jsonc`.
4. Cadastre os segredos `ASAAS_API_KEY` e `ASAAS_WEBHOOK_TOKEN` diretamente no Cloudflare; nunca os grave no GitHub.
5. No Asaas, configure o webhook de cobranças para `https://bhenoispodcast.com.br/api/webhooks/asaas` usando o mesmo token secreto.
6. Aplique as migrações da pasta `migrations/` no D1, uma única vez e na ordem dos nomes.
7. Para habilitar o frete, cadastre no Worker o segredo `MELHOR_ENVIO_TOKEN` e a variável `SHIPPING_ORIGIN_POSTAL_CODE`. Opcionalmente, defina `SHIPPING_USER_AGENT` com o nome e contato da integração.

## Administração e pagamentos

- O painel `/admin-lojinha.html` é protegido pelo Cloudflare Access e valida o JWT novamente no Worker.
- Produtos, até dez fotos compactadas por item, dimensões, estoque e pedidos são mantidos no D1.
- O preço enviado ao Asaas é sempre calculado no servidor, nunca aceito do navegador do cliente.
- O valor do frete é consultado e novamente validado no servidor antes da cobrança; o navegador não define o preço final.
- O checkout permite somente PIX e cartão de crédito. O cartão é informado na página segura do Asaas.
- O estoque é reservado ao criar a cobrança e devolvido automaticamente em falha, cancelamento ou estorno notificado.

## Testes

Execute `node --test test/store-api.test.mjs`. Os testes usam banco e Asaas simulados, sem criar cobranças reais.
