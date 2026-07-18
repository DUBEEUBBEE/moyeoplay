import { defineConfig, type Plugin } from 'vite';

function withTrailingSlash(value: string): string {
  return value.endsWith('/') ? value : `${value}/`;
}

function siteMetadataPlugin(siteUrl?: string): Plugin {
  const normalizedUrl = siteUrl ? withTrailingSlash(siteUrl.replace(/\/+$/, '')) : null;
  return {
    name: 'moyeoplay-site-metadata',
    transformIndexHtml(html) {
      if (!normalizedUrl) return html.replace('    <!-- moyeoplay-site-url -->\n', '');
      return html
        .replace(
          '<!-- moyeoplay-site-url -->',
          `<meta property="og:url" content="${normalizedUrl}" />\n    <link rel="canonical" href="${normalizedUrl}" />`,
        )
        .replace(
          '<meta property="og:image" content="./og-cover.png" />',
          `<meta property="og:image" content="${normalizedUrl}og-cover.png" />`,
        )
        .replace(
          '<meta name="twitter:image" content="./og-cover.png" />',
          `<meta name="twitter:image" content="${normalizedUrl}og-cover.png" />`,
        );
    },
    generateBundle() {
      const robots = [
        'User-agent: *',
        'Allow: /',
        ...(normalizedUrl ? [`Sitemap: ${normalizedUrl}sitemap.xml`] : []),
        '',
      ].join('\n');
      this.emitFile({ type: 'asset', fileName: 'robots.txt', source: robots });
      if (normalizedUrl) {
        const sitemap = [
          '<?xml version="1.0" encoding="UTF-8"?>',
          '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
          `  <url><loc>${normalizedUrl}</loc><changefreq>monthly</changefreq><priority>1.0</priority></url>`,
          '</urlset>',
          '',
        ].join('\n');
        this.emitFile({ type: 'asset', fileName: 'sitemap.xml', source: sitemap });
      }
    },
  };
}

const pagesBase = process.env.PAGES_BASE_PATH;
const base = pagesBase === undefined ? './' : withTrailingSlash(pagesBase || '/');

export default defineConfig({
  base,
  plugins: [siteMetadataPlugin(process.env.SITE_URL)],
  build: {
    target: 'es2020',
    cssCodeSplit: true,
    sourcemap: false,
  },
});
