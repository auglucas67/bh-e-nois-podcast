import { cp, mkdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = process.cwd();
const output = resolve(root, 'dist');
const files = ['index.html', 'lojinha.html', 'admin-lojinha.html', 'robots.txt', 'sitemap.xml', 'styles.css', 'logo-fix.css', 'episodes-real.css', 'support-tiers.css', 'lojinha.css', 'admin-loja.js', 'script.js', 'loja.js', 'logo-bh-e-nois.png', 'products.json', 'supporters.json'];

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await Promise.all(files.map((file) => cp(resolve(root, file), resolve(output, file))));
console.log(`Cloudflare assets prontos em ${output}`);
