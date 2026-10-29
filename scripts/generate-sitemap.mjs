import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PUBLIC_SEO_ROUTES } from '../src/lib/publicSeo.js';

const siteOrigin = 'https://goalquestleague.com.ng';
const sitemapPath = fileURLToPath(new URL('../public/sitemap.xml', import.meta.url));
const robotsPath = fileURLToPath(new URL('../public/robots.txt', import.meta.url));

const entries = PUBLIC_SEO_ROUTES.map(({ path, priority }) => {
  const frequency = path === '/' ? 'weekly' : path === '/leaderboard' ? 'daily' : 'monthly';
  return [
    '  <url>',
    `    <loc>${siteOrigin}${path}</loc>`,
    `    <changefreq>${frequency}</changefreq>`,
    `    <priority>${priority || (path === '/' ? '1.0' : '0.7')}</priority>`,
    '  </url>',
  ].join('\n');
});

writeFileSync(
  sitemapPath,
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries.join('\n')}\n</urlset>\n`,
);
writeFileSync(
  robotsPath,
  [
    'User-agent: *',
    'Allow: /',
    'Disallow: /admin',
    'Disallow: /dashboard',
    'Disallow: /fixtures',
    'Disallow: /forgot-password',
    'Disallow: /login',
    'Disallow: /squad-registration',
    'Disallow: /standings',
    'Disallow: /transfer-window',
    `Sitemap: ${siteOrigin}/sitemap.xml`,
    '',
  ].join('\n'),
);
