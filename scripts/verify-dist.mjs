import { access, readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { GAME_CONTENT, PAGE_CONTENT } from '../site/site-content.mjs';
import { resolveSiteConfig } from './site-config.mjs';

const config = resolveSiteConfig();
const outputDirectory = config.outputDirectory;
const textAssetPattern = /\.(?:css|html|js|json|txt|webmanifest|xml)$/;
const requiredHtml = [
  'index.html',
  'play/index.html',
  ...GAME_CONTENT.map((game) => `games/${game.slug}/index.html`),
  ...Object.entries(PAGE_CONTENT)
    .filter(([key]) => key !== 'root')
    .map(([, page]) => `${page.slug}/index.html`),
];

async function listFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const target = path.join(directory, entry.name);
      return entry.isDirectory() ? listFiles(target) : [target];
    }),
  );
  return nested.flat();
}

async function exists(file) {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

function fail(errors, message) {
  errors.push(message);
}

const files = await listFiles(outputDirectory);
const relativeFiles = new Set(files.map((file) => path.relative(outputDirectory, file)));
const errors = [];

for (const relativePath of requiredHtml) {
  if (!relativeFiles.has(relativePath)) fail(errors, `Missing HTML entry: ${relativePath}`);
}

const sourceMaps = files.filter((file) => file.endsWith('.map'));
if (sourceMaps.length > 0) {
  fail(
    errors,
    `Unexpected source maps: ${sourceMaps.map((file) => path.relative(outputDirectory, file)).join(', ')}`,
  );
}

const textSources = new Map();
for (const file of files.filter((target) => textAssetPattern.test(target))) {
  textSources.set(path.relative(outputDirectory, file), await readFile(file, 'utf8'));
}
for (const [relativePath, source] of textSources) {
  if (source.includes('/src/main.ts') || source.includes('/src/static-site.ts')) {
    fail(errors, `Development entry reference remains in ${relativePath}.`);
  }
  if (/\{\{[^}]+\}\}|__MOYEOPLAY_[A-Z_]+__/.test(source)) {
    fail(errors, `Unresolved template token remains in ${relativePath}.`);
  }
}

const indexSource = textSources.get('index.html') ?? '';
if (!indexSource.includes('<h1>') || !indexSource.includes('games/omok/')) {
  fail(errors, 'Root landing is missing crawlable heading or game guide links.');
}
if (
  !indexSource.includes('assets/hero/party-diorama.avif') ||
  !indexSource.includes('assets/hero/party-diorama.webp')
) {
  fail(errors, 'Root landing is missing the optimized clay hero picture sources.');
}
const playSource = textSources.get('play/index.html') ?? '';
if (!playSource.includes('noindex,follow')) fail(errors, '/play/ must be noindex,follow.');
if (playSource.includes('data-adsense-slot') || playSource.includes('adsbygoogle')) {
  fail(errors, '/play/ must never contain an AdSense slot.');
}

const canonicals = [];
const titles = [];
const descriptions = [];
for (const relativePath of requiredHtml.filter((entry) => entry !== 'play/index.html')) {
  const source = textSources.get(relativePath) ?? '';
  const canonical = source.match(/<link rel="canonical" href="([^"]+)"/u)?.[1];
  const title = source.match(/<title>([^<]+)<\/title>/u)?.[1];
  const description = source.match(/<meta name="description" content="([^"]+)"/u)?.[1];
  if (!canonical || !title || !description || !source.includes('<h1')) {
    fail(errors, `${relativePath} is missing canonical, title, description, or h1.`);
    continue;
  }
  const openGraphImageAlts = source.match(/<meta property="og:image:alt"/gu) ?? [];
  const twitterImageAlts = source.match(/<meta name="twitter:image:alt"/gu) ?? [];
  if (openGraphImageAlts.length !== 1 || twitterImageAlts.length !== 1) {
    fail(errors, `${relativePath} must contain exactly one OG and Twitter image alt.`);
  }
  canonicals.push(canonical);
  titles.push(title);
  descriptions.push(description);
  const structuredData = source.match(
    /<script type="application\/ld\+json">([^<]+)<\/script>/u,
  )?.[1];
  if (!structuredData) fail(errors, `${relativePath} is missing JSON-LD.`);
  else {
    try {
      JSON.parse(structuredData);
    } catch {
      fail(errors, `${relativePath} contains invalid JSON-LD.`);
    }
  }
}
for (const [label, values] of [
  ['canonical', canonicals],
  ['title', titles],
  ['description', descriptions],
]) {
  if (new Set(values).size !== 15) fail(errors, `Indexable ${label} values must be unique.`);
}

const sitemapSource = textSources.get('sitemap.xml') ?? '';
const sitemapUrls = [...sitemapSource.matchAll(/<loc>([^<]+)<\/loc>/gu)].map((match) => match[1]);
if (
  sitemapUrls.length !== 15 ||
  new Set(sitemapUrls).size !== 15 ||
  sitemapUrls.some((url) => url.includes('#') || url.includes('/play/'))
) {
  fail(errors, 'sitemap.xml must contain 15 unique clean indexable URLs and exclude /play/.');
}
if (sitemapUrls.some((url) => !url.startsWith(config.siteUrl))) {
  fail(errors, 'sitemap.xml contains a URL outside SITE_URL.');
}

const cnameExists = await exists(path.join(outputDirectory, 'CNAME'));
const robotsExists = await exists(path.join(outputDirectory, 'robots.txt'));
const adsTxtExists = await exists(path.join(outputDirectory, 'ads.txt'));
if (config.customDomain) {
  if (!cnameExists) fail(errors, 'Custom-domain output needs CNAME.');
  else if (
    (await readFile(path.join(outputDirectory, 'CNAME'), 'utf8')).trim() !== config.customDomain
  ) {
    fail(errors, 'CNAME does not match CUSTOM_DOMAIN.');
  }
} else if (cnameExists) fail(errors, 'CNAME exists without CUSTOM_DOMAIN.');
if (config.basePath === '/') {
  if (!robotsExists) fail(errors, 'Root-base output needs robots.txt.');
  if (config.adsense.publisherId) {
    if (!adsTxtExists) fail(errors, 'A configured root publisher requires ads.txt.');
    else {
      const expected = `google.com, ${config.adsense.publisherId}, DIRECT, f08c47fec0942fa0`;
      if ((await readFile(path.join(outputDirectory, 'ads.txt'), 'utf8')).trim() !== expected) {
        fail(errors, 'ads.txt does not match the configured publisher.');
      }
    }
  } else if (adsTxtExists) fail(errors, 'ads.txt exists without a publisher ID.');
} else if (robotsExists || adsTxtExists) {
  fail(errors, 'Project-path output must not claim host-root robots.txt or ads.txt.');
}

const indexableHtml = requiredHtml
  .filter((entry) => entry !== 'play/index.html')
  .map((entry) => textSources.get(entry) ?? '')
  .join('\n');
if (!config.adsense.enabled && /data-adsense-slot|class="adsbygoogle"/.test(indexableHtml)) {
  fail(errors, 'Disabled AdSense output contains ad DOM.');
}
if (config.adsense.enabled && !/data-adsense-slot/.test(indexableHtml)) {
  fail(errors, 'Enabled AdSense output is missing content-page slots.');
}
if (!config.adsense.testMode) {
  const allText = [...textSources.values()].join('\n');
  if (allText.includes('1234567890123456') || allText.includes('moyeoplay.example')) {
    fail(errors, 'Test AdSense IDs or reserved test domains leaked into deployable output.');
  }
}

const manifest = JSON.parse(textSources.get('manifest.webmanifest') ?? '{}');
if (
  manifest.id !== config.basePath ||
  manifest.scope !== config.basePath ||
  manifest.start_url !== `${config.basePath}play/#lobby`
) {
  fail(errors, 'Manifest identity/scope changed or start_url does not target /play/#lobby.');
}
const expectedManifestIcons = [
  'icon-192.png',
  'icon-512.png',
  'icon-maskable-512.png',
  'favicon.svg',
];
if (
  !Array.isArray(manifest.icons) ||
  manifest.icons.some((icon) => !icon.src.startsWith(config.basePath)) ||
  !expectedManifestIcons.every((name) =>
    manifest.icons.some((icon) => icon.src === `${config.basePath}${name}`),
  )
) {
  fail(errors, 'Manifest icon URLs must use the active deployment base path.');
}

const heroAssets = [
  { extension: 'avif', budget: 180 * 1024 },
  { extension: 'webp', budget: 280 * 1024 },
  { extension: 'jpg', budget: 350 * 1024 },
];
for (const asset of heroAssets) {
  const relativePath = `assets/hero/party-diorama.${asset.extension}`;
  const heroPath = path.join(outputDirectory, relativePath);
  if (!(await exists(heroPath))) {
    fail(errors, `Missing clay hero asset: ${relativePath}`);
    continue;
  }
  const [metadata, size] = await Promise.all([sharp(heroPath).metadata(), stat(heroPath)]);
  if (metadata.width !== 1440 || metadata.height !== 810) {
    fail(errors, `${relativePath} must be 1440x810.`);
  }
  if (size.size > asset.budget) {
    fail(errors, `${relativePath} exceeds ${(asset.budget / 1024).toFixed(0)}KB.`);
  }
}

for (const game of GAME_CONTENT) {
  for (const extension of ['avif', 'webp', 'png']) {
    const relativePath = `assets/game-icons/${game.id}.${extension}`;
    if (!relativeFiles.has(relativePath)) fail(errors, `Missing game icon: ${relativePath}`);
    if (extension !== 'png' && relativeFiles.has(relativePath)) {
      const size = (await stat(path.join(outputDirectory, relativePath))).size;
      if (size > 40 * 1024) fail(errors, `${relativePath} exceeds 40KB.`);
    }
  }
  const screenshotPath = path.join(outputDirectory, `assets/screenshots/${game.id}.webp`);
  if (!(await exists(screenshotPath))) fail(errors, `Missing game screenshot: ${game.id}.webp`);
  else {
    const metadata = await sharp(screenshotPath).metadata();
    if (metadata.width !== 1280 || metadata.height !== 720) {
      fail(errors, `${game.id}.webp must be 1280x720.`);
    }
  }
  const ogPath = path.join(outputDirectory, `assets/og/${game.id}.png`);
  if (!(await exists(ogPath))) fail(errors, `Missing game OG image: ${game.id}.png`);
  else {
    const metadata = await sharp(ogPath).metadata();
    if (metadata.width !== 1200 || metadata.height !== 630) {
      fail(errors, `${game.id} OG image must be 1200x630.`);
    }
  }
}

if (errors.length > 0) {
  for (const error of errors) console.error(error);
  process.exitCode = 1;
} else {
  console.log(
    `Verified ${String(files.length)} production files, 16 routes, 15 sitemap URLs, dual-profile root rules, one responsive clay hero, and eight optimized game asset sets.`,
  );
}
