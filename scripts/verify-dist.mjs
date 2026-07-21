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
const indexableRoutes = [
  { file: 'index.html', path: '' },
  ...GAME_CONTENT.map((game) => ({
    file: `games/${game.slug}/index.html`,
    path: `games/${game.slug}/`,
  })),
  ...Object.entries(PAGE_CONTENT)
    .filter(([key]) => key !== 'root')
    .map(([, page]) => ({ file: `${page.slug}/index.html`, path: page.path.replace(/^\/+/, '') })),
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

function collectAbsoluteUrls(value, urls = []) {
  if (typeof value === 'string' && /^https?:\/\//u.test(value)) urls.push(value);
  else if (Array.isArray(value)) {
    for (const item of value) collectAbsoluteUrls(item, urls);
  } else if (value && typeof value === 'object') {
    for (const item of Object.values(value)) collectAbsoluteUrls(item, urls);
  }
  return urls;
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
if (!config.adsense.testMode) {
  const deployableText = [...textSources.values()].join('\n');
  const forbiddenMarkers = [
    'https://dubeeubbee.github.io/moyeoplay',
    'moyeoplay.example',
    'ca-pub-0000000000000000',
    'ca-pub-1234567890123456',
    'pub-1234567890123456',
    '/Users/',
    '.generated-pages',
    'file://',
  ];
  for (const marker of forbiddenMarkers) {
    if (deployableText.includes(marker))
      fail(errors, `Deployable output contains forbidden marker: ${marker}`);
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
if (!playSource.includes('<body class="play-app" data-view="lobby">')) {
  fail(errors, '/play/ must render with the bright lobby theme before JavaScript starts.');
}
if (playSource.includes('data-adsense-slot') || playSource.includes('adsbygoogle')) {
  fail(errors, '/play/ must never contain an AdSense slot.');
}

const canonicals = [];
const titles = [];
const descriptions = [];
for (const route of indexableRoutes) {
  const relativePath = route.file;
  const source = textSources.get(relativePath) ?? '';
  const canonical = source.match(/<link rel="canonical" href="([^"]+)"/u)?.[1];
  const openGraphUrl = source.match(/<meta property="og:url" content="([^"]+)"/u)?.[1];
  const openGraphImage = source.match(/<meta property="og:image" content="([^"]+)"/u)?.[1];
  const twitterImage = source.match(/<meta name="twitter:image" content="([^"]+)"/u)?.[1];
  const title = source.match(/<title>([^<]+)<\/title>/u)?.[1];
  const description = source.match(/<meta name="description" content="([^"]+)"/u)?.[1];
  const h1Count = source.match(/<h1(?:\s|>)/gu)?.length ?? 0;
  const expectedCanonical = new URL(route.path, config.siteUrl).href;
  if (!canonical || !title || !description || h1Count !== 1) {
    fail(errors, `${relativePath} is missing canonical, title, description, or h1.`);
    continue;
  }
  if (canonical !== expectedCanonical || openGraphUrl !== expectedCanonical) {
    fail(errors, `${relativePath} canonical and og:url must equal ${expectedCanonical}.`);
  }
  if (
    !openGraphImage?.startsWith(config.siteUrl) ||
    !twitterImage?.startsWith(config.siteUrl) ||
    openGraphImage !== twitterImage
  ) {
    fail(errors, `${relativePath} OG and Twitter images must share the configured site origin.`);
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
      const parsed = JSON.parse(structuredData);
      const outsideSiteUrls = collectAbsoluteUrls(parsed).filter(
        (url) => !url.startsWith(config.siteUrl) && !url.startsWith('https://schema.org'),
      );
      if (outsideSiteUrls.length > 0) {
        fail(errors, `${relativePath} JSON-LD contains URLs outside SITE_URL.`);
      }
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
const expectedSitemapUrls = new Set(
  indexableRoutes.map((route) => new URL(route.path, config.siteUrl).href),
);
if (sitemapUrls.some((url) => !expectedSitemapUrls.has(url))) {
  fail(errors, 'sitemap.xml does not match the expected 15 canonical routes.');
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
  else {
    const robotsSource = await readFile(path.join(outputDirectory, 'robots.txt'), 'utf8');
    if (
      !robotsSource.includes(`Sitemap: ${new URL('sitemap.xml', config.siteUrl).href}`) ||
      /Disallow:\s*\/play\//iu.test(robotsSource)
    ) {
      fail(errors, 'robots.txt must advertise the configured sitemap without blocking /play/.');
    }
  }
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
const playAccountMetaCount = playSource.match(/name="google-adsense-account"/gu)?.length ?? 0;
if (playAccountMetaCount !== 0) fail(errors, '/play/ must not contain AdSense account metadata.');
for (const route of indexableRoutes) {
  const source = textSources.get(route.file) ?? '';
  const accountMetaCount = source.match(/name="google-adsense-account"/gu)?.length ?? 0;
  const expectedMetaCount = config.adsense.accountMetaEnabled ? 1 : 0;
  if (accountMetaCount !== expectedMetaCount) {
    fail(errors, `${route.file} has an unexpected AdSense account meta count.`);
  }
  if (
    config.adsense.accountMetaEnabled &&
    !source.includes(`content="${config.adsense.clientId}"`)
  ) {
    fail(errors, `${route.file} AdSense account metadata does not match ADSENSE_CLIENT_ID.`);
  }
  if (/pagead2\.googlesyndication\.com[^<]*<\/script>/iu.test(source)) {
    fail(errors, `${route.file} must not preload the Google ad script before consent.`);
  }
  const slotCount = source.match(/data-adsense-slot/gu)?.length ?? 0;
  const allowsSlot = route.file === 'index.html' || route.file.startsWith('games/');
  const expectedSlotCount = config.adsense.adsEnabled && allowsSlot ? 1 : 0;
  if (slotCount !== expectedSlotCount) {
    fail(errors, `${route.file} has an unexpected manual ad slot count.`);
  }
}
if (!config.adsense.adsEnabled && /data-adsense-slot|class="adsbygoogle"/.test(indexableHtml)) {
  fail(errors, 'Disabled AdSense output contains ad DOM.');
}
if (config.adsense.adsEnabled && !/data-adsense-slot/.test(indexableHtml)) {
  fail(errors, 'Enabled AdSense output is missing content-page slots.');
}
const privacySource = textSources.get('privacy/index.html') ?? '';
const expectedPrivacyProfile = config.adsense.adsEnabled
  ? config.adsense.testMode
    ? 'ads-enabled-test'
    : 'ads-enabled'
  : config.adsense.accountMetaEnabled
    ? 'account-meta-only'
    : 'off';
if (!privacySource.includes(`data-privacy-ad-profile="${expectedPrivacyProfile}"`)) {
  fail(errors, 'Privacy page does not describe the active AdSense build profile.');
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

const faviconSource = await readFile(path.join(outputDirectory, 'favicon.svg'), 'utf8');
if (
  !faviconSource.includes('#1f65d6') ||
  !faviconSource.includes('#fffdf8') ||
  /#(?:07111f|ffd447)/iu.test(faviconSource)
) {
  fail(errors, 'Favicon must use the current blue and warm-white brand mark.');
}
if (!indexSource.includes('type="image/svg+xml" sizes="any"')) {
  fail(errors, 'Root favicon declaration must identify the scalable icon with sizes="any".');
}
if (!indexSource.includes('rel="apple-touch-icon"') || !indexSource.includes('sizes="180x180"')) {
  fail(errors, 'Root apple touch icon declaration must include its 180x180 size.');
}

const brandIconSpecs = [
  { name: 'apple-touch-icon.png', width: 180, height: 180 },
  { name: 'icon-192.png', width: 192, height: 192 },
  { name: 'icon-512.png', width: 512, height: 512 },
  { name: 'icon-maskable-512.png', width: 512, height: 512 },
];
for (const icon of brandIconSpecs) {
  const iconPath = path.join(outputDirectory, icon.name);
  if (!(await exists(iconPath))) {
    fail(errors, `Missing brand icon: ${icon.name}`);
    continue;
  }
  const [metadata, imageStats] = await Promise.all([
    sharp(iconPath).metadata(),
    sharp(iconPath).stats(),
  ]);
  if (metadata.width !== icon.width || metadata.height !== icon.height) {
    fail(errors, `${icon.name} must be ${icon.width}x${icon.height}.`);
  }
  const dominant = imageStats.dominant;
  if (dominant.b < 120 || dominant.b <= dominant.r * 1.25 || dominant.b <= dominant.g * 1.08) {
    fail(errors, `${icon.name} must be dominated by the current blue brand tile.`);
  }
}

const rootOgPath = path.join(outputDirectory, 'og-cover.png');
if (!(await exists(rootOgPath))) fail(errors, 'Missing root OG image: og-cover.png');
else {
  const [metadata, size, imageStats] = await Promise.all([
    sharp(rootOgPath).metadata(),
    stat(rootOgPath),
    sharp(rootOgPath).stats(),
  ]);
  if (metadata.width !== 1200 || metadata.height !== 630) {
    fail(errors, 'og-cover.png must be 1200x630.');
  }
  if (size.size > 320 * 1024) fail(errors, 'og-cover.png exceeds the 320KB budget.');
  const mean =
    imageStats.channels.slice(0, 3).reduce((total, channel) => total + channel.mean, 0) / 3;
  if (mean < 170) fail(errors, 'og-cover.png must use the bright clay brand surface.');
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
    const [metadata, size, imageStats] = await Promise.all([
      sharp(ogPath).metadata(),
      stat(ogPath),
      sharp(ogPath).stats(),
    ]);
    if (metadata.width !== 1200 || metadata.height !== 630) {
      fail(errors, `${game.id} OG image must be 1200x630.`);
    }
    if (size.size > 360 * 1024) fail(errors, `${game.id} OG image exceeds 360KB.`);
    const mean =
      imageStats.channels.slice(0, 3).reduce((total, channel) => total + channel.mean, 0) / 3;
    if (mean < 165) fail(errors, `${game.id} OG image must use the bright clay brand surface.`);
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
