import { chromium } from '@playwright/test';

const EXPECTED_SITE = new URL(process.env.E2E_LIVE_URL || 'https://moyeoplay.studio/');
EXPECTED_SITE.hash = '';
EXPECTED_SITE.search = '';
EXPECTED_SITE.pathname = '/';

const EXPECTED_HOST = EXPECTED_SITE.hostname;
const EXPECTED_ORIGIN = EXPECTED_SITE.origin;
const LEGACY_SITE = 'https://dubeeubbee.github.io/moyeoplay/';
const REQUIRE_BRANDED_404 = process.env.AUDIT_REQUIRE_BRANDED_404 !== 'false';
const ACCOUNT_META_PROFILE = process.env.ADSENSE_ACCOUNT_META_ENABLED ?? 'true';
const ADS_PROFILE = process.env.ADSENSE_ADS_ENABLED;
const ACCOUNT_META_EXPECTED = ACCOUNT_META_PROFILE === 'true';
const EXPECTED_CLIENT_ID = process.env.ADSENSE_CLIENT_ID?.trim() ?? '';
const CONFIGURED_ADS_ENABLED = ADS_PROFILE === undefined ? null : ADS_PROFILE === 'true';

const games = [
  'omok',
  'pong',
  'volleyball',
  'pinball-drop',
  'ladder',
  'reaction-duel',
  'tap-battle',
  'roulette',
];
const indexablePaths = [
  '',
  ...games.map((game) => `games/${game}/`),
  'about/',
  'how-to-play/',
  'fairness/',
  'privacy/',
  'terms/',
  'contact/',
];

const failures = [];

function redactSensitive(value) {
  return String(value)
    .replace(/\b(ca-pub-|pub-)(\d{4})\d+(\d{4})\b/giu, '$1$2…$3')
    .replace(
      /([?&](?:client|slot|publisher|google_ad_client|google_ad_slot)=)[^&\s]+/giu,
      '$1<redacted>',
    )
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/giu, '<redacted-email>')
    .replace(/\b\d{10,20}\b/gu, '<redacted-number>')
    .replace(/\bgoogle-site-verification=[^&\s]+/giu, 'google-site-verification=<redacted>');
}

function publicUrl(value) {
  const url = new URL(value);
  url.username = '';
  url.password = '';
  url.search = '';
  url.hash = '';
  return url.href;
}

function fail(label, detail = '') {
  failures.push(detail ? `${label}: ${redactSensitive(detail)}` : label);
}

function isGoogleAdEndpoint(value) {
  const { hostname, pathname } = new URL(value);
  return (
    /(^|\.)(?:googlesyndication|googleadservices)\.com$/iu.test(hostname) ||
    /(^|\.)doubleclick\.net$/iu.test(hostname) ||
    /^adservice\.google\./iu.test(hostname) ||
    pathname.startsWith('/pagead/')
  );
}

async function fetchPublic(url, options = {}) {
  return globalThis.fetch(url, {
    redirect: 'manual',
    signal: globalThis.AbortSignal.timeout(20_000),
    ...options,
  });
}

async function redirectProbe(sourceUrl, expectedTarget) {
  const first = await fetchPublic(sourceUrl);
  const location = first.headers.get('location');
  const resolvedTarget = location ? new URL(location, sourceUrl).href : '';
  const permanent = first.status === 301 || first.status === 308;
  const targetMatches = resolvedTarget === expectedTarget;
  const noDowngrade = !resolvedTarget || new URL(resolvedTarget).protocol === 'https:';
  let finalStatus = null;
  let loopFree = false;

  if (resolvedTarget) {
    const final = await fetchPublic(resolvedTarget);
    finalStatus = final.status;
    loopFree = final.status === 200 && !final.headers.get('location');
  }

  if (!permanent) fail('redirect is not permanent', sourceUrl);
  if (!targetMatches) fail('redirect target or path changed', sourceUrl);
  if (!noDowngrade) fail('redirect downgraded to HTTP', sourceUrl);
  if (!loopFree) fail('redirect did not terminate at one 200 response', sourceUrl);

  return {
    sourceUrl: publicUrl(sourceUrl),
    status: first.status,
    redirectChain: resolvedTarget
      ? [publicUrl(sourceUrl), publicUrl(resolvedTarget)]
      : [publicUrl(sourceUrl)],
    finalUrl: resolvedTarget ? publicUrl(resolvedTarget) : null,
    finalStatus,
    permanent,
    pathPreserved: targetMatches,
    loopFree,
    noDowngrade,
  };
}

function hasNoindexFollow(source) {
  const content =
    source.match(/<meta[^>]+name=["']robots["'][^>]+content=["']([^"']+)["']/iu)?.[1] ??
    source.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']robots["']/iu)?.[1] ??
    '';
  const tokens = new Set(
    content
      .toLowerCase()
      .split(',')
      .map((token) => token.trim()),
  );
  return tokens.has('noindex') && tokens.has('follow');
}

if (EXPECTED_SITE.protocol !== 'https:' || EXPECTED_SITE.pathname !== '/') {
  fail('live URL must be an HTTPS custom-domain root');
}
if (!['true', 'false'].includes(ACCOUNT_META_PROFILE)) {
  fail('ADSENSE_ACCOUNT_META_ENABLED must be exactly true or false');
}
if (ADS_PROFILE !== undefined && !['true', 'false'].includes(ADS_PROFILE)) {
  fail('ADSENSE_ADS_ENABLED must be exactly true or false');
}
if (CONFIGURED_ADS_ENABLED === true) {
  fail('review freeze requires ADSENSE_ADS_ENABLED=false');
}
if (EXPECTED_CLIENT_ID && !/^ca-pub-\d{16}$/u.test(EXPECTED_CLIENT_ID)) {
  fail('ADSENSE_CLIENT_ID is present but its format is invalid');
}

const report = {
  checkedAt: new Date().toISOString(),
  site: EXPECTED_SITE.href,
  reviewProfile: {
    accountMetaExpected: ACCOUNT_META_EXPECTED,
    configuredAdsEnabled: CONFIGURED_ADS_ENABLED,
    branded404Required: REQUIRE_BRANDED_404,
    sensitiveValuesLogged: false,
  },
  redirects: [],
  indexablePages: [],
  sitemap: null,
  robots: null,
  play: null,
  notFound: null,
  runtime: null,
};

let browser;

try {
  const redirectCases = [
    [`http://${EXPECTED_HOST}/`, EXPECTED_SITE.href],
    [`http://${EXPECTED_HOST}/games/omok/`, new URL('games/omok/', EXPECTED_SITE).href],
    [`https://www.${EXPECTED_HOST}/`, EXPECTED_SITE.href],
    [`https://www.${EXPECTED_HOST}/games/omok/`, new URL('games/omok/', EXPECTED_SITE).href],
    [LEGACY_SITE, EXPECTED_SITE.href],
    [new URL('games/omok/', LEGACY_SITE).href, new URL('games/omok/', EXPECTED_SITE).href],
  ];
  for (const [source, target] of redirectCases) {
    report.redirects.push(await redirectProbe(source, target));
  }

  const runtime = { adRequestCount: 0, errors: [] };
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  page.on('request', (request) => {
    if (isGoogleAdEndpoint(request.url())) runtime.adRequestCount += 1;
  });
  page.on('pageerror', (error) => runtime.errors.push(redactSensitive(error.message)));
  page.on('console', (message) => {
    if (message.type() === 'error') runtime.errors.push(redactSensitive(message.text()));
  });

  let observedAccountMeta = null;
  for (const path of indexablePaths) {
    const expectedUrl = new URL(path, EXPECTED_SITE).href;
    const response = await page.goto(expectedUrl, { waitUntil: 'load' });
    const status = response?.status() ?? null;
    const finalUrl = page.url();
    const metadata = await page.evaluate(
      ({ expectedCanonical, expectedOrigin }) => {
        const metas = [...document.querySelectorAll('meta[name="google-adsense-account"]')];
        const accountMetaValue = metas[0]?.getAttribute('content') ?? '';
        const structuredData = [...document.querySelectorAll('script[type="application/ld+json"]')];
        let structuredDataValid = structuredData.length > 0;
        const absoluteUrls = [];
        const collectUrls = (value) => {
          if (typeof value === 'string' && /^https?:\/\//u.test(value)) absoluteUrls.push(value);
          else if (Array.isArray(value)) value.forEach(collectUrls);
          else if (value && typeof value === 'object') Object.values(value).forEach(collectUrls);
        };
        for (const script of structuredData) {
          try {
            collectUrls(JSON.parse(script.textContent ?? ''));
          } catch {
            structuredDataValid = false;
          }
        }
        const canonical =
          document.querySelector('link[rel="canonical"]')?.getAttribute('href') ?? '';
        const ogUrl =
          document.querySelector('meta[property="og:url"]')?.getAttribute('content') ?? '';
        return {
          accountMetaValue,
          accountMetaCount: metas.length,
          accountMetaFormatValid:
            /^ca-pub-\d{16}$/u.test(accountMetaValue) &&
            !/(?:0000000000000000|1234567890123456)$/u.test(accountMetaValue),
          adsbygoogleCount: document.querySelectorAll('.adsbygoogle').length,
          adSlotCount: document.querySelectorAll('[data-adsense-slot]').length,
          adScriptCount: document.querySelectorAll(
            'script[src*="googlesyndication"], script[src*="googleadservices"], script[src*="doubleclick.net"], script[src*="/pagead/"]',
          ).length,
          canonicalMatches: canonical === expectedCanonical,
          canonicalHostMatches:
            Boolean(canonical) &&
            new URL(canonical, globalThis.location.href).origin === expectedOrigin,
          descriptionPresent:
            (document.querySelector('meta[name="description"]')?.getAttribute('content')?.trim()
              .length ?? 0) > 20,
          h1Count: document.querySelectorAll('h1').length,
          ogUrlMatches: ogUrl === expectedCanonical,
          structuredDataValid,
          structuredDataUrlsUseCanonicalHost: absoluteUrls.every((url) => {
            try {
              const origin = new URL(url).origin;
              return origin === expectedOrigin || origin === 'https://schema.org';
            } catch {
              return false;
            }
          }),
          titlePresent: document.title.trim().length > 10,
        };
      },
      { expectedCanonical: expectedUrl, expectedOrigin: EXPECTED_ORIGIN },
    );
    const accountMetaMatchesExpected = EXPECTED_CLIENT_ID
      ? metadata.accountMetaValue === EXPECTED_CLIENT_ID
      : null;
    const accountMetaConsistent =
      observedAccountMeta === null || observedAccountMeta === metadata.accountMetaValue;
    observedAccountMeta ??= metadata.accountMetaValue;

    const publicMetadata = {
      path: new URL(expectedUrl).pathname,
      status,
      finalUrl: publicUrl(finalUrl),
      titlePresent: metadata.titlePresent,
      descriptionPresent: metadata.descriptionPresent,
      h1Count: metadata.h1Count,
      canonicalMatches: metadata.canonicalMatches,
      canonicalHostMatches: metadata.canonicalHostMatches,
      ogUrlMatches: metadata.ogUrlMatches,
      structuredDataValid: metadata.structuredDataValid,
      structuredDataUrlsUseCanonicalHost: metadata.structuredDataUrlsUseCanonicalHost,
      accountMetaPresent: metadata.accountMetaCount === 1,
      accountMetaFormatValid: metadata.accountMetaFormatValid,
      accountMetaMatchesExpected,
      accountMetaConsistent,
      adSlotCount: metadata.adSlotCount,
      adsbygoogleCount: metadata.adsbygoogleCount,
      adScriptCount: metadata.adScriptCount,
    };
    report.indexablePages.push(publicMetadata);

    if (status !== 200 || finalUrl !== expectedUrl)
      fail('indexable URL did not return direct 200', path);
    if (
      !metadata.titlePresent ||
      !metadata.descriptionPresent ||
      metadata.h1Count !== 1 ||
      !metadata.canonicalMatches ||
      !metadata.canonicalHostMatches ||
      !metadata.ogUrlMatches ||
      !metadata.structuredDataValid ||
      !metadata.structuredDataUrlsUseCanonicalHost
    ) {
      fail('indexable metadata invariant failed', path || '/');
    }
    if (
      ACCOUNT_META_EXPECTED &&
      (metadata.accountMetaCount !== 1 ||
        !metadata.accountMetaFormatValid ||
        !accountMetaConsistent ||
        accountMetaMatchesExpected === false)
    ) {
      fail('account metadata invariant failed', path || '/');
    }
    if (!ACCOUNT_META_EXPECTED && metadata.accountMetaCount !== 0) {
      fail('account metadata exists in an off profile', path || '/');
    }
    if (
      metadata.adSlotCount !== 0 ||
      metadata.adsbygoogleCount !== 0 ||
      metadata.adScriptCount !== 0
    ) {
      fail('ad DOM or script appeared during review', path || '/');
    }
  }

  const sitemapResponse = await fetchPublic(new URL('sitemap.xml', EXPECTED_SITE));
  const sitemapSource = await sitemapResponse.text();
  const sitemapUrls = [...sitemapSource.matchAll(/<loc>([^<]+)<\/loc>/gu)]
    .map((match) => match[1])
    .filter(Boolean);
  const expectedSitemapUrls = indexablePaths.map((path) => new URL(path, EXPECTED_SITE).href);
  const sitemapExact =
    sitemapUrls.length === 15 &&
    new Set(sitemapUrls).size === 15 &&
    sitemapUrls.every((url, index) => url === expectedSitemapUrls[index]) &&
    sitemapUrls.every(
      (url) => url.startsWith(EXPECTED_SITE.href) && !url.includes('/play/') && !url.includes('#'),
    );
  report.sitemap = {
    status: sitemapResponse.status,
    contentTypeReadable: sitemapResponse.headers.get('content-type')?.includes('xml') === true,
    urlCount: sitemapUrls.length,
    uniqueUrlCount: new Set(sitemapUrls).size,
    exactCanonicalSet: sitemapExact,
  };
  if (sitemapResponse.status !== 200 || !report.sitemap.contentTypeReadable || !sitemapExact) {
    fail('sitemap invariant failed');
  }

  const robotsResponse = await fetchPublic(new URL('robots.txt', EXPECTED_SITE));
  const robotsSource = await robotsResponse.text();
  report.robots = {
    status: robotsResponse.status,
    contentTypeReadable:
      robotsResponse.headers.get('content-type')?.includes('text/plain') === true,
    allowsRoot: /^\s*Allow:\s*\/\s*$/imu.test(robotsSource),
    advertisesCanonicalSitemap: robotsSource.includes(
      `Sitemap: ${new URL('sitemap.xml', EXPECTED_SITE).href}`,
    ),
    blocksPlay: /^\s*Disallow:\s*\/play(?:\/|$)/imu.test(robotsSource),
  };
  if (
    robotsResponse.status !== 200 ||
    !report.robots.contentTypeReadable ||
    !report.robots.allowsRoot ||
    !report.robots.advertisesCanonicalSitemap ||
    report.robots.blocksPlay
  ) {
    fail('robots invariant failed');
  }

  const playResponse = await page.goto(new URL('play/#lobby', EXPECTED_SITE).href, {
    waitUntil: 'load',
  });
  const playMetadata = await page.evaluate(() => ({
    robots: document.querySelector('meta[name="robots"]')?.getAttribute('content') ?? '',
    accountMetaCount: document.querySelectorAll('meta[name="google-adsense-account"]').length,
    adSlotCount: document.querySelectorAll('[data-adsense-slot]').length,
    adsbygoogleCount: document.querySelectorAll('.adsbygoogle').length,
    adScriptCount: document.querySelectorAll(
      'script[src*="googlesyndication"], script[src*="googleadservices"], script[src*="doubleclick.net"], script[src*="/pagead/"]',
    ).length,
    lobbyCardCount: document.querySelectorAll('#game-grid article.game-card').length,
  }));
  report.play = {
    status: playResponse?.status() ?? null,
    finalUrl: publicUrl(page.url()),
    noindexFollow: playMetadata.robots === 'noindex,follow',
    accountMetaCount: playMetadata.accountMetaCount,
    adSlotCount: playMetadata.adSlotCount,
    adsbygoogleCount: playMetadata.adsbygoogleCount,
    adScriptCount: playMetadata.adScriptCount,
    lobbyCardCount: playMetadata.lobbyCardCount,
  };
  if (
    playResponse?.status() !== 200 ||
    !report.play.noindexFollow ||
    playMetadata.accountMetaCount !== 0 ||
    playMetadata.adSlotCount !== 0 ||
    playMetadata.adsbygoogleCount !== 0 ||
    playMetadata.adScriptCount !== 0 ||
    playMetadata.lobbyCardCount !== 8
  ) {
    fail('/play/ noindex or no-ads invariant failed');
  }

  const unknownUrl = new URL('this-page-should-not-exist/', EXPECTED_SITE);
  const unknownResponse = await fetchPublic(unknownUrl);
  const unknownSource = await unknownResponse.text();
  const branded404 =
    unknownSource.includes('모여PLAY') &&
    unknownSource.includes('페이지를 찾을 수 없습니다') &&
    unknownSource.includes(`href="${EXPECTED_SITE.pathname}"`) &&
    unknownSource.includes(`href="${EXPECTED_SITE.pathname}#games"`) &&
    unknownSource.includes(`href="${EXPECTED_SITE.pathname}contact/"`);
  const clean404 =
    !/name=["']google-adsense-account["']|data-adsense-slot|class=["']adsbygoogle|type=["']application\/ld\+json|rel=["']canonical/iu.test(
      unknownSource,
    );
  const noindexFollow = hasNoindexFollow(unknownSource);
  const unknownAssetResponse = await fetchPublic(
    new URL('assets/this-asset-should-not-exist.js', EXPECTED_SITE),
  );
  report.notFound = {
    pageStatus: unknownResponse.status,
    assetStatus: unknownAssetResponse.status,
    branded: branded404,
    noindexFollow,
    noCanonicalStructuredDataOrAds: clean404,
    soft404Prevented: unknownResponse.status === 404 && unknownAssetResponse.status === 404,
  };
  if (!report.notFound.soft404Prevented) fail('unknown route or asset returned a soft 404');
  if (REQUIRE_BRANDED_404 && (!branded404 || !noindexFollow || !clean404)) {
    fail('deployed custom 404 contract failed');
  }

  report.runtime = {
    adRequestCount: runtime.adRequestCount,
    errorCount: runtime.errors.length,
    redactedErrors: runtime.errors,
  };
  if (runtime.adRequestCount !== 0) fail('Google ad request occurred during review');
  if (runtime.errors.length !== 0) fail('console or page errors occurred');

  await context.close();
} catch (error) {
  fail('live audit crashed', error instanceof Error ? error.message : String(error));
} finally {
  await browser?.close();
}

report.ok = failures.length === 0;
report.failureCount = failures.length;
report.failures = failures;

console.log(JSON.stringify(report, null, 2));
if (!report.ok) process.exitCode = 1;
