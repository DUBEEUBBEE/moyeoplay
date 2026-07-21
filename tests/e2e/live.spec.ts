import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

const processEnv =
  (Reflect.get(globalThis, 'process') as { env?: Record<string, string | undefined> } | undefined)
    ?.env ?? {};
const e2eMode = processEnv.E2E_MODE ?? 'dev';
const checkRedirects = processEnv.E2E_CHECK_REDIRECTS === 'true';
const expectedAdsenseClientId = processEnv.ADSENSE_CLIENT_ID?.trim() ?? '';
const expectedAdsensePublisherId = processEnv.ADSENSE_PUBLISHER_ID?.trim() ?? '';
const accountMetaEnabled = processEnv.ADSENSE_ACCOUNT_META_ENABLED === 'true';
const adsEnabled = processEnv.ADSENSE_ADS_ENABLED === 'true';
const EXPECTED_SITE = 'https://moyeoplay.studio/';
const EXPECTED_HOST = 'moyeoplay.studio';
const SOFT_404_PATTERN = /(?:\b404\b|not found|페이지를? 찾을 수|찾을 수 없습니다|페이지 없음)/iu;

const games = [
  'omok',
  'pong',
  'volleyball',
  'pinball-drop',
  'ladder',
  'reaction-duel',
  'tap-battle',
  'roulette',
] as const;
const indexableRoutes = [
  { label: '홈', path: '' },
  ...games.map((game) => ({ label: game, path: `games/${game}/` })),
  { label: '소개', path: 'about/' },
  { label: '이용 방법', path: 'how-to-play/' },
  { label: '공정성', path: 'fairness/' },
  { label: '개인정보', path: 'privacy/' },
  { label: '이용약관', path: 'terms/' },
  { label: '문의', path: 'contact/' },
] as const;

function requireAssetUrl(value: string | undefined, label: string): string {
  expect(value, label).toBeTruthy();
  if (!value) throw new Error(`Missing required asset URL: ${label}`);
  return value;
}

function expectCustomBaseUrl(baseURL: string | undefined): void {
  expect(baseURL, 'live smoke must target the canonical custom-domain root').toBe(EXPECTED_SITE);
  if (!baseURL) throw new Error('Missing Playwright baseURL.');
  const configuredUrl = new URL(baseURL);
  expect(configuredUrl.protocol).toBe('https:');
  expect(configuredUrl.hostname).toBe(EXPECTED_HOST);
  expect(configuredUrl.pathname).toBe('/');
}

function isGoogleAdEndpoint(value: string): boolean {
  const { hostname, pathname } = new URL(value);
  return (
    /(^|\.)(?:googlesyndication|googleadservices)\.com$/iu.test(hostname) ||
    /(^|\.)doubleclick\.net$/iu.test(hostname) ||
    /^adservice\.google\./iu.test(hostname) ||
    pathname.startsWith('/pagead/')
  );
}

function monitorPage(page: Page): { adRequests: string[]; errors: string[] } {
  const adRequests: string[] = [];
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('request', (browserRequest) => {
    if (isGoogleAdEndpoint(browserRequest.url())) adRequests.push(browserRequest.url());
  });
  return { adRequests, errors };
}

function expectNoRuntimeFailures(signals: { adRequests: string[]; errors: string[] }): void {
  expect(signals.errors, 'live pages must not emit console errors or uncaught exceptions').toEqual(
    [],
  );
  expect(
    signals.adRequests,
    'the live profile must not request Google ad endpoints before granted consent',
  ).toEqual([]);
}

async function expectNoHorizontalOverflow(page: Page, label: string): Promise<void> {
  const dimensions = await page.evaluate(() => ({
    bodyScrollWidth: document.body.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    documentScrollWidth: document.documentElement.scrollWidth,
  }));
  expect(
    Math.max(dimensions.bodyScrollWidth, dimensions.documentScrollWidth),
    `${label} must fit the viewport without horizontal overflow`,
  ).toBeLessThanOrEqual(dimensions.clientWidth + 1);
}

async function expectPermanentRedirect(
  request: APIRequestContext,
  sourceUrl: string,
  expectedTarget: string,
): Promise<void> {
  const response = await request.get(sourceUrl, {
    failOnStatusCode: false,
    maxRedirects: 0,
  });
  expect([301, 308], `${sourceUrl} must use a permanent redirect`).toContain(response.status());
  const location = response.headers().location;
  expect(location, `${sourceUrl} must provide a redirect target`).toBeTruthy();
  if (!location) throw new Error(`Missing redirect location for ${sourceUrl}`);
  const target = new URL(location, sourceUrl).href;
  expect(target).toBe(expectedTarget);
  expect(target).not.toBe(sourceUrl);

  const targetResponse = await request.get(target, {
    failOnStatusCode: false,
    maxRedirects: 0,
  });
  expect(targetResponse.status(), `${sourceUrl} must not enter a redirect loop`).toBe(200);
  expect(targetResponse.headers().location).toBeUndefined();
}

test.describe('live custom-domain smoke', () => {
  test.skip(e2eMode !== 'live', 'runs only against the deployed custom-domain URL');

  test('15 indexable routes are real custom-domain documents rather than soft 404s', async ({
    baseURL,
    page,
  }) => {
    expectCustomBaseUrl(baseURL);
    const signals = monitorPage(page);
    const titles = new Set<string>();

    for (const route of indexableRoutes) {
      const expectedUrl = new URL(route.path, EXPECTED_SITE).href;
      const response = await page.goto(expectedUrl, { waitUntil: 'load' });
      expect(response?.status(), route.label).toBe(200);

      const metadata = await page.evaluate(() => ({
        adsenseAccount:
          document.querySelector<HTMLMetaElement>('meta[name="google-adsense-account"]')?.content ??
          '',
        adsbygoogleElements: document.querySelectorAll('.adsbygoogle').length,
        adsenseSlots: document.querySelectorAll('[data-adsense-slot]').length,
        googleAdScripts: document.querySelectorAll(
          'script[src*="googlesyndication"], script[src*="googleadservices"], script[src*="doubleclick.net"], script[src*="/pagead/"]',
        ).length,
        canonical: document.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href,
        h1Count: document.querySelectorAll('h1').length,
        h1Text: document.querySelector('h1')?.textContent.trim() ?? '',
        mainText: document.querySelector('main')?.textContent.trim() ?? '',
        ogUrl: document.querySelector<HTMLMetaElement>('meta[property="og:url"]')?.content,
        title: document.title.trim(),
      }));

      expect(metadata.h1Count, route.label).toBe(1);
      expect(metadata.h1Text.length, route.label).toBeGreaterThan(1);
      expect(metadata.title.length, route.label).toBeGreaterThan(10);
      expect(metadata.mainText.length, route.label).toBeGreaterThan(250);
      expect(
        SOFT_404_PATTERN.test(`${metadata.title}\n${metadata.h1Text}\n${metadata.mainText}`),
        `${route.label} must not render a soft-404 document`,
      ).toBe(false);
      expect(metadata.canonical, route.label).toBe(expectedUrl);
      expect(metadata.ogUrl, route.label).toBe(expectedUrl);
      if (accountMetaEnabled) {
        expect(expectedAdsenseClientId).toMatch(/^ca-pub-\d{16}$/u);
        expect(metadata.adsenseAccount, route.label).toBe(expectedAdsenseClientId);
      } else {
        expect(metadata.adsenseAccount, route.label).toBe('');
      }
      const isAdEligible = route.path === '' || route.path.startsWith('games/');
      const expectedAdElementCount = adsEnabled && isAdEligible ? 1 : 0;
      expect(metadata.adsenseSlots, route.label).toBe(expectedAdElementCount);
      expect(metadata.adsbygoogleElements, route.label).toBe(expectedAdElementCount);
      expect(metadata.googleAdScripts, route.label).toBe(0);
      titles.add(metadata.title);
    }

    expect(titles.size).toBe(indexableRoutes.length);
    expectNoRuntimeFailures(signals);
  });

  test('root artifacts and the play surface keep the custom-domain no-ads contract', async ({
    baseURL,
    page,
    request,
  }) => {
    expectCustomBaseUrl(baseURL);
    const signals = monitorPage(page);
    const response = await page.goto(EXPECTED_SITE, { waitUntil: 'load' });
    expect(response?.status()).toBe(200);
    await expect(page.locator('article.static-game-card')).toHaveCount(8);

    const metadata = await page.evaluate(() => ({
      appleIcon: document.querySelector<HTMLLinkElement>('link[rel="apple-touch-icon"]')?.href,
      adsenseAccount:
        document.querySelector<HTMLMetaElement>('meta[name="google-adsense-account"]')?.content ??
        '',
      icon: document.querySelector<HTMLLinkElement>('link[rel="icon"]')?.href,
      manifest: document.querySelector<HTMLLinkElement>('link[rel="manifest"]')?.href,
      ogImage: document.querySelector<HTMLMetaElement>('meta[property="og:image"]')?.content,
      scripts: [...document.querySelectorAll<HTMLScriptElement>('script[src]')].map(
        (element) => element.src,
      ),
      styles: [...document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')].map(
        (element) => element.href,
      ),
      twitterImage: document.querySelector<HTMLMetaElement>('meta[name="twitter:image"]')?.content,
    }));
    const expectedOgImage = new URL('og-cover.png', EXPECTED_SITE).href;
    expect(metadata.ogImage).toBe(expectedOgImage);
    expect(metadata.twitterImage).toBe(expectedOgImage);
    if (accountMetaEnabled) {
      expect(
        expectedAdsenseClientId,
        'live account-meta profile requires the expected client ID',
      ).toMatch(/^ca-pub-\d{16}$/u);
      expect(metadata.adsenseAccount).toBe(expectedAdsenseClientId);
    } else {
      expect(metadata.adsenseAccount).toBe('');
    }

    const manifestUrl = requireAssetUrl(metadata.manifest, 'manifest');
    const iconUrl = requireAssetUrl(metadata.icon, 'favicon');
    const appleIconUrl = requireAssetUrl(metadata.appleIcon, 'apple touch icon');
    expect(new URL(manifestUrl).origin).toBe(new URL(EXPECTED_SITE).origin);
    const assetUrls = [
      expectedOgImage,
      manifestUrl,
      iconUrl,
      appleIconUrl,
      ...metadata.scripts,
      ...metadata.styles,
    ];
    expect(assetUrls.length).toBeGreaterThanOrEqual(6);
    for (const url of assetUrls) {
      expect(new URL(url).origin, url).toBe(new URL(EXPECTED_SITE).origin);
      expect((await request.get(url)).status(), url).toBe(200);
    }

    const sitemapResponse = await request.get(new URL('sitemap.xml', EXPECTED_SITE).href);
    expect(sitemapResponse.status()).toBe(200);
    const sitemapSource = await sitemapResponse.text();
    const sitemapUrls = [...sitemapSource.matchAll(/<loc>([^<]+)<\/loc>/gu)]
      .map((match) => match[1])
      .filter((url): url is string => Boolean(url));
    const expectedSitemapUrls = indexableRoutes.map(
      (route) => new URL(route.path, EXPECTED_SITE).href,
    );
    expect(sitemapUrls).toEqual(expectedSitemapUrls);
    expect(new Set(sitemapUrls).size).toBe(15);
    expect(sitemapUrls.some((url) => url.includes('/play/') || url.includes('#'))).toBe(false);

    const robotsResponse = await request.get(new URL('robots.txt', EXPECTED_SITE).href);
    expect(robotsResponse.status()).toBe(200);
    const robotsSource = await robotsResponse.text();
    expect(robotsSource).toContain(`Sitemap: ${EXPECTED_SITE}sitemap.xml`);
    expect(robotsSource).not.toMatch(/^\s*Disallow:\s*\/play(?:\/|$)/imu);

    const manifestResponse = await request.get(manifestUrl);
    expect(manifestResponse.status()).toBe(200);
    const manifest = (await manifestResponse.json()) as {
      icons?: { src?: string; sizes?: string; purpose?: string }[];
      id?: string;
      scope?: string;
      start_url?: string;
    };
    expect(manifest.id).toBe('/');
    expect(manifest.start_url).toBe('/play/#lobby');
    expect(manifest.scope).toBe('/');
    const manifestIcons = manifest.icons ?? [];
    expect(manifestIcons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ sizes: '192x192', purpose: 'any' }),
        expect.objectContaining({ sizes: '512x512', purpose: 'any' }),
        expect.objectContaining({ sizes: '512x512', purpose: 'maskable' }),
      ]),
    );
    for (const icon of manifestIcons) {
      const manifestIconUrl = new URL(requireAssetUrl(icon.src, 'manifest icon'), manifestUrl).href;
      expect(new URL(manifestIconUrl).origin).toBe(new URL(EXPECTED_SITE).origin);
      expect((await request.get(manifestIconUrl)).status(), manifestIconUrl).toBe(200);
    }

    const cnameResponse = await request.get(new URL('CNAME', EXPECTED_SITE).href);
    expect(cnameResponse.status()).toBe(200);
    expect((await cnameResponse.text()).trim()).toBe(EXPECTED_HOST);
    const adsTxtResponse = await request.get(new URL('ads.txt', EXPECTED_SITE).href, {
      failOnStatusCode: false,
    });
    if (expectedAdsensePublisherId) {
      expect(expectedAdsensePublisherId).toMatch(/^pub-\d{16}$/u);
      expect(adsTxtResponse.status()).toBe(200);
      expect(adsTxtResponse.headers()['content-type']).toContain('text/plain');
      expect((await adsTxtResponse.text()).trim()).toBe(
        `google.com, ${expectedAdsensePublisherId}, DIRECT, f08c47fec0942fa0`,
      );
    } else {
      expect(adsTxtResponse.status()).toBe(404);
    }

    const playResponse = await page.goto(new URL('play/#lobby', EXPECTED_SITE).href, {
      waitUntil: 'load',
    });
    expect(playResponse?.status()).toBe(200);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex,follow');
    await expect(page.locator('meta[name="google-adsense-account"]')).toHaveCount(0);
    await expect(page.locator('[data-adsense-slot]')).toHaveCount(0);
    await expect(page.locator('.adsbygoogle')).toHaveCount(0);
    await expect(
      page.locator(
        'script[src*="googlesyndication"], script[src*="googleadservices"], script[src*="doubleclick.net"], script[src*="/pagead/"]',
      ),
    ).toHaveCount(0);
    await expect(page.locator('#game-grid article.game-card')).toHaveCount(8);
    expectNoRuntimeFailures(signals);
  });

  test('mobile content has no horizontal overflow and Pong still starts', async ({
    baseURL,
    page,
  }) => {
    expectCustomBaseUrl(baseURL);
    const signals = monitorPage(page);

    await page.setViewportSize({ width: 390, height: 844 });
    expect((await page.goto(EXPECTED_SITE, { waitUntil: 'load' }))?.status()).toBe(200);
    await expect(page.locator('article.static-game-card')).toHaveCount(8);
    await expectNoHorizontalOverflow(page, '390x844 home');

    await page.setViewportSize({ width: 844, height: 390 });
    const omokGuideUrl = new URL('games/omok/', EXPECTED_SITE).href;
    expect((await page.goto(omokGuideUrl, { waitUntil: 'load' }))?.status()).toBe(200);
    await expect(page.locator('h1')).toContainText('오목');
    await expectNoHorizontalOverflow(page, '844x390 Omok guide');

    expect(
      (
        await page.goto(new URL('play/#game/pong', EXPECTED_SITE).href, { waitUntil: 'load' })
      )?.status(),
    ).toBe(200);
    await expect(page.locator('#game-host')).toHaveAttribute('aria-busy', 'false');
    await page.locator('#game-start').click();
    const canvas = page.locator('.pong-game canvas');
    await expect(canvas).toBeVisible();
    const bounds = await canvas.boundingBox();
    expect(bounds?.width ?? 0).toBeGreaterThan(200);
    expect(bounds?.height ?? 0).toBeGreaterThan(100);
    expectNoRuntimeFailures(signals);
  });

  test('HTTP apex and HTTPS www permanently redirect once to the canonical host', async ({
    baseURL,
    request,
  }) => {
    test.skip(
      !checkRedirects,
      'set E2E_CHECK_REDIRECTS=true after DNS, TLS, and Pages HTTPS enforcement are ready',
    );
    expectCustomBaseUrl(baseURL);
    const path = 'games/omok/';
    const expectedTarget = new URL(path, EXPECTED_SITE).href;
    await expectPermanentRedirect(request, `http://${EXPECTED_HOST}/${path}`, expectedTarget);
    await expectPermanentRedirect(request, `https://www.${EXPECTED_HOST}/${path}`, expectedTarget);
  });
});
